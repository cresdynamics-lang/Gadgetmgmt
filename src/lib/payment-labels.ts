const paymentLabels: Record<string, string> = { CASH: "Cash", MPESA: "M-Pesa", MPESA_STK: "M-Pesa", CARD: "Card", CREDIT: "Lipa Mdogo Mdogo", SPLIT: "Split", PAY_LINK: "Payer link", LAYAWAY: "Layaway" };

/** How a payment reads on screens and receipts. Staff mark it; there is no payment gateway behind it. */
export function paymentLabel(method: string) {
  return paymentLabels[method] ?? method;
}
