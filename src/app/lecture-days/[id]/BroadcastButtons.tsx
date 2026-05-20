"use client"
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyLecturersToConfirm, notifyStudentsOfSchedule } from "@/lib/telegramBroadcast";

type Result = {
  ok?: boolean;
  sent?: number;
  skipped?: number;
  skippedNoTelegram?: number;
  skippedConfirmed?: number;
  failed?: number;
  error?: string;
};

type Props = {
  lectureDayId: string;
  canBroadcastStudents: boolean;
};

export default function BroadcastButtons({ lectureDayId, canBroadcastStudents }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [action, setAction] = useState<"confirm" | "schedule" | null>(null);
  const router = useRouter();

  const runConfirm = () => {
    setResult(null);
    setAction("confirm");
    startTransition(async () => {
      try {
        const r = (await notifyLecturersToConfirm(lectureDayId)) as Result | undefined;
        setResult(r || { error: "السيرفر ما رجعش رد" });
      } catch (e) {
        setResult({ error: e instanceof Error ? e.message : "خطأ غير متوقع" });
      }
      router.refresh();
    });
  };

  const runSchedule = () => {
    setResult(null);
    setAction("schedule");
    startTransition(async () => {
      try {
        const r = (await notifyStudentsOfSchedule(lectureDayId)) as Result | undefined;
        setResult(r || { error: "السيرفر ما رجعش رد" });
      } catch (e) {
        setResult({ error: e instanceof Error ? e.message : "خطأ غير متوقع" });
      }
      router.refresh();
    });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={runConfirm}
          disabled={pending}
          style={{ padding: "0.6rem 1rem" }}
        >
          {pending && action === "confirm" ? "جاري الإرسال..." : "📨 ابعت طلب تأكيد للمحاضرين على Telegram"}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={runSchedule}
          disabled={pending}
          style={{ padding: "0.6rem 1rem" }}
        >
          {pending && action === "schedule" ? "جاري الإرسال..." : "📤 ابعت الجدول للطلاب على Telegram"}
        </button>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
        المستخدمين اللي مش مربوطين بـ Telegram هيتم تخطيهم تلقائيًا.
        {!canBroadcastStudents && (
          <>
            <br />
            ⚠️ الجدول لسه مش منشور — لازم تضغط <strong>✓ نشر الجدول للطلاب</strong> فوق أولاً قبل ما تبعت.
          </>
        )}
      </p>

      {result && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            borderRadius: "var(--border-radius-sm)",
            backgroundColor: result.error
              ? "rgba(239, 68, 68, 0.08)"
              : "rgba(16, 185, 129, 0.08)",
            color: result.error ? "var(--danger)" : "var(--success)",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          {result.error ? (
            <>❌ فشل: {result.error}</>
          ) : (
            <>
              ✅ تم.
              {typeof result.sent === "number" && <> · أُرسل لـ <strong>{result.sent}</strong></>}
              {typeof result.skippedConfirmed === "number" && result.skippedConfirmed > 0 && (
                <> · <strong>{result.skippedConfirmed}</strong> ردّوا بالفعل (مؤكد/معتذر)</>
              )}
              {typeof result.skippedNoTelegram === "number" && result.skippedNoTelegram > 0 && (
                <> · <strong>{result.skippedNoTelegram}</strong> غير مربوطين بـ Telegram</>
              )}
              {/* fallback for old API shape */}
              {typeof result.skippedConfirmed === "undefined" && typeof result.skipped === "number" && result.skipped > 0 && (
                <> · تم تخطي <strong>{result.skipped}</strong></>
              )}
              {typeof result.failed === "number" && result.failed > 0 && (
                <> · فشل <strong>{result.failed}</strong></>
              )}
              {result.sent === 0 && !result.skippedNoTelegram && !result.skippedConfirmed && !result.failed && (
                <> — مفيش مستلمين، تأكد إن المستخدمين ربطوا حساباتهم بـ Telegram.</>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
