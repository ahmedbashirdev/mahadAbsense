import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import { getStaffSession } from "@/lib/auth";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import Link from "next/link";
import { redirect } from "next/navigation";
import Modal from "@/components/Modal";
import ClientForm from "@/components/ClientForm";
import SubmitButton from "@/components/SubmitButton";
import { Plus, Edit, ClipboardList } from "lucide-react";
import { examTypeLabel, parseExamType } from "@/lib/exams";
import ExamFormFields from "./ExamFormFields";

export const dynamic = "force-dynamic";

async function addExam(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const subjectId = (formData.get("subjectId") as string) || "";
  const { term, kind } = parseExamType((formData.get("examType") as string) || "");
  const title = ((formData.get("title") as string) || "").trim() || null;
  const dateStr = (formData.get("date") as string) || "";
  const startTime = ((formData.get("startTime") as string) || "").trim() || null;
  const endTime = ((formData.get("endTime") as string) || "").trim() || null;
  const location = ((formData.get("location") as string) || "").trim() || null;
  const maxScore = parseFloat((formData.get("maxScore") as string) || "100") || 100;
  const passScore = parseFloat((formData.get("passScore") as string) || "50") || 0;

  if (!subjectId || !dateStr) return;

  await prisma.exam.create({
    data: {
      subjectId,
      term,
      kind,
      title,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      startTime,
      endTime,
      location,
      maxScore,
      passScore,
    },
  });

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
  await logActivity("إضافة اختبار", `اختبار مادة ${subject?.name ?? ""}`);
  revalidatePath("/exams");
  revalidatePath("/me");
}

async function updateExam(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  const subjectId = (formData.get("subjectId") as string) || "";
  const { term, kind } = parseExamType((formData.get("examType") as string) || "");
  const title = ((formData.get("title") as string) || "").trim() || null;
  const dateStr = (formData.get("date") as string) || "";
  const startTime = ((formData.get("startTime") as string) || "").trim() || null;
  const endTime = ((formData.get("endTime") as string) || "").trim() || null;
  const location = ((formData.get("location") as string) || "").trim() || null;
  const maxScore = parseFloat((formData.get("maxScore") as string) || "100") || 100;
  const passScore = parseFloat((formData.get("passScore") as string) || "50") || 0;

  if (!id || !subjectId || !dateStr) return;

  await prisma.exam.update({
    where: { id },
    data: {
      subjectId,
      term,
      kind,
      title,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      startTime,
      endTime,
      location,
      maxScore,
      passScore,
    },
  });

  await logActivity("تعديل اختبار", `تعديل بيانات اختبار`);
  revalidatePath("/exams");
  revalidatePath("/me");
  redirect("/exams");
}

async function deleteExam(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  if (!id) return;

  await prisma.exam.delete({ where: { id } });
  await logActivity("حذف اختبار", `حذف اختبار وكل نتائجه`);
  revalidatePath("/exams");
  revalidatePath("/me");
}

