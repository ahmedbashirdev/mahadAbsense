"use client"
import { useTransition, useState } from "react";

type Candidate = {
  id: string;
  name: string;
  username: string | null;
  createdAt: Date;
};

type Props = {
  destId: string;
  candidates: Candidate[];
  action: (formData: FormData) => Promise<void>;
};

/**
 * Wraps the merge form so we can show a native confirm dialog before the
 * destructive merge action runs.
 */
export default function MergeStudentForm({ destId, candidates, action }: Props) {
  const [sourceId, setSourceId] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!sourceId) return;

    const chosen = candidates.find((c) => c.id === sourceId);
    const ok = window.confirm(
      `سيتم نقل غياب "${chosen?.name || "السجل المحدد"}" إلى السجل الحالي ثم حذف السجل الآخر نهائياً.\n\nهل تريد المتابعة؟`
    );
    if (!ok) return;

    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <input type="hidden" name="destId" value={destId} />
      <select
        name="sourceId"
        className="input-field"
        required
        value={sourceId}
        onChange={(e) => setSourceId(e.target.value)}
      >
        <option value="" disabled>اختر السجل الآخر...</option>
        {candidates.map((c) => {
          const created = new Date(c.createdAt).toLocaleDateString("ar-EG");
          return (
            <option key={c.id} value={c.id}>
              {c.name}{c.username ? ` — @${c.username}` : " — (بدون حساب)"} · {created}
            </option>
          );
        })}
      </select>
      <button
        type="submit"
        className="btn btn-danger"
        style={{ alignSelf: "flex-start" }}
        disabled={!sourceId || isPending}
      >
        {isPending ? "جاري الدمج..." : "دمج السجل المحدد في الحالي"}
      </button>
    </form>
  );
}
