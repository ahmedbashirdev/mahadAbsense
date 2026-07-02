"use server"
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { broadcastTelegramMessage, getTelegramDeepLink, escapeHtml } from "@/lib/telegram";
import { formatTime12 } from "@/lib/time";
import { logActivity } from "@/lib/logger";
import { notifyLecturersForUpcomingDays, notifyLecturersForDays, cairoTodayUtcMidnight } from "@/lib/lectureDays";

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
export async function notifyLecturersToConfirm(_lectureDayId: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  // Send each lecturer ONE combined message covering all upcoming days, instead
  // of a separate message per day.
  const r = await notifyLecturersForUpcomingDays();
  if (r.ok) {
    await logActivity(
      "إرسال طلب تأكيد محاضرين",
      `تم إرسال ${r.sent}، ردّوا بالفعل ${r.skippedConfirmed}، بدون Telegram ${r.skippedNoTelegram}، فشل ${r.failed}`
    );
  }
  return r;
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
  if (!day) return { ok: false, error: "اليوم غير موجود" };
  if (!day.isPublished) return { ok: false, error: "الجدول لم يُنشر بعد. اضغط زرار النشر أولاً." };
  if (day.lectures.length === 0) return { ok: false, error: "لا يوجد محاضرات في هذا اليوم" };

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
  let totalStudents = 0;
  let totalSubscribed = 0;

  for (const [yearId, lectures] of lecturesByYear.entries()) {
    // All students in this year who have a Telegram subscription
    const students = await prisma.student.findMany({
      where: { yearId, isActive: true },
      select: { id: true },
    });
    totalStudents += students.length;
    if (students.length === 0) continue;

    const subs = await prisma.telegramSubscription.findMany({
      where: { userType: "STUDENT", refId: { in: students.map((s) => s.id) } },
      select: { chatId: true },
    });
    totalSubscribed += subs.length;
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
      const lecName = l.lecturer ? l.lecturer.name : (l.lecturerName || "");
      const lec = lecName ? ` • ${escapeHtml(lecName)}` : "";
      lines.push(`${l.order}. <b>${escapeHtml(l.subject.name)}</b>${lec}`);
      lines.push(`   🕒 <code>${formatTime12(l.startTime)}</code> – <code>${formatTime12(l.endTime)}</code>`);
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

  // If we did nothing useful, return a more explicit error so the admin
  // can see exactly why.
  if (sent === 0 && totalStudents === 0) {
    return { ok: false, error: "لا يوجد طلاب نشطين في السنوات اللي فيها محاضرات اليوم" };
  }
  if (sent === 0 && totalSubscribed === 0) {
    return {
      ok: false,
      error: `وصلنا لـ ${totalStudents} طالب لكن مفيش حد منهم ربط حسابه بـ Telegram. لازم الطلاب يدخلوا /me ويضغطوا "اربط Telegram" قبل ما يستقبلوا الجدول.`,
      sent: 0,
      skipped: totalStudents,
      failed: 0,
    };
  }

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
      `🕒 <code>${formatTime12(l.startTime)}</code> – <code>${formatTime12(l.endTime)}</code>`,
      (l.lecturer || l.lecturerName) ? `👨‍🏫 ${escapeHtml(l.lecturer ? l.lecturer.name : l.lecturerName!)}` : "",
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
  const todayUtc = cairoTodayUtcMidnight();
  const inSevenDays = new Date(todayUtc);
  inSevenDays.setUTCDate(inSevenDays.getUTCDate() + 7);

  // All days in the coming week, regardless of whether the lecturer answered;
  // notifyLecturersForDays will, per-lecturer, show only the still-pending ones
  // in a single combined reminder message.
  const days = await prisma.lectureDay.findMany({
    where: { date: { gte: todayUtc, lte: inSevenDays } },
    select: { id: true },
  });
  if (days.length === 0) return { ok: true, sent: 0 };

  return notifyLecturersForDays(days.map((d) => d.id), { reminder: true, onlyPending: true });
}

/**
 * Notify all ADMINs (via Telegram) when a lecturer responds to a lecture day.
 * If ALL approved lecturers for that day have declined, escalate to a louder
 * alert suggesting that the admin cancel/reschedule.
 */
export async function notifyAdminsOfLecturerResponse(availabilityId: string) {
  const availability = await prisma.lecturerAvailability.findUnique({
    where: { id: availabilityId },
    include: {
      lecturer: { select: { name: true } },
      lectureDay: {
        select: {
          id: true,
          date: true,
          label: true,
          availabilities: {
            include: {
              lecturer: {
                select: { id: true, name: true, isActive: true, approvalStatus: true },
              },
            },
          },
        },
      },
    },
  });
  if (!availability) return { ok: false, error: "not found" };

  const day = availability.lectureDay;

  // Only consider responses from active + approved lecturers (otherwise we
  // wouldn't have asked them in the first place).
  const eligible = day.availabilities.filter(
    (a) => a.lecturer.isActive && a.lecturer.approvalStatus === "APPROVED"
  );
  const confirmed = eligible.filter((a) => a.status === "CONFIRMED").length;
  const declined = eligible.filter((a) => a.status === "DECLINED").length;
  const pending = eligible.filter((a) => a.status === "PENDING").length;
  const allDeclined = eligible.length > 0 && declined === eligible.length;
  const allResponded = eligible.length > 0 && pending === 0;

  // Resolve admin Telegram chat IDs.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const subs = await prisma.telegramSubscription.findMany({
    where: { userType: "STAFF", refId: { in: admins.map((u) => u.id) } },
    select: { chatId: true },
  });
  if (subs.length === 0) return { ok: true, sent: 0, note: "no admin telegram subscriptions" };

  const dateLabel = formatArabicDate(day.date);
  const dayLink = APP_URL ? `\n${APP_URL}/lecture-days/${day.id}` : "";
  const reasonLine = availability.reason ? `\n📝 السبب: ${escapeHtml(availability.reason)}` : "";
  const lecturerStatusText = availability.status === "CONFIRMED" ? "✅ أُكد الحضور" : "❌ اعتذر عن الحضور";

  // When the lecturer confirmed, show the subjects they chose (with academic
  // year next to each) so the admin knows exactly what will be taught.
  let subjectsLine = "";
  if (availability.status === "CONFIRMED") {
    let plannedIds: string[] = [];
    try {
      plannedIds = JSON.parse(availability.plannedSubjectIds || "[]");
    } catch {
      plannedIds = [];
    }
    if (plannedIds.length > 0) {
      const subjects = await prisma.subject.findMany({
        where: { id: { in: plannedIds } },
        select: { name: true, academicYear: { select: { name: true } } },
      });
      if (subjects.length > 0) {
        subjectsLine =
          `📚 المواد المختارة:\n` +
          subjects
            .map((s) => `   • ${escapeHtml(s.name)} — ${escapeHtml(s.academicYear.name)}`)
            .join("\n");
      }
    }
  }

  let text: string;
  if (allDeclined) {
    // 🚨 Worst case: every single lecturer declined
    text = [
      `🚨 <b>تنبيه: كل المحاضرين اعتذروا عن اليوم!</b>`,
      ``,
      `يوم: <b>${escapeHtml(dateLabel)}</b>`,
      day.label ? `(${escapeHtml(day.label)})` : "",
      ``,
      `إجمالي المحاضرين: ${eligible.length}`,
      `جميعهم اعتذروا. يُنصح بإلغاء اليوم أو إعادة الجدولة.${dayLink}`,
    ].filter(Boolean).join("\n");
  } else if (allResponded) {
    // ✅ All responses are in — prompt admin to build and publish the schedule
    text = [
      `✅ <b>كل المحاضرين ردّوا — الجدول جاهز للإعداد!</b>`,
      ``,
      `📅 يوم: <b>${escapeHtml(dateLabel)}</b>`,
      day.label ? `(${escapeHtml(day.label)})` : "",
      ``,
      `آخر رد — 👨‍🏫 ${escapeHtml(availability.lecturer.name)}: <b>${lecturerStatusText}</b>`,
      subjectsLine,
      ``,
      `الحالة النهائية:`,
      `   ✓ ${confirmed} مؤكد · ✗ ${declined} معتذر`,
      ``,
      `يمكنك الآن رتّب جدول المحاضرات، ثم انشره وابعته للطلاب.${dayLink}`,
    ].filter(Boolean).join("\n");
  } else {
    // Regular per-response update
    text = [
      `ℹ️ <b>تحديث حالة محاضر</b>`,
      ``,
      `👨‍🏫 المحاضر: ${escapeHtml(availability.lecturer.name)}`,
      `📅 اليوم: <b>${escapeHtml(dateLabel)}</b>`,
      day.label ? `(${escapeHtml(day.label)})` : "",
      `الرد: <b>${lecturerStatusText}</b>`,
      availability.status === "DECLINED" ? reasonLine : "",
      subjectsLine,
      ``,
      `الحالة الإجمالية لليوم:`,
      `   ✓ ${confirmed} مؤكد · ✗ ${declined} معتذر · ⏳ ${pending} لم يرد${dayLink}`,
    ].filter(Boolean).join("\n");
  }

  const r = await broadcastTelegramMessage(subs.map((s) => s.chatId), text);
  return { ok: true, sent: r.sent, failed: r.failed, allDeclined, allResponded };
}

