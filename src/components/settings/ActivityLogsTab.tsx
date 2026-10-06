import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Search,
  Download,
  LogIn,
  Plus,
  Edit, 
  Trash,
  Eye,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { usePageActions } from "@/permissions/pageActions";
import { getCurrentDatePakistan, formatUiDateTime } from "@/utils/dateUtils";
import { Label } from "@/components/ui/label";

interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  userId?: string | null;
  userRole: string;
  action: string;
  actionType: string;
  module: string;
  description: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  ipAddress?: string;
  status: "success" | "warning" | "error";
  details?: Record<string, unknown>;
}

const DETAIL_LABELS: Record<string, string> = {
  accountName: "Account Name",
  accountCode: "Account Code",
  voucherNumber: "Voucher No",
  voucherType: "Voucher Type",
  narration: "Narration",
  amount: "Amount",
  invoiceNo: "Invoice No",
  customer: "Customer",
  supplier: "Supplier",
  poNumber: "PO Number",
  dpoNumber: "DPO Number",
  transferNumber: "Transfer No",
  fromStore: "From Store",
  toStore: "To Store",
  quantity: "Quantity",
  items: "Items",
  itemCount: "Item Count",
  entryCount: "Entry Count",
  entries: "Voucher Entries",
  lineItems: "Line Items",
  breakdown: "Payroll Breakdown",
  quotationNo: "Quotation No",
  requestNo: "Inquiry No",
  partNo: "Part No",
  employee: "Employee",
  employeeCode: "Employee Code",
  reference: "Reference",
  status: "Status",
  previousStatus: "Previous Status",
  transactionType: "Transaction Type",
  payrollMonth: "Payroll Month",
  verifiedAt: "Verification Date",
  updatedCount: "Items Updated",
  performedBy: "Performed By",
  performedByRole: "Performer Role",
  sessionUser: "Session User",
  sessionUserRole: "Session User Role",
  number: "Number",
  type: "Type",
  date: "Date",
  paymentStatus: "Payment Status",
  remarks: "Remarks",
  notes: "Notes",
  month: "Month",
  store: "Store",
  currency: "Currency",
};

const HIDDEN_DETAIL_KEYS = new Set([
  "method",
  "path",
  "entity",
  "performedById",
  "sessionUserId",
  "documentType",
  "header",
  "lines",
  "lineKind",
]);

const DOCUMENT_TYPE_TITLES: Record<string, string> = {
  voucher: "Voucher",
  sales_invoice: "Sales Invoice",
  transfer_out: "Transfer Out",
  purchase_order: "Purchase Order",
  direct_purchase_order: "Direct Purchase Order",
  transfer_in: "Transfer In",
  stock_transfer: "Stock Transfer",
  payroll: "Payroll",
  employee: "Employee",
};

const HEADER_FIELD_ORDER = [
  "number",
  "type",
  "date",
  "customer",
  "supplier",
  "employee",
  "employeeCode",
  "month",
  "fromStore",
  "toStore",
  "status",
  "paymentStatus",
  "amount",
  "quantity",
  "narration",
  "remarks",
  "notes",
  "reference",
  "invoiceNo",
  "poNumber",
  "dpoNumber",
  "store",
  "currency",
];

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );

const formatDetailKey = (key: string) =>
  DETAIL_LABELS[key] ||
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const MULTILINE_DETAIL_KEYS = new Set([
  "entries",
  "lineItems",
  "breakdown",
]);

const formatDetailValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join("\n");
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const moneyText = (value: unknown): string | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const dateText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
};

type DocumentSnapshot = {
  documentType: string;
  header: Record<string, unknown>;
  lines: Record<string, unknown>[];
  lineKind?: string;
};

const canLiveFetchDocument = (log: ActivityLog): boolean => {
  if (!log.entityId) return false;
  const et = String(log.entityType || "").toLowerCase();
  return (
    et.includes("voucher") ||
    et.includes("invoice") ||
    et.includes("sale") ||
    et === "transfer_out" ||
    et.includes("purchase_order") ||
    et === "direct_purchase_order" ||
    et === "transfer_in" ||
    et === "stock_transfer" ||
    et === "employee"
  );
};

