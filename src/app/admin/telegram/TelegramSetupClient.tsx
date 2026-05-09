"use client"
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = {
  ok?: boolean;
  setResult?: { ok: boolean; description?: string };
  webhookInfo?: { url: string; pending_update_count: number; last_error_message?: string };
  url?: string;
  error?: string;
};

export default function TelegramSetupClient() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const router = useRouter();

  const handleRegister = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/telegram/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await res.json()) as Result;
        setResult(data);
        // Refresh the server-rendered page above so the status badge updates.
        router.refresh();
      } catch (e) {
        setResult({ error: e instanceof Error ? e.message : "Network error" });
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleRegister}
        disabled={pending}
        style={{ padding: "0.6rem 1.2rem" }}
      >
        {pending ? "جاري التسجيل..." : "🔗 تسجيل / تحديث Webhook"}
      </button>

      {result && (
        <div style={{ marginTop: "1rem" }}>
          {result.error || result.setResult?.ok === false ? (
            <div
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                color: "var(--danger)",
                padding: "0.75rem",
                borderRadius: "var(--border-radius-sm)",
                fontSize: "0.9rem",
              }}
            >
              ❌ فشل: {result.error || result.setResult?.description || "غير معروف"}
            </div>
          ) : (
            <div
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                color: "var(--success)",
                padding: "0.75rem",
                borderRadius: "var(--border-radius-sm)",
                fontSize: "0.9rem",
              }}
            >
              ✅ تم! الـ Webhook مسجّل عند Telegram على{" "}
              <code dir="ltr" style={{ fontSize: "0.8rem" }}>
                {result.url || result.webhookInfo?.url}
              </code>
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
        لازم تعمل ده مرة واحدة بعد كل deploy جديد للـ domain. اضغط الزرار وانتظر — Telegram هيبدأ يبعت رسايل المستخدمين على الـ webhook.
      </p>
    </div>
  );
}
