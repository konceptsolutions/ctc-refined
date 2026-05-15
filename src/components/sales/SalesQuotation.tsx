import { SalesInvoice } from "./SalesInvoice";

/** Same form and line-item UX as Sales Invoice (party/cash sale, GST, discount, freight). */
export const SalesQuotation = () => (
  <SalesInvoice documentKind="quotation" />
);
