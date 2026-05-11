/**
 * Shown instantly while /me/checkin is being rendered server-side (cold
 * start, navigation, etc). Eliminates the perceived blank-page delay.
 */
export default function CheckinLoading() {
  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">تسجيل الحضور</h1>
          <p className="page-subtitle">امسح الـ QR من شاشة المسؤول لتسجيل حضورك</p>
        </div>
      </header>

      <div
        className="card animate-fade-in"
        style={{
          maxWidth: 560,
          marginInline: "auto",
          textAlign: "center",
          padding: "2rem 1rem",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto 1rem",
            border: "4px solid var(--border-color)",
            borderTopColor: "var(--accent-primary)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p style={{ color: "var(--text-secondary)" }}>جاري التحميل...</p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
