"use client"
import { useEffect, useState } from "react";

export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll when the drawer is open on mobile.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Close the drawer when the user clicks any navigation link inside it.
  const handleSidebarClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("a")) {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Mobile top bar (only shown on small screens via CSS) */}
      {sidebar && (
        <div className="mobile-topbar">
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => setOpen((v) => !v)}
            aria-label="فتح القائمة"
            aria-expanded={open}
          >
            <span />
            <span />
            <span />
          </button>
          <h2 className="mobile-topbar-title">المعهد العلمي</h2>
        </div>
      )}

      <div className="app-container">
        {sidebar && (
          <>
            <aside
              className={`sidebar ${open ? "sidebar-open" : ""}`}
              onClick={handleSidebarClick}
            >
              {sidebar}
            </aside>
            <div
              className={`sidebar-overlay ${open ? "open" : ""}`}
              onClick={() => setOpen(false)}
              aria-hidden
            />
          </>
        )}

        <main className="main-content">
          {children}
        </main>
      </div>
    </>
  );
}
