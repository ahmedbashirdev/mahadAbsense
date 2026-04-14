"use client";

import { useTransition } from "react";

export function SubmitWithConfirm({
  action,
  id,
  buttonText = "حذف",
  confirmMessage = "تأكيد الحذف؟",
  className = "btn btn-danger",
  style = { padding: "0.4rem 0.8rem", fontSize: "0.85rem" },
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  buttonText?: string;
  confirmMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [isPending, startTransition] = useTransition();

  const handleAction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (window.confirm(confirmMessage)) {
      const formData = new FormData(e.currentTarget);
      startTransition(() => {
        action(formData);
      });
    }
  };

  return (
    <form onSubmit={handleAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className} style={style} disabled={isPending}>
        {isPending ? "جاري..." : buttonText}
      </button>
    </form>
  );
}
