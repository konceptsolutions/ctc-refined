/**
 * Hierarchical permission catalog: module → page → section/field/action.
 * Keys are flat strings with hierarchical meaning.
 */

export type PermissionKind = "module" | "page" | "section" | "field" | "action";

export interface PermissionNode {
  key: string;
  label: string;
  kind: PermissionKind;
  /** Route path prefix for module/page gating */
  path?: string;
  /** Tab id within a module route */
  tab?: string;
  children?: PermissionNode[];
}

const CRUD = (prefix: string): PermissionNode[] => [
  { key: `action.${prefix}.create`, label: "Create", kind: "action" },
  { key: `action.${prefix}.edit`, label: "Edit", kind: "action" },
  { key: `action.${prefix}.delete`, label: "Delete", kind: "action" },
  { key: `action.${prefix}.status`, label: "Change Status", kind: "action" },
  { key: `action.${prefix}.export`, label: "Export", kind: "action" },
  { key: `action.${prefix}.print`, label: "Print", kind: "action" },
  { key: `action.${prefix}.approve`, label: "Approve", kind: "action" },
  { key: `action.${prefix}.menu.more`, label: "Action Menu", kind: "action" },
];

const page = (
  id: string,
  label: string,
  path: string,
  tab: string | undefined,
  extras: PermissionNode[] = [],
): PermissionNode => ({
  key: `page.${id}`,
  label,
  kind: "page",
  path,
  tab,
  children: [...CRUD(id), ...extras],
});

