import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const studentsCount = await prisma.student.count();
  const subjectsCount = await prisma.subject.count();
  const yearsCount = await prisma.academicYear.count();
  
  // Get recent attendance to show quick stats
  const recentAttendance = await prisma.attendance.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      student: true,
      subject: true
    }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">لوحة التحكم الرئيسية</h1>
          <p className="page-subtitle">ملخص عام لبيانات المعهد ونسب المشاركة</p>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>عدد الطلاب المسجلين</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{studentsCount}</p>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>عدد المواد الدراسية</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--success)' }}>{subjectsCount}</p>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>المراحل الدراسية</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--warning)' }}>{yearsCount}</p>
        </div>
      </section>

      <section className="card animate-fade-in" style={{ animationDelay: '0.4s' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>آخر عمليات تسجيل الغياب</h2>
        {recentAttendance.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>المادة</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {recentAttendance.map(att => (
                  <tr key={att.id}>
                    <td style={{ fontWeight: 500 }}>{att.student.name}</td>
                    <td>{att.subject.name}</td>
                    <td>{att.date.toLocaleDateString('ar-EG')}</td>
                    <td>
                      <span className={`status-badge status-${att.status.toLowerCase()}`}>
                        {att.status === 'PRESENT' ? 'حاضر' : att.status === 'ABSENT' ? 'غائب' : 'مستأذن'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
            لا توجد سجلات غياب حديثة.
          </p>
        )}
      </section>
    </>
  );
}
