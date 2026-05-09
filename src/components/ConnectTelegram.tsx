"use client"
import { useState, useTransition } from "react";
import { requestTelegramLink, disconnectTelegram } from "@/lib/telegramLink";

type Props = {
  /** Whether the current user already has a Telegram subscription. */
  isConnected: boolean;
  /** First name from Telegram for the connected greeting (optional). */
  connectedAs?: string | null;
};

export default function ConnectTelegram({ isConnected, connectedAs }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [linked, setLinked] = useState(isConnected);

  const handleConnect = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await requestTelegramLink();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Open Telegram in a new tab — works on desktop (opens Telegram app) and
      // mobile (opens the Telegram app via t.me deep link).
      window.open(result.deepLink, "_blank", "noopener,noreferrer");
      setInfo(
        "✅ افتح Telegram واضغط Start في الـ Bot. هترجع تلقائيًا لما يتربط الحساب — لو بطّأ، اقفل واعد فتح الصفحة.",
      );
      // Optimistically flip the UI; the user can refresh after Start to confirm.
      // We don't auto-refresh because that wouldn't be polite if they clicked
      // by accident.
    });
  };

  const handleDisconnect = () => {
    setError(null);
    setInfo(null);
    if (!confirm("هل تريد فصل حسابك عن Telegram؟ مش هتوصلك إشعارات بعد كده.")) return;
    startTransition(async () => {
      const result = await disconnectTelegram();
      if (!result.ok) {
        setError(result.error || "حدث خطأ");
        return;
      }
      setLinked(false);
      setInfo("تم فصل Telegram. تقدر تربطه مرة تانية في أي وقت.");
    });
  };

  return (
    <div
      style={{
        padding: "1rem",
        border: `1px solid ${linked ? "rgba(16, 185, 129, 0.5)" : "var(--border-color)"}`,
        borderRadius: "var(--border-radius-sm)",
        backgroundColor: linked ? "rgba(16, 185, 129, 0.06)" : "var(--bg-tertiary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: "0.95rem" }}>📲 إشعارات Telegram</strong>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {linked ? (
              <>تم الربط بنجاح{connectedAs ? ` (${connectedAs})` : ""} — هتوصلك التذكيرات على Telegram.</>
            ) : (
              <>اربط حسابك بـ Telegram عشان توصلك تذكيرات المحاضرات والإعلانات تلقائيًا.</>
            )}
          </div>
        </div>
        <div>
          {linked ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDisconnect}
              disabled={pending}
              style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}
            >
              {pending ? "جاري الفصل..." : "فصل"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={pending}
              style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}
            >
              {pending ? "جاري الفتح..." : "اربط Telegram"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: "0.75rem", color: "var(--danger)", fontSize: "0.85rem" }}>{error}</div>
      )}
      {info && (
        <div style={{ marginTop: "0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{info}</div>
      )}
    </div>
  );
}
