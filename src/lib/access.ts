import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";

/**
 * Resolves what student genders the currently logged-in STAFF user is allowed
 * to see.  Returns `null` for student sessions (they only see their own data
 * via the /me dashboard, which has its own helpers).
 *
 * Rules:
 *  - ADMIN can always see all students.
 *  - Other staff users can see female students only if `canViewFemale` is true.
 *  - All staff users can see male students.
 */
export type StudentAccess = {
  isAdmin: boolean;
  canViewFemale: boolean;
  allowedGenders: ("MALE" | "FEMALE")[];
  studentWhere: { gender: { in: ("MALE" | "FEMALE")[] } };
  attendanceStudentWhere: { student: { gender: { in: ("MALE" | "FEMALE")[] } } };
};

export async function getStudentAccess(): Promise<StudentAccess | null> {
  const session = await getStaffSession();
  if (!session) return null;

  const isAdmin = session.role === "ADMIN";

  let canViewFemale = false;
  if (isAdmin) {
    canViewFemale = true;
  } else {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { canViewFemale: true },
    });
    canViewFemale = !!user?.canViewFemale;
  }

  const allowedGenders: ("MALE" | "FEMALE")[] = canViewFemale ? ["MALE", "FEMALE"] : ["MALE"];

  return {
    isAdmin,
    canViewFemale,
    allowedGenders,
    studentWhere: { gender: { in: allowedGenders } },
    attendanceStudentWhere: { student: { gender: { in: allowedGenders } } },
  };
}
