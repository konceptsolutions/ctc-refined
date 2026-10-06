import { Response, NextFunction } from "express";
import {
  ActivityActionType,
  getClientIp,
  logActivity,
  resolveStorePerformer,
  wasActivityLogged,
  withOperatorAttribution,
} from "../utils/activityLogger";
import { AuthRequest } from "./authMiddleware";
import prisma from "../config/database";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DETAIL_LINE_LIMIT = 20;

const SKIP_PATH_FRAGMENTS = [
  "/activity-logs",
  "/auth/login",
  "/auth/forgot-password",
  "/auth/change-password",
];

/**
 * POST endpoints that are reads/queries (not creates). Logging these as "create"
 * is wrong — e.g. opening Inquiry Edit loads parts-sales via POST.
 */
const SKIP_QUERY_POST_SEGMENTS = new Set([
  "parts-sales",
  "part-sales",
  "cost-lookup",
  "expected-arrivals",
  "search",
  "advanced-search",
  "lookup",
  "batch-lookup",
  "filter",
  "query",
  "preview",
  "validate",
  "calculate",
  "compute",
  "report",
  "reports",
  "export",
  "print",
]);

function shouldSkipActivity(method: string, apiPath: string): boolean {
  const path = `/${apiPath}`.toLowerCase();
  if (SKIP_PATH_FRAGMENTS.some((frag) => path.includes(frag))) {
    return true;
  }

  if (method === "POST") {
    const segments = apiPath.split("/").filter(Boolean).map((s) => s.toLowerCase());
    if (segments.some((seg) => SKIP_QUERY_POST_SEGMENTS.has(seg))) {
      return true;
    }
    // Nested cost-lookup/batch style paths
    if (path.includes("/cost-lookup/") || path.includes("/parts-sales")) {
      return true;
    }
  }

  return false;
}

/** Top-level API mount → module display name */
const MODULE_LABELS: Record<string, string> = {
  parts: "Part Entry",
  dropdowns: "Part Entry",
  inventory: "Inventory",
  expenses: "Expenses",
  accounting: "Accounting",
  financial: "Financial",
  "public-financial": "Financial",
  "public-income-statement": "Financial",
  customers: "Customers",
  suppliers: "Suppliers",
  employees: "Employees",
  reports: "Reports",
  users: "Users",
  roles: "Roles",
  "approval-flows": "Approvals",
  backups: "Backup",
  "company-profile": "Company",
  "whatsapp-settings": "Settings",
  "longcat-settings": "Settings",
  "ai-assistant": "AI",
  vouchers: "Vouchers",
  getVouchers: "Vouchers",
  sales: "Sales",
  "sales-returns": "Sales Returns",
  "dpo-returns": "DPO Returns",
  "stock-details": "Inventory",
  "advanced-search": "Search",
  "purchase-import": "Purchase Import",
  "parts-dropdown": "Part Entry",
  email: "Email",
};

/**
 * Nested resource segment → entity identity (module comes from top-level mount)
 */
const RESOURCE_MAP: Record<string, { entityType: string; entityLabel: string }> =
  {
    // Purchase import
    requests: {
      entityType: "purchase_inquiry",
      entityLabel: "Inquiry",
    },
    quotations: {
      entityType: "purchase_quotation",
      entityLabel: "Quotation",
    },
    "purchase-orders": {
      entityType: "purchase_order",
      entityLabel: "Purchase Order",
    },
    pos: {
      entityType: "purchase_order",
      entityLabel: "Purchase Order",
    },
    // Sales
    invoices: {
      entityType: "sales_invoice",
      entityLabel: "Sales Invoice",
    },
    delivery: {
      entityType: "sales_invoice_delivery",
      entityLabel: "Sales Invoice Stock Out",
    },
    inquiries: {
      entityType: "sales_inquiry",
      entityLabel: "Sales Inquiry",
    },
    challans: {
      entityType: "delivery_challan",
      entityLabel: "Delivery Challan",
    },
    "delivery-challans": {
      entityType: "delivery_challan",
      entityLabel: "Delivery Challan",
    },
    // Inventory / Store
    dpo: {
      entityType: "direct_purchase_order",
      entityLabel: "Direct Purchase Order",
    },
    "direct-purchase-orders": {
      entityType: "direct_purchase_order",
      entityLabel: "Direct Purchase Order",
    },
    transfers: {
      entityType: "stock_transfer",
      entityLabel: "Stock Transfer",
    },
    locations: {
      entityType: "stock_location",
      entityLabel: "PO Location Assign",
    },
    receive: {
      entityType: "purchase_order_receive",
      entityLabel: "Import Purchase Order",
    },
    confirm: {
      entityType: "purchase_quotation",
      entityLabel: "Quotation",
    },
    unconfirm: {
      entityType: "purchase_quotation",
      entityLabel: "Quotation",
    },
    revise: {
      entityType: "purchase_quotation",
      entityLabel: "Quotation",
    },
    "convert-to-po": {
      entityType: "purchase_order",
      entityLabel: "Purchase Order",
    },
    adjustments: {
      entityType: "stock_adjustment",
      entityLabel: "Stock Adjustment",
    },
    approve: {
      entityType: "stock_adjustment",
      entityLabel: "Stock Adjustment",
    },
    "update-location": {
      entityType: "stock_location",
      entityLabel: "Rack/Shelf Location",
    },
    "transfer-location": {
      entityType: "stock_location",
      entityLabel: "Rack/Shelf Location",
    },
    "sync-part-rack-shelf": {
      entityType: "stock_location",
      entityLabel: "Rack/Shelf Location",
    },
    "part-rack-shelf": {
      entityType: "stock_location",
      entityLabel: "Rack/Shelf Location",
    },
    movements: {
      entityType: "stock_movement",
      entityLabel: "Stock Movement",
    },
    // Accounting
    accounts: {
      entityType: "account",
      entityLabel: "Account",
    },
    "main-groups": {
      entityType: "main_group",
      entityLabel: "Main Group",
    },
    subgroups: {
      entityType: "subgroup",
      entityLabel: "Subgroup",
    },
    // Employees
    payroll: {
      entityType: "payroll",
      entityLabel: "Payroll",
    },
    "loan-advance": {
      entityType: "loan_advance",
      entityLabel: "Loan/Advance",
    },
    "loan-advances": {
      entityType: "loan_advance",
      entityLabel: "Loan/Advance",
    },
    "payroll-transactions": {
      entityType: "payroll",
      entityLabel: "Payroll",
    },
    "stock-verification-dates": {
      entityType: "stock_verification",
      entityLabel: "Stock Verification",
    },
    // Core masters
    vouchers: {
      entityType: "voucher",
      entityLabel: "Voucher",
    },
    parts: { entityType: "part", entityLabel: "Part" },
    brands: { entityType: "brand", entityLabel: "Brand" },
    categories: { entityType: "category", entityLabel: "Category" },
    subcategories: {
      entityType: "subcategory",
      entityLabel: "Subcategory",
    },
    applications: {
      entityType: "application",
      entityLabel: "Application",
    },
    models: { entityType: "model", entityLabel: "Model" },
    prices: { entityType: "part_price", entityLabel: "Part Price" },
    "bulk-update-prices": {
      entityType: "part_price",
      entityLabel: "Part Prices",
    },
    "make-kit": { entityType: "part_kit", entityLabel: "Kit" },
    "break-kit": { entityType: "part_kit", entityLabel: "Kit" },
    kits: { entityType: "part_kit", entityLabel: "Kit" },
    customers: { entityType: "customer", entityLabel: "Customer" },
    suppliers: { entityType: "supplier", entityLabel: "Supplier" },
    employees: { entityType: "employee", entityLabel: "Employee" },
    users: { entityType: "user", entityLabel: "User" },
    roles: { entityType: "role", entityLabel: "Role" },
    backups: { entityType: "backup", entityLabel: "Backup" },
  };

const LABEL_KEYS = [
  "voucherNumber",
  "invoiceNumber",
  "invoiceNo",
  "challanNumber",
  "challanNo",
  "orderNumber",
  "orderNo",
  "poNumber",
  "po_number",
  "poNo",
  "dpoNumber",
  "dpo_number",
  "dpo_no",
  "transferNumber",
  "transfer_number",
  "adjustmentNo",
  "adjustment_no",
  "subject",
  "grnNumber",
  "requestNo",
  "requestNumber",
  "baseRequestNo",
  "quotationNo",
  "quotationNumber",
  "inquiryNo",
  "inquiryNumber",
  "partNo",
  "part_no",
  "masterPartNo",
  "master_part_no",
  "brand_name",
  "category_name",
  "subcategory_name",
  "application_name",
  "rackCode",
  "shelfNo",
  "storeName",
  "locationLabel",
  "batchNo",
  "batchNumber",
  "employeeCode",
  "employeeName",
  "name",
  "code",
  "email",
  "title",
  "reference",
  "refNo",
  "documentNo",
  // IDs last — only used if no human-readable number exists
  "batchId",
];

const ID_PARAM_KEYS = [
  "id",
  "txId",
  "voucherId",
  "requestId",
  "quotationId",
  "invoiceId",
  "batchId",
  "partId",
  "customerId",
  "supplierId",
  "employeeId",
  "accountId",
  "poId",
  "dpoId",
];

function normalizeApiPath(originalUrl: string): string {
  const pathOnly = (originalUrl || "").split("?")[0];
  return pathOnly
    .replace(/^\/dev-koncepts\/api/, "/api")
    .replace(/^\/api/, "")
    .replace(/^\//, "");
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function singularize(value: string): string {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ses")) return value.slice(0, -2);
  if (value.endsWith("s") && value.length > 3) return value.slice(0, -1);
  return value;
}

function looksLikeId(segment: string): boolean {
  if (!segment) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return true;
  }
  if (/^(inv_|po_|dpo_|vou_|emp_|usr_)/i.test(segment)) return true;
  if (/^\d{6,}$/.test(segment)) return true;
  return false;
}

type ResolvedResource = {
  module: string;
  entityType: string;
  entityName: string; // human label e.g. "Inquiry"
};

/**
 * Resolve module + entity from full API path, not just the first segment.
 * e.g. purchase-import/requests/:id/status → Inquiry under Purchase Import
 * Prefer specific trailing action segments (delivery, payment) over parent resource.
 */
function resolveResource(apiPath: string): ResolvedResource {
  const segments = apiPath.split("/").filter(Boolean);
  const top = segments[0] || "system";
  const defaultModule = MODULE_LABELS[top] || titleCase(top);

  const ACTION_SEGMENTS = new Set([
    "delivery",
    "payment",
    "hold",
    "release-hold",
    "update-location",
    "transfer-location",
    "locations",
    "receive",
    "confirm",
    "unconfirm",
    "revise",
    "convert-to-po",
    "approve",
    "make-kit",
    "break-kit",
    "prices",
    "bulk-update-prices",
    "status",
  ]);

  // Prefer a specific trailing action segment when present
  for (let i = segments.length - 1; i >= 1; i--) {
    const seg = segments[i].toLowerCase();
    if (!ACTION_SEGMENTS.has(seg) || looksLikeId(seg)) continue;
    const mapped = RESOURCE_MAP[seg];
    if (mapped) {
      return {
        module: defaultModule,
        entityType: mapped.entityType,
        entityName: mapped.entityLabel,
      };
    }
  }

  // Prefer the first meaningful nested resource segment
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i].toLowerCase();
    if (
      seg === "status" ||
      seg === "approve" ||
      seg === "export" ||
      seg === "print" ||
      seg === "restore" ||
      looksLikeId(seg)
    ) {
      continue;
    }
    const mapped = RESOURCE_MAP[seg];
    if (mapped) {
      return {
        module: defaultModule,
        entityType: mapped.entityType,
        entityName: mapped.entityLabel,
      };
    }
  }

  // Fallback: singularize top-level mount
  return {
    module: defaultModule,
    entityType: singularize(top).replace(/-/g, "_"),
    entityName: titleCase(singularize(top)),
  };
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function pickLabel(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of LABEL_KEYS) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    const text = String(val).trim();
    if (!text) continue;
    // Prefer readable document numbers over raw UUIDs
    if (looksLikeUuid(text) && key !== "batchId") continue;
    if (looksLikeUuid(text)) continue;
    return text;
  }
  return null;
}

