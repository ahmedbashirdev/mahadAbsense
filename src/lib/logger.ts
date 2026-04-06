import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function logActivity(action: string, details?: string) {
  try {
    const session = await getSession();
    if (!session || !session.userId) return;

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
