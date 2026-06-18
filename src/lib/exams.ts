// Shared helpers for exam term/type labelling.
//
// An exam is described by (subject.termType, term, kind):
//   - termType: "ONE_TERM" | "TWO_TERMS"  (comes from the subject)
//   - term:     1 | 2                       (which term; always 1 for one-term subjects)
//   - kind:     "MIDTERM" | "FINAL"         (ميد ترم / اختبار نهائي)

export type ExamKind = "MIDTERM" | "FINAL";

/** Human-readable Arabic label for an exam's type. */
export function examTypeLabel(termType: string, term: number, kind: string): string {
  const isMid = kind === "MIDTERM";
  if (termType === "TWO_TERMS") {
    if (term === 2) return isMid ? "ميد ترم ثان" : "الترم الثاني";
    return isMid ? "ميد ترم أول" : "الترم الأول";
  }
  // ONE_TERM
  return isMid ? "ميد ترم" : "اختبار نهائي";
}

/** The exam-type choices to offer for a subject, based on its termType. */
export function examTypeOptions(termType: string): { value: string; label: string }[] {
  if (termType === "TWO_TERMS") {
    return [
      { value: "1:MIDTERM", label: "ميد ترم أول" },
      { value: "1:FINAL", label: "الترم الأول (اختبار نهائي)" },
      { value: "2:MIDTERM", label: "ميد ترم ثان" },
      { value: "2:FINAL", label: "الترم الثاني (اختبار نهائي)" },
    ];
  }
  return [
    { value: "1:MIDTERM", label: "ميد ترم" },
    { value: "1:FINAL", label: "اختبار نهائي" },
  ];
}

/** Parse a "term:kind" picker value into its parts. */
export function parseExamType(value: string): { term: number; kind: ExamKind } {
  const [t, k] = (value || "").split(":");
  const term = parseInt(t, 10) === 2 ? 2 : 1;
  const kind: ExamKind = k === "FINAL" ? "FINAL" : "MIDTERM";
  return { term, kind };
}
