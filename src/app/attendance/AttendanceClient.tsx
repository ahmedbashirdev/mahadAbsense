"use client"
import { useState, useMemo, useEffect } from "react";
import { saveAttendance, getAttendanceRecords } from "./actions";

export default function AttendanceClient({ initialYears }: { initialYears: any[] }) {
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [attendances, setAttendances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeYear = useMemo(() => initialYears.find(y => y.id === selectedYearId), [initialYears, selectedYearId]);

  useEffect(() => {
    if (selectedYearId && selectedSubjectId && selectedDate) {
      setLoading(true);
      getAttendanceRecords(selectedYearId, selectedSubjectId, selectedDate).then((records) => {
        const attMap: Record<string, string> = {};
        // Set defaults to PRESENT
        activeYear?.students.forEach((s: any) => {
          attMap[s.id] = "PRESENT";
        });
        // Override with saved records if any
        records.forEach((r: any) => {
          attMap[r.studentId] = r.status;
        });
        setAttendances(attMap);
        setLoading(false);
      });
    } else {
      setAttendances({});
    }
  }, [selectedYearId, selectedSubjectId, selectedDate, activeYear]);

  const handleStatusChange = (studentId: string, status: string) => {
    setAttendances(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!selectedSubjectId || !selectedDate) return;
    setSaving(true);
    try {
      await saveAttendance(selectedSubjectId, selectedDate, attendances);
      alert("تم حفظ الغياب بنجاح!");
    } catch (e) {
      alert("حدث خطأ أثناء الحفظ");
    }
    setSaving(false);
  };

  return (
    <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>السنة الدراسية</label>
          <select className="input-field" value={selectedYearId} onChange={(e) => { setSelectedYearId(e.target.value); setSelectedSubjectId(""); }}>
            <option value="">اختر السنة...</option>
            {initialYears.map(y => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>المادة</label>
          <select className="input-field" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!activeYear}>
            <option value="">اختر المادة...</option>
            {activeYear?.subjects.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>التاريخ</label>
          <input type="date" className="input-field" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>جاري تحميل الكشف...</p>}

      {!loading && activeYear && selectedSubjectId && activeYear.students.length > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>حاضر</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>غائب</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>مستأذن</th>
                </tr>
              </thead>
              <tbody>
                {activeYear.students.map((student: any) => (
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
          
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 2rem' }}>
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
