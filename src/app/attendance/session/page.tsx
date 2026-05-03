import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentAccess } from "@/lib/access";
import QRSessionClient from "./QRSessionClient";

export const dynamic = "force-dynamic";

export default async function QRSessionPage() {
  const access = await getStudentAccess();
  if (!access) redirect("/login");

  const years = await prisma.academicYear.findMany({
    orderBy: { order: "asc" },
    include: {
      subjects: true,
    },
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">جلسة تسجيل حضور بـ QR</h1>
          <p className="page-subtitle">اختر المادة والتاريخ، اعرض الـ QR للطلاب ليمسحوه بهواتفهم</p>
        </div>
      </header>

      <QRSessionClient initialYears={years} />
    </>
  );
}
