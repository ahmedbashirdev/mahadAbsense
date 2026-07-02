/**
 * Time formatting helpers. Lecture/exam times are stored as 24-hour "HH:MM"
 * strings; the UI and Telegram messages display them in 12-hour form with an
 * Arabic صباحًا/مساءً marker (e.g. "2:00 م").
 */

/** Convert a 24-hour "HH:MM" string to 12-hour Arabic form, e.g. "2:00 م". */
export function formatTime12(value?: string | null): string {
  const s = (value || "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (!Number.isFinite(h)) return s;
  const meridiem = h < 12 ? "ص" : "م";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${meridiem}`;
}

/** Format a "HH:MM"–"HH:MM" range in 12-hour Arabic form, e.g. "2:00 م – 3:30 م". */
export function formatTimeRange12(start?: string | null, end?: string | null): string {
  const s = formatTime12(start);
  if (!end) return s;
  return `${s} – ${formatTime12(end)}`;
}

/** Minutes since midnight for a "HH:MM" string, or null if unparseable. */
export function timeToMinutes(value?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((value || "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** Do two [start,end) time ranges overlap? Unparseable/zero-length ranges never overlap. */
export function timesOverlap(
  aStart?: string | null,
  aEnd?: string | null,
  bStart?: string | null,
  bEnd?: string | null,
): boolean {
  const as = timeToMinutes(aStart), ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart), be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}
