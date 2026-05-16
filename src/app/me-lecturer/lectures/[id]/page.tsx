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

  if (!lectureId) return;

  // Ensure this lecture belongs to the lecturer
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
  });

  if (!lecture || lecture.lecturerId !== session.lecturerId) return;

  await prisma.lecture.update({
    where: { id: lectureId },
    data: { syllabusProgress: progress },
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
          <p className="page-subtitle">سجل تعليقك للطلاب عن ما تم تدريسه في هذه المحاضرة</p>
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
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الوقت</div>
              <div style={{ fontWeight: 600 }} dir="ltr">{lecture.startTime} – {lecture.endTime}</div>
            </div>
          </div>
        </div>

        <form action={saveProgress} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input type="hidden" name="lectureId" value={lecture.id} />
          
          <div className="form-group">
            <label>تعليق المنهج (يظهر للطلاب):</label>
            <textarea
              name="syllabusProgress"
              className="input-field"
              rows={5}
              placeholder="مثال: تم شرح الفصل الأول من صفحة 10 إلى 25 والتركيز على أهمية كذا..."
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