export const PERMISSION_CATALOG: PermissionNode[] = [
  {
    key: "module.dashboard",
    label: "Dashboard",
    kind: "module",
    path: "/",
    children: [
      page("dashboard.home", "Home", "/", undefined, [
        { key: "section.dashboard.home.stats", label: "Stats Widgets", kind: "section" },
        { key: "section.dashboard.home.activity", label: "Recent Activity", kind: "section" },
      ]),
    ],
  },
  {
    key: "module.partentry",
    label: "Part Entry",
    kind: "module",
    path: "/partentry",
    children: [
      page("partentry.entry", "Parts Entry", "/partentry", undefined, [
        { key: "section.partentry.entry.basic", label: "Basic Info", kind: "section" },
        { key: "section.partentry.entry.pricing", label: "Pricing", kind: "section" },
        { key: "field.partentry.entry.cost", label: "Cost", kind: "field" },
        { key: "field.partentry.entry.sellingPrice", label: "Selling Price", kind: "field" },
      ]),
      page("partentry.itemslist", "Items List", "/partentry/itemslist", undefined, [
        { key: "field.partentry.itemslist.cost", label: "Cost Column", kind: "field" },
        { key: "field.partentry.itemslist.price", label: "Price Column", kind: "field" },
      ]),
      page("partentry.attributes", "Attributes", "/partentry/attributes", undefined),
      page("partentry.models", "Models", "/partentry/models", undefined),
      page("partentry.details-search", "Details Search", "/partentry/details-search", undefined),
    ],
  },
  {
    key: "module.inventory",
    label: "Inventory Management",
    kind: "module",
    path: "/inventory",
    children: [
      page("inventory.dashboard", "Dashboard", "/inventory/dashboard", "dashboard", [
        { key: "section.inventory.dashboard.charts", label: "Charts", kind: "section" },
        { key: "section.inventory.dashboard.stats", label: "Stats", kind: "section" },
      ]),
      page("inventory.purchase-inquiry", "Purchase Inquiry", "/inventory/purchase-inquiry", "purchase-inquiry", [
        { key: "field.inventory.purchase-inquiry.cost", label: "Cost", kind: "field" },
        { key: "section.inventory.purchase-inquiry.supplier", label: "Supplier Details", kind: "section" },
      ]),
      page("inventory.current-stock", "Current Stock", "/inventory/current-stock", "current-stock", [
        { key: "field.inventory.current-stock.cost", label: "Cost", kind: "field" },
        { key: "field.inventory.current-stock.sellingPrice", label: "Selling Price", kind: "field" },
        { key: "field.inventory.current-stock.qty", label: "Quantity", kind: "field" },
      ]),
      page("inventory.store-management", "Store Management", "/inventory/store-management", "store-management"),
      page("inventory.stock-in-out", "Stock Movement", "/inventory/stock-in-out", "stock-in-out"),
      page("inventory.adjust-item", "Adjust Item", "/inventory/adjust-item", "adjust-item"),
      page("inventory.multi-dimensional", "Multi-Dimensional", "/inventory/multi-dimensional", "multi-dimensional"),
      page("inventory.stock-analysis", "Stock Analysis", "/inventory/stock-analysis", "stock-analysis"),
      page("inventory.local-inquiry", "Local Inquiry", "/inventory/local-inquiry", "local-inquiry"),
      page("inventory.direct-purchase-order", "Local Purchase", "/inventory/direct-purchase-order", "direct-purchase-order", [
        { key: "field.inventory.direct-purchase-order.price", label: "Purchase Price", kind: "field" },
      ]),
      page("inventory.dpo-return", "DPO Return", "/inventory/dpo-return", "dpo-return"),
    ],
  },
  {
    key: "module.transfer",
    label: "Transfer",
    kind: "module",
    path: "/transfer",
    children: [
      page("transfer.transfer-in", "Transfer In", "/transfer/transfer-in", "transfer-in"),
      page("transfer.transfer-out", "Transfer Out", "/transfer/transfer-out", "transfer-out"),
    ],
  },
  {
    key: "module.store",
    label: "Store",
    kind: "module",
    path: "/store",
    children: [
      page("store.orders", "Orders", "/store/orders", "orders"),
      page("store.rack-shelf", "Racks & Shelves", "/store/rack-shelf", "rack-shelf"),
    ],
  },
  {
    key: "module.pricing",
    label: "Pricing & Costing",
    kind: "module",
    path: "/pricing-costing",
    children: [
      page("pricing.home", "Pricing & Costing", "/pricing-costing", undefined, [
        { key: "section.pricing.home.cost", label: "Cost Section", kind: "section" },
        { key: "section.pricing.home.selling", label: "Selling Prices", kind: "section" },
        { key: "field.pricing.home.cost", label: "Cost", kind: "field" },
        { key: "field.pricing.home.priceA", label: "Price A", kind: "field" },
        { key: "field.pricing.home.priceB", label: "Price B", kind: "field" },
        { key: "field.pricing.home.priceM", label: "Price M", kind: "field" },
      ]),
    ],
  },
  {
    key: "module.sales",
    label: "Sales & Distribution",
    kind: "module",
    path: "/sales",
    children: [
      page("sales.inquiry", "Inquiry", "/sales/inquiry", "inquiry"),
      page("sales.quotation", "Quotation", "/sales/quotation", "quotation", [
        { key: "field.sales.quotation.discount", label: "Discount", kind: "field" },
        { key: "field.sales.quotation.unitPrice", label: "Unit Price", kind: "field" },
        { key: "section.sales.quotation.totals", label: "Totals", kind: "section" },
      ]),
      page("sales.invoice", "Invoice", "/sales/invoice", "invoice", [
        { key: "field.sales.invoice.discount", label: "Discount", kind: "field" },
        { key: "field.sales.invoice.unitPrice", label: "Unit Price", kind: "field" },
        { key: "field.sales.invoice.cost", label: "Cost", kind: "field" },
        { key: "section.sales.invoice.totals", label: "Totals", kind: "section" },
        { key: "section.sales.invoice.payment", label: "Payment Info", kind: "section" },
      ]),
      page("sales.returns", "Returns", "/sales/returns", "returns"),
      page("sales.distributor-aging", "Aging Report", "/sales/distributor-aging", "distributor-aging", [
        { key: "field.sales.distributor-aging.balance", label: "Balance", kind: "field" },
      ]),
      page("sales.receivable-reminders", "Receivables", "/sales/receivable-reminders", "receivable-reminders"),
    ],
  },
  {
    key: "module.purchase-import",
    label: "Purchase Import",
    kind: "module",
    path: "/purchase-import",
    children: [
      page("purchase-import.inquiry", "Inquiry", "/purchase-import/inquiry", "inquiry"),
      page("purchase-import.quotation", "Quotation", "/purchase-import/quotation", "quotation", [
        { key: "field.purchase-import.quotation.fc", label: "FC Amount", kind: "field" },
        { key: "field.purchase-import.quotation.lc", label: "LC Amount", kind: "field" },
        { key: "field.purchase-import.quotation.rate", label: "Exchange Rate", kind: "field" },
      ]),
      page("purchase-import.revise-quotation", "Revise Quotation", "/purchase-import/revise-quotation", "revise-quotation"),
      page("purchase-import.confirm-quotation", "Confirm Quotation", "/purchase-import/confirm-quotation", "confirm-quotation"),
      page("purchase-import.purchase-order", "Purchase Order", "/purchase-import/purchase-order", "purchase-order"),
      page("purchase-import.purchase-invoice", "Purchase Invoice", "/purchase-import/purchase-invoice", "purchase-invoice"),
      page("purchase-import.back-order-summary", "Back Order Summary", "/purchase-import/back-order-summary", "back-order-summary"),
    ],
  },
  {
    key: "module.accounting",
    label: "Accounting",
    kind: "module",
    path: "/accounting",
    children: [
      page("accounting.chart", "Chart of Accounts", "/accounting", undefined, [
        { key: "section.accounting.chart.groups", label: "Groups", kind: "section" },
        { key: "section.accounting.chart.accounts", label: "Accounts", kind: "section" },
        { key: "field.accounting.chart.balance", label: "Balance", kind: "field" },
      ]),
    ],
  },
  {
    key: "module.financial",
    label: "Financial Statements",
    kind: "module",
    path: "/financial-statements",
    children: [
      page("financial.general-journal", "General Journal", "/financial-statements", "general-journal"),
      page("financial.trial-balance", "Trial Balance", "/financial-statements", "trial-balance"),
      page("financial.income-statement", "Income Statement", "/financial-statements", "income-statement"),
      page("financial.balance-sheet", "Balance Sheet", "/financial-statements", "balance-sheet"),
      page("financial.ledgers", "Ledgers", "/financial-statements", "ledgers", [
        { key: "field.financial.ledgers.balance", label: "Balance", kind: "field" },
      ]),
      page(
        "financial.international-supplier-ledgers",
        "International Supplier Ledger",
        "/financial-statements",
        "international-supplier-ledgers",
      ),
      page(
        "financial.supplier-customer-comparison",
        "Supplier Customer Comparison",
        "/financial-statements",
        "supplier-customer-comparison",
      ),
      page("financial.daily-closing", "Daily Closing", "/financial-statements", "daily-closing"),
    ],
  },
  {
    key: "module.vouchers",
    label: "Vouchers",
    kind: "module",
    path: "/vouchers",
    children: [
      page("vouchers.manage", "Voucher Management", "/vouchers", undefined, [
        { key: "section.vouchers.manage.journal", label: "Journal Voucher", kind: "section" },
        { key: "section.vouchers.manage.payment", label: "Payment Voucher", kind: "section" },
        { key: "section.vouchers.manage.receipt", label: "Receipt Voucher", kind: "section" },
        { key: "field.vouchers.manage.amount", label: "Amount", kind: "field" },
        { key: "field.vouchers.manage.fc", label: "FC Amount", kind: "field" },
      ]),
    ],
  },
  {
    key: "module.employees",
    label: "Employees",
    kind: "module",
    path: "/employees",
    children: [
      page("employees.staff", "Staff", "/employees/staff", "staff", [
        { key: "field.employees.staff.salary", label: "Salary", kind: "field" },
        { key: "section.employees.staff.contact", label: "Contact Info", kind: "section" },
      ]),
      page("employees.payroll", "Payroll", "/employees/payroll", "payroll"),
      page("employees.loans-advances", "Loans & Advances", "/employees/loans-advances", "loans-advances"),
    ],
  },
  {
    key: "module.manage",
    label: "Manage",
    kind: "module",
    path: "/manage",
    children: [
      page("manage.suppliers", "Suppliers", "/manage/suppliers", "suppliers", [
        { key: "section.manage.suppliers.contact", label: "Contact", kind: "section" },
        { key: "section.manage.suppliers.bank", label: "Bank Details", kind: "section" },
        { key: "field.manage.suppliers.balance", label: "Balance", kind: "field" },
      ]),
      page("manage.customers", "Customers", "/manage/customers", "customers", [
        { key: "section.manage.customers.contact", label: "Contact", kind: "section" },
        { key: "section.manage.customers.credit", label: "Credit Limits", kind: "section" },
        { key: "field.manage.customers.balance", label: "Balance", kind: "field" },
      ]),
    ],
  },
  {
    key: "module.settings",
    label: "Settings",
    kind: "module",
    path: "/settings",
    children: [
      page("settings.users", "Users Management", "/settings/users", "users", [
        { key: "field.settings.users.loginHours", label: "Login Hours", kind: "field" },
        { key: "section.settings.users.security", label: "Security", kind: "section" },
      ]),
      page("settings.activity", "User Activity", "/settings/activity", "activity"),
      page("settings.roles", "Roles & Permissions", "/settings/roles", "roles"),
    ],
  },
];

