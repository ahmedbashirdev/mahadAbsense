"use client"
import { useState, useTransition } from "react";
import { changeLecturerPassword } from "./actions";

export default function LecturerSettingsClient({ username }: { username: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await changeLecturerPassword(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
      }
    });
  };

  return (
    <section className="card animate-fade-in">
      <h3 style={{ marginBottom: "1.5rem", fontWeight: 700 }}>
        تغيير كلمة المرور (<span dir="ltr">{username}</span>)
      </h3>

      {error && (
        <div style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", padding: "0.75rem", borderRadius: "var(--border-radius-sm)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--success)", padding: "0.75rem", borderRadius: "var(--border-radius-sm)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          تم تغيير كلمة المرور بنجاح!
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="field-label">كلمة المرور الحالية</label>
          <input type="password" name="currentPassword" className="input-field" required />
        </div>
        <div>
          <label className="field-label">كلمة المرور الجديدة</label>
          <input type="password" name="newPassword" className="input-field" required minLength={4} />
        </div>
        <div>
          <label className="field-label">تأكيد كلمة المرور الجديدة</label>
          <input type="password" name="confirmPassword" className="input-field" required minLength={4} />
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: "0.5rem", width: "fit-content" }} disabled={isPending}>
          {isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
        </button>
      </form>
    </section>
  );
}
