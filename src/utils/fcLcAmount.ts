/** Helpers for bidirectional FC ↔ LC amount entry on international vouchers. */

export const parseExchangeRate = (raw: string | number): number => {
  const n = Number(String(raw).replace(/,/g, "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Normalize locale decimal comma to point while typing. */
export const normalizeDecimalTyping = (raw: string): string =>
  String(raw ?? "").replace(/,/g, ".");

/** Allow empty / partial decimal while typing (`.` or `,`). */
export const isAmountTypingValue = (raw: string): boolean => {
  const normalized = normalizeDecimalTyping(raw);
  return normalized === "" || /^\d*\.?\d*$/.test(normalized);
};

/** Exchange-rate typing: up to 6 decimal places, trailing `.` allowed. */
export const isExchangeRateTypingValue = (raw: string): boolean => {
  const normalized = normalizeDecimalTyping(raw);
  return normalized === "" || /^\d*\.?\d{0,6}$/.test(normalized);
};

export const parseAmount = (value: unknown): number => {
  if (value === undefined || value === null) return NaN;
  const raw = String(value).replace(/,/g, "").trim();
  if (raw === "") return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

export const lcFromFc = (fc: number | string, rate: number): string => {
  const raw = String(fc ?? "").replace(/,/g, "").trim();
  if (raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || rate <= 0) return "";
  return String(Number((n * rate).toFixed(4)));
};

export const fcFromLc = (lc: number | string, rate: number): string => {
  const raw = String(lc ?? "").replace(/,/g, "").trim();
  if (raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || rate <= 0) return "";
  return String(Number((n / rate).toFixed(6)));
};

/**
 * Prefer LC when present; otherwise use FC.
 * Empty string / 0 must not win over a real FC amount (`??` treats "" as valid).
 */
export const resolvePostedAmount = (
  preferred: unknown,
  fallback: unknown = 0,
): number => {
  const preferredNum = parseAmount(preferred);
  const fallbackNum = parseAmount(fallback);
  const fallbackSafe = Number.isFinite(fallbackNum) ? fallbackNum : 0;
  if (Number.isFinite(preferredNum) && !(preferredNum === 0 && fallbackSafe !== 0)) {
    return preferredNum;
  }
  return fallbackSafe;
};
