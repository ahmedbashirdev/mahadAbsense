import { NextResponse } from "next/server";
import { runWednesdayAdminAlerts, cairoTodayUtcMidnight } from "@/lib/lectureDays";
import { isVercelCronAuthorized } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wednesday (Cairo) admin follow-up: pending lecturers + unfinished/unpublished
 * schedule for the coming Fri/Sat. Guarded to only act when it's actually
 * Wednesday in Cairo, so it can't double-send even if triggered more often.
 */
export async function GET(req: Request) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 0=Sun ... 3=Wed
  if (cairoTodayUtcMidnight().getUTCDay() !== 3) {
    return NextResponse.json({ ok: true, skipped: "not Wednesday in Cairo" });
  }

  const result = await runWednesdayAdminAlerts();
  return NextResponse.json(result);
}
