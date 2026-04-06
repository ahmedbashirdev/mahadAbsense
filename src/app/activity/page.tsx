import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const session = await getSession();
  if (session?.role !== 'ADMIN') {
    redirect("/");
  }

  // Fetch the latest 100 activities
  const activities = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: {
        select: { name: true, username: true }
      }
    }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">سجل النشاطات</h1>
          <p className="page-subtitle">مراقبة الأحداث والتفاعلات التي يقوم بها الموظفين</p>
        </div>
      </header>

      <section className="card animate-fade-in">
        {activities.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>الوقت والتاريخ</th>
                  <th style={{ width: '200px' }}>المسؤول (المستخدم)</th>
                  <th style={{ width: '200px' }}>الإجراء</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {activities.map(log => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }} dir="ltr" align="right">
                       {new Date(log.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                       {log.user.name} <br/>
                       <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>@{log.user.username}</span>
                    </td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{log.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
            لا يوجد أي نشاطات مسجلة حتى الآن.
          </p>
        )}
      </section>
    </>
  );
}
