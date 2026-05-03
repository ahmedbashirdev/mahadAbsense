"use server"
import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getStudentAccess } from "@/lib/access";
import { signCheckinToken, currentRotationSlot, QR_ROTATE_SECONDS } from "@/lib/checkin";

/**
 * Generates a fresh check-in URL + matching QR (as an SVG string) for the given
 * subject + date. Called by the client every QR_ROTATE_SECONDS so the QR image
 * rotates and old screenshots stop working.
 */
export async function generateCheckinUrl(subjectId: string, date: string) {
  const access = await getStudentAccess();
  if (!access) return { error: "غير مصرح" } as const;

  if (!subjectId || !date) return { error: "missing params" } as const;

  const slot = currentRotationSlot();
  const token = await signCheckinToken({ subjectId, date, rot: slot });

  // Build an absolute URL the student's phone can hit. Prefer NEXT_PUBLIC_APP_URL,
  // fall back to the request's host.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  let url: string;
  if (base) {
    url = `${base}/checkin?t=${token}`;
  } else {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "https";
    url = `${proto}://${host}/checkin?t=${token}`;
  }

  // Render to SVG so the client can drop it straight into the DOM with no
  // extra dependency. M-level error correction handles a phone camera at
  // arm's length.
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return { url, slot, ttl: QR_ROTATE_SECONDS, svg } as const;
}

/**
 * Returns the list of students for the subject's year along with their current
 * attendance status for the given date. Used to drive the live "checked-in"
 * panel on the QR session page.
 */
export async function getSessionStatus(subjectId: string, date: string) {
  const access = await getStudentAccess();
  if (!access) return { error: "غير مصرح", students: [] as Array<{ id: string; name: string; status: string }> };

  if (!subjectId || !date) return { students: [] as Array<{ id: string; name: string; status: string }> };

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { yearId: true },
  });
  if (!subject) return { students: [] };

  const students = await prisma.student.findMany({
    where: {
      yearId: subject.yearId,
      gender: { in: access.allowedGenders },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const attendances = await prisma.attendance.findMany({
    where: {
      subjectId,
      date: new Date(date),
      studentId: { in: students.map((s) => s.id) },
    },
    select: { studentId: true, status: true },
  });
  const statusMap = new Map(attendances.map((a) => [a.studentId, a.status]));

  return {
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      status: statusMap.get(s.id) || "PENDING",
    })),
  };
}
