import { NextRequest, NextResponse } from "next/server";
import { decrypt, Session } from "@/lib/auth";

// Define public routes that don't require authentication
const publicRoutes = ["/login", "/signup", "/signup-lecturer", "/logout-suspended"];

// Public APIs might exist, but usually they handle auth internally or are webhooks
const publicApiRoutes = ["/api/telegram/webhook", "/api/cron/"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 1. Check if the path is public
  const isPublicRoute = publicRoutes.includes(path) || publicApiRoutes.some(p => path.startsWith(p));
  
  // 2. Extract and decrypt session
  const cookie = req.cookies.get("mahad_session")?.value;
  let session: Session | null = null;
  
  if (cookie) {
    const decrypted = await decrypt(cookie);
    if (decrypted) session = decrypted as Session;
  }

  // 3. Handle unauthenticated users trying to access protected routes
  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 4. Handle authenticated users trying to access public auth routes
  if (isPublicRoute && session) {
    if (session.type === "STUDENT") {
      return NextResponse.redirect(new URL("/me", req.url));
    } else if (session.type === "LECTURER") {
      return NextResponse.redirect(new URL("/me-lecturer", req.url));
    } else {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // 5. Enforce role-based access control for protected routes
  if (!isPublicRoute && session) {
    const isStudentRoute = path.startsWith("/me") && !path.startsWith("/me-lecturer");
    const isLecturerRoute = path.startsWith("/me-lecturer");
    
    if (isStudentRoute && session.type !== "STUDENT") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    
    if (isLecturerRoute && session.type !== "LECTURER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    
    // Any other route is assumed to be a staff/admin route (except api)
    if (!isStudentRoute && !isLecturerRoute && !path.startsWith("/api")) {
      if (session.type !== "STAFF") {
        // Redirect non-staff to their respective dashboards
        if (session.type === "STUDENT") {
          return NextResponse.redirect(new URL("/me", req.url));
        } else if (session.type === "LECTURER") {
          return NextResponse.redirect(new URL("/me-lecturer", req.url));
        }
      }
    }
  }

  return NextResponse.next();
}

// Ensure the middleware is only called for relevant paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