function pickId(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of ["id", "Id", "_id", "batchId", "requestId", "quotationId"]) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) {
      return String(obj[key]);
    }
  }
  return null;
}

function pickParamId(params: Record<string, any> | undefined): string | null {
  if (!params) return null;
  for (const key of ID_PARAM_KEYS) {
    if (params[key] !== undefined && params[key] !== null && String(params[key]).trim()) {
      return String(params[key]);
    }
  }
  return null;
}

function unwrapRecord(body: any): any {
  if (!body || typeof body !== "object") return null;
  let record = body;
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    record = record.data;
  } else if (Array.isArray(record.data) && record.data[0]) {
    record = record.data[0];
  }

  // Payroll / loan-advance mutate shape: { transaction, balances }
  if (record?.transaction && typeof record.transaction === "object") {
    const tx = record.transaction;
    return {
      ...tx,
      balances: record.balances,
      employeeName:
        tx.employeeName ||
        tx.Employee?.name ||
        record.employeeName ||
        null,
      payrollMonth: tx.payrollMonth ?? record.payrollMonth ?? null,
      netPaid: tx.netPaid ?? record.netPaid ?? null,
      amount: tx.amount ?? record.amount ?? null,
      type: tx.type ?? record.type ?? null,
    };
  }

  return record;
}

function inferActionType(
  method: string,
  apiPath: string,
  reqBody: any,
): ActivityActionType {
  const path = apiPath.toLowerCase();
  if (
    path.includes("/status") ||
    path.includes("status-change") ||
    path.includes("/approve")
  ) {
    return path.includes("/approve") ? "approve" : "status_change";
  }
  if (
    reqBody &&
    typeof reqBody === "object" &&
    "status" in reqBody &&
    (method === "PUT" || method === "PATCH")
  ) {
    return "status_change";
  }
  // POST endpoints that mutate existing records (not creates)
  if (
    path.includes("update-location") ||
    path.includes("transfer-location") ||
    path.includes("sync-part-rack-shelf") ||
    path.includes("/delivery") ||
    path.includes("/payment") ||
    path.includes("/hold") ||
    path.includes("/receive") ||
    path.includes("/unconfirm") ||
    path.includes("/confirm") ||
    path.includes("/revise") ||
    path.includes("convert-to-po") ||
    path.includes("/approve") ||
    path.includes("make-kit") ||
    path.includes("break-kit") ||
    path.includes("/prices") ||
    path.includes("bulk-update-prices")
  ) {
    if (
      (path.includes("/confirm") && !path.includes("unconfirm")) ||
      path.includes("/hold") ||
      path.includes("/approve")
    ) {
      return path.includes("/approve") ? "approve" : "status_change";
    }
    return "update";
  }
  if (path.includes("backup") && method === "POST") return "backup";
  if (path.includes("restore")) return "restore";
  if (path.includes("export")) return "export";
  if (path.includes("print")) return "print";

  switch (method) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return "update";
  }
}

function pickStatus(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of ["status", "newStatus", "toStatus", "nextStatus"]) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) {
      return String(obj[key]).trim();
    }
  }
  return null;
}

function pickPreviousStatus(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of [
    "previousStatus",
    "prevStatus",
    "oldStatus",
    "fromStatus",
  ]) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) {
      return String(obj[key]).trim();
    }
  }
  return null;
}

function formatStatusLabel(status: string): string {
  return titleCase(String(status).replace(/_/g, " "));
}

function actionVerb(actionType: ActivityActionType): string {
  switch (actionType) {
    case "create":
      return "Created";
    case "update":
      return "Updated";
    case "delete":
      return "Deleted";
    case "status_change":
      return "Changed status of";
    case "approve":
      return "Approved";
    case "export":
      return "Exported";
    case "print":
      return "Printed";
    case "backup":
      return "Backed up";
    case "restore":
      return "Restored";
    default:
      return "Performed action on";
  }
}

function isReceivedStatus(status: string | null | undefined): boolean {
  const s = String(status || "").trim().toLowerCase();
  return s === "received" || s === "completed" || s === "approved";
}

function isStockReceiveStatus(status: string | null | undefined): boolean {
  const s = String(status || "").trim().toLowerCase();
  // Inventory DPO uses "Completed"; Store receive uses "Received"
  return s === "received" || s === "completed";
}

function isTransferInOrder(reqBody: any, responseRecord: any): boolean {
  const orderType =
    reqBody?.order_type ||
    reqBody?.orderType ||
    responseRecord?.orderType ||
    responseRecord?.order_type ||
    "";
  const dpoNo =
    reqBody?.dpo_number ||
    reqBody?.dpoNumber ||
    reqBody?.dpo_no ||
    responseRecord?.dpoNumber ||
    responseRecord?.dpo_number ||
    responseRecord?.dpo_no ||
    "";
  return (
    String(orderType).trim().toLowerCase() === "transfer_in" ||
    /^TIN-/i.test(String(dpoNo).trim())
  );
}

function isTransferOutInvoice(reqBody: any, responseRecord: any): boolean {
  const customerType = String(
    reqBody?.customerType ||
      reqBody?.customer_type ||
      responseRecord?.customerType ||
      responseRecord?.customer_type ||
      "",
  )
    .trim()
    .toLowerCase();
  return customerType === "transfer";
}

/** Module from API mount — not from UI screen (Store/Inventory may share APIs). */
function moduleFromPath(apiPath: string, fallback: string): string {
  const top = (apiPath.split("/").filter(Boolean)[0] || "").toLowerCase();
  if (top === "purchase-import") return "Purchase Import";
  if (top === "inventory" || top === "stock-details") return "Inventory";
  if (top === "sales" || top === "sales-returns") return "Sales";
  if (top === "dpo-returns") return "Inventory";
  return fallback;
}

function docLabel(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const text = String(c).trim();
    if (!text || looksLikeUuid(text)) continue;
    return text;
  }
  return null;
}

function formatMoneyDetail(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateDetail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  try {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) {
      const raw = String(value).trim();
      return raw ? raw.slice(0, 10) : null;
    }
    return d.toISOString().slice(0, 10);
  } catch {
    const raw = String(value).trim();
    return raw ? raw.slice(0, 10) : null;
  }
}

