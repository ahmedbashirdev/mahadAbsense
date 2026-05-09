/**
 * Thin wrapper over the Telegram Bot HTTP API.
 *
 * We only use a couple of methods (sendMessage, setWebhook, getMe) so this
 * stays small — no SDK dependency.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

const API_BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

export type TelegramSendOptions = {
  parse_mode?: "HTML" | "MarkdownV2";
  disable_web_page_preview?: boolean;
  reply_markup?: unknown;
};

async function tg<T = unknown>(method: string, params: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (!API_BASE) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
  }
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      cache: "no-store",
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  opts?: TelegramSendOptions
) {
  return tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts?.parse_mode ?? "HTML",
    disable_web_page_preview: opts?.disable_web_page_preview ?? true,
    reply_markup: opts?.reply_markup,
  });
}

export async function setTelegramWebhook(url: string) {
  return tg("setWebhook", { url, allowed_updates: ["message", "callback_query"] });
}

export async function getTelegramWebhookInfo() {
  return tg<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_message?: string;
  }>("getWebhookInfo", {});
}

export async function deleteTelegramWebhook() {
  return tg("deleteWebhook", {});
}

export async function getBotMe() {
  return tg<{ id: number; is_bot: boolean; first_name: string; username: string }>("getMe", {});
}

/** Build the deep link the user clicks to bind their Telegram chat. */
export function getTelegramDeepLink(code: string): string | null {
  if (!BOT_USERNAME) return null;
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

/** HTML-escape user-provided strings before embedding in HTML-formatted Telegram messages. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Send the same message to many chats; returns counts per outcome. */
export async function broadcastTelegramMessage(
  chatIds: Array<string | number>,
  text: string,
  opts?: TelegramSendOptions
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  // Telegram allows ~30 messages/sec to different users. We don't worry about
  // throttling for small lists; for thousands of users we'd need a queue.
  for (const id of chatIds) {
    const r = await sendTelegramMessage(id, text, opts);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.description) errors.push(`${id}: ${r.description}`);
    }
  }
  return { sent, failed, errors };
}
