/**
 * Pure invoice math with no server dependencies, so client forms can show the
 * exact totals the server will compute. `ledger.ts` re-exports these.
 */

export type LineItem = { quantity: number; unitPrice: number };

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineAmount(item: LineItem) {
  return round2((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
}

export function computeInvoiceTotals(items: LineItem[], discount: number, taxRatePercent: number) {
  const subtotal = round2(items.reduce((sum, i) => sum + lineAmount(i), 0));
  const appliedDiscount = round2(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
  const taxable = round2(subtotal - appliedDiscount);
  const tax = round2((taxable * Math.max(Number(taxRatePercent) || 0, 0)) / 100);
  const total = round2(taxable + tax);
  return { subtotal, discount: appliedDiscount, tax, total };
}
