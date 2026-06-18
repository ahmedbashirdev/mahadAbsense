import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import Link from "next/link";
import { getStaffSession } from "@/lib/auth";
import { logActivity } from "@/lib/logger";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";
import LecturerSubjectPicker from "./LecturerSubjectPicker";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

/**
 * Make sure every future lecture day has a PENDING availability row for the
 * given lecturer. Called whenever a new lecturer becomes "active" (created
 * pre-approved or transitioned from PENDING -> APPROVED).
 */
async function backfillFutureAvailabilities(lecturerId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const futureDays = await prisma.lectureDay.findMany({
    where: { date: { gte: today } },
    select: { id: true },
  });
  if (futureDays.length === 0) return;
  await prisma.lecturerAvailability.createMany({
    data: futureDays.map((d) => ({ lecturerId, lectureDayId: d.id, status: "PENDING" })),
    skipDuplicates: true,
  });
}

async function addLecturer(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const name = ((formData.get("name") as string) || "").trim();
  const username = ((formData.get("username") as string) || "").trim();
  const password = ((formData.get("password") as string) || "").trim();
  const subjectIds = formData.getAll("subjectIds").map(String);

  if (!name) return;
  if (username && !USERNAME_RE.test(username)) return;

  let hashed: string | null = null;
  if (password) hashed = await bcrypt.hash(password, 10);

  try {
    const created = await prisma.lecturer.create({
      data: {
        name,
        username: username || null,
        password: hashed,
        approvalStatus: "APPROVED",
        isActive: true,
        subjects: subjectIds.length
          ? { connect: subjectIds.map((id) => ({ id })) }
          : undefined,
      },
      select: { id: true },
    });
    await backfillFutureAvailabilities(created.id);
    await logActivity("إضافة محاضر", `تم إنشاء حساب المحاضر ${name}`);
  } catch {
    // Likely a unique-constraint conflict on username
  }
  revalidatePath("/lecturers");
}

async function updateLecturer(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = (formData.get("id") as string) || "";
  const name = ((formData.get("name") as string) || "").trim();
  const username = ((formData.get("username") as string) || "").trim();
  const password = ((formData.get("password") as string) || "").trim();
  const subjectIds = formData.getAll("subjectIds").map(String);

  if (!id || !name) return;
  if (username && !USERNAME_RE.test(username)) return;

  const data: {
    name: string;
    username: string | null;
    password?: string | null;
    subjects?: { set: { id: string }[] };
  } = {
    name,
    username: username || null,
    subjects: { set: subjectIds.map((sid) => ({ id: sid })) },
  };
  if (password) data.password = await bcrypt.hash(password, 10);
  if (!username) data.password = null;

  try {
    await prisma.lecturer.update({ where: { id }, data });
    await logActivity("تعديل محاضر", `تم تعديل بيانات المحاضر ${name}`);
  } catch {
    // ignore
  }
  revalidatePath("/lecturers");
  redirect("/lecturers");
}

async function toggleLecturerActive(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = formData.get("id") as string;
  const desired = formData.get("active") === "1";
  if (!id) return;

  const lec = await prisma.lecturer.findUnique({ where: { id }, select: { name: true } });
  if (!lec) return;

  await prisma.lecturer.update({ where: { id }, data: { isActive: desired } });
  await logActivity(
    desired ? "تفعيل حساب محاضر" : "إيقاف حساب محاضر",
    `${desired ? "تم تفعيل" : "تم إيقاف"} حساب المحاضر ${lec.name}`
  );
  revalidatePath("/lecturers");
  redirect(`/lecturers?edit=${id}`);
}

async function approveLecturer(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = formData.get("id") as string;
  if (!id) return;

  const lec = await prisma.lecturer.findUnique({ where: { id }, select: { name: true } });
  if (!lec) return;

  await prisma.lecturer.update({ where: { id }, data: { approvalStatus: "APPROVED" } });
  await backfillFutureAvailabilities(id);
  await logActivity("موافقة على محاضر", `تمت الموافقة على حساب المحاضر ${lec.name}`);
  revalidatePath("/lecturers");
}

