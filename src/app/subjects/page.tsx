import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import Link from "next/link";
import { redirect } from "next/navigation";
import Modal from "@/components/Modal";
import ClientForm from "@/components/ClientForm";
import SubmitButton from "@/components/SubmitButton";
import { Plus, Edit } from "lucide-react";

export const dynamic = 'force-dynamic';

async function addSubject(formData: FormData) {
  "use server"
  
  const name = formData.get("name") as string;
  const termType = formData.get("termType") as string;
  const yearId = formData.get("yearId") as string;
  const bookName = (formData.get("bookName") as string)?.trim() || null;
  const targetPageStr = formData.get("targetPage") as string;
  const targetPage = targetPageStr ? parseInt(targetPageStr, 10) : null;
  
  if (!name || !termType || !yearId) return;
  
  await prisma.subject.create({
    data: { name, termType, yearId, bookName, targetPage }
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
  const bookName = (formData.get("bookName") as string)?.trim() || null;
  const targetPageStr = formData.get("targetPage") as string;
  const targetPage = targetPageStr ? parseInt(targetPageStr, 10) : null;
  
  if (!id || !name || !termType || !yearId) return;
  
  await prisma.subject.update({
    where: { id },
    data: { name, termType, yearId, bookName, targetPage }
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

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ edit?: string, new?: string }> }) {
  const sp = await searchParams;
  const editId = sp.edit;
  const isNew = sp.new === "1";
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
        <Link href="/subjects?new=1" className="btn btn-primary">
          <Plus size={18} /> إضافة مادة
        </Link>
      </header>

      <section className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>قائمة المواد</h3>
        {subjects.length > 0 ? (
          <div className="table-responsive-cards" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>السنة الدراسية</th>
                  <th>الكتاب</th>
                  <th>الهدف</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map(subject => (
                  <tr key={subject.id}>
                    <td data-label="المادة" style={{ fontWeight: 600 }}>{subject.name}</td>
                    <td data-label="السنة الدراسية">{subject.academicYear.name}</td>
                    <td data-label="الكتاب">{subject.bookName || <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                    <td data-label="الهدف">{subject.targetPage ? `ص ${subject.targetPage}` : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                    <td data-label="إجراءات">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link href={`/subjects?edit=${subject.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                          <Edit size={14} /> تعديل
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

      {/* Edit Modal */}
      {subjectToEdit && (
        <Modal title="تعديل المادة" onCloseRoute="/subjects">
          <ClientForm action={updateSubject} successMessage="تم تعديل المادة بنجاح" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="id" value={subjectToEdit.id} />
            <div>
              <label className="field-label">اسم المادة</label>
              <input type="text" name="name" className="input-field" defaultValue={subjectToEdit.name} required />
            </div>
            <div>
              <label className="field-label">السنة الدراسية</label>
              <select name="yearId" className="input-field" defaultValue={subjectToEdit.yearId} required>
                <option value="">اختر السنة...</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">الفصل الدراسي</label>
              <select name="termType" className="input-field" defaultValue={subjectToEdit.termType} required>
                <option value="ONE_TERM">ترم واحد (مستقل)</option>
                <option value="TWO_TERMS">ترمين (ممتدة)</option>
              </select>
            </div>
            <div>
              <label className="field-label">اسم الكتاب (اختياري)</label>
              <input type="text" name="bookName" className="input-field" defaultValue={subjectToEdit.bookName || ""} placeholder="مثال: التوحيد للشيخ الفوزان" />
            </div>
            <div>
              <label className="field-label">رقم الصفحة المستهدفة (اختياري)</label>
              <input type="number" name="targetPage" className="input-field" defaultValue={subjectToEdit.targetPage || ""} placeholder="مثال: 150" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <SubmitButton defaultText="حفظ التعديلات" style={{ flex: 1 }} />
              <Link href="/subjects" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}

      {/* Add Modal */}
      {isNew && (
        <Modal title="إضافة مادة جديدة" onCloseRoute="/subjects">
          <ClientForm action={addSubject} successMessage="تم إضافة المادة بنجاح" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="field-label">اسم المادة</label>
              <input type="text" name="name" className="input-field" required />
            </div>
            <div>
              <label className="field-label">السنة الدراسية</label>
              <select name="yearId" className="input-field" required>
                <option value="">اختر السنة...</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">الفصل الدراسي</label>
              <select name="termType" className="input-field" required>
                <option value="ONE_TERM">ترم واحد (مستقل)</option>
                <option value="TWO_TERMS">ترمين (ممتدة)</option>
              </select>
            </div>
            <div>
              <label className="field-label">اسم الكتاب (اختياري)</label>
              <input type="text" name="bookName" className="input-field" placeholder="مثال: التوحيد للشيخ الفوزان" />
            </div>
            <div>
              <label className="field-label">رقم الصفحة المستهدفة (اختياري)</label>
              <input type="number" name="targetPage" className="input-field" placeholder="مثال: 150" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <SubmitButton defaultText="إضافة المادة" style={{ flex: 1 }} />
              <Link href="/subjects" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}
    </>
  );
}
