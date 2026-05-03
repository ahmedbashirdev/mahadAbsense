import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import StudentsList from "./StudentsList";
import { getStudentAccess } from "@/lib/access";

export const dynamic = 'force-dynamic';

async function addStudent(formData: FormData) {
  "use server"

  const access = await getStudentAccess();
  if (!access) return;

  const name = formData.get("name") as string;
  const identifier = formData.get("identifier") as string;
  const yearId = formData.get("yearId") as string;
  const genderRaw = formData.get("gender") as string;
  const gender = genderRaw === "FEMALE" ? "FEMALE" : "MALE";

  if (!name || !yearId) return;

  // Block users without access from adding female students.
  if (gender === "FEMALE" && !access.canViewFemale) return;

  await prisma.student.create({
    data: { name, identifier: identifier || null, yearId, gender }
  });

  await logActivity("إضافة طالب", `قام بإضافة الطالب ${name}`);
  revalidatePath("/students");
}

async function updateStudent(formData: FormData) {
  "use server"

  const access = await getStudentAccess();
  if (!access) return;

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const identifier = formData.get("identifier") as string;
  const yearId = formData.get("yearId") as string;
  const genderRaw = formData.get("gender") as string;
  const gender = genderRaw === "FEMALE" ? "FEMALE" : "MALE";

  if (!id || !name || !yearId) return;

  // Make sure the user is allowed to touch this record (existing gender)
  // and isn't trying to switch a record into a gender they cannot manage.
  const existing = await prisma.student.findUnique({ where: { id }, select: { gender: true } });
  if (!existing) return;
  if (!access.allowedGenders.includes(existing.gender as "MALE" | "FEMALE")) return;
  if (!access.allowedGenders.includes(gender)) return;

  await prisma.student.update({
    where: { id },
    data: { name, identifier: identifier || null, yearId, gender }
  });

  await logActivity("تعديل طالب", `قام بتعديل بيانات الطالب ${name}`);
  revalidatePath("/students");
  redirect("/students");
}

/**
 * Set / change a student's login credentials. Username is optional (can be left
 * empty to disable login), password is optional on update (won't change if empty).
 */
async function setStudentCredentials(formData: FormData) {
  "use server"
  const access = await getStudentAccess();
  if (!access) return;

  const id = formData.get("id") as string;
  const username = ((formData.get("username") as string) || "").trim();
  const password = ((formData.get("password") as string) || "").trim();

  if (!id) return;

  const student = await prisma.student.findUnique({
    where: { id },
    select: { gender: true, name: true },
  });
  if (!student) return;
  if (!access.allowedGenders.includes(student.gender as "MALE" | "FEMALE")) return;

  const data: { username?: string | null; password?: string | null } = {};
  data.username = username || null;
  if (password) data.password = await bcrypt.hash(password, 10);
  if (!username) data.password = null; // clearing username also clears password

  try {
    await prisma.student.update({ where: { id }, data });
    await logActivity(
      "تحديث بيانات دخول طالب",
      username
        ? `تم تعيين اسم المستخدم (${username}) للطالب ${student.name}${password ? " مع كلمة مرور جديدة" : ""}`
        : `تم تعطيل دخول الطالب ${student.name}`
    );
  } catch {
    // Username uniqueness conflict — silently ignore
  }
  revalidatePath("/students");
  redirect(`/students?edit=${id}`);
}

/** Suspend or re-activate a student's login. */
async function toggleStudentActive(formData: FormData) {
  "use server"
  const access = await getStudentAccess();
  if (!access) return;

  const id = formData.get("id") as string;
  const desired = formData.get("active") === "1"; // "1" -> activate, "0" -> suspend
  if (!id) return;

  const student = await prisma.student.findUnique({
    where: { id },
    select: { gender: true, name: true },
  });
  if (!student) return;
  if (!access.allowedGenders.includes(student.gender as "MALE" | "FEMALE")) return;

  await prisma.student.update({ where: { id }, data: { isActive: desired } });
  await logActivity(
    desired ? "تفعيل حساب طالب" : "إيقاف حساب طالب",
    `${desired ? "تم تفعيل" : "تم إيقاف"} حساب الطالب ${student.name}`
  );
  revalidatePath("/students");
  redirect(`/students?edit=${id}`);
}

