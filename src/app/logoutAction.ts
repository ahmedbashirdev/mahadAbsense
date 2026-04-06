"use server"
import { logoutSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function processLogout() {
  await logoutSession();
  redirect("/login");
}
