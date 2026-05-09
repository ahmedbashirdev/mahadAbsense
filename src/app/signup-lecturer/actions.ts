"use server"
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

export async function signupLecturer(formData: FormData) {
  const name = ((formData.get("name") as string) || "").trim();
  const username = ((formData.get("username") as string) || "").trim();
  const password = ((formData.get("password") as string) || "").trim();
  const confirm = ((formData.get("confirmPassword") as string) || "").trim();

  if (!name) return { error: "اكتب اسمك الكامل" };
  if (!USERNAME_RE.test(username)) {
    return { error: "اسم المستخدم لازم يكون 3-32 حرف، حروف إنجليزية وأرقام و . _ - فقط" };
  }
  if (!password || password.length < 4) return { error: "كلمة المرور 4 أحرف على الأقل" };
  if (password !== confirm) return { error: "كلمتا المرور غير متطابقتين" };

  // Username uniqueness across all account tables.
  const [s1, s2, s3] = await Promise.all([
    prisma.student.findUnique({ where: { username }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
    prisma.lecturer.findUnique({ where: { username }, select: { id: true } }),
  ]);
  if (s1 || s2 || s3) return { error: "اسم المستخدم محجوز" };

  const hashed = await bcrypt.hash(password, 10);

  await prisma.lecturer.create({
    data: {
      name,
      username,
      password: hashed,
      approvalStatus: "PENDING",
      isActive: true,
    },
  });

  return { success: true };
}
