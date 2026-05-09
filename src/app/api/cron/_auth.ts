/**
 * Verify the request is coming from Vercel Cron. Vercel attaches an
 * Authorization: Bearer {CRON_SECRET} header to every cron invocation
 * (when CRON_SECRET is set in env). Returns true if the secret matches,
 * or if no secret is configured (dev / first run).
 */
export function isVercelCronAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${expected}`;
}
