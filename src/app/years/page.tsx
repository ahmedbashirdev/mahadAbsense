import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import Link from "next/link";
import { redirect } from "next/navigation";

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

async function updateYear(formData: FormData) {
  "use server"
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const order = parseInt(formData.get("order") as string);
  
  if (!id || !name || isNaN(order)) return;
  
  await prisma.academicYear.update({
    where: { id },
    data: { name, order }
  });
  
  await logActivity("تعديل سنة", `قام بتعديل المقررة الدراسية ${name}`);
  revalidatePath("/years");
  redirect("/years");
}

async function deleteYear(formData: FormData) {
  "use server"
  const id = formData.get("id") as string;
  if (!id) return;
  
  const year = await prisma.academicYear.findUnique({ where: { id }});
  if (year) {
    await prisma.academicYear.delete({ where: { id }});
    await logActivity("حذف سنة", `قام بحذف المقررة الدراسية ${year.name}`);
  }
  revalidatePath("/years");
}

export default async function YearsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const sp = await searchParams;
  const editId = sp.edit;
  let yearToEdit = null;
  if (editId) {
    yearToEdit = await prisma.academicYear.findUnique({ where: { id: editId } });
  }

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

      <div className="two-col-grid">
        <section className="card animate-fade-in" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>
            {yearToEdit ? "تعديل السنة الدراسية" : "إضافة سنة جديدة"}
          </h3>
          {yearToEdit ? (
            <form action={updateYear} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="hidden" name="id" value={yearToEdit.id} />
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم السنة (مثال: التمهيدي)</label>
                <input type="text" name="name" className="input-field" defaultValue={yearToEdit.name} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الترتيب (رقم)</label>
                <input type="number" name="order" className="input-field" defaultValue={yearToEdit.order} required />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>حفظ التعديلات</button>
                <Link href="/years" className="btn btn-danger" style={{ flex: 1, textAlign: 'center', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>إلغاء</Link>
              </div>
            </form>
          ) : (
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
          )}
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
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Link href={`/years?edit=${year.id}`} className="btn" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                            تعديل
                          </Link>
                          <SubmitWithConfirm action={deleteYear} id={year.id} confirmMessage={`هل أنت متأكد من حذف ${year.name}؟ سيتم حذف جميع البيانات المرتبطة بها مثل المواد والغياب`} />
                        </div>
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
