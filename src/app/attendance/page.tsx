import { prisma } from "@/lib/prisma";
import AttendanceClient from "./AttendanceClient";

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const years = await prisma.academicYear.findMany({ 
    orderBy: { order: 'asc' },
    include: {
      subjects: true,
      students: true
    }
  });

  return (
    <>
      <header className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">تسجيل الغياب</h1>
          <p className="page-subtitle">قم باختيار المرحلة والمادة والتاريخ لاخذ الغياب</p>
        </div>
      </header>
      
      <AttendanceClient initialYears={years} />
    </>
  );
}