/** Flatten all keys under a node (including the node itself). */
export function collectKeys(node: PermissionNode): string[] {
  const keys = [node.key];
  for (const child of node.children || []) {
    keys.push(...collectKeys(child));
  }
  return keys;
}

export function getAllPermissionKeys(): string[] {
  return PERMISSION_CATALOG.flatMap(collectKeys);
}

export function getValidPermissionSet(): Set<string> {
  return new Set(["*", ...getAllPermissionKeys()]);
}

/** Parent key lookup built once from the catalog tree. */
let _parentMap: Map<string, string> | null = null;
function getParentMap(): Map<string, string> {
  if (_parentMap) return _parentMap;
  _parentMap = new Map();
  const walk = (nodes: PermissionNode[], parentKey?: string) => {
    for (const n of nodes) {
      if (parentKey) _parentMap!.set(n.key, parentKey);
      if (n.children?.length) walk(n.children, n.key);
    }
  };
  walk(PERMISSION_CATALOG);
  return _parentMap;
}

/**
 * When a page/field/action is granted, also grant parent page + module keys.
 * Without this, sidebar/route checks for `module.*` fail even if pages were granted.
 */
export function expandPermissionAncestors(keys: string[]): string[] {
  if (!keys?.length) return [];
  if (keys.includes("*")) return ["*"];
  const set = new Set(keys.filter(Boolean));
  const parents = getParentMap();
  for (const key of [...set]) {
    let p = parents.get(key);
    while (p) {
      set.add(p);
      p = parents.get(p);
    }
  }
  return [...set];
}

