/**
 * Offline ERP help — used when AI API is unavailable or for fast topic matches.
 * Keep in sync with backend/src/ai/erpKnowledge.ts
 */

import { isCustomerInvoiceLookupQuery, extractCustomerNameFromInvoiceQuery } from "@/lib/ai/customerInvoiceQueryUtils";
import { isItemStockLookupQuery } from "@/lib/ai/itemStockQueryUtils";
import { isCustomerWiseReportQuery } from "@/lib/ai/reportQueryUtils";

type HelpTopic = {
  keywords: string[];
  title: string;
  content: string;
  path?: string;
};

const HELP_TOPICS: HelpTopic[] = [
  {
    keywords: ["adjust item", "adjust stock", "stock adjust", "adjustment"],
    title: "Adjust Item",
    path: "/inventory/adjust-item",
    content: `**Adjust Item** corrects stock quantities when physical count differs from system stock, or when you need to add/remove stock outside normal purchase/sale flows.

**Where:** Inventory → **Adjust Item** (\`/inventory/adjust-item\`)

**How it works:**
1. Open the adjustment list — view pending/approved adjustments, search, and filter by part or type (add/remove).
2. Click **Add New** to create an adjustment.
3. Set **Date**, **Subject**, and optional **Notes**.
4. Toggle **Add Inventory**:
   - **On** — stock increases (select store; items go into that store).
   - **Off** — stock decreases (removal adjustment).
5. Add line items: select **Part**, enter **Quantity**, **Rate/Cost**, and optionally **Rack/Shelf** location.
6. Save — adjustment is created in **pending** status.
7. **Approve** the adjustment from the list to apply stock changes to inventory.

**Tips:**
- Use positive quantity for additions and the removal flow when reducing stock.
- Assign rack/shelf on approval when locating stock in the store.
- Only pending adjustments can be edited or deleted.`,
  },
  {
    keywords: ["stock in out", "stock in/out", "stock movement"],
    title: "Stock In/Out",
    path: "/inventory/stock-in-out",
    content: `**Stock In/Out** records manual stock movements (goods in or out) with reason and store location.

**Where:** Inventory → **Stock In/Out** (\`/inventory/stock-in-out\`)

Record movements with part, quantity, store, and narration. Use for non-purchase/non-sale stock events.`,
  },
  {
    keywords: ["sales inquiry", "sale inquiry"],
    title: "Sales Inquiry",
    path: "/sales/inquiry",
    content: `**Sales Inquiry** is for looking up parts and planning demand before creating quotations or invoices.

**Workflow:**
1. Enter customer and inquiry date.
2. Use part lookup rows to search and add items (Alt+Z adds a new row).
3. Set quantities per line.
4. Convert selected items to **Invoice**, **Quotation**, or **Local Purchase (DPO)** using top-right buttons.
5. Use **Back to Inquiry** when returning from a conversion form — selections are preserved.`,
  },
  {
    keywords: ["sales quotation", "quotation status", "initiate quotation"],
    title: "Sales Quotation",
    path: "/sales/quotation",
    content: `**Sales Quotation** workflow:
- New quotations start as **pending** (editable).
- **Approve** when ready — or revert approved → pending.
- From **approved**, use **Initiate** to convert to a sales invoice (auto-approved).
- Converted invoices show as **Quotation Invoice** in the invoice list.`,
  },
  {
    keywords: ["direct purchase", "local purchase", "dpo"],
    title: "Local Purchase (DPO)",
    path: "/inventory/direct-purchase-order",
    content: `**Direct Purchase Order (Local Purchase)** records local supplier purchases and updates stock.

**Where:** Inventory → **Local Purchase** (\`/inventory/direct-purchase-order\`)

Create DPO with supplier, store, items, and expenses. Can be opened pre-filled from Sales Inquiry conversion.`,
  },
  {
    keywords: ["purchase import", "import inquiry"],
    title: "Purchase Import",
    path: "/purchase-import/inquiry",
    content: `**Purchase Import** handles international supplier inquiries and import workflow.

Tabs: Inquiry → Quotation → Costing → History.
Inquiry: select suppliers, parts, KHI/ISB/Other quantities, editable inquiry date. Status pending → confirm locks editing.`,
  },
  {
    keywords: [
      "most selling",
      "top selling",
      "best selling",
      "least selling",
      "least demanding",
      "demanding items",
      "most revenue",
      "least revenue",
      "profitability",
      "most profit",
      "least profit",
      "financial year",
      "fiscal year",
      "current year",
      "item sales analytics",
      "selling items report",
      "top items",
      "pdf report",
    ],
    title: "Item Sales Analytics",
    path: "/reports",
    content: `**Item Sales Analytics** ranks parts from approved sales invoices for any date range.

**Report types:**
- **Most selling / demanding** — highest quantity sold
- **Least selling / demanding** — lowest quantity sold (among items with sales in period)
- **Most revenue** — highest sales amount
- **Least revenue** — lowest sales amount
- **Max profitability** — highest profit (Revenue − Cost)
- **Least profitability** — lowest profit

**Steps:** Reports → Sales Reports → **Item Sales Analytics** → pick report type & dates → Generate → Print PDF

**Period options:**
- Any single month (e.g. May 2026)
- **Current Pakistan financial year** (1 Jul – today) — default when no month given
- **Previous financial year** (full Jul–Jun)
- Explicit: "FY 2025-26" or "financial year 2025"
- Custom from/to dates in Reports UI

Pakistan financial year: **1 July to 30 June**.

**AI chat examples:**
• "Most selling items in May"
• "Least revenue for current financial year"
• "Max profitability for FY 2025-26"
• "Most selling items" (uses current FY)`,
  },
  {
    keywords: [
      "customer wise",
      "customer-wise",
      "customerwise",
      "customer sales report",
      "sale report by customer",
      "customer wise sale",
      "customer sales record",
      "sales by customer",
      "customer wise most",
      "customer wise least",
      "customer wise revenue",
      "customer wise profit",
    ],
    title: "Customer-wise Sales Report",
    path: "/reports",
    content: `**Customer-wise Sales Report** shows all approved sales invoices for one customer in a date range.

**AI chat flow:**
1. Say e.g. "I want customer wise sale report"
2. Choose **Walk-in** or **Party** (registered credit customer)
3. **Party** — select customer from the list
4. **Walk-in** — type the customer name as on invoices
5. View summary in chat → **Print PDF** for full invoice line details

Default period: **current Pakistan financial year** (1 Jul – today). You can also say "customer wise sale report for May" or "for current financial year".

**Examples:**
• "Customer wise sale report"
• "Customer wise most selling items"
• "Customer wise least revenue for current financial year"
• "Customer wise max profitability for FY 2025-26"

**Item report types (per customer):**
- Most / least selling items
- Most / least revenue items
- Max / least profitability`,
  },
  {
    keywords: [
      "last invoice",
      "latest invoice",
      "most recent invoice",
      "newest invoice",
    ],
    title: "Customer Last Invoice Lookup",
    path: "/sales/invoice",
    content: `Ask the AI for a customer's **latest sales invoice** by name.

**Examples:**
• "What is the last invoice of customer NETCO (PVT) LTD"
• "Latest invoice for Honda Plaza"

Returns invoice number, date, status, payment, and totals from live data.

**Two-step:** You can also say "I want the last invoice of a customer" — then reply with just the customer name (e.g. NETCO (PVT) LTD).`,
  },
  {
    keywords: [
      "stock of",
      "stock for",
      "item stock",
      "part stock",
      "current stock",
      "available stock",
      "how much stock",
      "inventory of",
      "quantity of part",
    ],
    title: "Item Stock Lookup",
    path: "/inventory/current-stock",
    content: `Ask the AI for **live stock** of a specific part or item.

**Examples:**
• "What is the stock of part ABC-123"
• "How much stock do we have for oil filter"
• "Show inventory for item 12345"

Returns current stock, available (after reservations), reserved qty, reorder level, and low/out-of-stock status.

**Two-step:** Say "I want stock of an item" — then reply with the part number or description, or pick from the search list.`,
  },
  {
    keywords: ["payment voucher", "receipt voucher", "view voucher", "pv ", "rv "],
    title: "Vouchers",
    path: "/vouchers",
    content: `**Vouchers** record accounting transactions:
- **PV** — Payment (money out)
- **RV** — Receipt (money in)
- **JV** — Journal
- **CV** — Contra (cash/bank transfer)

**View Vouchers:** filter by type, date, main group → sub group → account (cascading). For Payment/Receipt only, filter **Mode**: Cash or Online based on cash/bank account selected.`,
  },
  {
    keywords: ["subgroup", "accounting", "chart of account"],
    title: "Accounting",
    path: "/accounting",
    content: `**Accounting** uses Main Groups → Subgroups → Accounts.

Add subgroup with **Subgroup Name** (no separate code on add form). Vouchers and reports pull balances from this chart.`,
  },
];

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getLocalHelpForQuery(query: string): string | null {
  const q = normalizeQuery(query);
  if (!q) return null;

  // Data lookups / report requests are handled in chat — not static help
  if (
    isCustomerInvoiceLookupQuery(query) ||
    isCustomerWiseReportQuery(query) ||
    isItemStockLookupQuery(query)
  ) {
    return null;
  }

  const isHelpQuestion =
    /^(how|what|explain|guide|help|tell me|describe)/.test(q) ||
    q.includes("how do") ||
    q.includes("how does") ||
    q.includes("how to") ||
    q.includes("how can") ||
    q.includes("like to know") ||
    q.includes("want to know") ||
    q.includes("would like to know") ||
    (q.includes("know about") && !extractCustomerNameFromInvoiceQuery(query)) ||
    q.includes("work") ||
    q.includes("works");

  if (!isHelpQuestion) return null;

  let best: HelpTopic | null = null;
  let bestScore = 0;

  for (const topic of HELP_TOPICS) {
    for (const keyword of topic.keywords) {
      if (q.includes(keyword) && keyword.length > bestScore) {
        best = topic;
        bestScore = keyword.length;
      }
    }
  }

  if (!best) return null;

  const pathLine = best.path
    ? `\n\n📍 **Open:** \`${best.path}\` — say "go to ${best.title.toLowerCase()}" to navigate there.`
    : "";

  return `📖 **${best.title}**\n\n${best.content}${pathLine}`;
}