function moneyOrZero(value: unknown): string {
  return formatMoneyDetail(value) || "0.00";
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(...candidates: unknown[]): any[] {
  for (const c of candidates) {
    const arr = asArray(c);
    if (arr.length > 0) return arr;
  }
  return [];
}

function resolvePartLabel(
  row: any,
  partMap?: Record<string, string>,
): string {
  const fromRow = docLabel(
    row?.partNo,
    row?.part_no,
    row?.masterPartNo,
    row?.Part?.partNo,
    row?.Part?.MasterPart?.masterPartNo,
    row?.part?.partNo,
  );
  if (fromRow) return fromRow;
  const partId = String(row?.partId || row?.part_id || "").trim();
  if (partId && partMap?.[partId]) return partMap[partId];
  return partId || "Item";
}

type DetailLine = Record<string, string | number | null>;

function buildVoucherLines(rows: any[]): DetailLine[] {
  return rows.slice(0, DETAIL_LINE_LIMIT).map((row, index) => {
    const account =
      docLabel(
        row.accountName,
        row.account_name,
        row.accountLabel,
        row.accountCr,
        row.accountDr,
        row.account,
      ) || `Account ${index + 1}`;
    return {
      account,
      debit: moneyOrZero(
        row.debit ?? row.drAmount ?? row.drAmountLc ?? row.amountDr ?? 0,
      ),
      credit: moneyOrZero(
        row.credit ?? row.crAmount ?? row.crAmountLc ?? row.amountCr ?? 0,
      ),
      description: docLabel(row.description, row.narration) || "",
    };
  });
}

function buildSaleLines(
  rows: any[],
  partMap?: Record<string, string>,
): DetailLine[] {
  return rows.slice(0, DETAIL_LINE_LIMIT).map((row) => {
    const qty = Number(
      row.orderedQty ?? row.quantity ?? row.qty ?? row.deliveredQty ?? 0,
    );
    const rateNum = Number(
      row.unitPrice ?? row.unit_price ?? row.rate ?? row.salePrice ?? 0,
    );
    const amountNum = Number(
      row.lineTotal ??
        row.amount ??
        row.total ??
        (Number.isFinite(qty) && Number.isFinite(rateNum) ? qty * rateNum : 0),
    );
    return {
      partNo: resolvePartLabel(row, partMap),
      qty: Number.isFinite(qty) ? qty : 0,
      rate: moneyOrZero(rateNum),
      amount: moneyOrZero(amountNum),
    };
  });
}

function buildPurchaseLines(
  rows: any[],
  partMap?: Record<string, string>,
): DetailLine[] {
  return rows.slice(0, DETAIL_LINE_LIMIT).map((row) => {
    const qty = Number(row.quantity ?? row.qty ?? 0);
    const rateNum = Number(
      row.unitCost ??
        row.unit_cost ??
        row.purchase_price ??
        row.purchasePrice ??
        row.unit_price ??
        row.unitPrice ??
        0,
    );
    const amountNum = Number(
      row.totalCost ??
        row.total_cost ??
        row.amount ??
        (Number.isFinite(qty) && Number.isFinite(rateNum) ? qty * rateNum : 0),
    );
    return {
      partNo: resolvePartLabel(row, partMap),
      qty: Number.isFinite(qty) ? qty : 0,
      rate: moneyOrZero(rateNum),
      amount: moneyOrZero(amountNum),
    };
  });
}

function buildTransferLines(
  rows: any[],
  partMap?: Record<string, string>,
): DetailLine[] {
  return rows.slice(0, DETAIL_LINE_LIMIT).map((row) => {
    const qty = Number(row.quantity ?? row.qty ?? 0);
    return {
      partNo: resolvePartLabel(row, partMap),
      qty: Number.isFinite(qty) ? qty : 0,
    };
  });
}

function buildPayrollLines(record: any, body: any): DetailLine[] {
  const src =
    record?.transaction && typeof record.transaction === "object"
      ? { ...record.transaction, ...record }
      : record;
  const lines: DetailLine[] = [];
  const pushMoney = (label: string, value: unknown) => {
    const money = formatMoneyDetail(value);
    if (money && Number(value) !== 0) {
      lines.push({ label, value: money });
    }
  };
  pushMoney("Gross", src.amount ?? body.amount);
  const absent = Number(src.absentDays ?? body.absentDays);
  if (Number.isFinite(absent) && absent > 0) {
    lines.push({ label: "Absent days", value: absent });
  }
  const working = Number(src.workingDays ?? body.workingDays);
  if (Number.isFinite(working) && working > 0) {
    lines.push({ label: "Working days", value: working });
  }
  pushMoney("Loan recovery", src.loanRecovery ?? body.loanRecovery);
  pushMoney("Advance recovery", src.advanceRecovery ?? body.advanceRecovery);
  pushMoney("Extra payment", src.extraPayment ?? body.extraPayment);
  pushMoney("Extra deduction", src.extraDeduction ?? body.extraDeduction);
  const leaves = Number(src.leaves ?? body.leaves);
  if (Number.isFinite(leaves) && leaves > 0) {
    lines.push({ label: "Leaves", value: leaves });
  }
  pushMoney("Net paid", src.netPaid ?? body.netPaid);
  return lines;
}

/**
 * Re-fetch the full document from Prisma so activity details always include
 * entries / line items even when the API response only returned an id/UUID.
 */
async function fetchDocumentSnapshot(
  entityType: string,
  entityId: string | null,
  pathLower: string,
  actionType: ActivityActionType,
): Promise<any | null> {
  if (!entityId || actionType === "delete") return null;

  const et = String(entityType || "").toLowerCase();
  const path = String(pathLower || "");

  try {
    const isVoucher =
      et.includes("voucher") ||
      path.includes("vouchers") ||
      path.includes("getvouchers");
    if (isVoucher) {
      return await prisma.voucher.findFirst({
        where: { id: entityId, deletedAt: null },
        select: {
          id: true,
          voucherNumber: true,
          type: true,
          date: true,
          narration: true,
          status: true,
          totalDebit: true,
          totalCredit: true,
          VoucherEntry: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            select: {
              accountName: true,
              debit: true,
              credit: true,
              description: true,
              sortOrder: true,
            },
          },
        },
      });
    }

    const isSale =
      et === "sales_invoice" ||
      et === "sales_invoice_delivery" ||
      et === "transfer_out" ||
      (et.includes("invoice") && !et.includes("purchase")) ||
      (path.includes("sales/") && path.includes("invoice"));
    if (isSale) {
      return await prisma.salesInvoice.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          customerName: true,
          customerType: true,
          status: true,
          paymentStatus: true,
          grandTotal: true,
          subtotal: true,
          overallDiscount: true,
          freightCharges: true,
          tax: true,
          remarks: true,
          SalesInvoiceItem: {
            orderBy: { createdAt: "asc" },
            select: {
              partNo: true,
              partId: true,
              orderedQty: true,
              deliveredQty: true,
              unitPrice: true,
              lineTotal: true,
              description: true,
              Part: { select: { partNo: true } },
            },
          },
        },
      });
    }

    const isDpo =
      et === "direct_purchase_order" ||
      et === "transfer_in" ||
      path.includes("direct-purchase") ||
      /(^|\/)dpo(\/|$)/.test(path);
    if (isDpo) {
      return await prisma.directPurchaseOrder.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          dpoNumber: true,
          date: true,
          invoiceNo: true,
          orderType: true,
          status: true,
          totalAmount: true,
          discount: true,
          description: true,
          Supplier: {
            select: { name: true, companyName: true },
          },
          Store: { select: { name: true } },
          DirectPurchaseOrderItem: {
            orderBy: { createdAt: "asc" },
            select: {
              partId: true,
              quantity: true,
              purchasePrice: true,
              amount: true,
              Part: { select: { partNo: true } },
            },
          },
        },
      });
    }

    const isPo =
      et === "purchase_order" ||
      et === "purchase_order_receive" ||
      et === "purchase_order_location" ||
      path.includes("purchase-orders") ||
      path.includes("/pos/");
    if (isPo) {
      return await prisma.purchaseOrder.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          poNumber: true,
          date: true,
          status: true,
          totalAmount: true,
          invoiceNo: true,
          notes: true,
          currency: true,
          Supplier: {
            select: { name: true, companyName: true },
          },
          PurchaseOrderItem: {
            orderBy: { sortOrder: "asc" },
            select: {
              partId: true,
              quantity: true,
              unitCost: true,
              totalCost: true,
              receivedQty: true,
              Part: { select: { partNo: true } },
            },
          },
        },
      });
    }

    const isTransfer =
      et === "stock_transfer" ||
      (et.includes("transfer") &&
        et !== "transfer_in" &&
        et !== "transfer_out") ||
      path.includes("/transfers");
    if (isTransfer) {
      return await prisma.transfer.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          transferNumber: true,
          date: true,
          status: true,
          notes: true,
          totalQty: true,
          Store_Transfer_fromStoreIdToStore: { select: { name: true } },
          Store_Transfer_toStoreIdToStore: { select: { name: true } },
          TransferItem: {
            orderBy: { createdAt: "asc" },
            select: {
              partId: true,
              quantity: true,
              Part: { select: { partNo: true } },
            },
          },
        },
      });
    }

    const isPayroll =
      et.includes("payroll") ||
      et === "employee_transaction" ||
      path.includes("payroll-transactions") ||
      (path.startsWith("employees/") && path.includes("/transactions"));
    if (isPayroll) {
      return await prisma.employeeTransaction.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          type: true,
          date: true,
          payrollMonth: true,
          amount: true,
          absentDays: true,
          leaves: true,
          workingDays: true,
          loanRecovery: true,
          advanceRecovery: true,
          extraPayment: true,
          extraDeduction: true,
          netPaid: true,
          description: true,
          referenceNo: true,
          Employee: { select: { name: true, code: true } },
        },
      });
    }

    const isEmployee =
      et === "employee" ||
      path === "employees" ||
      /^employees\/[0-9a-f-]{36}$/i.test(path);
    if (isEmployee) {
      return await prisma.employee.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          code: true,
          name: true,
          cnic: true,
          contactNo: true,
          email: true,
          designation: true,
          department: true,
          joiningDate: true,
          monthlySalary: true,
          workingDays: true,
          status: true,
          remarks: true,
        },
      });
    }
  } catch (error) {
    console.error("Activity audit document snapshot failed:", error);
  }

  return null;
}

function mergeDocumentRecord(responseRecord: any, dbSnapshot: any): any {
  if (!dbSnapshot) return responseRecord || {};
  if (!responseRecord || typeof responseRecord !== "object") return dbSnapshot;

  return {
    ...responseRecord,
    ...dbSnapshot,
    // Prefer DB relations for full line data
    VoucherEntry: dbSnapshot.VoucherEntry ?? responseRecord.VoucherEntry,
    SalesInvoiceItem:
      dbSnapshot.SalesInvoiceItem ?? responseRecord.SalesInvoiceItem,
    DirectPurchaseOrderItem:
      dbSnapshot.DirectPurchaseOrderItem ??
      responseRecord.DirectPurchaseOrderItem,
    PurchaseOrderItem:
      dbSnapshot.PurchaseOrderItem ?? responseRecord.PurchaseOrderItem,
    TransferItem: dbSnapshot.TransferItem ?? responseRecord.TransferItem,
    Supplier: dbSnapshot.Supplier ?? responseRecord.Supplier,
    Store: dbSnapshot.Store ?? responseRecord.Store,
    Employee: dbSnapshot.Employee ?? responseRecord.Employee,
    Part: dbSnapshot.Part ?? responseRecord.Part,
    Store_Transfer_fromStoreIdToStore:
      dbSnapshot.Store_Transfer_fromStoreIdToStore ??
      responseRecord.Store_Transfer_fromStoreIdToStore,
    Store_Transfer_toStoreIdToStore:
      dbSnapshot.Store_Transfer_toStoreIdToStore ??
      responseRecord.Store_Transfer_toStoreIdToStore,
  };
}

async function resolvePartNoMap(
  record: any,
  body: any,
): Promise<Record<string, string>> {
  const rows = firstArray(
    record?.SalesInvoiceItem,
    record?.DirectPurchaseOrderItem,
    record?.PurchaseOrderItem,
    record?.TransferItem,
    record?.items,
    body?.items,
  );

  const missingIds: string[] = [];
  for (const row of rows) {
    const id = String(row?.partId || row?.part_id || "").trim();
    if (!id) continue;
    const hasLabel = !!docLabel(
      row?.partNo,
      row?.part_no,
      row?.Part?.partNo,
      row?.Part?.MasterPart?.masterPartNo,
    );
    if (!hasLabel) missingIds.push(id);
  }
  const uniqueMissing = Array.from(new Set(missingIds)).slice(
    0,
    DETAIL_LINE_LIMIT,
  );
  if (uniqueMissing.length === 0) return {};

  try {
    const parts = await prisma.part.findMany({
      where: { id: { in: uniqueMissing } },
      select: { id: true, partNo: true },
    });
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.partNo) map[p.id] = p.partNo;
    }
    return map;
  } catch {
    return {};
  }
}

