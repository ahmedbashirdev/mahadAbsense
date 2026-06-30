import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { listPersonGroups } from "@/lib/accounts";
import LinkAccountsForm from "./LinkAccountsForm";
import UnlinkButton from "./UnlinkButton";

export const dynamic = "force-dynamic";

export default async function LinkedAccountsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const groups = await listPersonGroups();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "1rem" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>الحسابات المرتبطة</h1>
      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "1.5rem" }}>
        اربط حسابات نفس الشخص (مثلاً حساب إداري + حساب طالب) عشان توصلهم إشعارات على Telegram واحد،
        ويقدر يبدّل بينهم من القائمة الجانبية من غير تسجيل خروج ودخول.
      </p>

      <LinkAccountsForm />

      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>المجموعات الحالية</h2>
      {groups.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", fontSize: "0.9rem" }}>مفيش حسابات مرتبطة لسه.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {groups.map((g) => (
            <div
              key={g.personId}
              style={{
                padding: "0.85rem 1rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--border-radius-sm)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {g.accounts.map((a) => (
                  <div key={`${a.userType}:${a.refId}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.9rem" }}>
                      <span style={{ opacity: 0.6 }}>[{a.typeLabel}]</span> <strong>{a.name}</strong>
                      {a.username ? <span style={{ color: "var(--text-tertiary)" }}> — {a.username}</span> : null}
                      {!a.isActive ? <span style={{ color: "var(--danger)" }}> (موقوف)</span> : null}
                    </span>
                    <UnlinkButton userType={a.userType} refId={a.refId} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
