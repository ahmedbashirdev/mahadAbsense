"use client"
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlinkAccount } from "@/lib/accountActions";

type UserType = "STUDENT" | "LECTURER" | "STAFF";

export default function UnlinkButton({ userType, refId }: { userType: UserType; refId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!confirm("فصل الحساب ده عن المجموعة؟")) return;
    startTransition(async () => {
      await unlinkAccount({ userType, refId });
      router.refresh();
    });
  };

  return (
    <button type="button" className="btn btn-danger" onClick={onClick} disabled={pending} style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}>
      {pending ? "..." : "فصل"}
    </button>
  );
}
