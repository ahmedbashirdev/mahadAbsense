import { prisma } from "@/lib/prisma";

const ABSENCE_THRESHOLD_KEY = "absence_warning_threshold";
const DEFAULT_ABSENCE_THRESHOLD = 3;

/** Returns the per-subject absence count at which a student is "in the danger zone". */
export async function getAbsenceWarningThreshold(): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: ABSENCE_THRESHOLD_KEY } });
    if (!row) return DEFAULT_ABSENCE_THRESHOLD;
    const n = parseInt(row.value, 10);
    if (Number.isFinite(n) && n > 0) return n;
    return DEFAULT_ABSENCE_THRESHOLD;
  } catch {
    return DEFAULT_ABSENCE_THRESHOLD;
  }
}

export async function setAbsenceWarningThreshold(threshold: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: ABSENCE_THRESHOLD_KEY },
    update: { value: String(threshold) },
    create: { key: ABSENCE_THRESHOLD_KEY, value: String(threshold) },
  });
}
