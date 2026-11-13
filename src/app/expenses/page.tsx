import { requirePage } from "@/lib/require-page";
import { ExpensesDesk } from "@/components/expenses-desk";
export const instant = false;
export default async function Page() { await requirePage("/expenses");return <ExpensesDesk/>; }
