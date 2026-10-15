export function creditProgress(totalAmount: number, balance: number, lateFeeAmount = 0) {
  const totalObligation = Math.max(0, totalAmount) + Math.max(0, lateFeeAmount);
  const outstanding = Math.max(0, balance);
  const paidToDate = Math.max(0, totalObligation - outstanding);
  const percent = totalObligation === 0 ? 0 : Math.min(100, Math.round((paidToDate / totalObligation) * 100));
  return { totalObligation, paidToDate, percent };
}
