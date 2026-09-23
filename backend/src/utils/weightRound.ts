/** Store / calculate item weight to at most 4 decimal places. */
export const WEIGHT_DECIMALS = 4;
const WEIGHT_FACTOR = 10 ** WEIGHT_DECIMALS;

/** Round unit or total weight to 4 decimal places. */
export function roundWeight(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * WEIGHT_FACTOR) / WEIGHT_FACTOR;
}
