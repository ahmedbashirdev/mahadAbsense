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

/** Weekday name only (e.g. "الجمعة") — used inside the compact inline buttons. */
function cairoWeekday(date: Date): string {
  return new Date(date).toLocaleDateString("ar-EG", {
    weekday: "long",
    timeZone: CAIRO_TZ,
  });
}

/** Arabic label for an availability status, shown next to each day in the list. */
function availabilityStatusLabel(status: string): string {
  if (status === "CONFIRMED") return "✅ مؤكد";
  if (status === "DECLINED") return "❌ معتذر";
  return "⏳ في انتظار ردك";
}

/** One day inside a combined lecturer message. */
export type LecturerDayItem = {
  availabilityId: string;
  date: Date;
  label: string | null;
  status: string; // PENDING | CONFIRMED | DECLINED
};

/**
 * Builds ONE combined "confirm your availability" message for a lecturer that
 * lists every upcoming day at once, with a row of تأكيد/اعتذار buttons for each
 * day that is still PENDING. This is what prevents the previous "لغبطة" where a
 * lecturer received a separate message per day and only answered the last one.
 *
 * `reminder` switches the wording to a gentle nudge.
 */
export function buildLecturerDaysMessage(
  lecturerName: string,
  days: LecturerDayItem[],
  reminder = false,
): { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | null } {
  // Days are shown newest-last (chronological).
  const sorted = [...days].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const header = reminder
    ? `⏳ <b>تذكير: لسه ماأكدتش حضورك</b>`
    : `🕌 <b>طلب تأكيد حضور</b>`;
  const intro = reminder
    ? `أ. ${escapeHtml(lecturerName)}، فاضل تأكيد أو الاعتذار عن الأيام دي:`
    : `أ. ${escapeHtml(lecturerName)}، يرجى تأكيد حضورك أو الاعتذار عن الأيام دي:`;

  const lines = [header, ``, intro, ``];
  for (const d of sorted) {
    const labelPart = d.label ? ` <i>(${escapeHtml(d.label)})</i>` : "";
    lines.push(`📅 <b>${escapeHtml(cairoShort(d.date))}</b>${labelPart} — ${availabilityStatusLabel(d.status)}`);
  }

  const rows = sorted
    .filter((d) => d.status === "PENDING")
    .map((d) => [
      { text: `✅ تأكيد ${cairoWeekday(d.date)}`, callback_data: `conf:${d.availabilityId}` },
      { text: `❌ اعتذار ${cairoWeekday(d.date)}`, callback_data: `decl:${d.availabilityId}` },
    ]);

  if (rows.length > 0) {
    lines.push(``);
    lines.push(`اضغط زر التأكيد أو الاعتذار قدّام كل يوم 👇`);
  }

  return {
    text: lines.filter(Boolean).join("\n"),
    reply_markup: rows.length > 0 ? { inline_keyboard: rows } : null,
  };
}

/**
 * Core combined sender. Given a set of lecture-day IDs, sends EACH lecturer a
 * single message covering all those days (one row of buttons per day). Safe to
 * call from cron jobs and helpers — no session required.
 *
 *  - reminder:    use the nudge wording.
 *  - onlyPending: skip lecturers who have already answered every day, and (in
 *                 reminder mode) only show the days they still owe a reply on.
 */
export async function notifyLecturersForDays(
  lectureDayIds: string[],
  opts: { reminder?: boolean; onlyPending?: boolean } = {},
) {
  const reminder = !!opts.reminder;
  const onlyPending = opts.onlyPending ?? reminder;

  if (lectureDayIds.length === 0) {
    return { ok: true as const, sent: 0, skippedNoTelegram: 0, skippedConfirmed: 0, failed: 0 };
  }

  const days = await prisma.lectureDay.findMany({
    where: { id: { in: lectureDayIds } },
    orderBy: { date: "asc" },
    include: {
      availabilities: {
        where: { lecturer: { isActive: true, approvalStatus: "APPROVED" } },
        include: { lecturer: { select: { id: true, name: true } } },
      },
    },
  });

  // Group every day's availabilities under their lecturer.
  const byLecturer = new Map<string, { name: string; items: LecturerDayItem[] }>();
  for (const day of days) {
    for (const a of day.availabilities) {
      const entry = byLecturer.get(a.lecturerId) || { name: a.lecturer.name, items: [] };
      entry.items.push({ availabilityId: a.id, date: day.date, label: day.label, status: a.status });
      byLecturer.set(a.lecturerId, entry);
    }
  }

  const lecturerIds = Array.from(byLecturer.keys());
  const subs = await prisma.telegramSubscription.findMany({
    where: { userType: "LECTURER", refId: { in: lecturerIds } },
  });
  const subByLecturer = new Map(subs.map((s) => [s.refId, s.chatId]));

  let sent = 0, skippedNoTelegram = 0, skippedConfirmed = 0, failed = 0;
  for (const [lecturerId, entry] of byLecturer.entries()) {
    const chatId = subByLecturer.get(lecturerId);
    if (!chatId) { skippedNoTelegram++; continue; }

    const pending = entry.items.filter((i) => i.status === "PENDING");
    if (onlyPending && pending.length === 0) { skippedConfirmed++; continue; }

    // Reminders only list the still-pending days; the initial request lists all.
    const shown = reminder ? pending : entry.items;
    if (shown.length === 0) { skippedConfirmed++; continue; }

    const { text, reply_markup } = buildLecturerDaysMessage(entry.name, shown, reminder);
    const r = await sendTelegramMessage(chatId, text, { reply_markup: reply_markup ?? undefined });
    if (!r.ok) failed++; else sent++;
  }

  return { ok: true as const, sent, skippedNoTelegram, skippedConfirmed, failed };
}

