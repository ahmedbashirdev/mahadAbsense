import { NextRequest, NextResponse } from "next/server";
import { decrypt, Session } from "@/lib/auth";

// Public pages — no session required
const publicRoutes = ["/login", "/signup", "/signup-lecturer", "/logout-suspended"];

// Public API routes — must never be blocked (webhooks, crons, etc.)
const publicApiPrefixes = [
  "/api/telegram/",
  "/api/cron/",
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 1. Always allow public API routes (webhooks, cron jobs)
  if (publicApiPrefixes.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. Always allow public pages
  if (publicRoutes.some((r) => path === r || path.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // 3. Extract session
  const cookie = req.cookies.get("mahad_session")?.value;
  let session: Session | null = null;
  if (cookie) {
    const decrypted = await decrypt(cookie);
    if (decrypted) session = decrypted as Session;
  }

  // 4. Redirect unauthenticated users to login
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    if (path !== "/") loginUrl.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Role-based access control
  const isStudentRoute = path.startsWith("/me") && !path.startsWith("/me-lecturer");
  const isLecturerRoute = path.startsWith("/me-lecturer");

  if (isStudentRoute && session.type !== "STUDENT") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isLecturerRoute && session.type !== "LECTURER") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Staff/admin routes — redirect students and lecturers to their dashboards
  if (!isStudentRoute && !isLecturerRoute && !path.startsWith("/api")) {
    if (session.type === "STUDENT") {
      return NextResponse.redirect(new URL("/me", req.url));
    }
    if (session.type === "LECTURER") {
      return NextResponse.redirect(new URL("/me-lecturer", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all paths except static assets
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
