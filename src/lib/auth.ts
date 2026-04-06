import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// In production, this should be set in .env
const secretKey = process.env.JWT_SECRET || "default_super_secret_dev_key_mahad";
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch (error) {
    return null;
  }
}

export async function loginSession(user: any) {
  const sessionData = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };
  
  const token = await encrypt(sessionData);
  const cookieStore = await cookies();
  
  cookieStore.set("mahad_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 // 24 hours
  });
}

export async function logoutSession() {
  const cookieStore = await cookies();
  cookieStore.delete("mahad_session");
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("mahad_session")?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get("mahad_session")?.value;
  if (!session) return NextResponse.next();

  const parsed = await decrypt(session);
  if (!parsed) return NextResponse.next();
  
  // Refresh the expiration time
  parsed.exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const res = NextResponse.next();
  res.cookies.set({
    name: "mahad_session",
    value: await encrypt(parsed),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24
  });
  return res;
}