const buildLiveDocumentSnapshot = async (
  log: ActivityLog,
): Promise<DocumentSnapshot | null> => {
  if (!log.entityId) return null;
  const et = String(log.entityType || "").toLowerCase();
  const id = log.entityId;

  try {
    if (et.includes("voucher")) {
      const res = await apiClient.getVoucher(id);
      const v: any = (res as any)?.data ?? null;
      if (!v || (res as any)?.error) return null;
      const entries = Array.isArray(v.entries)
        ? v.entries
        : Array.isArray(v.VoucherEntry)
          ? v.VoucherEntry
          : [];
      return {
        documentType: "voucher",
        lineKind: "voucher",
        header: {
          number: v.voucherNumber,
          type: v.type,
          date: dateText(v.date),
          narration: v.narration || undefined,
          status: v.status,
          amount: moneyText(v.totalDebit ?? v.totalCredit),
        },
        lines: entries.map((e: any) => ({
          account: e.accountName || e.Account?.name || e.account || "Account",
          debit: moneyText(e.debit) || "0.00",
          credit: moneyText(e.credit) || "0.00",
          description: e.description || undefined,
        })),
      };
    }

    if (
      et.includes("invoice") ||
      et.includes("sale") ||
      et === "transfer_out"
    ) {
      const res = await apiClient.getSalesInvoice(id);
      const inv: any = (res as any)?.data ?? null;
      if (!inv || (res as any)?.error) return null;
      const items = Array.isArray(inv.SalesInvoiceItem)
        ? inv.SalesInvoiceItem
        : Array.isArray(inv.items)
          ? inv.items
          : [];
      return {
        documentType:
          String(inv.customerType || "").toLowerCase() === "transfer" ||
          et === "transfer_out"
            ? "transfer_out"
            : "sales_invoice",
        lineKind: "items",
        header: {
          number: inv.invoiceNo,
          customer: inv.customerName,
          date: dateText(inv.invoiceDate),
          status: inv.status,
          paymentStatus: inv.paymentStatus,
          amount: moneyText(inv.grandTotal),
          remarks: inv.remarks || undefined,
        },
        lines: items.map((item: any) => ({
          partNo: item.partNo || item.Part?.partNo || item.part_no || "Item",
          qty: item.orderedQty ?? item.quantity ?? 0,
          rate: moneyText(item.unitPrice ?? item.unit_price) || undefined,
          amount: moneyText(item.lineTotal ?? item.amount) || undefined,
        })),
      };
    }

    if (et === "direct_purchase_order" || et === "transfer_in") {
      const res = await apiClient.getDirectPurchaseOrder(id);
      const dpo: any = (res as any)?.data ?? res?.data ?? res;
      if (!dpo || (res as any)?.error) return null;
      const items = Array.isArray(dpo.items)
        ? dpo.items
        : Array.isArray(dpo.DirectPurchaseOrderItem)
          ? dpo.DirectPurchaseOrderItem
          : [];
      return {
        documentType: et === "transfer_in" ? "transfer_in" : "direct_purchase_order",
        lineKind: "items",
        header: {
          number: dpo.dpoNumber || dpo.dpo_number,
          supplier: dpo.supplier_name || dpo.supplierName || dpo.Supplier?.name,
          date: dateText(dpo.date),
          status: dpo.status,
          amount: moneyText(dpo.totalAmount || dpo.total_amount),
        },
        lines: items.map((item: any) => ({
          partNo: item.part_no || item.partNo || item.Part?.partNo || "Item",
          qty: item.quantity ?? 0,
          rate: moneyText(item.purchase_price ?? item.purchasePrice) || undefined,
          amount: moneyText(item.amount) || undefined,
        })),
      };
    }

    if (et.includes("purchase_order")) {
      const res = await apiClient.getPurchaseOrder(id);
      const po: any = (res as any)?.data ?? res;
      if (!po || (res as any)?.error) return null;
      const items = Array.isArray(po.items)
        ? po.items
        : Array.isArray(po.PurchaseOrderItem)
          ? po.PurchaseOrderItem
          : [];
      return {
        documentType: "purchase_order",
        lineKind: "items",
        header: {
          number: po.poNumber || po.po_number,
          supplier: po.supplier_name || po.supplierName || po.Supplier?.name,
          date: dateText(po.date),
          status: po.status,
          amount: moneyText(po.totalAmount || po.total_amount),
        },
        lines: items.map((item: any) => ({
          partNo: item.part_no || item.partNo || item.Part?.partNo || "Item",
          qty: item.quantity ?? 0,
          rate: moneyText(item.unit_cost ?? item.unitCost) || undefined,
          amount: moneyText(item.total_cost ?? item.totalCost) || undefined,
        })),
      };
    }

    if (et === "stock_transfer") {
      const res = await apiClient.getTransfer(id);
      const t: any = (res as any)?.data ?? res;
      if (!t || (res as any)?.error) return null;
      const items = Array.isArray(t.items)
        ? t.items
        : Array.isArray(t.TransferItem)
          ? t.TransferItem
          : [];
      return {
        documentType: "stock_transfer",
        lineKind: "transfer",
        header: {
          number: t.transferNumber || t.transfer_number,
          fromStore:
            t.from_store ||
            t.fromStoreName ||
            t.Store_Transfer_fromStoreIdToStore?.name,
          toStore:
            t.to_store ||
            t.toStoreName ||
            t.Store_Transfer_toStoreIdToStore?.name,
          date: dateText(t.date),
          status: t.status,
          quantity: t.total_qty ?? t.totalQty,
        },
        lines: items.map((item: any) => ({
          partNo: item.part_no || item.partNo || item.Part?.partNo || "Item",
          qty: item.quantity ?? 0,
        })),
      };
    }

    if (et === "employee") {
      const res = await apiClient.getEmployee(id);
      const emp: any = (res as any)?.data ?? null;
      if (!emp || (res as any)?.error) return null;
      const lines: Record<string, unknown>[] = [];
      const push = (label: string, value: unknown) => {
        if (value === undefined || value === null || value === "") return;
        lines.push({ label, value: String(value) });
      };
      push("CNIC", emp.cnic);
      push("Contact", emp.contactNo);
      push("Email", emp.email);
      push("Designation", emp.designation);
      push("Department", emp.department);
      push("Monthly salary", moneyText(emp.monthlySalary));
      push("Working days", emp.workingDays);
      push("Joining date", dateText(emp.joiningDate));
      push("Remarks", emp.remarks);
      return {
        documentType: "employee",
        lineKind: "payroll",
        header: {
          number: emp.code,
          employee: emp.name,
          code: emp.code,
          status: emp.status,
          designation: emp.designation,
          department: emp.department,
          amount: moneyText(emp.monthlySalary),
        },
        lines,
      };
    }
  } catch {
    return null;
  }

  return null;
};

