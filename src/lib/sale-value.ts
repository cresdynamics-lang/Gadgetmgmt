/**
 * What a sale was worth. Sale.total is only what the customer still had to pay after their trade-in,
 * but the traded-in device is payment too, so sales and profit count the full price.
 */
export function saleValue(sale: { total: number; tradeInValue: number }) {
  return sale.total + sale.tradeInValue;
}

/** A line's full price. Older trade-in sales stored it with the trade-in taken off, so work it out here. */
export function saleLineValue(line: { unitPrice: number; quantity: number; discountAmount: number; taxAmount: number }) {
  return line.unitPrice * line.quantity - line.discountAmount + line.taxAmount;
}
