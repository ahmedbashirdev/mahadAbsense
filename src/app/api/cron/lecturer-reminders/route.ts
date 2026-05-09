import { NextResponse } from "next/server";
import { sendLecturerReminders } from "@/lib/telegramBroadcast";
import { isVercelCronAuthorized } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendLecturerReminders();
  return NextResponse.json(result);
}
