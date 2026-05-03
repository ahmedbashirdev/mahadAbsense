import { SignJWT, jwtVerify } from "jose";

const secretKey = process.env.JWT_SECRET || "default_super_secret_dev_key_mahad";
const key = new TextEncoder().encode(secretKey);

const ISSUER = "mahad-checkin";

// QR rotates every QR_ROTATE_SECONDS on the admin's screen, but each token is
// valid for slightly longer to give the student time to scan + load the page.
export const QR_ROTATE_SECONDS = 30;
export const QR_TOKEN_TTL_SECONDS = 60;

export type CheckinTokenPayload = {
  subjectId: string;
  date: string; // YYYY-MM-DD
  // A nonce / salt baked in so the token's QR image changes every rotation
  // even when the underlying subject + date don't change.
  rot: number; // rotation slot (epoch / QR_ROTATE_SECONDS)
};

export async function signCheckinToken(p: CheckinTokenPayload): Promise<string> {
  return await new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${QR_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyCheckinToken(token: string): Promise<CheckinTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: ISSUER,
    });
    if (typeof payload.subjectId !== "string" || typeof payload.date !== "string") return null;
    return {
      subjectId: payload.subjectId,
      date: payload.date,
      rot: typeof payload.rot === "number" ? payload.rot : 0,
    };
  } catch {
    return null;
  }
}

/** Current rotation slot — tokens with the same slot are functionally identical. */
export function currentRotationSlot(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / QR_ROTATE_SECONDS);
}
