import {requirePage} from "@/lib/require-page";
import {PlanningDesk} from "@/components/planning-desk";
export const instant=false;
export default async function Page(){await requirePage("/planner");return <PlanningDesk/>;}
