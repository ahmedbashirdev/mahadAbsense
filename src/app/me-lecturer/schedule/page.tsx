import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLecturerSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LecturerSchedulePage() {
  const session = await getLecturerSession();
  if (!session) redirect("/login");

  const lecturer = await prisma.lecturer.findUnique({
    where: { id: session.lecturerId },
    select: { name: true, isActive: true },
  });
  if (!lecturer) redirect("/login");
  if (!lecturer.isActive) redirect("/logout-suspended");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Lectures assigned directly to this lecturer (admin built the schedule
  // and picked them as the speaker).
  const lectures = await prisma.lecture.findMany({
    where: { lecturerId: session.lecturerId },
    include: {
      lectureDay: true,
      subject: { include: { academicYear: { select: { name: true } } } },
    },
    orderBy: [{ lectureDay: { date: "asc" } }, { order: "asc" }],
  });

  const upcoming = lectures.filter((l) => new Date(l.lectureDay.date) >= today);
  const past = lectures.filter((l) => new Date(l.lectureDay.date) < today).reverse();

  // Group by lecture day so the page shows one block per date.
  type Group = { dayId: string; date: Date; label: string | null; isPublished: boolean; items: typeof lectures };
  const groupBy = (rows: typeof lectures): Group[] => {
    const map = new Map<string, Group>();
    for (const l of rows) {
      const g = map.get(l.lectureDayId);
      if (g) g.items.push(l);
      else
        map.set(l.lectureDayId, {
          dayId: l.lectureDayId,
          date: l.lectureDay.date,
          label: l.lectureDay.label,
          isPublished: l.lectureDay.isPublished,
          items: [l],
        });
    }
    return Array.from(map.values());
  };

  const upcomingGroups = groupBy(upcoming);
  const pastGroups = groupBy(past);

  const renderGroup = (g: Group) => (
    <div key={g.dayId} className="card animate-fade-in" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <div>
          <h3 style={{ fontWeight: 800, color: "var(--accent-primary)" }}>
            {new Date(g.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h3>
          {g.label && <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{g.label}</div>}
        </div>
        {g.isPublished ? (
          <span className="status-badge status-present">✓ منشور للطلاب</span>
        ) : (
          <span className="status-badge" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
            مسودة (لم يُنشر بعد)
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>الترتيب</th>
              <th>الوقت</th>
              <th>المادة</th>
              <th>السنة</th>
            </tr>
          </thead>
          <tbody>
            {g.items.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 700 }}>{l.order}</td>
                <td dir="ltr">
                  {l.startTime} – {l.endTime}
                </td>
                <td style={{ fontWeight: 600 }}>{l.subject.name}</td>
                <td>
                  <span className="status-badge" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                    {l.subject.academicYear.name}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">جدولي</h1>
          <p className="page-subtitle">المحاضرات المسندة لك من الإدارة</p>
        </div>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem", fontWeight: 700 }}>المقبلة</h2>
        {upcomingGroups.length === 0 ? (
          <div className="card" style={{ color: "var(--text-secondary)", textAlign: "center", padding: "1.5rem 0" }}>
            لم يتم تعيين أي محاضرات لك بعد. لما الإدارة تنسق الجدول هتظهر هنا.
          </div>
        ) : (
          upcomingGroups.map(renderGroup)
        )}
      </section>

      {pastGroups.length > 0 && (
        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem", fontWeight: 700 }}>السابقة</h2>
          {pastGroups.slice(0, 10).map(renderGroup)}
        </section>
      )}
    </>
  );
}
