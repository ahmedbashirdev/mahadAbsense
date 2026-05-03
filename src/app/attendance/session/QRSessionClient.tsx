"use client"
import { useEffect, useMemo, useRef, useState } from "react";
import SubjectPicker, { type SubjectOption } from "@/components/SubjectPicker";
import { generateCheckinUrl, getSessionStatus } from "./actions";
import { QR_ROTATE_SECONDS } from "@/lib/checkin";

type Year = {
  id: string;
  name: string;
  order: number;
  subjects: { id: string; name: string; termType: string; yearId: string }[];
};

type StudentStatus = { id: string; name: string; status: string };

export default function QRSessionClient({ initialYears }: { initialYears: Year[] }) {
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_ROTATE_SECONDS);
  const [students, setStudents] = useState<StudentStatus[]>([]);

  // Build a flat subject list for the picker, with year color badges.
  const subjectOptions: SubjectOption[] = useMemo(() => {
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
    const opts: SubjectOption[] = [];
    initialYears.forEach((y, idx) => {
      const color = palette[idx % palette.length];
      y.subjects.forEach((s) => {
        opts.push({ id: s.id, name: s.name, yearId: y.id, yearName: y.name, yearColor: color });
      });
    });
    return opts;
  }, [initialYears]);

  // Refresh the QR + attendance status. We pull both on every tick.
  const refresh = async (subjectId: string, date: string) => {
    const res = await generateCheckinUrl(subjectId, date);
    if ("error" in res) {
      setQrSvg(null);
      setQrUrl(null);
      return;
    }
    setQrSvg(res.svg);
    setQrUrl(res.url);
    setSecondsLeft(res.ttl);

    const status = await getSessionStatus(subjectId, date);
    if (!("error" in status)) {
      setStudents(status.students);
    }
  };

  // Manage the timer + rotation lifecycle.
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clean up any old timers.
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }

    if (!selectedSubjectId || !selectedDate) {
      // Defer the reset so we don't trip react-hooks/set-state-in-effect.
      Promise.resolve().then(() => {
        setQrSvg(null);
        setQrUrl(null);
        setStudents([]);
      });
      return;
    }

    // Defer the first refresh so we don't run setState synchronously in this
    // effect body (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => refresh(selectedSubjectId, selectedDate));

    // Re-generate the QR every QR_ROTATE_SECONDS.
    intervalRef.current = setInterval(() => {
      refresh(selectedSubjectId, selectedDate);
    }, QR_ROTATE_SECONDS * 1000);

    // Countdown that drives the progress ring.
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : QR_ROTATE_SECONDS));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [selectedSubjectId, selectedDate]);

  // Lightweight live polling for the students list (every 4s) without
  // regenerating the QR.
  useEffect(() => {
    if (!selectedSubjectId || !selectedDate) return;
    const id = setInterval(async () => {
      const status = await getSessionStatus(selectedSubjectId, selectedDate);
      if (!("error" in status)) setStudents(status.students);
    }, 4000);
    return () => clearInterval(id);
  }, [selectedSubjectId, selectedDate]);

  const checkedInCount = students.filter((s) => s.status === "PRESENT").length;
  const pendingCount = students.filter((s) => s.status === "PENDING").length;

  return (
    <div className="qr-session-grid">
      <section className="card animate-fade-in">
        <div style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
          <div>
            <label className="field-label">المادة والسنة الدراسية</label>
            <SubjectPicker
              options={subjectOptions}
              value={selectedSubjectId}
              onChange={setSelectedSubjectId}
              placeholder="اختر المادة..."
            />
          </div>
          <div>
            <label className="field-label">التاريخ</label>
            <input
              type="date"
              className="input-field"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        {selectedSubjectId && qrSvg ? (
          <>
            <div className="qr-display">
              <div className="qr-canvas" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="qr-meta">
                <span className="qr-timer" style={{ color: secondsLeft <= 5 ? "var(--danger)" : "var(--success)" }}>
                  ⏱ {secondsLeft}s
                </span>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  يتجدد كل {QR_ROTATE_SECONDS} ثانية
                </span>
              </div>
            </div>
            {qrUrl && (
              <details style={{ marginTop: "1rem" }}>
                <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  عرض الرابط (للنسخ اليدوي)
                </summary>
                <code
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    padding: "0.5rem",
                    backgroundColor: "var(--bg-tertiary)",
                    borderRadius: "var(--border-radius-sm)",
                    fontSize: "0.75rem",
                    wordBreak: "break-all",
                    direction: "ltr",
                  }}
                >
                  {qrUrl}
                </code>
              </details>
            )}
          </>
        ) : (
          <div className="qr-placeholder">
            <p>اختر المادة والتاريخ لعرض الـ QR</p>
          </div>
        )}
      </section>

      <section className="card animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3 style={{ fontWeight: 700 }}>الحاضرون مباشرة</h3>
          {selectedSubjectId && (
            <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.85rem" }}>
              <span className="status-badge status-present">حاضر: {checkedInCount}</span>
              <span className="status-badge" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                لم يسجل: {pendingCount}
              </span>
            </div>
          )}
        </div>

        {!selectedSubjectId ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "1.5rem 0" }}>
            اختر مادة لعرض الطلاب.
          </p>
        ) : students.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "1.5rem 0" }}>
            لا يوجد طلاب في هذه السنة.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th style={{ textAlign: "center" }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ textAlign: "center" }}>
                      {s.status === "PRESENT" ? (
                        <span className="status-badge status-present">✓ حاضر</span>
                      ) : s.status === "ABSENT" ? (
                        <span className="status-badge status-absent">غائب</span>
                      ) : s.status === "EXCUSED" ? (
                        <span className="status-badge status-excused">مستأذن</span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