async function deleteLecturer(formData: FormData) {
  "use server"
  const session = await getStaffSession();
  if (!session) return;

  const id = formData.get("id") as string;
  if (!id) return;

  const lec = await prisma.lecturer.findUnique({ where: { id }, select: { name: true } });
  if (lec) {
    await prisma.lecturer.delete({ where: { id } });
    await logActivity("حذف محاضر", `تم حذف حساب المحاضر ${lec.name}`);
  }
  revalidatePath("/lecturers");
}

export default async function LecturersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const editId = sp.edit;

  const [lecturers, allSubjects, lecturerToEdit, tgSubs] = await Promise.all([
    prisma.lecturer.findMany({
      include: { subjects: { select: { id: true, name: true, academicYear: { select: { name: true } } } } },
      orderBy: [{ approvalStatus: "asc" }, { name: "asc" }],
    }),
    prisma.subject.findMany({
      include: { academicYear: { select: { id: true, name: true, order: true } } },
      orderBy: { name: "asc" },
    }),
    editId
      ? prisma.lecturer.findUnique({
          where: { id: editId },
          include: { subjects: { select: { id: true } } },
        })
      : null,
    prisma.telegramSubscription.findMany({
      where: { userType: "LECTURER" },
      select: { refId: true, firstName: true, username: true },
    }),
  ]);

  const tgByLecturer = new Map(tgSubs.map((s) => [s.refId, s]));

  const subjectsForPicker = allSubjects.map((s) => ({
    id: s.id,
    name: s.name,
    yearId: s.academicYear.id,
    yearName: s.academicYear.name,
  }));

  const pendingCount = lecturers.filter((l) => l.approvalStatus === "PENDING").length;

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">المحاضرين</h1>
          <p className="page-subtitle">إدارة حسابات المحاضرين وربطهم بالمواد</p>
        </div>
      </header>

      {pendingCount > 0 && (
        <div
          className="card animate-fade-in"
          style={{
            marginBottom: "1rem",
            backgroundColor: "rgba(245, 158, 11, 0.06)",
            borderColor: "var(--warning)",
          }}
        >
          <strong style={{ color: "var(--warning)" }}>⏳ {pendingCount} محاضر في انتظار الموافقة</strong>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            راجع طلبات التسجيل من القائمة أسفل ووافق عليها أو احذفها.
          </p>
        </div>
      )}

      <div className="two-col-grid">
        <section className="card animate-fade-in" style={{ height: "fit-content" }}>
          <h3 style={{ marginBottom: "1.5rem", fontWeight: 700 }}>
            {lecturerToEdit ? "تعديل بيانات محاضر" : "إضافة محاضر"}
          </h3>

          {lecturerToEdit ? (
            <form action={updateLecturer} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <input type="hidden" name="id" value={lecturerToEdit.id} />
              <div>
                <label className="field-label">الاسم</label>
                <input type="text" name="name" className="input-field" defaultValue={lecturerToEdit.name} required />
              </div>
              <div>
                <label className="field-label">اسم المستخدم</label>
                <input
                  type="text"
                  name="username"
                  className="input-field"
                  defaultValue={lecturerToEdit.username || ""}
                  placeholder="example: ahmed_mohamed"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="field-label">
                  {lecturerToEdit.password
                    ? "كلمة مرور جديدة (اتركها فارغة لإبقاء الحالية)"
                    : "كلمة المرور الابتدائية"}
                </label>
                <input type="password" name="password" className="input-field" placeholder="••••••••" />
              </div>
              <div>
                <label className="field-label">المواد التي يدرسها</label>
                <LecturerSubjectPicker
                  allSubjects={subjectsForPicker}
                  selectedIds={lecturerToEdit.subjects.map((s) => s.id)}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  حفظ التعديلات
                </button>
                <Link
                  href="/lecturers"
                  className="btn btn-danger"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                  }}
                >
                  إلغاء
                </Link>
              </div>
            </form>
          ) : (
            <form action={addLecturer} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="field-label">الاسم</label>
                <input type="text" name="name" className="input-field" required />
              </div>
              <div>
                <label className="field-label">اسم المستخدم (اختياري)</label>
                <input type="text" name="username" className="input-field" placeholder="example: ahmed_mohamed" dir="ltr" />
              </div>
              <div>
                <label className="field-label">كلمة المرور (اختياري)</label>
                <input type="password" name="password" className="input-field" placeholder="••••••••" />
              </div>
              <div>
                <label className="field-label">المواد التي يدرسها</label>
                <LecturerSubjectPicker allSubjects={subjectsForPicker} selectedIds={[]} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                إضافة المحاضر
              </button>
            </form>
          )}

          {lecturerToEdit && (
            <div
              style={{
                marginTop: "1.5rem",
                paddingTop: "1.5rem",
                borderTop: "1px dashed var(--border-color)",
              }}
            >
              <h4 style={{ fontWeight: 700, marginBottom: "0.75rem" }}>حالة الحساب</h4>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  {lecturerToEdit.approvalStatus === "PENDING" ? (
                    <span className="status-badge status-excused">⏳ في انتظار الموافقة</span>
                  ) : lecturerToEdit.isActive ? (
                    <span className="status-badge status-present">✓ مفعّل</span>
                  ) : (
                    <span className="status-badge status-absent">⏸ موقوف</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {lecturerToEdit.approvalStatus === "PENDING" && (
                    <form action={approveLecturer}>
                      <input type="hidden" name="id" value={lecturerToEdit.id} />
                      <button type="submit" className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
                        موافقة
                      </button>
                    </form>
                  )}
                  {lecturerToEdit.approvalStatus === "APPROVED" && (
                    <form action={toggleLecturerActive}>
                      <input type="hidden" name="id" value={lecturerToEdit.id} />
                      <input type="hidden" name="active" value={lecturerToEdit.isActive ? "0" : "1"} />
                      <button
                        type="submit"
                        className={lecturerToEdit.isActive ? "btn btn-danger" : "btn btn-primary"}
                        style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}
                      >
                        {lecturerToEdit.isActive ? "إيقاف" : "إعادة تفعيل"}
                      </button>
                    </form>
                  )}
                  <SubmitWithConfirm
                    action={deleteLecturer}
                    id={lecturerToEdit.id}
                    confirmMessage={`هل تريد حذف حساب المحاضر ${lecturerToEdit.name}؟`}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h3 style={{ marginBottom: "1.5rem", fontWeight: 700 }}>قائمة المحاضرين</h3>
          {lecturers.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>
              لم يتم إضافة أي محاضر بعد.
            </p>
          ) : (
            <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>اسم الدخول</th>
                    <th>الحالة</th>
                    <th>Telegram</th>
                    <th>المواد</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {lecturers.map((l) => {
                    const tg = tgByLecturer.get(l.id);
                    return (
                    <tr key={l.id}>
                      <td data-label="الاسم" style={{ fontWeight: 600 }}>{l.name}</td>
                      <td data-label="اسم الدخول" style={{ color: "var(--text-secondary)" }} dir="ltr">
                        {l.username ? `@${l.username}` : "-"}
                      </td>
                      <td data-label="الحالة">
                        {l.approvalStatus === "PENDING" ? (
                          <span className="status-badge status-excused">⏳ بانتظار</span>
                        ) : l.isActive ? (
                          <span className="status-badge status-present">✓ مفعّل</span>
                        ) : (
                          <span className="status-badge status-absent">⏸ موقوف</span>
                        )}
                      </td>
                      <td data-label="Telegram">
                        {tg ? (
                          <span className="status-badge status-present" style={{ fontSize: "0.8rem" }}>
                            ✓ {tg.firstName || tg.username || "مربوط"}
                          </span>
                        ) : (
                          <span className="status-badge" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                            — غير مربوط
                          </span>
                        )}
                      </td>
                      <td data-label="المواد" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {l.subjects.length === 0
                          ? "—"
                          : l.subjects.map((s) => `${s.name} (${s.academicYear.name})`).join("، ")}
                      </td>
                      <td data-label="إجراءات">
                        <Link
                          href={`/lecturers?edit=${l.id}`}
                          className="btn"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.85rem",
                          }}
                        >
                          تعديل
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
