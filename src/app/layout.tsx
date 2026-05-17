import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./LogoutButton";
import AppShell from "@/components/AppShell";
import MobileBottomNav from "@/components/MobileBottomNav";
import { Toaster } from "sonner";
import { 
  LayoutDashboard, CheckSquare, QrCode, Calendar, BarChart3, 
  CalendarDays, BookOpen, GraduationCap, Presentation, Users, 
  Activity, Send, Settings 
} from "lucide-react";

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
          <Link href="/" className="sidebar-link"><LayoutDashboard size={18} /> الرئيسية</Link>
          <Link href="/attendance" className="sidebar-link"><CheckSquare size={18} /> تسجيل الغياب</Link>
          <Link href="/attendance/session" className="sidebar-link"><QrCode size={18} /> جلسة QR للحضور</Link>
          <Link href="/lecture-days" className="sidebar-link"><Calendar size={18} /> جدول المحاضرات</Link>
          <Link href="/reports" className="sidebar-link"><BarChart3 size={18} /> تقارير الدفعات</Link>

          <hr className="sidebar-sep" />

          <Link href="/years" className="sidebar-link"><CalendarDays size={18} /> السنوات الدراسية</Link>
          <Link href="/subjects" className="sidebar-link"><BookOpen size={18} /> المواد الدراسية</Link>
          <Link href="/students" className="sidebar-link"><GraduationCap size={18} /> الطلاب</Link>
          <Link href="/lecturers" className="sidebar-link"><Presentation size={18} /> المحاضرين</Link>

          {session.role === "ADMIN" && (
            <>
              <hr className="sidebar-sep" />
              <Link href="/users" className="sidebar-link"><Users size={18} /> إدارة المستخدمين</Link>
              <Link href="/activity" className="sidebar-link"><Activity size={18} /> سجل النشاطات</Link>
              <Link href="/admin/telegram" className="sidebar-link"><Send size={18} /> إعداد Telegram</Link>
            </>
          )}

          <hr className="sidebar-sep" />
          <Link href="/settings" className="sidebar-link"><Settings size={18} /> إعدادات حسابي</Link>
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
          <Link href="/me-lecturer" className="sidebar-link"><LayoutDashboard size={18} /> لوحة بياناتي</Link>
          <Link href="/me-lecturer/schedule" className="sidebar-link"><Calendar size={18} /> جدول المحاضرات</Link>
          <hr className="sidebar-sep" />
          <Link href="/me-lecturer/settings" className="sidebar-link"><Settings size={18} /> تغيير كلمة المرور</Link>
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
          <Link href="/me" className="sidebar-link"><LayoutDashboard size={18} /> لوحة بياناتي</Link>
          <Link href="/me/checkin" className="sidebar-link"><QrCode size={18} /> تسجيل الحضور</Link>
          <hr className="sidebar-sep" />
          <Link href="/me/settings" className="sidebar-link"><Settings size={18} /> تغيير كلمة المرور</Link>
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
