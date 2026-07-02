import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";
import { getAbsenceWarningThreshold } from "@/lib/settings";
import { formatTime12 } from "@/lib/time";
import ConnectTelegram from "@/components/ConnectTelegram";
import {
  QrCode, AlertTriangle, CalendarDays, CheckCircle2, XCircle, Clock,
  GraduationCap, ClipboardCheck, ClipboardList, BookOpen
} from "lucide-react";

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

  // Per-subject summary (used for the at-risk warning below; the full table
  // lives on /me/attendance).
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
          <QrCode size={18} /> تسجيل حضور بـ QR
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
          <h3 style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={20} /> تنبيه — اقتربت من حد الإنذار
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
          <h3 style={{ marginBottom: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CalendarDays size={20} className="text-accent" /> جدول المحاضرات القادمة
          </h3>
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
                          <td data-label="الوقت" style={{ fontWeight: 600 }}>{formatTime12(l.startTime)} – {formatTime12(l.endTime)}</td>
                          <td data-label="المادة">{l.subject.name}</td>
                          <td data-label="المحاضر">{l.lecturer ? l.lecturer.name : l.lecturerName ? l.lecturerName : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
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

      {/* Quick links to the detail pages */}
      <section
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}
      >
        <Link href="/me/attendance" className="card animate-fade-in" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 700 }}>
          <ClipboardCheck size={20} className="text-accent" /> الحضور والغياب
        </Link>
        <Link href="/me/exams" className="card animate-fade-in" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 700 }}>
          <ClipboardList size={20} className="text-accent" /> الاختبارات
        </Link>
        <Link href="/me/syllabus" className="card animate-fade-in" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 700 }}>
          <BookOpen size={20} className="text-accent" /> متابعة المنهج
        </Link>
      </section>

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
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <GraduationCap size={16} /> إجمالي المحاضرات المسجلة
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-primary)" }}>{records.length}</div>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <CheckCircle2 size={16} /> عدد الحضور
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--success)" }}>
            {records.filter((r) => r.status === "PRESENT").length}
          </div>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <XCircle size={16} /> عدد الغياب
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--danger)" }}>{totalAbsences}</div>
        </div>
        <div className="card animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Clock size={16} /> عدد المستأذن
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--warning)" }}>
            {records.filter((r) => r.status === "EXCUSED").length}
          </div>
        </div>
      </section>
    </>
  );
}
