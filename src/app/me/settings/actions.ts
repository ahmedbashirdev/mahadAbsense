"use server"
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";

export async function changeStudentPassword(formData: FormData) {
  const session = await getStudentSession();
  if (!session) return { error: "غير مصرح لك" };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!newPassword || newPassword.length < 4) return { error: "كلمة المرور الجديدة قصيرة جداً" };
  if (newPassword !== confirmPassword) return { error: "كلمة المرور الجديدة غير متطابقة" };

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { password: true },
  });

  if (!student?.password) return { error: "حساب الطالب غير مفعّل" };

  const ok = await bcrypt.compare(currentPassword, student.password);
  if (!ok) return { error: "كلمة المرور الحالية غير صحيحة" };

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.student.update({
    where: { id: session.studentId },
    data: { password: hashed },
  });

  return { success: true };
}
