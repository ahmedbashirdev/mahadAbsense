import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // Already-logged-in users get bounced to their home.
  const session = await getSession();
  if (session) {
    redirect(session.type === "STUDENT" ? "/me" : "/");
  }

  const years = await prisma.academicYear.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  return <SignupClient years={years} />;
}
