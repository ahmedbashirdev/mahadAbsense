import { NextResponse } from "next/server";
import { createLectureDayWithNotify } from "@/lib/lectureDays";
import { isVercelCronAuthorized } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The calendar date "today" in Cairo, as a UTC-midnight Date. */
function cairoTodayUtcMidnight(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Runs every Sunday night (Cairo). Creates the upcoming Friday + Saturday
 * lecture days (if they don't already exist) and DMs every approved lecturer
 * a confirm/decline request. Idempotent, so safe to run more than once.
 */
export async function GET(req: Request) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const today = cairoTodayUtcMidnight();
  const dow = today.getUTCDay(); // 0=Sun ... 5=Fri, 6=Sat
  const daysUntilFriday = (5 - dow + 7) % 7; // nearest upcoming Friday (0 if today is Friday)

  const friday = new Date(today);
  friday.setUTCDate(friday.getUTCDate() + daysUntilFriday);
  const saturday = new Date(friday);
  saturday.setUTCDate(saturday.getUTCDate() + 1);

  const results = [];
  for (const date of [friday, saturday]) {
    const r = await createLectureDayWithNotify(date);
    results.push({
      date: date.toISOString().split("T")[0],
      created: r.created,
      lecturers: r.lecturers,
    });
  }

  return NextResponse.json({ ok: true, results });
}
