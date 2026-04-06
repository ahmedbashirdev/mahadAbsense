"use server"
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/logger";

export async function changePassword(formData: FormData) {
  const session = await getSession();
  if (!session?.userId) return { error: "غير مصرح لك" };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (newPassword !== confirmPassword) {
    return { error: "كلمة المرور الجديدة غير متطابقة" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId }
  });

  if (!user) return { error: "الحساب غير موجود" };

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return { error: "كلمة المرور الحالية غير صحيحة" };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  await logActivity("تغيير كلمة المرور", "قام بتغيير كلمة المرور الخاصة به");
  
  return { success: true };
}
