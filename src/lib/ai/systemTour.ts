/**
 * Guided system tour responses for the AI assistant.
 * Keep aligned with backend/src/ai/erpKnowledge.ts
 */

export function isSystemTourQuery(query: string): boolean {
  const q = query
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return false;

  return (
    /\b(system\s+tour|product\s+tour|app\s+tour|erp\s+tour)\b/.test(q) ||
    /\b(give|start|take|show|do)\s+(me\s+)?(a\s+)?tour\b/.test(q) ||
    /\btour\s+(me|of|through|around)\b/.test(q) ||
    /\bwalk\s+me\s+through\b/.test(q) ||
    /\bshow\s+me\s+around\b/.test(q) ||
    /\bgetting\s+started\b/.test(q) ||
    /\bintroduce\s+(me\s+to\s+)?(the\s+)?(system|erp|app|modules)\b/.test(q) ||
    /\boverview\s+of\s+(the\s+)?(system|erp|modules|app)\b/.test(q) ||
    q === "tour" ||
    q.startsWith("tour ") ||
    q.endsWith(" tour")
  );
}

function detectTourModule(q: string): string | null {
  const modules: Array<{ id: string; keys: string[] }> = [
    { id: "parts", keys: ["part entry", "parts", "items list", "catalog"] },
    { id: "sales", keys: ["sales", "invoice", "quotation", "inquiry"] },
    { id: "purchase", keys: ["purchase import", "import", "local purchase", "dpo"] },
    { id: "inventory", keys: ["inventory", "stock", "transfer", "adjust"] },
    { id: "vouchers", keys: ["voucher", "receipt", "payment", "journal", "contra"] },
    { id: "accounting", keys: ["accounting", "ledger", "financial"] },
    { id: "reports", keys: ["report", "analytics"] },
    { id: "settings", keys: ["settings", "users", "roles"] },
  ];

  // Prefer longer / more specific keys
  let best: { id: string; len: number } | null = null;
  for (const m of modules) {
    for (const key of m.keys) {
      if (q.includes(key) && (!best || key.length > best.len)) {
        best = { id: m.id, len: key.length };
      }
    }
  }
  return best?.id ?? null;
}

const FULL_TOUR = `👋 Happy to show you around — here's the map of **Koncepts ERP**.

Say **"go to …"** anytime and I'll open that screen. Prefer a deep dive? Try **"tour of sales"** (or any module).

---

### 1) Dashboard — \`/\`
Your daily pulse check: KPIs, charts, recent activity. Good place to start the morning.

### 2) Part Entry — \`/partentry\`
Where the catalog lives — parts and kits.
- Left: Part No, Master Part, brand, prices, models
- Right: **Parts List** / **Kits List** (Master Part + live **Stock**)
- Missing key fields? You'll get a friendly confirm before save
- Need filters? \`/partentry/itemslist\`

### 3) Inventory — \`/inventory\`
Stock levels, stores/racks, movements, adjustments, local purchase (DPO).

### 4) Sales — \`/sales\`
Usual path: **Inquiry → Quotation → Invoice → Payment/Return**
Tip: quotations can include temporary items — save them as Parts on Initiate, or they'll skip the invoice.

### 5) Purchase Import — \`/purchase-import/inquiry\`
**Inquiry → Quotation → Revise → Confirmation → Shipments → Invoices → Back Order**
Temporary items: promote on Confirm, or they stay out of the PO.

### 6) Vouchers — \`/vouchers\`
PV / RV / JV / CV — money in and out.
Cash receipt discount example: Cr 1,700 + disc 200 → cash in hand **1,500**.

### 7) Accounting & Financials
Chart of accounts at \`/accounting\`; statements & daily closing at \`/financial-statements\`.

### 8) Reports — \`/reports\`
Sales analytics, brand-wise, customer views. Pakistan FY runs Jul–Jun.

### 9) Manage & Settings
Customers/suppliers under \`/manage\`; users, roles, backups, AI key under \`/settings\`.

---

**Where next?**
1. **go to part entry** — peek at the catalog  
2. **tour of sales** — selling cycle  
3. **tour of vouchers** — cash + discount  
4. Or just ask me anything — I'm right here.`;

