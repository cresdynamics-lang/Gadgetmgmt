import { redirect } from "next/navigation";
import { auth } from "@/auth";
export const instant = false;
export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const pages = session.user.pages;
  redirect(pages.includes("*") || pages.includes("/dashboard") ? "/dashboard" : pages[0] || "/account");
}
