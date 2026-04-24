"use client"
import { useEffect, useMemo, useRef, useState } from "react";

export type SubjectOption = {
  id: string;
  name: string;
  yearId: string;
  yearName: string;
  yearColor: string;
};

type Props = {
  options: SubjectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function SubjectPicker({ options, value, onChange, placeholder = "اختر المادة...", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.yearName.toLowerCase().includes(q)
    );
  }, [options, query]);

  // Group by year for nicer scanability.
  const grouped = useMemo(() => {
    const map = new Map<string, { yearName: string; yearColor: string; items: SubjectOption[] }>();
    for (const o of filtered) {
      const existing = map.get(o.yearId);
      if (existing) {
        existing.items.push(o);
      } else {
        map.set(o.yearId, { yearName: o.yearName, yearColor: o.yearColor, items: [o] });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="subject-picker" ref={wrapperRef}>
      <button
        type="button"
        className="subject-picker-trigger input-field"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="subject-picker-selected">
            <span className="subject-picker-name">{selected.name}</span>
            <span
              className="subject-picker-badge"
              style={{
                backgroundColor: `${selected.yearColor}1a`,
                color: selected.yearColor,
                borderColor: `${selected.yearColor}40`,
              }}
            >
              {selected.yearName}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>{placeholder}</span>
        )}
        <span className="subject-picker-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="subject-picker-panel" role="listbox">
          <div className="subject-picker-search-wrap">
            <input
              autoFocus
              type="text"
              className="subject-picker-search"
              placeholder="ابحث عن مادة أو سنة..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="subject-picker-list">
            {grouped.length === 0 && (
              <div className="subject-picker-empty">لا توجد نتائج</div>
            )}
            {grouped.map((g) => (
              <div key={g.yearName} className="subject-picker-group">
                <div
                  className="subject-picker-group-label"
                  style={{ color: g.yearColor, borderColor: `${g.yearColor}30` }}
                >
                  {g.yearName}
                </div>
                {g.items.map((o) => {
                  const isActive = o.id === value;
                  return (
                    <button
                      type="button"
                      key={o.id}
                      role="option"
                      aria-selected={isActive}
                      className={`subject-picker-option ${isActive ? "active" : ""}`}
                      onClick={() => pick(o.id)}
                    >
                      <span className="subject-picker-name">{o.name}</span>
                      <span
                        className="subject-picker-badge"
                        style={{
                          backgroundColor: `${o.yearColor}1a`,
                          color: o.yearColor,
                          borderColor: `${o.yearColor}40`,
                        }}
                      >
                        {o.yearName}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
