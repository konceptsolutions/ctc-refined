export const SALES_QUOTATION_TERM_OPTIONS = [
  "50% Advance, balance at the time of delivery",
  "Delivery against payment.",
  "100% Advance payment with Order Confirmation.",
  "Payment as per agreed terms,",
] as const;

export type SalesQuotationTermOption =
  (typeof SALES_QUOTATION_TERM_OPTIONS)[number];

export const DEFAULT_SALES_QUOTATION_TERM: SalesQuotationTermOption =
  "100% Advance payment with Order Confirmation.";

export const DEFAULT_SALES_QUOTATION_DELIVERY_DAYS = 2;

export const normalizeDeliveryDays = (value?: number | string | null): number => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SALES_QUOTATION_DELIVERY_DAYS;
  return Math.min(n, 365);
};

export const formatDeliveryDaysLabel = (days: number): string => {
  const d = normalizeDeliveryDays(days);
  return d === 1 ? "1 day" : `${d} days`;
};

export const SALES_QUOTATION_STANDARD_TERMS_STATIC = [
  "Prices quoted are exclusive of sales tax.",
  "Partial Orders against quoted price are not acceptable.",
  "- Pre-delivery inspection may be carried out at our premises.",
  "- Ex-Stock items are subject to prior sales without notice.",
  "- Quotation is valid for 5 Days.",
  "- Delivery : Ex-Warehouse, Sarai Kharbuza, Tarnol, Islamabad.",
] as const;

/** Flat list with default delivery days (legacy). Prefer buildSalesQuotationTermsForPrint. */
export const SALES_QUOTATION_STANDARD_TERMS = [
  ...SALES_QUOTATION_STANDARD_TERMS_STATIC.slice(0, 5),
  `- Delivery within ${DEFAULT_SALES_QUOTATION_DELIVERY_DAYS} days after receiving of order confirmation, subject to force majeure clause.`,
  SALES_QUOTATION_STANDARD_TERMS_STATIC[5],
] as const;

/** Match saved terms to a canonical option (handles legacy lowercase values). */
export const normalizeQuotationTerm = (value?: string | null): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_SALES_QUOTATION_TERM;
  const match = SALES_QUOTATION_TERM_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
};

export const buildSalesQuotationTermsForPrint = (
  selectedTerm?: string | null,
  deliveryDays?: number | string | null,
): string[] => {
  const first = normalizeQuotationTerm(selectedTerm);
  const daysLabel = formatDeliveryDaysLabel(normalizeDeliveryDays(deliveryDays));
  return [
    first,
    ...SALES_QUOTATION_STANDARD_TERMS_STATIC.slice(0, 5),
    `- Delivery within ${daysLabel} after receiving of order confirmation, subject to force majeure clause.`,
    SALES_QUOTATION_STANDARD_TERMS_STATIC[5],
  ];
};