function isDescendantOf(
  key: string,
  ancestor: string,
  parents: Map<string, string>,
): boolean {
  let cur: string | undefined = key;
  while (cur) {
    const parent = parents.get(cur);
    if (parent === ancestor) return true;
    cur = parent;
  }
  return false;
}

/**
 * Hierarchical permission check:
 * - exact key or *
 * - parent of required is granted (module covers its pages/actions)
 * - any granted key is under required (page grant satisfies module check)
 */
export function hasPermissionKey(
  granted: string[] | undefined | null,
  required: string | undefined | null,
): boolean {
  if (!required) return true;
  const expanded = expandPermissionAncestors(granted || []);
  if (expanded.includes("*") || expanded.includes(required)) return true;
  const parents = getParentMap();
  let p = parents.get(required);
  while (p) {
    if (expanded.includes(p)) return true;
    p = parents.get(p);
  }
  for (const g of expanded) {
    if (isDescendantOf(g, required, parents)) return true;
  }
  return false;
}

/** True when the list looks like the hierarchical catalog (not legacy coarse keys). */
export function looksLikeCatalogPermissions(keys: string[]): boolean {
  if (!keys?.length) return false;
  if (keys.includes("*")) return true;
  return keys.some(
    (k) =>
      k.startsWith("module.") ||
      k.startsWith("page.") ||
      k.startsWith("action.") ||
      k.startsWith("field.") ||
      k.startsWith("section."),
  );
}

/** All keys under matching module keys (e.g. module.sales). */
export function keysForModules(moduleKeys: string[]): string[] {
  const set = new Set<string>();
  for (const mod of PERMISSION_CATALOG) {
    if (moduleKeys.includes(mod.key)) {
      collectKeys(mod).forEach((k) => set.add(k));
    }
  }
  return [...set];
}

/** Keys for specific pages under a module (page ids without "page." prefix). */
export function keysForPages(pageIds: string[]): string[] {
  const want = new Set(pageIds.map((id) => (id.startsWith("page.") ? id : `page.${id}`)));
  const set = new Set<string>();

  const walk = (nodes: PermissionNode[]) => {
    for (const n of nodes) {
      if (n.kind === "page" && want.has(n.key)) {
        collectKeys(n).forEach((k) => set.add(k));
        // Also include parent module key
        const modKey = `module.${n.key.replace(/^page\./, "").split(".")[0]}`;
        // Better: find parent while walking
      }
      if (n.children) walk(n.children);
    }
  };

  for (const mod of PERMISSION_CATALOG) {
    let hit = false;
    const gather = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        if (n.kind === "page" && want.has(n.key)) {
          hit = true;
          collectKeys(n).forEach((k) => set.add(k));
        }
        if (n.children) gather(n.children);
      }
    };
    gather(mod.children || []);
    if (hit) set.add(mod.key);
  }

  return [...set];
}

