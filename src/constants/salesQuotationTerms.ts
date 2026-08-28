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

export const SALES_QUOTATION_STANDARD_TERMS = [
  "Prices quoted are exclusive of sales tax.",
  "Partial Orders against quoted price are not acceptable.",
  "- Pre-delivery inspection may be carried out at our premises.",
  "- Ex-Stock items are subject to prior sales without notice.",
  "- Quotation is valid for 5 Days.",
  "- Delivery within 2 days after receiving of order confirmation, subject to force majeure clause.",
  "- Delivery : Ex-Warehouse, Sarai Kharbuza, Tarnol, Islamabad.",
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
): string[] => {
  const first = normalizeQuotationTerm(selectedTerm);
  return [first, ...SALES_QUOTATION_STANDARD_TERMS];
};
