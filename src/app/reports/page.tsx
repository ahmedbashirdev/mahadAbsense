import { prisma } from "@/lib/prisma";
import ReportsClient from "./ReportsClient";

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const years = await prisma.academicYear.findMany({ orderBy: { order: 'asc' } });
  
  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">تقارير الدفعات</h1>
          <p className="page-subtitle">استعراض الغياب لجميع المحاضرات والطلاب على مستوى المرحلة الدراسية</p>
        </div>
      </header>
      
      <ReportsClient years={years} />
    </>
  );
}
