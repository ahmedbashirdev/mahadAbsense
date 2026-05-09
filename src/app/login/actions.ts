"use server"
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { loginSession, loginStudentSession, loginLecturerSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const accountType = (formData.get("accountType") as string) || "STAFF"; // "STAFF" | "STUDENT" | "LECTURER"
  const next = (formData.get("next") as string) || "";

  if (!username || !password) {
    return { error: "يرجى تعبئة كلا الحقلين" };
  }

  if (accountType === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, isActive: true },
    });
    if (!student || !student.password || !student.username) {
      return { error: "بيانات الدخول غير صحيحة" };
    }
    const ok = await bcrypt.compare(password, student.password);
    if (!ok) return { error: "بيانات الدخول غير صحيحة" };
    if (!student.isActive) {
      return { error: "هذا الحساب موقوف. تواصل مع إدارة المعهد." };
    }

    await loginStudentSession({ id: student.id, username: student.username });
    redirect(next && next.startsWith("/") ? next : "/me");
  }

  if (accountType === "LECTURER") {
    const lecturer = await prisma.lecturer.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, isActive: true, approvalStatus: true },
    });
    if (!lecturer || !lecturer.password || !lecturer.username) {
      return { error: "بيانات الدخول غير صحيحة" };
    }
    const ok = await bcrypt.compare(password, lecturer.password);
    if (!ok) return { error: "بيانات الدخول غير صحيحة" };
    if (!lecturer.isActive) {
      return { error: "هذا الحساب موقوف. تواصل مع إدارة المعهد." };
    }
    if (lecturer.approvalStatus !== "APPROVED") {
      return { error: "حسابك في انتظار موافقة الإدارة." };
    }

    await loginLecturerSession({ id: lecturer.id, username: lecturer.username });
    redirect(next && next.startsWith("/") ? next : "/me-lecturer");
  }

  // Auto-seed admin user if user table is completely empty
  const usersCount = await prisma.user.count();
  if (usersCount === 0) {
    const defaultHashedPassword = await bcrypt.hash("admin", 10);
    await prisma.user.create({
      data: {
        name: "مدير النظام",
        username: "admin",
        password: defaultHashedPassword,
        role: "ADMIN"
      }
    });
  }

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    return { error: "بيانات الدخول غير صحيحة" };
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return { error: "بيانات الدخول غير صحيحة" };
  }

  await loginSession(user);

  redirect(next && next.startsWith("/") ? next : "/");
}