const MODULE_TOURS: Record<string, string> = {
  parts: `🗺️ **Part Entry — quick tour**

1. Open \`/partentry\`
2. Fill Part No, Master Part, Brand, Description, Category, prices, Weight, Model+Qty
3. Save — if something's missing you'll get a confirm; Part No still has to be there
4. Right panel **Parts List** / **Kits List** shows Master Part + Stock
5. Heavy filtering? Use \`/partentry/itemslist\`

Say **go to part entry** and we'll jump there.`,

  sales: `🗺️ **Sales — quick tour**

1. \`/sales/inquiry\` — customer + parts (Alt+Z adds a row) → convert to Invoice / Quotation / DPO
2. \`/sales/quotation\` — pending → approve → **Initiate**  
   Temporary items: save as Parts at Initiate, or they won't hit the invoice
3. \`/sales/invoice\` — approve, stock reserve, delivery, payments
4. \`/sales/returns\` — against invoice or direct

Want me to **go to sales inquiry**?`,

  purchase: `🗺️ **Purchase — quick tour**

**Import** (\`/purchase-import/inquiry\`):  
Inquiry → Quotation → Revise → Confirmation → Shipments → Invoices → Back Order  
Temps: promote on Confirm, or they skip the PO.

**Local** (\`/inventory/direct-purchase-order\`): DPO → stock in → optional return.

Say **open purchase import** when you're ready.`,

  inventory: `🗺️ **Inventory — quick tour**

1. \`/inventory/current-stock\` — what's on hand vs reserved  
2. \`/inventory/store-management\` — stores, racks, shelves  
3. \`/inventory/stock-in-out\` — manual moves  
4. \`/inventory/adjust-item\` — count fixes (approve to post)  
5. Transfers live under \`/transfer\`

**go to current stock** if you want to look now.`,

  vouchers: `🗺️ **Vouchers — quick tour**

Tabs: Payment · Receipt · Journal · Contra

**Cash receipt with discount**  
Enter Cr 1,700 and Discount 200 → we post Dr Cash **1,500**, Dr Discount **200**, Cr Party **1,700**.

Filters on the list: type, dates, accounts, Cash/Online for PV/RV.

Say **go to vouchers** and I'll open it.`,

  accounting: `🗺️ **Accounting — quick tour**

1. \`/accounting\` — Main Groups → Subgroups → Accounts  
2. Day-to-day entries in \`/vouchers\`  
3. Check ledgers/balances  
4. \`/financial-statements\` for P&L, balance sheet, daily closing  

**go to accounting** or **go to financial statements** — your call.`,

  reports: `🗺️ **Reports — quick tour**

\`/reports\` has sales analytics (most/least selling, revenue, profitability).  
Pakistan FY is **1 Jul – 30 Jun**.

Or just ask me in chat — e.g. "most selling items this year".

**go to reports** whenever you like.`,

  settings: `🗺️ **Settings — quick tour**

\`/settings\`: users, roles, approvals, logs, backup, company profile, WhatsApp, and the LongCat AI key.

Say **go to settings** or **AI settings**.`,
};

/**
 * Returns a guided tour response, or null if the query is not a tour request.
 */
export function getSystemTourResponse(query: string): string | null {
  if (!isSystemTourQuery(query)) return null;

  const q = query
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const moduleId = detectTourModule(q);
  const explicitFullTour =
    /\b(system|erp|app|product|entire|whole|full|complete)\s+tour\b/.test(q) ||
    /\boverview\s+of\s+(the\s+)?(system|erp|modules|app)\b/.test(q) ||
    /\b(getting started|show me around|introduce)\b/.test(q) ||
    q === "tour" ||
    /^(give|start|take|show|do)\s+(me\s+)?(a\s+)?tour$/.test(q);

  // "tour of sales" / "sales tour" → module walkthrough
  if (moduleId && !explicitFullTour) {
    return MODULE_TOURS[moduleId] || FULL_TOUR;
  }

  return FULL_TOUR;
}
