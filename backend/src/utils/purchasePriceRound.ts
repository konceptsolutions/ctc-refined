/** Round purchase / LC unit prices to whole numbers (no decimals). */
export function roundPurchasePrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}
