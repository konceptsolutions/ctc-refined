import { formatUiDate } from "@/utils/dateUtils";

export const normalizePriceHistoryField = (field: string) =>
  String(field || "")
    .replace(/_/g, "")
    .toLowerCase();

export const extractLatestPriceDatesFromHistory = (
  rows: Array<{ priceField?: string; date?: string }>,
) => {
  let priceA: string | null = null;
  let priceB: string | null = null;
  for (const row of rows) {
    const field = normalizePriceHistoryField(row.priceField || "");
    const date = row.date ? String(row.date) : "";
    if (!date) continue;
    if (!priceA && field === "pricea") priceA = date;
    if (!priceB && field === "priceb") priceB = date;
    if (priceA && priceB) break;
  }
  return { priceA, priceB };
};

export const formatPriceLastUpdatedLabel = (iso?: string | null) => {
  if (!iso) return "—";
  return formatUiDate(iso) || "—";
};
