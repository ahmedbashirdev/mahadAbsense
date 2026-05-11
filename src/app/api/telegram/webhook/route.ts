import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

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

type Update = {
  update_id: number;
  message?: TelegramMessage;
};

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

  // Look up the link code.
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

  // Resolve the target user's display name for the success message.
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

  // Bind the chatId to THIS Mahad account. We intentionally do NOT remove
  // other subscriptions on the same chat — a single Telegram user might be
  // managing several Mahad accounts (e.g., a parent with two kids).
  try {
    await prisma.$transaction([
      prisma.telegramSubscription.upsert({
        where: { userType_refId: { userType: link.userType, refId: link.refId } },
        update: {
          chatId: String(chatId),
          username: fromUsername,
          firstName,
          lastName,
        },
        create: {
          userType: link.userType,
          refId: link.refId,
          chatId: String(chatId),
          username: fromUsername,
          firstName,
          lastName,
        },
      }),
      prisma.telegramLinkCode.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
    ]);
  } catch (e) {
    console.error("Failed to bind Telegram chat:", e);
    await sendTelegramMessage(chatId, "❌ حصل خطأ مؤقت. حاول مرة تانية.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    `✅ تم ربط حسابك بنجاح!\n\nأهلاً <b>${escapeHtml(displayName)}</b> 👋\nهتوصلك الإشعارات هنا (تذكيرات المحاضرات، طلبات تأكيد الحضور، إلخ).`,
  );
}

export async function POST(req: Request) {
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = update.message;
  if (!message || !message.text) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text.trim();

  // /start [code]
  if (text.startsWith("/start")) {
    const code = text.slice("/start".length).trim();
    await handleStartCommand(message, code);
    return NextResponse.json({ ok: true });
  }

  // /help
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

// GET handler is useful for a quick health check from Vercel.
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST telegram updates to this URL" });
}
