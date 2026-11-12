import { Desk, DeskNote } from "@/components/desk";

export const instant = false;

export default function ExpensesPage() {
  return (
    <Desk title="Expenses and bills" detail="Rent, utilities, salaries, and other costs. Only the owner can open this desk.">
      <DeskNote>No bills, salaries, or other expenses are recorded. Shop costs stay with the owner and are not estimated here.</DeskNote>
    </Desk>
  );
}
