import { requirePage } from "@/lib/require-page";
import { OperationsDesk } from "@/components/operations-desk";
export const instant = false;
export default async function Page() { await requirePage("/trade-ins"); return <OperationsDesk kind="TRADE_IN"/>; }
