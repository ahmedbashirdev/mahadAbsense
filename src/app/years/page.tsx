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

export default async function YearsPage({ searchParams }: { searchParams: Promise<{ edit?: string, new?: string }> }) {
  const sp = await searchParams;
  const editId = sp.edit;
  const isNew = sp.new === "1";
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
        <Link href="/years?new=1" className="btn btn-primary">
          <Plus size={18} /> إضافة سنة
        </Link>
      </header>

      <section className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>قائمة السنوات</h3>
        {years.length > 0 ? (
          <div className="table-responsive-cards" style={{ overflowX: 'auto' }}>
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
                    <td data-label="الاسم" style={{ fontWeight: 600 }}>{year.name}</td>
                    <td data-label="الترتيب">{year.order}</td>
                    <td data-label="إجراءات">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link href={`/years?edit=${year.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                          <Edit size={14} /> تعديل
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

      {/* Edit Modal */}
      {yearToEdit && (
        <Modal title="تعديل السنة الدراسية" onCloseRoute="/years">
          <ClientForm action={updateYear} successMessage="تم تعديل السنة بنجاح" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="id" value={yearToEdit.id} />
            <div>
              <label className="field-label">اسم السنة (مثال: التمهيدي)</label>
              <input type="text" name="name" className="input-field" defaultValue={yearToEdit.name} required />
            </div>
            <div>
              <label className="field-label">الترتيب (رقم)</label>
              <input type="number" name="order" className="input-field" defaultValue={yearToEdit.order} required />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <SubmitButton defaultText="حفظ التعديلات" style={{ flex: 1 }} />
              <Link href="/years" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}

      {/* Add Modal */}
      {isNew && (
        <Modal title="إضافة سنة جديدة" onCloseRoute="/years">
          <ClientForm action={addYear} successMessage="تم إضافة السنة بنجاح" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="field-label">اسم السنة (مثال: التمهيدي)</label>
              <input type="text" name="name" className="input-field" required />
            </div>
            <div>
              <label className="field-label">الترتيب (رقم)</label>
              <input type="number" name="order" className="input-field" defaultValue="1" required />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <SubmitButton defaultText="إضافة السنة" style={{ flex: 1 }} />
              <Link href="/years" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}
    </>
  );
}
