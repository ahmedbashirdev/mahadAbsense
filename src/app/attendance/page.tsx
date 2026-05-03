import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AttendanceClient from "./AttendanceClient";
import { getStudentAccess } from "@/lib/access";

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const access = await getStudentAccess();
  if (!access) redirect("/login");

  const years = await prisma.academicYear.findMany({
    orderBy: { order: 'asc' },
    include: {
      subjects: true,
      // Only include students whose gender the current user is allowed to see.
      // Staff without canViewFemale will get an empty student list for any
      // year that's all-female, and a male-only list for mixed years.
      students: {
        where: { gender: { in: access.allowedGenders } },
      },
    },
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
