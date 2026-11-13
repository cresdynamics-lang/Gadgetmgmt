import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountSecurity } from "./security";
export const instant = false;
export default async function AccountPage() {
  if (!(await auth())?.user) redirect("/login");
  return <AccountSecurity />;
}
