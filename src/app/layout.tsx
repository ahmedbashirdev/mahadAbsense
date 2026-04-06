import type { Metadata } from "next";
import "./globals.css";
import Link from 'next/link';
import { getSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export const metadata: Metadata = {
  title: "نظام إدارة المعهد العلمي",
  description: "نظام تسجيل غياب وإدارة شؤون المعهد",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="app-container">
          {session && (
            <aside className="sidebar">
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem', color: 'var(--accent-primary)' }}>
                المعهد العلمي
              </h2>
              
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                <Link href="/" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  📊 الرئيسية
                </Link>
                <Link href="/attendance" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  📝 تسجيل الغياب
                </Link>
                <Link href="/reports" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  📈 تقارير الدفعات
                </Link>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
                
                <Link href="/years" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  📆 السنوات الدراسية
                </Link>
                <Link href="/subjects" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  📚 المواد الدراسية
                </Link>
                <Link href="/students" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  🧑‍🎓 الطلاب
                </Link>

                {session.role === 'ADMIN' && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
                    <Link href="/users" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                      👥 إدارة المستخدمين
                    </Link>
                    <Link href="/activity" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                      ⏱️ سجل النشاطات
                    </Link>
                  </>
                )}
                
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
                <Link href="/settings" className="btn btn-secondary" style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}>
                  ⚙️ إعدادات حسابي
                </Link>
              </nav>

              <LogoutButton />
            </aside>
          )}
          
          <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
