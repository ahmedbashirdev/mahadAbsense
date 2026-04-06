import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession, decrypt } from './lib/auth';

export async function middleware(request: NextRequest) {
  // Update session on every request if valid (refreshToken pattern)
  const response = await updateSession(request);

  // Check for session manually to protect routes
  const sessionValue = request.cookies.get("mahad_session")?.value;
  let session = null;
  if (sessionValue) {
    session = await decrypt(sessionValue);
  }

  // Paths that do not require authentication
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');
  
  if (!session && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
