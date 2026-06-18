import { NextResponse } from "next/server";
import { sendEndOfDayLecturerSyllabusReminder } from "@/lib/telegramBroadcast";
import { runWeeklyAutoCreateIfDue } from "@/lib/lectureDays";
import { isVercelCronAuthorized } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nightly (21:00 UTC ≈ 23:00 Cairo). Always sends the end-of-day syllabus
// reminder; on Sunday night it also auto-creates the coming Fri+Sat, notifies
// the lecturers, and DMs the admins.
export async function GET(req: Request) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const syllabus = await sendEndOfDayLecturerSyllabusReminder();
  const autoCreate = await runWeeklyAutoCreateIfDue();
  return NextResponse.json({ ok: true, syllabus, autoCreate });
}
