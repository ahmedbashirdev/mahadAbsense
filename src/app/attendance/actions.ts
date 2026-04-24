"use server"
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/logger";

export async function getAttendanceRecords(yearId: string, subjectId: string, date: string) {
  // Ensure the date string is handled carefully, we assume it's YYYY-MM-DD
  const targetDate = new Date(date);
  
  const records = await prisma.attendance.findMany({
    where: {
      subjectId,
      date: targetDate,
      student: {
        yearId // Ensure students are actively from that year
      }
    }
  });

  return records;
}

export async function saveAttendance(subjectId: string, date: string, attendances: Record<string, string>) {
  const targetDate = new Date(date);
  
  // To avoid unique constraint conflicts on mass update, typically we do an upsert
  const operations = Object.entries(attendances).map(([studentId, status]) => {
    return prisma.attendance.upsert({
      where: {
        date_studentId_subjectId: {
          date: targetDate,
          studentId,
          subjectId
        }
      },
      update: {
        status
      },
      create: {
        date: targetDate,
        studentId,
        subjectId,
        status
      }
    });
  });

  await prisma.$transaction(operations);

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  await logActivity("تسجيل الغياب", `تم تحديث كشف غياب مادة (${subject?.name || subjectId}) لتاريخ ${date}`);

  // NOTE: We intentionally do NOT revalidate /attendance here. Revalidating would
  // cause the server component to re-render, pass a new initialYears reference,
  // and re-trigger the client effect -> showing the loading state and flashing
  // the table in and out on every save. The client keeps its own state in sync
  // via getAttendanceRecords on dependency change.
  revalidatePath("/");
}
