import { redirect } from "next/navigation";
import { auth } from "@/auth";
export const instant = false;
export default async function AccountPage() {
  if (!(await auth())?.user) redirect("/login");
  redirect("/settings#account-security");
}
