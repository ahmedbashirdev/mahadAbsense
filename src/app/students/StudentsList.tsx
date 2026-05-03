"use client"
import { useMemo, useState } from "react";
import Link from "next/link";
import { SubmitWithConfirm } from "@/components/SubmitWithConfirm";

type Student = {
  id: string;
  name: string;
  gender: string; // "MALE" | "FEMALE"
  username: string | null;
  isActive: boolean;
  yearId: string;
  academicYear: { id: string; name: string; order: number };
};

type Year = { id: string; name: string; order: number };

type Props = {
  students: Student[];
  years: Year[];
  deleteAction: (formData: FormData) => Promise<void>;
  canViewFemale: boolean;
};

type GenderFilter = "ALL" | "MALE" | "FEMALE";

export default function StudentsList({ students, years, deleteAction, canViewFemale }: Props) {
  const [selectedYearId, setSelectedYearId] = useState<string>(""); // "" = all
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("ALL");
  const [query, setQuery] = useState("");

  const palette = useMemo(
    () => ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"],
    []
  );
  const colorFor = (yearId: string) => {
    const idx = years.findIndex((y) => y.id === yearId);
    return palette[(idx >= 0 ? idx : 0) % palette.length];
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (selectedYearId && s.yearId !== selectedYearId) return false;
      if (genderFilter !== "ALL" && s.gender !== genderFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.username || "").toLowerCase().includes(q);
    });
  }, [students, selectedYearId, genderFilter, query]);

  // Counts per year (respecting current text + gender filters)
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, number>();
    map.set("", 0);
    years.forEach((y) => map.set(y.id, 0));
    students.forEach((s) => {
      if (genderFilter !== "ALL" && s.gender !== genderFilter) return;
      if (q) {
        const matches =
          s.name.toLowerCase().includes(q) || (s.username || "").toLowerCase().includes(q);
        if (!matches) return;
      }
      map.set("", (map.get("") || 0) + 1);
      map.set(s.yearId, (map.get(s.yearId) || 0) + 1);
    });
    return map;
  }, [students, years, query, genderFilter]);

  // Counts per gender (respecting text + year filters)
  const genderCounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    let male = 0;
    let female = 0;
    students.forEach((s) => {
      if (selectedYearId && s.yearId !== selectedYearId) return;
      if (q) {
        const matches =
          s.name.toLowerCase().includes(q) || (s.username || "").toLowerCase().includes(q);
        if (!matches) return;
      }
      if (s.gender === "MALE") male++;
      else if (s.gender === "FEMALE") female++;
    });
    return { male, female, all: male + female };
  }, [students, selectedYearId, query]);

  const grouped = useMemo(() => {
    const byYear = new Map<string, Student[]>();
    filtered.forEach((s) => {
      const arr = byYear.get(s.yearId) || [];
      arr.push(s);
      byYear.set(s.yearId, arr);
    });
    return years
      .map((y) => ({ year: y, items: byYear.get(y.id) || [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, years]);

  const renderGenderBadge = (gender: string) => {
    const isFemale = gender === "FEMALE";
    return (
      <span
        className="status-badge"
        style={{
          backgroundColor: isFemale ? "rgba(236, 72, 153, 0.12)" : "rgba(59, 130, 246, 0.12)",
          color: isFemale ? "#ec4899" : "#3b82f6",
          border: `1px solid ${isFemale ? "rgba(236, 72, 153, 0.4)" : "rgba(59, 130, 246, 0.4)"}`,
        }}
      >
        {isFemale ? "👧 أنثى" : "👦 ذكر"}
      </span>
    );
  };

  const renderTable = (rows: Student[], showYearColumn: boolean) => (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>الاسم</th>
            <th>اسم المستخدم</th>
            <th>النوع</th>
            {showYearColumn && <th>السنة الدراسية</th>}
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student) => (
            <tr key={student.id}>
              <td style={{ fontWeight: 600 }}>
                {student.name}
                {student.username && !student.isActive && (
                  <span
                    className="status-badge"
                    style={{
                      marginInlineStart: "0.5rem",
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                      color: "var(--danger)",
                      fontSize: "0.7rem",
                    }}
                  >
                    ⏸ موقوف
                  </span>
                )}
              </td>
              <td style={{ color: "var(--text-secondary)" }} dir="ltr">
                {student.username ? `@${student.username}` : "-"}
              </td>
              <td>{renderGenderBadge(student.gender)}</td>
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

        {canViewFemale && (
          <div className="students-tabs">
            <button
              type="button"
              onClick={() => setGenderFilter("ALL")}
              className={`students-tab ${genderFilter === "ALL" ? "active" : ""}`}
            >
              الكل
              <span className="students-tab-count">{genderCounts.all}</span>
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter("MALE")}
              className={`students-tab ${genderFilter === "MALE" ? "active" : ""}`}
              style={
                genderFilter === "MALE"
                  ? { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", borderColor: "rgba(59, 130, 246, 0.4)" }
                  : undefined
              }
            >
              👦 الذكور
              <span className="students-tab-count">{genderCounts.male}</span>
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter("FEMALE")}
              className={`students-tab ${genderFilter === "FEMALE" ? "active" : ""}`}
              style={
                genderFilter === "FEMALE"
                  ? { backgroundColor: "rgba(236, 72, 153, 0.12)", color: "#ec4899", borderColor: "rgba(236, 72, 153, 0.4)" }
                  : undefined
              }
            >
              👧 الإناث
              <span className="students-tab-count">{genderCounts.female}</span>
            </button>
          </div>
        )}

        <div className="students-tabs">
          <button
            type="button"
            onClick={() => setSelectedYearId("")}
            className={`students-tab ${selectedYearId === "" ? "active" : ""}`}
          >
            كل السنوات
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
                    ? { backgroundColor: `${color}1a`, color, borderColor: `${color}80` }
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

      {selectedYearId !== "" && filtered.length > 0 && renderTable(filtered, false)}
    </>
  );
}
