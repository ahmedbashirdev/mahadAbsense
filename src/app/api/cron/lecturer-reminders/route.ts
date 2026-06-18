import { NextResponse } from "next/server";
import { sendLecturerReminders } from "@/lib/telegramBroadcast";
import { runWednesdayAdminAlerts, cairoNowParts } from "@/lib/lectureDays";
import { isVercelCronAuthorized } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Morning (06:00 UTC ≈ 08:00 Cairo). Always nudges lecturers who haven't
// responded; on Wednesday it also DMs admins the follow-up (pending lecturers +
// unfinished/unpublished schedule for the coming Fri/Sat).
export async function GET(req: Request) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const reminders = await sendLecturerReminders();
  let adminCheck: unknown = { skipped: "not Wednesday in Cairo" };
  if (cairoNowParts().weekday === 3) {
    adminCheck = await runWednesdayAdminAlerts();
  }
  return NextResponse.json({ ok: true, reminders, adminCheck });
}
