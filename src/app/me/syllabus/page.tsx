import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";
import { BookOpen, Book, MessageSquareText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StudentSyllabusPage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const student = await prisma.student.findUnique({ where: { id: session.studentId }, select: { id: true, isActive: true, yearId: true } });
  if (!student) redirect("/login");
  if (!student.isActive) redirect("/logout-suspended");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const subjectsProgress = await prisma.subject.findMany({
    where: { yearId: student.yearId },
    include: {
      lectures: {
        where: {
          OR: [{ syllabusProgress: { not: null } }, { reachedPage: { not: null } }],
          lectureDay: { date: { lt: today } },
        },
        orderBy: { lectureDay: { date: "desc" } },
        take: 1,
        include: { lecturer: { select: { name: true } }, lectureDay: true },
      },
    },
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">متابعة المنهج</h1>
          <p className="page-subtitle">نسبة الإنجاز وآخر ما تم تغطيته في كل مادة</p>
        </div>
      </header>

      <section className="card animate-fade-in">
        <h3 style={{ marginBottom: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <BookOpen size={20} className="text-accent" /> المناهج
        </h3>
        {subjectsProgress.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.9rem" }}>مفيش مواد لسنتك لحد دلوقتي.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {subjectsProgress.map((sub) => {
              const latestLec = sub.lectures[0];
              const reached = sub.reachedPage || 0;
              const target = sub.targetPage || 0;
              const percent = target > 0 ? Math.min(100, Math.round((reached / target) * 100)) : 0;

              return (
                <div key={sub.id} style={{ padding: "1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--border-radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--accent-primary)" }}>{sub.name}</div>
                    {sub.bookName && (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", backgroundColor: "var(--bg-tertiary)", padding: "0.2rem 0.6rem", borderRadius: "999px", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Book size={14} /> {sub.bookName}
                      </div>
                    )}
                  </div>

                  {sub.targetPage && (
                    <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                        <span>نسبة الإنجاز في المنهج</span>
                        <span style={{ fontWeight: 700 }}>{percent}%</span>
                      </div>
                      <div style={{ width: "100%", height: "6px", backgroundColor: "var(--bg-tertiary)", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ height: "100%", backgroundColor: percent >= 100 ? "var(--success)" : "var(--accent-primary)", width: `${percent}%`, transition: "width 1s ease" }} />
                      </div>
                    </div>
                  )}

                  {latestLec && latestLec.syllabusProgress && (
                    <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "var(--border-radius-sm)", borderInlineStart: "3px solid var(--accent-primary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <MessageSquareText size={14} /> أحدث تعليق ({new Date(latestLec.lectureDay.date).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })})
                        </span>
                        {latestLec.lecturer && <span>👨‍🏫 {latestLec.lecturer.name}</span>}
                      </div>
                      <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                        {latestLec.syllabusProgress}
                      </div>
                    </div>
                  )}

                  {!latestLec && reached === 0 && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>لم يتم تسجيل أي تقدم بعد.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
