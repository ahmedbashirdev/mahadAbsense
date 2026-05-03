"use client"
import Link from "next/link";
import { useState, useTransition } from "react";
import { signupStudent } from "./actions";

type Year = { id: string; name: string };

export default function SignupClient({ years }: { years: Year[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signupStudent(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "85vh", padding: "1.5rem 1rem" }}>
      <div className="card animate-fade-in" style={{ maxWidth: 520, width: "100%", padding: "2rem" }}>
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem", fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-primary)" }}>
          إنشاء حساب طالب
        </h1>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          سجّل بياناتك لتدخل على حسابك وتقدر تسجل حضورك بسرعة. لو دخلت حاجة غلط الإدارة تقدر تعدلها لاحقاً.
        </p>

        {error && (
          <div style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", padding: "0.75rem", borderRadius: "var(--border-radius-sm)", marginBottom: "1.25rem", fontSize: "0.9rem", textAlign: "center" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>الاسم الرباعي</label>
            <input type="text" name="name" className="input-field" required maxLength={120} />
          </div>

          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>رقم الجلوس / التكويد (اختياري)</label>
            <input type="text" name="identifier" className="input-field" maxLength={64} />
          </div>

          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>السنة الدراسية</label>
            <select name="yearId" className="input-field" required defaultValue="">
              <option value="" disabled>اختر السنة...</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>النوع</label>
            <div className="gender-toggle">
              <label className="gender-option">
                <input type="radio" name="gender" value="MALE" defaultChecked />
                <span>👦 ذكر</span>
              </label>
              <label className="gender-option">
                <input type="radio" name="gender" value="FEMALE" />
                <span>👧 أنثى</span>
              </label>
            </div>
          </div>

          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>اسم المستخدم</label>
            <input
              type="text"
              name="username"
              className="input-field"
              required
              dir="ltr"
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9._\-]{3,32}"
              placeholder="ahmed_2025"
            />
            <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
              حروف إنجليزية وأرقام و . _ - فقط، من 3 لـ 32 حرف.
            </p>
          </div>

          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>كلمة المرور</label>
            <input type="password" name="password" className="input-field" required minLength={4} placeholder="••••••••" />
          </div>

          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>تأكيد كلمة المرور</label>
            <input type="password" name="confirmPassword" className="input-field" required minLength={4} placeholder="••••••••" />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem", padding: "0.75rem" }} disabled={isPending}>
            {isPending ? "جاري إنشاء الحساب..." : "إنشاء الحساب وتسجيل الدخول"}
          </button>
        </form>

        <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center" }}>
          عندك حساب بالفعل؟ <Link href="/login" style={{ color: "var(--accent-primary)", fontWeight: 600 }}>سجل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
