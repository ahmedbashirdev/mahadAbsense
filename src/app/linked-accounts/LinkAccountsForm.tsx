"use client"
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkAccountsByUsername } from "@/lib/accountActions";

type UserType = "STUDENT" | "LECTURER" | "STAFF";

const TYPES: { value: UserType; label: string }[] = [
  { value: "STAFF", label: "إداري" },
  { value: "LECTURER", label: "محاضر" },
  { value: "STUDENT", label: "طالب" },
];

export default function LinkAccountsForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [aType, setAType] = useState<UserType>("STAFF");
  const [aUser, setAUser] = useState("");
  const [bType, setBType] = useState<UserType>("STUDENT");
  const [bUser, setBUser] = useState("");

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      const r = await linkAccountsByUsername(aType, aUser, bType, bUser);
      setResult(r);
      if (r.ok) {
        setAUser("");
        setBUser("");
        router.refresh();
      }
    });
  };

  const cell = { display: "flex", gap: "0.5rem", flexWrap: "wrap" as const, alignItems: "center" };

  return (
    <div
      style={{
        padding: "1.25rem",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--border-radius)",
        backgroundColor: "var(--bg-secondary)",
        marginBottom: "1.5rem",
      }}
    >
      <h2 style={{ fontSize: "1.05rem", marginBottom: "0.75rem" }}>ربط حسابين كنفس الشخص</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={cell}>
          <span style={{ width: 70, color: "var(--text-secondary)" }}>الحساب 1:</span>
          <select value={aType} onChange={(e) => setAType(e.target.value as UserType)} className="input" style={{ width: 120 }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="input" placeholder="اسم المستخدم" value={aUser} onChange={(e) => setAUser(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        </div>

        <div style={cell}>
          <span style={{ width: 70, color: "var(--text-secondary)" }}>الحساب 2:</span>
          <select value={bType} onChange={(e) => setBType(e.target.value as UserType)} className="input" style={{ width: 120 }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="input" placeholder="اسم المستخدم" value={bUser} onChange={(e) => setBUser(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        </div>

        <div>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || !aUser.trim() || !bUser.trim()} style={{ padding: "0.55rem 1.2rem" }}>
            {pending ? "جاري الربط..." : "🔗 اربط الحسابين"}
          </button>
        </div>
      </div>

      {result && (
        <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: result.ok ? "var(--success)" : "var(--danger)" }}>
          {result.ok ? "✅ تم الربط. الإشعارات هتتجمع على نفس Telegram، والتبديل السريع بقى متاح." : `❌ ${result.error}`}
        </p>
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "0.75rem", lineHeight: 1.7 }}>
        لو أحد الحسابين مربوط بـ Telegram، الحساب التاني هيتربط بنفس الشات تلقائيًا.
      </p>
    </div>
  );
}
