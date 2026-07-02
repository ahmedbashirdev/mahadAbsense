import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";
import { getAbsenceWarningThreshold } from "@/lib/settings";
import { BarChart3, History } from "lucide-react";

export const dynamic = "force-dynamic";

type SubjectSummary = {
  subjectId: string;
  subjectName: string;
  total: number;
  present: number;
  absent: number;
  excused: number;
  attendancePct: number;
};

export default async function StudentAttendancePage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const student = await prisma.student.findUnique({ where: { id: session.studentId }, select: { id: true, isActive: true } });
  if (!student) redirect("/login");
  if (!student.isActive) redirect("/logout-suspended");

  const records = await prisma.attendance.findMany({
    where: { studentId: student.id },
    include: { subject: true },
    orderBy: { date: "desc" },
  });
  const threshold = await getAbsenceWarningThreshold();

  const summaryMap = new Map<string, SubjectSummary>();
  for (const r of records) {
    let s = summaryMap.get(r.subjectId);
    if (!s) {
      s = { subjectId: r.subjectId, subjectName: r.subject.name, total: 0, present: 0, absent: 0, excused: 0, attendancePct: 0 };
      summaryMap.set(r.subjectId, s);
    }
    s.total++;
    if (r.status === "PRESENT") s.present++;
    else if (r.status === "ABSENT") s.absent++;
    else if (r.status === "EXCUSED") s.excused++;
  }
  const summaries = Array.from(summaryMap.values()).map((s) => ({
    ...s,
    attendancePct: s.total === 0 ? 0 : Math.round(((s.present + s.excused) / s.total) * 100),
  }));
  summaries.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "ar"));

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">الحضور والغياب</h1>
          <p className="page-subtitle">ملخص مشاركتك في كل مادة وسجلك التفصيلي</p>
        </div>
      </header>

      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>ملخص المواد</h3>
        {summaries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
            <BarChart3 size={48} style={{ margin: "0 auto 1rem auto", opacity: 0.6 }} />
            <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>لا توجد بيانات حضور بعد</p>
          </div>
        ) : (
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th style={{ textAlign: "center" }}>محاضرات</th>
                  <th style={{ textAlign: "center" }}>حضور</th>
                  <th style={{ textAlign: "center" }}>غياب</th>
                  <th style={{ textAlign: "center" }}>مستأذن</th>
                  <th style={{ textAlign: "center" }}>نسبة الحضور</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.subjectId}>
                    <td data-label="المادة" style={{ fontWeight: 600 }}>{s.subjectName}</td>
                    <td data-label="محاضرات" style={{ textAlign: "center" }}>{s.total}</td>
                    <td data-label="حضور" style={{ textAlign: "center", color: "var(--success)", fontWeight: 700 }}>{s.present}</td>
                    <td data-label="غياب" style={{ textAlign: "center", color: s.absent >= threshold ? "var(--danger)" : "inherit", fontWeight: 700 }}>{s.absent}</td>
                    <td data-label="مستأذن" style={{ textAlign: "center", color: "var(--warning)", fontWeight: 700 }}>{s.excused}</td>
                    <td data-label="النسبة" style={{ textAlign: "center", fontWeight: 700 }}>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: s.attendancePct >= 80 ? "rgba(16, 185, 129, 0.12)" : s.attendancePct >= 60 ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)",
                          color: s.attendancePct >= 80 ? "var(--success)" : s.attendancePct >= 60 ? "var(--warning)" : "var(--danger)",
                        }}
                      >
                        {s.attendancePct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card animate-fade-in">
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>التاريخ التفصيلي</h3>
        {records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
            <History size={48} style={{ margin: "0 auto 1rem auto", opacity: 0.6 }} />
            <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>لم يتم تسجيل غيابك في أي محاضرة بعد</p>
          </div>
        ) : (
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المادة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td data-label="التاريخ">{r.date.toLocaleDateString("ar-EG")}</td>
                    <td data-label="المادة" style={{ fontWeight: 600 }}>{r.subject.name}</td>
                    <td data-label="الحالة">
                      <span className={`status-badge status-${r.status.toLowerCase()}`}>
                        {r.status === "PRESENT" ? "حاضر" : r.status === "ABSENT" ? "غائب" : "مستأذن"}
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
