"use client"
import { useEffect, useRef, useState, useTransition } from "react";
import { verifyTelegramAndContinue } from "@/lib/accountActions";

/**
 * Polls the server to detect once the user has linked their Telegram (the bot
 * binds the chat via the webhook, so the browser has to ask). On success the
 * server action re-issues the session and redirects to the dashboard.
 */
export default function ContinueAfterLink() {
  const [pending, startTransition] = useTransition();
  const [checkedOnce, setCheckedOnce] = useState(false);
  const stopped = useRef(false);

  const check = () => {
    startTransition(async () => {
      const r = await verifyTelegramAndContinue();
      // If linked, the action redirects and we never get here. Otherwise:
      if (r && r.ok === false) setCheckedOnce(true);
    });
  };

  // Check once on mount (covers the already-linked case), then poll every 4s.
  useEffect(() => {
    const poll = () => {
      if (stopped.current) return;
      startTransition(async () => {
        const r = await verifyTelegramAndContinue();
        if (r && r.ok === false) setCheckedOnce(true);
      });
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      stopped.current = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div style={{ marginTop: "1rem" }}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={check}
        disabled={pending}
        style={{ padding: "0.6rem 1.2rem", width: "100%" }}
      >
        {pending ? "بنتأكد من الربط..." : "✅ تم الربط — افتح حسابي"}
      </button>
      {checkedOnce && !pending && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.5rem", textAlign: "center" }}>
          لسه ما لقيناش الربط. اتأكد إنك ضغطت <strong>Start</strong> في البوت، وبنحاول تلقائيًا كل شوية.
        </p>
      )}
    </div>
  );
}
