"use client"
import Link from "next/link";
import { useState, useTransition } from "react";
import { signupLecturer } from "./actions";

export default function LecturerSignupClient() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await signupLecturer(formData);
      if (result?.error) setError(result.error);
      else if (result?.success) {
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "85vh", padding: "1.5rem 1rem" }}>
      <div className="card animate-fade-in" style={{ maxWidth: 480, width: "100%", padding: "2rem" }}>
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem", fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-primary)" }}>
          تقديم على حساب محاضر
        </h1>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          سجل بياناتك. حسابك هيتم مراجعته من إدارة المعهد قبل ما تقدر تسجل دخول.
        </p>

        {error && (
          <div style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", padding: "0.75rem", borderRadius: "var(--border-radius-sm)", marginBottom: "1.25rem", fontSize: "0.9rem", textAlign: "center" }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--success)", padding: "0.75rem", borderRadius: "var(--border-radius-sm)", marginBottom: "1.25rem", fontSize: "0.9rem", textAlign: "center" }}>
            تم استلام طلبك بنجاح! بمجرد موافقة الإدارة هتقدر تسجل دخول.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>الاسم الكامل</label>
            <input type="text" name="name" className="input-field" required maxLength={120} />
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
              placeholder="example: dr_ahmed"
            />
          </div>
          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>كلمة المرور</label>
            <input type="password" name="password" className="input-field" required minLength={4} />
          </div>
          <div>
            <label className="field-label" style={{ fontWeight: 600 }}>تأكيد كلمة المرور</label>
            <input type="password" name="confirmPassword" className="input-field" required minLength={4} />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem", padding: "0.75rem" }} disabled={isPending}>
            {isPending ? "جاري إرسال الطلب..." : "إرسال طلب التسجيل"}
          </button>
        </form>

        <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center" }}>
          عندك حساب؟ <Link href="/login" style={{ color: "var(--accent-primary)", fontWeight: 600 }}>سجل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
