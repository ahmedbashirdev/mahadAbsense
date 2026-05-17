import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getLecturerSession } from "@/lib/auth";
import ConnectTelegram from "@/components/ConnectTelegram";
import { notifyAdminsOfLecturerResponse } from "@/lib/telegramBroadcast";

export const dynamic = "force-dynamic";

async function respondAvailability(formData: FormData) {
  "use server"
  const session = await getLecturerSession();
  if (!session) return;

  const availabilityId = (formData.get("availabilityId") as string) || "";
  const status = (formData.get("status") as string) || ""; // "CONFIRMED" | "DECLINED"
  const reason = ((formData.get("reason") as string) || "").trim() || null;

  if (!availabilityId || (status !== "CONFIRMED" && status !== "DECLINED")) return;

  const availability = await prisma.lecturerAvailability.findUnique({
    where: { id: availabilityId },
    select: { lecturerId: true },
  });
  if (!availability || availability.lecturerId !== session.lecturerId) return;

  await prisma.lecturerAvailability.update({
    where: { id: availabilityId },
    data: {
      status,
      reason: status === "DECLINED" ? reason : null,
      respondedAt: new Date(),
    },
  });

  // Notify admins when a lecturer confirms or declines.
  try {
    await notifyAdminsOfLecturerResponse(availabilityId);
  } catch (e) {
    console.error("notifyAdminsOfLecturerResponse failed:", e);
  }

  revalidatePath("/me-lecturer");
}

async function updateSubjectProgress(formData: FormData) {
  "use server";
  const session = await getLecturerSession();
  if (!session) return;

  const subjectId = formData.get("subjectId") as string;
  const reachedPageStr = formData.get("reachedPage") as string;
  const reachedPage = reachedPageStr ? parseInt(reachedPageStr, 10) : null;

  if (!subjectId || reachedPage === null) return;

  // Verify the lecturer teaches this subject
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: session.lecturerId },
    include: { subjects: { where: { id: subjectId } } }
  });

  if (!lecturer || lecturer.subjects.length === 0) return;

  await prisma.subject.update({
    where: { id: subjectId },
    data: { reachedPage }
  });

  revalidatePath("/me-lecturer");
  revalidatePath("/me");
}

