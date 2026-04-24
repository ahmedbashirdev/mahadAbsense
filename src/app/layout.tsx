import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from 'next/link';
import { getSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import AppShell from "@/components/AppShell";

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

  const sidebarContent = session ? (
    <>
      <h2 className="sidebar-brand">المعهد العلمي</h2>

      <nav className="sidebar-nav">
        <Link href="/" className="sidebar-link">
          📊 الرئيسية
        </Link>
        <Link href="/attendance" className="sidebar-link">
          📝 تسجيل الغياب
        </Link>
        <Link href="/reports" className="sidebar-link">
          📈 تقارير الدفعات
        </Link>

        <hr className="sidebar-sep" />

        <Link href="/years" className="sidebar-link">
          📆 السنوات الدراسية
        </Link>
        <Link href="/subjects" className="sidebar-link">
          📚 المواد الدراسية
        </Link>
        <Link href="/students" className="sidebar-link">
          🧑‍🎓 الطلاب
        </Link>

        {session.role === 'ADMIN' && (
          <>
            <hr className="sidebar-sep" />
            <Link href="/users" className="sidebar-link">
              👥 إدارة المستخدمين
            </Link>
            <Link href="/activity" className="sidebar-link">
              ⏱️ سجل النشاطات
            </Link>
          </>
        )}

        <hr className="sidebar-sep" />
        <Link href="/settings" className="sidebar-link">
          ⚙️ إعدادات حسابي
        </Link>
      </nav>

      <LogoutButton />
    </>
  ) : null;

  return (
    <html lang="ar" dir="rtl">
      <body>
        <AppShell sidebar={sidebarContent}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
