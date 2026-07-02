import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { logActivity } from "@/lib/logger";
import { formatTime12, timesOverlap } from "@/lib/time";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import Modal from "@/components/Modal";
import ClientForm from "@/components/ClientForm";
import SubmitButton from "@/components/SubmitButton";
import BroadcastButtons from "./BroadcastButtons";

export const dynamic = "force-dynamic";

/**
 * Detect a scheduling clash inside one lecture day:
 *  - the same lecturer teaching two overlapping lectures, or
 *  - the same batch (academic year) having two overlapping lectures.
 * Returns an Arabic error message, or null when there's no clash.
 */
async function findScheduleConflict(opts: {
  lectureDayId: string;
  subjectYearId: string | null;
  lecturerId: string | null;
  startTime: string;
  endTime: string;
  excludeLectureId?: string;
}): Promise<string | null> {
  const others = await prisma.lecture.findMany({
    where: {
      lectureDayId: opts.lectureDayId,
      ...(opts.excludeLectureId ? { id: { not: opts.excludeLectureId } } : {}),
    },
    select: {
      startTime: true,
      endTime: true,
      lecturerId: true,
      subject: { select: { yearId: true } },
    },
  });

  for (const o of others) {
    if (!timesOverlap(opts.startTime, opts.endTime, o.startTime, o.endTime)) continue;
    if (opts.lecturerId && o.lecturerId && o.lecturerId === opts.lecturerId) {
      return "المحاضر عنده محاضرة تانية في نفس الوقت في نفس اليوم — غيّر الوقت أو المحاضر.";
    }
    if (opts.subjectYearId && o.subject.yearId === opts.subjectYearId) {
      return "الدفعة (السنة الدراسية) عندها محاضرة تانية في نفس الوقت — الدفعة لا تحضر محاضرتين في نفس التوقيت.";
    }
  }
  return null;
}

