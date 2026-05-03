import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import CheckinScanner from "./CheckinScanner";

export const dynamic = "force-dynamic";

export default async function MeCheckinPage() {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">تسجيل الحضور</h1>
          <p className="page-subtitle">امسح الـ QR من شاشة المسؤول لتسجيل حضورك</p>
        </div>
      </header>

      <CheckinScanner />
    </>
  );
}
