"use server"
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginStudentSession } from "@/lib/auth";
import { redirect } from "next/navigation";

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

  const student = await prisma.student.create({
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

  await loginStudentSession({ id: student.id, username: student.username! });
  redirect("/me");
}
