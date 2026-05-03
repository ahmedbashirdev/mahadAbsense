import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// In production, this should be set in .env
const secretKey = process.env.JWT_SECRET || "default_super_secret_dev_key_mahad";
const key = new TextEncoder().encode(secretKey);

export type StaffSession = {
  type: "STAFF";
  userId: string;
  username: string;
  role: "ADMIN" | "STAFF";
};

export type StudentSession = {
  type: "STUDENT";
  studentId: string;
  username: string;
};

export type Session = StaffSession | StudentSession;

type JoseClaims = { iat?: number; exp?: number };

export async function encrypt(payload: Record<string, unknown>) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function decrypt(input: string): Promise<(Session & JoseClaims) | null> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ["HS256"],
    });
    return payload as Session & JoseClaims;
  } catch {
    return null;
  }
}

// Sign in a staff user (admin or staff role)
export async function loginSession(user: { id: string; username: string; role: string }) {
  const sessionData: StaffSession = {
    type: "STAFF",
    userId: user.id,
    username: user.username,
    role: (user.role === "ADMIN" ? "ADMIN" : "STAFF"),
  };

  const token = await encrypt(sessionData as unknown as Record<string, unknown>);
  const cookieStore = await cookies();

  cookieStore.set("mahad_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 // 24 hours
  });
}

// Sign in a student user
export async function loginStudentSession(student: { id: string; username: string }) {
  const sessionData: StudentSession = {
    type: "STUDENT",
    studentId: student.id,
    username: student.username,
  };

  const token = await encrypt(sessionData as unknown as Record<string, unknown>);
  const cookieStore = await cookies();

  cookieStore.set("mahad_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24
  });
}

export async function logoutSession() {
  const cookieStore = await cookies();
  cookieStore.delete("mahad_session");
}

export async function getSession(): Promise<(Session & JoseClaims) | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("mahad_session")?.value;
  if (!session) return null;
  return await decrypt(session);
}

/** Convenience guard for staff-only endpoints */
export async function getStaffSession(): Promise<StaffSession | null> {
  const s = await getSession();
  if (!s || s.type !== "STAFF") return null;
  return s as StaffSession;
}

/** Convenience guard for student-only endpoints */
export async function getStudentSession(): Promise<StudentSession | null> {
  const s = await getSession();
  if (!s || s.type !== "STUDENT") return null;
  return s as StudentSession;
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get("mahad_session")?.value;
  if (!session) return NextResponse.next();

  const parsed = await decrypt(session);
  if (!parsed) return NextResponse.next();

  // Re-issue the cookie with a fresh 24h expiry
  const { iat: _iat, exp: _exp, ...rest } = parsed;
  void _iat; void _exp;
  const res = NextResponse.next();
  res.cookies.set({
    name: "mahad_session",
    value: await encrypt(rest as Record<string, unknown>),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24
  });
  return res;
}
