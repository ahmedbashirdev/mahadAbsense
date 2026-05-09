"use server"
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getTelegramDeepLink } from "@/lib/telegram";

const LINK_TTL_MINUTES = 10;

/**
 * Server action callable by any logged-in user. Generates a fresh link code
 * tied to the user's identity and returns the t.me deep link they should
 * open to bind their Telegram chat.
 */
export async function requestTelegramLink(): Promise<
  | { ok: true; deepLink: string; expiresInSeconds: number }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  let userType: "STUDENT" | "LECTURER" | "STAFF";
  let refId: string;
  if (session.type === "STUDENT") {
    userType = "STUDENT";
    refId = session.studentId;
  } else if (session.type === "LECTURER") {
    userType = "LECTURER";
    refId = session.lecturerId;
  } else if (session.type === "STAFF") {
    userType = "STAFF";
    refId = session.userId;
  } else {
    return { ok: false, error: "Unsupported account type" };
  }

  const code = randomBytes(12).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000);

  await prisma.telegramLinkCode.create({
    data: { code, userType, refId, expiresAt },
  });

  const deepLink = getTelegramDeepLink(code);
  if (!deepLink) {
    return { ok: false, error: "TELEGRAM_BOT_USERNAME غير مضبوط على السيرفر" };
  }

  return { ok: true, deepLink, expiresInSeconds: LINK_TTL_MINUTES * 60 };
}

/**
 * Server action to disconnect the current user's Telegram subscription.
 */
export async function disconnectTelegram(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  let userType: "STUDENT" | "LECTURER" | "STAFF";
  let refId: string;
  if (session.type === "STUDENT") {
    userType = "STUDENT";
    refId = session.studentId;
  } else if (session.type === "LECTURER") {
    userType = "LECTURER";
    refId = session.lecturerId;
  } else if (session.type === "STAFF") {
    userType = "STAFF";
    refId = session.userId;
  } else {
    return { ok: false, error: "Unsupported account type" };
  }

  await prisma.telegramSubscription.deleteMany({
    where: { userType, refId },
  });
  return { ok: true };
}
