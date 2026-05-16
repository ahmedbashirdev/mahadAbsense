import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getLecturerSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function saveProgress(formData: FormData) {
  "use server";
  const session = await getLecturerSession();
  if (!session) return;

  const lectureId = formData.get("lectureId") as string;
  const progress = (formData.get("syllabusProgress") as string)?.trim() || null;
  const reachedPageStr = formData.get("reachedPage") as string;
  const reachedPage = reachedPageStr ? parseInt(reachedPageStr, 10) : null;

  if (!lectureId) return;

  // Ensure this lecture belongs to the lecturer
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
  });

  if (!lecture || lecture.lecturerId !== session.lecturerId) return;

  await prisma.lecture.update({
    where: { id: lectureId },
    data: { syllabusProgress: progress, reachedPage },
  });

  revalidatePath(`/me-lecturer/lectures/${lectureId}`);
  revalidatePath("/me"); // Revalidate students page so they see it
}

export default async function LecturerSyllabusProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getLecturerSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const lecture = await prisma.lecture.findUnique({
    where: { id },
    include: {
      subject: { include: { academicYear: true } },
      lectureDay: true,
    },
  });

  if (!lecture || lecture.lecturerId !== session.lecturerId) {
    redirect("/me-lecturer");
  }

  const dateStr = new Date(lecture.lectureDay.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">ما تم إنجازه في المنهج</h1>
          <p className="page-subtitle">سجل تعليقك للطلاب ورقم الصفحة التي وصلت إليها في المنهج</p>
        </div>
      </header>

      <section className="card animate-fade-in" style={{ animationDelay: "0.05s" }}>
        <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--border-radius-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>المادة</div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--accent-primary)" }}>{lecture.subject.name}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>السنة الدراسية</div>
              <div style={{ fontWeight: 600 }}>{lecture.subject.academicYear.name}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>التاريخ</div>
              <div style={{ fontWeight: 600 }}>{dateStr}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الكتاب</div>
              <div style={{ fontWeight: 600 }}>{lecture.subject.bookName || "غير محدد"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الوقت</div>
              <div style={{ fontWeight: 600 }} dir="ltr">{lecture.startTime} – {lecture.endTime}</div>
            </div>
          </div>

          {lecture.subject.targetPage && (
            <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "rgba(59, 130, 246, 0.05)", borderRadius: "var(--border-radius-sm)", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>نسبة الإنجاز في المنهج للترم</span>
                <span style={{ fontWeight: 700 }}>
                  {lecture.reachedPage ? Math.min(100, Math.round((lecture.reachedPage / lecture.subject.targetPage) * 100)) : 0}%
                </span>
              </div>
              <div style={{ width: "100%", height: "8px", backgroundColor: "var(--border-color)", borderRadius: "999px", overflow: "hidden" }}>
                <div 
                  style={{ 
                    height: "100%", 
                    backgroundColor: "var(--accent-primary)", 
                    width: `${lecture.reachedPage ? Math.min(100, Math.round((lecture.reachedPage / lecture.subject.targetPage) * 100)) : 0}%`,
                    transition: "width 0.5s ease"
                  }} 
                />
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.5rem", textAlign: "left" }}>
                الهدف: {lecture.subject.targetPage} صفحة
              </div>
            </div>
          )}
        </div>

        <form action={saveProgress} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input type="hidden" name="lectureId" value={lecture.id} />
          
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>رقم الصفحة التي تم الوصول إليها:</label>
            <input
              type="number"
              name="reachedPage"
              className="input-field"
              placeholder={lecture.subject.targetPage ? `أقصى صفحة مستهدفة: ${lecture.subject.targetPage}` : "مثال: 45"}
              defaultValue={lecture.reachedPage || ""}
              style={{ padding: "0.8rem" }}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>تعليق المنهج (يظهر للطلاب):</label>
            <textarea
              name="syllabusProgress"
              className="input-field"
              rows={4}
              placeholder="مثال: تم شرح الفصل الأول والتركيز على أهمية كذا..."
              defaultValue={lecture.syllabusProgress || ""}
              style={{ resize: "vertical", padding: "1rem", lineHeight: "1.6" }}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ padding: "0.75rem", fontSize: "1.05rem" }}>
            حفظ التعليق
          </button>
        </form>
      </section>
    </>
  );
}
