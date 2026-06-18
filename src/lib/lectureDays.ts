import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

const CAIRO_TZ = "Africa/Cairo";

/** Format a date in Cairo time, e.g. "الجمعة ١٥ مايو ٢٠٢٦". */
function cairoLong(date: Date): string {
  return new Date(date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: CAIRO_TZ,
  });
}

/** Shorter Cairo label without the year, used inside messages. */
function cairoShort(date: Date): string {
  return new Date(date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: CAIRO_TZ,
  });
}

/** Auto-generated day label, e.g. "محاضرات الجمعة ١٥ مايو ٢٠٢٦". */
export function autoLectureDayLabel(date: Date): string {
  return `محاضرات ${cairoLong(date)}`;
}

function confirmKeyboard(availabilityId: string) {
  return {
    inline_keyboard: [[
      { text: "✅ تأكيد الحضور", callback_data: `conf:${availabilityId}` },
      { text: "❌ اعتذار", callback_data: `decl:${availabilityId}` },
    ]],
  };
}

/**
 * Core "please confirm your availability" sender — no session required, so it
 * is safe to call from cron jobs and from the day-creation helper. The staff
 * server action wraps this with an auth check.
 */
export async function notifyLecturersToConfirmForDay(lectureDayId: string) {
  const day = await prisma.lectureDay.findUnique({
    where: { id: lectureDayId },
    include: {
      availabilities: {
        where: { lecturer: { isActive: true, approvalStatus: "APPROVED" } },
        include: { lecturer: { select: { id: true, name: true } } },
      },
    },
  });
  if (!day) return { ok: false as const, error: "Lecture day not found" };

  const dateLabel = cairoShort(day.date);
  const subs = await prisma.telegramSubscription.findMany({
    where: { userType: "LECTURER", refId: { in: day.availabilities.map((a) => a.lecturerId) } },
  });
  const subByLecturer = new Map(subs.map((s) => [s.refId, s.chatId]));

  let sent = 0, skippedNoTelegram = 0, skippedConfirmed = 0, failed = 0;
  for (const a of day.availabilities) {
    const chatId = subByLecturer.get(a.lecturerId);
    if (!chatId) { skippedNoTelegram++; continue; }
    if (a.status === "CONFIRMED" || a.status === "DECLINED") { skippedConfirmed++; continue; }

    const text = [
      `🕌 <b>طلب تأكيد حضور</b>`,
      ``,
      `أ. ${escapeHtml(a.lecturer.name)}،`,
      `يرجى تأكيد حضورك يوم <b>${escapeHtml(dateLabel)}</b>${day.label ? ` (${escapeHtml(day.label)})` : ""}.`,
    ].join("\n");

    const r = await sendTelegramMessage(chatId, text, { reply_markup: confirmKeyboard(a.id) });
    if (!r.ok) failed++; else sent++;
  }

  return { ok: true as const, sent, skippedNoTelegram, skippedConfirmed, failed };
}

/** Notify lecturers that a day they were asked about has been cancelled. */
export async function notifyLecturersOfCancelledDay(lectureDayId: string) {
  const day = await prisma.lectureDay.findUnique({
    where: { id: lectureDayId },
    include: {
      availabilities: {
        where: { lecturer: { isActive: true, approvalStatus: "APPROVED" } },
        select: { lecturerId: true },
      },
    },
  });
  if (!day) return { ok: false as const, error: "Lecture day not found" };

  const dateLabel = cairoShort(day.date);
  const subs = await prisma.telegramSubscription.findMany({
    where: { userType: "LECTURER", refId: { in: day.availabilities.map((a) => a.lecturerId) } },
  });

  let sent = 0, failed = 0;
  const text = [
    `⚠️ <b>تم إلغاء يوم محاضرات</b>`,
    ``,
    `نعتذر، تم إلغاء يوم <b>${escapeHtml(dateLabel)}</b>${day.label ? ` (${escapeHtml(day.label)})` : ""}.`,
    `لا حاجة لتأكيد الحضور لهذا اليوم.`,
  ].join("\n");

  for (const s of subs) {
    const r = await sendTelegramMessage(s.chatId, text);
    if (r.ok) sent++; else failed++;
  }
  return { ok: true as const, sent, failed };
}

/**
 * Create a lecture day with PENDING availabilities for every approved + active
 * lecturer, then (optionally) DM them all the confirm request. Idempotent on
 * the unique `date`: if the day already exists it is returned without
 * re-notifying.
 */
export async function createLectureDayWithNotify(
  date: Date,
  label?: string | null,
  notify = true,
) {
  const day0 = new Date(date);
  day0.setUTCHours(0, 0, 0, 0);
  const finalLabel = (label && label.trim()) || autoLectureDayLabel(day0);

  const lecturers = await prisma.lecturer.findMany({
    where: { approvalStatus: "APPROVED", isActive: true },
    select: { id: true },
  });

  try {
    const day = await prisma.lectureDay.create({
      data: {
        date: day0,
        label: finalLabel,
        availabilities: { create: lecturers.map((l) => ({ lecturerId: l.id, status: "PENDING" })) },
      },
    });
    if (notify) await notifyLecturersToConfirmForDay(day.id);
    return { created: true as const, day, lecturers: lecturers.length };
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      const existing = await prisma.lectureDay.findUnique({ where: { date: day0 } });
      return { created: false as const, day: existing, lecturers: 0 };
    }
    throw e;
  }
}
