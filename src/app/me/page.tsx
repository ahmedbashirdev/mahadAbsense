import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";
import { getAbsenceWarningThreshold } from "@/lib/settings";
import ConnectTelegram from "@/components/ConnectTelegram";

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

  // Telegram subscription status
  const tgSub = await prisma.telegramSubscription.findUnique({
    where: { userType_refId: { userType: "STUDENT", refId: student.id } },
    select: { firstName: true, username: true },
  });

  // Published schedule for this student's year — upcoming days only.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const upcomingDays = await prisma.lectureDay.findMany({
    where: {
      isPublished: true,
      date: { gte: today },
      lectures: { some: { subject: { yearId: student.yearId } } },
    },
    include: {
      lectures: {
        where: { subject: { yearId: student.yearId } },
        include: {
          subject: true,
          lecturer: { select: { name: true } },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "asc" },
  });

  // Syllabus progress per subject
  const subjectsProgress = await prisma.subject.findMany({
    where: { yearId: student.yearId },
    include: {
      lectures: {
        where: {
          OR: [
            { syllabusProgress: { not: null } },
            { reachedPage: { not: null } }
          ],
          lectureDay: { date: { lt: today } }
        },
        orderBy: { lectureDay: { date: "desc" } },
        take: 1,
        include: { lecturer: { select: { name: true } }, lectureDay: true }
      }
    }
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

      {/* Telegram connect */}
      <section className="animate-fade-in" style={{ animationDelay: "0.07s", marginBottom: "1.5rem" }}>
        <ConnectTelegram
          isConnected={!!tgSub}
          connectedAs={tgSub?.firstName || (tgSub?.username ? `@${tgSub.username}` : null)}
        />
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

      {/* Upcoming schedule */}
      {upcomingDays.length > 0 && (
        <section className="card animate-fade-in" style={{ animationDelay: "0.12s", marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>📅 جدول المحاضرات القادمة</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {upcomingDays.map((d) => (
              <div key={d.id}>
                <div style={{ fontWeight: 700, marginBottom: "0.5rem", color: "var(--accent-primary)" }}>
                  {new Date(d.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
                  {d.label && <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginInlineStart: "0.5rem" }}>· {d.label}</span>}
                </div>
                <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>الوقت</th>
                        <th>المادة</th>
                        <th>المحاضر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lectures.map((l) => (
                        <tr key={l.id}>
                          <td data-label="الوقت" dir="ltr" style={{ fontWeight: 600 }}>{l.startTime} – {l.endTime}</td>
                          <td data-label="المادة">{l.subject.name}</td>
                          <td data-label="المحاضر">{l.lecturer ? l.lecturer.name : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Syllabus Progress */}
      {subjectsProgress.length > 0 && (
        <section className="card animate-fade-in" style={{ animationDelay: "0.13s", marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>📖 متابعة المناهج</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {subjectsProgress.map((sub) => {
              const latestLec = sub.lectures[0];
              const reached = latestLec?.reachedPage || 0;
              const target = sub.targetPage || 0;
              const percent = target > 0 ? Math.min(100, Math.round((reached / target) * 100)) : 0;
              
              return (
                <div key={sub.id} style={{ padding: "1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--border-radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--accent-primary)" }}>{sub.name}</div>
                    {sub.bookName && (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", backgroundColor: "var(--bg-tertiary)", padding: "0.2rem 0.5rem", borderRadius: "999px" }}>
                        📚 {sub.bookName}
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
                        <div 
                          style={{ 
                            height: "100%", 
                            backgroundColor: percent >= 100 ? "var(--success)" : "var(--accent-primary)", 
                            width: `${percent}%`,
                            transition: "width 1s ease"
                          }} 
                        />
                      </div>
                    </div>
                  )}

                  {latestLec && latestLec.syllabusProgress && (
                    <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "var(--border-radius-sm)", borderInlineStart: "3px solid var(--accent-primary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        <span>أحدث تعليق ({new Date(latestLec.lectureDay.date).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })})</span>
                        {latestLec.lecturer && <span>👨‍🏫 {latestLec.lecturer.name}</span>}
                      </div>
                      <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                        {latestLec.syllabusProgress}
                      </div>
                    </div>
                  )}
                  
                  {!latestLec && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                      لم يتم تسجيل أي تقدم بعد.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.8 }}>📊</div>
            <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>لا توجد بيانات حضور بعد</p>
            <p style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>سيتم إضافة ملخص لغيابك ومشاركتك هنا بمجرد تسجيل أول محاضرة.</p>
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
                    <td data-label="غياب" style={{ textAlign: "center", color: s.absent >= threshold ? "var(--danger)" : "inherit", fontWeight: 700 }}>
                      {s.absent}
                    </td>
                    <td data-label="مستأذن" style={{ textAlign: "center", color: "var(--warning)", fontWeight: 700 }}>{s.excused}</td>
                    <td data-label="النسبة" style={{ textAlign: "center", fontWeight: 700 }}>
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
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.8 }}>📝</div>
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
