import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import StudentSettingsClient from "./StudentSettingsClient";

export const dynamic = "force-dynamic";

export default async function StudentSettingsPage() {
  const session = await getStudentSession();
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
        <StudentSettingsClient username={session.username} />
      </div>
    </>
  );
}
