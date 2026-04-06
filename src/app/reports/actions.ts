"use server"
import { prisma } from "@/lib/prisma";

export async function getYearReport(yearId: string) {
  // 1. Get all students for this year
  const students = await prisma.student.findMany({
    where: { yearId },
    orderBy: { name: 'asc' }
  });

  // 2. Get all attendance records for these students
  // This helps us deduce which actual lectures happened
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      student: { yearId }
    },
    include: {
      subject: true
    },
    orderBy: {
      date: 'asc'
    }
  });

  // 3. Extract unique lectures (combination of Date + Subject)
  const lecturesMap = new Map<string, { date: Date, subjectName: string, id: string }>();
  attendanceRecords.forEach(record => {
    const lectureKey = `${record.date.toISOString().split('T')[0]}_${record.subject.id}`;
    if (!lecturesMap.has(lectureKey)) {
      lecturesMap.set(lectureKey, {
        id: lectureKey,
        date: record.date,
        subjectName: record.subject.name
      });
    }
  });

  // Sort lectures by date
  const lectures = Array.from(lecturesMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    students,
    lectures,
    attendanceRecords: attendanceRecords.map(a => ({
      ...a,
      dateStr: a.date.toISOString().split('T')[0]
    }))
  };
}
