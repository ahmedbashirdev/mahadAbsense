"use client"
import { useState, useTransition } from "react";
import Link from "next/link";
import { loginAction } from "./actions";

export default function LoginClient({ next }: { next: string }) {
  const [accountType, setAccountType] = useState<"STAFF" | "STUDENT" | "LECTURER">("STUDENT");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("accountType", accountType);
    if (next) formData.set("next", next);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '1rem' }}>
      <div className="card animate-fade-in" style={{ maxWidth: '440px', width: '100%', padding: '2.5rem' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
          المعهد العلمي
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
          تسجيل الدخول
        </p>

        {/*
          Render the tabs as radio inputs wrapped in labels. Radio change events
          fire reliably on every browser and touch device, unlike <button>
          onClick which gets swallowed by some Android browsers when the tap is
          short or interrupted (the user reported a focus-ring without an
          actual state change).
        */}
        <div className="login-tabs" role="tablist">
          <label className={`login-tab ${accountType === "STUDENT" ? "active" : ""}`}>
            <input
              type="radio"
              name="account-type"
              value="STUDENT"
              checked={accountType === "STUDENT"}
              onChange={() => setAccountType("STUDENT")}
              className="login-tab-input"
            />
            <span>🧑‍🎓 طالب</span>
          </label>
          <label className={`login-tab ${accountType === "LECTURER" ? "active" : ""}`}>
            <input
              type="radio"
              name="account-type"
              value="LECTURER"
              checked={accountType === "LECTURER"}
              onChange={() => setAccountType("LECTURER")}
              className="login-tab-input"
            />
            <span>👨‍🏫 محاضر</span>
          </label>
          <label className={`login-tab ${accountType === "STAFF" ? "active" : ""}`}>
            <input
              type="radio"
              name="account-type"
              value="STAFF"
              checked={accountType === "STAFF"}
              onChange={() => setAccountType("STAFF")}
              className="login-tab-input"
            />
            <span>👤 إداري</span>
          </label>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.75rem', borderRadius: 'var(--border-radius-sm)', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>اسم المستخدم</label>
            <input
              type="text"
              name="username"
              className="input-field"
              required
              placeholder={
                accountType === "STUDENT"
                  ? "اسم المستخدم بتاع الطالب"
                  : accountType === "LECTURER"
                  ? "اسم المستخدم بتاع المحاضر"
                  : "مثال: admin"
              }
            />
          </div>
          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>كلمة المرور</label>
            <input type="password" name="password" className="input-field" required placeholder="••••••••" />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }} disabled={isPending}>
            {isPending ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>

        {accountType === "STAFF" && (
          <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            إذا كان النظام جديداً بالكامل، يمكنك الدخول بـ (admin) وكلمة مرور (admin).
          </p>
        )}
        {accountType === "STUDENT" && (
          <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            ماعندكش حساب بعد؟ <Link href="/signup" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>سجل بنفسك</Link>
          </p>
        )}
        {accountType === "LECTURER" && (
          <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            محاضر جديد؟ <Link href="/signup-lecturer" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>قدم على حساب</Link>
          </p>
        )}
      </div>
    </div>
  );
}
