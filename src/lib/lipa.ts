/** Lipa Mdogo Mdogo. Same sum the public site uses for New and Ex-UK prices. */

export const LIPA_RATES = { 1: 1.3, 2: 1.4, 3: 1.5, 4: 1.6, 5: 1.7, 6: 1.8 } as const;
export const LIPA_MONTHS = [1, 2, 3, 4, 5, 6] as const;
export type LipaMonths = (typeof LIPA_MONTHS)[number];
export const LIPA_DEFAULT_MONTHS: LipaMonths = 6;

export type LipaPlan = {
  depositKes: number;
  /** Cash price minus the deposit, before the installment rate. */
  balanceKes: number;
  rate: number;
  /** Balance times the month rate, rounded to the nearest KES 100. */
  repayKes: number;
  monthlyKes: number;
  months: LipaMonths;
  /** Deposit plus the rounded repay amount. */
  totalKes: number;
};

export function lipaMonths(months: number): LipaMonths {
  return months in LIPA_RATES ? (months as LipaMonths) : LIPA_DEFAULT_MONTHS;
}

export function lipaRate(months: number) {
  return LIPA_RATES[lipaMonths(months)];
}

function repayFromBalance(balanceKes: number, rate: number) {
  return Math.round((balanceKes * Math.round(rate * 100)) / 10000) * 100;
}

function finish(price: number, depositKes: number, months: LipaMonths): LipaPlan {
  const balanceKes = Math.max(0, price - depositKes);
  const rate = LIPA_RATES[months];
  const repayKes = repayFromBalance(balanceKes, rate);
  return {
    depositKes,
    balanceKes,
    rate,
    repayKes,
    monthlyKes: months > 0 ? Math.round(repayKes / months) : 0,
    months,
    totalKes: depositKes + repayKes,
  };
}

/** Deposit taken as a percent of the cash price. 40% of 158,000 is 63,200. */
export function lipaPlan(priceKes: number, depositPct = 40, months: number = LIPA_DEFAULT_MONTHS): LipaPlan {
  const price = Math.max(0, Math.round(priceKes));
  const depositKes = Math.min(price, Math.max(0, Math.round((price * depositPct) / 100)));
  return finish(price, depositKes, lipaMonths(months));
}

/** Till uses the deposit actually collected, which may be more than 40%. */
export function lipaFromDeposit(priceKes: number, depositKes: number, months: number = LIPA_DEFAULT_MONTHS): LipaPlan {
  const price = Math.max(0, Math.round(priceKes));
  const deposit = Math.min(price, Math.max(0, Math.round(depositKes)));
  return finish(price, deposit, lipaMonths(months));
}

/** Whole shillings that add up to the rounded repay amount. */
export function splitInstallments(totalKes: number, months: number): number[] {
  const count = lipaMonths(months);
  if (totalKes <= 0) return [];
  const base = Math.floor(totalKes / count);
  let remainder = totalKes % count;
  return Array.from({ length: count }, () => {
    const amount = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return amount;
  });
}
