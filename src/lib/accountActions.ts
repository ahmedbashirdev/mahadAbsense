"use server"
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  loginSession,
  loginStudentSession,
  loginLecturerSession,
  markSessionTelegramLinked,
} from "@/lib/auth";
import {
  sessionAccountRef,
  isTelegramLinked,
  getPersonId,
  getPersonAccountRefs,
  shareTelegramAcrossPerson,
  type AccountRef,
  type UserType,
} from "@/lib/accounts";

function homeForType(t: UserType): string {
  if (t === "STUDENT") return "/me";
  if (t === "LECTURER") return "/me-lecturer";
  return "/";
}

/**
 * Gate helper: confirm the current account has linked Telegram, then re-issue
 * the session so the proxy lets them through and send them to their dashboard.
 */
export async function verifyTelegramAndContinue(): Promise<{ ok: false; error: string } | void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const ref = sessionAccountRef(session);
  const linked = await isTelegramLinked(ref);
  if (!linked) {
    return { ok: false, error: "لسه ما ربطتش Telegram. اضغط «اربط Telegram» وكمّل الخطوات في التطبيق." };
  }

  // If this account belongs to a person group, share the chat with the rest.
  const personId = await getPersonId(ref);
  if (personId) await shareTelegramAcrossPerson(personId);

  await markSessionTelegramLinked();
  redirect(homeForType(ref.userType));
}

/**
 * Quick-switch to another account that belongs to the SAME person. No password
 * needed — the admin established that these accounts are the same human.
 */
export async function switchToAccount(
  targetUserType: UserType,
  targetRefId: string,
): Promise<{ ok: false; error: string } | void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const currentRef = sessionAccountRef(session);
  // Authorize: target must be in the current account's person group.
  const groupRefs = await getPersonAccountRefs(currentRef);
  const allowed = groupRefs.some((r) => r.userType === targetUserType && r.refId === targetRefId);
  if (!allowed) {
    return { ok: false, error: "الحساب ده مش مربوط بحسابك." };
  }

  const targetRef: AccountRef = { userType: targetUserType, refId: targetRefId };
  const linked = await isTelegramLinked(targetRef);

  if (targetUserType === "STUDENT") {
    const s = await prisma.student.findUnique({
      where: { id: targetRefId },
      select: { id: true, username: true, isActive: true },
    });
    if (!s || !s.username) return { ok: false, error: "الحساب غير متاح." };
    if (!s.isActive) return { ok: false, error: "الحساب موقوف." };
    await loginStudentSession({ id: s.id, username: s.username }, linked);
  } else if (targetUserType === "LECTURER") {
    const l = await prisma.lecturer.findUnique({
      where: { id: targetRefId },
      select: { id: true, username: true, isActive: true, approvalStatus: true },
    });
    if (!l || !l.username) return { ok: false, error: "الحساب غير متاح." };
    if (!l.isActive) return { ok: false, error: "الحساب موقوف." };
    if (l.approvalStatus !== "APPROVED") return { ok: false, error: "الحساب في انتظار الموافقة." };
    await loginLecturerSession({ id: l.id, username: l.username }, linked);
  } else {
    const u = await prisma.user.findUnique({
      where: { id: targetRefId },
      select: { id: true, username: true, role: true },
    });
    if (!u) return { ok: false, error: "الحساب غير متاح." };
    await loginSession(u, linked);
  }

  redirect(homeForType(targetUserType));
}

// ─── Admin: link / unlink accounts as the same person ────────────────────────

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.type !== "STAFF" || session.role !== "ADMIN") return null;
  return session;
}

/** Verify an account ref actually exists (so we don't link phantom rows). */
async function accountExists(ref: AccountRef): Promise<boolean> {
  if (ref.userType === "STUDENT") {
    return !!(await prisma.student.findUnique({ where: { id: ref.refId }, select: { id: true } }));
  }
  if (ref.userType === "LECTURER") {
    return !!(await prisma.lecturer.findUnique({ where: { id: ref.refId }, select: { id: true } }));
  }
  return !!(await prisma.user.findUnique({ where: { id: ref.refId }, select: { id: true } }));
}

/**
 * Admin action: declare that two accounts belong to the same person, merging
 * their person groups if needed, then share their Telegram chat.
 */
export async function linkAccountsAsSamePerson(
  a: AccountRef,
  b: AccountRef,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "غير مصرّح." };

  if (a.userType === b.userType && a.refId === b.refId) {
    return { ok: false, error: "لازم تختار حسابين مختلفين." };
  }
  if (!(await accountExists(a)) || !(await accountExists(b))) {
    return { ok: false, error: "أحد الحسابين غير موجود." };
  }

  const pidA = await getPersonId(a);
  const pidB = await getPersonId(b);

  let personId: string;
  if (pidA && pidB) {
    if (pidA === pidB) {
      await shareTelegramAcrossPerson(pidA);
      return { ok: true };
    }
    // Merge B's group into A's.
    personId = pidA;
    await prisma.linkedAccount.updateMany({ where: { personId: pidB }, data: { personId } });
  } else {
    personId = pidA || pidB || randomUUID();
  }

  await prisma.linkedAccount.upsert({
    where: { userType_refId: { userType: a.userType, refId: a.refId } },
    update: { personId },
    create: { personId, userType: a.userType, refId: a.refId },
  });
  await prisma.linkedAccount.upsert({
    where: { userType_refId: { userType: b.userType, refId: b.refId } },
    update: { personId },
    create: { personId, userType: b.userType, refId: b.refId },
  });

  await shareTelegramAcrossPerson(personId);
  return { ok: true };
}

/** Resolve a (type, username) pair to an account ref. */
async function resolveByUsername(userType: UserType, username: string): Promise<AccountRef | null> {
  const u = username.trim();
  if (!u) return null;
  if (userType === "STUDENT") {
    const s = await prisma.student.findUnique({ where: { username: u }, select: { id: true } });
    return s ? { userType, refId: s.id } : null;
  }
  if (userType === "LECTURER") {
    const l = await prisma.lecturer.findUnique({ where: { username: u }, select: { id: true } });
    return l ? { userType, refId: l.id } : null;
  }
  const usr = await prisma.user.findUnique({ where: { username: u }, select: { id: true } });
  return usr ? { userType, refId: usr.id } : null;
}

/**
 * Admin action: link two accounts identified by (type, username) — what the
 * admin UI submits.
 */
export async function linkAccountsByUsername(
  aType: UserType,
  aUsername: string,
  bType: UserType,
  bUsername: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "غير مصرّح." };

  const a = await resolveByUsername(aType, aUsername);
  if (!a) return { ok: false, error: `ما لقيناش ${aUsername} كحساب ${aType}.` };
  const b = await resolveByUsername(bType, bUsername);
  if (!b) return { ok: false, error: `ما لقيناش ${bUsername} كحساب ${bType}.` };

  return linkAccountsAsSamePerson(a, b);
}

/** Admin action: remove an account from its person group. */
export async function unlinkAccount(ref: AccountRef): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "غير مصرّح." };

  const personId = await getPersonId(ref);
  if (!personId) return { ok: true };

  await prisma.linkedAccount.deleteMany({ where: { userType: ref.userType, refId: ref.refId } });

  // If only one account is left in the group, dissolve the group entirely.
  const remaining = await prisma.linkedAccount.findMany({ where: { personId }, select: { id: true } });
  if (remaining.length <= 1) {
    await prisma.linkedAccount.deleteMany({ where: { personId } });
  }
  return { ok: true };
}
