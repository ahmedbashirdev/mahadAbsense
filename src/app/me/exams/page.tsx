import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";
import { examTypeLabel } from "@/lib/exams";
import { formatTime12 } from "@/lib/time";
import { CalendarDays, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StudentExamsPage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const student = await prisma.student.findUnique({ where: { id: session.studentId }, select: { id: true, isActive: true, yearId: true } });
  if (!student) redirect("/login");
  if (!student.isActive) redirect("/logout-suspended");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const yearExams = await prisma.exam.findMany({
    where: { subject: { yearId: student.yearId } },
    include: { subject: { select: { name: true, termType: true } } },
    orderBy: { date: "asc" },
  });
  const myExamResults = await prisma.examResult.findMany({
    where: { studentId: student.id },
    include: { exam: { include: { subject: { select: { name: true, termType: true } } } } },
  });
  const examResultsView = myExamResults
    .map((r) => ({
      id: r.id,
      subjectName: r.exam.subject.name,
      typeLabel: examTypeLabel(r.exam.subject.termType, r.exam.term, r.exam.kind),
      date: r.exam.date,
      score: r.score,
      maxScore: r.exam.maxScore,
      pct: r.exam.maxScore > 0 ? Math.round((r.score / r.exam.maxScore) * 100) : 0,
      passed: r.score >= r.exam.passScore,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">الاختبارات</h1>
          <p className="page-subtitle">مواعيد اختباراتك ونتائجك</p>
        </div>
      </header>

      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CalendarDays size={20} className="text-accent" /> جدول الاختبارات
        </h3>
        {yearExams.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.9rem" }}>مفيش اختبارات متسجّلة لسنتك لحد دلوقتي.</p>
        ) : (
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>نوع الاختبار</th>
                  <th>التاريخ</th>
                  <th>الوقت</th>
                  <th>المكان</th>
                </tr>
              </thead>
              <tbody>
                {yearExams.map((e) => {
                  const upcoming = new Date(e.date) >= today;
                  return (
                    <tr key={e.id}>
                      <td data-label="المادة" style={{ fontWeight: 600 }}>
                        {e.subject.name}
                        {upcoming && <span className="status-badge status-excused" style={{ marginInlineStart: "0.5rem", fontSize: "0.7rem" }}>قادم</span>}
                      </td>
                      <td data-label="الترم">{examTypeLabel(e.subject.termType, e.term, e.kind)}</td>
                      <td data-label="التاريخ">{new Date(e.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</td>
                      <td data-label="الوقت">{e.startTime ? `${formatTime12(e.startTime)}${e.endTime ? ` – ${formatTime12(e.endTime)}` : ""}` : "—"}</td>
                      <td data-label="المكان">{e.location || <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card animate-fade-in">
        <h3 style={{ marginBottom: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <BarChart3 size={20} className="text-accent" /> نتائج الاختبارات
        </h3>
        {examResultsView.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.9rem" }}>لسه مفيش نتايج متسجّلة.</p>
        ) : (
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>نوع الاختبار</th>
                  <th style={{ textAlign: "center" }}>الدرجة</th>
                  <th style={{ textAlign: "center" }}>النسبة</th>
                  <th style={{ textAlign: "center" }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {examResultsView.map((r) => (
                  <tr key={r.id}>
                    <td data-label="المادة" style={{ fontWeight: 600 }}>{r.subjectName}</td>
                    <td data-label="الترم">{r.typeLabel}</td>
                    <td data-label="الدرجة" style={{ textAlign: "center", fontWeight: 700 }} dir="ltr">{r.score} / {r.maxScore}</td>
                    <td data-label="النسبة" style={{ textAlign: "center" }}>{r.pct}%</td>
                    <td data-label="الحالة" style={{ textAlign: "center" }}>
                      <span className="status-badge" style={{ backgroundColor: r.passed ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: r.passed ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
                        {r.passed ? "ناجح" : "راسب"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
