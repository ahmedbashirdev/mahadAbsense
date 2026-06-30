import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionAccountRef, accountTypeLabel } from "@/lib/accounts";
import ConnectTelegram from "@/components/ConnectTelegram";
import ContinueAfterLink from "./ContinueAfterLink";

export const dynamic = "force-dynamic";

export default async function LinkTelegramPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ref = sessionAccountRef(session);
  const sub = await prisma.telegramSubscription.findUnique({
    where: { userType_refId: { userType: ref.userType, refId: ref.refId } },
    select: { firstName: true },
  });
  const isConnected = !!sub;

  return (
    <div style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <div
        style={{
          padding: "1.5rem",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--border-radius)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <h1 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>📲 اربط Telegram لتفعيل حسابك</h1>
        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "1.25rem" }}>
          عشان تقدر تستخدم حسابك (<strong>{accountTypeLabel(ref.userType)}</strong> — {session.username})، لازم
          تربطه بـ Telegram الأول. ده بيضمن وصول كل الإشعارات والتذكيرات المهمة ليك في مكان واحد.
        </p>

        <ConnectTelegram isConnected={isConnected} connectedAs={sub?.firstName ?? null} />

        <ContinueAfterLink />

        <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "1.25rem", lineHeight: 1.7 }}>
          بعد ما تضغط <strong>Start</strong> في البوت، هندخّلك حسابك تلقائيًا خلال ثواني — أو اضغط الزر فوق.
        </p>
      </div>
    </div>
  );
}
