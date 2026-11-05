export type WarrantyCondition = "NEW" | "EX_UK" | "TRADE_IN";
export type WarrantyDefaults = Record<WarrantyCondition, number>;

/** Months of shop warranty given with each kind of device unless the till picks otherwise. */
export const DEFAULT_WARRANTY_MONTHS: WarrantyDefaults = { NEW: 12, EX_UK: 6, TRADE_IN: 3 };
export const WARRANTY_CHOICES = [0, 1, 3, 6, 12, 24];
export const MAX_WARRANTY_MONTHS = 36;

/** The last day the warranty covers, counted in whole months from the sale. */
export function warrantyEnds(soldAt: Date | string, months: number) {
  const end = new Date(soldAt);
  end.setMonth(end.getMonth() + months);
  return end;
}

/** "12 months warranty, until 5 Nov 2027", or "No warranty". */
export function warrantyLabel(soldAt: Date | string, months: number | null | undefined) {
  if (!months) return "No warranty";
  const until = warrantyEnds(soldAt, months).toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });
  return `${months} month${months === 1 ? "" : "s"} warranty, until ${until}`;
}
