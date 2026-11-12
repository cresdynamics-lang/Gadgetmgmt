import { AiBriefing } from "@/app/insights/ai-briefing";

import { Desk } from "@/components/desk";

export const instant = false;

export default function AssistantPage() {
  return (
    <Desk title="Ask Gadget Hub" detail="A briefing from the live shop figures. Money, cost, and profit stay with the owner. Customer names and phone numbers are not sent.">
      <AiBriefing configured={Boolean(process.env.OPENAI_API_KEY)} />
    </Desk>
  );
}