export function findModuleByPath(pathname: string): PermissionNode | null {
  if (pathname === "/" || pathname === "") {
    return PERMISSION_CATALOG.find((m) => m.path === "/") || null;
  }
  // Longest path match wins
  let best: PermissionNode | null = null;
  let bestLen = -1;
  for (const mod of PERMISSION_CATALOG) {
    if (!mod.path || mod.path === "/") continue;
    if (pathname === mod.path || pathname.startsWith(`${mod.path}/`)) {
      if (mod.path.length > bestLen) {
        best = mod;
        bestLen = mod.path.length;
      }
    }
  }
  return best;
}

export function findPageByPath(pathname: string): PermissionNode | null {
  const mod = findModuleByPath(pathname);
  if (!mod) return null;

  const pages = (mod.children || []).filter((c) => c.kind === "page");
  if (pages.length === 0) return null;

  // Exact path match first
  const exact = pages.find((p) => p.path === pathname);
  if (exact) return exact;

  // Tab-style: /sales/invoice → page with tab invoice
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const byTab = pages.find((p) => p.tab === last);
  if (byTab) return byTab;

  // Module root → first page or page whose path equals module path
  if (pathname === mod.path || pathname === `${mod.path}/`) {
    return pages.find((p) => p.path === mod.path) || pages[0];
  }

  // Prefix match on page path
  const byPrefix = pages
    .filter((p) => p.path && (pathname === p.path || pathname.startsWith(`${p.path}/`)))
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))[0];
  return byPrefix || null;
}

/** Sidebar path → module permission key */
export const SIDEBAR_MODULE_KEYS: Record<string, string> = {
  "/": "module.dashboard",
  "/partentry": "module.partentry",
  "/inventory": "module.inventory",
  "/transfer": "module.transfer",
  "/store": "module.store",
  "/pricing-costing": "module.pricing",
  "/sales": "module.sales",
  "/purchase-import": "module.purchase-import",
  "/accounting": "module.accounting",
  "/financial-statements": "module.financial",
  "/vouchers": "module.vouchers",
  "/employees": "module.employees",
  "/manage": "module.manage",
  "/settings/users": "module.settings",
};

/**
 * Built-in role presets matching previous hardcoded allowlists
 * (full page+actions+fields under granted areas, with known action exceptions).
 */
export function getPresetPermissions(roleName: string): string[] {
  const name = roleName.trim().toLowerCase();
  if (name === "admin") return ["*"];

  if (name === "store user") {
    return [
      ...keysForPages(["inventory.current-stock"]),
      ...keysForPages(["store.orders", "store.rack-shelf"]),
    ];
  }

  if (name === "manager") {
    return keysForModules([
      "module.partentry",
      "module.inventory",
      "module.pricing",
      "module.sales",
      "module.manage",
    ]);
  }

  if (name === "accountant") {
    // Invoice/returns: view + limited actions (no create form / no status change)
    const salesLimited = keysForPages(["sales.invoice", "sales.returns"]).filter(
      (k) =>
        !k.startsWith("action.sales.invoice.create") &&
        !k.startsWith("action.sales.invoice.edit") &&
        !k.startsWith("action.sales.invoice.delete") &&
        !k.startsWith("action.sales.invoice.status") &&
        !k.startsWith("action.sales.returns.create") &&
        !k.startsWith("action.sales.returns.edit") &&
        !k.startsWith("action.sales.returns.delete") &&
        !k.startsWith("action.sales.returns.status"),
    );
    return [
      ...keysForModules(["module.accounting", "module.financial", "module.vouchers"]),
      ...salesLimited,
    ];
  }

  if (name === "sales") {
    // Can create/edit quotations & invoices, but cannot change status
    return keysForPages(["sales.quotation", "sales.invoice", "sales.returns"]).filter(
      (k) =>
        k !== "action.sales.invoice.status" &&
        k !== "action.sales.quotation.status" &&
        k !== "action.sales.returns.status",
    );
  }

  return [];
}
