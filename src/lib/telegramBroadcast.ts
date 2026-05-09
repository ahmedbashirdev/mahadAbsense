"use server"
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { broadcastTelegramMessage, getTelegramDeepLink, escapeHtml } from "@/lib/telegram";
import { logActivity } from "@/lib/logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";

function formatArabicDate(d: Date | string): string {
  const date = new Date(d);
  return date.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Sends a "please confirm your availability" DM to every approved + active
 * lecturer for the given lectureDay. Lecturers without a Telegram subscription
 * are silently skipped — they can still respond from the website.
 */
export async function notifyLecturersToConfirm(lectureDayId: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const day = await prisma.lectureDay.findUnique({
    where: { id: lectureDayId },
    include: {
      availabilities: {
        where: { lecturer: { isActive: true, approvalStatus: "APPROVED" } },
        include: { lecturer: { select: { id: true, name: true } } },
      },
    },
  });
  if (!day) return { ok: false, error: "Lecture day not found" };

  const dateLabel = formatArabicDate(day.date);
  const subs = await prisma.telegramSubscription.findMany({
    where: {
      userType: "LECTURER",
      refId: { in: day.availabilities.map((a) => a.lecturerId) },
    },
  });
  const subByLecturer = new Map(subs.map((s) => [s.refId, s.chatId]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const a of day.availabilities) {
    const chatId = subByLecturer.get(a.lecturerId);
    if (!chatId) { skipped++; continue; }
    if (a.status === "CONFIRMED") { skipped++; continue; }

    const link = APP_URL ? `${APP_URL}/me-lecturer` : "";
    const text = [
      `🕌 <b>طلب تأكيد حضور</b>`,
      ``,
      `أ. ${escapeHtml(a.lecturer.name)}،`,
      `يرجى تأكيد حضورك يوم <b>${escapeHtml(dateLabel)}</b>${day.label ? ` (${escapeHtml(day.label)})` : ""}.`,
      ``,
      link ? `أكد من حسابك: ${link}` : `أكد من حسابك في الموقع.`,
    ].join("\n");

    const r = await broadcastTelegramMessage([chatId], text);
    if (r.failed > 0) failed++;
    else sent++;
  }

  await logActivity(
    "إرسال طلب تأكيد محاضرين",
    `يوم ${dateLabel}: تم إرسال ${sent}، تم تخطي ${skipped}، فشل ${failed}`
  );

  return { ok: true, sent, skipped, failed };
}

/**
 * Sends the published schedule for a lecture day to every student in any year
 * that has at least one lecture on that day.
 */
export async function notifyStudentsOfSchedule(lectureDayId: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const day = await prisma.lectureDay.findUnique({
    where: { id: lectureDayId },
    include: {
      lectures: {
        include: {
          subject: { include: { academicYear: { select: { id: true, name: true } } } },
          lecturer: { select: { name: true } },
        },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!day) return { ok: false, error: "Lecture day not found" };
  if (!day.isPublished) return { ok: false, error: "Schedule not published yet" };
  if (day.lectures.length === 0) return { ok: false, error: "No lectures scheduled" };

  // Group lectures by year so each student only sees their own year's lectures.
  const lecturesByYear = new Map<string, typeof day.lectures>();
  for (const l of day.lectures) {
    const ys = lecturesByYear.get(l.subject.academicYear.id) || [];
    ys.push(l);
    lecturesByYear.set(l.subject.academicYear.id, ys);
  }

  const dateLabel = formatArabicDate(day.date);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const [yearId, lectures] of lecturesByYear.entries()) {
    // All students in this year who have a Telegram subscription
    const students = await prisma.student.findMany({
      where: { yearId, isActive: true },
      select: { id: true },
    });
    if (students.length === 0) continue;

    const subs = await prisma.telegramSubscription.findMany({
      where: { userType: "STUDENT", refId: { in: students.map((s) => s.id) } },
      select: { chatId: true },
    });
    if (subs.length === 0) {
      skipped += students.length;
      continue;
    }

    const yearName = lectures[0].subject.academicYear.name;
    const lines = [
      `📅 <b>جدول ${escapeHtml(yearName)} — ${escapeHtml(dateLabel)}</b>`,
      day.label ? `<i>${escapeHtml(day.label)}</i>` : "",
      "",
    ];
    for (const l of lectures) {
      const lec = l.lecturer ? ` • ${escapeHtml(l.lecturer.name)}` : "";
      lines.push(`${l.order}. <b>${escapeHtml(l.subject.name)}</b>${lec}`);
      lines.push(`   🕒 <code>${l.startTime}</code> – <code>${l.endTime}</code>`);
    }
    const text = lines.filter(Boolean).join("\n");

    const r = await broadcastTelegramMessage(subs.map((s) => s.chatId), text);
    sent += r.sent;
    failed += r.failed;
    skipped += students.length - subs.length;
  }

  await logActivity(
    "إرسال جدول للطلاب",
    `يوم ${dateLabel}: ${sent} طالب وصل، ${skipped} مش مربوطين بـ Telegram، ${failed} فشل`
  );

  return { ok: true, sent, skipped, failed };
}

/**
 * Sends "1 hour until lecture" reminders. Called from a cron job.
 */
export async function sendHourlyStudentReminders() {
  const now = new Date();
  const todayUtc = new Date(now);
  todayUtc.setUTCHours(0, 0, 0, 0);

  // Look at today's published days only
  const day = await prisma.lectureDay.findFirst({
    where: { isPublished: true, date: todayUtc },
    include: {
      lectures: {
        include: {
          subject: { include: { academicYear: { select: { id: true, name: true } } } },
          lecturer: { select: { name: true } },
        },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!day) return { ok: true, sent: 0, note: "no day today" };

  // Local current time in HH:MM (server's timezone — Egypt is UTC+2/+3)
  const targetHour = (now.getHours() + (Math.ceil(now.getMinutes() / 60))).toString().padStart(2, "0");
  const targetMin = "00";
  const targetHHMM = `${targetHour}:${targetMin}`; // e.g. lecture starts at 14:00 -> remind at 13:00

  // Find lectures whose startTime ~= now + 1h (within a 30-min window)
  const upcoming = day.lectures.filter((l) => {
    const [h, m] = l.startTime.split(":").map((n) => parseInt(n, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
    const lectureMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const diff = lectureMin - nowMin;
    return diff > 30 && diff <= 90; // 30-90 minutes ahead
  });
  if (upcoming.length === 0) return { ok: true, sent: 0, note: "no lectures within window" };

  let sent = 0;
  let failed = 0;
  for (const l of upcoming) {
    const yearId = l.subject.academicYear.id;
    const subs = await prisma.telegramSubscription.findMany({
      where: {
        userType: "STUDENT",
        refId: { in: (await prisma.student.findMany({
          where: { yearId, isActive: true },
          select: { id: true },
        })).map((s) => s.id) },
      },
      select: { chatId: true },
    });
    const text = [
      `⏰ <b>تذكير: محاضرة بعد ساعة</b>`,
      ``,
      `📚 ${escapeHtml(l.subject.name)} — ${escapeHtml(l.subject.academicYear.name)}`,
      `🕒 <code>${l.startTime}</code> – <code>${l.endTime}</code>`,
      l.lecturer ? `👨‍🏫 ${escapeHtml(l.lecturer.name)}` : "",
    ].filter(Boolean).join("\n");

    const r = await broadcastTelegramMessage(subs.map((s) => s.chatId), text);
    sent += r.sent;
    failed += r.failed;
  }
  // Avoid unused warning
  void targetHHMM;

  return { ok: true, sent, failed };
}

/**
 * Sends "tomorrow's schedule" reminders to students. Called from a cron job
 * each evening.
 */
export async function sendDailyStudentReminders() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const day = await prisma.lectureDay.findFirst({
    where: { isPublished: true, date: tomorrow },
  });
  if (!day) return { ok: true, sent: 0, note: "no day tomorrow" };

  return notifyStudentsOfSchedule(day.id);
}

/**
 * Sends reminders to lecturers who haven't responded yet for upcoming days.
 * Called from a cron job each morning.
 */
export async function sendLecturerReminders() {
  const now = new Date();
  const todayUtc = new Date(now);
  todayUtc.setUTCHours(0, 0, 0, 0);
  const inSevenDays = new Date(todayUtc);
  inSevenDays.setUTCDate(inSevenDays.getUTCDate() + 7);

  const days = await prisma.lectureDay.findMany({
    where: { date: { gte: todayUtc, lte: inSevenDays } },
    include: {
      availabilities: {
        where: {
          status: "PENDING",
          lecturer: { isActive: true, approvalStatus: "APPROVED" },
        },
        include: { lecturer: { select: { id: true, name: true } } },
      },
    },
  });
  if (days.length === 0) return { ok: true, sent: 0 };

  let sent = 0;
  let failed = 0;
  for (const d of days) {
    if (d.availabilities.length === 0) continue;
    const subs = await prisma.telegramSubscription.findMany({
      where: {
        userType: "LECTURER",
        refId: { in: d.availabilities.map((a) => a.lecturerId) },
      },
    });
    const subByLecturer = new Map(subs.map((s) => [s.refId, s.chatId]));
    const dateLabel = formatArabicDate(d.date);

    for (const a of d.availabilities) {
      const chatId = subByLecturer.get(a.lecturerId);
      if (!chatId) continue;
      const link = APP_URL ? `${APP_URL}/me-lecturer` : "";
      const text = [
        `⏳ <b>تذكير: لم تؤكد حضورك بعد</b>`,
        ``,
        `أ. ${escapeHtml(a.lecturer.name)}، يرجى تأكيد أو الاعتذار عن يوم <b>${escapeHtml(dateLabel)}</b>.`,
        link ? `\n${link}` : "",
      ].join("\n");
      const r = await broadcastTelegramMessage([chatId], text);
      if (r.failed > 0) failed++;
      else sent++;
    }
  }

  return { ok: true, sent, failed };
}

/** Helper for the Telegram deep-link button (used by client components). */
export async function getBotDeepLinkInfo() {
  const link = getTelegramDeepLink("___");
  return { configured: !!link };
}
