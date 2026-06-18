"use server"
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth";
import { logActivity } from "@/lib/logger";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

function termLabel(term: number) {
  return term === 2 ? "الترم الثاني" : "الترم الأول";
}

function buildResultMessage(
  exam: { term: number; maxScore: number; passScore: number; date: Date; subject: { name: string; academicYear: { name: string } } },
  studentName: string,
  score: number,
) {
  const pct = exam.maxScore > 0 ? Math.round((score / exam.maxScore) * 100) : 0;
  const passed = score >= exam.passScore;
  return [
    `📊 <b>نتيجة اختبار</b>`,
    ``,
    `👤 ${escapeHtml(studentName)}`,
    `📚 ${escapeHtml(exam.subject.name)} — ${escapeHtml(exam.subject.academicYear.name)}`,
    `🗓️ ${termLabel(exam.term)}`,
    `🎯 الدرجة: <b>${score}</b> من <b>${exam.maxScore}</b> (${pct}%)`,
    `الحالة: <b>${passed ? "✅ ناجح" : "❌ راسب"}</b>`,
  ].join("\n");
}

/**
 * Bulk-save the score for every student in the exam's year. An empty score
 * field removes any existing result for that student.
 */
export async function saveExamResults(formData: FormData) {
  const session = await getStaffSession();
  if (!session) return { error: "غير مصرح" };

  const examId = (formData.get("examId") as string) || "";
  if (!examId) return { error: "اختبار غير معروف" };

  const studentIds = formData.getAll("studentId") as string[];
  const scores = formData.getAll("score") as string[];

  const ops = [];
  for (let i = 0; i < studentIds.length; i++) {
    const studentId = studentIds[i];
    const raw = (scores[i] ?? "").trim();
    if (raw === "") {
      ops.push(
        prisma.examResult.deleteMany({ where: { examId, studentId } })
      );
      continue;
    }
    const score = parseFloat(raw);
    if (!Number.isFinite(score)) continue;
    ops.push(
      prisma.examResult.upsert({
        where: { examId_studentId: { examId, studentId } },
        update: { score },
        create: { examId, studentId, score },
      })
    );
  }

  await prisma.$transaction(ops);
  await logActivity("رصد نتائج اختبار", `تم حفظ نتائج اختبار`);
  revalidatePath(`/exams/${examId}`);
  revalidatePath("/me");
  return { ok: true };
}

/** Send one student's saved result to them on Telegram. */
export async function sendExamResultToStudent(examId: string, studentId: string) {
  const session = await getStaffSession();
  if (!session) return { error: "غير مصرح" };

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { subject: { include: { academicYear: { select: { name: true } } } } },
  });
  if (!exam) return { error: "الاختبار غير موجود" };

  const result = await prisma.examResult.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: { student: { select: { name: true } } },
  });
  if (!result) return { error: "لا توجد نتيجة محفوظة لهذا الطالب. احفظ الدرجة أولاً." };

  const sub = await prisma.telegramSubscription.findUnique({
    where: { userType_refId: { userType: "STUDENT", refId: studentId } },
    select: { chatId: true },
  });
  if (!sub) return { error: "الطالب لم يربط حسابه بـ Telegram." };

  const text = buildResultMessage(exam, result.student.name, result.score);
  const r = await sendTelegramMessage(sub.chatId, text);
  if (!r.ok) return { error: r.description || "فشل الإرسال" };

  await prisma.examResult.update({ where: { id: result.id }, data: { notifiedAt: new Date() } });
  await logActivity("إرسال نتيجة لطالب", `${result.student.name} — ${exam.subject.name}`);
  revalidatePath(`/exams/${examId}`);
  return { ok: true, sent: 1 };
}

/** Send every saved result for this exam to the students on Telegram. */
export async function broadcastExamResults(examId: string) {
  const session = await getStaffSession();
  if (!session) return { error: "غير مصرح" };

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { subject: { include: { academicYear: { select: { name: true } } } } },
  });
  if (!exam) return { error: "الاختبار غير موجود" };

  const results = await prisma.examResult.findMany({
    where: { examId },
    include: { student: { select: { id: true, name: true } } },
  });
  if (results.length === 0) return { error: "لا توجد نتائج محفوظة بعد." };

  const subs = await prisma.telegramSubscription.findMany({
    where: { userType: "STUDENT", refId: { in: results.map((r) => r.student.id) } },
    select: { refId: true, chatId: true },
  });
  const chatByStudent = new Map(subs.map((s) => [s.refId, s.chatId]));

  let sent = 0;
  let skippedNoTelegram = 0;
  let failed = 0;
  const notifiedIds: string[] = [];

  for (const result of results) {
    const chatId = chatByStudent.get(result.student.id);
    if (!chatId) { skippedNoTelegram++; continue; }
    const text = buildResultMessage(exam, result.student.name, result.score);
    const r = await sendTelegramMessage(chatId, text);
    if (r.ok) { sent++; notifiedIds.push(result.id); }
    else failed++;
  }

  if (notifiedIds.length > 0) {
    await prisma.examResult.updateMany({
      where: { id: { in: notifiedIds } },
      data: { notifiedAt: new Date() },
    });
  }

  await logActivity("إرسال نتائج اختبار للطلاب", `${exam.subject.name}: وصل ${sent}، بدون Telegram ${skippedNoTelegram}، فشل ${failed}`);
  revalidatePath(`/exams/${examId}`);
  return { ok: true, sent, skippedNoTelegram, failed };
}
