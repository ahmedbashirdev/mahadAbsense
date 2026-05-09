"use server"
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginStudentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { normalizeArabicName } from "@/lib/arabicName";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

export async function signupStudent(formData: FormData) {
  const name = ((formData.get("name") as string) || "").trim();
  const yearId = ((formData.get("yearId") as string) || "").trim();
  const genderRaw = ((formData.get("gender") as string) || "").trim();
  const username = ((formData.get("username") as string) || "").trim();
  const password = ((formData.get("password") as string) || "").trim();
  const confirm = ((formData.get("confirmPassword") as string) || "").trim();

  if (!name) return { error: "اكتب اسمك الكامل" };
  if (!yearId) return { error: "اختر السنة الدراسية" };
  if (genderRaw !== "MALE" && genderRaw !== "FEMALE") return { error: "اختر النوع" };
  if (!username) return { error: "اكتب اسم مستخدم" };
  if (!USERNAME_RE.test(username)) {
    return { error: "اسم المستخدم لازم يكون من 3 لـ 32 حرف، حروف إنجليزية وأرقام و . _ - فقط" };
  }
  if (!password || password.length < 4) {
    return { error: "كلمة المرور لازم تكون 4 أحرف على الأقل" };
  }
  if (password !== confirm) return { error: "كلمتا المرور غير متطابقتين" };

  // Make sure the year actually exists.
  const year = await prisma.academicYear.findUnique({ where: { id: yearId }, select: { id: true } });
  if (!year) return { error: "السنة الدراسية غير صالحة" };

  // Ensure the chosen username isn't already taken (in either Student or User).
  const existingStudent = await prisma.student.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingStudent) return { error: "اسم المستخدم محجوز، اختر اسم آخر" };
  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingUser) return { error: "اسم المستخدم محجوز، اختر اسم آخر" };

  const hashed = await bcrypt.hash(password, 10);

  // ── Auto-link with an existing pre-created record ───────────────────────
  // If the admin had already added this student (same year + gender + name)
  // and that record hasn't been claimed yet (no username), link the new
  // login to that record so the existing attendance history isn't orphaned.
  // We're conservative: only auto-link if EXACTLY one candidate matches —
  // ambiguous cases fall through to "create a new record" and the admin
  // can merge later from the students page.
  const candidates = await prisma.student.findMany({
    where: {
      yearId,
      gender: genderRaw,
      username: null,
    },
    select: { id: true, name: true },
  });
  const target = normalizeArabicName(name);
  const matches = candidates.filter((c) => normalizeArabicName(c.name) === target);

  let studentId: string;
  if (matches.length === 1) {
    // Claim the pre-existing record. Keep its name (admin's spelling is
    // assumed authoritative) and just attach credentials.
    const claimed = await prisma.student.update({
      where: { id: matches[0].id },
      data: { username, password: hashed, isActive: true },
      select: { id: true, username: true },
    });
    studentId = claimed.id;
  } else {
    // No unique match: create a fresh record.
    const created = await prisma.student.create({
      data: {
        name,
        yearId,
        gender: genderRaw,
        username,
        password: hashed,
        isActive: true,
      },
      select: { id: true, username: true },
    });
    studentId = created.id;
  }

  await loginStudentSession({ id: studentId, username });
  redirect("/me");
}
