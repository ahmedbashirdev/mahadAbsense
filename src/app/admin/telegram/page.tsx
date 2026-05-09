import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStaffSession } from "@/lib/auth";
import { getBotMe, getTelegramWebhookInfo } from "@/lib/telegram";
import TelegramSetupClient from "./TelegramSetupClient";

export const dynamic = "force-dynamic";

export default async function TelegramSetupPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  // Fetch current bot status + webhook on render so the page reflects reality.
  const [me, webhook] = await Promise.all([getBotMe(), getTelegramWebhookInfo()]);

  // Determine the expected webhook URL the admin should be setting.
  let expectedUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  if (!expectedUrl) {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    const proto = h.get("x-forwarded-proto") || "https";
    if (host) expectedUrl = `${proto}://${host}`;
  }
  const expectedWebhook = expectedUrl ? `${expectedUrl}/api/telegram/webhook` : "";

  const botConfigured = !!me.result;
  const currentWebhookUrl = webhook.result?.url || "";
  const webhookHealthy = !!currentWebhookUrl && currentWebhookUrl === expectedWebhook;

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">إعداد Telegram</h1>
          <p className="page-subtitle">ربط الـ Bot بهذا الـ deployment وتسجيل الـ webhook</p>
        </div>
      </header>

      <section className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>1. حالة الـ Bot</h3>
        {!botConfigured ? (
          <div style={{ color: "var(--danger)" }}>
            ❌ لم يتم تعيين <code>TELEGRAM_BOT_TOKEN</code> أو القيمة غير صحيحة. أضفها من Vercel → Settings → Environment Variables ثم اعمل redeploy.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>اسم الـ Bot</div>
              <div style={{ fontWeight: 600 }}>{me.result?.first_name || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Username</div>
              <div style={{ fontWeight: 600 }} dir="ltr">@{me.result?.username || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Bot ID</div>
              <div style={{ fontWeight: 600 }}>{me.result?.id || "-"}</div>
            </div>
          </div>
        )}
      </section>

      <section className="card animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <h3 style={{ marginBottom: "1rem", fontWeight: 700 }}>2. الـ Webhook</h3>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الـ URL المتوقع</div>
          <code
            dir="ltr"
            style={{
              display: "block",
              marginTop: "0.25rem",
              padding: "0.5rem",
              backgroundColor: "var(--bg-tertiary)",
              borderRadius: "var(--border-radius-sm)",
              fontSize: "0.85rem",
              wordBreak: "break-all",
            }}
          >
            {expectedWebhook || "(غير قادر على تحديد الـ URL)"}
          </code>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>الـ URL المسجّل حاليًا في Telegram</div>
          <code
            dir="ltr"
            style={{
              display: "block",
              marginTop: "0.25rem",
              padding: "0.5rem",
              backgroundColor: webhookHealthy ? "rgba(16, 185, 129, 0.1)" : "var(--bg-tertiary)",
              borderRadius: "var(--border-radius-sm)",
              fontSize: "0.85rem",
              wordBreak: "break-all",
            }}
          >
            {currentWebhookUrl || "(غير مسجّل بعد)"}
          </code>
        </div>

        {webhook.result?.last_error_message && (
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              color: "var(--danger)",
              padding: "0.75rem",
              borderRadius: "var(--border-radius-sm)",
              marginBottom: "1rem",
              fontSize: "0.85rem",
            }}
          >
            آخر خطأ من Telegram: {webhook.result.last_error_message}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          {webhookHealthy ? (
            <span className="status-badge status-present">✓ متصل ويعمل</span>
          ) : currentWebhookUrl ? (
            <span className="status-badge status-excused">⚠️ مسجل لـ URL مختلف</span>
          ) : (
            <span className="status-badge status-absent">⏸ غير مسجّل</span>
          )}
          {webhook.result && (
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              تحديثات معلّقة: {webhook.result.pending_update_count}
            </span>
          )}
        </div>

        <TelegramSetupClient />
      </section>
    </>
  );
}
