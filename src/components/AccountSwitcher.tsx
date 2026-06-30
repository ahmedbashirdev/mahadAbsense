"use client"
import { useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import { switchToAccount } from "@/lib/accountActions";

type Account = {
  userType: "STUDENT" | "LECTURER" | "STAFF";
  refId: string;
  name: string;
  typeLabel: string;
};

/**
 * Quick-switch between the accounts that belong to the same person (linked by
 * an admin). Switching re-issues the session — no password needed.
 */
export default function AccountSwitcher({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!accounts || accounts.length === 0) return null;

  const go = (a: Account) => {
    setError(null);
    startTransition(async () => {
      const r = await switchToAccount(a.userType, a.refId);
      if (r && r.ok === false) setError(r.error);
    });
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <button
        type="button"
        className="sidebar-link"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        style={{ width: "100%", cursor: "pointer", background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}
      >
        <Repeat size={18} /> {pending ? "جاري التبديل..." : "بدّل الحساب"}
      </button>

      {open && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {accounts.map((a) => (
            <button
              key={`${a.userType}:${a.refId}`}
              type="button"
              className="sidebar-link"
              onClick={() => go(a)}
              disabled={pending}
              style={{ width: "100%", cursor: "pointer", fontSize: "0.85rem", justifyContent: "flex-start" }}
            >
              <span style={{ opacity: 0.7 }}>[{a.typeLabel}]</span> {a.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p style={{ fontSize: "0.8rem", color: "var(--danger)", marginTop: "0.4rem" }}>{error}</p>
      )}
    </div>
  );
}
