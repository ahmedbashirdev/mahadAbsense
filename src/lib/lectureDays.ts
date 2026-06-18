import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

const CAIRO_TZ = "Africa/Cairo";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";

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

// ─── Admin (STAFF) Telegram helpers ─────────────────────────────────────────

/** Telegram chat IDs of all ADMINs who linked their account. */
export async function getAdminChatIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return [];
  const subs = await prisma.telegramSubscription.findMany({
    where: { userType: "STAFF", refId: { in: admins.map((u) => u.id) } },
    select: { chatId: true },
  });
  return Array.from(new Set(subs.map((s) => s.chatId)));
}

async function dmAdmins(text: string) {
  const chatIds = await getAdminChatIds();
  let sent = 0, failed = 0;
  for (const id of chatIds) {
    const r = await sendTelegramMessage(id, text);
    if (r.ok) sent++; else failed++;
  }
  return { admins: chatIds.length, sent, failed };
}

/** The calendar date "today" in Cairo, as a UTC-midnight Date. */
export function cairoTodayUtcMidnight(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** The nearest upcoming Friday and the Saturday after it (UTC-midnight). */
export function upcomingFridaySaturday(): { friday: Date; saturday: Date } {
  const today = cairoTodayUtcMidnight();
  const dow = today.getUTCDay(); // 0=Sun ... 5=Fri, 6=Sat
  const daysUntilFriday = (5 - dow + 7) % 7;
  const friday = new Date(today);
  friday.setUTCDate(friday.getUTCDate() + daysUntilFriday);
  const saturday = new Date(friday);
  saturday.setUTCDate(saturday.getUTCDate() + 1);
  return { friday, saturday };
}

/** DM admins a summary of days that were just auto-created. */
export async function notifyAdminsOfAutoCreatedDays(
  created: { label: string }[],
) {
  if (created.length === 0) return { admins: 0, sent: 0, failed: 0 };
  const text = [
    `🗓️ <b>تم إنشاء أيام المحاضرات تلقائيًا</b>`,
    ``,
    ...created.map((d) => `• ${escapeHtml(d.label)}`),
    ``,
    `✅ تم إرسال طلب تأكيد الحضور لكل المحاضرين.`,
    APP_URL ? `${APP_URL}/lecture-days` : "",
  ].filter(Boolean).join("\n");
  return dmAdmins(text);
}

/**
 * Wednesday follow-up for admins:
 *  1) lecturers who still haven't confirmed/declined the coming Fri/Sat, so the
 *     admin can reach out personally.
 *  2) a warning if the coming Fri/Sat schedule isn't built + published to students.
 */
export async function runWednesdayAdminAlerts() {
  const { friday, saturday } = upcomingFridaySaturday();
  const dates = [friday, saturday];

  const days = await prisma.lectureDay.findMany({
    where: { date: { in: dates } },
    include: {
      availabilities: {
        where: { lecturer: { isActive: true, approvalStatus: "APPROVED" } },
        include: { lecturer: { select: { name: true } } },
      },
      lectures: { select: { id: true } },
    },
  });
  const byTime = new Map(days.map((d) => [new Date(d.date).getTime(), d]));

  const pendingLines: string[] = [];
  const notReadyLines: string[] = [];
  for (const date of dates) {
    const label = cairoShort(date);
    const d = byTime.get(date.getTime());
    if (!d) {
      notReadyLines.push(`• <b>${escapeHtml(label)}</b>: لم يتم إنشاء اليوم بعد`);
      continue;
    }
    const pending = d.availabilities.filter((a) => a.status === "PENDING");
    if (pending.length > 0) {
      pendingLines.push(`• <b>${escapeHtml(label)}</b>: ${pending.map((a) => escapeHtml(a.lecturer.name)).join("، ")}`);
    }
    if (d.lectures.length === 0) {
      notReadyLines.push(`• <b>${escapeHtml(label)}</b>: لم تُضف محاضرات للجدول`);
    } else if (!d.isPublished) {
      notReadyLines.push(`• <b>${escapeHtml(label)}</b>: الجدول جاهز لكنه غير منشور للطلاب`);
    }
  }

  const sections: string[] = [];
  if (pendingLines.length > 0) {
    sections.push([`👤 <b>محاضرون لم يؤكدوا بعد</b> — يُفضّل التواصل معهم:`, ...pendingLines].join("\n"));
  }
  if (notReadyLines.length > 0) {
    sections.push([`⚠️ <b>جدول الجمعة/السبت لم يكتمل ويُرسل للطلاب:</b>`, ...notReadyLines].join("\n"));
  }

  if (sections.length === 0) return { ok: true as const, sent: 0, note: "كل شيء جاهز" };

  const text = [
    `🔔 <b>تذكير إداري — تجهيز محاضرات الجمعة والسبت القادمين</b>`,
    ``,
    sections.join("\n\n"),
    APP_URL ? `\n${APP_URL}/lecture-days` : "",
  ].filter(Boolean).join("\n");

  const r = await dmAdmins(text);
  return { ok: true as const, ...r };
}

// ─── Cairo "now" + weekly dispatchers (so we can fold weekly tasks into the
//     existing daily cron jobs and stay within plan cron limits) ─────────────

/** Current weekday (0=Sun..6=Sat) and hour (0-23) in Cairo. */
export function cairoNowParts(): { weekday: number; hour: number } {
  const now = new Date();
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: CAIRO_TZ, weekday: "long" }).format(now);
  const hourStr = new Intl.DateTimeFormat("en-GB", { timeZone: CAIRO_TZ, hour: "2-digit", hour12: false }).format(now);
  const map: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  return { weekday: map[wd] ?? -1, hour: parseInt(hourStr, 10) || 0 };
}

/** Create the upcoming Fri+Sat (idempotent), notify lecturers, and DM admins. */
export async function runWeeklyAutoCreate() {
  const { friday, saturday } = upcomingFridaySaturday();
  const results = [];
  const created: { label: string }[] = [];
  for (const date of [friday, saturday]) {
    const r = await createLectureDayWithNotify(date);
    results.push({ date: date.toISOString().split("T")[0], created: r.created, lecturers: r.lecturers });
    if (r.created && r.day?.label) created.push({ label: r.day.label });
  }
  const adminNotify = await notifyAdminsOfAutoCreatedDays(created);
  return { results, adminNotify };
}

/**
 * Runs the weekly auto-create only when it's Sunday night in Cairo. Designed to
 * be called from the nightly (21:00 UTC) cron: that lands on Sun ~23:00 in
 * winter and Mon ~00:00 in summer, so we accept Sunday OR very-early Monday.
 */
export async function runWeeklyAutoCreateIfDue() {
  const { weekday, hour } = cairoNowParts();
  const due = weekday === 0 || (weekday === 1 && hour < 3);
  if (!due) return { skipped: "not Sunday night in Cairo" as const };
  return runWeeklyAutoCreate();
}
