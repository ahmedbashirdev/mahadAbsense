"use client"
import { useMemo, useState } from "react";

type SubjectOpt = {
  id: string;
  name: string;
  yearId: string;
  yearName: string;
};

type Props = {
  allSubjects: SubjectOpt[];
  selectedIds: string[];
};

/**
 * Multi-select for the subjects a lecturer teaches. Renders one checkbox per
 * subject (grouped by year). The form posts the chosen IDs as repeated
 * `subjectIds` fields, which the server action picks up via getAll().
 */
export default function LecturerSubjectPicker({ allSubjects, selectedIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const filtered = allSubjects.filter((s) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.yearName.toLowerCase().includes(q);
    });
    const map = new Map<string, { yearName: string; items: SubjectOpt[] }>();
    for (const s of filtered) {
      const g = map.get(s.yearId);
      if (g) g.items.push(s);
      else map.set(s.yearId, { yearName: s.yearName, items: [s] });
    }
    return Array.from(map.values());
  }, [allSubjects, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "var(--border-radius-sm)",
        backgroundColor: "var(--bg-secondary)",
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-color)" }}>
        <input
          type="text"
          className="input-field"
          placeholder="ابحث عن مادة أو سنة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}
        />
      </div>
      <div style={{ padding: "0.25rem" }}>
        {grouped.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" }}>
            لا توجد نتائج
          </p>
        )}
        {grouped.map((g) => (
          <div key={g.yearName} style={{ marginBottom: "0.5rem" }}>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "var(--text-secondary)",
                padding: "0.4rem 0.6rem",
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: "var(--border-radius-sm)",
              }}
            >
              {g.yearName}
            </div>
            {g.items.map((s) => {
              const checked = selected.has(s.id);
              return (
                <label
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.6rem",
                    cursor: "pointer",
                    borderRadius: "var(--border-radius-sm)",
                    backgroundColor: checked ? "rgba(59, 130, 246, 0.06)" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    name="subjectIds"
                    value={s.id}
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    style={{ accentColor: "var(--accent-primary)" }}
                  />
                  <span style={{ fontSize: "0.9rem" }}>{s.name}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
