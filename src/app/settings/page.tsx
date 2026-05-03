import { getStaffSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">إعدادات الحساب</h1>
          <p className="page-subtitle">تغيير كلمة المرور الخاصة بك</p>
        </div>
      </header>

      <div style={{ maxWidth: '600px' }}>
         <SettingsClient username={session.username} />
      </div>
    </>
  );
}
