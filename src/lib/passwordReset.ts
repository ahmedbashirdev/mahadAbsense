"use server"
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

type UserType = "STUDENT" | "LECTURER" | "STAFF";
const RESET_TTL_MINUTES = 15;

/** Resolve a (type, username) to the account's id + display name. */
async function findAccount(userType: UserType, username: string) {
  const u = username.trim();
  if (!u) return null;
  if (userType === "STUDENT") {
    const s = await prisma.student.findUnique({ where: { username: u }, select: { id: true, name: true, isActive: true } });
    return s ? { id: s.id, name: s.name, active: s.isActive } : null;
  }
  if (userType === "LECTURER") {
    const l = await prisma.lecturer.findUnique({ where: { username: u }, select: { id: true, name: true, isActive: true } });
    return l ? { id: l.id, name: l.name, active: l.isActive } : null;
  }
  const usr = await prisma.user.findUnique({ where: { username: u }, select: { id: true, name: true } });
  return usr ? { id: usr.id, name: usr.name, active: true } : null;
}

/**
 * Step 1: user asks to reset. We look up their account, confirm it has a linked
 * Telegram, generate a 6-digit code, store it, and DM it to their Telegram.
 */
export async function requestPasswordReset(
  userType: UserType,
  username: string,
): Promise<{ ok: boolean; error?: string }> {
  const acc = await findAccount(userType, username);
  if (!acc) return { ok: false, error: "مفيش حساب بالبيانات دي." };
  if (!acc.active) return { ok: false, error: "الحساب موقوف. تواصل مع الإدارة." };

  const sub = await prisma.telegramSubscription.findUnique({
    where: { userType_refId: { userType, refId: acc.id } },
    select: { chatId: true },
  });
  if (!sub) {
    return { ok: false, error: "الحساب ده مش مربوط بـ Telegram، فمش هنقدر نبعت كود. تواصل مع الإدارة لإعادة التعيين." };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  // Invalidate any older codes for this account, then store the new one.
  await prisma.passwordResetCode.deleteMany({ where: { userType, refId: acc.id } });
  await prisma.passwordResetCode.create({ data: { userType, refId: acc.id, code, expiresAt } });

  const text = [
    `🔑 <b>كود إعادة تعيين كلمة المرور</b>`,
    ``,
    `أ. ${escapeHtml(acc.name)}، الكود بتاعك هو:`,
    `<code>${code}</code>`,
    ``,
    `الكود صالح لمدة ${RESET_TTL_MINUTES} دقيقة. لو مش إنت اللي طلبته، تجاهل الرسالة دي.`,
  ].join("\n");
  const r = await sendTelegramMessage(sub.chatId, text);
  if (!r.ok) return { ok: false, error: "تعذّر إرسال الكود على Telegram. حاول تاني." };

  return { ok: true };
}

/**
 * Step 2: user submits the code + a new password. We verify the code and update
 * the account's password.
 */
export async function resetPasswordWithCode(
  userType: UserType,
  username: string,
  code: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "كلمة المرور لازم تكون 6 أحرف على الأقل." };
  }
  const acc = await findAccount(userType, username);
  if (!acc) return { ok: false, error: "مفيش حساب بالبيانات دي." };

  const rec = await prisma.passwordResetCode.findFirst({
    where: {
      userType,
      refId: acc.id,
      code: code.trim(),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return { ok: false, error: "الكود غير صحيح أو انتهت صلاحيته." };

  const hashed = await bcrypt.hash(newPassword, 10);
  if (userType === "STUDENT") {
    await prisma.student.update({ where: { id: acc.id }, data: { password: hashed } });
  } else if (userType === "LECTURER") {
    await prisma.lecturer.update({ where: { id: acc.id }, data: { password: hashed } });
  } else {
    await prisma.user.update({ where: { id: acc.id }, data: { password: hashed } });
  }

  // Consume the code (and clear any siblings).
  await prisma.passwordResetCode.deleteMany({ where: { userType, refId: acc.id } });

  return { ok: true };
}
