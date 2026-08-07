/** Round purchase / LC unit prices to whole numbers (no decimals). */

export function roundPurchasePrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function formatPurchasePrice(value: unknown): string {
  return roundPurchasePrice(value).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Round FC rate / FC amount to 2 decimal places. */
export function roundFc(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function formatFc(value: unknown): string {
  return roundFc(value).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
