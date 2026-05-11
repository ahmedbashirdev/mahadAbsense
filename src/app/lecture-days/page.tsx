import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";

export const dynamic = "force-dynamic";

async function addLectureDay(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const dateStr = ((formData.get("date") as string) || "").trim();
  const label = ((formData.get("label") as string) || "").trim() || null;
  if (!dateStr) return;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return;
  date.setUTCHours(0, 0, 0, 0);

  // Auto-create PENDING availability rows for every approved + active lecturer.
  const lecturers = await prisma.lecturer.findMany({
    where: { approvalStatus: "APPROVED", isActive: true },
    select: { id: true },
  });

  try {
    const day = await prisma.lectureDay.create({
      data: {
        date,
        label,
        availabilities: {
          create: lecturers.map((l) => ({ lecturerId: l.id, status: "PENDING" })),
        },
      },
    });
    await logActivity("إنشاء يوم محاضرات", `يوم ${date.toLocaleDateString("ar-EG")} أُنشئ بـ ${lecturers.length} محاضر`);
    revalidatePath("/lecture-days");
    redirect(`/lecture-days/${day.id}`);
  } catch (e) {
    // Likely a unique conflict on (date) — same day already exists.
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      // ignore — page will show the existing day
      revalidatePath("/lecture-days");
      return;
    }
    throw e;
  }
}

async function deleteLectureDay(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const day = await prisma.lectureDay.findUnique({ where: { id }, select: { date: true } });
  if (day) {
    await prisma.lectureDay.delete({ where: { id } });
    await logActivity("حذف يوم محاضرات", `يوم ${day.date.toLocaleDateString("ar-EG")}`);
  }
  revalidatePath("/lecture-days");
}

export default async function LectureDaysPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const days = await prisma.lectureDay.findMany({
    include: {
      availabilities: { select: { status: true } },
      lectures: { select: { id: true } },
    },
    orderBy: { date: "asc" },
  });

  const upcoming = days.filter((d) => new Date(d.date) >= today);
  const past = days.filter((d) => new Date(d.date) < today).reverse();

  const renderDayRow = (d: typeof days[number]) => {
    const confirmed = d.availabilities.filter((a) => a.status === "CONFIRMED").length;
    const declined = d.availabilities.filter((a) => a.status === "DECLINED").length;
    const pending = d.availabilities.filter((a) => a.status === "PENDING").length;
    return (
      <tr key={d.id}>
        <td style={{ fontWeight: 600 }}>
          {new Date(d.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </td>
        <td style={{ color: "var(--text-secondary)" }}>{d.label || "—"}</td>
        <td>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <span className="status-badge status-present">✓ {confirmed}</span>
            <span className="status-badge status-absent">✗ {declined}</span>
            <span className="status-badge status-excused">⏳ {pending}</span>
          </div>
        </td>
        <td>
          {d.isPublished ? (
            <span className="status-badge status-present">✓ منشور</span>
          ) : (
            <span className="status-badge" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              مسودة
            </span>
          )}
        </td>
        <td>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{d.lectures.length} محاضرة</span>
        </td>
        <td>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <Link
              href={`/lecture-days/${d.id}`}
              className="btn"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
            >
              فتح
            </Link>
            <SubmitWithConfirm
              action={deleteLectureDay}
              id={d.id}
              confirmMessage={`حذف يوم ${new Date(d.date).toLocaleDateString("ar-EG")}؟ هتختفي كل محاضراته وردود المحاضرين.`}
            />
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">جدول المحاضرات</h1>
          <p className="page-subtitle">أنشئ يوم محاضرات جديد، استعرض ردود المحاضرين، ورتّب الجدول</p>
        </div>
      </header>

      <div className="two-col-grid">
        <section className="card animate-fade-in" style={{ height: "fit-content" }}>
          <h3 style={{ marginBottom: "1.5rem", fontWeight: 700 }}>إنشاء يوم محاضرات</h3>
          <form action={addLectureDay} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label className="field-label">التاريخ</label>
              <input type="date" name="date" className="input-field" required />
            </div>
            <div>
              <label className="field-label">وصف اختياري (مثال: بعد صلاة الجمعة)</label>
              <input type="text" name="label" className="input-field" maxLength={120} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
              إنشاء اليوم وإرسال طلب التأكيد للمحاضرين
            </button>
            <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
              ملحوظة: لما تنشئ اليوم، كل المحاضرين المعتمدين هيشوفوه في حسابهم ويقدروا يأكدوا أو يعتذروا.
              ابعت طلب التأكيد على Telegram من صفحة اليوم نفسه (زرار 📨 ابعت طلب تأكيد للمحاضرين).
            </p>
          </form>
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>الأيام المقبلة</h3>
          {upcoming.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "1.5rem 0" }}>
              لا توجد أيام مقررة قادمة.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الوصف</th>
                    <th>الردود</th>
                    <th>الحالة</th>
                    <th>المحاضرات</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>{upcoming.map(renderDayRow)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {past.length > 0 && (
        <section className="card animate-fade-in" style={{ animationDelay: "0.3s", marginTop: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>الأيام السابقة</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الوصف</th>
                  <th>الردود</th>
                  <th>الحالة</th>
                  <th>المحاضرات</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>{past.slice(0, 20).map(renderDayRow)}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
