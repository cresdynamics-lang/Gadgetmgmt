import { getSetting, setSetting } from "@/lib/app-settings";
import { DEFAULT_WARRANTY_MONTHS, MAX_WARRANTY_MONTHS, type WarrantyCondition, type WarrantyDefaults } from "@/lib/warranty";

const settingKey = (condition: WarrantyCondition) => `warranty_months_${condition}`;

export async function getWarrantyDefaults(): Promise<WarrantyDefaults> {
  const entries = await Promise.all((Object.keys(DEFAULT_WARRANTY_MONTHS) as WarrantyCondition[]).map(async (condition) => {
    const stored = Number.parseInt(await getSetting(settingKey(condition)), 10);
    return [condition, Number.isInteger(stored) && stored >= 0 && stored <= MAX_WARRANTY_MONTHS ? stored : DEFAULT_WARRANTY_MONTHS[condition]] as const;
  }));
  return Object.fromEntries(entries) as WarrantyDefaults;
}

export async function setWarrantyDefaults(next: WarrantyDefaults) {
  for (const condition of Object.keys(DEFAULT_WARRANTY_MONTHS) as WarrantyCondition[]) {
    await setSetting(settingKey(condition), String(next[condition]));
  }
}
