"use server"
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";
import { getStudentAccess } from "@/lib/access";

export async function getAttendanceRecords(yearId: string, subjectId: string, date: string) {
  const access = await getStudentAccess();
  if (!access) return [];

  // Ensure the date string is handled carefully, we assume it's YYYY-MM-DD
  const targetDate = new Date(date);

  const records = await prisma.attendance.findMany({
    where: {
      subjectId,
      date: targetDate,
      student: {
        yearId, // Ensure students are actively from that year
        gender: { in: access.allowedGenders },
      },
    },
  });

  return records;
}

export async function saveAttendance(subjectId: string, date: string, attendances: Record<string, string>) {
  const access = await getStudentAccess();
  if (!access) return;

  const targetDate = new Date(date);

  const studentIds = Object.keys(attendances);
  if (studentIds.length === 0) return;

  // Make sure the user is allowed to record attendance for every student in
  // this batch — drop any that are out of their gender scope.
  const allowedStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      gender: { in: access.allowedGenders },
    },
    select: { id: true },
  });
  const allowedSet = new Set(allowedStudents.map((s) => s.id));

  const operations = Object.entries(attendances)
    .filter(([studentId]) => allowedSet.has(studentId))
    .map(([studentId, status]) => {
      return prisma.attendance.upsert({
        where: {
          date_studentId_subjectId: {
            date: targetDate,
            studentId,
            subjectId,
          },
        },
        update: { status },
        create: { date: targetDate, studentId, subjectId, status },
      });
    });

  if (operations.length === 0) return;

  await prisma.$transaction(operations);

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  await logActivity("تسجيل الغياب", `تم تحديث كشف غياب مادة (${subject?.name || subjectId}) لتاريخ ${date}`);

  // NOTE: We intentionally do NOT revalidate /attendance here. See AttendanceClient
  // for the rationale (avoids the save-time flicker bug).
  revalidatePath("/");
}
