"use client"
import { useState, useTransition } from "react";
import Link from "next/link";
import { requestPasswordReset, resetPasswordWithCode } from "@/lib/passwordReset";

type UserType = "STUDENT" | "LECTURER" | "STAFF";
const TYPES: { value: UserType; label: string }[] = [
  { value: "STUDENT", label: "طالب" },
  { value: "LECTURER", label: "محاضر" },
  { value: "STAFF", label: "إداري" },
];

export default function ForgotPasswordClient() {
  const [phase, setPhase] = useState<"request" | "reset" | "done">("request");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<UserType>("STUDENT");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const doRequest = () => {
    setError(null);
    startTransition(async () => {
      const r = await requestPasswordReset(type, username);
      if (!r.ok) { setError(r.error || "حصل خطأ"); return; }
      setPhase("reset");
    });
  };

  const doReset = () => {
    setError(null);
    if (pw !== pw2) { setError("كلمتا المرور غير متطابقتين."); return; }
    startTransition(async () => {
      const r = await resetPasswordWithCode(type, username, code, pw);
      if (!r.ok) { setError(r.error || "حصل خطأ"); return; }
      setPhase("done");
    });
  };

  const box: React.CSSProperties = {
    maxWidth: 420, margin: "3rem auto", padding: "1.75rem 1.5rem",
    border: "1px solid var(--border-color)", borderRadius: "var(--border-radius)",
    backgroundColor: "var(--bg-secondary)",
  };
  const field: React.CSSProperties = { width: "100%", marginBottom: "0.85rem" };

  if (phase === "done") {
    return (
      <div style={box}>
        <h1 style={{ fontSize: "1.3rem", marginBottom: "0.75rem" }}>✅ تم تغيير كلمة المرور</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem" }}>تقدر تسجّل دخول دلوقتي بكلمة المرور الجديدة.</p>
        <Link href="/login" className="btn btn-primary" style={{ padding: "0.6rem 1.2rem" }}>الذهاب لتسجيل الدخول</Link>
      </div>
    );
  }

  return (
    <div style={box}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>🔑 نسيت كلمة المرور</h1>
      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1.25rem", lineHeight: 1.7 }}>
        {phase === "request"
          ? "هنبعتلك كود على Telegram المربوط بحسابك عشان تعيّن كلمة مرور جديدة."
          : "دخّل الكود اللي وصلك على Telegram وكلمة المرور الجديدة."}
      </p>

      {phase === "request" && (
        <>
          <label className="field-label">نوع الحساب</label>
          <select className="input-field" style={field} value={type} onChange={(e) => setType(e.target.value as UserType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="field-label">اسم المستخدم</label>
          <input className="input-field" style={field} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اسم المستخدم" />
          <button type="button" className="btn btn-primary" onClick={doRequest} disabled={pending || !username.trim()} style={{ width: "100%", padding: "0.6rem" }}>
            {pending ? "جاري الإرسال..." : "أرسل الكود على Telegram"}
          </button>
        </>
      )}

      {phase === "reset" && (
        <>
          <label className="field-label">الكود (6 أرقام)</label>
          <input className="input-field" style={field} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="••••••" />
          <label className="field-label">كلمة المرور الجديدة</label>
          <input type="password" className="input-field" style={field} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6 أحرف على الأقل" />
          <label className="field-label">تأكيد كلمة المرور</label>
          <input type="password" className="input-field" style={field} value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={doReset} disabled={pending || !code.trim() || !pw} style={{ width: "100%", padding: "0.6rem" }}>
            {pending ? "جاري الحفظ..." : "تعيين كلمة المرور"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { setPhase("request"); setError(null); }} disabled={pending} style={{ width: "100%", padding: "0.5rem", marginTop: "0.5rem" }}>
            رجوع
          </button>
        </>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.85rem" }}>{error}</p>}

      <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "1.25rem" }}>
        حسابك مش مربوط بـ Telegram؟ تواصل مع إدارة المعهد عشان يعيدوا التعيين. · <Link href="/login" style={{ color: "var(--accent-primary)" }}>تسجيل الدخول</Link>
      </p>
    </div>
  );
}
