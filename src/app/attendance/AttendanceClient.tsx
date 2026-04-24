"use client"
import { useState, useMemo, useEffect, useRef } from "react";
import { saveAttendance, getAttendanceRecords } from "./actions";
import SubjectPicker, { type SubjectOption } from "@/components/SubjectPicker";

type Year = {
  id: string;
  name: string;
  order: number;
  subjects: { id: string; name: string; termType: string; yearId: string }[];
  students: { id: string; name: string; yearId: string }[];
};

export default function AttendanceClient({ initialYears }: { initialYears: Year[] }) {
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [attendances, setAttendances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Keep a ref to the latest initialYears so we can read it inside the effect
  // without making it a dependency (which would cause unwanted re-fetches when
  // the server component revalidates).
  const yearsRef = useRef(initialYears);
  useEffect(() => { yearsRef.current = initialYears; }, [initialYears]);

  // Flatten subjects + year info for the picker. Give each year a deterministic
  // color so the user can spot which year a subject belongs to at a glance.
  const subjectOptions: SubjectOption[] = useMemo(() => {
    const palette = [
      "#3b82f6", // blue
      "#10b981", // green
      "#f59e0b", // amber
      "#ef4444", // red
      "#8b5cf6", // violet
      "#ec4899", // pink
      "#14b8a6", // teal
      "#f97316", // orange
    ];
    const opts: SubjectOption[] = [];
    initialYears.forEach((y, idx) => {
      const color = palette[idx % palette.length];
      y.subjects.forEach((s) => {
        opts.push({
          id: s.id,
          name: s.name,
          yearId: y.id,
          yearName: y.name,
          yearColor: color,
        });
      });
    });
    return opts;
  }, [initialYears]);

  // Resolve the year for the currently-selected subject.
  const activeYear = useMemo(() => {
    if (!selectedSubjectId) return null;
    return initialYears.find((y) => y.subjects.some((s) => s.id === selectedSubjectId)) || null;
  }, [initialYears, selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId || !selectedDate) return;

    const year = yearsRef.current.find((y) => y.subjects.some((s) => s.id === selectedSubjectId));
    if (!year) return;

    let cancelled = false;
    // `setLoading` and `setAttendances` below are set inside a promise-then
    // callback (i.e. asynchronously) — the guard above keeps the effect body
    // itself free of synchronous setState cascades.
    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    getAttendanceRecords(year.id, selectedSubjectId, selectedDate).then((records) => {
      if (cancelled) return;
      const attMap: Record<string, string> = {};
      year.students.forEach((s) => {
        attMap[s.id] = "PRESENT";
      });
      records.forEach((r: { studentId: string; status: string }) => {
        attMap[r.studentId] = r.status;
      });
      setAttendances(attMap);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
    // NOTE: intentionally NOT depending on initialYears / yearsRef -- we only
    // want to re-fetch when the user changes subject or date. Using a ref keeps
    // us reading the latest data on-demand without flickering.
  }, [selectedSubjectId, selectedDate]);

  const handleStatusChange = (studentId: string, status: string) => {
    setAttendances((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!selectedSubjectId || !selectedDate) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await saveAttendance(selectedSubjectId, selectedDate, attendances);
      setSaveMessage("تم حفظ الغياب بنجاح!");
      // Auto-dismiss the toast after a moment
      setTimeout(() => setSaveMessage(null), 2500);
    } catch {
      setSaveMessage("حدث خطأ أثناء الحفظ");
    }
    setSaving(false);
  };

  return (
    <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="attendance-filters">
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

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>جاري تحميل الكشف...</p>}

      {!loading && activeYear && selectedSubjectId && activeYear.students.length > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Desktop / wide: table view */}
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>حاضر</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>غائب</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>مستأذن</th>
                </tr>
              </thead>
              <tbody>
                {activeYear.students.map((student) => (
                  <tr key={student.id}>
                    <td style={{ fontWeight: 600 }}>{student.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="radio"
                             name={`status-${student.id}`}
                             checked={attendances[student.id] === 'PRESENT'}
                             onChange={() => handleStatusChange(student.id, 'PRESENT')}
                             style={{ accentColor: 'var(--success)', transform: 'scale(1.2)' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="radio"
                             name={`status-${student.id}`}
                             checked={attendances[student.id] === 'ABSENT'}
                             onChange={() => handleStatusChange(student.id, 'ABSENT')}
                             style={{ accentColor: 'var(--danger)', transform: 'scale(1.2)' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="radio"
                             name={`status-${student.id}`}
                             checked={attendances[student.id] === 'EXCUSED'}
                             onChange={() => handleStatusChange(student.id, 'EXCUSED')}
                             style={{ accentColor: 'var(--warning)', transform: 'scale(1.2)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card list view */}
          <div className="attendance-cards">
            {activeYear.students.map((student) => {
              const status = attendances[student.id] || 'PRESENT';
              return (
                <div key={student.id} className="attendance-card">
                  <div className="attendance-card-name">{student.name}</div>
                  <div className="attendance-card-actions">
                    <button
                      type="button"
                      className={`att-chip att-chip-present ${status === 'PRESENT' ? 'active' : ''}`}
                      onClick={() => handleStatusChange(student.id, 'PRESENT')}
                    >حاضر</button>
                    <button
                      type="button"
                      className={`att-chip att-chip-absent ${status === 'ABSENT' ? 'active' : ''}`}
                      onClick={() => handleStatusChange(student.id, 'ABSENT')}
                    >غائب</button>
                    <button
                      type="button"
                      className={`att-chip att-chip-excused ${status === 'EXCUSED' ? 'active' : ''}`}
                      onClick={() => handleStatusChange(student.id, 'EXCUSED')}
                    >مستأذن</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="attendance-save-row">
            {saveMessage && (
              <span className="save-toast">{saveMessage}</span>
            )}
            <button className="btn btn-primary attendance-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ كشف الغياب 💾'}
            </button>
          </div>
        </div>
      )}

      {activeYear && selectedSubjectId && activeYear.students.length === 0 && (
         <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
           لا يوجد طلاب مسجلون في هذه السنة الدراسية.
         </p>
      )}
    </div>
  );
}
