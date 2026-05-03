import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession, decrypt } from './lib/auth';

// Routes a student is allowed to visit. All other (staff) pages get bounced
// back to /me when a student tries to access them.
const STUDENT_ALLOWED = ["/me", "/checkin", "/login", "/logout", "/logout-suspended"];

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  const sessionValue = request.cookies.get("mahad_session")?.value;
  const session = sessionValue ? await decrypt(sessionValue) : null;

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');

  // Not authenticated -> only auth routes are accessible
  if (!session && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the intended destination so we can come back after login
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isAuthRoute) {
    // Already logged in: send them to their respective home
    const home = session.type === "STUDENT" ? "/me" : "/";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Role-based route gating
  if (session?.type === "STUDENT") {
    const isAllowed = STUDENT_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!isAllowed) {
      return NextResponse.redirect(new URL("/me", request.url));
    }
  } else if (session?.type === "STAFF") {
    // Staff shouldn't land on /me — that's the student dashboard.
    if (pathname === "/me" || pathname.startsWith("/me/")) {
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
