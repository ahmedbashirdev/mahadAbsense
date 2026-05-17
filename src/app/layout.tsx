import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./LogoutButton";
import AppShell from "@/components/AppShell";
import MobileBottomNav from "@/components/MobileBottomNav";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "نظام إدارة المعهد العلمي",
  description: "نظام تسجيل غياب وإدارة شؤون المعهد",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  let sidebarContent: React.ReactNode = null;

  if (session?.type === "STAFF") {
    sidebarContent = (
      <>
        <h2 className="sidebar-brand">المعهد العلمي</h2>

        <nav className="sidebar-nav">
          <Link href="/" className="sidebar-link">📊 الرئيسية</Link>
          <Link href="/attendance" className="sidebar-link">📝 تسجيل الغياب</Link>
          <Link href="/attendance/session" className="sidebar-link">📱 جلسة QR للحضور</Link>
          <Link href="/lecture-days" className="sidebar-link">📅 جدول المحاضرات</Link>
          <Link href="/reports" className="sidebar-link">📈 تقارير الدفعات</Link>

          <hr className="sidebar-sep" />

          <Link href="/years" className="sidebar-link">📆 السنوات الدراسية</Link>
          <Link href="/subjects" className="sidebar-link">📚 المواد الدراسية</Link>
          <Link href="/students" className="sidebar-link">🧑‍🎓 الطلاب</Link>
          <Link href="/lecturers" className="sidebar-link">👨‍🏫 المحاضرين</Link>

          {session.role === "ADMIN" && (
            <>
              <hr className="sidebar-sep" />
              <Link href="/users" className="sidebar-link">👥 إدارة المستخدمين</Link>
              <Link href="/activity" className="sidebar-link">⏱️ سجل النشاطات</Link>
              <Link href="/admin/telegram" className="sidebar-link">📡 إعداد Telegram</Link>
            </>
          )}

          <hr className="sidebar-sep" />
          <Link href="/settings" className="sidebar-link">⚙️ إعدادات حسابي</Link>
        </nav>

        <LogoutButton />
      </>
    );
  } else if (session?.type === "LECTURER") {
    const lecturer = await prisma.lecturer.findUnique({
      where: { id: session.lecturerId },
      select: { name: true },
    });
    sidebarContent = (
      <>
        <h2 className="sidebar-brand">حساب المحاضر</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {lecturer?.name || session.username}
        </p>
        <nav className="sidebar-nav">
          <Link href="/me-lecturer" className="sidebar-link">📊 لوحة بياناتي</Link>
          <Link href="/me-lecturer/schedule" className="sidebar-link">📅 جدول المحاضرات</Link>
          <hr className="sidebar-sep" />
          <Link href="/me-lecturer/settings" className="sidebar-link">⚙️ تغيير كلمة المرور</Link>
        </nav>
        <LogoutButton />
      </>
    );
  } else if (session?.type === "STUDENT") {
    // Pull the student's name for the sidebar header.
    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { name: true },
    });
    sidebarContent = (
      <>
        <h2 className="sidebar-brand">حسابي</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {student?.name || session.username}
        </p>

        <nav className="sidebar-nav">
          <Link href="/me" className="sidebar-link">📊 لوحة بياناتي</Link>
          <Link href="/me/checkin" className="sidebar-link">📷 تسجيل الحضور</Link>
          <hr className="sidebar-sep" />
          <Link href="/me/settings" className="sidebar-link">⚙️ تغيير كلمة المرور</Link>
        </nav>

        <LogoutButton />
      </>
    );
  }

  return (
    <html lang="ar" dir="rtl">
      <body>
        <AppShell 
          sidebar={sidebarContent} 
          userType={session?.type}
          bottomNav={session?.type === "STUDENT" ? <MobileBottomNav /> : undefined}
        >
          {children}
        </AppShell>
        <Toaster position="top-center" richColors theme="light" />
      </body>
    </html>
  );
}