async function deleteStudent(formData: FormData) {
  "use server"
  const access = await getStudentAccess();
  if (!access) return;

  const id = formData.get("id") as string;
  if (!id) return;

  const student = await prisma.student.findUnique({ where: { id }});
  if (student) {
    if (!access.allowedGenders.includes(student.gender as "MALE" | "FEMALE")) return;
    await prisma.student.delete({ where: { id }});
    await logActivity("حذف طالب", `قام بحذف الطالب ${student.name}`);
  }
  revalidatePath("/students");
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const access = await getStudentAccess();
  if (!access) redirect("/login");

  const sp = await searchParams;
  const editId = sp.edit;
  let studentToEdit = null;
  if (editId) {
    studentToEdit = await prisma.student.findUnique({ where: { id: editId } });
    // Hide the edit form if the user isn't allowed to manage this gender.
    if (studentToEdit && !access.allowedGenders.includes(studentToEdit.gender as "MALE" | "FEMALE")) {
      studentToEdit = null;
    }
  }

  const years = await prisma.academicYear.findMany({ orderBy: { order: 'asc' } });
  const students = await prisma.student.findMany({
    where: { ...access.studentWhere },
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
                <label className="field-label">اسم الطالب الرباعي</label>
                <input type="text" name="name" className="input-field" defaultValue={studentToEdit.name} required />
              </div>
              <div>
                <label className="field-label">رقم الجلوس / التكويد (اختياري)</label>
                <input type="text" name="identifier" className="input-field" defaultValue={studentToEdit.identifier || ''} />
              </div>
              <div>
                <label className="field-label">النوع</label>
                <div className="gender-toggle">
                  <label className={`gender-option ${studentToEdit.gender === 'MALE' ? 'checked' : ''}`}>
                    <input type="radio" name="gender" value="MALE" defaultChecked={studentToEdit.gender === 'MALE'} />
                    <span>👦 ذكر</span>
                  </label>
                  {access.canViewFemale && (
                    <label className={`gender-option ${studentToEdit.gender === 'FEMALE' ? 'checked' : ''}`}>
                      <input type="radio" name="gender" value="FEMALE" defaultChecked={studentToEdit.gender === 'FEMALE'} />
                      <span>👧 أنثى</span>
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label className="field-label">السنة الدراسية</label>
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
          ) : null}

          {/* Credentials section — only visible while editing an existing student */}
          {studentToEdit && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--border-color)' }}>
              <h4 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>🔐 بيانات دخول الطالب</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                الطالب يدخل بهذا الـ username وكلمة المرور لرؤية حضوره وتسجيل غيابه عبر QR.
                {studentToEdit.username
                  ? ` (مفعّل حاليًا: ${studentToEdit.username})`
                  : " (لا يوجد حساب دخول للطالب حاليًا)"}
              </p>
              <form action={setStudentCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <input type="hidden" name="id" value={studentToEdit.id} />
                <div>
                  <label className="field-label">اسم المستخدم</label>
                  <input
                    type="text"
                    name="username"
                    className="input-field"
                    defaultValue={studentToEdit.username || ""}
                    placeholder="example: ahmed_2025"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="field-label">
                    {studentToEdit.password ? "كلمة مرور جديدة (اتركها فارغة لإبقاء الحالية)" : "كلمة المرور الابتدائية"}
                  </label>
                  <input type="password" name="password" className="input-field" placeholder="••••••••" />
                </div>
                <button type="submit" className="btn btn-primary">حفظ بيانات الدخول</button>
              </form>

              {/* Suspend / activate */}
              {studentToEdit.username && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px dashed var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>حالة الحساب</strong>
                      <div style={{ marginTop: '0.25rem' }}>
                        {studentToEdit.isActive ? (
                          <span className="status-badge status-present">✓ مفعّل</span>
                        ) : (
                          <span className="status-badge status-absent">⏸ موقوف</span>
                        )}
                      </div>
                    </div>
                    <form action={toggleStudentActive}>
                      <input type="hidden" name="id" value={studentToEdit.id} />
                      <input type="hidden" name="active" value={studentToEdit.isActive ? "0" : "1"} />
                      <button
                        type="submit"
                        className={studentToEdit.isActive ? "btn btn-danger" : "btn btn-primary"}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                      >
                        {studentToEdit.isActive ? "إيقاف الحساب" : "إعادة تفعيل الحساب"}
                      </button>
                    </form>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                    إيقاف الحساب يمنع الطالب من تسجيل الدخول وتسجيل الحضور بـ QR، لكن لا يحذف بياناته.
                  </p>
                </div>
              )}
            </div>
          )}

          {!studentToEdit && (
            <form action={addStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="field-label">اسم الطالب الرباعي</label>
                <input type="text" name="name" className="input-field" required />
              </div>
              <div>
                <label className="field-label">رقم الجلوس / التكويد (اختياري)</label>
                <input type="text" name="identifier" className="input-field" />
              </div>
              <div>
                <label className="field-label">النوع</label>
                <div className="gender-toggle">
                  <label className="gender-option checked">
                    <input type="radio" name="gender" value="MALE" defaultChecked />
                    <span>👦 ذكر</span>
                  </label>
                  {access.canViewFemale && (
                    <label className="gender-option">
                      <input type="radio" name="gender" value="FEMALE" />
                      <span>👧 أنثى</span>
                    </label>
                  )}
                </div>
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
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                إضافة
              </button>
            </form>
          )}
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>سجل الطلاب</h3>
          <StudentsList
            students={students}
            years={years}
            deleteAction={deleteStudent}
            canViewFemale={access.canViewFemale}
          />
        </section>
      </div>
    </>
  );
}
