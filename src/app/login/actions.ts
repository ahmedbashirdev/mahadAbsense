"use server"
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { loginSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "يرجى تعبئة كلا الحقلين" };
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

  // Create session
  await loginSession(user);
  
  // Redirect after successful login
  redirect("/");
}
