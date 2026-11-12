import { Desk, DeskNote } from "@/components/desk";

export const instant = false;

export default function PartnersPage() {
  return (
    <Desk title="Partners and consignment" detail="Phones that travel to or from other dealers, each with its own record.">
      <DeskNote>No phones are out with a dealer, and none are borrowed in. Agreed prices stay with the owner once a consignment record exists.</DeskNote>
    </Desk>
  );
}