export default async function MeLecturerPage() {
  const session = await getLecturerSession();
  if (!session) redirect("/login");

  const lecturer = await prisma.lecturer.findUnique({
    where: { id: session.lecturerId },
    include: {
      subjects: {
        include: { academicYear: { select: { name: true } } },
      },
      availabilities: {
        include: { lectureDay: true },
        orderBy: { lectureDay: { date: "asc" } },
      },
    },
  });
  if (!lecturer) redirect("/login");
  if (!lecturer.isActive) redirect("/logout-suspended");

  // Telegram subscription
  const tgSub = await prisma.telegramSubscription.findUnique({
    where: { userType_refId: { userType: "LECTURER", refId: lecturer.id } },
    select: { firstName: true, username: true },
  });

  // Split availabilities into upcoming vs past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = lecturer.availabilities.filter((a) => new Date(a.lectureDay.date) >= today);
  const past = lecturer.availabilities.filter((a) => new Date(a.lectureDay.date) < today);

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">أهلاً، {lecturer.name}</h1>
          <p className="page-subtitle">أكد حضورك للأيام القادمة</p>
        </div>
      </header>

      {/* Telegram connect */}
      <section className="animate-fade-in" style={{ animationDelay: "0.04s", marginBottom: "1rem" }}>
        <ConnectTelegram
          isConnected={!!tgSub}
          connectedAs={tgSub?.firstName || (tgSub?.username ? `@${tgSub.username}` : null)}
        />
      </section>

      {/* Personal info */}
      <section className="card animate-fade-in" style={{ animationDelay: "0.05s", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>بياناتي</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الاسم</div>
            <div style={{ fontWeight: 600 }}>{lecturer.name}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>اسم المستخدم</div>
            <div style={{ fontWeight: 600 }} dir="ltr">{lecturer.username}</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>المواد التي تدرسها</div>
          {lecturer.subjects.length === 0 ? (
            <span style={{ color: "var(--text-tertiary)" }}>لم يتم ربطك بأي مادة بعد. تواصل مع الإدارة.</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {lecturer.subjects.map((s) => (
                <span key={s.id} className="status-badge" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  {s.name} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>({s.academicYear.name})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Upcoming availability requests */}
      <section className="card animate-fade-in" style={{ animationDelay: "0.1s", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>الأيام المقبلة</h3>
        {upcoming.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.8 }}>📅</div>
            <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>لا يوجد أيام مقررة الآن</p>
            <p style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>الإدارة ستقوم بإضافة أيام المحاضرات أسبوعياً.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {upcoming.map((a) => {
              const dateStr = new Date(a.lectureDay.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    padding: "1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--border-radius-sm)",
                    backgroundColor:
                      a.status === "CONFIRMED"
                        ? "rgba(16, 185, 129, 0.06)"
                        : a.status === "DECLINED"
                        ? "rgba(239, 68, 68, 0.06)"
                        : "var(--bg-secondary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{dateStr}</div>
                      {a.lectureDay.label && (
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{a.lectureDay.label}</div>
                      )}
                    </div>
                    {a.status === "CONFIRMED" && <span className="status-badge status-present">✓ مؤكد</span>}
                    {a.status === "DECLINED" && <span className="status-badge status-absent">✗ معتذر</span>}
                    {a.status === "PENDING" && <span className="status-badge status-excused">⏳ بانتظار الرد</span>}
                  </div>

                  {a.status === "DECLINED" && a.reason && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", borderInlineStart: "3px solid var(--danger)", paddingInlineStart: "0.75rem" }}>
                      السبب: {a.reason}
                    </div>
                  )}

                  {/*
                    Always show the action buttons — a lecturer might confirm by
                    mistake and need to switch to decline, or change their mind
                    back to "متاح". The button labels reflect the current state.
                  */}
                  <form action={respondAvailability} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input type="hidden" name="availabilityId" value={a.id} />
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {a.status !== "CONFIRMED" && (
                        <button name="status" value="CONFIRMED" type="submit" className="btn btn-primary" style={{ flex: 1, padding: "0.6rem" }}>
                          ✓ أؤكد الحضور
                        </button>
                      )}
                      {a.status !== "DECLINED" && (
                        <details style={{ flex: 1 }}>
                          <summary
                            className="btn btn-outline-danger"
                            style={{ cursor: "pointer", justifyContent: "center", padding: "0.6rem", width: "100%" }}
                          >
                            {a.status === "CONFIRMED" ? "تراجع — اعتذار عن الحضور" : "اعتذار عن الحضور"}
                          </summary>
                          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <textarea
                              name="reason"
                              className="input-field"
                              placeholder="السبب (اختياري)..."
                              rows={2}
                              style={{ resize: "vertical" }}
                            />
                            <button name="status" value="DECLINED" type="submit" className="btn btn-danger">
                              تأكيد الاعتذار
                            </button>
                          </div>
                        </details>
                      )}
                      {a.status === "DECLINED" && (
                        <button name="status" value="CONFIRMED" type="submit" className="btn btn-primary" style={{ flex: 1, padding: "0.6rem" }}>
                          ↩ تراجع — أكد الحضور
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="card animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>الأيام السابقة</h3>
          <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {past.slice(0, 20).map((a) => (
                  <tr key={a.id}>
                    <td data-label="التاريخ" style={{ fontWeight: 600 }}>
                      {new Date(a.lectureDay.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
                    </td>
                    <td data-label="الحالة">
                      {a.status === "CONFIRMED" && <span className="status-badge status-present">✓ مؤكد</span>}
                      {a.status === "DECLINED" && <span className="status-badge status-absent">✗ معتذر</span>}
                      {a.status === "PENDING" && <span className="status-badge status-excused">— لم يرد</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Syllabus Tracking for Subjects */}
      {lecturer.subjects.length > 0 && (
        <section className="card animate-fade-in" style={{ animationDelay: "0.25s", marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>📖 متابعة المناهج</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            يمكنك تحديث رقم الصفحة التي وصلت إليها في كل مادة في أي وقت، وسيظهر هذا التقدم للطلاب مباشرة.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {lecturer.subjects.map((sub) => {
              const reached = sub.reachedPage || 0;
              const target = sub.targetPage || 0;
              const percent = target > 0 ? Math.min(100, Math.round((reached / target) * 100)) : 0;

              return (
                <div key={sub.id} style={{ padding: "1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--border-radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--accent-primary)", fontSize: "1.1rem" }}>{sub.name}</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>السنة: {sub.academicYear.name}</div>
                    </div>
                    {sub.bookName && (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", backgroundColor: "var(--bg-tertiary)", padding: "0.3rem 0.6rem", borderRadius: "999px", height: "fit-content" }}>
                        📚 {sub.bookName}
                      </div>
                    )}
                  </div>

                  {sub.targetPage ? (
                    <div style={{ marginBottom: "1.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                        <span>نسبة الإنجاز (الهدف: {target} صفحة)</span>
                        <span style={{ fontWeight: 700 }}>{percent}%</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "999px", overflow: "hidden" }}>
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
                  ) : (
                    <div style={{ fontSize: "0.85rem", color: "var(--warning)", marginBottom: "1rem", padding: "0.5rem", backgroundColor: "rgba(245, 158, 11, 0.1)", borderRadius: "var(--border-radius-sm)" }}>
                      ⚠️ الإدارة لم تحدد صفحة مستهدفة لهذه المادة بعد، لذلك لا يظهر شريط تقدم.
                    </div>
                  )}

                  <form action={updateSubjectProgress} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                    <input type="hidden" name="subjectId" value={sub.id} />
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>رقم الصفحة الحالية:</label>
                      <input 
                        type="number" 
                        name="reachedPage" 
                        className="input-field" 
                        defaultValue={sub.reachedPage || ""} 
                        placeholder={sub.targetPage ? `الهدف: ${sub.targetPage}` : "الصفحة الحالية"} 
                        required
                        style={{ padding: "0.6rem" }}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: "0.6rem 1rem", height: "fit-content" }}>
                      حفظ التقدم
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
