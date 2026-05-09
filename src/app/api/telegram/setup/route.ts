import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStaffSession } from "@/lib/auth";
import { setTelegramWebhook, getTelegramWebhookInfo, getBotMe } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot endpoint an ADMIN hits from /admin to register this deployment's
 * webhook URL with Telegram. Idempotent — calling it again just updates the URL.
 */
export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  if (!baseUrl) {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    const proto = h.get("x-forwarded-proto") || "https";
    if (host) baseUrl = `${proto}://${host}`;
  }
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: "Could not determine app URL" }, { status: 500 });
  }

  // Allow override via body for edge cases
  let bodyUrl: string | null = null;
  try {
    const body = (await req.json().catch(() => null)) as { url?: string } | null;
    if (body?.url) bodyUrl = body.url;
  } catch {
    // ignore
  }
  const webhookUrl = `${bodyUrl?.replace(/\/$/, "") || baseUrl}/api/telegram/webhook`;

  const me = await getBotMe();
  const set = await setTelegramWebhook(webhookUrl);
  const info = await getTelegramWebhookInfo();

  return NextResponse.json({
    ok: set.ok,
    me: me.result,
    setResult: set,
    webhookInfo: info.result,
    url: webhookUrl,
  });
}

export async function GET() {
  const session = await getStaffSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const me = await getBotMe();
  const info = await getTelegramWebhookInfo();
  return NextResponse.json({ ok: true, me: me.result, webhookInfo: info.result });
}
