"use client"
import { useMemo, useState } from "react";
import Link from "next/link";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";

type Student = {
  id: string;
  name: string;
  identifier: string | null;
  yearId: string;
  academicYear: { id: string; name: string; order: number };
};

type Year = { id: string; name: string; order: number };

type Props = {
  students: Student[];
  years: Year[];
  deleteAction: (formData: FormData) => Promise<void>;
};

export default function StudentsList({ students, years, deleteAction }: Props) {
  const [selectedYearId, setSelectedYearId] = useState<string>(""); // "" = all
  const [query, setQuery] = useState("");

  // Palette keyed by year.order so each year has its own color (same idea
  // as the subject picker). RTL-safe neutral palette.
  const palette = useMemo(
    () => ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"],
    []
  );
  const colorFor = (yearId: string) => {
    const idx = years.findIndex((y) => y.id === yearId);
    return palette[(idx >= 0 ? idx : 0) % palette.length];
  };

  // Apply text search first, then partition by year.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (selectedYearId && s.yearId !== selectedYearId) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.identifier || "").toLowerCase().includes(q)
      );
    });
  }, [students, selectedYearId, query]);

  // Counts per year (respecting search query) — useful in the pill badges.
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, number>();
    map.set("", 0);
    years.forEach((y) => map.set(y.id, 0));
    students.forEach((s) => {
      if (q) {
        const matches =
          s.name.toLowerCase().includes(q) ||
          (s.identifier || "").toLowerCase().includes(q);
        if (!matches) return;
      }
      map.set("", (map.get("") || 0) + 1);
      map.set(s.yearId, (map.get(s.yearId) || 0) + 1);
    });
    return map;
  }, [students, years, query]);

  // Group the filtered list by year (used when "all" is selected).
  const grouped = useMemo(() => {
    const byYear = new Map<string, Student[]>();
    filtered.forEach((s) => {
      const arr = byYear.get(s.yearId) || [];
      arr.push(s);
      byYear.set(s.yearId, arr);
    });
    // Preserve `years` order (by `order`).
    return years
      .map((y) => ({ year: y, items: byYear.get(y.id) || [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, years]);

  const renderTable = (rows: Student[], showYearColumn: boolean) => (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الكود</th>
            {showYearColumn && <th>السنة الدراسية</th>}
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student) => (
            <tr key={student.id}>
              <td style={{ fontWeight: 600 }}>{student.name}</td>
              <td style={{ color: "var(--text-secondary)" }}>{student.identifier || "-"}</td>
              {showYearColumn && (
                <td>
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: `${colorFor(student.yearId)}1a`,
                      color: colorFor(student.yearId),
                      border: `1px solid ${colorFor(student.yearId)}40`,
                    }}
                  >
                    {student.academicYear.name}
                  </span>
                </td>
              )}
              <td>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Link
                    href={`/students?edit=${student.id}`}
                    className="btn"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      padding: "0.4rem 0.8rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    تعديل
                  </Link>
                  <SubmitWithConfirm
                    action={deleteAction}
                    id={student.id}
                    confirmMessage={`هل أنت متأكد من حذف ${student.name}؟`}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="students-toolbar">
        <input
          type="text"
          className="input-field students-search"
          placeholder="ابحث باسم الطالب أو الكود..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="students-tabs">
          <button
            type="button"
            onClick={() => setSelectedYearId("")}
            className={`students-tab ${selectedYearId === "" ? "active" : ""}`}
          >
            الكل
            <span className="students-tab-count">{counts.get("") || 0}</span>
          </button>
          {years.map((y) => {
            const color = colorFor(y.id);
            const active = selectedYearId === y.id;
            return (
              <button
                key={y.id}
                type="button"
                onClick={() => setSelectedYearId(y.id)}
                className={`students-tab ${active ? "active" : ""}`}
                style={
                  active
                    ? {
                        backgroundColor: `${color}1a`,
                        color,
                        borderColor: `${color}80`,
                      }
                    : undefined
                }
              >
                {y.name}
                <span
                  className="students-tab-count"
                  style={active ? { color, backgroundColor: `${color}33` } : undefined}
                >
                  {counts.get(y.id) || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {students.length === 0 && (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>
          لم يتم إضافة أي طلاب بعد.
        </p>
      )}

      {students.length > 0 && filtered.length === 0 && (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>
          لا توجد نتائج مطابقة.
        </p>
      )}

      {/* "All" view — grouped by year with colored headers */}
      {selectedYearId === "" && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {grouped.map((g) => (
            <div key={g.year.id}>
              <div
                className="students-group-header"
                style={{ color: colorFor(g.year.id), borderColor: `${colorFor(g.year.id)}60` }}
              >
                <span>{g.year.name}</span>
                <span className="students-group-count">{g.items.length} طالب</span>
              </div>
              {renderTable(g.items, false)}
            </div>
          ))}
        </div>
      )}

      {/* Single year view — no year column needed */}
      {selectedYearId !== "" && filtered.length > 0 && renderTable(filtered, false)}
    </>
  );
}
