import { Response, NextFunction } from "express";
import {
  ActivityActionType,
  getClientIp,
  logActivity,
  wasActivityLogged,
} from "../utils/activityLogger";
import { AuthRequest } from "./authMiddleware";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SKIP_PATH_FRAGMENTS = [
  "/activity-logs",
  "/auth/login",
  "/auth/forgot-password",
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
  "code",
  "name",
  "email",
  "title",
  "reference",
  "refNo",
  "documentNo",
  "employeeCode",
  "employeeName",
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
  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  if (Array.isArray(body.data) && body.data[0]) return body.data[0];
  return body;
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

    // Don't log failed business responses that still return 200 with error field
    if (body && typeof body === "object" && body.error && !body.data) return;

    const apiPath = normalizeApiPath(req.originalUrl || req.url || "");
    const pathLower = apiPath.toLowerCase();
    const method = req.method.toUpperCase();
    let resource = resolveResource(apiPath);
    let { module, entityType, entityName } = resource;
    const actionType = inferActionType(method, apiPath, req.body);

    const responseRecord = unwrapRecord(body);
    const entityId =
      pickParamId(req.params as Record<string, any>) ||
      pickId(req.body) ||
      pickId(responseRecord) ||
      null;

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

    // Generic status_change fallback (skip paths already specialized)
    const specialized =
      pathLower.includes("/delivery") ||
      pathLower.includes("update-location") ||
      pathLower.includes("transfer-location") ||
      pathLower.includes("/transfers") ||
      pathLower.includes("/adjustments") ||
      pathLower.includes("direct-purchase-orders") ||
      pathLower.includes("purchase-orders") ||
      pathLower.includes("/pos/") ||
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
        isTransferOutInvoice(req.body, responseRecord)) ||
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

    await logActivity(
      {
        user: user.name || user.email || "Unknown",
        userId: user.id || null,
        userRole: user.role || "User",
        action,
        actionType,
        module,
        description,
        entityType,
        entityId: responseRecord?.partId || req.body?.part_id || entityId,
        entityLabel,
        ipAddress: getClientIp(req),
        status: "success",
        details: {
          method,
          path: `/${apiPath}`,
          ...(newStatus ? { status: newStatus } : {}),
          ...(previousStatus ? { previousStatus } : {}),
        },
      },
      req,
    );
  } catch (error) {
    console.error("Activity audit middleware failed:", error);
  }
}
