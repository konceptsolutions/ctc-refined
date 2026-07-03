import {
  getCurrentDatePakistan,
  getCurrentPakistanFinancialYearRange,
  getPakistanFinancialYearRange,
  getPreviousPakistanFinancialYearRange,
  getStartOfCurrentMonthPakistan,
} from "@/utils/dateUtils";
import {
  containsCustomerWisePhrase,
  containsItemMetricPhrase,
  containsReportIntentPhrase,
  normalizeQueryForMatching,
} from "@/lib/ai/queryNormalize";
import {
  openPrintHtml,
  unlockBrowserPrintLayout,
} from "@/utils/printUtils";

export type ReportDateRange = {
  from: string;
  to: string;
  label: string;
};

export type ItemReportSort = "demand" | "revenue" | "profit";
export type ItemReportOrder = "asc" | "desc";

export type SalesItemAnalyticsRow = {
  rank: number;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  quantity: number;
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number;
  invoiceCount: number;
};

/** @deprecated use SalesItemAnalyticsRow */
export type TopSellingItemRow = SalesItemAnalyticsRow;

export type ItemAnalyticsReportSpec = {
  sortBy: ItemReportSort;
  order: ItemReportOrder;
  title: string;
  previewMetric: (item: SalesItemAnalyticsRow) => string;
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

const MONTH_SHORT = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

const toInputDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatRs = (n: number) =>
  n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parsePakistanFinancialYearFromQuery(q: string): ReportDateRange | null {
  const hasFyIntent =
    q.includes("financial year") ||
    q.includes("fiscal year") ||
    q.includes("finantial year") ||
    q.includes("pakistan financial") ||
    q.includes("pakistan fy") ||
    q.includes("whole year") ||
    q.includes("full year") ||
    q.includes("entire year") ||
    /\bfy\b/.test(q) ||
    q.includes("current year") ||
    q.includes("this year");

  if (!hasFyIntent) return null;

  if (
    q.includes("last financial") ||
    q.includes("previous financial") ||
    q.includes("last fy") ||
    q.includes("previous fy")
  ) {
    return getPreviousPakistanFinancialYearRange();
  }

  const fyRangeMatch = q.match(/\bfy\s*(\d{4})\s*[-/]\s*(\d{2,4})\b/);
  if (fyRangeMatch) {
    const startYear = parseInt(fyRangeMatch[1], 10);
    return getPakistanFinancialYearRange({ fyStartYear: startYear, throughToday: false });
  }

  const fyStartMatch = q.match(/(?:financial|fiscal|finantial)\s+year\s+(\d{4})/);
  if (fyStartMatch) {
    const startYear = parseInt(fyStartMatch[1], 10);
    return getPakistanFinancialYearRange({ fyStartYear: startYear, throughToday: false });
  }

  return getCurrentPakistanFinancialYearRange();
}

export function parseReportDateRange(query: string): ReportDateRange | null {
  const q = query.toLowerCase().replace(/[?!.,]/g, " ");

  const fyRange = parsePakistanFinancialYearFromQuery(q);
  if (fyRange) return fyRange;

  for (let i = 0; i < MONTHS.length; i += 1) {
    const monthPattern = new RegExp(`\\b(${MONTHS[i]}|${MONTH_SHORT[i]})\\b`, "i");
    if (monthPattern.test(q)) {
      const yearMatch = q.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      const from = new Date(year, i, 1);
      const to = new Date(year, i + 1, 0);
      const label = `${MONTHS[i].charAt(0).toUpperCase()}${MONTHS[i].slice(1)} ${year}`;
      return { from: toInputDate(from), to: toInputDate(to), label };
    }
  }

  return null;
}

function detectSortBy(query: string): ItemReportSort {
  const q = normalizeQueryForMatching(query);
  if (
    q.includes("revenue") ||
    q.includes("turnover") ||
    q.includes("sales amount") ||
    q.includes("sale value")
  ) {
    return "revenue";
  }
  if (
    q.includes("profit") ||
    q.includes("profitability") ||
    q.includes("margin") ||
    q.includes("profitable")
  ) {
    return "profit";
  }
  return "demand";
}

function detectOrder(query: string, sortBy: ItemReportSort): ItemReportOrder {
  const q = normalizeQueryForMatching(query);
  const least =
    q.includes("least") ||
    q.includes("lowest") ||
    q.includes("minimum") ||
    q.includes("min profitability") ||
    q.includes("min profit") ||
    q.includes("bottom") ||
    q.includes("worst");
  const most =
    q.includes("most") ||
    q.includes("highest") ||
    q.includes("maximum") ||
    q.includes("max profitability") ||
    q.includes("max profit") ||
    q.includes("top") ||
    q.includes("best");

  if (least && !most) return "asc";
  if (most && !least) return "desc";

  // Defaults when direction not explicit
  if (sortBy === "demand") return q.includes("least") || q.includes("low") ? "asc" : "desc";
  if (sortBy === "revenue") return q.includes("least") || q.includes("low") ? "asc" : "desc";
  return q.includes("least") || q.includes("low") ? "asc" : "desc";
}

export function buildItemReportSpec(
  sortBy: ItemReportSort,
  order: ItemReportOrder,
): ItemAnalyticsReportSpec {
  const high = order === "desc";
  const titles: Record<ItemReportSort, [string, string]> = {
    demand: high
      ? ["Most Selling / Demanding Items", "Qty"]
      : ["Least Selling / Demanding Items", "Qty"],
    revenue: high
      ? ["Items with Most Revenue", "Revenue"]
      : ["Items with Least Revenue", "Revenue"],
    profit: high
      ? ["Items with Max Profitability", "Profit"]
      : ["Items with Least Profitability", "Profit"],
  };
  const [title, metric] = titles[sortBy];
  return {
    sortBy,
    order,
    title,
    previewMetric: (item) => {
      if (sortBy === "demand") {
        return `Qty: ${item.quantity.toLocaleString()}, Revenue: Rs ${formatRs(item.totalAmount)}`;
      }
      if (sortBy === "revenue") {
        return `Revenue: Rs ${formatRs(item.totalAmount)}, Qty: ${item.quantity.toLocaleString()}`;
      }
      return `Profit: Rs ${formatRs(item.totalProfit)} (${item.marginPercent.toFixed(1)}% margin), Qty: ${item.quantity.toLocaleString()}`;
    },
  };
}

export function parseItemAnalyticsReportQuery(
  query: string,
): (ReportDateRange & ItemAnalyticsReportSpec) | null {
  const q = query.toLowerCase();
  let range = parseReportDateRange(query);
  if (!range && isItemAnalyticsReportQuery(query)) {
    range = getCurrentPakistanFinancialYearRange();
  }
  if (!range) return null;

  const sortBy = detectSortBy(q);
  const order = detectOrder(q, sortBy);
  const spec = buildItemReportSpec(sortBy, order);
  return { ...range, ...spec };
}

export function isItemAnalyticsReportQuery(query: string): boolean {
  if (isCustomerWiseReportQuery(query)) return false;
  if (!containsItemMetricPhrase(query)) return false;
  return containsReportIntentPhrase(query);
}

/** @deprecated use isItemAnalyticsReportQuery */
export function isTopSellingReportQuery(query: string): boolean {
  return isItemAnalyticsReportQuery(query);
}

export function printItemAnalyticsPdf(
  items: SalesItemAnalyticsRow[],
  spec: ItemAnalyticsReportSpec,
  rangeLabel: string,
  fromDate: string,
  toDate: string,
) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td>${item.rank}</td>
        <td>${escapeHtml(item.partNo)}</td>
        <td>${escapeHtml(item.description || "-")}</td>
        <td>${escapeHtml(item.brand || "-")}</td>
        <td style="text-align:right">${item.quantity.toLocaleString()}</td>
        <td style="text-align:right">${formatRs(item.totalAmount)}</td>
        <td style="text-align:right">${formatRs(item.totalCost)}</td>
        <td style="text-align:right">${formatRs(item.totalProfit)}</td>
        <td style="text-align:right">${item.marginPercent.toFixed(1)}%</td>
        <td style="text-align:right">${item.invoiceCount}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><title>${escapeHtml(spec.title)} - ${escapeHtml(rangeLabel)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #555; margin-bottom: 16px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; }
  th { background: #f3f4f6; text-align: left; }
</style></head><body>
  <h1>${escapeHtml(spec.title)}</h1>
  <div class="meta">Period: ${escapeHtml(rangeLabel)} (${escapeHtml(fromDate)} to ${escapeHtml(toDate)})</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Part No</th><th>Description</th><th>Brand</th>
        <th>Qty Sold</th><th>Revenue (Rs)</th><th>Cost (Rs)</th><th>Profit (Rs)</th><th>Margin %</th><th>Invoices</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="10">No data</td></tr>'}</tbody>
  </table>
</body></html>`;

  openPrintHtml(html);
}

/** @deprecated use printItemAnalyticsPdf */
export function printTopSellingItemsPdf(
  items: SalesItemAnalyticsRow[],
  rangeLabel: string,
  fromDate: string,
  toDate: string,
) {
  printItemAnalyticsPdf(
    items,
    buildItemReportSpec("demand", "desc"),
    rangeLabel,
    fromDate,
    toDate,
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const ITEM_REPORT_TYPE_OPTIONS: Array<{
  value: string;
  label: string;
  sort_by: ItemReportSort;
  order: ItemReportOrder;
}> = [
  { value: "demand-desc", label: "Most selling / demanding", sort_by: "demand", order: "desc" },
  { value: "demand-asc", label: "Least selling / demanding", sort_by: "demand", order: "asc" },
  { value: "revenue-desc", label: "Most revenue", sort_by: "revenue", order: "desc" },
  { value: "revenue-asc", label: "Least revenue", sort_by: "revenue", order: "asc" },
  { value: "profit-desc", label: "Max profitability", sort_by: "profit", order: "desc" },
  { value: "profit-asc", label: "Least profitability", sort_by: "profit", order: "asc" },
];

export const REPORT_DATE_PERIOD_PRESETS: Array<{
  value: string;
  label: string;
  getRange: () => ReportDateRange;
}> = [
  {
    value: "current-fy",
    label: "Current financial year (Pakistan: Jul–Jun)",
    getRange: getCurrentPakistanFinancialYearRange,
  },
  {
    value: "previous-fy",
    label: "Previous financial year (Pakistan)",
    getRange: getPreviousPakistanFinancialYearRange,
  },
  {
    value: "current-month",
    label: "Current month",
    getRange: () => ({
      from: getStartOfCurrentMonthPakistan(),
      to: getCurrentDatePakistan(),
      label: "Current month",
    }),
  },
  { value: "custom", label: "Custom date range", getRange: () => ({ from: "", to: "", label: "" }) },
];

export type CustomerWiseSalesLine = {
  partNo: string;
  description: string;
  brand: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
};

export type CustomerWiseSalesInvoice = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  itemCount: number;
  itemQty: number;
  subtotal: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  balance: number;
  items: CustomerWiseSalesLine[];
};

export type CustomerWiseSalesReport = {
  customerType: string;
  customerName: string;
  customerId: string | null;
  invoices: CustomerWiseSalesInvoice[];
  summary: {
    invoiceCount: number;
    totalItems: number;
    totalQty: number;
    totalAmount: number;
    totalPaid: number;
    totalBalance: number;
  };
};

export function parseItemReportSpecFromQuery(
  query: string,
): { sortBy: ItemReportSort; order: ItemReportOrder } {
  const sortBy = detectSortBy(query);
  const order = detectOrder(query, sortBy);
  return { sortBy, order };
}

export function hasExplicitItemReportDirection(query: string): boolean {
  const q = normalizeQueryForMatching(query);
  return (
    q.includes("most") ||
    q.includes("least") ||
    q.includes("highest") ||
    q.includes("lowest") ||
    q.includes("maximum") ||
    q.includes("minimum") ||
    q.includes("max profit") ||
    q.includes("min profit") ||
    q.includes("top") ||
    q.includes("bottom") ||
    q.includes("best") ||
    q.includes("worst")
  );
}

function hasCustomerWiseIntent(query: string): boolean {
  return containsCustomerWisePhrase(query);
}

function hasItemMetricIntent(query: string): boolean {
  return containsItemMetricPhrase(query);
}

export function isCustomerWiseItemAnalyticsQuery(query: string): boolean {
  return hasCustomerWiseIntent(query) && hasItemMetricIntent(query);
}

export function isCustomerWiseInvoiceReportQuery(query: string): boolean {
  if (isCustomerWiseItemAnalyticsQuery(query)) return false;
  return hasCustomerWiseIntent(query) && containsReportIntentPhrase(query);
}

/** Any customer-wise report (invoice list or item analytics) */
export function isCustomerWiseReportQuery(query: string): boolean {
  return (
    isCustomerWiseItemAnalyticsQuery(query) || isCustomerWiseInvoiceReportQuery(query)
  );
}

export function parseCustomerWiseItemAnalyticsQuery(
  query: string,
): (ReportDateRange & ItemAnalyticsReportSpec) | null {
  if (!isCustomerWiseItemAnalyticsQuery(query)) return null;
  const range =
    parseReportDateRange(query) ?? getCurrentPakistanFinancialYearRange();
  const { sortBy, order } = parseItemReportSpecFromQuery(query);
  const spec = buildItemReportSpec(sortBy, order);
  return { ...range, ...spec };
}

export function printCustomerWiseItemAnalyticsPdf(
  items: SalesItemAnalyticsRow[],
  spec: ItemAnalyticsReportSpec,
  customerName: string,
  rangeLabel: string,
  fromDate: string,
  toDate: string,
) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td>${item.rank}</td>
        <td>${escapeHtml(item.partNo)}</td>
        <td>${escapeHtml(item.description || "-")}</td>
        <td>${escapeHtml(item.brand || "-")}</td>
        <td style="text-align:right">${item.quantity.toLocaleString()}</td>
        <td style="text-align:right">${formatRs(item.totalAmount)}</td>
        <td style="text-align:right">${formatRs(item.totalCost)}</td>
        <td style="text-align:right">${formatRs(item.totalProfit)}</td>
        <td style="text-align:right">${item.marginPercent.toFixed(1)}%</td>
        <td style="text-align:right">${item.invoiceCount}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><title>${escapeHtml(spec.title)} — ${escapeHtml(customerName)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #555; margin-bottom: 16px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; }
  th { background: #f3f4f6; text-align: left; }
</style></head><body>
  <h1>${escapeHtml(spec.title)}</h1>
  <div class="meta">Customer: <strong>${escapeHtml(customerName)}</strong><br/>
  Period: ${escapeHtml(rangeLabel)} (${escapeHtml(fromDate)} to ${escapeHtml(toDate)})</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Part No</th><th>Description</th><th>Brand</th>
        <th>Qty Sold</th><th>Revenue (Rs)</th><th>Cost (Rs)</th><th>Profit (Rs)</th><th>Margin %</th><th>Invoices</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="10">No data</td></tr>'}</tbody>
  </table>
</body></html>`;

  openPrintHtml(html);
}

export function isCustomerWiseSalesReportQuery(query: string): boolean {
  return isCustomerWiseInvoiceReportQuery(query);
}

export function parseCustomerTypeFromText(text: string): "walking" | "registered" | null {
  const q = text.toLowerCase().trim();
  if (
    q.includes("cash sale") ||
    q.includes("walk-in") ||
    q.includes("walk in") ||
    q.includes("walking") ||
    q === "cash"
  ) {
    return "walking";
  }
  if (
    q.includes("party sale") ||
    q.includes("credit sale") ||
    q.includes("credit") ||
    q.includes("registered") ||
    q === "party"
  ) {
    return "registered";
  }
  return null;
}

export function printCustomerWiseSalesPdf(
  report: CustomerWiseSalesReport,
  rangeLabel: string,
  fromDate: string,
  toDate: string,
) {
  const typeLabel =
    report.customerType === "walking" ? "Walk-in" : "Party";

  const invoiceSections = report.invoices
    .map((inv) => {
      const itemRows = inv.items
        .map(
          (line) => `
        <tr>
          <td>${escapeHtml(line.partNo)}</td>
          <td>${escapeHtml(line.description || "-")}</td>
          <td>${escapeHtml(line.brand || "-")}</td>
          <td style="text-align:right">${line.quantity}</td>
          <td style="text-align:right">${formatRs(line.unitPrice)}</td>
          <td style="text-align:right">${formatRs(line.lineTotal)}</td>
        </tr>`,
        )
        .join("");
      return `
      <h3 style="margin:16px 0 6px;font-size:13px">${escapeHtml(inv.invoiceNo)} — ${escapeHtml(inv.invoiceDate)} (${escapeHtml(inv.paymentStatus)})</h3>
      <table>
        <thead>
          <tr>
            <th>Part No</th><th>Description</th><th>Brand</th>
            <th>Qty</th><th>Unit Price</th><th>Line Total</th>
          </tr>
        </thead>
        <tbody>${itemRows || '<tr><td colspan="6">No lines</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right;font-weight:bold">Invoice Total</td>
            <td style="text-align:right;font-weight:bold">${formatRs(inv.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html><head><title>Customer Sales — ${escapeHtml(report.customerName)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #555; margin-bottom: 16px; font-size: 13px; }
  .summary { margin-bottom: 20px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; }
  th { background: #f3f4f6; text-align: left; }
</style></head><body>
  <h1>Customer-wise Sales Report</h1>
  <div class="meta">Customer: <strong>${escapeHtml(report.customerName)}</strong> (${typeLabel})<br/>
  Period: ${escapeHtml(rangeLabel)} (${escapeHtml(fromDate)} to ${escapeHtml(toDate)})</div>
  <div class="summary">
    Invoices: <strong>${report.summary.invoiceCount}</strong> |
    Total Sales: <strong>Rs ${formatRs(report.summary.totalAmount)}</strong> |
    Paid: <strong>Rs ${formatRs(report.summary.totalPaid)}</strong> |
    Balance: <strong>Rs ${formatRs(report.summary.totalBalance)}</strong>
  </div>
  ${invoiceSections || "<p>No invoices in this period.</p>"}
</body></html>`;

  openPrintHtml(html);
}
