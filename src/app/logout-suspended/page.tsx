import Link from "next/link";
import { logoutSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lands here when a logged-in student is found to have been suspended by an
 * admin. We clear their cookie and show a friendly message.
 */
export default async function LogoutSuspendedPage() {
  await logoutSession();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "1rem" }}>
      <div
        className="card animate-fade-in"
        style={{
          maxWidth: 460,
          width: "100%",
          padding: "2rem",
          textAlign: "center",
          borderColor: "var(--danger)",
          backgroundColor: "rgba(239, 68, 68, 0.06)",
        }}
      >
        <h1 style={{ color: "var(--danger)", fontWeight: 800, fontSize: "1.4rem", marginBottom: "0.75rem" }}>
          تم إيقاف حسابك
        </h1>
        <p style={{ color: "var(--text-primary)", marginBottom: "1.5rem" }}>
          إدارة المعهد أوقفت حسابك. تواصل مع الإدارة لمعرفة السبب أو إعادة التفعيل.
        </p>
        <Link href="/login" className="btn btn-primary">العودة لصفحة الدخول</Link>
      </div>
    </div>
  );
}
