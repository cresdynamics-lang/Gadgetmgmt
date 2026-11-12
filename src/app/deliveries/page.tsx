import { Desk, DeskNote } from "@/components/desk";

export const instant = false;

export default function DeliveriesPage() {
  return (
    <Desk title="Deliveries" detail="Packed orders, riders, and deliveries that still need payment.">
      <DeskNote>No deliveries are recorded. A sale is still completed in Sales. This desk stays empty until a delivery is recorded against an order.</DeskNote>
    </Desk>
  );
}
