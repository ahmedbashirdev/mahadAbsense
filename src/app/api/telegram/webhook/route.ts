import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
} from "@/lib/telegram";
import { notifyAdminsOfLecturerResponse } from "@/lib/telegramBroadcast";
import { buildLecturerUpcomingView } from "@/lib/lectureDays";
import { ensurePersonTelegramShared } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type Update = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

// ─── /start handler ──────────────────────────────────────────────────────────

async function handleStartCommand(message: TelegramMessage, code: string) {
  const chatId = message.chat.id;
  const fromUsername = message.from?.username || message.chat.username || null;
  const firstName = message.from?.first_name || message.chat.first_name || null;
  const lastName = message.from?.last_name || message.chat.last_name || null;

  if (!code) {
    await sendTelegramMessage(
      chatId,
      "أهلاً! 👋\nعشان تربط حسابك، ارجع لموقع المعهد واضغط زرار <b>اربط Telegram</b> من صفحة حسابك.",
    );
    return;
  }

  const link = await prisma.telegramLinkCode.findUnique({ where: { code } });
  if (!link) {
    await sendTelegramMessage(chatId, "❌ الرمز غير صالح. ارجع للموقع وحاول مرة تانية.");
    return;
  }
  if (link.usedAt) {
    await sendTelegramMessage(chatId, "ℹ️ الرمز ده اتستخدم قبل كده. لو لسه عاوز تربط حسابك ارجع للموقع واطلب رمز جديد.");
    return;
  }
  if (link.expiresAt < new Date()) {
    await sendTelegramMessage(chatId, "⌛ الرمز انتهت صلاحيته. ارجع للموقع واطلب رمز جديد.");
    return;
  }

  let displayName = "المستخدم";
  if (link.userType === "STUDENT") {
    const s = await prisma.student.findUnique({ where: { id: link.refId }, select: { name: true } });
    if (s) displayName = s.name;
  } else if (link.userType === "LECTURER") {
    const l = await prisma.lecturer.findUnique({ where: { id: link.refId }, select: { name: true } });
    if (l) displayName = l.name;
  } else if (link.userType === "STAFF") {
    const u = await prisma.user.findUnique({ where: { id: link.refId }, select: { name: true } });
    if (u) displayName = u.name;
  }

  try {
    await prisma.$transaction([
      prisma.telegramSubscription.upsert({
        where: { userType_refId: { userType: link.userType, refId: link.refId } },
        update: { chatId: String(chatId), username: fromUsername, firstName, lastName },
        create: { userType: link.userType, refId: link.refId, chatId: String(chatId), username: fromUsername, firstName, lastName },
      }),
      prisma.telegramLinkCode.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
    ]);
  } catch (e) {
    console.error("Failed to bind Telegram chat:", e);
    await sendTelegramMessage(chatId, "❌ حصل خطأ مؤقت. حاول مرة تانية.");
    return;
  }

  // If this account is linked to other accounts of the same person, share this
  // Telegram chat with them too (best-effort).
  try {
    await ensurePersonTelegramShared({
      userType: link.userType as "STUDENT" | "LECTURER" | "STAFF",
      refId: link.refId,
    });
  } catch (e) {
    console.error("Failed to propagate Telegram to linked accounts:", e);
  }

  await sendTelegramMessage(
    chatId,
    `✅ تم ربط حسابك بنجاح!\n\nأهلاً <b>${escapeHtml(displayName)}</b> 👋\nهتوصلك الإشعارات هنا (تذكيرات المحاضرات، طلبات تأكيد الحضور، إلخ).`,
  );
}

// ─── Inline-keyboard callback helpers ────────────────────────────────────────

/**
 * Build the subject-selection message text + inline keyboard for a session.
 */
function buildSubjectSelectionMessage(
  subjects: Array<{ id: string; name: string; academicYear?: { name: string } | null }>,
  selectedIds: string[],
  dateLabel: string,
) {
  const selectedSet = new Set(selectedIds);
  const lines = [
    `📚 <b>اختر المواد اللي هتشرحها يوم ${escapeHtml(dateLabel)}:</b>`,
    ``,
    selectedIds.length === 0
      ? `<i>(لم تختر أي مادة بعد)</i>`
      : `المختارة: ${selectedIds.length} من ${subjects.length}`,
  ];
  return lines.join("\n");
}

