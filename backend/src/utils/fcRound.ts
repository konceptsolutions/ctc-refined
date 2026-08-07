/** Round FC rate / FC amount to 2 decimal places. */
export function roundFc(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
