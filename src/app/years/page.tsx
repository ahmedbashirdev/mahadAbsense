import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";

export const dynamic = 'force-dynamic';

async function addYear(formData: FormData) {
  "use server"
  
  const name = formData.get("name") as string;
  const order = parseInt(formData.get("order") as string);
  
  if (!name || isNaN(order)) return;
  
  await prisma.academicYear.create({
    data: { name, order }
  });
  
  await logActivity("إضافة سنة", `قام بإضافة المقررة الدراسية ${name}`);
  revalidatePath("/years");
}

async function deleteYear(formData: FormData) {
  "use server"
  const id = formData.get("id") as string;
  if (!id) return;
  
  const year = await prisma.academicYear.findUnique({ where: { id }});
  await prisma.academicYear.delete({ where: { id }});
  
  if (year) await logActivity("حذف سنة", `قام بحذف المقررة الدراسية ${year.name}`);
  revalidatePath("/years");
}

export default async function YearsPage() {
  const years = await prisma.academicYear.findMany({
    orderBy: { order: 'asc' }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">السنوات الدراسية</h1>
          <p className="page-subtitle">إدارة وتعديل المراحل الدراسية في المعهد</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
        <section className="card animate-fade-in" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>إضافة سنة جديدة</h3>
          <form action={addYear} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم السنة (مثال: التمهيدي)</label>
              <input type="text" name="name" className="input-field" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الترتيب (رقم)</label>
              <input type="number" name="order" className="input-field" defaultValue="1" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              إضافة
            </button>
          </form>
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>قائمة السنوات</h3>
          {years.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الترتيب</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map(year => (
                    <tr key={year.id}>
                      <td style={{ fontWeight: 600 }}>{year.name}</td>
                      <td>{year.order}</td>
                      <td>
                        <form action={deleteYear}>
                          <input type="hidden" name="id" value={year.id} />
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
              لم يتم إضافة أي سنوات دراسية بعد.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
