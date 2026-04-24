import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import Link from "next/link";
import { redirect } from "next/navigation";
import StudentsList from "./StudentsList";

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

async function updateStudent(formData: FormData) {
  "use server"
  
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const identifier = formData.get("identifier") as string;
  const yearId = formData.get("yearId") as string;
  
  if (!id || !name || !yearId) return;
  
  await prisma.student.update({
    where: { id },
    data: { name, identifier: identifier || null, yearId }
  });
  
  await logActivity("تعديل طالب", `قام بتعديل بيانات الطالب ${name}`);
  revalidatePath("/students");
  redirect("/students");
}

async function deleteStudent(formData: FormData) {
  "use server"
  const id = formData.get("id") as string;
  if (!id) return;
  
  const student = await prisma.student.findUnique({ where: { id }});
  if (student) {
    await prisma.student.delete({ where: { id }});
    await logActivity("حذف طالب", `قام بحذف الطالب ${student.name}`);
  }
  revalidatePath("/students");
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const sp = await searchParams;
  const editId = sp.edit;
  let studentToEdit = null;
  if (editId) {
    studentToEdit = await prisma.student.findUnique({ where: { id: editId } });
  }

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

      <div className="two-col-grid">
        <section className="card animate-fade-in" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>
            {studentToEdit ? "تعديل بيانات الطالب" : "إضافة طالب"}
          </h3>
          {studentToEdit ? (
            <form action={updateStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="hidden" name="id" value={studentToEdit.id} />
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم الطالب الرباعي</label>
                <input type="text" name="name" className="input-field" defaultValue={studentToEdit.name} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>رقم الجلوس / التكويد (اختياري)</label>
                <input type="text" name="identifier" className="input-field" defaultValue={studentToEdit.identifier || ''} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>السنة الدراسية</label>
                <select name="yearId" className="input-field" defaultValue={studentToEdit.yearId} required>
                  <option value="">اختر السنة...</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>حفظ التعديلات</button>
                <Link href="/students" className="btn btn-danger" style={{ flex: 1, textAlign: 'center', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>إلغاء</Link>
              </div>
            </form>
          ) : (
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
          )}
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>سجل الطلاب</h3>
          <StudentsList students={students} years={years} deleteAction={deleteStudent} />
        </section>
      </div>
    </>
  );
}
