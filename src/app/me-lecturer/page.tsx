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
    </>
  );
}
