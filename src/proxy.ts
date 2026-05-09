import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession, decrypt } from './lib/auth';

// Routes a student is allowed to visit. Anything else gets bounced to /me.
const STUDENT_ALLOWED = ["/me", "/checkin", "/login", "/logout", "/logout-suspended"];
// Routes a lecturer is allowed to visit. Anything else gets bounced to /me-lecturer.
const LECTURER_ALLOWED = ["/me-lecturer", "/login", "/logout", "/logout-suspended"];

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  const sessionValue = request.cookies.get("mahad_session")?.value;
  const session = sessionValue ? await decrypt(sessionValue) : null;

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');

  // Not authenticated -> only auth routes are accessible
  if (!session && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isAuthRoute) {
    // Already logged in: send them to their respective home
    let home = "/";
    if (session.type === "STUDENT") home = "/me";
    else if (session.type === "LECTURER") home = "/me-lecturer";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Role-based route gating
  if (session?.type === "STUDENT") {
    const isAllowed = STUDENT_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!isAllowed) return NextResponse.redirect(new URL("/me", request.url));
  } else if (session?.type === "LECTURER") {
    const isAllowed = LECTURER_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!isAllowed) return NextResponse.redirect(new URL("/me-lecturer", request.url));
  } else if (session?.type === "STAFF") {
    // Staff shouldn't land on student/lecturer dashboards.
    if (pathname === "/me" || pathname.startsWith("/me/")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (pathname === "/me-lecturer" || pathname.startsWith("/me-lecturer/")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
