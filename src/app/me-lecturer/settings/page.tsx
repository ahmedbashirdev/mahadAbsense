import { redirect } from "next/navigation";
import { getLecturerSession } from "@/lib/auth";
import LecturerSettingsClient from "./LecturerSettingsClient";

export const dynamic = "force-dynamic";

export default async function LecturerSettingsPage() {
  const session = await getLecturerSession();
  if (!session) redirect("/login");

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">إعدادات حسابي</h1>
          <p className="page-subtitle">تغيير كلمة المرور الخاصة بك</p>
        </div>
      </header>

      <div style={{ maxWidth: "600px" }}>
        <LecturerSettingsClient username={session.username} />
      </div>
    </>
  );
}
