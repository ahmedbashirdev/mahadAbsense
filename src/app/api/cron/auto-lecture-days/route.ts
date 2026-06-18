import { NextResponse } from "next/server";
import {
  createLectureDayWithNotify,
  upcomingFridaySaturday,
  notifyAdminsOfAutoCreatedDays,
} from "@/lib/lectureDays";
import { isVercelCronAuthorized } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs every Sunday night (Cairo). Creates the upcoming Friday + Saturday
 * lecture days (if they don't already exist), DMs every approved lecturer a
 * confirm/decline request, and DMs admins a summary of what was created.
 * Idempotent, so safe to run more than once.
 */
export async function GET(req: Request) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { friday, saturday } = upcomingFridaySaturday();

  const results = [];
  const created: { label: string }[] = [];
  for (const date of [friday, saturday]) {
    const r = await createLectureDayWithNotify(date);
    results.push({ date: date.toISOString().split("T")[0], created: r.created, lecturers: r.lecturers });
    if (r.created && r.day?.label) created.push({ label: r.day.label });
  }

  // Only notify admins about days that were genuinely newly created (keeps
  // re-runs from spamming).
  const adminNotify = await notifyAdminsOfAutoCreatedDays(created);

  return NextResponse.json({ ok: true, results, adminNotify });
}
