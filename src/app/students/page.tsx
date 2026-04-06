import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";

export const dynamic = 'force-dynamic';

async function addStudent(formData: FormData) {
  "use server"
  
  const name = formData.get("name") as string;
  const identifier = formData.get("identifier") as string;
  const yearId = formData.get("yearId") as string;
  
  if (!name || !yearId) return;
  
  await prisma.student.create({
    data: { name, identifier: identifier || null, yearId }
  });
  
  await logActivity("إضافة طالب", `قام بإضافة الطالب ${name}`);
  revalidatePath("/students");
}

async function deleteStudent(formData: FormData) {
  "use server"
  const id = formData.get("id") as string;
  if (!id) return;
  
  const student = await prisma.student.findUnique({ where: { id }});
  await prisma.student.delete({ where: { id }});
  
  if (student) await logActivity("حذف طالب", `قام بحذف الطالب ${student.name}`);
  revalidatePath("/students");
}

export default async function StudentsPage() {
  const years = await prisma.academicYear.findMany({ orderBy: { order: 'asc' } });
  const students = await prisma.student.findMany({
    include: { academicYear: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">الطلاب</h1>
          <p className="page-subtitle">إدارة وتوزيع الطلاب على السنوات</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
        <section className="card animate-fade-in" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>إضافة طالب</h3>
          <form action={addStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم الطالب الرباعي</label>
              <input type="text" name="name" className="input-field" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>رقم الجلوس / التكويد (اختياري)</label>
              <input type="text" name="identifier" className="input-field" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>السنة الدراسية</label>
              <select name="yearId" className="input-field" required>
                <option value="">اختر السنة...</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              إضافة
            </button>
          </form>
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>سجل الطلاب</h3>
          {students.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الكود</th>
                    <th>السنة الدراسية</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr key={student.id}>
                      <td style={{ fontWeight: 600 }}>{student.name}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{student.identifier || '-'}</td>
                      <td>{student.academicYear.name}</td>
                      <td>
                        <form action={deleteStudent}>
                          <input type="hidden" name="id" value={student.id} />
                          <button type="submit" className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                            حذف
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
              لم يتم إضافة أي طلاب بعد.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