const getDocumentSnapshot = (
  details?: Record<string, unknown> | null,
): DocumentSnapshot | null => {
  if (!details || typeof details !== "object") return null;
  const documentType = details.documentType;
  const header = details.header;
  const lines = details.lines;
  if (typeof documentType !== "string" || !documentType) return null;
  if (!header || typeof header !== "object" || Array.isArray(header)) return null;
  if (!Array.isArray(lines)) return null;
  return {
    documentType,
    header: header as Record<string, unknown>,
    lines: lines as Record<string, unknown>[],
    lineKind: typeof details.lineKind === "string" ? details.lineKind : undefined,
  };
};

const getVisibleDetails = (
  details?: Record<string, unknown> | null,
  overrideSnapshot?: DocumentSnapshot | null,
): [string, unknown][] => {
  if (!details || typeof details !== "object") return [];
  const primaryKeys = [
    "invoiceNo",
    "voucherNumber",
    "poNumber",
    "dpoNumber",
    "transferNumber",
    "accountName",
    "employee",
    "partNo",
  ];
  const primaryValues = new Set(
    primaryKeys
      .map((k) => details[k])
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map((v) => String(v)),
  );
  const snapshot = overrideSnapshot || getDocumentSnapshot(details);
  const headerKeys = snapshot ? new Set(Object.keys(snapshot.header)) : new Set<string>();

  return Object.entries(details).filter(([key, value]) => {
    if (HIDDEN_DETAIL_KEYS.has(key)) return false;
    if (typeof value === "object" && value !== null) return false;
    if (typeof value === "string" && looksLikeUuid(value)) return false;
    // Avoid duplicating fields already shown in the document header
    if (snapshot) {
      if (key === "amount" && headerKeys.has("amount")) return false;
      if (key === "status" && headerKeys.has("status")) return false;
      if (key === "voucherNumber" && headerKeys.has("number")) return false;
      if (key === "invoiceNo" && headerKeys.has("number")) return false;
      if (key === "poNumber" && (headerKeys.has("number") || headerKeys.has("poNumber"))) return false;
      if (key === "dpoNumber" && (headerKeys.has("number") || headerKeys.has("dpoNumber"))) return false;
      if (key === "transferNumber" && headerKeys.has("number")) return false;
      if (key === "customer" && headerKeys.has("customer")) return false;
      if (key === "supplier" && headerKeys.has("supplier")) return false;
      if (key === "employee" && headerKeys.has("employee")) return false;
      if (key === "payrollMonth" && headerKeys.has("month")) return false;
      if (key === "voucherType" && headerKeys.has("type")) return false;
      if (key === "transactionType" && headerKeys.has("type")) return false;
      if (key === "fromStore" && headerKeys.has("fromStore")) return false;
      if (key === "toStore" && headerKeys.has("toStore")) return false;
      if (key === "quantity" && headerKeys.has("quantity")) return false;
      if (key === "narration" && headerKeys.has("narration")) return false;
      if (key === "itemCount" || key === "entryCount") return false;
      if (key === "entries" || key === "lineItems" || key === "breakdown") return false;
    }
    if (
      key === "reference" &&
      typeof value === "string" &&
      primaryValues.has(value)
    ) {
      return false;
    }
    return true;
  });
};

