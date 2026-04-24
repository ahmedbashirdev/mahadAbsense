import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

async function addSubject(formData: FormData) {
  "use server"
  
  const name = formData.get("name") as string;
  const termType = formData.get("termType") as string;
  const yearId = formData.get("yearId") as string;
  
  if (!name || !termType || !yearId) return;
  
  await prisma.subject.create({
    data: { name, termType, yearId }
  });
  
  await logActivity("إضافة مادة", `قام بإضافة المادة ${name}`);
  revalidatePath("/subjects");
}

async function updateSubject(formData: FormData) {
  "use server"
  
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const termType = formData.get("termType") as string;
  const yearId = formData.get("yearId") as string;
  
  if (!id || !name || !termType || !yearId) return;
  
  await prisma.subject.update({
    where: { id },
    data: { name, termType, yearId }
  });
  
  await logActivity("تعديل مادة", `قام بتعديل المادة ${name}`);
  revalidatePath("/subjects");
  redirect("/subjects");
}

async function deleteSubject(formData: FormData) {
  "use server"
  const id = formData.get("id") as string;
  if (!id) return;
  
  const subject = await prisma.subject.findUnique({ where: { id }});
  if (subject) {
    await prisma.subject.delete({ where: { id }});
    await logActivity("حذف مادة", `قام بحذف المادة ${subject.name}`);
  }
  revalidatePath("/subjects");
}

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const sp = await searchParams;
  const editId = sp.edit;
  let subjectToEdit = null;
  if (editId) {
    subjectToEdit = await prisma.subject.findUnique({ where: { id: editId } });
  }

  const years = await prisma.academicYear.findMany({ orderBy: { order: 'asc' } });
  const subjects = await prisma.subject.findMany({
    include: { academicYear: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">المواد الدراسية</h1>
          <p className="page-subtitle">إدارة المواد وربطها بالسنوات</p>
        </div>
      </header>

      <div className="two-col-grid">
        <section className="card animate-fade-in" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>
             {subjectToEdit ? "تعديل المادة" : "إضافة مادة جديدة"}
          </h3>
          {subjectToEdit ? (
            <form action={updateSubject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="hidden" name="id" value={subjectToEdit.id} />
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم المادة</label>
                <input type="text" name="name" className="input-field" defaultValue={subjectToEdit.name} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>السنة الدراسية</label>
                <select name="yearId" className="input-field" defaultValue={subjectToEdit.yearId} required>
                  <option value="">اختر السنة...</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الفصل الدراسي</label>
                <select name="termType" className="input-field" defaultValue={subjectToEdit.termType} required>
                  <option value="ONE_TERM">ترم واحد (مستقل)</option>
                  <option value="TWO_TERMS">ترمين (ممتدة)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>حفظ التعديلات</button>
                <Link href="/subjects" className="btn btn-danger" style={{ flex: 1, textAlign: 'center', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>إلغاء</Link>
              </div>
            </form>
          ) : (
            <form action={addSubject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم المادة</label>
                <input type="text" name="name" className="input-field" required />
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
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الفصل الدراسي</label>
                <select name="termType" className="input-field" required>
                  <option value="ONE_TERM">ترم واحد (مستقل)</option>
                  <option value="TWO_TERMS">ترمين (ممتدة)</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                إضافة المادة
              </button>
            </form>
          )}
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>قائمة المواد</h3>
          {subjects.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>المادة</th>
                    <th>السنة الدراسية</th>
                    <th>النوع</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(subject => (
                    <tr key={subject.id}>
                      <td style={{ fontWeight: 600 }}>{subject.name}</td>
                      <td>{subject.academicYear.name}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                           {subject.termType === 'ONE_TERM' ? 'ترم واحد' : 'ممتدة على ترمين'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Link href={`/subjects?edit=${subject.id}`} className="btn" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                            تعديل
                          </Link>
                          <SubmitWithConfirm action={deleteSubject} id={subject.id} confirmMessage={`هل أنت متأكد من حذف ${subject.name}؟`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
              لم يتم إضافة أي مواد بعد.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
