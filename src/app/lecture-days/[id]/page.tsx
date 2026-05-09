import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import { notifyLecturersToConfirm, notifyStudentsOfSchedule } from "@/lib/telegramBroadcast";

export const dynamic = "force-dynamic";

async function addLecture(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const lectureDayId = (formData.get("lectureDayId") as string) || "";
  const subjectId = (formData.get("subjectId") as string) || "";
  const lecturerId = ((formData.get("lecturerId") as string) || "") || null;
  const startTime = ((formData.get("startTime") as string) || "").trim();
  const endTime = ((formData.get("endTime") as string) || "").trim();
  if (!lectureDayId || !subjectId || !startTime || !endTime) return;

  // Determine the next order number for the day
  const last = await prisma.lecture.findFirst({
    where: { lectureDayId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? 0) + 1;

  await prisma.lecture.create({
    data: {
      lectureDayId,
      subjectId,
      lecturerId,
      startTime,
      endTime,
      order: nextOrder,
    },
  });
  revalidatePath(`/lecture-days/${lectureDayId}`);
}

async function deleteLecture(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  if (!id) return;

  const lec = await prisma.lecture.findUnique({ where: { id }, select: { lectureDayId: true } });
  if (!lec) return;

  await prisma.lecture.delete({ where: { id } });
  revalidatePath(`/lecture-days/${lec.lectureDayId}`);
}

async function moveLecture(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  const direction = (formData.get("direction") as string) || ""; // "up" | "down"
  if (!id || (direction !== "up" && direction !== "down")) return;

  const current = await prisma.lecture.findUnique({ where: { id } });
  if (!current) return;

  const neighbour = await prisma.lecture.findFirst({
    where: {
      lectureDayId: current.lectureDayId,
      order: direction === "up" ? { lt: current.order } : { gt: current.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.lecture.update({ where: { id: current.id }, data: { order: neighbour.order } }),
    prisma.lecture.update({ where: { id: neighbour.id }, data: { order: current.order } }),
  ]);

  revalidatePath(`/lecture-days/${current.lectureDayId}`);
}

async function broadcastConfirm(formData: FormData) {
  "use server"
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  await notifyLecturersToConfirm(id);
  revalidatePath(`/lecture-days/${id}`);
}

async function broadcastSchedule(formData: FormData) {
  "use server"
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  await notifyStudentsOfSchedule(id);
  revalidatePath(`/lecture-days/${id}`);
}

async function publishDay(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  if (!id) return;

  const day = await prisma.lectureDay.findUnique({
    where: { id },
    select: { date: true, isPublished: true },
  });
  if (!day) return;

  await prisma.lectureDay.update({
    where: { id },
    data: {
      isPublished: !day.isPublished,
      publishedAt: !day.isPublished ? new Date() : null,
    },
  });
  await logActivity(
    !day.isPublished ? "نشر جدول محاضرات" : "إلغاء نشر جدول محاضرات",
    `يوم ${day.date.toLocaleDateString("ar-EG")}`
  );
  revalidatePath(`/lecture-days/${id}`);
  revalidatePath("/lecture-days");
  revalidatePath("/me");
}

export default async function LectureDayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const day = await prisma.lectureDay.findUnique({
    where: { id },
    include: {
      availabilities: {
        include: { lecturer: { select: { id: true, name: true, subjects: { select: { id: true, name: true } } } } },
        orderBy: { lecturer: { name: "asc" } },
      },
      lectures: {
        include: {
          subject: { include: { academicYear: { select: { name: true } } } },
          lecturer: { select: { id: true, name: true } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!day) notFound();

  // Lecturers who confirmed → eligible to be assigned to lectures.
  const confirmedLecturers = day.availabilities
    .filter((a) => a.status === "CONFIRMED")
    .map((a) => a.lecturer);

  // All subjects, for the "add lecture" picker.
  const allSubjects = await prisma.subject.findMany({
    include: { academicYear: { select: { name: true, order: true } } },
    orderBy: [{ academicYear: { order: "asc" } }, { name: "asc" }],
  });

  const dateStr = new Date(day.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">يوم {dateStr}</h1>
          <p className="page-subtitle">{day.label || "تفاصيل اليوم وردود المحاضرين"}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/lecture-days" className="btn btn-secondary">
            ← العودة
          </Link>
          <form action={publishDay}>
            <input type="hidden" name="id" value={day.id} />
            <button
              type="submit"
              className={day.isPublished ? "btn btn-danger" : "btn btn-primary"}
              style={{ padding: "0.5rem 1rem" }}
            >
              {day.isPublished ? "إلغاء النشر" : "✓ نشر الجدول للطلاب"}
            </button>
          </form>
        </div>
      </header>

      {/* Telegram broadcast actions */}
      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>📲 الإشعارات</h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <form action={broadcastConfirm}>
            <input type="hidden" name="id" value={day.id} />
            <button type="submit" className="btn btn-secondary" style={{ padding: "0.6rem 1rem" }}>
              📨 ابعت طلب تأكيد للمحاضرين على Telegram
            </button>
          </form>
          <form action={broadcastSchedule}>
            <input type="hidden" name="id" value={day.id} />
            <button
              type="submit"
              className={day.isPublished ? "btn btn-primary" : "btn btn-secondary"}
              style={{ padding: "0.6rem 1rem" }}
              disabled={!day.isPublished}
              title={!day.isPublished ? "انشر الجدول الأول" : ""}
            >
              📤 ابعت الجدول للطلاب على Telegram
            </button>
          </form>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
          المستخدمين اللي مش مربوطين بـ Telegram هيتم تخطيهم تلقائيًا.
        </p>
      </section>

      {/* Availability panel */}
      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>ردود المحاضرين</h3>
        {day.availabilities.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>لا يوجد محاضرين مرتبطين باليوم.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>المحاضر</th>
                  <th>الحالة</th>
                  <th>السبب (لو معتذر)</th>
                  <th>المواد</th>
                </tr>
              </thead>
              <tbody>
                {day.availabilities.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.lecturer.name}</td>
                    <td>
                      {a.status === "CONFIRMED" && <span className="status-badge status-present">✓ مؤكد</span>}
                      {a.status === "DECLINED" && <span className="status-badge status-absent">✗ معتذر</span>}
                      {a.status === "PENDING" && <span className="status-badge status-excused">⏳ بانتظار</span>}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{a.reason || "—"}</td>
                    <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {a.lecturer.subjects.map((s) => s.name).join("، ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Schedule builder */}
      <section className="card animate-fade-in">
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>جدول المحاضرات</h3>

        {day.lectures.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>لم يتم إضافة محاضرات بعد.</p>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>الترتيب</th>
                  <th>الوقت</th>
                  <th>المادة</th>
                  <th>المحاضر</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {day.lectures.map((l, idx) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 700 }}>{l.order}</td>
                    <td dir="ltr">
                      {l.startTime} – {l.endTime}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.subject.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {l.subject.academicYear.name}
                      </div>
                    </td>
                    <td>{l.lecturer ? l.lecturer.name : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        {idx > 0 && (
                          <form action={moveLecture}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }} title="فوق">
                              ↑
                            </button>
                          </form>
                        )}
                        {idx < day.lectures.length - 1 && (
                          <form action={moveLecture}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }} title="تحت">
                              ↓
                            </button>
                          </form>
                        )}
                        <SubmitWithConfirm
                          action={deleteLecture}
                          id={l.id}
                          buttonText="حذف"
                          confirmMessage="حذف هذه المحاضرة من الجدول؟"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details>
          <summary
            className="btn btn-primary"
            style={{ cursor: "pointer", padding: "0.6rem 1rem", display: "inline-flex" }}
          >
            + إضافة محاضرة جديدة
          </summary>
          <form
            action={addLecture}
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              padding: "1rem",
              border: "1px dashed var(--border-color)",
              borderRadius: "var(--border-radius-sm)",
            }}
          >
            <input type="hidden" name="lectureDayId" value={day.id} />
            <div>
              <label className="field-label">المادة</label>
              <select name="subjectId" className="input-field" required defaultValue="">
                <option value="" disabled>اختر مادة...</option>
                {allSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.academicYear.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">المحاضر (اختياري)</label>
              <select name="lecturerId" className="input-field" defaultValue="">
                <option value="">— بدون —</option>
                {confirmedLecturers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                ظاهر هنا المحاضرين اللي أكدوا حضورهم بس.
              </p>
            </div>
            <div>
              <label className="field-label">من الساعة</label>
              <input type="time" name="startTime" className="input-field" required />
            </div>
            <div>
              <label className="field-label">إلى الساعة</label>
              <input type="time" name="endTime" className="input-field" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: "end" }}>
              إضافة
            </button>
          </form>
        </details>
      </section>
    </>
  );
}