async function addLecture(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const lectureDayId = (formData.get("lectureDayId") as string) || "";
  const subjectId = (formData.get("subjectId") as string) || "";
  const guestName = ((formData.get("lecturerName") as string) || "").trim();
  // A typed substitute name takes precedence over the dropdown selection.
  const lecturerId = guestName ? null : (((formData.get("lecturerId") as string) || "") || null);
  const lecturerName = guestName || null;
  const startTime = ((formData.get("startTime") as string) || "").trim();
  const endTime = ((formData.get("endTime") as string) || "").trim();
  if (!lectureDayId || !subjectId || !startTime || !endTime) return;

  const subj = await prisma.subject.findUnique({ where: { id: subjectId }, select: { yearId: true } });
  const conflict = await findScheduleConflict({
    lectureDayId,
    subjectYearId: subj?.yearId ?? null,
    lecturerId,
    startTime,
    endTime,
  });
  if (conflict) {
    redirect(`/lecture-days/${lectureDayId}?error=${encodeURIComponent(conflict)}`);
  }

  const last = await prisma.lecture.findFirst({
    where: { lectureDayId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? 0) + 1;

  await prisma.lecture.create({
    data: { lectureDayId, subjectId, lecturerId, lecturerName, startTime, endTime, order: nextOrder },
  });
  revalidatePath(`/lecture-days/${lectureDayId}`);
}

async function addSuggestedLectures(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const lectureDayId = (formData.get("lectureDayId") as string) || "";
  if (!lectureDayId) return;

  const subjectIds = formData.getAll("subjectId") as string[];
  const lecturerIds = formData.getAll("lecturerId") as string[];
  const startTimes = formData.getAll("startTime") as string[];
  const endTimes = formData.getAll("endTime") as string[];

  // Collect the valid rows first.
  const rows: { subjectId: string; lecturerId: string | null; startTime: string; endTime: string }[] = [];
  for (let i = 0; i < subjectIds.length; i++) {
    const subjectId = subjectIds[i];
    const startTime = (startTimes[i] || "").trim();
    const endTime = (endTimes[i] || "").trim();
    if (!subjectId || !startTime || !endTime) continue;
    rows.push({ subjectId, lecturerId: lecturerIds[i] || null, startTime, endTime });
  }

  // Map each subject to its academic year for batch-conflict detection.
  const subjects = await prisma.subject.findMany({
    where: { id: { in: rows.map((r) => r.subjectId) } },
    select: { id: true, yearId: true },
  });
  const yearBySubject = new Map(subjects.map((s) => [s.id, s.yearId]));

  // Validate the WHOLE batch before inserting anything (against existing
  // lectures AND against the other rows being added now).
  const accepted: { yearId: string | null; lecturerId: string | null; startTime: string; endTime: string }[] = [];
  for (const r of rows) {
    const yearId = yearBySubject.get(r.subjectId) ?? null;
    const dbConflict = await findScheduleConflict({
      lectureDayId,
      subjectYearId: yearId,
      lecturerId: r.lecturerId,
      startTime: r.startTime,
      endTime: r.endTime,
    });
    if (dbConflict) {
      redirect(`/lecture-days/${lectureDayId}?error=${encodeURIComponent(dbConflict)}`);
    }
    for (const a of accepted) {
      if (!timesOverlap(r.startTime, r.endTime, a.startTime, a.endTime)) continue;
      if (r.lecturerId && a.lecturerId && r.lecturerId === a.lecturerId) {
        redirect(`/lecture-days/${lectureDayId}?error=${encodeURIComponent("نفس المحاضر متكرر في نفس الوقت ضمن المواد اللي بتضيفها.")}`);
      }
      if (yearId && a.yearId === yearId) {
        redirect(`/lecture-days/${lectureDayId}?error=${encodeURIComponent("نفس الدفعة في نفس الوقت ضمن المواد اللي بتضيفها.")}`);
      }
    }
    accepted.push({ yearId, lecturerId: r.lecturerId, startTime: r.startTime, endTime: r.endTime });
  }

  // Find current max order, then insert all rows.
  const last = await prisma.lecture.findFirst({
    where: { lectureDayId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  let nextOrder = (last?.order ?? 0) + 1;
  for (const r of rows) {
    await prisma.lecture.create({
      data: { lectureDayId, subjectId: r.subjectId, lecturerId: r.lecturerId, startTime: r.startTime, endTime: r.endTime, order: nextOrder },
    });
    nextOrder++;
  }
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

async function editLecture(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  const subjectId = (formData.get("subjectId") as string) || "";
  const guestName = ((formData.get("lecturerName") as string) || "").trim();
  const lecturerId = guestName ? null : (((formData.get("lecturerId") as string) || "") || null);
  const lecturerName = guestName || null;
  const startTime = ((formData.get("startTime") as string) || "").trim();
  const endTime = ((formData.get("endTime") as string) || "").trim();
  if (!id || !subjectId || !startTime || !endTime) return;

  const lec = await prisma.lecture.findUnique({ where: { id }, select: { lectureDayId: true } });
  if (!lec) return;

  const subj = await prisma.subject.findUnique({ where: { id: subjectId }, select: { yearId: true } });
  const conflict = await findScheduleConflict({
    lectureDayId: lec.lectureDayId,
    subjectYearId: subj?.yearId ?? null,
    lecturerId,
    startTime,
    endTime,
    excludeLectureId: id,
  });
  if (conflict) {
    redirect(`/lecture-days/${lec.lectureDayId}?error=${encodeURIComponent(conflict)}`);
  }

  await prisma.lecture.update({
    where: { id },
    data: { subjectId, lecturerId, lecturerName, startTime, endTime },
  });
  await logActivity("تعديل محاضرة", "تعديل مادة/محاضر/وقت محاضرة في الجدول");
  revalidatePath(`/lecture-days/${lec.lectureDayId}`);
  revalidatePath("/me");
  redirect(`/lecture-days/${lec.lectureDayId}`);
}

async function moveLecture(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  const direction = (formData.get("direction") as string) || "";
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

export default async function LectureDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editLecture?: string; error?: string }>;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const { editLecture: editLectureId, error: errorMsg } = await searchParams;

  const day = await prisma.lectureDay.findUnique({
    where: { id },
    include: {
      availabilities: {
        include: {
          lecturer: {
            select: { id: true, name: true, subjects: { select: { id: true, name: true } } },
          },
        },
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

  // All active+approved lecturers — so the admin can assign a substitute even
  // if they didn't confirm/respond for this day (apologised, travelling, etc.).
  const allLecturers = await prisma.lecturer.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // The lecture the admin asked to edit (via ?editLecture=<id>).
  const lectureToEdit = editLectureId
    ? day.lectures.find((l) => l.id === editLectureId) || null
    : null;

  // Lecturer options for the edit modal: all active lecturers, plus the lecture's
  // current lecturer if they're no longer active/approved.
  const editLecturerOptions: { id: string; name: string }[] = [];
  if (lectureToEdit) {
    for (const l of allLecturers) editLecturerOptions.push({ id: l.id, name: l.name });
    if (lectureToEdit.lecturer && !editLecturerOptions.some((o) => o.id === lectureToEdit.lecturer!.id)) {
      editLecturerOptions.unshift({ id: lectureToEdit.lecturer.id, name: lectureToEdit.lecturer.name });
    }
  }

  // All subjects for the manual "add lecture" picker.
  const allSubjects = await prisma.subject.findMany({
    include: { academicYear: { select: { name: true, order: true } } },
    orderBy: [{ academicYear: { order: "asc" } }, { name: "asc" }],
  });

  // Build suggested lectures from what confirmed lecturers chose via Telegram.
  // Each entry = one pre-filled row in the suggestions panel.
  type Suggestion = {
    key: string;
    subjectId: string;
    subjectName: string;
    yearName: string;
    lecturerId: string;
    lecturerName: string;
  };

  const allSubjectMap = new Map(
    allSubjects.map((s) => [s.id, { name: s.name, yearName: s.academicYear.name }])
  );

  const suggestions: Suggestion[] = [];
  for (const a of day.availabilities) {
    if (a.status !== "CONFIRMED") continue;
    let plannedIds: string[] = [];
    try { plannedIds = JSON.parse(a.plannedSubjectIds || "[]"); } catch { /* skip */ }
    if (plannedIds.length === 0) continue;

    for (const subId of plannedIds) {
      const subInfo = allSubjectMap.get(subId);
      if (!subInfo) continue;
      suggestions.push({
        key: `${a.lecturerId}-${subId}`,
        subjectId: subId,
        subjectName: subInfo.name,
        yearName: subInfo.yearName,
        lecturerId: a.lecturerId,
        lecturerName: a.lecturer.name,
      });
    }
  }

  const dateStr = new Date(day.date).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      {errorMsg && (
        <div
          className="animate-fade-in"
          style={{
            marginBottom: "1rem",
            padding: "0.85rem 1rem",
            borderRadius: "var(--border-radius-sm)",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            fontWeight: 600,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}
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
        <BroadcastButtons lectureDayId={day.id} canBroadcastStudents={day.isPublished} />
      </section>

      {/* Availability panel */}
      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>ردود المحاضرين</h3>
        {day.availabilities.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>لا يوجد محاضرين مرتبطين باليوم.</p>
        ) : (
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>المحاضر</th>
                  <th>الحالة</th>
                  <th>السبب (لو معتذر)</th>
                  <th>المواد المخططة</th>
                </tr>
              </thead>
              <tbody>
                {day.availabilities.map((a) => {
                  let plannedIds: string[] = [];
                  try { plannedIds = JSON.parse(a.plannedSubjectIds || "[]"); } catch { /* skip */ }
                  const plannedSubjects = a.lecturer.subjects.filter((s) =>
                    plannedIds.includes(s.id)
                  );

                  return (
                    <tr key={a.id}>
                      <td data-label="المحاضر" style={{ fontWeight: 600 }}>{a.lecturer.name}</td>
                      <td data-label="الحالة">
                        {a.status === "CONFIRMED" && (
                          <span className="status-badge status-present">✓ مؤكد</span>
                        )}
                        {a.status === "DECLINED" && (
                          <span className="status-badge status-absent">✗ معتذر</span>
                        )}
                        {a.status === "PENDING" && (
                          <span className="status-badge status-excused">⏳ بانتظار</span>
                        )}
                      </td>
                      <td data-label="السبب" style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        {a.reason || "—"}
                      </td>
                      <td data-label="المواد المخططة" style={{ fontSize: "0.85rem" }}>
                        {a.status === "CONFIRMED" ? (
                          plannedSubjects.length > 0 ? (
                            <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>
                              {plannedSubjects.map((s) => s.name).join("، ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-tertiary)" }}>
                              لم يحدد مواد بعينها
                            </span>
                          )
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Telegram suggestions panel ─────────────────────────────────── */}
      {suggestions.length > 0 && (
        <section
          className="card animate-fade-in"
          style={{
            marginBottom: "1.5rem",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            background: "rgba(16, 185, 129, 0.04)",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
              📋 مقترحات المحاضرين من Telegram
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
              المحاضرون اختاروا هذه المواد — حدّد الأوقات واضغط "إضافة للجدول" مرة واحدة.
            </p>
          </div>

          <form action={addSuggestedLectures}>
            <input type="hidden" name="lectureDayId" value={day.id} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
              {/* Header row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 110px 110px",
                  gap: "0.6rem",
                  padding: "0 0.75rem",
                  fontSize: "0.78rem",
                  color: "var(--text-tertiary)",
                  fontWeight: 600,
                }}
              >
                <span>المادة / المحاضر</span>
                <span></span>
                <span>من الساعة</span>
                <span>إلى الساعة</span>
              </div>

              {suggestions.map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 160px 110px 110px",
                    gap: "0.6rem",
                    alignItems: "center",
                    padding: "0.55rem 0.75rem",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--border-radius-sm)",
                  }}
                >
                  <input type="hidden" name="lecturerId" value={s.lecturerId} />

                  <select
                    name="subjectId"
                    defaultValue={s.subjectId}
                    className="input-field"
                    style={{ padding: "0.4rem 0.5rem", fontSize: "0.82rem" }}
                  >
                    {allSubjects.map((su) => (
                      <option key={su.id} value={su.id}>
                        {su.name} ({su.academicYear.name})
                      </option>
                    ))}
                  </select>

                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    👨‍🏫 {s.lecturerName}
                  </div>

                  <input
                    type="time"
                    name="startTime"
                    className="input-field"
                    required
                    style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                  />
                  <input
                    type="time"
                    name="endTime"
                    className="input-field"
                    required
                    style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                  />
                </div>
              ))}
            </div>

            <button type="submit" className="btn btn-primary" style={{ padding: "0.6rem 1.4rem" }}>
              ✓ إضافة للجدول
            </button>
          </form>
        </section>
      )}

      {/* Schedule builder */}
      <section className="card animate-fade-in">
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>جدول المحاضرات</h3>

        {day.lectures.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>لم يتم إضافة محاضرات بعد.</p>
        ) : (
          <div className="table-responsive-cards" style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
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
                    <td data-label="الترتيب" style={{ fontWeight: 700 }}>{l.order}</td>
                    <td data-label="الوقت">
                      {formatTime12(l.startTime)} – {formatTime12(l.endTime)}
                    </td>
                    <td data-label="المادة">
                      <div style={{ fontWeight: 600 }}>{l.subject.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {l.subject.academicYear.name}
                      </div>
                    </td>
                    <td data-label="المحاضر">
                      {l.lecturer ? l.lecturer.name : l.lecturerName ? (
                        <span>{l.lecturerName} <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>(بديل)</span></span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td data-label="إجراءات">
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        {idx > 0 && (
                          <form action={moveLecture}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" className="btn btn-secondary"
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }} title="فوق">
                              ↑
                            </button>
                          </form>
                        )}
                        {idx < day.lectures.length - 1 && (
                          <form action={moveLecture}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" className="btn btn-secondary"
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }} title="تحت">
                              ↓
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/lecture-days/${day.id}?editLecture=${l.id}`}
                          className="btn btn-secondary"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}
                        >
                          تعديل
                        </Link>
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
            className="btn btn-secondary"
            style={{ cursor: "pointer", padding: "0.6rem 1rem", display: "inline-flex" }}
          >
            + إضافة محاضرة يدوياً
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
                {allLecturers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">أو محاضر بديل (غير مسجل)</label>
              <input type="text" name="lecturerName" className="input-field" placeholder="اكتب اسم المحاضر البديل" />
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                لو كتبت اسم هنا، هيتسجّل كبديل ويتجاهل الاختيار من القائمة.
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

      {lectureToEdit && (
        <Modal title="تعديل المحاضرة" onCloseRoute={`/lecture-days/${day.id}`}>
          <ClientForm
            action={editLecture}
            successMessage="تم تعديل المحاضرة"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <input type="hidden" name="id" value={lectureToEdit.id} />
            <div>
              <label className="field-label">المادة</label>
              <select name="subjectId" className="input-field" defaultValue={lectureToEdit.subjectId} required>
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
              <select name="lecturerId" className="input-field" defaultValue={lectureToEdit.lecturerId || ""}>
                <option value="">— بدون —</option>
                {editLecturerOptions.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">أو محاضر بديل (غير مسجل)</label>
              <input
                type="text"
                name="lecturerName"
                className="input-field"
                defaultValue={lectureToEdit.lecturerName || ""}
                placeholder="اكتب اسم المحاضر البديل"
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                لو كتبت اسم هنا، هيتسجّل كبديل ويتجاهل الاختيار من القائمة.
              </p>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">من الساعة</label>
                <input type="time" name="startTime" className="input-field" defaultValue={lectureToEdit.startTime} required />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">إلى الساعة</label>
                <input type="time" name="endTime" className="input-field" defaultValue={lectureToEdit.endTime} required />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <SubmitButton defaultText="حفظ التعديلات" style={{ flex: 1 }} />
              <Link href={`/lecture-days/${day.id}`} className="btn btn-secondary" style={{ flex: 1, textAlign: "center" }}>إلغاء</Link>
            </div>
          </ClientForm>
        </Modal>
      )}
    </>
  );
}