function toDateInput(d: Date) {
  return new Date(d).toISOString().split("T")[0];
}

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const editId = sp.edit;
  const isNew = sp.new === "1";

  const examToEdit = editId
    ? await prisma.exam.findUnique({ where: { id: editId } })
    : null;

  const years = await prisma.academicYear.findMany({ orderBy: { order: "asc" } });
  const subjects = await prisma.subject.findMany({
    include: { academicYear: { select: { name: true, order: true } } },
    orderBy: [{ academicYear: { order: "asc" } }, { name: "asc" }],
  });
  const subjectsForForm = subjects.map((s) => ({ id: s.id, name: s.name, yearId: s.yearId, termType: s.termType }));

  const exams = await prisma.exam.findMany({
    include: {
      subject: { include: { academicYear: { select: { name: true } } } },
      _count: { select: { results: true } },
    },
    orderBy: { date: "desc" },
  });

  const fieldStyle = { display: "flex", flexDirection: "column" as const, gap: "1rem" };

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">جدول الاختبارات والنتائج</h1>
          <p className="page-subtitle">إضافة اختبارات لكل مادة ورصد نتائج الطلاب</p>
        </div>
        <Link href="/exams?new=1" className="btn btn-primary">
          <Plus size={18} /> إضافة اختبار
        </Link>
      </header>

      <section className="card animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <h3 style={{ marginBottom: "1.5rem", fontWeight: 700 }}>قائمة الاختبارات</h3>
        {exams.length > 0 ? (
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>نوع الاختبار</th>
                  <th>التاريخ</th>
                  <th>الوقت</th>
                  <th>الدرجة العظمى / النجاح</th>
                  <th>النتائج</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((ex) => (
                  <tr key={ex.id}>
                    <td data-label="المادة" style={{ fontWeight: 600 }}>
                      {ex.subject.name}
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                        {ex.subject.academicYear.name}
                        {ex.title ? ` · ${ex.title}` : ""}
                      </div>
                    </td>
                    <td data-label="الترم">{examTypeLabel(ex.subject.termType, ex.term, ex.kind)}</td>
                    <td data-label="التاريخ">
                      {new Date(ex.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </td>
                    <td data-label="الوقت" dir="ltr">
                      {ex.startTime ? `${ex.startTime}${ex.endTime ? ` – ${ex.endTime}` : ""}` : "—"}
                    </td>
                    <td data-label="الدرجة">{ex.maxScore} / {ex.passScore}</td>
                    <td data-label="النتائج">{ex._count.results}</td>
                    <td data-label="إجراءات">
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <Link href={`/exams/${ex.id}`} className="btn btn-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                          <ClipboardList size={14} /> النتائج
                        </Link>
                        <Link href={`/exams?edit=${ex.id}`} className="btn btn-secondary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                          <Edit size={14} /> تعديل
                        </Link>
                        <SubmitWithConfirm action={deleteExam} id={ex.id} confirmMessage="حذف هذا الاختبار وكل نتائجه؟" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>
            لم يتم إضافة أي اختبارات بعد.
          </p>
        )}
      </section>

      {/* Edit Modal */}
      {examToEdit && (
        <Modal title="تعديل الاختبار" onCloseRoute="/exams">
          <ClientForm action={updateExam} successMessage="تم تعديل الاختبار بنجاح" style={fieldStyle}>
            <input type="hidden" name="id" value={examToEdit.id} />
            <ExamFormFields
              years={years}
              subjects={subjectsForForm}
              defaultYearId={subjectsForForm.find((s) => s.id === examToEdit.subjectId)?.yearId}
              defaultSubjectId={examToEdit.subjectId}
              defaultExamType={`${examToEdit.term}:${examToEdit.kind}`}
            />
            <div>
              <label className="field-label">عنوان الاختبار (اختياري)</label>
              <input type="text" name="title" className="input-field" defaultValue={examToEdit.title || ""} placeholder="مثال: اختبار نهاية الترم" />
            </div>
            <div>
              <label className="field-label">تاريخ الاختبار</label>
              <input type="date" name="date" className="input-field" defaultValue={toDateInput(examToEdit.date)} required />
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">من الساعة (اختياري)</label>
                <input type="time" name="startTime" className="input-field" defaultValue={examToEdit.startTime || ""} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">إلى الساعة (اختياري)</label>
                <input type="time" name="endTime" className="input-field" defaultValue={examToEdit.endTime || ""} />
              </div>
            </div>
            <div>
              <label className="field-label">المكان / القاعة (اختياري)</label>
              <input type="text" name="location" className="input-field" defaultValue={examToEdit.location || ""} placeholder="مثال: القاعة الكبرى" />
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">النهاية العظمى</label>
                <input type="number" name="maxScore" className="input-field" step="0.5" min="1" defaultValue={examToEdit.maxScore} required />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">درجة النجاح</label>
                <input type="number" name="passScore" className="input-field" step="0.5" min="0" defaultValue={examToEdit.passScore} required />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <SubmitButton defaultText="حفظ التعديلات" style={{ flex: 1 }} />
              <Link href="/exams" className="btn btn-secondary" style={{ flex: 1, textAlign: "center" }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}

      {/* Add Modal */}
      {isNew && (
        <Modal title="إضافة اختبار جديد" onCloseRoute="/exams">
          <ClientForm action={addExam} successMessage="تم إضافة الاختبار بنجاح" style={fieldStyle}>
            <ExamFormFields years={years} subjects={subjectsForForm} />
            <div>
              <label className="field-label">عنوان الاختبار (اختياري)</label>
              <input type="text" name="title" className="input-field" placeholder="مثال: اختبار نهاية الترم" />
            </div>
            <div>
              <label className="field-label">تاريخ الاختبار</label>
              <input type="date" name="date" className="input-field" required />
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">من الساعة (اختياري)</label>
                <input type="time" name="startTime" className="input-field" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">إلى الساعة (اختياري)</label>
                <input type="time" name="endTime" className="input-field" />
              </div>
            </div>
            <div>
              <label className="field-label">المكان / القاعة (اختياري)</label>
              <input type="text" name="location" className="input-field" placeholder="مثال: القاعة الكبرى" />
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">النهاية العظمى</label>
                <input type="number" name="maxScore" className="input-field" step="0.5" min="1" defaultValue="100" required />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">درجة النجاح</label>
                <input type="number" name="passScore" className="input-field" step="0.5" min="0" defaultValue="50" required />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <SubmitButton defaultText="إضافة الاختبار" style={{ flex: 1 }} />
              <Link href="/exams" className="btn btn-secondary" style={{ flex: 1, textAlign: "center" }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}
    </>
  );
}