/** All lecture days from "today" (Cairo) onward — the set every combined message covers. */
export async function upcomingLectureDayIds(): Promise<string[]> {
  const today = cairoTodayUtcMidnight();
  const days = await prisma.lectureDay.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
    select: { id: true },
  });
  return days.map((d) => d.id);
}

/**
 * Sends each lecturer ONE combined message covering all upcoming days. Used by
 * the auto-create flow and the admin "ابعت طلب تأكيد" button.
 */
export async function notifyLecturersForUpcomingDays(
  opts: { reminder?: boolean; onlyPending?: boolean } = {},
) {
  const ids = await upcomingLectureDayIds();
  return notifyLecturersForDays(ids, opts);
}

/**
 * Rebuilds the combined "upcoming days" view for one lecturer from the current
 * DB state — used by the Telegram webhook to refresh the original message in
 * place after the lecturer answers a single day. Returns null if the lecturer
 * has no upcoming days.
 */
export async function buildLecturerUpcomingView(
  lecturerId: string,
): Promise<{ text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | null } | null> {
  const today = cairoTodayUtcMidnight();
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    select: { name: true },
  });
  if (!lecturer) return null;

  const avails = await prisma.lecturerAvailability.findMany({
    where: { lecturerId, lectureDay: { date: { gte: today } } },
    orderBy: { lectureDay: { date: "asc" } },
    include: { lectureDay: { select: { date: true, label: true } } },
  });
  if (avails.length === 0) return null;

  const items: LecturerDayItem[] = avails.map((a) => ({
    availabilityId: a.id,
    date: a.lectureDay.date,
    label: a.lectureDay.label,
    status: a.status,
  }));
  return buildLecturerDaysMessage(lecturer.name, items, false);
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
    // Notify lecturers with ONE combined message covering all upcoming days
    // (not just this one), so they never get a separate ping per day.
    if (notify) await notifyLecturersForUpcomingDays();
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

  // Chronic non-responders: lecturers who ignored the last 3 consecutive days.
  const stats = await getLecturerResponseStats();
  const chronic = stats.filter((s) => s.ignoring);
  if (chronic.length > 0) {
    sections.push([
      `🔁 <b>محاضرون يتجاهلون الإشعارات باستمرار</b> (لم يردّوا آخر ٣ أيام) — يُفضّل التواصل الشخصي:`,
      ...chronic.map((s) => `• ${escapeHtml(s.name)}${s.rate !== null ? ` — استجابة ${s.rate}%` : ""}`),
    ].join("\n"));
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
  let anyCreated = false;
  // Create both days first WITHOUT notifying per-day, then send ONE combined
  // message covering both, so the lecturer gets a single unified request.
  for (const date of [friday, saturday]) {
    const r = await createLectureDayWithNotify(date, null, false);
    results.push({ date: date.toISOString().split("T")[0], created: r.created, lecturers: r.lecturers });
    if (r.created) {
      anyCreated = true;
      if (r.day?.label) created.push({ label: r.day.label });
    }
  }
  if (anyCreated) {
    await notifyLecturersForUpcomingDays();
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

// ─── Lecturer response tracking ─────────────────────────────────────────────

export type LecturerResponseStat = {
  id: string;
  name: string;
  asked: number;        // past lecture days the lecturer was asked about
  responded: number;    // of those, how many they confirmed/declined
  rate: number | null;  // response % (null when never asked)
  recent: string[];     // last few statuses (newest first): CONFIRMED/DECLINED/PENDING
  ignoring: boolean;    // stayed PENDING for the last 3 consecutive past days
};

/**
 * Per-lecturer Telegram response stats based on availability rows for lecture
 * days that have already arrived (date <= today). "ignoring" = the lecturer
 * never responded (still PENDING) for the last 3 consecutive such days.
 */
export async function getLecturerResponseStats(): Promise<LecturerResponseStat[]> {
  const today = cairoTodayUtcMidnight();
  const lecturers = await prisma.lecturer.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      availabilities: {
        where: { lectureDay: { date: { lte: today } } },
        orderBy: { lectureDay: { date: "desc" } },
        select: { status: true },
      },
    },
  });

  return lecturers.map((l) => {
    const asked = l.availabilities.length;
    const responded = l.availabilities.filter((a) => a.status !== "PENDING").length;
    const rate = asked ? Math.round((responded / asked) * 100) : null;
    const last3 = l.availabilities.slice(0, 3);
    const ignoring = last3.length >= 3 && last3.every((a) => a.status === "PENDING");
    return {
      id: l.id,
      name: l.name,
      asked,
      responded,
      rate,
      recent: l.availabilities.slice(0, 5).map((a) => a.status),
      ignoring,
    };
  });
}
