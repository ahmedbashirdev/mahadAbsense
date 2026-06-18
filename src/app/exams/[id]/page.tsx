import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { getStudentAccess } from "@/lib/access";
import ExamResultsClient from "./ExamResultsClient";

export const dynamic = "force-dynamic";

function termLabel(term: number) {
  return term === 2 ? "الترم الثاني" : "الترم الأول";
}

export default async function ExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const access = await getStudentAccess();
  if (!access) redirect("/login");

  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      subject: { include: { academicYear: { select: { id: true, name: true } } } },
      results: { select: { studentId: true, score: true, notifiedAt: true } },
    },
  });
  if (!exam) notFound();

  const students = await prisma.student.findMany({
    where: { yearId: exam.subject.yearId, gender: { in: access.allowedGenders } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const existing = exam.results.map((r) => ({
    studentId: r.studentId,
    score: r.score,
    notified: !!r.notifiedAt,
  }));

  const dateStr = new Date(exam.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">نتائج: {exam.subject.name}</h1>
          <p className="page-subtitle">
            {exam.subject.academicYear.name} · {termLabel(exam.term)} · {dateStr}
            {exam.title ? ` · ${exam.title}` : ""}
          </p>
        </div>
        <Link href="/exams" className="btn btn-secondary">← العودة للاختبارات</Link>
      </header>

      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", fontSize: "0.9rem" }}>
          <div><span style={{ color: "var(--text-secondary)" }}>النهاية العظمى:</span> <strong>{exam.maxScore}</strong></div>
          <div><span style={{ color: "var(--text-secondary)" }}>درجة النجاح:</span> <strong>{exam.passScore}</strong></div>
          {exam.location && <div><span style={{ color: "var(--text-secondary)" }}>المكان:</span> <strong>{exam.location}</strong></div>}
          <div><span style={{ color: "var(--text-secondary)" }}>عدد الطلاب:</span> <strong>{students.length}</strong></div>
        </div>
      </section>

      <section className="card animate-fade-in">
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>رصد الدرجات</h3>
        {students.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>
            لا يوجد طلاب في هذه السنة الدراسية.
          </p>
        ) : (
          <ExamResultsClient
            examId={exam.id}
            maxScore={exam.maxScore}
            passScore={exam.passScore}
            students={students}
            existing={existing}
          />
        )}
      </section>
    </>
  );
}
