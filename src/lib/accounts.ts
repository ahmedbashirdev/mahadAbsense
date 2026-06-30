import { prisma } from "@/lib/prisma";
import type { Session } from "@/lib/auth";

export type UserType = "STUDENT" | "LECTURER" | "STAFF";

export type AccountRef = { userType: UserType; refId: string };

export type AccountInfo = AccountRef & {
  name: string;
  username: string | null;
  isActive: boolean;
  /** Human label for the account type, in Arabic. */
  typeLabel: string;
};

/** The (userType, refId) the given session is currently acting as. */
export function sessionAccountRef(session: Session): AccountRef {
  if (session.type === "STUDENT") return { userType: "STUDENT", refId: session.studentId };
  if (session.type === "LECTURER") return { userType: "LECTURER", refId: session.lecturerId };
  return { userType: "STAFF", refId: session.userId };
}

const TYPE_LABEL: Record<UserType, string> = {
  STUDENT: "طالب",
  LECTURER: "محاضر",
  STAFF: "إداري",
};

export function accountTypeLabel(t: UserType): string {
  return TYPE_LABEL[t];
}

/** Does this account already have a Telegram subscription? */
export async function isTelegramLinked(ref: AccountRef): Promise<boolean> {
  const sub = await prisma.telegramSubscription.findUnique({
    where: { userType_refId: { userType: ref.userType, refId: ref.refId } },
    select: { id: true },
  });
  return !!sub;
}

/** Resolve display info (name/username/active) for a batch of account refs. */
export async function resolveAccounts(refs: AccountRef[]): Promise<AccountInfo[]> {
  if (refs.length === 0) return [];

  const studentIds = refs.filter((r) => r.userType === "STUDENT").map((r) => r.refId);
  const lecturerIds = refs.filter((r) => r.userType === "LECTURER").map((r) => r.refId);
  const staffIds = refs.filter((r) => r.userType === "STAFF").map((r) => r.refId);

  const [students, lecturers, staff] = await Promise.all([
    studentIds.length
      ? prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, username: true, isActive: true } })
      : Promise.resolve([]),
    lecturerIds.length
      ? prisma.lecturer.findMany({ where: { id: { in: lecturerIds } }, select: { id: true, name: true, username: true, isActive: true } })
      : Promise.resolve([]),
    staffIds.length
      ? prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, username: true } })
      : Promise.resolve([]),
  ]);

  const out: AccountInfo[] = [];
  for (const s of students) {
    out.push({ userType: "STUDENT", refId: s.id, name: s.name, username: s.username, isActive: s.isActive, typeLabel: TYPE_LABEL.STUDENT });
  }
  for (const l of lecturers) {
    out.push({ userType: "LECTURER", refId: l.id, name: l.name, username: l.username, isActive: l.isActive, typeLabel: TYPE_LABEL.LECTURER });
  }
  for (const u of staff) {
    out.push({ userType: "STAFF", refId: u.id, name: u.name, username: u.username, isActive: true, typeLabel: TYPE_LABEL.STAFF });
  }
  return out;
}

/** The personId grouping this account, or null if it isn't linked to anyone. */
export async function getPersonId(ref: AccountRef): Promise<string | null> {
  const row = await prisma.linkedAccount.findUnique({
    where: { userType_refId: { userType: ref.userType, refId: ref.refId } },
    select: { personId: true },
  });
  return row?.personId ?? null;
}

/** All account refs (including the given one) that belong to the same person. */
export async function getPersonAccountRefs(ref: AccountRef): Promise<AccountRef[]> {
  const personId = await getPersonId(ref);
  if (!personId) return [];
  const rows = await prisma.linkedAccount.findMany({
    where: { personId },
    select: { userType: true, refId: true },
  });
  return rows.map((r) => ({ userType: r.userType as UserType, refId: r.refId }));
}

/**
 * Ensure every account in a person group shares one Telegram chat: take the
 * most recently linked chatId in the group and create a subscription for any
 * member that lacks one. Lets notifications for all of a person's accounts land
 * in one chat, and lets linked accounts pass the "must link Telegram" gate.
 */
export async function shareTelegramAcrossPerson(personId: string) {
  const rows = await prisma.linkedAccount.findMany({
    where: { personId },
    select: { userType: true, refId: true },
  });
  if (rows.length < 2) return;

  const subs = await prisma.telegramSubscription.findMany({
    where: { OR: rows.map((r) => ({ userType: r.userType, refId: r.refId })) },
    orderBy: { updatedAt: "desc" },
  });
  if (subs.length === 0) return;

  const source = subs[0];
  const haveSub = new Set(subs.map((s) => `${s.userType}:${s.refId}`));

  for (const r of rows) {
    if (haveSub.has(`${r.userType}:${r.refId}`)) continue;
    await prisma.telegramSubscription.create({
      data: {
        userType: r.userType,
        refId: r.refId,
        chatId: source.chatId,
        username: source.username,
        firstName: source.firstName,
        lastName: source.lastName,
      },
    });
  }
}

/** If this account belongs to a person group, share its Telegram with the rest. */
export async function ensurePersonTelegramShared(ref: AccountRef) {
  const personId = await getPersonId(ref);
  if (personId) await shareTelegramAcrossPerson(personId);
}

/** All person groups (2+ accounts) with resolved display info — for the admin page. */
export async function listPersonGroups(): Promise<{ personId: string; accounts: AccountInfo[] }[]> {
  const rows = await prisma.linkedAccount.findMany({
    select: { personId: true, userType: true, refId: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return [];

  const byPerson = new Map<string, AccountRef[]>();
  for (const r of rows) {
    const list = byPerson.get(r.personId) || [];
    list.push({ userType: r.userType as UserType, refId: r.refId });
    byPerson.set(r.personId, list);
  }

  const allInfos = await resolveAccounts(rows.map((r) => ({ userType: r.userType as UserType, refId: r.refId })));
  const infoByKey = new Map(allInfos.map((i) => [`${i.userType}:${i.refId}`, i]));

  const out: { personId: string; accounts: AccountInfo[] }[] = [];
  for (const [personId, refs] of byPerson.entries()) {
    const accounts = refs
      .map((r) => infoByKey.get(`${r.userType}:${r.refId}`))
      .filter((x): x is AccountInfo => !!x);
    if (accounts.length > 0) out.push({ personId, accounts });
  }
  return out;
}

/**
 * Sibling accounts of the same person (EXCLUDING the current one), resolved
 * with display info — used to render the quick-switch list.
 */
export async function getLinkedAccounts(ref: AccountRef): Promise<AccountInfo[]> {
  const refs = await getPersonAccountRefs(ref);
  const siblings = refs.filter((r) => !(r.userType === ref.userType && r.refId === ref.refId));
  const infos = await resolveAccounts(siblings);
  // Keep a stable order: staff, lecturer, student.
  const order: Record<UserType, number> = { STAFF: 0, LECTURER: 1, STUDENT: 2 };
  return infos.sort((a, b) => order[a.userType] - order[b.userType]);
}
