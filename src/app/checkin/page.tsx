import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { verifyCheckinToken } from "@/lib/checkin";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const token = sp.t || "";

  const session = await getSession();

  // Anyone who's not signed in should sign in first, then come back here.
  if (!session) {
    const next = `/checkin?t=${encodeURIComponent(token)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Only students can check themselves in. Staff who scan would just see status.
  if (session.type === "STAFF") {
    return (
      <CheckinShell
        title="هذا الحساب لا يمكنه تسجيل الحضور"
        message="حساب الموظفين لا يستخدم هذه الصفحة. سجّل الدخول بحساب الطالب."
        variant="error"
      />
    );
  }

  if (!token) {
    return (
      <CheckinShell
        title="رابط غير صالح"
        message="لا يوجد رمز في الرابط. تأكد من مسح QR الصحيح."
        variant="error"
      />
    );
  }

  const payload = await verifyCheckinToken(token);
  if (!payload) {
    return (
      <CheckinShell
        title="انتهت صلاحية الرمز"
        message="الرمز انتهى أو غير صالح. اطلب من المسؤول QR جديد."
        variant="warning"
      />
    );
  }

  // Find the subject and confirm the student is in its year (so they can't
  // check in to a subject from a year they don't belong to).
  const subject = await prisma.subject.findUnique({
    where: { id: payload.subjectId },
    include: { academicYear: true },
  });
  if (!subject) {
    return (
      <CheckinShell
        title="المادة غير موجودة"
        message="المادة المرتبطة بهذا الرمز لم تعد موجودة في النظام."
        variant="error"
      />
    );
  }

 if (session.role !== 'STUDENT') {
  return new Response("Unauthorized", { status: 403 });
}

// لو بتستخدم الـ role، ممكن تحتاج تقول للـ TypeScript صراحة إن دي جلسة طالب كده:
const student = await prisma.student.findUnique({
  where: { id: (session as any).studentId }, // أو الأفضل تستخدم الطريقة الأولى
});
  if (!student) redirect("/login");

  if (student.yearId !== subject.yearId) {
    return (
      <CheckinShell
        title="هذه المادة ليست من سنتك"
        message={`هذه المادة (${subject.name}) من ${subject.academicYear.name}، وأنت في ${student.academicYear.name}.`}
        variant="error"
      />
    );
  }

  // Mark the student PRESENT for this subject + date.
  const targetDate = new Date(payload.date);
  await prisma.attendance.upsert({
    where: {
      date_studentId_subjectId: {
        date: targetDate,
        studentId: student.id,
        subjectId: subject.id,
      },
    },
    update: { status: "PRESENT" },
    create: {
      date: targetDate,
      studentId: student.id,
      subjectId: subject.id,
      status: "PRESENT",
    },
  });

  return (
    <CheckinShell
      title="تم تسجيل حضورك ✅"
      message={`${student.name} — ${subject.name} — ${new Date(payload.date).toLocaleDateString("ar-EG")}`}
      variant="success"
    />
  );
}

function CheckinShell({
  title,
  message,
  variant,
}: {
  title: string;
  message: string;
  variant: "success" | "error" | "warning";
}) {
  const colorMap = {
    success: { bg: "rgba(16, 185, 129, 0.08)", border: "var(--success)", text: "var(--success)" },
    error: { bg: "rgba(239, 68, 68, 0.08)", border: "var(--danger)", text: "var(--danger)" },
    warning: { bg: "rgba(245, 158, 11, 0.08)", border: "var(--warning)", text: "var(--warning)" },
  } as const;
  const c = colorMap[variant];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "1rem" }}>
      <div
        className="card animate-fade-in"
        style={{
          maxWidth: 480,
          width: "100%",
          padding: "2rem",
          borderColor: c.border,
          backgroundColor: c.bg,
          textAlign: "center",
        }}
      >
        <h1 style={{ color: c.text, fontWeight: 800, fontSize: "1.4rem", marginBottom: "0.75rem" }}>{title}</h1>
        <p style={{ color: "var(--text-primary)", marginBottom: "1.5rem" }}>{message}</p>
        <Link href="/me" className="btn btn-primary">العودة للوحة بياناتي</Link>
      </div>
    </div>
  );
}
