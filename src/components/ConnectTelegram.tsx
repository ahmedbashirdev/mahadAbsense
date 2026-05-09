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
  const [linked, setLinked] = useState(isConnected);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The bot's @username — exposed at build time via NEXT_PUBLIC if you want
  // to show it. We reconstruct it from the deep link instead.
  const botUsername = (() => {
    if (!deepLink) return null;
    const m = deepLink.match(/t\.me\/([^?]+)/);
    return m ? m[1] : null;
  })();

  const handleConnect = () => {
    setError(null);
    setDeepLink(null);
    setCode(null);
    setCopied(false);
    startTransition(async () => {
      const result = await requestTelegramLink();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeepLink(result.deepLink);
      // Extract the bare code from the deep link so the user can also paste
      // it manually as `/start <code>` in the bot if the deep link fails.
      try {
        const u = new URL(result.deepLink);
        setCode(u.searchParams.get("start"));
      } catch {
        // ignore
      }

      // Try to open Telegram automatically. If a popup blocker or missing
      // Telegram desktop swallows it, the user has the visible link below.
      window.open(result.deepLink, "_blank", "noopener,noreferrer");
    });
  };

  const handleDisconnect = () => {
    setError(null);
    setDeepLink(null);
    setCode(null);
    if (!confirm("هل تريد فصل حسابك عن Telegram؟ مش هتوصلك إشعارات بعد كده.")) return;
    startTransition(async () => {
      const result = await disconnectTelegram();
      if (!result.ok) {
        setError(result.error || "حدث خطأ");
        return;
      }
      setLinked(false);
    });
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`/start ${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — user can long-press to copy
    }
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
              {pending ? "جاري الإنشاء..." : "اربط Telegram"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: "0.75rem", color: "var(--danger)", fontSize: "0.85rem" }}>{error}</div>
      )}

      {/* After clicking connect: show the deep link + manual fallback */}
      {!linked && deepLink && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.85rem",
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--border-radius-sm)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>👇 لو Telegram ما فتحش تلقائيًا:</div>

          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ display: "inline-flex", padding: "0.6rem 1rem", marginBottom: "0.75rem", textDecoration: "none" }}
          >
            🔗 افتح Telegram على الـ Bot
          </a>

          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
            هتوصل لمحادثة مع <strong dir="ltr">@{botUsername}</strong> — اضغط زرار <strong>Start</strong> في الأسفل.
          </div>

          <details style={{ marginTop: "0.75rem" }}>
            <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              أو ابحث عن الـ Bot يدويًا
            </summary>
            <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <ol style={{ paddingInlineStart: "1.25rem" }}>
                <li>افتح Telegram</li>
                <li>
                  ابحث عن: <code dir="ltr" style={{ backgroundColor: "var(--bg-tertiary)", padding: "0.1rem 0.4rem", borderRadius: 4 }}>@{botUsername}</code>
                </li>
                <li>افتح المحادثة</li>
                <li>
                  ابعت الرسالة دي بالظبط:
                  {code && (
                    <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                      <code
                        dir="ltr"
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          padding: "0.4rem 0.7rem",
                          borderRadius: 4,
                          fontSize: "0.85rem",
                          wordBreak: "break-all",
                        }}
                      >
                        /start {code}
                      </code>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={copyCode}
                        style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                      >
                        {copied ? "✓ تم النسخ" : "📋 نسخ"}
                      </button>
                    </div>
                  )}
                </li>
              </ol>
              <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                ملاحظة: الرمز ينتهي بعد 10 دقائق. لو تأخّرت اضغط <strong>اربط Telegram</strong> تاني للحصول على رمز جديد.
              </p>
            </div>
          </details>

          <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            لما تخلص، اعمل refresh للصفحة دي عشان نتأكد إن الربط تم.
          </div>
        </div>
      )}
    </div>
  );
}
