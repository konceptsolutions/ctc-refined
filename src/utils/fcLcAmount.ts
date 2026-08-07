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

export const lcFromFc = (fc: number | string, rate: number): string => {
  const n = Number(fc);
  if (!Number.isFinite(n) || rate <= 0) return "";
  return String(Number((n * rate).toFixed(4)));
};

export const fcFromLc = (lc: number | string, rate: number): string => {
  const n = Number(lc);
  if (!Number.isFinite(n) || rate <= 0) return "";
  return String(Number((n / rate).toFixed(6)));
};
