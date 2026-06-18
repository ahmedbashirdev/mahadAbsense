"use client"
import { useMemo, useState } from "react";
import { examTypeOptions } from "@/lib/exams";

type Year = { id: string; name: string };
type Subject = { id: string; name: string; yearId: string; termType: string };

type Props = {
  years: Year[];
  subjects: Subject[];
  defaultYearId?: string;
  defaultSubjectId?: string;
  defaultExamType?: string; // "term:kind"
};

export default function ExamFormFields({ years, subjects, defaultYearId, defaultSubjectId, defaultExamType }: Props) {
  const [yearId, setYearId] = useState(defaultYearId ?? "");
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");

  const subjectsInYear = useMemo(
    () => subjects.filter((s) => s.yearId === yearId),
    [subjects, yearId]
  );

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const typeOptions = selectedSubject ? examTypeOptions(selectedSubject.termType) : [];

  // Keep the type value valid for the current subject; fall back to the first option.
  const validValues = typeOptions.map((o) => o.value);
  const initialType = defaultExamType && validValues.includes(defaultExamType) ? defaultExamType : "";
  const [examType, setExamType] = useState(initialType);
  const typeValue = validValues.includes(examType) ? examType : (typeOptions[0]?.value ?? "");

  return (
    <>
      <div>
        <label className="field-label">السنة الدراسية</label>
        <select
          className="input-field"
          value={yearId}
          onChange={(e) => { setYearId(e.target.value); setSubjectId(""); setExamType(""); }}
          required
        >
          <option value="">اختر السنة...</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label">المادة</label>
        <select
          name="subjectId"
          className="input-field"
          value={subjectId}
          onChange={(e) => { setSubjectId(e.target.value); setExamType(""); }}
          required
          disabled={!yearId}
        >
          <option value="">{yearId ? "اختر المادة..." : "اختر السنة أولاً"}</option>
          {subjectsInYear.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.termType === "TWO_TERMS" ? "ترمين" : "ترم واحد"})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label">نوع الاختبار</label>
        <select
          name="examType"
          className="input-field"
          value={typeValue}
          onChange={(e) => setExamType(e.target.value)}
          required
          disabled={!subjectId}
        >
          {!subjectId && <option value="">اختر المادة أولاً</option>}
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