const orderedHeaderEntries = (
  header: Record<string, unknown>,
): [string, unknown][] => {
  const entries = Object.entries(header).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  const rank = (key: string) => {
    const idx = HEADER_FIELD_ORDER.indexOf(key);
    return idx === -1 ? 1000 : idx;
  };
  return entries.sort((a, b) => rank(a[0]) - rank(b[0]));
};

const DocumentDetailsPanel = ({ snapshot }: { snapshot: DocumentSnapshot }) => {
  const title =
    DOCUMENT_TYPE_TITLES[snapshot.documentType] ||
    formatDetailKey(snapshot.documentType);
  const headerEntries = orderedHeaderEntries(snapshot.header);
  const lineKind = snapshot.lineKind || (
    snapshot.documentType === "voucher"
      ? "voucher"
      : snapshot.documentType === "stock_transfer"
        ? "transfer"
        : snapshot.documentType === "payroll"
          ? "payroll"
          : "items"
  );

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {snapshot.header.number != null && snapshot.header.number !== "" && (
          <p className="text-sm font-medium text-muted-foreground">
            {String(snapshot.header.number)}
          </p>
        )}
      </div>

      {headerEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 p-3 text-sm">
          {headerEntries.map(([key, value]) => (
            <div
              key={key}
              className={
                key === "narration" || key === "remarks" || key === "notes"
                  ? "col-span-2 sm:col-span-3"
                  : undefined
              }
            >
              <p className="text-xs text-muted-foreground">{formatDetailKey(key)}</p>
              <p className="font-medium break-words">{formatDetailValue(value)}</p>
            </div>
          ))}
        </div>
      )}

      {snapshot.lines.length > 0 && (
        <div className="border-t">
          <div className="px-3 py-1.5 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {lineKind === "voucher"
                ? "Entries"
                : lineKind === "payroll"
                  ? "Breakdown"
                  : "Line Items"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {lineKind === "voucher" && (
                    <>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Description</TableHead>
                    </>
                  )}
                  {lineKind === "items" && (
                    <>
                      <TableHead>Part No</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </>
                  )}
                  {lineKind === "transfer" && (
                    <>
                      <TableHead>Part No</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </>
                  )}
                  {lineKind === "payroll" && (
                    <>
                      <TableHead>Field</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.lines.map((line, idx) => (
                  <TableRow key={idx}>
                    {lineKind === "voucher" && (
                      <>
                        <TableCell className="font-medium">
                          {formatDetailValue(line.account)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDetailValue(line.debit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDetailValue(line.credit)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDetailValue(line.description)}
                        </TableCell>
                      </>
                    )}
                    {lineKind === "items" && (
                      <>
                        <TableCell className="font-medium">
                          {formatDetailValue(line.partNo)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDetailValue(line.qty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDetailValue(line.rate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDetailValue(line.amount)}
                        </TableCell>
                      </>
                    )}
                    {lineKind === "transfer" && (
                      <>
                        <TableCell className="font-medium">
                          {formatDetailValue(line.partNo)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDetailValue(line.qty)}
                        </TableCell>
                      </>
                    )}
                    {lineKind === "payroll" && (
                      <>
                        <TableCell>{formatDetailValue(line.label)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatDetailValue(line.value)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

const actionIcons: Record<string, React.ReactNode> = {
  login: <LogIn className="w-4 h-4" />,
  create: <Plus className="w-4 h-4" />,
  update: <Edit className="w-4 h-4" />,
  delete: <Trash className="w-4 h-4" />,
  export: <Download className="w-4 h-4" />,
  print: <Printer className="w-4 h-4" />,
  status_change: <RefreshCw className="w-4 h-4" />,
  approve: <CheckCircle className="w-4 h-4" />,
  backup: <Database className="w-4 h-4" />,
  restore: <Database className="w-4 h-4" />,
  login_failed: <XCircle className="w-4 h-4" />,
};

const actionColors: Record<string, string> = {
  login: "bg-blue-100 text-blue-700",
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-amber-100 text-amber-700",
  delete: "bg-red-100 text-red-700",
  export: "bg-purple-100 text-purple-700",
  print: "bg-indigo-100 text-indigo-700",
  status_change: "bg-sky-100 text-sky-700",
  approve: "bg-emerald-100 text-emerald-700",
  backup: "bg-slate-100 text-slate-700",
  restore: "bg-slate-100 text-slate-700",
  login_failed: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  error: "bg-red-100 text-red-700 border-red-200",
};

const roleColors: Record<string, string> = {
  Admin: "bg-violet-100 text-violet-700",
  Manager: "bg-blue-100 text-blue-700",
  Staff: "bg-emerald-100 text-emerald-700",
  Accountant: "bg-primary/15 text-primary",
  Viewer: "bg-gray-100 text-gray-700",
};

export const ActivityLogsTab = () => {
  const { canExport } = usePageActions("settings.activity");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => getCurrentDatePakistan());
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<DocumentSnapshot | null>(null);
  const [liveSnapshotLoading, setLiveSnapshotLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    warning: 0,
    error: 0,
  });

  const fetchLogs = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page,
        limit,
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (moduleFilter !== "all") params.module = moduleFilter;
      if (actionFilter !== "all") params.actionType = actionFilter;
      if (dateFilter) {
        params.fromDate = dateFilter;
        params.toDate = dateFilter;
      }

      const response = await apiClient.getActivityLogs(params);
      if (signal?.aborted) return;

      if (response.error) {
        toast.error(response.error);
        setLogs([]);
        return;
      }

      const rows = Array.isArray(response.data) ? response.data : [];
      setLogs(rows);

      if (response.pagination) {
        setTotal(Number(response.pagination.total) || 0);
      } else {
        setTotal(rows.length);
      }

      const responseStats = (response as { stats?: typeof stats }).stats;
      if (responseStats) {
        setStats({
          total: Number(responseStats.total) || 0,
          success: Number(responseStats.success) || 0,
          warning: Number(responseStats.warning) || 0,
          error: Number(responseStats.error) || 0,
        });
      } else {
        setStats({
          total: Number(response.pagination?.total) || rows.length,
          success: rows.filter((l) => l.status === "success").length,
          warning: rows.filter((l) => l.status === "warning").length,
          error: rows.filter((l) => l.status === "error").length,
        });
      }
    } catch (error: any) {
      if (signal?.aborted) return;
      toast.error(error.message || "Failed to fetch activity logs");
      setLogs([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, moduleFilter, actionFilter, dateFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchLogs(controller.signal);
    }, searchQuery ? 400 : 0);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, moduleFilter, actionFilter, searchQuery, dateFilter]);

  useEffect(() => {
    let cancelled = false;
    setLiveSnapshot(null);

    if (!selectedLog) {
      setLiveSnapshotLoading(false);
      return;
    }

    const stored = getDocumentSnapshot(selectedLog.details);
    // Prefer live fetch when we have an id, so older logs also show full lines
    if (!canLiveFetchDocument(selectedLog)) {
      setLiveSnapshotLoading(false);
      return;
    }

    setLiveSnapshotLoading(true);
    void buildLiveDocumentSnapshot(selectedLog)
      .then((snap) => {
        if (!cancelled) {
          setLiveSnapshot(snap || stored);
          setLiveSnapshotLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveSnapshot(stored);
          setLiveSnapshotLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedLog]);

  const getInitials = (name?: string | null) => {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "?";
    return parts
      .map((n) => n[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleExport = () => {
    const csvContent = [
      ["Timestamp", "User", "User ID", "Action", "Module", "Entity", "Entity ID", "Description", "Status"],
      ...logs.map(log => [
        log.timestamp,
        log.user,
        log.userId || "",
        log.action,
        log.module,
        log.entityLabel || log.entityType || "",
        log.entityId || "",
        log.description,
        log.status,
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity_logs.csv";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Total Activities</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <FileText className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Successful</p>
              <p className="text-2xl font-bold">{stats.success}</p>
            </div>
            <CheckCircle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Warnings</p>
              <p className="text-2xl font-bold">{stats.warning}</p>
            </div>
            <AlertTriangle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Errors</p>
              <p className="text-2xl font-bold">{stats.error}</p>
            </div>
            <XCircle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="activity-date" className="text-xs text-muted-foreground whitespace-nowrap">
              Date
            </Label>
            <Input
              id="activity-date"
              type="date"
              value={dateFilter}
              max={getCurrentDatePakistan()}
              onChange={(e) => setDateFilter(e.target.value || getCurrentDatePakistan())}
              className="w-40"
            />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              <SelectItem value="Auth">Auth</SelectItem>
              <SelectItem value="Sales">Sales</SelectItem>
              <SelectItem value="Inventory">Inventory</SelectItem>
              <SelectItem value="Users">Users</SelectItem>
              <SelectItem value="Reports">Reports</SelectItem>
              <SelectItem value="Purchase">Purchase</SelectItem>
              <SelectItem value="Purchase Import">Purchase Import</SelectItem>
              <SelectItem value="Vouchers">Vouchers</SelectItem>
              <SelectItem value="Backup">Backup</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="print">Print</SelectItem>
              <SelectItem value="status_change">Status Change</SelectItem>
              <SelectItem value="export">Export</SelectItem>
              <SelectItem value="approve">Approve</SelectItem>
              <SelectItem value="backup">Backup</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canExport && (
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>TIMESTAMP</TableHead>
                <TableHead>USER</TableHead>
                <TableHead>ACTION</TableHead>
                <TableHead>MODULE</TableHead>
                <TableHead>ENTITY</TableHead>
                <TableHead>DESCRIPTION</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead>DETAILS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No activity logs found
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log, index) => (
                <TableRow key={log.id}>
                  <ListNumberCell index={index} page={page} pageSize={limit} total={total} />
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.timestamp ? formatUiDateTime(log.timestamp) : 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className={`text-xs ${roleColors[log.userRole] || 'bg-gray-100'}`}>
                          {getInitials(log.user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{log.user}</p>
                        <p className="text-xs text-muted-foreground">{log.userRole}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`gap-1 ${actionColors[log.actionType] || ''}`}>
                      {actionIcons[log.actionType]}
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{log.module}</Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-[12rem]">
                    {log.entityLabel || log.entityType ? (
                      <div>
                        <p className="whitespace-normal break-words font-medium">
                          {log.entityLabel || log.entityType}
                        </p>
                        {log.entityId &&
                          log.entityLabel &&
                          log.entityId !== log.entityLabel &&
                          !/^[0-9a-f-]{36}$/i.test(log.entityId) && (
                          <p className="text-xs text-muted-foreground truncate">{log.entityId}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm max-w-md whitespace-normal break-words">
                    {log.description}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[log.status]}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedLog(log)}
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} logs
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="px-3">Page {page} of {Math.ceil(total / limit)}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))}
              disabled={page >= Math.ceil(total / limit) || loading}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Activity Details
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="font-medium">{selectedLog.user || "—"}</p>
                  {selectedLog.userRole && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedLog.userRole}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Action</p>
                  <p className="font-medium">{selectedLog.action || "—"}</p>
                  {selectedLog.actionType && (
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {selectedLog.actionType.replace(/_/g, " ")}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Module</p>
                  <p className="font-medium">{selectedLog.module || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="font-medium">
                    {selectedLog.timestamp
                      ? formatUiDateTime(selectedLog.timestamp) || selectedLog.timestamp
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    variant="outline"
                    className={`mt-1 capitalize ${statusColors[selectedLog.status] || ""}`}
                  >
                    {selectedLog.status || "—"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IP Address</p>
                  <p className="font-medium">{selectedLog.ipAddress || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Entity</p>
                  <p className="font-medium">
                    {selectedLog.entityLabel ||
                      selectedLog.entityType?.replace(/_/g, " ") ||
                      "—"}
                  </p>
                  {selectedLog.entityType && selectedLog.entityLabel && (
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {selectedLog.entityType.replace(/_/g, " ")}
                    </p>
                  )}
                  {selectedLog.entityId &&
                    selectedLog.entityId !== selectedLog.entityLabel &&
                    !looksLikeUuid(selectedLog.entityId) && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">
                        ID: {selectedLog.entityId}
                      </p>
                    )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedLog.description || "—"}
                </p>
              </div>
              {(() => {
                const storedSnapshot = getDocumentSnapshot(selectedLog.details);
                const snapshot = liveSnapshot || storedSnapshot;
                const visibleDetails = getVisibleDetails(
                  selectedLog.details,
                  snapshot,
                );
                if (
                  !snapshot &&
                  !liveSnapshotLoading &&
                  visibleDetails.length === 0
                ) {
                  return null;
                }
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {snapshot ? "Document View" : "Additional Details"}
                    </p>
                    {liveSnapshotLoading && !snapshot && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading document details…
                      </div>
                    )}
                    {snapshot && <DocumentDetailsPanel snapshot={snapshot} />}
                    {visibleDetails.length > 0 && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        {visibleDetails.map(([key, value]) => {
                          const text = formatDetailValue(value);
                          const isMultiline =
                            MULTILINE_DETAIL_KEYS.has(key) ||
                            text.includes("\n");
                          return (
                            <div
                              key={key}
                              className={
                                isMultiline
                                  ? "space-y-1 text-sm"
                                  : "flex justify-between gap-3 text-sm"
                              }
                            >
                              <span className="text-muted-foreground shrink-0">
                                {formatDetailKey(key)}
                              </span>
                              {isMultiline ? (
                                <pre className="text-xs font-medium whitespace-pre-wrap break-all bg-background/60 rounded p-2 font-mono">
                                  {text}
                                </pre>
                              ) : (
                                <span className="font-medium text-right break-all">
                                  {text}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
