import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";
import { getAbsenceWarningThreshold } from "@/lib/settings";

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

export default async function StudentHomePage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    include: { academicYear: true },
  });
  if (!student) redirect("/login");

  // Account was disabled by an admin while this session was alive — log out
  // and bounce back to login with a clear message.
  if (!student.isActive) {
    redirect("/logout-suspended");
  }

  const records = await prisma.attendance.findMany({
    where: { studentId: student.id },
    include: { subject: true },
    orderBy: { date: "desc" },
  });

  // Per-subject summary
  const summaryMap = new Map<string, SubjectSummary>();
  for (const r of records) {
    let s = summaryMap.get(r.subjectId);
    if (!s) {
      s = {
        subjectId: r.subjectId,
        subjectName: r.subject.name,
        total: 0,
        present: 0,
        absent: 0,
        excused: 0,
        attendancePct: 0,
      };
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

  const totalAbsences = records.filter((r) => r.status === "ABSENT").length;
  const threshold = await getAbsenceWarningThreshold();
  const subjectsAtRisk = summaries.filter((s) => s.absent >= threshold);
  const showWarning = subjectsAtRisk.length > 0;

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">أهلاً، {student.name}</h1>
          <p className="page-subtitle">ملخص حضورك وغيابك ومحاضراتك</p>
        </div>
        <Link href="/me/checkin" className="btn btn-primary" style={{ padding: "0.75rem 1.25rem" }}>
          📷 تسجيل حضور بـ QR
        </Link>
      </header>

      {/* Personal info card */}
      <section className="card animate-fade-in" style={{ animationDelay: "0.05s", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>بياناتي</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الاسم</div>
            <div style={{ fontWeight: 600 }}>{student.name}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>السنة الدراسية</div>
            <div style={{ fontWeight: 600 }}>{student.academicYear.name}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>اسم المستخدم</div>
            <div style={{ fontWeight: 600 }} dir="ltr">{student.username || "-"}</div>
          </div>
        </div>
      </section>

      {/* Warning banner */}
      {showWarning && (
        <section
          className="card animate-fade-in"
          style={{
            animationDelay: "0.1s",
            marginBottom: "1.5rem",
            borderColor: "var(--danger)",
            backgroundColor: "rgba(239, 68, 68, 0.06)",
          }}
        >
          <h3 style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "0.5rem" }}>
            ⚠️ تنبيه — اقتربت من حد الإنذار
          </h3>
          <p style={{ color: "var(--text-primary)", marginBottom: "0.75rem" }}>
            وصلت إلى {threshold} غياب أو أكثر في المواد التالية. الرجاء التواصل مع الإدارة:
          </p>
          <ul style={{ paddingInlineStart: "1.5rem", color: "var(--danger)", fontWeight: 600 }}>
            {subjectsAtRisk.map((s) => (
              <li key={s.subjectId}>
                {s.subjectName} — {s.absent} غياب
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top stats */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="card animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>إجمالي المحاضرات المسجلة</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-primary)" }}>{records.length}</div>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>عدد الحضور</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--success)" }}>
            {records.filter((r) => r.status === "PRESENT").length}
          </div>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>عدد الغياب</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--danger)" }}>{totalAbsences}</div>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>عدد المستأذن</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--warning)" }}>
            {records.filter((r) => r.status === "EXCUSED").length}
          </div>
        </div>
      </section>

      {/* Per-subject summary */}
      <section className="card animate-fade-in" style={{ animationDelay: "0.35s", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>ملخص المواد</h3>
        {summaries.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "1.5rem 0" }}>
            لا توجد بيانات حضور بعد.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    <td style={{ fontWeight: 600 }}>{s.subjectName}</td>
                    <td style={{ textAlign: "center" }}>{s.total}</td>
                    <td style={{ textAlign: "center", color: "var(--success)", fontWeight: 700 }}>{s.present}</td>
                    <td style={{ textAlign: "center", color: s.absent >= threshold ? "var(--danger)" : "inherit", fontWeight: 700 }}>
                      {s.absent}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--warning)", fontWeight: 700 }}>{s.excused}</td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor:
                            s.attendancePct >= 80
                              ? "rgba(16, 185, 129, 0.12)"
                              : s.attendancePct >= 60
                              ? "rgba(245, 158, 11, 0.12)"
                              : "rgba(239, 68, 68, 0.12)",
                          color:
                            s.attendancePct >= 80
                              ? "var(--success)"
                              : s.attendancePct >= 60
                              ? "var(--warning)"
                              : "var(--danger)",
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

      {/* Detailed history */}
      <section className="card animate-fade-in" style={{ animationDelay: "0.4s" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>التاريخ التفصيلي</h3>
        {records.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "1.5rem 0" }}>
            لم يتم تسجيل غيابك في أي محاضرة بعد.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    <td>{r.date.toLocaleDateString("ar-EG")}</td>
                    <td style={{ fontWeight: 600 }}>{r.subject.name}</td>
                    <td>
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
