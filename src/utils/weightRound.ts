/** Store / display item weight to at most 4 decimal places. */
export const WEIGHT_DECIMALS = 4;
const WEIGHT_FACTOR = 10 ** WEIGHT_DECIMALS;

/** Round unit or total weight to 4 decimal places. */
export function roundWeight(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * WEIGHT_FACTOR) / WEIGHT_FACTOR;
}

/** HTML number input step for weight fields. */
export const WEIGHT_INPUT_STEP = "0.0001";

/**
 * Sanitize live weight input: digits + one decimal, max 4 fraction digits.
 * Returns empty string for blank input.
 */
export function formatWeightInput(value: string): string {
  if (!value || value.trim() === "") return "";

  let cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = parts[0] + "." + parts.slice(1).join("");
  }

  const nextParts = cleaned.split(".");
  if (nextParts.length === 2 && nextParts[1].length > WEIGHT_DECIMALS) {
    cleaned =
      nextParts[0] + "." + nextParts[1].substring(0, WEIGHT_DECIMALS);
  }

  return cleaned;
}

/** Display weight with up to 4 decimals (trims trailing zeros when preferred). */
export function formatWeightDisplay(
  value: unknown,
  opts?: { fixed?: boolean },
): string {
  const n = roundWeight(value);
  if (opts?.fixed) return n.toFixed(WEIGHT_DECIMALS);
  const fixed = n.toFixed(WEIGHT_DECIMALS);
  return fixed.replace(/\.?0+$/, "") || "0";
}
