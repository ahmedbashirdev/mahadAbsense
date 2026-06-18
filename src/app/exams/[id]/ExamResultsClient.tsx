"use client"
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Save, Users } from "lucide-react";
import { saveExamResults, sendExamResultToStudent, broadcastExamResults } from "./actions";

type Student = { id: string; name: string };
type ExistingResult = { studentId: string; score: number; notified: boolean };

type Props = {
  examId: string;
  maxScore: number;
  passScore: number;
  students: Student[];
  existing: ExistingResult[];
};

export default function ExamResultsClient({ examId, maxScore, passScore, students, existing }: Props) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [sendingAll, startSendingAll] = useTransition();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const existingMap = new Map(existing.map((e) => [e.studentId, e]));
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const s of students) {
      const e = existingMap.get(s.id);
      init[s.id] = e ? String(e.score) : "";
    }
    return init;
  });

  const save = () => {
    startSaving(async () => {
      try {
        const fd = new FormData();
        fd.append("examId", examId);
        for (const s of students) {
          fd.append("studentId", s.id);
          fd.append("score", scores[s.id] ?? "");
        }
        const r = await saveExamResults(fd);
        if (r?.error) toast.error(r.error);
        else toast.success("تم حفظ النتائج");
      } catch {
        toast.error("حدث خطأ أثناء الحفظ");
      }
      router.refresh();
    });
  };

  const sendOne = (studentId: string) => {
    setSendingId(studentId);
    startSendingAll(async () => {
      try {
        const r = await sendExamResultToStudent(examId, studentId);
        if (r?.error) toast.error(r.error);
        else toast.success("تم إرسال النتيجة للطالب");
      } catch {
        toast.error("فشل الإرسال");
      }
      setSendingId(null);
      router.refresh();
    });
  };

  const sendAll = () => {
    startSendingAll(async () => {
      try {
        const r = await broadcastExamResults(examId);
        if (r?.error) toast.error(r.error);
        else {
          const parts = [`وصل ${r.sent}`];
          if (r.skippedNoTelegram) parts.push(`${r.skippedNoTelegram} بدون Telegram`);
          if (r.failed) parts.push(`فشل ${r.failed}`);
          toast.success(`تم الإرسال — ${parts.join(" · ")}`);
        }
      } catch {
        toast.error("فشل الإرسال");
      }
      router.refresh();
    });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving} style={{ padding: "0.6rem 1.2rem" }}>
          <Save size={16} /> {saving ? "جاري الحفظ..." : "حفظ النتائج"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={sendAll} disabled={sendingAll} style={{ padding: "0.6rem 1.2rem" }}>
          <Users size={16} /> {sendingAll && !sendingId ? "جاري الإرسال..." : "إرسال كل النتائج على Telegram"}
        </button>
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
        اكتب الدرجة لكل طالب ثم اضغط <strong>حفظ النتائج</strong>. سيبان للطلاب على حساباتهم، ويمكنك إرسال إشعار Telegram لكل طالب أو للجميع. ترك الخانة فارغة يحذف نتيجة الطالب.
      </p>

      <div className="table-responsive-cards" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>الطالب</th>
              <th style={{ textAlign: "center" }}>الدرجة (من {maxScore})</th>
              <th style={{ textAlign: "center" }}>الحالة</th>
              <th style={{ textAlign: "center" }}>الإشعار</th>
              <th style={{ textAlign: "center" }}>إرسال</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const raw = scores[s.id] ?? "";
              const num = parseFloat(raw);
              const hasScore = raw.trim() !== "" && Number.isFinite(num);
              const passed = hasScore && num >= passScore;
              const existingRow = existingMap.get(s.id);
              return (
                <tr key={s.id}>
                  <td data-label="الطالب" style={{ fontWeight: 600 }}>{s.name}</td>
                  <td data-label="الدرجة" style={{ textAlign: "center" }}>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max={maxScore}
                      className="input-field"
                      style={{ width: "100px", textAlign: "center", padding: "0.4rem" }}
                      value={raw}
                      onChange={(e) => setScores((p) => ({ ...p, [s.id]: e.target.value }))}
                    />
                  </td>
                  <td data-label="الحالة" style={{ textAlign: "center" }}>
                    {hasScore ? (
                      <span className="status-badge" style={{
                        backgroundColor: passed ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color: passed ? "var(--success)" : "var(--danger)",
                        fontWeight: 700,
                      }}>
                        {passed ? "ناجح" : "راسب"}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    )}
                  </td>
                  <td data-label="الإشعار" style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {existingRow?.notified ? "✅ تم الإرسال" : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                  </td>
                  <td data-label="إرسال" style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "0.35rem 0.7rem", fontSize: "0.8rem" }}
                      disabled={!existingRow || (sendingId === s.id)}
                      title={!existingRow ? "احفظ الدرجة أولاً" : "إرسال النتيجة للطالب"}
                      onClick={() => sendOne(s.id)}
                    >
                      <Send size={13} /> {sendingId === s.id ? "..." : "إرسال"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