/** Business-facing details for the activity view (no API method/path noise). */
function buildBusinessDetails(params: {
  responseRecord: any;
  reqBody: any;
  entityType: string;
  entityLabel: string | null;
  newStatus: string | null;
  previousStatus: string | null;
  pathLower?: string;
  partMap?: Record<string, string>;
}): Record<string, any> {
  const record = params.responseRecord || {};
  const body = params.reqBody || {};
  const partMap = params.partMap || {};
  const details: Record<string, any> = {};
  const et = String(params.entityType || "").toLowerCase();
  const path = String(params.pathLower || "");

  const isAccount = et === "account" || path.includes("accounting/accounts");
  const isVoucher =
    et.includes("voucher") ||
    path.includes("vouchers") ||
    path.includes("getvouchers");
  const isPayroll =
    et.includes("payroll") ||
    et === "employee_transaction" ||
    path.includes("payroll-transactions") ||
    (path.startsWith("employees/") && path.includes("/transactions"));
  const isTransfer =
    et === "stock_transfer" ||
    (et.includes("transfer") &&
      et !== "transfer_in" &&
      et !== "transfer_out") ||
    path.includes("/transfers");
  const isSale =
    et.includes("invoice") ||
    et.includes("sale") ||
    et === "transfer_out" ||
    (path.includes("sales/") && path.includes("invoice"));
  const isPurchase =
    et.includes("purchase") ||
    et.includes("purchase_order") ||
    et === "direct_purchase_order" ||
    et === "transfer_in" ||
    path.includes("purchase-orders") ||
    path.includes("direct-purchase") ||
    /(^|\/)dpo(\/|$)/.test(path) ||
    path.includes("/pos/");

  const setHeader = (
    documentType: string,
    header: Record<string, string | number | null>,
    lines: DetailLine[],
    lineKind: "voucher" | "items" | "transfer" | "payroll" = "items",
  ) => {
    const cleanHeader: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(header)) {
      if (v === undefined || v === null || v === "") continue;
      cleanHeader[k] = v;
    }
    details.documentType = documentType;
    details.header = cleanHeader;
    details.lines = lines;
    details.lineKind = lineKind;
    if (lines.length > 0) {
      details.itemCount = lines.length;
      if (lineKind === "voucher") details.entryCount = lines.length;
    }
  };

  // ---- Accounts ----
  if (isAccount) {
    const accountCode = docLabel(record.code, body.code);
    const accountName = docLabel(record.name, body.name);
    if (accountName) details.accountName = accountName;
    if (accountCode) details.accountCode = accountCode;
  }

  // ---- Vouchers ----
  if (isVoucher) {
    const voucherNumber = docLabel(record.voucherNumber, body.voucherNumber);
    if (voucherNumber) details.voucherNumber = voucherNumber;
    const voucherType = docLabel(record.type, body.type);
    if (voucherType) details.voucherType = formatStatusLabel(voucherType);
    const narration = docLabel(record.narration, body.narration);
    if (narration) details.narration = narration;
    const voucherAmount =
      formatMoneyDetail(record.totalDebit) ||
      formatMoneyDetail(record.totalCredit) ||
      formatMoneyDetail(record.amount) ||
      formatMoneyDetail(body.totalDebit) ||
      formatMoneyDetail(body.totalCredit) ||
      formatMoneyDetail(body.totalAmount) ||
      formatMoneyDetail(body.amount);
    if (voucherAmount) details.amount = voucherAmount;

    const entryRows = firstArray(
      record.VoucherEntry,
      record.entries,
      body.entries,
      body.VoucherEntry,
    );
    const lines = buildVoucherLines(entryRows);
    setHeader(
      "voucher",
      {
        number: voucherNumber,
        type: voucherType ? formatStatusLabel(voucherType) : null,
        date: formatDateDetail(record.date ?? body.date),
        narration,
        status: formatStatusLabel(
          String(params.newStatus || record.status || body.status || ""),
        ) || null,
        amount: voucherAmount,
      },
      lines,
      "voucher",
    );
  }

  // Capture voucher/journal lines even when entityType wasn't classified as voucher
  if (!details.documentType) {
    const entryRows = firstArray(
      body.entries,
      body.VoucherEntry,
      record.entries,
      record.VoucherEntry,
    );
    if (entryRows.length > 0) {
      const lines = buildVoucherLines(entryRows);
      setHeader(
        "voucher",
        {
          number: docLabel(record.voucherNumber, body.voucherNumber),
          type: docLabel(record.type, body.type)
            ? formatStatusLabel(String(docLabel(record.type, body.type)))
            : null,
          date: formatDateDetail(record.date ?? body.date),
          narration: docLabel(record.narration, body.narration),
          status:
            formatStatusLabel(
              String(params.newStatus || record.status || body.status || ""),
            ) || null,
          amount:
            formatMoneyDetail(record.totalDebit) ||
            formatMoneyDetail(record.totalCredit) ||
            formatMoneyDetail(body.totalDebit) ||
            formatMoneyDetail(body.amount),
        },
        lines,
        "voucher",
      );
    }
  }

  // ---- Sales ----
  if (isSale) {
    const invoiceNo = docLabel(
      record.invoiceNo,
      record.invoiceNumber,
      body.invoiceNo,
      body.invoiceNumber,
    );
    if (invoiceNo) details.invoiceNo = invoiceNo;

    const customerName = docLabel(
      record.customerName,
      record.Customer?.name,
      body.customerName,
    );
    if (customerName) details.customer = customerName;

    const saleAmount =
      formatMoneyDetail(record.grandTotal) ||
      formatMoneyDetail(record.total) ||
      formatMoneyDetail(body.grandTotal) ||
      formatMoneyDetail(body.total);
    if (saleAmount) details.amount = saleAmount;

    const saleRows = firstArray(
      record.SalesInvoiceItem,
      record.items,
      body.items,
    );
    const lines = buildSaleLines(saleRows, partMap);
    const docType =
      et === "transfer_out" ||
      String(record.customerType || body.customerType || "")
        .toLowerCase()
        .trim() === "transfer"
        ? "transfer_out"
        : "sales_invoice";
    setHeader(
      docType,
      {
        number: invoiceNo,
        customer: customerName,
        date: formatDateDetail(
          record.invoiceDate ?? record.date ?? body.invoiceDate ?? body.date,
        ),
        status: formatStatusLabel(
          String(params.newStatus || record.status || body.status || ""),
        ) || null,
        paymentStatus: docLabel(record.paymentStatus, body.paymentStatus),
        amount: saleAmount,
        remarks: docLabel(record.remarks, body.remarks),
      },
      lines,
      "items",
    );
  }

  // ---- Purchase / DPO ----
  if (isPurchase) {
    const poNumber = docLabel(
      record.poNumber,
      record.po_number,
      body.poNumber,
      body.po_number,
    );
    if (poNumber) details.poNumber = poNumber;

    const dpoNumber = docLabel(
      record.dpoNumber,
      record.dpo_number,
      record.dpo_no,
      body.dpoNumber,
      body.dpo_number,
      body.dpo_no,
    );
    if (dpoNumber) details.dpoNumber = dpoNumber;

    const supplierName = docLabel(
      record.supplierName,
      record.supplier_name,
      record.Supplier?.name,
      record.Supplier?.companyName,
      record.supplier?.name,
      record.supplier?.companyName,
      body.supplierName,
      body.supplier_name,
    );
    if (supplierName) details.supplier = supplierName;

    const purchaseAmount =
      formatMoneyDetail(record.totalAmount) ||
      formatMoneyDetail(record.total_amount) ||
      formatMoneyDetail(record.grandTotal) ||
      formatMoneyDetail(record.total) ||
      formatMoneyDetail(body.totalAmount) ||
      formatMoneyDetail(body.total_amount) ||
      formatMoneyDetail(body.grandTotal);
    if (purchaseAmount) details.amount = purchaseAmount;

    const purchaseRows = firstArray(
      record.DirectPurchaseOrderItem,
      record.PurchaseOrderItem,
      record.items,
      body.items,
    );
    const lines = buildPurchaseLines(purchaseRows, partMap);
    const isDpoDoc =
      et === "direct_purchase_order" ||
      et === "transfer_in" ||
      !!dpoNumber ||
      path.includes("direct-purchase") ||
      /(^|\/)dpo(\/|$)/.test(path);
    const docType =
      et === "transfer_in"
        ? "transfer_in"
        : isDpoDoc
          ? "direct_purchase_order"
          : "purchase_order";
    setHeader(
      docType,
      {
        number: dpoNumber || poNumber,
        poNumber: poNumber,
        dpoNumber: dpoNumber,
        supplier: supplierName,
        date: formatDateDetail(record.date ?? body.date),
        status: formatStatusLabel(
          String(params.newStatus || record.status || body.status || ""),
        ) || null,
        amount: purchaseAmount,
        invoiceNo: docLabel(record.invoiceNo, body.invoiceNo),
        store: docLabel(record.Store?.name, body.storeName),
        currency: docLabel(record.currency, body.currency),
      },
      lines,
      "items",
    );
  }

  // ---- Stock transfer ----
  if (isTransfer) {
    const transferNumber = docLabel(
      record.transferNumber,
      record.transfer_number,
      body.transferNumber,
      body.transfer_number,
    );
    if (transferNumber) details.transferNumber = transferNumber;

    const fromStore = docLabel(
      record.fromStoreName,
      record.from_store,
      record.Store_Transfer_fromStoreIdToStore?.name,
      body.from_store_name,
      body.fromStoreName,
    );
    if (fromStore) details.fromStore = fromStore;

    const toStore = docLabel(
      record.toStoreName,
      record.to_store,
      record.Store_Transfer_toStoreIdToStore?.name,
      body.to_store_name,
      body.toStoreName,
    );
    if (toStore) details.toStore = toStore;

    const qty =
      record.total_qty ??
      record.totalQty ??
      body.total_qty ??
      body.totalQty ??
      null;
    if (qty != null && Number.isFinite(Number(qty))) {
      details.quantity = Number(qty);
    }

    const transferRows = firstArray(
      record.TransferItem,
      record.items,
      body.items,
    );
    const lines = buildTransferLines(transferRows, partMap);
    setHeader(
      "stock_transfer",
      {
        number: transferNumber,
        fromStore,
        toStore,
        date: formatDateDetail(record.date ?? body.date),
        status: formatStatusLabel(
          String(params.newStatus || record.status || body.status || ""),
        ) || null,
        quantity:
          qty != null && Number.isFinite(Number(qty)) ? Number(qty) : null,
        notes: docLabel(record.notes, body.notes),
      },
      lines,
      "transfer",
    );
  }

  // ---- Payroll ----
  if (isPayroll) {
    const payrollMonth = docLabel(
      record.payrollMonth,
      body.payrollMonth,
      record.transaction?.payrollMonth,
    );
    if (payrollMonth) details.payrollMonth = payrollMonth;

    const employeeName = docLabel(
      record.employeeName,
      record.Employee?.name,
      record.employee?.name,
      body.employeeName,
      record.transaction?.Employee?.name,
      record.transaction?.employeeName,
    );
    if (employeeName) details.employee = employeeName;

    const payrollAmount =
      formatMoneyDetail(record.netPaid) ||
      formatMoneyDetail(record.amount) ||
      formatMoneyDetail(body.netPaid) ||
      formatMoneyDetail(body.amount) ||
      formatMoneyDetail(record.transaction?.netPaid) ||
      formatMoneyDetail(record.transaction?.amount);
    if (payrollAmount) details.amount = payrollAmount;

    const txType = docLabel(record.type, body.type, record.transaction?.type);
    if (txType) details.transactionType = formatStatusLabel(txType);

    const lines = buildPayrollLines(record, body);
    setHeader(
      "payroll",
      {
        employee: employeeName,
        employeeCode: docLabel(
          record.Employee?.code,
          record.employeeCode,
          record.code,
        ),
        month: payrollMonth,
        type: txType ? formatStatusLabel(txType) : null,
        date: formatDateDetail(record.date ?? body.date),
        amount: payrollAmount,
        reference: docLabel(record.referenceNo, body.referenceNo),
      },
      lines,
      "payroll",
    );
  }

  // ---- Employee master ----
  const isEmployeeMaster =
    et === "employee" ||
    path === "employees" ||
    /^employees\/[0-9a-f-]{36}$/i.test(path);
  if (isEmployeeMaster && !isPayroll) {
    const employeeName = docLabel(record.name, body.name);
    const employeeCode = docLabel(record.code, body.code);
    if (employeeName) details.employee = employeeName;
    if (employeeCode) details.employeeCode = employeeCode;

    const lines: DetailLine[] = [];
    const pushLine = (label: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      lines.push({ label, value: String(value) });
    };
    pushLine("CNIC", docLabel(record.cnic, body.cnic));
    pushLine("Contact", docLabel(record.contactNo, body.contactNo));
    pushLine("Email", docLabel(record.email, body.email));
    pushLine("Designation", docLabel(record.designation, body.designation));
    pushLine("Department", docLabel(record.department, body.department));
    pushLine(
      "Monthly salary",
      formatMoneyDetail(record.monthlySalary ?? body.monthlySalary),
    );
    pushLine(
      "Working days",
      record.workingDays ?? body.workingDays ?? null,
    );
    pushLine("Joining date", formatDateDetail(record.joiningDate ?? body.joiningDate));
    pushLine("Remarks", docLabel(record.remarks, body.remarks));

    setHeader(
      "employee",
      {
        number: employeeCode,
        employee: employeeName,
        code: employeeCode,
        status:
          formatStatusLabel(
            String(params.newStatus || record.status || body.status || ""),
          ) || null,
        designation: docLabel(record.designation, body.designation),
        department: docLabel(record.department, body.department),
        amount: formatMoneyDetail(record.monthlySalary ?? body.monthlySalary),
      },
      lines,
      "payroll",
    );
  }

  // ---- Shared document fields (always try when present) ----
  const quotationNo = docLabel(
    record.quotationNo,
    record.quotationNumber,
    body.quotationNo,
  );
  if (quotationNo) details.quotationNo = quotationNo;

  const requestNo = docLabel(
    record.requestNo,
    record.baseRequestNo,
    body.requestNo,
  );
  if (requestNo) details.requestNo = requestNo;

  const partNo = docLabel(record.partNo, record.part_no, body.partNo, body.part_no);
  if (partNo) details.partNo = partNo;

  // Fallback amount if not set by a typed branch
  if (!details.amount) {
    const anyAmount =
      formatMoneyDetail(record.grandTotal) ||
      formatMoneyDetail(record.totalAmount) ||
      formatMoneyDetail(record.total_amount) ||
      formatMoneyDetail(record.totalDebit) ||
      formatMoneyDetail(record.netPaid) ||
      formatMoneyDetail(record.amount) ||
      formatMoneyDetail(body.grandTotal) ||
      formatMoneyDetail(body.totalAmount) ||
      formatMoneyDetail(body.total_amount) ||
      formatMoneyDetail(body.amount);
    if (anyAmount) details.amount = anyAmount;
  }

  if (
    params.entityLabel &&
    !Object.values(details).some(
      (v) => typeof v !== "object" && String(v) === params.entityLabel,
    )
  ) {
    details.reference = params.entityLabel;
  }
  if (params.newStatus) details.status = formatStatusLabel(params.newStatus);
  if (params.previousStatus) {
    details.previousStatus = formatStatusLabel(params.previousStatus);
  }

  return details;
}

