"use server"
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getLecturerSession } from "@/lib/auth";

export async function changeLecturerPassword(formData: FormData) {
  const session = await getLecturerSession();
  if (!session) return { error: "غير مصرح لك" };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!newPassword || newPassword.length < 4) return { error: "كلمة المرور الجديدة قصيرة جداً" };
  if (newPassword !== confirmPassword) return { error: "كلمة المرور الجديدة غير متطابقة" };

  const lecturer = await prisma.lecturer.findUnique({
    where: { id: session.lecturerId },
    select: { password: true },
  });

  if (!lecturer?.password) return { error: "حساب المحاضر غير مفعّل" };

  const ok = await bcrypt.compare(currentPassword, lecturer.password);
  if (!ok) return { error: "كلمة المرور الحالية غير صحيحة" };

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.lecturer.update({
    where: { id: session.lecturerId },
    data: { password: hashed },
  });

  return { success: true };
}