function buildSubjectKeyboard(
  subjects: Array<{ id: string; name: string; academicYear?: { name: string } | null }>,
  selectedIds: string[],
  sessId: string,
) {
  const selectedSet = new Set(selectedIds);
  const rows = subjects.map((s) => [
    {
      text: `${selectedSet.has(s.id) ? "☑" : "☐"} ${s.name}${s.academicYear ? ` — ${s.academicYear.name}` : ""}`,
      callback_data: `stog:${sessId}:${s.id}`,
    },
  ]);
  rows.push([{ text: "✅ تأكيد الاختيار", callback_data: `done:${sessId}` }]);
  return { inline_keyboard: rows };
}

/**
 * Refresh the ORIGINAL combined "upcoming days" message in place so the day the
 * lecturer just answered shows its new status (and loses its buttons) while the
 * other days stay actionable. Best-effort — failures are ignored.
 */
async function refreshCombinedMessage(
  chatId: number,
  messageId: number | undefined,
  lecturerId: string,
) {
  if (!messageId) return;
  const view = await buildLecturerUpcomingView(lecturerId);
  if (!view) return;
  await editMessageText(chatId, messageId, view.text, {
    reply_markup: (view.reply_markup ?? null) as unknown as undefined,
  });
}

/**
 * Lecturer pressed "✅ تأكيد الحضور" for a single day inside the combined
 * message. The day is confirmed immediately; the original message is refreshed
 * (so the other days stay actionable) and a fresh confirmation message is sent
 * at the bottom of the chat so the lecturer actually notices their reply was
 * recorded. If the lecturer has linked subjects, an optional subject picker is
 * sent as a SEPARATE message so the combined day list stays intact.
 */
