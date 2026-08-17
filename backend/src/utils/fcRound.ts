/** Round FC rate / line FC amount to 4 decimal places. */
export function roundFc(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/** Round summed FC amounts (item totals) to 2 decimal places. */
export function roundFcTotal(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
