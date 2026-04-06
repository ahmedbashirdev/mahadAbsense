"use client"
import { useTransition } from "react";
import { processLogout } from "./logoutAction";

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await processLogout();
    });
  };

  return (
    <button onClick={handleLogout} className="btn btn-secondary" style={{ marginTop: 'auto', border: '1px solid var(--danger)', color: 'var(--danger)', justifyContent: 'flex-start', backgroundColor: 'transparent' }} disabled={isPending}>
       🚪 {isPending ? 'جاري الخروج...' : 'تسجيل الخروج'}
    </button>
  );
}
