import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LecturerSignupClient from "./LecturerSignupClient";

export const dynamic = "force-dynamic";

export default async function LecturerSignupPage() {
  const session = await getSession();
  if (session) {
    if (session.type === "STUDENT") redirect("/me");
    if (session.type === "LECTURER") redirect("/me-lecturer");
    redirect("/");
  }
  return <LecturerSignupClient />;
}