/**
 * Logs every successful mutating API call (POST/PUT/PATCH/DELETE)
 * with userId + entityType/entityId when available.
 */
export function activityAuditMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const originalUrl = req.originalUrl || req.url || "";
  const apiPathEarly = normalizeApiPath(originalUrl);
  if (shouldSkipActivity(req.method.toUpperCase(), apiPathEarly)) {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    void captureActivity(req, res, body);
    return originalJson(body);
  }) as Response["json"];

  next();
}

async function captureActivity(req: AuthRequest, res: Response, body: any) {
  try {
    if (wasActivityLogged(req)) return;
    if (res.statusCode >= 400) return;

    const user = req.user;
    if (!user?.id && !user?.email) return;

    const performer = resolveStorePerformer(req);

    // Don't log failed business responses that still return 200 with error field
    if (body && typeof body === "object" && body.error && !body.data) return;

    const apiPath = normalizeApiPath(req.originalUrl || req.url || "");
    const pathLower = apiPath.toLowerCase();
    const method = req.method.toUpperCase();
    let resource = resolveResource(apiPath);
    let { module, entityType, entityName } = resource;
    const actionType = inferActionType(method, apiPath, req.body);

    const responseRecord = unwrapRecord(body);
    // Prefer the mutated record's id (response) over parent ids in the URL
    // e.g. POST /employees/:id/transactions → use transaction id, not employee id
    const responseId =
      pickId(responseRecord) ||
      pickId(responseRecord?.transaction) ||
      pickId(req.body);
    const paramId = pickParamId(req.params as Record<string, any>);
    let entityId: string | null = responseId || paramId || null;
    // Nested create under /employees/:id/... — param id is the employee, not the tx
    if (
      method === "POST" &&
      pathLower.startsWith("employees/") &&
      (pathLower.includes("/transactions") ||
        pathLower.includes("payroll-transactions") ||
        pathLower.includes("loan-advance")) &&
      responseId
    ) {
      entityId = responseId;
    }

    // Never use a UUID as the human-facing label
    const rawLabel =
      pickLabel(responseRecord) || pickLabel(req.body) || null;
    let entityLabel =
      rawLabel && !looksLikeUuid(rawLabel) ? rawLabel : null;

    const newStatus =
      pickStatus(req.body) || pickStatus(responseRecord) || null;
    const previousStatus =
      pickPreviousStatus(req.body) ||
      pickPreviousStatus(responseRecord) ||
      null;

    const verb = actionVerb(actionType);
    let action = `${verb} ${entityName}`.trim();
    let description = entityLabel
      ? `${verb} ${entityName} ${entityLabel}`
      : `${verb} ${entityName}`;

    // ---- Specialized wording by resource (module follows API mount) ----

    // Chart of Accounts — prefer "Name (code)" over code-only / UUID
    if (pathLower.includes("accounting/accounts")) {
      const accountName = docLabel(responseRecord?.name, req.body?.name);
      const accountCode = docLabel(responseRecord?.code, req.body?.code);
      const accountLabel =
        accountName && accountCode
          ? `${accountName} (${accountCode})`
          : accountName || accountCode || entityLabel;
      if (accountLabel) entityLabel = accountLabel;

      if (newStatus) {
        const toLabel = formatStatusLabel(newStatus);
        action = `Status changed to ${toLabel}`;
        description = entityLabel
          ? `Changed status of Account ${entityLabel} to ${toLabel}`
          : `Changed status of Account to ${toLabel}`;
      } else if (method === "POST") {
        action = "Created Account";
        description = entityLabel
          ? `Created Account ${entityLabel}`
          : "Created Account";
      } else if (method === "DELETE") {
        action = "Deleted Account";
        description = entityLabel
          ? `Deleted Account ${entityLabel}`
          : "Deleted Account";
      } else {
        action = "Updated Account";
        description = entityLabel
          ? `Updated Account ${entityLabel}`
          : "Updated Account";
      }
    }

    // Vouchers — show voucher number, type, amount + entries
    if (
      pathLower.includes("/vouchers") ||
      pathLower.startsWith("vouchers/") ||
      pathLower === "vouchers"
    ) {
      const voucherNumber = docLabel(
        responseRecord?.voucherNumber,
        req.body?.voucherNumber,
        entityLabel,
      );
      const voucherType = docLabel(responseRecord?.type, req.body?.type);
      const typeLabel = voucherType
        ? formatStatusLabel(voucherType)
        : "Voucher";
      if (voucherNumber) entityLabel = voucherNumber;

      // Create/delete take priority over status-in-body (posted on create)
      if (method === "POST") {
        action = `Created ${typeLabel} Voucher`;
        description = voucherNumber
          ? `Created ${typeLabel} voucher ${voucherNumber}`
          : `Created ${typeLabel} voucher`;
      } else if (method === "DELETE") {
        action = `Deleted ${typeLabel} Voucher`;
        description = voucherNumber
          ? `Deleted ${typeLabel} voucher ${voucherNumber}`
          : `Deleted ${typeLabel} voucher`;
      } else if (newStatus && newStatus !== previousStatus) {
        const toLabel = formatStatusLabel(newStatus);
        action = `Status changed to ${toLabel}`;
        description = voucherNumber
          ? `Changed status of ${typeLabel} voucher ${voucherNumber} to ${toLabel}`
          : `Changed status of ${typeLabel} voucher to ${toLabel}`;
      } else {
        action = `Updated ${typeLabel} Voucher`;
        description = voucherNumber
          ? `Updated ${typeLabel} voucher ${voucherNumber}`
          : `Updated ${typeLabel} voucher`;
      }
    }

    // Stock location assign / transfer from Current Stock (Inventory)
    if (
      pathLower.includes("update-location") ||
      pathLower.includes("transfer-location")
    ) {
      const partNo =
        pickLabel(responseRecord) ||
        responseRecord?.partNo ||
        responseRecord?.masterPartNo ||
        req.body?.partNo ||
        null;
      const qty = responseRecord?.quantity ?? req.body?.quantity ?? null;
      const rack =
        responseRecord?.rackCode || responseRecord?.targetRackCode || null;
      const shelf =
        responseRecord?.shelfNo || responseRecord?.targetShelfNo || null;
      const store =
        responseRecord?.storeName || responseRecord?.targetStoreName || null;
      const locationBits = [
        store,
        rack && `Rack ${rack}`,
        shelf && `Shelf ${shelf}`,
      ]
        .filter(Boolean)
        .join(" / ");

      module = "Inventory";
      if (pathLower.includes("transfer-location")) {
        action = "Transferred Rack/Shelf Location";
        description = partNo
          ? `Transferred ${qty ?? ""} qty of part ${partNo}${locationBits ? ` to ${locationBits}` : ""}`
              .replace(/\s+/g, " ")
              .trim()
          : `Transferred stock${locationBits ? ` to ${locationBits}` : ""}`;
      } else {
        action = "Updated Rack/Shelf Location";
        description = partNo
          ? `Assigned ${qty ?? ""} qty of part ${partNo}${locationBits ? ` to ${locationBits}` : ""}`
              .replace(/\s+/g, " ")
              .trim()
          : `Updated rack/shelf location${locationBits ? ` (${locationBits})` : ""}`;
      }
      if (partNo && !looksLikeUuid(String(partNo))) {
        entityLabel = String(partNo);
      }
    }

    // Store delivery / stock-out against sales or transfer-out invoice
    if (pathLower.includes("/delivery")) {
      const invoiceNo = docLabel(
        responseRecord?.invoiceNo,
        responseRecord?.invoiceNumber,
        entityLabel,
      );
      const deliveryItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const totalQty = deliveryItems.reduce(
        (sum: number, item: any) => sum + (Number(item?.quantity) || 0),
        0,
      );
      const newInvStatus = responseRecord?.status || null;
      const isTransferOut = isTransferOutInvoice(req.body, responseRecord);
      module = "Store";
      entityType = isTransferOut
        ? "transfer_out"
        : "sales_invoice_delivery";
      entityName = isTransferOut ? "Transfer Out" : "Sales Invoice Stock Out";
      action = isTransferOut
        ? "Stocked Out Transfer Out (Store)"
        : "Stock Out (Store)";
      description = invoiceNo
        ? `${isTransferOut ? "Stocked out Transfer Out" : "Stocked out"} ${totalQty || ""} qty from Store for ${isTransferOut ? "Transfer" : "Sales"} Invoice ${invoiceNo}${
            newInvStatus
              ? ` (status: ${formatStatusLabel(String(newInvStatus))})`
              : ""
          }`
            .replace(/\s+/g, " ")
            .trim()
        : isTransferOut
          ? "Stocked out Transfer Out quantity from Store"
          : "Stocked out invoice quantity from Store";
      if (invoiceNo) entityLabel = invoiceNo;
    }

    // Transfer Out document create/update/delete (Sales → Transfer Out module)
    if (
      pathLower.includes("sales/") &&
      pathLower.includes("invoices") &&
      !pathLower.includes("/delivery") &&
      !pathLower.includes("/payment") &&
      !pathLower.includes("/hold") &&
      isTransferOutInvoice(req.body, responseRecord)
    ) {
      const invoiceNo = docLabel(
        responseRecord?.invoiceNo,
        responseRecord?.invoiceNumber,
        req.body?.invoiceNo,
        entityLabel,
      );
      module = "Sales";
      entityType = "transfer_out";
      entityName = "Transfer Out";
      if (method === "POST") {
        action = "Created Transfer Out";
        description = invoiceNo
          ? `Created Transfer Out ${invoiceNo}`
          : "Created Transfer Out";
      } else if (method === "DELETE") {
        action = "Deleted Transfer Out";
        description = invoiceNo
          ? `Deleted Transfer Out ${invoiceNo}`
          : "Deleted Transfer Out";
      } else if (newStatus && newStatus !== previousStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = invoiceNo
          ? previousStatus
            ? `Changed status of Transfer Out ${invoiceNo} from ${formatStatusLabel(previousStatus)} to ${formatStatusLabel(newStatus)}`
            : `Changed status of Transfer Out ${invoiceNo} to ${formatStatusLabel(newStatus)}`
          : `Changed status of Transfer Out to ${formatStatusLabel(newStatus)}`;
      } else {
        action = "Updated Transfer Out";
        description = invoiceNo
          ? `Updated Transfer Out ${invoiceNo}`
          : "Updated Transfer Out";
      }
      if (invoiceNo) entityLabel = invoiceNo;
    }

    // Regular Sales Invoice create/update/delete
    if (
      pathLower.includes("sales/") &&
      pathLower.includes("invoices") &&
      !pathLower.includes("/delivery") &&
      !pathLower.includes("/payment") &&
      !pathLower.includes("/hold") &&
      !isTransferOutInvoice(req.body, responseRecord)
    ) {
      const invoiceNo = docLabel(
        responseRecord?.invoiceNo,
        responseRecord?.invoiceNumber,
        req.body?.invoiceNo,
        entityLabel,
      );
      const customerName = docLabel(
        responseRecord?.customerName,
        req.body?.customerName,
      );
      module = "Sales";
      entityType = "sales_invoice";
      entityName = "Sales Invoice";
      if (method === "POST") {
        action = "Created Sales Invoice";
        description = invoiceNo
          ? `Created Sales Invoice ${invoiceNo}${
              customerName ? ` for ${customerName}` : ""
            }`
          : "Created Sales Invoice";
      } else if (method === "DELETE") {
        action = "Deleted Sales Invoice";
        description = invoiceNo
          ? `Deleted Sales Invoice ${invoiceNo}`
          : "Deleted Sales Invoice";
      } else if (newStatus && newStatus !== previousStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = invoiceNo
          ? previousStatus
            ? `Changed status of Sales Invoice ${invoiceNo} from ${formatStatusLabel(previousStatus)} to ${formatStatusLabel(newStatus)}`
            : `Changed status of Sales Invoice ${invoiceNo} to ${formatStatusLabel(newStatus)}`
          : `Changed status of Sales Invoice to ${formatStatusLabel(newStatus)}`;
      } else {
        action = "Updated Sales Invoice";
        description = invoiceNo
          ? `Updated Sales Invoice ${invoiceNo}${
              customerName ? ` for ${customerName}` : ""
            }`
          : "Updated Sales Invoice";
      }
      if (invoiceNo) entityLabel = invoiceNo;
    }

    // Inventory → Stock Transfer (between stores)
    if (pathLower.includes("/transfers")) {
      const transferNo = docLabel(
        responseRecord?.transferNumber,
        responseRecord?.transfer_number,
        req.body?.transfer_number,
        req.body?.transferNumber,
        entityLabel,
      );
      module = "Inventory";
      entityType = "stock_transfer";
      entityName = "Stock Transfer";
      if (method === "POST") {
        action = "Created Stock Transfer";
        description = transferNo
          ? `Created Stock Transfer ${transferNo}`
          : "Created Stock Transfer";
      } else if (method === "DELETE") {
        action = "Deleted Stock Transfer";
        description = transferNo
          ? `Deleted Stock Transfer ${transferNo}`
          : "Deleted Stock Transfer";
      } else if (newStatus && previousStatus && newStatus !== previousStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = transferNo
          ? `Changed status of Stock Transfer ${transferNo} from ${formatStatusLabel(previousStatus)} to ${formatStatusLabel(newStatus)}`
          : `Changed status of Stock Transfer to ${formatStatusLabel(newStatus)}`;
      } else if (newStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = transferNo
          ? `Changed status of Stock Transfer ${transferNo} to ${formatStatusLabel(newStatus)}`
          : `Changed status of Stock Transfer to ${formatStatusLabel(newStatus)}`;
      } else {
        action = "Updated Stock Transfer";
        description = transferNo
          ? `Updated Stock Transfer ${transferNo}`
          : "Updated Stock Transfer";
      }
      if (transferNo) entityLabel = transferNo;
    }

    // Inventory → Direct Purchase Order / Transfer In
    // (same APIs used from Store receive; module stays Inventory by path)
    if (
      pathLower.includes("direct-purchase-orders") ||
      /(^|\/)dpo(\/|$)/.test(pathLower)
    ) {
      const dpoNo = docLabel(
        responseRecord?.dpoNumber,
        responseRecord?.dpo_number,
        responseRecord?.dpo_no,
        req.body?.dpo_number,
        req.body?.dpoNumber,
        entityLabel,
      );
      const transferIn = isTransferInOrder(req.body, responseRecord);
      const labelName = transferIn
        ? "Transfer In"
        : "Direct Purchase Order";
      module = moduleFromPath(apiPath, "Inventory");
      entityType = transferIn ? "transfer_in" : "direct_purchase_order";
      entityName = labelName;

      const prev = previousStatus || responseRecord?.previousStatus || null;
      const becomingStocked =
        isStockReceiveStatus(newStatus) && !isStockReceiveStatus(prev);

      if (method === "POST") {
        action = `Created ${labelName}`;
        description = dpoNo
          ? `Created ${labelName} ${dpoNo}`
          : `Created ${labelName}`;
      } else if (method === "DELETE") {
        action = `Deleted ${labelName}`;
        description = dpoNo
          ? `Deleted ${labelName} ${dpoNo}`
          : `Deleted ${labelName}`;
      } else if (becomingStocked) {
        // Inventory "Completed" or Store "Received" — both add stock
        action = transferIn
          ? `Received Transfer In`
          : `Received Direct Purchase Order`;
        description = dpoNo
          ? `Received ${labelName} ${dpoNo} (stock added, status: ${formatStatusLabel(String(newStatus))})`
          : `Received ${labelName} (stock added, status: ${formatStatusLabel(String(newStatus))})`;
      } else if (newStatus && newStatus !== prev) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = dpoNo
          ? prev
            ? `Changed status of ${labelName} ${dpoNo} from ${formatStatusLabel(prev)} to ${formatStatusLabel(newStatus)}`
            : `Changed status of ${labelName} ${dpoNo} to ${formatStatusLabel(newStatus)}`
          : `Changed status of ${labelName} to ${formatStatusLabel(newStatus)}`;
      } else {
        action = `Updated ${labelName}`;
        description = dpoNo
          ? `Updated ${labelName} ${dpoNo}`
          : `Updated ${labelName}`;
      }
      if (dpoNo) entityLabel = dpoNo;
    }

    // Inventory / Purchase Import → Purchase Orders
    if (pathLower.includes("purchase-orders") || pathLower.includes("/pos/")) {
      const poNo = docLabel(
        responseRecord?.poNumber,
        responseRecord?.po_number,
        req.body?.po_number,
        req.body?.poNumber,
        entityLabel,
      );
      const isImportMount = pathLower.includes("purchase-import");
      const isImportPo =
        isImportMount ||
        Boolean(
          responseRecord?.isImport ||
            responseRecord?.purchaseQuotationId ||
            req.body?.purchaseQuotationId,
        );
      module = isImportMount ? "Purchase Import" : "Inventory";
      entityType = "purchase_order";
      entityName = isImportPo ? "Import Purchase Order" : "Purchase Order";

      const prev = previousStatus || responseRecord?.previousStatus || null;
      const becomingReceived =
        isReceivedStatus(newStatus) &&
        String(newStatus || "").toLowerCase() === "received" &&
        String(prev || "").toLowerCase() !== "received";

      if (pathLower.includes("/locations")) {
        module = "Inventory";
        entityType = "purchase_order_location";
        entityName = "Purchase Order Location";
        action = "Assigned PO Locations";
        description = poNo
          ? `Assigned rack/shelf locations for Purchase Order ${poNo}`
          : "Assigned rack/shelf locations for Purchase Order";
        if (poNo) entityLabel = poNo;
      } else if (isImportMount && pathLower.includes("/receive")) {
        // Purchase Import screen: save import / purchase invoice (not store stock receive)
        const stage = String(req.body?.stage || req.body?.mode || "")
          .trim()
          .toLowerCase();
        const isInvoiceStage =
          stage === "invoice" ||
          stage === "purchase-invoice" ||
          stage === "purchase_invoice";
        action = isInvoiceStage
          ? "Saved Purchase Invoice"
          : "Saved Purchase Import";
        description = poNo
          ? `${action} for Import Purchase Order ${poNo}${
              newStatus ? ` (status: ${formatStatusLabel(newStatus)})` : ""
            }`
          : action;
        if (poNo) entityLabel = poNo;
      } else if (becomingReceived) {
        // Stock receive: Inventory PO screen OR Store panel (same API)
        action = isImportPo
          ? "Received Import Purchase Order"
          : "Received Purchase Order";
        description = poNo
          ? `Received ${entityName} ${poNo} (stock added)`
          : `Received ${entityName} (stock added)`;
        if (poNo) entityLabel = poNo;
      } else if (
        !pathLower.includes("/locations") &&
        !(isImportMount && pathLower.includes("/receive"))
      ) {
        if (method === "POST" && !pathLower.includes("/receive")) {
          action = `Created ${entityName}`;
          description = poNo
            ? `Created ${entityName} ${poNo}`
            : `Created ${entityName}`;
        } else if (method === "DELETE") {
          action = `Deleted ${entityName}`;
          description = poNo
            ? `Deleted ${entityName} ${poNo}`
            : `Deleted ${entityName}`;
        } else if (newStatus && newStatus !== prev) {
          action = `Status changed to ${formatStatusLabel(newStatus)}`;
          description = poNo
            ? prev
              ? `Changed status of ${entityName} ${poNo} from ${formatStatusLabel(prev)} to ${formatStatusLabel(newStatus)}`
              : `Changed status of ${entityName} ${poNo} to ${formatStatusLabel(newStatus)}`
            : `Changed status of ${entityName} to ${formatStatusLabel(newStatus)}`;
        } else if (method === "PUT" || method === "PATCH") {
          action = `Updated ${entityName}`;
          description = poNo
            ? `Updated ${entityName} ${poNo}`
            : `Updated ${entityName}`;
        }
        if (poNo) entityLabel = poNo;
      }
    }

    // Inventory → Adjust Inventory
    if (pathLower.includes("/adjustments")) {
      module = "Inventory";
      entityType = "stock_adjustment";
      entityName = "Stock Adjustment";
      const adjNoRaw =
        responseRecord?.adjustmentNo ??
        responseRecord?.adjustment_no ??
        req.body?.adjustmentNo ??
        null;
      const adjNo =
        adjNoRaw !== null && adjNoRaw !== undefined && String(adjNoRaw).trim()
          ? String(adjNoRaw).trim()
          : null;
      const subject = docLabel(
        responseRecord?.subject,
        req.body?.subject,
      );
      const addInventory =
        responseRecord?.addInventory ??
        responseRecord?.add_inventory ??
        req.body?.add_inventory;
      const direction =
        addInventory === false || addInventory === "false"
          ? "Remove"
          : addInventory === true || addInventory === "true"
            ? "Add"
            : null;
      const label = adjNo
        ? `ADJ-${adjNo}`
        : subject || null;
      const itemCount =
        responseRecord?.items_count ??
        (Array.isArray(req.body?.items) ? req.body.items.length : null);

      if (pathLower.includes("/approve")) {
        action = "Approved Stock Adjustment";
        description = label
          ? `Approved Stock Adjustment ${label}${direction ? ` (${direction} inventory)` : ""}${itemCount != null ? ` — ${itemCount} item(s)` : ""}`
          : `Approved Stock Adjustment${direction ? ` (${direction} inventory)` : ""}`;
      } else if (method === "POST") {
        action = "Created Stock Adjustment";
        description = label
          ? `Created Stock Adjustment ${label}${direction ? ` (${direction} inventory)` : ""}${itemCount != null ? ` — ${itemCount} item(s)` : ""}`
          : `Created Stock Adjustment${direction ? ` (${direction} inventory)` : ""}`;
      } else if (method === "DELETE") {
        action = "Deleted Stock Adjustment";
        description = label
          ? `Deleted Stock Adjustment ${label}`
          : "Deleted Stock Adjustment";
      } else if (newStatus && newStatus !== previousStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = label
          ? previousStatus
            ? `Changed status of Stock Adjustment ${label} from ${formatStatusLabel(previousStatus)} to ${formatStatusLabel(newStatus)}`
            : `Changed status of Stock Adjustment ${label} to ${formatStatusLabel(newStatus)}`
          : `Changed status of Stock Adjustment to ${formatStatusLabel(newStatus)}`;
      } else {
        action = "Updated Stock Adjustment";
        description = label
          ? `Updated Stock Adjustment ${label}${direction ? ` (${direction} inventory)` : ""}`
          : `Updated Stock Adjustment${direction ? ` (${direction} inventory)` : ""}`;
      }
      if (label) entityLabel = label;
    }

    // Part Entry → Parts / Items List / Models / Kits / Prices
    if (
      (pathLower.startsWith("parts/") || pathLower === "parts") &&
      !pathLower.includes("parts-sales") &&
      !pathLower.includes("parts-dropdown")
    ) {
      module = "Part Entry";
      const partNo = docLabel(
        responseRecord?.partNo,
        responseRecord?.part_no,
        req.body?.part_no,
        req.body?.partNo,
        entityLabel,
      );
      const masterPartNo = docLabel(
        responseRecord?.master_part_no,
        responseRecord?.masterPartNo,
        req.body?.master_part_no,
      );
      const qty =
        responseRecord?.quantity ??
        req.body?.quantity ??
        null;

      if (pathLower.includes("make-kit")) {
        entityType = "part_kit";
        entityName = "Kit";
        action = "Made Kit";
        description = partNo
          ? `Made kit ${partNo}${qty != null ? ` x ${qty}` : ""}`
          : `Made kit${qty != null ? ` x ${qty}` : ""}`;
        if (partNo) entityLabel = partNo;
      } else if (pathLower.includes("break-kit")) {
        entityType = "part_kit";
        entityName = "Kit";
        action = "Broke Kit";
        description = partNo
          ? `Broke kit ${partNo}${qty != null ? ` x ${qty}` : ""}`
          : `Broke kit${qty != null ? ` x ${qty}` : ""}`;
        if (partNo) entityLabel = partNo;
      } else if (
        pathLower.includes("/prices") ||
        pathLower.includes("bulk-update-prices")
      ) {
        entityType = "part_price";
        entityName = "Part Price";
        if (pathLower.includes("bulk-update-prices")) {
          const count = Array.isArray(req.body?.part_ids)
            ? req.body.part_ids.length
            : responseRecord?.updated_count ||
              responseRecord?.itemsUpdated ||
              null;
          action = "Bulk Updated Part Prices";
          description = count
            ? `Bulk updated prices for ${count} part(s)`
            : "Bulk updated part prices";
        } else {
          action = "Updated Part Prices";
          description = partNo
            ? `Updated prices for part ${partNo}`
            : "Updated part prices";
          if (partNo) entityLabel = partNo;
        }
      } else {
        entityType = "part";
        entityName = "Part";
        const modelsOnly =
          method !== "POST" &&
          method !== "DELETE" &&
          req.body &&
          typeof req.body === "object" &&
          Array.isArray(req.body.models) &&
          Object.keys(req.body).every((k) =>
            ["models", "status"].includes(k),
          );

        if (modelsOnly) {
          action = "Updated Part Models";
          description = partNo
            ? `Updated models for part ${partNo}`
            : "Updated part models";
        } else if (method === "POST") {
          action = "Created Part";
          description = partNo
            ? `Created Part ${partNo}${masterPartNo ? ` (Master: ${masterPartNo})` : ""}`
            : "Created Part";
        } else if (method === "DELETE") {
          action = "Deleted Part";
          description = partNo
            ? `Deleted Part ${partNo}`
            : "Deleted Part";
        } else if (newStatus && newStatus !== previousStatus) {
          action = `Status changed to ${formatStatusLabel(newStatus)}`;
          description = partNo
            ? previousStatus
              ? `Changed status of Part ${partNo} from ${formatStatusLabel(previousStatus)} to ${formatStatusLabel(newStatus)}`
              : `Changed status of Part ${partNo} to ${formatStatusLabel(newStatus)}`
            : `Changed status of Part to ${formatStatusLabel(newStatus)}`;
        } else {
          action = "Updated Part";
          description = partNo
            ? `Updated Part ${partNo}`
            : "Updated Part";
        }
        if (partNo) entityLabel = partNo;
      }
    }

    // Part Entry → Attributes (Brand / Category / Subcategory / Application)
    if (
      pathLower.startsWith("dropdowns/") &&
      (pathLower.includes("/brands") ||
        pathLower.includes("/categories") ||
        pathLower.includes("/subcategories") ||
        pathLower.includes("/applications"))
    ) {
      module = "Part Entry";
      let attrName = "Attribute";
      let attrType = "attribute";
      if (pathLower.includes("/brands")) {
        attrName = "Brand";
        attrType = "brand";
      } else if (pathLower.includes("/subcategories")) {
        attrName = "Subcategory";
        attrType = "subcategory";
      } else if (pathLower.includes("/categories")) {
        attrName = "Category";
        attrType = "category";
      } else if (pathLower.includes("/applications")) {
        attrName = "Application";
        attrType = "application";
      }
      entityType = attrType;
      entityName = attrName;
      const nameLabel = docLabel(
        responseRecord?.name,
        req.body?.name,
        entityLabel,
      );
      const masterPartNo = docLabel(
        responseRecord?.master_part_no,
        responseRecord?.masterPartNo,
        req.body?.master_part_no,
      );

      if (method === "POST") {
        action = `Created ${attrName}`;
        description = nameLabel
          ? `Created ${attrName} ${nameLabel}${
              masterPartNo ? ` (Master: ${masterPartNo})` : ""
            }`
          : `Created ${attrName}`;
      } else if (method === "DELETE") {
        action = `Deleted ${attrName}`;
        description = nameLabel
          ? `Deleted ${attrName} ${nameLabel}`
          : `Deleted ${attrName}`;
      } else if (newStatus && newStatus !== previousStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = nameLabel
          ? `Changed status of ${attrName} ${nameLabel} to ${formatStatusLabel(newStatus)}`
          : `Changed status of ${attrName} to ${formatStatusLabel(newStatus)}`;
      } else {
        action = `Updated ${attrName}`;
        description = nameLabel
          ? `Updated ${attrName} ${nameLabel}`
          : `Updated ${attrName}`;
      }
      if (nameLabel) entityLabel = nameLabel;
    }

    // Purchase Import → Quotations
    if (pathLower.includes("purchase-import") && pathLower.includes("quotations")) {
      module = "Purchase Import";
      const quotationNo = docLabel(
        responseRecord?.quotationNo,
        responseRecord?.quotation?.quotationNo,
        responseRecord?.quotationNumber,
        req.body?.quotationNo,
        entityLabel,
      );
      const poFromConvert = docLabel(
        responseRecord?.poNumber,
        Array.isArray(responseRecord?.purchaseOrders)
          ? responseRecord.purchaseOrders[0]?.poNumber
          : null,
        body?.data?.poNumber,
      );

      entityType = "purchase_quotation";
      entityName = "Quotation";

      if (pathLower.includes("convert-to-po")) {
        action = "Converted Quotation to PO";
        description = quotationNo
          ? `Converted Quotation ${quotationNo} to Purchase Order${poFromConvert ? ` ${poFromConvert}` : ""}`
          : `Converted Quotation to Purchase Order${poFromConvert ? ` ${poFromConvert}` : ""}`;
        if (poFromConvert) {
          entityType = "purchase_order";
          entityName = "Import Purchase Order";
          entityLabel = poFromConvert;
        } else if (quotationNo) {
          entityLabel = quotationNo;
        }
      } else if (pathLower.includes("/confirm") && !pathLower.includes("unconfirm")) {
        action = "Confirmed Quotation";
        description = quotationNo
          ? `Confirmed Quotation ${quotationNo}`
          : "Confirmed Quotation";
        if (quotationNo) entityLabel = quotationNo;
      } else if (pathLower.includes("/unconfirm")) {
        action = "Unconfirmed Quotation";
        description = quotationNo
          ? `Unconfirmed Quotation ${quotationNo}`
          : "Unconfirmed Quotation";
        if (quotationNo) entityLabel = quotationNo;
      } else if (pathLower.includes("/revise")) {
        action = "Revised Quotation";
        description = quotationNo
          ? `Revised Quotation ${quotationNo}`
          : "Revised Quotation";
        if (quotationNo) entityLabel = quotationNo;
      } else if (method === "POST") {
        action = "Created Quotation";
        description = quotationNo
          ? `Created Quotation ${quotationNo}`
          : "Created Quotation";
        if (quotationNo) entityLabel = quotationNo;
      } else if (method === "DELETE") {
        action = "Deleted Quotation";
        description = quotationNo
          ? `Deleted Quotation ${quotationNo}`
          : "Deleted Quotation";
        if (quotationNo) entityLabel = quotationNo;
      } else if (newStatus) {
        action = `Status changed to ${formatStatusLabel(newStatus)}`;
        description = quotationNo
          ? `Changed status of Quotation ${quotationNo} to ${formatStatusLabel(newStatus)}`
          : `Changed status of Quotation to ${formatStatusLabel(newStatus)}`;
        if (quotationNo) entityLabel = quotationNo;
      } else {
        action = "Updated Quotation";
        description = quotationNo
          ? `Updated Quotation ${quotationNo}`
          : "Updated Quotation";
        if (quotationNo) entityLabel = quotationNo;
      }
    }

    // Purchase Import → Inquiries
    if (pathLower.includes("purchase-import") && pathLower.includes("requests")) {
      module = "Purchase Import";
      entityType = "purchase_inquiry";
      entityName = "Inquiry";
      const requestNo = docLabel(
        responseRecord?.requestNo,
        responseRecord?.baseRequestNo,
        req.body?.requestNo,
        entityLabel,
      );
      if (pathLower.includes("/status") || (newStatus && method !== "POST")) {
        action = newStatus
          ? `Status changed to ${formatStatusLabel(newStatus)}`
          : "Changed status of Inquiry";
        description = requestNo
          ? previousStatus
            ? `Changed status of Inquiry ${requestNo} from ${formatStatusLabel(previousStatus)} to ${formatStatusLabel(newStatus || "")}`
            : `Changed status of Inquiry ${requestNo}${newStatus ? ` to ${formatStatusLabel(newStatus)}` : ""}`
          : `Changed status of Inquiry${newStatus ? ` to ${formatStatusLabel(newStatus)}` : ""}`;
      } else if (method === "POST") {
        action = "Created Inquiry";
        description = requestNo
          ? `Created Inquiry ${requestNo}`
          : "Created Inquiry";
      } else if (method === "DELETE") {
        action = "Deleted Inquiry";
        description = requestNo
          ? `Deleted Inquiry ${requestNo}`
          : "Deleted Inquiry";
      } else {
        action = "Updated Inquiry";
        description = requestNo
          ? `Updated Inquiry ${requestNo}`
          : "Updated Inquiry";
      }
      if (requestNo) entityLabel = requestNo;
    }

    // Inventory → Stock Verification dates
    if (pathLower.includes("stock-verification-dates")) {
      module = "Inventory";
      entityType = "stock_verification";
      entityName = "Stock Verification";
      const partNo = docLabel(
        responseRecord?.partNo,
        responseRecord?.data?.partNo,
        req.body?.partNo,
        entityLabel,
      );
      const verifiedAt =
        responseRecord?.stockVerifiedAt ||
        responseRecord?.data?.stockVerifiedAt ||
        req.body?.verified_at ||
        null;
      const updatedCount =
        responseRecord?.updatedCount ??
        responseRecord?.data?.updatedCount ??
        null;

      if (pathLower.includes("/bulk")) {
        action = "Bulk Updated Stock Verification";
        description =
          updatedCount != null
            ? `Bulk updated stock verification date for ${updatedCount} item(s)${
                verifiedAt ? ` to ${String(verifiedAt).slice(0, 10)}` : ""
              }`
            : `Bulk updated stock verification dates${
                verifiedAt ? ` to ${String(verifiedAt).slice(0, 10)}` : ""
              }`;
      } else {
        action = "Updated Stock Verification";
        description = partNo
          ? `Updated stock verification date for ${partNo}${
              verifiedAt ? ` to ${String(verifiedAt).slice(0, 10)}` : ""
            }`
          : `Updated stock verification date${
              verifiedAt ? ` to ${String(verifiedAt).slice(0, 10)}` : ""
            }`;
        if (partNo) entityLabel = partNo;
      }
    }

    // Employees → master record create/update (not payroll/loan nested routes)
    if (
      (pathLower === "employees" ||
        /^employees\/[0-9a-f-]{36}$/i.test(pathLower)) &&
      !pathLower.includes("transactions") &&
      !pathLower.includes("payroll") &&
      !pathLower.includes("loan-advance")
    ) {
      module = "Employees";
      entityType = "employee";
      entityName = "Employee";
      const employeeName = docLabel(
        responseRecord?.name,
        req.body?.name,
        responseRecord?.Employee?.name,
      );
      const employeeCode = docLabel(
        responseRecord?.code,
        req.body?.code,
        responseRecord?.Employee?.code,
      );
      const statusLabel = docLabel(
        responseRecord?.status,
        req.body?.status,
        newStatus,
      );
      const label =
        employeeName && employeeCode
          ? `${employeeName} (${employeeCode})`
          : employeeName || employeeCode || entityLabel;
      if (label) entityLabel = label;

      if (method === "POST") {
        action = "Created Employee";
        description = entityLabel
          ? `Created Employee ${entityLabel}`
          : "Created Employee";
      } else if (method === "DELETE") {
        action = "Deleted Employee";
        description = entityLabel
          ? `Deleted Employee ${entityLabel}`
          : "Deleted Employee";
      } else if (newStatus && newStatus !== previousStatus) {
        const toLabel = formatStatusLabel(newStatus);
        action = `Status changed to ${toLabel}`;
        description = entityLabel
          ? `Changed status of Employee ${entityLabel} to ${toLabel}`
          : `Changed status of Employee to ${toLabel}`;
      } else {
        action = "Updated Employee";
        description = entityLabel
          ? `Updated Employee ${entityLabel}`
          : "Updated Employee";
        if (statusLabel && !newStatus) {
          description += ` (status: ${formatStatusLabel(statusLabel)})`;
        }
      }
    }

    // Employees → Payroll transactions
    if (pathLower.includes("payroll-transactions")) {
      module = "Employees";
      entityType = "payroll";
      entityName = "Payroll";
      const payrollMonth =
        responseRecord?.payrollMonth ||
        responseRecord?.transaction?.payrollMonth ||
        responseRecord?.data?.payrollMonth ||
        req.body?.payrollMonth ||
        null;
      const employeeName =
        responseRecord?.employeeName ||
        responseRecord?.transaction?.employeeName ||
        responseRecord?.data?.employeeName ||
        responseRecord?.Employee?.name ||
        responseRecord?.transaction?.Employee?.name ||
        null;
      if (method === "DELETE") {
        action = "Deleted Payroll Accrual";
        description = employeeName
          ? `Deleted unpaid payroll accrual for ${employeeName}${
              payrollMonth ? ` (${payrollMonth})` : ""
            }`
          : `Deleted unpaid payroll accrual${
              payrollMonth ? ` for ${payrollMonth}` : ""
            }`;
      } else if (method === "PUT") {
        action = "Updated Payroll Accrual";
        description = employeeName
          ? `Updated payroll accrual for ${employeeName}${
              payrollMonth ? ` (${payrollMonth})` : ""
            }`
          : `Updated payroll accrual${payrollMonth ? ` for ${payrollMonth}` : ""}`;
      } else {
        action = `${verb} Payroll`;
        description = employeeName
          ? `${verb} payroll for ${employeeName}`
          : `${verb} payroll`;
      }
      if (employeeName) entityLabel = employeeName;
      else if (payrollMonth) entityLabel = String(payrollMonth);
    }

    // Employees → Staff transactions (accrual / payment / loan)
    if (
      pathLower.includes("/transactions") &&
      pathLower.startsWith("employees/") &&
      !pathLower.includes("payroll-transactions") &&
      !pathLower.includes("loan-advance")
    ) {
      module = "Employees";
      const txType = String(
        req.body?.type ||
          responseRecord?.type ||
          responseRecord?.transaction?.type ||
          "",
      ).trim();
      const employeeName = docLabel(
        responseRecord?.employeeName,
        responseRecord?.Employee?.name,
        responseRecord?.employee?.name,
        responseRecord?.transaction?.Employee?.name,
        responseRecord?.transaction?.employeeName,
        req.body?.employeeName,
      );
      const payrollMonth =
        req.body?.payrollMonth ||
        responseRecord?.payrollMonth ||
        responseRecord?.transaction?.payrollMonth ||
        responseRecord?.data?.payrollMonth ||
        null;

      if (txType === "salary_accrual") {
        entityType = "payroll";
        entityName = "Payroll";
        action = "Accrued Salary";
        description = employeeName
          ? `Accrued salary for ${employeeName}${
              payrollMonth ? ` (${payrollMonth})` : ""
            }`
          : `Accrued salary${payrollMonth ? ` for ${payrollMonth}` : ""}`;
        if (employeeName) entityLabel = employeeName;
        else if (payrollMonth) entityLabel = String(payrollMonth);
      } else if (txType === "salary_payment") {
        entityType = "payroll";
        entityName = "Payroll Payment";
        action = "Paid Salary";
        description = employeeName
          ? `Paid salary for ${employeeName}${
              payrollMonth ? ` (${payrollMonth})` : ""
            }`
          : `Paid salary${payrollMonth ? ` for ${payrollMonth}` : ""}`;
        if (employeeName) entityLabel = employeeName;
        else if (payrollMonth) entityLabel = String(payrollMonth);
      } else if (txType) {
        entityType = "employee_transaction";
        entityName = titleCase(txType.replace(/_/g, " "));
        action = `${verb} ${entityName}`;
        description = employeeName
          ? `${verb} ${entityName} for ${employeeName}`
          : `${verb} ${entityName}`;
        if (employeeName) entityLabel = employeeName;
      }
    }

    // Generic status_change fallback (skip paths already specialized)
    const specialized =
      pathLower.includes("accounting/accounts") ||
      pathLower.includes("/vouchers") ||
      pathLower.startsWith("vouchers/") ||
      pathLower === "vouchers" ||
      pathLower.includes("/delivery") ||
      pathLower.includes("update-location") ||
      pathLower.includes("transfer-location") ||
      pathLower.includes("/transfers") ||
      pathLower.includes("/adjustments") ||
      pathLower.includes("direct-purchase-orders") ||
      pathLower.includes("purchase-orders") ||
      pathLower.includes("/pos/") ||
      pathLower.includes("stock-verification-dates") ||
      pathLower.includes("payroll-transactions") ||
      (pathLower.includes("/transactions") &&
        pathLower.startsWith("employees/")) ||
      pathLower === "employees" ||
      /^employees\/[0-9a-f-]{36}$/i.test(pathLower) ||
      ((pathLower.startsWith("parts/") || pathLower === "parts") &&
        !pathLower.includes("parts-sales") &&
        !pathLower.includes("parts-dropdown")) ||
      (pathLower.startsWith("dropdowns/") &&
        (pathLower.includes("/brands") ||
          pathLower.includes("/categories") ||
          pathLower.includes("/subcategories") ||
          pathLower.includes("/applications"))) ||
      (pathLower.includes("sales/") &&
        pathLower.includes("invoices") &&
        !pathLower.includes("/delivery") &&
        !pathLower.includes("/payment") &&
        !pathLower.includes("/hold")) ||
      (pathLower.includes("purchase-import") &&
        (pathLower.includes("quotations") || pathLower.includes("requests")));

    if (
      !specialized &&
      (actionType === "status_change" || actionType === "approve")
    ) {
      if (newStatus) {
        const toLabel = formatStatusLabel(newStatus);
        action = `Status changed to ${toLabel}`;
        if (entityLabel && previousStatus) {
          description = `Changed status of ${entityName} ${entityLabel} from ${formatStatusLabel(previousStatus)} to ${toLabel}`;
        } else if (entityLabel) {
          description = `Changed status of ${entityName} ${entityLabel} to ${toLabel}`;
        } else if (previousStatus) {
          description = `Changed status of ${entityName} from ${formatStatusLabel(previousStatus)} to ${toLabel}`;
        } else {
          description = `Changed status of ${entityName} to ${toLabel}`;
        }
      } else if (actionType === "approve" && entityLabel) {
        description = `Approved ${entityName} ${entityLabel}`;
      }
    }

    // Always re-fetch full document by id so Activity Details has entries/lines
    // even when the API response only returned a UUID / summary.
    const dbSnapshot = await fetchDocumentSnapshot(
      entityType,
      entityId,
      pathLower,
      actionType,
    );
    const enrichedRecord = mergeDocumentRecord(responseRecord, dbSnapshot);
    const partMap = await resolvePartNoMap(enrichedRecord, req.body);

    // Prefer human-readable label from DB when response only had UUID
    if (!entityLabel || looksLikeUuid(entityLabel)) {
      const dbLabel =
        pickLabel(enrichedRecord) ||
        docLabel(
          enrichedRecord?.voucherNumber,
          enrichedRecord?.invoiceNo,
          enrichedRecord?.poNumber,
          enrichedRecord?.dpoNumber,
          enrichedRecord?.transferNumber,
          enrichedRecord?.Employee?.name,
        );
      if (dbLabel) entityLabel = dbLabel;
    }

    const businessDetails = buildBusinessDetails({
      responseRecord: enrichedRecord,
      reqBody: req.body,
      entityType,
      entityLabel,
      newStatus,
      previousStatus,
      pathLower,
      partMap,
    });

    await logActivity(
      {
        user: performer.user,
        userId: performer.userId,
        userRole: performer.userRole,
        action,
        actionType,
        module: performer.attributedViaPassword ? "Store" : module,
        description: withOperatorAttribution(description, performer),
        entityType,
        entityId: responseRecord?.partId || req.body?.part_id || entityId,
        entityLabel,
        ipAddress: getClientIp(req),
        status: "success",
        details: {
          ...businessDetails,
          ...(req.body?.type && !businessDetails.voucherType
            ? { transactionType: String(req.body.type) }
            : {}),
          ...(req.body?.payrollMonth && !businessDetails.payrollMonth
            ? { payrollMonth: String(req.body.payrollMonth) }
            : {}),
          ...(req.body?.verified_at
            ? { verifiedAt: String(req.body.verified_at) }
            : {}),
          ...(responseRecord?.updatedCount != null
            ? { updatedCount: responseRecord.updatedCount }
            : responseRecord?.data?.updatedCount != null
              ? { updatedCount: responseRecord.data.updatedCount }
              : {}),
          ...(performer.attributedViaPassword
            ? {
                performedBy: performer.user,
                performedByRole: performer.userRole,
                sessionUser: performer.sessionUser,
                sessionUserRole: performer.sessionUserRole,
              }
            : {}),
        },
      },
      req,
    );
  } catch (error) {
    console.error("Activity audit middleware failed:", error);
  }
}
