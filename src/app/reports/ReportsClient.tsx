"use client"
import { useEffect, useMemo, useState } from "react";
import { getYearReport } from "./actions";

type Year = { id: string; name: string };

type Lecture = { id: string; date: Date; subjectName: string };

type Student = { id: string; name: string };

type AttendanceRecord = {
  id: string;
  status: string;
  studentId: string;
  subjectId: string;
  date: Date;
  dateStr: string;
  subject: { id: string; name: string };
};

type ReportData = {
  students: Student[];
  lectures: Lecture[];
  attendanceRecords: AttendanceRecord[];
};

export default function ReportsClient({ years }: { years: Year[] }) {
  // Default the date range to the current month (first → last day).
  const monthRange = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(first), to: fmt(last) };
  }, []);

  // Default to the first year so the report shows immediately without the
  // admin having to pick a year first.
  const [selectedYearId, setSelectedYearId] = useState(years[0]?.id ?? "");
  const [fromDate, setFromDate] = useState(monthRange.from);
  const [toDate, setToDate] = useState(monthRange.to);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!selectedYearId) {
      Promise.resolve().then(() => setReportData(null));
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => setLoading(true));
    getYearReport(selectedYearId, fromDate || undefined, toDate || undefined).then((data) => {
      if (cancelled) return;
      // Cast: server action returns prisma rows whose Date fields are real
      // Date instances after Next serializes them. We pass through unchanged.
      setReportData(data as unknown as ReportData);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedYearId, fromDate, toDate]);

  return (
    <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>المرحلة الدراسية</label>
          <select className="input-field" style={{ minWidth: '220px' }} value={selectedYearId} onChange={(e) => setSelectedYearId(e.target.value)}>
            {years.length === 0 && <option value="">لا توجد سنوات</option>}
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>من تاريخ</label>
          <input type="date" className="input-field" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>إلى تاريخ</label>
          <input type="date" className="input-field" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button
          type="button"
          className="input-field"
          style={{ cursor: 'pointer', fontWeight: 600, width: 'auto', padding: '0.6rem 1rem' }}
          onClick={() => { setFromDate(monthRange.from); setToDate(monthRange.to); }}
        >
          الشهر الحالي
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-secondary)' }}>جاري سحب بيانات الدفعة والمحاضرات...</p>}

      {!loading && reportData && (
        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {reportData.lectures.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', right: 0, backgroundColor: 'var(--bg-tertiary)', zIndex: 10, borderLeft: '1px solid var(--border-color)' }}>الطالب</th>
                    {reportData.lectures.map((lec) => (
                      <th key={lec.id} style={{ textAlign: 'center', backgroundColor: 'var(--bg-tertiary)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {new Date(lec.date).toLocaleDateString('ar-EG', { weekday: 'long' })}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {new Date(lec.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.9rem' }}>{lec.subjectName}</div>
                      </th>
                    ))}
                    <th style={{ backgroundColor: 'var(--bg-tertiary)', textAlign: 'center' }}>إجمالي الغياب</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.students.map((student) => {
                    let totalAbsences = 0;
                    return (
                      <tr key={student.id}>
                        <td style={{ position: 'sticky', right: 0, backgroundColor: 'var(--bg-secondary)', fontWeight: 600, zIndex: 5, borderLeft: '1px solid var(--border-color)' }}>
                          {student.name}
                        </td>
                        {reportData.lectures.map((lec) => {
                          const lecDateStr = new Date(lec.date).toISOString().split('T')[0];
                          const record = reportData.attendanceRecords.find(
                            (r) => r.studentId === student.id && r.dateStr === lecDateStr && r.subject.name === lec.subjectName
                          );

                          let display = "–";
                          let color = "var(--text-secondary)";
                          let bgColor = "transparent";

                          if (record) {
                            if (record.status === 'PRESENT') {
                              display = "ح";
                              color = "var(--success)";
                              bgColor = "rgba(16, 185, 129, 0.05)";
                            } else if (record.status === 'ABSENT') {
                              display = "غ";
                              color = "var(--danger)";
                              bgColor = "rgba(239, 68, 68, 0.05)";
                              totalAbsences++;
                            } else if (record.status === 'EXCUSED') {
                              display = "م";
                              color = "var(--warning)";
                              bgColor = "rgba(245, 158, 11, 0.05)";
                            }
                          }

                          return (
                            <td key={lec.id} style={{ textAlign: 'center', color, backgroundColor: bgColor, fontWeight: 'bold' }}>
                              {display}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: totalAbsences > 3 ? 'var(--danger)' : 'inherit' }}>
                          {totalAbsences}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>لا يوجد سجل غياب في الفترة المختارة. جرّب توسيع نطاق التاريخ أو تغيير المرحلة.</p>
          )}

          {reportData.lectures.length > 0 && (
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <div><span style={{ color: 'var(--success)', fontWeight: 'bold' }}>ح</span> = حاضر</div>
              <div><span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>غ</span> = غائب</div>
              <div><span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>م</span> = مستأذن</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
