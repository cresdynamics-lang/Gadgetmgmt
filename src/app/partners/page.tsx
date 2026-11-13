import { requirePage } from "@/lib/require-page";
import { OperationsDesk } from "@/components/operations-desk";
export const instant = false;
export default async function Page() { await requirePage("/partners"); return <OperationsDesk kind="PARTNER"/>; }