/** Helper for the Telegram deep-link button (used by client components). */
export async function getBotDeepLinkInfo() {
  const link = getTelegramDeepLink("___");
  return { configured: !!link };
}

/**
 * Sends end-of-day reminders to lecturers to write their syllabus progress
 * for today's lectures. Called from a cron job.
 */
export async function sendEndOfDayLecturerSyllabusReminder() {
  const now = new Date();
  const todayUtc = new Date(now);
  todayUtc.setUTCHours(0, 0, 0, 0);

  // Find today's published lecture day
  const day = await prisma.lectureDay.findFirst({
    where: { date: todayUtc, isPublished: true },
    include: {
      lectures: {
        where: { lecturerId: { not: null } },
        include: {
          subject: true,
          lecturer: true,
        },
      },
    },
  });

  if (!day || day.lectures.length === 0) return { ok: true, sent: 0, note: "no lectures today" };

  // Group lectures by lecturer
  const lecturesByLecturer = new Map<string, typeof day.lectures>();
  for (const l of day.lectures) {
    if (!l.lecturerId) continue;
    const list = lecturesByLecturer.get(l.lecturerId) || [];
    list.push(l);
    lecturesByLecturer.set(l.lecturerId, list);
  }

  // Get Telegram subscriptions for these lecturers
  const subs = await prisma.telegramSubscription.findMany({
    where: {
      userType: "LECTURER",
      refId: { in: Array.from(lecturesByLecturer.keys()) },
    },
  });
  const subByLecturer = new Map(subs.map((s) => [s.refId, s.chatId]));

  let sent = 0;
  let failed = 0;

  for (const [lecturerId, lectures] of lecturesByLecturer.entries()) {
    const chatId = subByLecturer.get(lecturerId);
    if (!chatId) continue;

    // Build message
    const lecturerName = lectures[0].lecturer!.name;
    const dateLabel = formatArabicDate(day.date);

    let text = [
      `📝 <b>تذكير: تسجيل ما تم إنجازه في المنهج</b>`,
      ``,
      `أ. ${escapeHtml(lecturerName)}، شكرًا لجهودك اليوم (<b>${escapeHtml(dateLabel)}</b>).`,
      `يرجى التكرم بتسجيل ما تم تغطيته في المنهج للطلاب في محاضرات اليوم:`,
      ``,
    ].join("\n");

    for (const l of lectures) {
      const link = APP_URL ? `${APP_URL}/me-lecturer/lectures/${l.id}` : "";
      text += `\n📚 <b>${escapeHtml(l.subject.name)}</b>`;
      text += `\nاضغط هنا للتسجيل: ${link}\n`;
    }

    const r = await broadcastTelegramMessage([chatId], text);
    if (r.failed > 0) failed++;
    else sent++;
  }

  return { ok: true, sent, failed };
}