async function handleConfirmAttendance(
  chatId: number,
  messageId: number | undefined,
  cqId: string,
  avId: string,
) {
  // Load availability + subjects for this lecturer
  const av = await prisma.lecturerAvailability.findUnique({
    where: { id: avId },
    include: {
      lecturer: { include: { subjects: { select: { id: true, name: true, academicYear: { select: { name: true } } } } } },
      lectureDay: { select: { date: true, label: true } },
    },
  });

  if (!av) {
    await answerCallbackQuery(cqId, "❌ لم يُعثر على الطلب.");
    return;
  }
  if (av.status !== "PENDING") {
    const statusAr = av.status === "CONFIRMED" ? "مؤكد" : "معتذر";
    await answerCallbackQuery(cqId, `ℹ️ لقد سبق إرسال ردّك (${statusAr}).`);
    return;
  }

  const dateLabel = new Date(av.lectureDay.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const subjects = av.lecturer.subjects;

  // Confirm right away (subjects, if any, are an optional refinement chosen
  // afterwards in a separate message).
  await prisma.lecturerAvailability.update({
    where: { id: avId },
    data: { status: "CONFIRMED", respondedAt: new Date() },
  });

  // Refresh the original combined message so this day flips to ✅ and the rest
  // stay clickable.
  await refreshCombinedMessage(chatId, messageId, av.lecturerId);
  await answerCallbackQuery(cqId, "✅ تم تأكيد حضورك!");
  // Notify admins (single notification per response).
  await notifyAdminsOfLecturerResponse(avId);

  // No linked subjects → just send a plain confirmation at the bottom.
  if (subjects.length === 0) {
    const confirmedText = [
      `✅ <b>تم تأكيد حضورك بنجاح</b>`,
      ``,
      `📅 يوم: <b>${escapeHtml(dateLabel)}</b>`,
      av.lectureDay.label ? `(${escapeHtml(av.lectureDay.label)})` : "",
    ].filter(Boolean).join("\n");
    await sendTelegramMessage(chatId, confirmedText);
    return;
  }

  // Linked subjects → open an optional subject picker as a SEPARATE message so
  // the combined day list above is untouched.
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  const sess = await prisma.telegramBotSession.create({
    data: {
      chatId: String(chatId),
      availabilityId: avId,
      selectedIds: "[]",
      expiresAt,
    },
  });

  const pickerText = [
    `✅ <b>تم تأكيد حضورك ليوم ${escapeHtml(dateLabel)}</b>`,
    av.lectureDay.label ? `(${escapeHtml(av.lectureDay.label)})` : "",
    ``,
    buildSubjectSelectionMessage(subjects, [], dateLabel),
  ].filter(Boolean).join("\n");
  const keyboard = buildSubjectKeyboard(subjects, [], sess.id);
  await sendTelegramMessage(chatId, pickerText, { reply_markup: keyboard });
}

/**
 * Lecturer pressed "❌ اعتذار".
 */
async function handleDeclineAttendance(
  chatId: number,
  messageId: number | undefined,
  cqId: string,
  avId: string,
) {
  const av = await prisma.lecturerAvailability.findUnique({
    where: { id: avId },
    include: { lectureDay: { select: { date: true, label: true } } },
  });

  if (!av) {
    await answerCallbackQuery(cqId, "❌ لم يُعثر على الطلب.");
    return;
  }
  if (av.status !== "PENDING") {
    const statusAr = av.status === "CONFIRMED" ? "مؤكد" : "معتذر";
    await answerCallbackQuery(cqId, `ℹ️ لقد سبق إرسال ردّك (${statusAr}).`);
    return;
  }

  await prisma.lecturerAvailability.update({
    where: { id: avId },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  const dateLabel = new Date(av.lectureDay.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Refresh the original combined message (this day flips to ❌, the rest stay
  // actionable), then send a fresh message at the bottom so the lecturer
  // actually sees the reply was recorded.
  await refreshCombinedMessage(chatId, messageId, av.lecturerId);

  const newText = [
    `❌ <b>تم تسجيل اعتذارك</b>`,
    ``,
    `📅 يوم: <b>${escapeHtml(dateLabel)}</b>`,
    av.lectureDay.label ? `(${escapeHtml(av.lectureDay.label)})` : "",
    ``,
    `شكرًا على الإخطار. يمكنك تغيير ردّك في أي وقت من حسابك على الموقع.`,
  ].filter(Boolean).join("\n");
  await sendTelegramMessage(chatId, newText);

  await answerCallbackQuery(cqId, "تم تسجيل اعتذارك.");
  await notifyAdminsOfLecturerResponse(avId);
}

/**
 * Lecturer toggled a subject checkbox.
 */
async function handleToggleSubject(
  chatId: number,
  messageId: number | undefined,
  cqId: string,
  sessId: string,
  subId: string,
) {
  const sess = await prisma.telegramBotSession.findUnique({ where: { id: sessId } });
  if (!sess || sess.expiresAt < new Date()) {
    await answerCallbackQuery(cqId, "⌛ انتهت صلاحية الجلسة. ابدأ من أول.");
    return;
  }

  let selected: string[] = JSON.parse(sess.selectedIds || "[]");
  if (selected.includes(subId)) {
    selected = selected.filter((id) => id !== subId);
  } else {
    selected.push(subId);
  }

  await prisma.telegramBotSession.update({
    where: { id: sessId },
    data: { selectedIds: JSON.stringify(selected) },
  });

  // Rebuild the keyboard with updated selections
  const av = await prisma.lecturerAvailability.findUnique({
    where: { id: sess.availabilityId },
    include: {
      lecturer: { include: { subjects: { select: { id: true, name: true, academicYear: { select: { name: true } } } } } },
      lectureDay: { select: { date: true, label: true } },
    },
  });
  if (!av) {
    await answerCallbackQuery(cqId, "❌ خطأ في تحميل البيانات.");
    return;
  }

  const dateLabel = new Date(av.lectureDay.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const text = buildSubjectSelectionMessage(av.lecturer.subjects, selected, dateLabel);
  const keyboard = buildSubjectKeyboard(av.lecturer.subjects, selected, sessId);

  if (messageId) {
    await editMessageText(chatId, messageId, text, { reply_markup: keyboard });
  }
  await answerCallbackQuery(cqId);
}

/**
 * Lecturer pressed "✅ تأكيد الاختيار" — finalize subject selection and confirm.
 */
async function handleDoneSubjectSelection(
  chatId: number,
  messageId: number | undefined,
  cqId: string,
  sessId: string,
) {
  const sess = await prisma.telegramBotSession.findUnique({ where: { id: sessId } });
  if (!sess || sess.expiresAt < new Date()) {
    await answerCallbackQuery(cqId, "⌛ انتهت صلاحية الجلسة. ابدأ من أول.");
    return;
  }

  const selectedIds: string[] = JSON.parse(sess.selectedIds || "[]");

  const av = await prisma.lecturerAvailability.findUnique({
    where: { id: sess.availabilityId },
    include: {
      lecturer: { include: { subjects: { select: { id: true, name: true, academicYear: { select: { name: true } } } } } },
      lectureDay: { select: { date: true, label: true } },
    },
  });
  if (!av) {
    await answerCallbackQuery(cqId, "❌ خطأ في تحميل البيانات.");
    await prisma.telegramBotSession.delete({ where: { id: sessId } }).catch(() => null);
    return;
  }

  // Build confirmed message
  const dateLabel = new Date(av.lectureDay.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const selectedSubjects = av.lecturer.subjects.filter((s) => selectedIds.includes(s.id));
  const subjectLines =
    selectedSubjects.length > 0
      ? selectedSubjects.map((s) => `  • ${escapeHtml(s.name)}${s.academicYear ? ` — ${escapeHtml(s.academicYear.name)}` : ""}`).join("\n")
      : "  (لم تختر مواد محددة)";

  // Attendance was already CONFIRMED when the button was pressed (and admins
  // were already notified); here we only record the chosen subjects.
  await prisma.lecturerAvailability.update({
    where: { id: sess.availabilityId },
    data: { plannedSubjectIds: JSON.stringify(selectedIds) },
  });

  // Clean up session
  await prisma.telegramBotSession.delete({ where: { id: sessId } }).catch(() => null);

  const newText = [
    `✅ <b>تم تأكيد حضورك بنجاح</b>`,
    ``,
    `📅 يوم: <b>${escapeHtml(dateLabel)}</b>`,
    av.lectureDay.label ? `(${escapeHtml(av.lectureDay.label)})` : "",
    ``,
    `📚 المواد المختارة:`,
    subjectLines,
    ``,
    `شكرًا! يمكنك تعديل ردّك في أي وقت من حسابك على الموقع.`,
  ].filter(Boolean).join("\n");

  if (messageId) {
    await editMessageText(chatId, messageId, newText, { reply_markup: null as unknown as undefined });
  } else {
    await sendTelegramMessage(chatId, newText);
  }
  await answerCallbackQuery(cqId, "✅ تم حفظ المواد!");
}

// ─── Main callback_query dispatcher ──────────────────────────────────────────

async function handleCallbackQuery(cq: TelegramCallbackQuery) {
  const chatId = cq.from.id;
  const data = cq.data || "";
  const messageId = cq.message?.message_id;

  if (data.startsWith("conf:")) {
    await handleConfirmAttendance(chatId, messageId, cq.id, data.slice(5));
  } else if (data.startsWith("decl:")) {
    await handleDeclineAttendance(chatId, messageId, cq.id, data.slice(5));
  } else if (data.startsWith("stog:")) {
    const rest = data.slice(5);
    const colonIdx = rest.indexOf(":");
    const sessId = rest.slice(0, colonIdx);
    const subId = rest.slice(colonIdx + 1);
    await handleToggleSubject(chatId, messageId, cq.id, sessId, subId);
  } else if (data.startsWith("done:")) {
    await handleDoneSubjectSelection(chatId, messageId, cq.id, data.slice(5));
  } else {
    await answerCallbackQuery(cq.id, "❓ أمر غير معروف.");
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Handle inline-button presses
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message || !message.text) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text.trim();

  if (text.startsWith("/start")) {
    const code = text.slice("/start".length).trim();
    await handleStartCommand(message, code);
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/help")) {
    await sendTelegramMessage(
      message.chat.id,
      "🙋‍♂️ <b>كيفية الاستخدام</b>\nالـ Bot ده بيرسل تذكيرات تلقائية. عشان تربطه بحسابك، ادخل على موقع المعهد واضغط <b>اربط Telegram</b> من صفحة حسابك.",
    );
    return NextResponse.json({ ok: true });
  }

  // Default fallback
  await sendTelegramMessage(
    message.chat.id,
    "ℹ️ ده Bot للإشعارات بس. لربط حسابك ارجع للموقع واضغط <b>اربط Telegram</b>.",
  );
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST telegram updates to this URL" });
}
