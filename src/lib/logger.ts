import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";

export async function logActivity(action: string, details?: string) {
  try {
    // Activity log is for staff actions only — student-facing actions don't log here.
    const session = await getStaffSession();
    if (!session) return;

    await prisma.activityLog.create({
      data: {
        userId: session.userId,
        action,
        details,
      }
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}
