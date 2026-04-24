import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  Trash2,
  Eye,
  Truck,
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  Package,
  X,
  Printer,
  Download,
  RefreshCw,
  Users,
  Info,
  CheckCircle2,
  Circle,
  Ban,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { InvoiceDeliveryLog } from "./InvoiceDeliveryLog";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { printDeliveryChallan } from "@/lib/printDeliveryChallan";
import {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  CustomerType,
  PartItem,
  Customer,
  DeliveryLogEntry,
  ItemGrade,
  PaymentStatus,
} from "@/types/invoice";

function mapApiSalesInvoiceItemsToInvoiceItems(fullItems: any[]): InvoiceItem[] {
  if (!Array.isArray(fullItems)) return [];
  return fullItems.map((item: any) => {
    const selectedRackCodes = (item.InvoiceRackShelf || [])
      .map((irs: any) => irs?.Rack?.code || irs?.Rack?.codeNo || "")
      .filter(Boolean);
    const selectedShelfNos = (item.InvoiceRackShelf || [])
      .map((irs: any) => irs?.Shelf?.shelfNo || irs?.Shelf?.name || "")
      .filter(Boolean);
    return {
      id: item.id,
      partId: item.partId,
      partNo: item.partNo,
      description: item.description || "",
      orderedQty: Number(item.orderedQty || 0),
      deliveredQty: Number(item.deliveredQty || 0),
      pendingQty: Number(item.pendingQty || 0),
      reversedQty: Math.max(
        0,
        Number(item.orderedQty || 0) -
          Number(item.deliveredQty || 0) -
          Number(item.pendingQty || 0),
      ),
      unitPrice: Number(item.unitPrice || 0),
      discount: Number(item.discount || 0),
      discountType: "percent" as const,
      lineTotal: Number(item.lineTotal || 0),
      grade: (item.grade || "A") as ItemGrade,
      brand: item.brand,
      rackCode: selectedRackCodes.join(", "),
      shelfNo: selectedShelfNos.join(", "),
    };
  });
}

function aggregateReturnedQtyByPartId(salesReturns: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(salesReturns)) return out;
  for (const sr of salesReturns) {
    const retItems = sr?.SalesReturnItem;
    if (!Array.isArray(retItems)) continue;
    for (const ri of retItems) {
      const pid = ri.partId;
      if (!pid) continue;
      out[pid] = (out[pid] || 0) + Number(ri.returnQuantity || 0);
    }
  }
  return out;
}

function validateSaleReturnByPart(
  items: InvoiceItem[],
  qtyByItemId: Record<string, number>,
  returnedByPartId: Record<string, number>,
): string | null {
  const deliveredByPart: Record<string, number> = {};
  const returnSumByPart: Record<string, number> = {};
  for (const item of items) {
    deliveredByPart[item.partId] =
      (deliveredByPart[item.partId] || 0) + Number(item.deliveredQty || 0);
    const q = qtyByItemId[item.id] || 0;
    if (q > 0) {
      returnSumByPart[item.partId] = (returnSumByPart[item.partId] || 0) + q;
    }
  }
  for (const partId of Object.keys(returnSumByPart)) {
    const max =
      (deliveredByPart[partId] || 0) - (returnedByPartId[partId] || 0);
    if (returnSumByPart[partId] > max) {
      return `Returns exceed delivered quantity still available for one or more parts (remaining ${max} for at least one part).`;
    }
  }
  for (const item of items) {
    const q = qtyByItemId[item.id] || 0;
    if (q > Number(item.deliveredQty || 0)) {
      return `Return quantity cannot exceed delivered quantity on line ${item.partNo}.`;
    }
  }
  return null;
}

function effectiveReturnQtyFromDraft(
  draftVal: string | undefined,
  lineCap: number,
): number {
  const raw = (draftVal ?? "").trim();
  let n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  const cap = Number(lineCap) || 0;
  return Math.min(n, cap);
}

/**
 * Remaining returnable qty per part = sum(delivered on invoice lines for part) − qty
 * already returned (pending/completed/approved returns). Then walk lines in order
 * so each line's cap is min(line delivered, pool left) — correct when multiple lines
 * share the same part.
 */
function computeSaleReturnQtyByItemId(
  items: InvoiceItem[],
  draft: Record<string, string>,
  returnedByPartId: Record<string, number>,
): Record<string, number> {
  const deliveredByPart: Record<string, number> = {};
  for (const it of items) {
    deliveredByPart[it.partId] =
      (deliveredByPart[it.partId] || 0) + Number(it.deliveredQty || 0);
  }
  const poolByPart: Record<string, number> = {};
  for (const pid of Object.keys(deliveredByPart)) {
    poolByPart[pid] = Math.max(
      0,
      deliveredByPart[pid] - (returnedByPartId[pid] || 0),
    );
  }
  const out: Record<string, number> = {};
  for (const it of items) {
    const lineMax = Number(it.deliveredQty) || 0;
    const pool = poolByPart[it.partId] ?? 0;
    const cap = Math.min(lineMax, pool);
    const q = effectiveReturnQtyFromDraft(draft[it.id], cap);
    out[it.id] = q;
    poolByPart[it.partId] = pool - q;
  }
  return out;
}

/** Max return qty allowed on this line given draft on earlier lines (same invoice order). */
function lineReturnableCapForDraft(
  item: InvoiceItem,
  items: InvoiceItem[],
  draft: Record<string, string>,
  returnedByPartId: Record<string, number>,
): number {
  const deliveredByPart: Record<string, number> = {};
  for (const it of items) {
    deliveredByPart[it.partId] =
      (deliveredByPart[it.partId] || 0) + Number(it.deliveredQty || 0);
  }
  const poolByPart: Record<string, number> = {};
  for (const pid of Object.keys(deliveredByPart)) {
    poolByPart[pid] = Math.max(
      0,
      deliveredByPart[pid] - (returnedByPartId[pid] || 0),
    );
  }
  const lineMax = Number(item.deliveredQty) || 0;
  for (const it of items) {
    const pool = poolByPart[it.partId] ?? 0;
    if (it.id === item.id) {
      return Math.min(lineMax, Math.max(0, pool));
    }
    const cap = Math.min(Number(it.deliveredQty) || 0, pool);
    const q = effectiveReturnQtyFromDraft(draft[it.id], cap);
    poolByPart[it.partId] = pool - q;
  }
  return 0;
}

/** Parse draft strings to numeric qty per line (clamped to delivered minus already returned). */
function parseSaleReturnDraftToQuantities(
  items: InvoiceItem[],
  draft: Record<string, string>,
  returnedByPartId: Record<string, number>,
): Record<string, number> {
  return computeSaleReturnQtyByItemId(items, draft, returnedByPartId);
}

function invoiceHasTaxForList(inv: Invoice): boolean {
  const pct = inv.taxPercentage != null ? Number(inv.taxPercentage) : 0;
  const taxAmt = Number(inv.tax) || 0;
  return pct > 0 || taxAmt > 0;
}

function invoiceHasOverallDiscountForList(inv: Invoice): boolean {
  return Number(inv.overallDiscount) > 0;
}

/** No GST and no invoice-level discount */
function invoiceIsSimpleForList(inv: Invoice): boolean {
  return !invoiceHasTaxForList(inv) && !invoiceHasOverallDiscountForList(inv);
}

function parseSaleReturnDeductionDraft(val: string | undefined): number {
  const t = String(val ?? "")
    .trim()
    .replace(/,/g, "");
  if (t === "") return 0;
  const n = parseFloat(t);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

// Interface for inline item row
interface RecentSaleInvoiceLine {
  invoiceNo: string;
  invoiceDate?: string;
  customerName: string;
  qty: number | null;
  unitPrice: number | null;
}

interface InlineItemRow {
  id: string;
  selectedPartId: string;
  qty: number;
  priceA?: number; // Editable Price A
  priceB?: number; // Editable Price B
  priceM?: number; // Editable Price M
  unitPrice?: number; // Actual price used for this line (can be custom)
  selectedPriceType?: "A" | "B" | "M"; // Track which price is selected
  selectedRackId?: string;
  selectedLocationId?: string; // PartRackShelf ID
  selectedLocationIds?: string[]; // Multiple PartRackShelf IDs
  useUnlocatedStock?: boolean;
  partNoFallback?: string;
  descriptionFallback?: string;
}

export const SalesInvoice = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterInvoiceKind, setFilterInvoiceKind] = useState<string>("all");
  const [filterCustomerType, setFilterCustomerType] = useState<string>("all");
  const [filterPartId, setFilterPartId] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [filterBrands, setFilterBrands] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const salesInvoicesQueryParams = useMemo(
    () => ({
      status: filterStatus !== "all" ? filterStatus : undefined,
      customerType:
        filterCustomerType !== "all" ? filterCustomerType : undefined,
      search: searchTerm.trim() || undefined,
      partId: filterPartId.trim() || undefined,
      brandId: filterBrandId.trim() || undefined,
    }),
    [
      filterStatus,
      filterCustomerType,
      searchTerm,
      filterPartId,
      filterBrandId,
    ],
  );
  const [approvingInvoice, setApprovingInvoice] = useState<string | null>(null);

  // New / Edit Invoice State
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [newInvoice, setNewInvoice] = useState<Partial<Invoice>>({
    customerType: "registered", // Default to Party Sale
    items: [],
    overallDiscount: 0,
    overallDiscountType: "percent",
  });

  // Customers data from API
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>("");
  const [customerPriceType, setCustomerPriceType] = useState<
    "A" | "B" | "M" | null
  >(null);
  const [selectedCustomerCategory, setSelectedCustomerCategory] = useState<
    string | null
  >(null);

  // Add Customer Dialog State
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);

  // Edit Credit Limit State
  const [showEditCreditLimitDialog, setShowEditCreditLimitDialog] =
    useState(false);
  const [editingCreditLimit, setEditingCreditLimit] = useState<number>(0);
  const [updatingCreditLimit, setUpdatingCreditLimit] = useState(false);
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);
  const [showLastSaleInfo, setShowLastSaleInfo] = useState(true);
  const [recentSalesByPartId, setRecentSalesByPartId] = useState<
    Record<string, RecentSaleInvoiceLine[]>
  >({});
  const [loadingRecentSalesByPartId, setLoadingRecentSalesByPartId] = useState<
    Record<string, boolean>
  >({});

  // Inline items state - matching reference design
  const [inlineItems, setInlineItems] = useState<InlineItemRow[]>([]);

  // Map to store full part objects for all selected parts (persists across searches)
  const [selectedPartsMap, setSelectedPartsMap] = useState<
    Record<string, PartItem>
  >({});

  // Parts data from API
  const [parts, setParts] = useState<PartItem[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsSearchTerm, setPartsSearchTerm] = useState<
    Record<string, string>
  >({});
  const [partsModelFilter, setPartsModelFilter] = useState<string>("");
  const [partsDescriptionFilter, setPartsDescriptionFilter] = useState<string>(
    "",
  );
  const [partsApplicationFilter, setPartsApplicationFilter] = useState<string>(
    "",
  );
  const [showPartsDropdown, setShowPartsDropdown] = useState<
    Record<string, boolean>
  >({});
  const [dropdownPosition, setDropdownPosition] = useState<
    Record<string, { top: number; left: number; width: number }>
  >({});
  const inputRefs = useRef<Record<string, HTMLInputElement>>({});
  const dropdownRefs = useRef<Record<string, HTMLDivElement>>({});
  const isClickingDropdown = useRef<Record<string, boolean>>({});
  const hasFetchedInitialPartsRef = useRef(false);

  // Stock balances for parts (accurate real-time stock)
  const [partStockBalances, setPartStockBalances] = useState<
    Record<
      string,
      {
        current_stock: number;
        available_stock: number;
        reserved_stock: number;
        avg_cost: number;
      }
    >
  >({});
  const [loadingStock, setLoadingStock] = useState<Record<string, boolean>>({});

  // Loading state for per-part machine models (fetched on demand).
  const [loadingModels, setLoadingModels] = useState<
    Record<string, boolean>
  >({});

  // Accurate locations for parts (fetched on demand or refreshed)
  const [partLocations, setPartLocations] = useState<Record<string, any[]>>({});
  const [loadingLocations, setLoadingLocations] = useState<
    Record<string, boolean>
  >({});

  const fetchPartLocations = useCallback(async (partId: string) => {
    if (!partId) return;
    setLoadingLocations((prev) => ({ ...prev, [partId]: true }));
    try {
      const response = await apiClient.getPartLocations(partId);
      // Backend returns data: [...] or it might be the array itself
      const locData =
        (response as any).data || (Array.isArray(response) ? response : []);

      // Normalize to match parts list format (rackCode, shelfNo, storeName)
      const normalized = locData.map((loc: any) => ({
        id: loc.id || `${loc.rackId}-${loc.shelfId}`,
        storeId: loc.storeId,
        storeName: loc.store || loc.storeName || "No Store",
        rackId: loc.rackId,
        rackCode: loc.rack || loc.rackCode || "No Rack",
        shelfId: loc.shelfId,
        shelfNo: loc.shelf || loc.shelfNo || "No Shelf",
        quantity: loc.quantity,
      }));

      setPartLocations((prev) => ({
        ...prev,
        [partId]: normalized,
      }));
    } catch (error) {
      console.error("Failed to fetch part locations:", error);
    } finally {
      setLoadingLocations((prev) => ({ ...prev, [partId]: false }));
    }
  }, []);

  // Accounts for payment - Separate Bank and Cash
  const [bankAccounts, setBankAccounts] = useState<
    { id: string; name: string; type: string; code?: string }[]
  >([]);
  const [cashAccounts, setCashAccounts] = useState<
    { id: string; name: string; type: string; code?: string }[]
  >([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [selectedCashAccount, setSelectedCashAccount] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState(0); // Keep for backward compatibility
  const [bankAmount, setBankAmount] = useState(0); // NEW: Separate bank amount
  const [cashAmount, setCashAmount] = useState(0); // NEW: Separate cash amount

  // Payment fields
  const [discount, setDiscount] = useState(0);
  const [taxType, setTaxType] = useState("Without GST");
  const [gstPercentage, setGstPercentage] = useState(0);
  const [customGstPercentage, setCustomGstPercentage] = useState("");
  const [useCustomGst, setUseCustomGst] = useState(false);
  const [deliveredTo, setDeliveredTo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [term, setTerm] = useState("");

  // Delivery Log
  const [showDeliveryLog, setShowDeliveryLog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Payment Recording State
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    accountId: "",
    paymentDate: new Date().toISOString().split("T")[0],
  });

  // Auto-set GST percentage based on customer category
  useEffect(() => {
    // Only auto-set if we are creating a NEW invoice, or if we haven't manually changed it yet
    // To keep it simple: auto-set when taxType or customer changes if not explicitly in custom mode
    if (!editingInvoiceId && taxType === "With GST" && !useCustomGst) {
      if (selectedCustomerCategory === "Reseller") {
        setGstPercentage(22);
      } else if (selectedCustomerCategory === "EndUser") {
        setGstPercentage(18);
      }
    }
  }, [taxType, selectedCustomerCategory, editingInvoiceId, useCustomGst]);

  // View Invoice
  const [showViewInvoice, setShowViewInvoice] = useState(false);
  const invoicePrintColumns = [
    { id: "sr", label: "Sr#" },
    { id: "partNo", label: "Part No." },
    { id: "altPartNo", label: "Alt. Part No." },
    { id: "description", label: "Description" },
    { id: "brand", label: "Brand" },
    { id: "uom", label: "UOM" },
    { id: "qty", label: "Qty" },
    { id: "price", label: "Price" },
    { id: "amount", label: "Amount" },
  ] as const;
  const [selectedInvoicePrintColumns, setSelectedInvoicePrintColumns] =
    useState<string[]>(invoicePrintColumns.map((c) => c.id));
  const [showInvoicePrintColumnsDialog, setShowInvoicePrintColumnsDialog] =
    useState(false);
  const [invoiceForPrint, setInvoiceForPrint] = useState<Invoice | null>(null);

  // Hold Dialog
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [invoiceToHold, setInvoiceToHold] = useState<Invoice | null>(null);
  const [holdLocationQtys, setHoldLocationQtys] = useState<
    Record<string, Record<string, number>>
  >({}); // itemId -> locationKey (rack-shelf) -> quantity

  // Cancel Confirmation
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);

  // Delete (permanent) Confirmation – for cancelled invoices
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  // Soft Delete Confirmation – for active invoices
  const [showSoftDeleteConfirm, setShowSoftDeleteConfirm] = useState(false);
  const [invoiceToSoftDelete, setInvoiceToSoftDelete] =
    useState<Invoice | null>(null);

  // Partial Delivery Dialog
  const [showPartialDeliveryDialog, setShowPartialDeliveryDialog] =
    useState(false);
  const [partialDeliveryQtys, setPartialDeliveryQtys] = useState<
    Record<string, number>
  >({});

  // Reverse Quantity Dialog - Multiple items
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [itemsToReverse, setItemsToReverse] = useState<InvoiceItem[]>([]);
  const [reverseQuantities, setReverseQuantities] = useState<
    Record<string, number>
  >({});
  const [reversing, setReversing] = useState(false);

  const [showSaleReturnDialog, setShowSaleReturnDialog] = useState(false);
  const [saleReturnInvoice, setSaleReturnInvoice] = useState<Invoice | null>(null);
  const [saleReturnReturnedByPartId, setSaleReturnReturnedByPartId] = useState<
    Record<string, number>
  >({});
  /** Digit-only strings while typing; clamp to delivered qty on blur and when parsing for submit. */
  const [saleReturnQtyDraft, setSaleReturnQtyDraft] = useState<
    Record<string, string>
  >({});
  const [saleReturnReason, setSaleReturnReason] = useState("");
  const [saleReturnDate, setSaleReturnDate] = useState(() =>
    new Date().toISOString().split("T")[0],
  );
  const [saleReturnDeductionDraft, setSaleReturnDeductionDraft] = useState("");
  const [saleReturnDeductionTouched, setSaleReturnDeductionTouched] =
    useState(false);
  const [saleReturnPaymentAccountId, setSaleReturnPaymentAccountId] =
    useState("");
  const [saleReturnRefundPaidDraft, setSaleReturnRefundPaidDraft] =
    useState("");
  const [saleReturnRefundPaidTouched, setSaleReturnRefundPaidTouched] =
    useState(false);
  const [loadingSaleReturn, setLoadingSaleReturn] = useState(false);
  const [submittingSaleReturn, setSubmittingSaleReturn] = useState(false);
  const [invoiceListRefreshTick, setInvoiceListRefreshTick] = useState(0);

  /** Return form: subtotal at line unit prices, GST at invoice rate, total incl. tax */
  const saleReturnMoney = useMemo(() => {
    if (!saleReturnInvoice) {
      return {
        subtotalExclTax: 0,
        gstPct: 0,
        taxAmount: 0,
        totalInclTax: 0,
        isTaxInvoice: false,
      };
    }
    const qtyById = computeSaleReturnQtyByItemId(
      saleReturnInvoice.items,
      saleReturnQtyDraft,
      saleReturnReturnedByPartId,
    );
    const subtotalExclTax = saleReturnInvoice.items.reduce(
      (sum, it) => sum + (qtyById[it.id] || 0) * it.unitPrice,
      0,
    );
    const gstPct = Number(saleReturnInvoice.taxPercentage) || 0;
    const isTaxInvoice = gstPct > 0;
    const rawTax = isTaxInvoice ? (subtotalExclTax * gstPct) / 100 : 0;
    const taxAmount = Math.round(rawTax * 100) / 100;
    const totalInclTax = Math.round((subtotalExclTax + taxAmount) * 100) / 100;
    return {
      subtotalExclTax,
      gstPct,
      taxAmount,
      totalInclTax,
      isTaxInvoice,
    };
  }, [
    saleReturnInvoice,
    saleReturnQtyDraft,
    saleReturnReturnedByPartId,
  ]);

  const saleReturnNet = useMemo(() => {
    if (!saleReturnInvoice) {
      return {
        baseBeforeDeduction: 0,
        deduction: 0,
        net: 0,
        showDeductionRow: false,
        maxDeduction: 0,
      };
    }
    const hasDisc = Number(saleReturnInvoice.overallDiscount) > 0;
    const baseBeforeDeduction = saleReturnMoney.isTaxInvoice
      ? saleReturnMoney.totalInclTax
      : saleReturnMoney.subtotalExclTax;
    const maxDeduction = Math.max(
      0,
      Math.round(baseBeforeDeduction * 100) / 100,
    );
    let deduction = parseSaleReturnDeductionDraft(saleReturnDeductionDraft);
    if (deduction > maxDeduction) deduction = maxDeduction;
    const net = Math.max(
      0,
      Math.round((maxDeduction - deduction) * 100) / 100,
    );
    return {
      baseBeforeDeduction,
      deduction,
      net,
      showDeductionRow: hasDisc,
      maxDeduction,
    };
  }, [saleReturnInvoice, saleReturnMoney, saleReturnDeductionDraft]);

  useEffect(() => {
    if (!showSaleReturnDialog || !saleReturnInvoice) return;
    const invDisc = Number(saleReturnInvoice.overallDiscount) || 0;
    if (invDisc <= 0) {
      setSaleReturnDeductionDraft("");
      return;
    }
    if (saleReturnDeductionTouched) return;

    const invSub = Number(saleReturnInvoice.subtotal) || 0;
    const retSub = saleReturnMoney.subtotalExclTax;
    const suggested =
      invSub > 0
        ? Math.round(((invDisc * retSub) / invSub) * 100) / 100
        : 0;
    const cap = saleReturnMoney.isTaxInvoice
      ? saleReturnMoney.totalInclTax
      : saleReturnMoney.subtotalExclTax;
    const clamped = Math.min(
      Math.max(0, suggested),
      Math.max(0, Math.round(cap * 100) / 100),
    );
    setSaleReturnDeductionDraft(clamped > 0 ? String(clamped) : "");
  }, [
    showSaleReturnDialog,
    saleReturnInvoice,
    saleReturnMoney.subtotalExclTax,
    saleReturnMoney.totalInclTax,
    saleReturnMoney.isTaxInvoice,
    saleReturnDeductionTouched,
  ]);

  useEffect(() => {
    if (!showSaleReturnDialog || !saleReturnInvoice) return;
    const net = saleReturnNet.net;
    const draft =
      net > 0 ? String(Math.round(net * 100) / 100) : "";
    if (saleReturnInvoice.customerType === "walking") {
      setSaleReturnRefundPaidDraft(draft);
      return;
    }
    // Registered / party sale: never auto-fill "Amount to pay"; user enters it (optional).
    if (!saleReturnRefundPaidTouched && net <= 0) {
      setSaleReturnRefundPaidDraft("");
    }
  }, [
    showSaleReturnDialog,
    saleReturnInvoice,
    saleReturnNet.net,
    saleReturnRefundPaidTouched,
  ]);

  // Filter invoices: search + demo filter client-side; status/customer/part/brand via API.
  // Invoice kind (simple / with tax / with discount) is client-side on loaded rows.
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        if (inv.customerName.toLowerCase().includes("demo")) {
          return false;
        }

        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          if (
            !inv.invoiceNo.toLowerCase().includes(q) &&
            !inv.customerName.toLowerCase().includes(q)
          ) {
            return false;
          }
        }

        if (filterInvoiceKind === "simple" && !invoiceIsSimpleForList(inv)) {
          return false;
        }
        if (filterInvoiceKind === "with_tax" && !invoiceHasTaxForList(inv)) {
          return false;
        }
        if (
          filterInvoiceKind === "with_discount" &&
          !invoiceHasOverallDiscountForList(inv)
        ) {
          return false;
        }

        return true;
      })
      .slice()
      .sort((a, b) =>
        b.invoiceNo.localeCompare(a.invoiceNo, undefined, { numeric: true }),
      );
  }, [invoices, searchTerm, filterInvoiceKind]);

  // Calculate totals
  const totalInvoices = invoices.length;
  const totalReceived = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalReceivable = invoices.reduce(
    (sum, inv) => sum + (inv.grandTotal - inv.paidAmount),
    0,
  );
  const onHoldCount = invoices.filter((inv) => inv.status === "on_hold").length;
  const pendingDelivery = invoices.filter(
    (inv) => inv.status === "approved" || inv.status === "partially_delivered",
  ).length;

  // Add new inline item row
  const handleAddNewItem = useCallback((openDropdown = false) => {
    const newItem: InlineItemRow = {
      id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      selectedPartId: "",
      qty: 0,
      priceA: undefined,
      priceB: undefined,
      priceM: undefined,
       unitPrice: undefined,
      selectedPriceType: undefined,
    };
    // Add new item at the top (first position), existing items move down
    setInlineItems([newItem, ...inlineItems]);
    if (openDropdown) {
      setShowPartsDropdown((prev) => ({ ...prev, [newItem.id]: true }));
      setPartsSearchTerm((prev) => ({ ...prev, [newItem.id]: "" }));
      setTimeout(() => {
        inputRefs.current[newItem.id]?.focus();
      }, 50);
    }
  }, [inlineItems]);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (!showNewInvoice) return;
      if (e.altKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        handleAddNewItem(true);
      }
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [showNewInvoice, handleAddNewItem]);

  // Keep item detail helpers visible by default whenever invoice form opens.
  useEffect(() => {
    if (showNewInvoice) {
      setShowLastSaleInfo(true);
    }
  }, [showNewInvoice]);

  // Helper to derive unit price from selected price type + part data
  const getDerivedUnitPrice = (item: InlineItemRow, part: PartItem | null) => {
    if (!part) return 0;
    if (item.selectedPriceType === "A") {
      return item.priceA ?? part.priceA ?? 0;
    }
    if (item.selectedPriceType === "B") {
      return item.priceB ?? part.priceB ?? 0;
    }
    if (item.selectedPriceType === "M") {
      return item.priceM ?? part.priceM ?? 0;
    }
    return 0;
  };

  // Update inline item
  const handleUpdateInlineItem = (
    id: string,
    field: keyof InlineItemRow,
    value: any,
  ) => {
    setInlineItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          let updated: InlineItemRow = { ...item, [field]: value };

          // If part changed, set prices from part data and fetch stock balance
          if (field === "selectedPartId" && value) {
            const part = parts.find((p) => p.id === value);
            if (part) {
              // Store full part details to persist across search filters
              setSelectedPartsMap((prev) => ({
                ...prev,
                [part.id]: part,
              }));

              // Set editable prices from part data
              updated.priceA = part.priceA || 0;
              updated.priceB = part.priceB || 0;
              updated.priceM = part.priceM || 0;

              // Store fallbacks for durable display
              updated.partNoFallback = part.partNo;
              updated.descriptionFallback = part.description;

              // Auto-select price type: customer's assigned type takes priority
              if (customerPriceType === "A" && part.priceA) {
                updated.selectedPriceType = "A";
              } else if (customerPriceType === "B" && part.priceB) {
                updated.selectedPriceType = "B";
              } else if (customerPriceType === "M" && part.priceM) {
                updated.selectedPriceType = "M";
              } else if (customerPriceType) {
                // Customer has a price type assigned but part might not have that price
                // Still respect customer preference
                updated.selectedPriceType = customerPriceType;
              } else if (part.priceA) {
                // No customer price type: fall back to part's available prices
                updated.selectedPriceType = "A";
              } else if (part.priceB) {
                updated.selectedPriceType = "B";
              } else if (part.priceM) {
                updated.selectedPriceType = "M";
              }
              // Set unit price based on selected price type
              updated.unitPrice = getDerivedUnitPrice(updated, part);

              // Rack/shelf is selected at stock-out (Store), not on the invoice
              updated.selectedLocationIds = [];
              updated.selectedLocationId = "";
              updated.selectedRackId = "";
              updated.useUnlocatedStock = false;

              fetchPartStockBalance(value);
              fetchPartModels(value);
            }
          }

          // If price type was changed explicitly, update unit price to match that selection
          if (field === "selectedPriceType") {
            const part = getPartForItem(updated.selectedPartId);
            updated.unitPrice = getDerivedUnitPrice(updated, part);
          }
          return updated;
        }
        return item;
      }),
    );
  };

  // Fetch accurate stock balance for a part
  const fetchPartStockBalance = useCallback(async (partId: string, force = false) => {
    if (partStockBalances[partId] && !force) {
      return;
    }

    setLoadingStock((prev) => ({ ...prev, [partId]: true }));
    try {
      const response = (await apiClient.getPartCostLookup(partId)) as any;
      if (response.error) {
        return;
      }

      const stockData = response.data || response;
      setPartStockBalances((prev) => ({
        ...prev,
        [partId]: {
          current_stock: stockData.current_stock || 0,
          available_stock:
            stockData.available_stock || stockData.current_stock || 0,
          reserved_stock: stockData.reserved_stock || 0,
          avg_cost: stockData.avg_cost || stockData.cost || 0,
        },
      }));
    } catch (error) {
      console.error("Failed to fetch part stock balance:", error);
    } finally {
      setLoadingStock((prev) => ({ ...prev, [partId]: false }));
    }
  }, [partStockBalances]);

  // Fetch machine models for a selected part.
  // Your `/parts` list endpoint doesn't include `models`, but `/parts/:id` does.
  const fetchPartModels = useCallback(
    async (partId: string, force = false) => {
      if (!partId) return;

      const existingInParts = parts.find((p) => p.id === partId);
      const existingInMap = selectedPartsMap[partId];
      const existingModels =
        existingInMap?.machineModels ?? existingInParts?.machineModels;

      if (!force && existingModels && existingModels.length > 0) {
        return;
      }

      setLoadingModels((prev) => ({ ...prev, [partId]: true }));
      try {
        const response = (await apiClient.getPart(partId)) as any;
        const raw = response?.data ?? response;
        const rawModels = Array.isArray(raw?.models) ? raw.models : [];

        const machineModels = rawModels
          .map((m: any) => {
            const required = Number(
              m.qty_used ?? m.qtyUsed ?? m.requiredQty ?? 0,
            );
            return {
              id: String(m.id ?? `${partId}-${m.name}`),
              name: String(m.name ?? ""),
              requiredQty:
                Number.isFinite(required) && required > 0 ? required : undefined,
            };
          })
          .filter((mm: any) => mm.name);

        setParts((prev) =>
          prev.map((p) => (p.id === partId ? { ...p, machineModels } : p)),
        );
        setSelectedPartsMap((prev) => ({
          ...prev,
          [partId]: {
            ...(prev[partId] || (existingInMap as any) || (existingInParts as any)),
            machineModels,
          },
        }));
      } catch (error) {
        console.error("Failed to fetch part models:", error);
      } finally {
        setLoadingModels((prev) => ({ ...prev, [partId]: false }));
      }
    },
    [parts, selectedPartsMap, setParts, setSelectedPartsMap],
  );

  // Remove inline item
  const handleRemoveInlineItem = (id: string) => {
    setInlineItems((prev) => prev.filter((item) => item.id !== id));
    setPartsSearchTerm((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Debounce timer for parts search
  const partsSearchDebounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Fetch parts from API - Load initial set on dropdown open, searchable with client-side filtering
  const fetchParts = async (
    searchTerm: string = "",
    forceRefresh: boolean = false,
    silent: boolean = false,
  ) => {
    // If parts already loaded and no search term, don't refetch (use client-side filtering)
    if (
      !forceRefresh &&
      hasFetchedInitialPartsRef.current &&
      (!searchTerm || searchTerm.trim().length === 0)
    ) {
      return;
    }

    if (!searchTerm || searchTerm.trim().length === 0) {
      hasFetchedInitialPartsRef.current = true;
    }

    if (!silent) setPartsLoading(true);
    try {
      const params: any = {
        limit: "all", // Load all active parts as requested
        page: 1,
        status: "active",
      };

      // Use search parameter if provided (for server-side search when needed)
      if (searchTerm && searchTerm.trim().length > 0) {
        params.search = searchTerm.trim();
        params.limit = "all"; // Load all matching parts
      }

      const response = await apiClient.getParts(params);

      if (response.data && Array.isArray(response.data)) {
        const transformedParts: PartItem[] = response.data
          .map((p: any) => {
            // IMPORTANT: Database fields are SWAPPED/LABELED INCORRECTLY:
            // - master_part_no in DB = actual Part No (Blue Block - what we want to show)
            // - part_no in DB = actual Master Part No (Red Block - what we DON'T want to show)
            const partNo = String(p.master_part_no || "").trim(); // Part No (Blue Block)
            const masterPartNo = String(p.part_no || "").trim(); // Master Part No (Red Block)

            // Only include parts that have a Part No (Blue Block)
            if (
              !partNo ||
              partNo === "" ||
              partNo === "null" ||
              partNo === "undefined"
            ) {
              return null;
            }

            return {
              id: p.id,
              partNo: partNo, // Part No (Blue Block) - displayed in dropdown
              masterPartNo: masterPartNo, // Master Part No (Red Block) - stored but not displayed
              description: p.description || "",
              application:
                p.application_name ||
                p.application?.name ||
                p.application ||
                "",
              category: p.category_name || "",
              price: p.price_a ?? p.cost ?? 0,
              priceA: p.price_a ?? null,
              priceB: p.price_b ?? null,
              priceM: p.price_m ?? null,
              stockQty: p.stock || 0,
              reservedQty: p.reserved_stock || 0,
              availableQty: (p.stock || 0) - (p.reserved_stock || 0),
              lastSaleQty: p.lastSaleQty || 0,
              lastSalePrice: p.lastSalePrice || 0,
              lastSaleCustomerName: p.lastSaleCustomerName || "",
              grade: p.grade || "A",
              brands: p.brand_name
                ? [{ id: p.brand_id || "", name: p.brand_name }]
                : [],
              locations: p.locations || [],
              machineModels: Array.isArray(p.models)
                ? p.models
                    .map((m: any) => {
                      const required =
                        Number(m.qty_used ?? m.qtyUsed ?? m.requiredQty ?? 0);
                      return {
                        id: String(m.id ?? `${p.id}-${m.name}`),
                        name: String(m.name ?? ""),
                        requiredQty: Number.isFinite(required) && required > 0 ? required : undefined,
                      };
                    })
                    .filter((mm: any) => mm.name)
                : [],
              unlocatedStock: p.unlocated_stock || 0,
            };
          })
          .filter((p: PartItem | null): p is PartItem => p !== null);

        setParts(transformedParts);
      }
    } catch (error) {
      setParts([]);
    } finally {
      if (!silent) setPartsLoading(false);
    }
  };

  const getFilteredPartsForInlineRow = useCallback(
    (
      rowId: string,
      options?: {
        ignoreModel?: boolean;
        ignoreDescription?: boolean;
        ignoreApplication?: boolean;
      },
    ) => {
      const searchValue = (partsSearchTerm[rowId] || "").trim().toLowerCase();
      const selectedModel = partsModelFilter.trim().toLowerCase();
      const selectedDescription = partsDescriptionFilter
        .trim()
        .toLowerCase();
      const selectedApplication = partsApplicationFilter
        .trim()
        .toLowerCase();

      return parts.filter((part) => {
        const partNo = String(part.partNo || "").toLowerCase();
        const masterPartNo = String(part.masterPartNo || "").toLowerCase();
        const description = String(part.description || "").toLowerCase();
        const category = String(part.category || "").toLowerCase();
        const application = String(part.application || "").toLowerCase();
        const modelNames = (part.machineModels || []).map((m) =>
          String(m.name || "").toLowerCase(),
        );
        const brandNames = (part.brands || []).map((b) =>
          String(b.name || "").toLowerCase(),
        );

        const matchesSearch =
          !searchValue ||
          partNo.includes(searchValue) ||
          masterPartNo.includes(searchValue) ||
          description.includes(searchValue) ||
          category.includes(searchValue) ||
          application.includes(searchValue) ||
          modelNames.some((name) => name.includes(searchValue)) ||
          brandNames.some((name) => name.includes(searchValue));

        if (!matchesSearch) return false;

        const matchesModel =
          options?.ignoreModel ||
          !selectedModel ||
          modelNames.some((name) => name === selectedModel);
        if (!matchesModel) return false;

        const matchesDescription =
          options?.ignoreDescription ||
          !selectedDescription ||
          description === selectedDescription;
        if (!matchesDescription) return false;

        const matchesApplication =
          options?.ignoreApplication ||
          !selectedApplication ||
          application === selectedApplication;
        if (!matchesApplication) return false;

        return true;
      });
    },
    [
      parts,
      partsSearchTerm,
      partsModelFilter,
      partsDescriptionFilter,
      partsApplicationFilter,
    ],
  );

  const addItemModelOptions = useMemo(() => {
    const selectedDescription = partsDescriptionFilter.trim().toLowerCase();
    const selectedApplication = partsApplicationFilter.trim().toLowerCase();
    return Array.from(
      new Set(
        parts
          .filter((part) => {
            const description = String(part.description || "").toLowerCase();
            const application = String(part.application || "").toLowerCase();
            return (
              (!selectedDescription || description === selectedDescription) &&
              (!selectedApplication || application === selectedApplication)
            );
          })
          .flatMap((part) =>
            (part.machineModels || [])
              .map((model) => String(model.name || "").trim())
              .filter(Boolean),
          ),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [parts, partsDescriptionFilter, partsApplicationFilter]);

  const addItemDescriptionOptions = useMemo(() => {
    const selectedModel = partsModelFilter.trim().toLowerCase();
    const selectedApplication = partsApplicationFilter.trim().toLowerCase();
    return Array.from(
      new Set(
        parts
          .filter((part) => {
            const application = String(part.application || "").toLowerCase();
            const modelNames = (part.machineModels || []).map((m) =>
              String(m.name || "").toLowerCase(),
            );
            return (
              (!selectedModel ||
                modelNames.some((name) => name === selectedModel)) &&
              (!selectedApplication || application === selectedApplication)
            );
          })
          .map((part) => String(part.description || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [parts, partsModelFilter, partsApplicationFilter]);

  const addItemApplicationOptions = useMemo(() => {
    const selectedModel = partsModelFilter.trim().toLowerCase();
    const selectedDescription = partsDescriptionFilter.trim().toLowerCase();
    return Array.from(
      new Set(
        parts
          .filter((part) => {
            const description = String(part.description || "").toLowerCase();
            const modelNames = (part.machineModels || []).map((m) =>
              String(m.name || "").toLowerCase(),
            );
            return (
              (!selectedModel ||
                modelNames.some((name) => name === selectedModel)) &&
              (!selectedDescription || description === selectedDescription)
            );
          })
          .map((part) => String(part.application || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [parts, partsModelFilter, partsDescriptionFilter]);

  const searchableModelFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "__all__", label: "All Models" },
      ...addItemModelOptions.map((name) => ({ value: name, label: name })),
    ],
    [addItemModelOptions],
  );

  const searchableDescriptionFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "__all__", label: "All Descriptions" },
      ...addItemDescriptionOptions.map((name) => ({ value: name, label: name })),
    ],
    [addItemDescriptionOptions],
  );

  const searchableApplicationFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "__all__", label: "All Applications" },
      ...addItemApplicationOptions.map((name) => ({ value: name, label: name })),
    ],
    [addItemApplicationOptions],
  );

  // Background stock polling (every 60 seconds)
  useEffect(() => {
    // Only start polling if we have initial data and we are not currently searching
    const hasSearchTerm = Object.values(partsSearchTerm).some(
      (s) => s.length > 0,
    );

    if (hasFetchedInitialPartsRef.current && !hasSearchTerm) {
      const interval = setInterval(() => {
        // Quietly background refresh parts data to capture external stock changes
        fetchParts("", true, true);

        // Also refresh individual stock balances for visible items if any
        if (inlineItems.length > 0) {
          inlineItems.forEach((item) => {
            if (item.selectedPartId) {
              fetchPartStockBalance(item.selectedPartId, true);
              fetchPartLocations(item.selectedPartId);
            }
          });
        }
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [partsSearchTerm, inlineItems, fetchPartStockBalance, fetchPartLocations]); // Dependencies to ensure we don't poll while user is active or context changes inappropriately

  // Force refresh parts list and clear stock balance cache
  const refreshPartsData = async () => {
    hasFetchedInitialPartsRef.current = false;
    setPartStockBalances({});
    setPartLocations({}); // IMPORTANT: Clear location cache too
    await fetchParts("", true); // forceRefresh=true
  };

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const debounceTimers = partsSearchDebounceRef.current;
    return () => {
      Object.values(debounceTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const lastSalePartIdsFingerprint = inlineItems
    .map((inline) => inline.selectedPartId)
    .filter(Boolean)
    .sort()
    .join("|");

  useEffect(() => {
    if (!showNewInvoice || !showLastSaleInfo) {
      return;
    }

    const partIds = lastSalePartIdsFingerprint
      ? Array.from(
          new Set(lastSalePartIdsFingerprint.split("|").filter(Boolean)),
        )
      : [];

    setRecentSalesByPartId((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!partIds.includes(k)) {
          delete next[k];
        }
      }
      return next;
    });

    if (partIds.length === 0) {
      return;
    }

    let cancelled = false;

    partIds.forEach((partId) => {
      setLoadingRecentSalesByPartId((p) => ({ ...p, [partId]: true }));
    });

    void (async () => {
      await Promise.all(
        partIds.map(async (partId) => {
          try {
            const response = await apiClient.getSalesInvoicesByPart(partId, {
              page: 1,
              limit: 8,
            });
            if (cancelled) {
              return;
            }
            if ((response as { error?: string }).error) {
              setRecentSalesByPartId((p) => ({ ...p, [partId]: [] }));
              return;
            }
            const invoiceData = Array.isArray(response)
              ? response
              : ((response as { data?: unknown[] }).data || []);
            const filtered = (invoiceData as { id: string }[]).filter(
              (inv) => inv.id !== editingInvoiceId,
            );
            const top3: RecentSaleInvoiceLine[] = filtered
              .slice(0, 3)
              .map((inv: Record<string, unknown>) => {
                const item = inv.item as
                  | {
                    ordered_qty?: number;
                    unit_price?: number;
                  }
                  | null
                  | undefined;
                return {
                  invoiceNo: String(inv.invoice_no ?? ""),
                  invoiceDate:
                    inv.invoice_date != null
                      ? String(inv.invoice_date)
                      : undefined,
                  customerName: String(inv.customer_name ?? ""),
                  qty:
                    item?.ordered_qty != null
                      ? Number(item.ordered_qty)
                      : null,
                  unitPrice:
                    item?.unit_price != null
                      ? Number(item.unit_price)
                      : null,
                };
              });
            setRecentSalesByPartId((p) => ({ ...p, [partId]: top3 }));
          } catch {
            if (!cancelled) {
              setRecentSalesByPartId((p) => ({ ...p, [partId]: [] }));
            }
          } finally {
            if (!cancelled) {
              setLoadingRecentSalesByPartId((p) => ({
                ...p,
                [partId]: false,
              }));
            }
          }
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showNewInvoice,
    showLastSaleInfo,
    lastSalePartIdsFingerprint,
    editingInvoiceId,
  ]);

  // Update dropdown position on scroll
  useEffect(() => {
    const updatePositions = () => {
      Object.keys(showPartsDropdown).forEach((itemId) => {
        if (showPartsDropdown[itemId] && inputRefs.current[itemId]) {
          const input = inputRefs.current[itemId];
          const rect = input.getBoundingClientRect();
          setDropdownPosition((prev) => ({
            ...prev,
            [itemId]: {
              top: rect.bottom + window.scrollY + 4,
              left: rect.left + window.scrollX,
              width: rect.width,
            },
          }));
        }
      });
    };

    if (Object.keys(showPartsDropdown).some((key) => showPartsDropdown[key])) {
      window.addEventListener("scroll", updatePositions, true);
      window.addEventListener("resize", updatePositions);
      return () => {
        window.removeEventListener("scroll", updatePositions, true);
        window.removeEventListener("resize", updatePositions);
      };
    }
  }, [showPartsDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(showPartsDropdown).forEach((itemId) => {
        if (showPartsDropdown[itemId] && inputRefs.current[itemId]) {
          const input = inputRefs.current[itemId];
          if (!input.contains(event.target as Node)) {
            setShowPartsDropdown((prev) => ({ ...prev, [itemId]: false }));
          }
        }
      });
    };

    if (Object.keys(showPartsDropdown).some((key) => showPartsDropdown[key])) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showPartsDropdown]);

  const brandFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "", label: "All brands" },
      ...filterBrands.map((b) => ({
        value: b.id,
        label: b.name,
      })),
    ],
    [filterBrands],
  );

  const itemFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "", label: "All items" },
      ...parts.map((p) => {
        const master = (p.masterPartNo || "").trim();
        const partNo = (p.partNo || "").trim();
        const label =
          master && partNo
            ? `Part no: ${partNo} · Master: ${master}`
            : partNo || master || p.id;
        const brandName = p.brands?.[0]?.name?.trim();
        const descParts = [brandName, p.description?.trim()].filter(Boolean);
        return {
          value: p.id,
          label,
          description: descParts.length ? descParts.join(" · ") : undefined,
        };
      }),
    ],
    [parts],
  );

  useEffect(() => {
    if (!showNewInvoice) {
      void fetchParts("", false);
    }
  }, [showNewInvoice]);

  useEffect(() => {
    if (showNewInvoice) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = (await apiClient.getAllBrands(undefined, "active")) as
          | { id: string; name: string }[]
          | { data?: { id: string; name: string }[] };
        const raw = Array.isArray(res) ? res : res?.data;
        const list = Array.isArray(raw)
          ? raw.map((b: any) => ({
              id: String(b.id),
              name: String(b.name || ""),
            }))
          : [];
        if (!cancelled) {
          setFilterBrands(list.filter((b) => b.id && b.name));
        }
      } catch {
        if (!cancelled) setFilterBrands([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showNewInvoice]);

  // Fetch invoices from backend
  useEffect(() => {
    const fetchInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const response = (await apiClient.getSalesInvoices(
          salesInvoicesQueryParams,
        )) as any;

        if (response.error) {
          toast({
            title: "Error",
            description: "Failed to load invoices",
            variant: "destructive",
          });
          return;
        }

        const invoicesData: any = Array.isArray(response)
          ? response
          : response.data || [];

        // Transform backend data to frontend format
        const transformedInvoices: Invoice[] = invoicesData
          .map((inv: any) => ({
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            invoiceDate: inv.invoiceDate,
            term: inv.term ?? null,
            customerType: inv.customerType as CustomerType,
            customerId: inv.customerId,
            customerName: inv.customerName,
            salesPerson: inv.salesPerson || "Admin",
            items:
              inv.SalesInvoiceItem?.map((item: any) => ({
                id: item.id,
                partId: item.partId,
                partNo: item.partNo,
                description: item.description || "",
                orderedQty: item.orderedQty,
                deliveredQty: item.deliveredQty,
                pendingQty: item.pendingQty,
                reversedQty: Math.max(
                  0,
                  (item.orderedQty || 0) -
                    (item.deliveredQty || 0) -
                    (item.pendingQty || 0),
                ),
                unitPrice: item.unitPrice,
                avgCost: item.avgCost || 0,
                discount: item.discount || 0,
                discountType: "percent" as const,
                lineTotal: item.lineTotal,
                grade: (item.grade || "A") as ItemGrade,
                brand: item.brand,
              })) || [],
            subtotal: inv.subtotal,
            overallDiscount: inv.overallDiscount || 0,
            overallDiscountType: "fixed" as const,
            tax: inv.tax || 0,
            taxPercentage:
              inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
            grandTotal: inv.grandTotal,
            paidAmount: inv.paidAmount || 0,
            status: inv.status as InvoiceStatus,
            paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
            accountId: inv.accountId,
            deliveryLog:
              inv.deliveryLogs?.map((log: any) => ({
                challanNo: log.challanNo,
                deliveryDate: log.deliveryDate,
                deliveredBy: log.deliveredBy || "",
                items:
                  log.items?.map((item: any) => ({
                    invoiceItemId: item.invoiceItemId,
                    quantity: item.quantity,
                  })) || [],
              })) || [],
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
          }))
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

        setInvoices(transformedInvoices);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch invoices",
          variant: "destructive",
        });
      } finally {
        setLoadingInvoices(false);
      }
    };

    fetchInvoices();
  }, [salesInvoicesQueryParams, invoiceListRefreshTick]);

  // Fetch customers from API
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        // Backend already filters out demo customers
        const response = (await apiClient.getCustomers({
          status: "active",
          limit: 1000, // Get all active customers
        })) as any;

        const customersData = Array.isArray(response)
          ? response
          : response.data || [];

        if (Array.isArray(customersData)) {
          // Transform to Customer format
          const formattedCustomers: Customer[] = customersData.map(
            (c: any) => ({
              id: c.id,
              name: c.name,
              type: c.type || "registered",
              address: c.address || "",
              area: c.area || null,
              balance: c.balance || 0,
              creditLimit: c.creditLimit || 0,
              creditDays: c.creditDays || 0,
              priceType: c.priceType || null,
              category: c.category || null,
            }),
          );

          // Double-check: exclude any demo customers (backend should already filter, but be safe)
          const filteredCustomers = formattedCustomers.filter(
            (c) => !c.name.toLowerCase().includes("demo"),
          );

          setCustomers(filteredCustomers);
        }
      } catch (error: any) {
        // Set empty array on error
        setCustomers([]);
      } finally {
        setLoadingCustomers(false);
      }
    };

    fetchCustomers();
  }, []);

  // Fetch accounts from Accounting API - Separate Bank and Cash accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoadingAccounts(true);

        // Fetch accounts from Accounting API using apiClient
        // Note: Backend expects "Active" with capital A
        const response = (await apiClient.getAccounts({
          status: "Active",
        })) as any;

        // apiClient returns { data: [...] } or the data directly
        const accountsData = Array.isArray(response)
          ? response
          : response.data || [];

        if (!Array.isArray(accountsData)) {
          setBankAccounts([]);
          setCashAccounts([]);
          return;
        }

        if (accountsData.length === 0) {
          setBankAccounts([]);
          setCashAccounts([]);
          return;
        }

        // Filter for Current Assets (or any Asset type main group)
        const currentAssetsAccounts = accountsData.filter((acc: any) => {
          if (!acc || !acc.id || !acc.name) return false;
          const mainGroupName = (
            acc.Subgroup?.MainGroup?.name || ""
          ).toLowerCase();
          const mainGroupType = (
            acc.Subgroup?.MainGroup?.type || ""
          ).toLowerCase();
          return (
            mainGroupName.includes("current asset") || mainGroupType === "asset"
          );
        });

        // Separate Bank accounts (subgroup 103 = Bank Accounts)
        const bankAccountsList = currentAssetsAccounts
          .filter((acc: any) => {
            const subgroupCode = acc.Subgroup?.code || "";
            const accountCode = acc.code || "";
            const accountName = (acc.name || "").toLowerCase();

            // Special case: Exclude "Abdullah" account from bank accounts
            if (accountName.includes("abdullah")) return false;

            // Explicitly exclude Accounts Receivable (104) and Inventory (101)
            if (subgroupCode === "104" || subgroupCode === "101") return false;

            // Priority 1: Check subgroup code (most reliable)
            if (subgroupCode === "103") return true;

            // Priority 2: Exclude if it's clearly a cash account by subgroup
            if (subgroupCode === "102") return false;

            // Priority 3: Check account code pattern (103xxx) but exclude obvious cash accounts
            if (/^103\d{3}$/.test(accountCode)) {
              // Exclude if account name suggests it's cash/petty cash
              if (
                accountName.includes("cash") ||
                accountName.includes("petty")
              ) {
                return false;
              }
              return true;
            }

            // Priority 4: Check account name contains "bank" but not "cash" or "inventory"
            return (
              accountName.includes("bank") &&
              !accountName.includes("cash") &&
              !accountName.includes("petty") &&
              !accountName.includes("inventory")
            );
          })
          .map((acc: any) => ({
            id: acc.id,
            name: acc.name || "",
            type: acc.Subgroup?.MainGroup?.name || "General",
            code: acc.code || "",
          }));

        // Cash accounts: only from Cash sub group (subgroup code 102)
        const cashAccountsList = currentAssetsAccounts
          .filter((acc: any) => {
            const subgroupCode = (acc.Subgroup?.code || "").trim();
            const subgroupName = (acc.Subgroup?.name || "").toLowerCase();
            // Include only accounts that belong to the Cash sub group (code 102 or name contains "cash" and not "bank")
            if (subgroupCode === "102") return true;
            if (subgroupName.includes("cash") && !subgroupName.includes("bank"))
              return true;
            return false;
          })
          .map((acc: any) => ({
            id: acc.id,
            name: acc.name || "",
            type: acc.Subgroup?.MainGroup?.name || "General",
            code: acc.code || "",
          }));

        setBankAccounts(bankAccountsList);
        setCashAccounts(cashAccountsList);
      } catch (error) {
        setBankAccounts([]);
        setCashAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, []);

  // Get part data for inline item
  const getPartForItem = (partId: string) => {
    return parts.find((p) => p.id === partId) || selectedPartsMap[partId];
  };

  // Calculate line total for inline item
  const calculateLineTotal = (item: InlineItemRow) => {
    const part = getPartForItem(item.selectedPartId);
    const qty = item.qty || 0;
    if (!part && item.unitPrice == null) return 0;

    // Prefer explicit unitPrice (allows custom price), otherwise derive from price type
    const unitPrice =
      item.unitPrice != null ? item.unitPrice : getDerivedUnitPrice(item, part);

    return qty * unitPrice;
  };

  // Calculate total amount
  const calculateTotalAmount = () => {
    return inlineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  // Get current GST rate based on form state
  const getCurrentGstRate = () => {
    if (taxType !== "With GST") return 0;
    const isWalking = newInvoice.customerType === "walking";
    if (isWalking) {
      return parseFloat(customGstPercentage) || 0;
    }
    if (useCustomGst) {
      return parseFloat(customGstPercentage) || 0;
    }
    return gstPercentage;
  };

  // Calculate tax (GST) on total amount — discount is applied after GST
  const calculateTax = () => {
    if (taxType !== "With GST") return 0;
    const subtotal = calculateTotalAmount();
    const gstRate = getCurrentGstRate();
    return (subtotal * gstRate) / 100;
  };

  // Total after GST (before discount)
  const calculateTotalAfterGst = () => {
    const subtotal = calculateTotalAmount();
    const tax = calculateTax();
    return subtotal + tax;
  };

  // Grand total: total after GST minus discount
  const calculateAmountAfterDiscount = () => {
    const totalAfterGst = calculateTotalAfterGst();
    return Math.max(0, totalAfterGst - discount);
  };

  // Calculate due amount
  const calculateDueAmount = () => {
    // Use bankAmount + cashAmount if accounts are selected, otherwise fall back to receivedAmount
    const totalPaid =
      selectedBankAccount || selectedCashAccount
        ? bankAmount + cashAmount
        : receivedAmount;
    return calculateAmountAfterDiscount() - totalPaid;
  };

  // Calculate total received amount from bank + cash for display
  const calculateTotalReceived = () => {
    return selectedBankAccount || selectedCashAccount
      ? bankAmount + cashAmount
      : receivedAmount;
  };

  const getWalkinTermLabel = () => {
    const hasBank = bankAmount > 0;
    const hasCash = cashAmount > 0;
    if (hasBank && !hasCash) return "online";
    if (hasCash && !hasBank) return "cash";
    if (hasBank && hasCash) return "cash+online";
    return "";
  };

  const formatTermDisplay = (inv: any) => {
    const raw = String(inv?.term || "").trim();
    if (!raw) return "-";
    if (inv?.customerType === "registered") {
      return `${raw} days credit`;
    }
    return raw;
  };

  // Create or update invoice
  const handleSaveInvoice = async () => {
    if (
      inlineItems.length === 0 ||
      inlineItems.every((i) => !i.selectedPartId)
    ) {
      toast({
        title: "Error",
        description: "Please add at least one item",
        variant: "destructive",
      });
      return;
    }

    // Check if all items have either a selected price type OR a manual unit price.
    // This allows editing older/custom-priced invoices where unit price may not
    // exactly match Price A/B/M.
    const itemsWithoutPrice = inlineItems.filter(
      (i) =>
        i.selectedPartId &&
        i.qty > 0 &&
        !i.selectedPriceType &&
        (i.unitPrice == null || Number.isNaN(Number(i.unitPrice))),
    );
    if (itemsWithoutPrice.length > 0) {
      toast({
        title: "Error",
        description:
          "Please select Price A/B/M or enter a valid unit price for all items",
        variant: "destructive",
      });
      return;
    }

    // NEW: Validation for Walk-in Customer (Cash Sale)
    const subtotal = calculateTotalAmount();
    const totalReceived = calculateTotalReceived();
    const grandTotal = calculateAmountAfterDiscount();

    // Validation for Registered Customers (Party Sale)
    if (newInvoice.customerType === "registered" && !selectedCustomerId) {
      toast({
        title: "Customer Required",
        description: "Please select a customer for Party Sale (Credit).",
        variant: "destructive",
      });
      return;
    }

    // NEW: Credit Limit Validation for Registered Customers (can be overridden via checkbox)
    if (
      newInvoice.customerType === "registered" &&
      selectedCustomerId &&
      !overrideCreditLimit
    ) {
      const customer = customers.find((c) => c.id === selectedCustomerId);
      if (
        customer &&
        customer.creditLimit !== undefined &&
        customer.creditLimit > 0
      ) {
        // Due amount for this invoice
        const invoiceDueAmount = grandTotal - totalReceived;
        const currentBalance = customer.balance || 0;

        // Combined total
        const combinedTotal = currentBalance + invoiceDueAmount;

        if (combinedTotal > customer.creditLimit) {
          toast({
            title: "Credit Limit Exceeded",
            description: `The combined total of previous balance (${currentBalance.toFixed(2)}) and new due amount (${invoiceDueAmount.toFixed(2)}) exceeds the customer's credit limit (${customer.creditLimit.toFixed(2)}).`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (newInvoice.customerType === "walking") {
      if (totalReceived <= 0) {
        toast({
          title: "Missing Payment Information",
          description:
            "For Walk-in Customers (Cash Sale), please enter the received amount before saving.",
          variant: "destructive",
        });
        return;
      }

      // Use a small threshold for floating point comparisons
      if (Math.abs(totalReceived - grandTotal) > 0.01) {
        toast({
          title: "Exact Payment Required",
          description: `For Walk-in Customers, the received amount (${totalReceived.toFixed(2)}) must exactly match the grand total (${grandTotal.toFixed(2)}).`,
          variant: "destructive",
        });
        return;
      }
    }

    // Validate stock (rack/shelf is chosen at stock-out in Store, not on the invoice)
    for (const item of inlineItems) {
      if (!item.selectedPartId || item.qty <= 0) continue;

      const part = getPartForItem(item.selectedPartId);
      if (!part) continue;

      const partNoDesc = part.description
        ? `${part.partNo} - ${part.description}`
        : part.partNo;

      const stockBalance = partStockBalances[part.id];
      const currentStock = stockBalance?.available_stock ?? part.availableQty;
      if (item.qty > currentStock) {
        toast({
          title: "Insufficient Total Stock",
          description: `Quantity (${item.qty}) for ${partNoDesc} exceeds available total stock (${currentStock}).`,
          variant: "destructive",
        });
        return;
      }
    }

    // Convert inline items to invoice items
    const invoiceItems = inlineItems
      .filter((i) => i.selectedPartId && i.qty > 0)
      .map((item) => {
        const part = getPartForItem(item.selectedPartId);
        // Prefer explicit unitPrice (custom or A/B/M), otherwise derive from price type
        const unitPrice =
          item.unitPrice != null
            ? item.unitPrice
            : getDerivedUnitPrice(item, part);

        return {
          partId: item.selectedPartId,
          partNo: part?.partNo || "",
          description: part?.description || "",
          orderedQty: item.qty,
          unitPrice,
          discount: 0,
          lineTotal: calculateLineTotal(item),
          grade: part?.grade || "A",
          brand: part?.brands[0]?.name || "",
          useUnlocatedStock: false,
        };
      });

    try {
      // Determine customer name based on selection
      // registered = Party Sale (picks from customer dropdown)
      // walking    = Cash Sale  (free-text name entry)
      const customerName =
        newInvoice.customerType === "registered" && selectedCustomerName
          ? selectedCustomerName // Party Sale: use selected customer
          : newInvoice.customerType === "walking" && newInvoice.customerName
            ? newInvoice.customerName // Cash Sale: use typed name
            : newInvoice.customerType === "registered"
              ? "Walk-in Customer" // Party Sale fallback
              : "Walk-in Customer"; // Cash Sale fallback

      let response;
      const resolvedTerm =
        newInvoice.customerType === "registered"
          ? term.trim() || undefined
          : selectedBankAccount && bankAmount > 0
            ? "online"
            : selectedCashAccount && cashAmount > 0
              ? "cash"
              : undefined;
      if (editingInvoiceId) {
        // UPDATE Existing Invoice
        response = await apiClient.updateSalesInvoice(editingInvoiceId, {
          invoiceDate: invoiceDate,
          term: resolvedTerm,
          customerId: selectedCustomerId || undefined,
          customerName: customerName,
          deliveredTo: deliveredTo || undefined,
          remarks: remarks || undefined,
          items: invoiceItems,
          subtotal,
          overallDiscount: discount,
          tax: calculateTax(),
          taxPercentage:
            taxType === "With GST" ? getCurrentGstRate() : undefined,
          grandTotal,
          accountId: selectedBankAccount || selectedCashAccount || undefined,
          bankAccountId: selectedBankAccount || undefined,
          cashAccountId: selectedCashAccount || undefined,
          bankAmount:
            selectedBankAccount && bankAmount > 0 ? bankAmount : undefined,
          cashAmount:
            selectedCashAccount && cashAmount > 0 ? cashAmount : undefined,
          paidAmount:
            selectedBankAccount || selectedCashAccount
              ? bankAmount + cashAmount
              : receivedAmount,
        });
      } else {
        // CREATE New Invoice
        response = await apiClient.createSalesInvoice({
          invoiceDate: invoiceDate,
          term: resolvedTerm,
          customerId: selectedCustomerId || undefined,
          customerName: customerName,
          customerType: newInvoice.customerType as CustomerType,
          salesPerson: newInvoice.salesPerson || "Admin",
          accountId: selectedBankAccount || selectedCashAccount || undefined, // Keep for backward compatibility
          bankAccountId: selectedBankAccount || undefined,
          cashAccountId: selectedCashAccount || undefined,
          bankAmount:
            selectedBankAccount && bankAmount > 0 ? bankAmount : undefined, // NEW
          cashAmount:
            selectedCashAccount && cashAmount > 0 ? cashAmount : undefined, // NEW
          deliveredTo: deliveredTo || undefined,
          remarks: remarks || undefined,
          items: invoiceItems,
          subtotal,
          overallDiscount: discount,
          tax: calculateTax(),
          taxPercentage:
            taxType === "With GST" ? getCurrentGstRate() : undefined,
          grandTotal,
          paidAmount:
            selectedBankAccount || selectedCashAccount
              ? bankAmount + cashAmount
              : receivedAmount, // Calculate from bank + cash
        });
      }

      if (response.error) {
        toast({
          title: "Error",
          description:
            response.error ||
            `Failed to ${editingInvoiceId ? "update" : "create"} invoice`,
          variant: "destructive",
        });
        return;
      }

      const invoiceType =
        newInvoice.customerType === "registered" ? "Party Sale" : "Cash Sale";
      const message =
        newInvoice.customerType === "registered"
          ? `Invoice ${editingInvoiceId ? "updated" : "created"}. Stock will be reserved when you approve the invoice.`
          : `Invoice ${editingInvoiceId ? "updated" : "created"}. Stock will be reserved when you approve; confirm delivery to complete.`;

      toast({
        title: `Invoice ${editingInvoiceId ? "Updated" : "Created"}`,
        description: `${invoiceType} invoice ${editingInvoiceId ? "updated" : "created"}. ${message}`,
      });

      resetForm();
      refreshPartsData();

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: Math.max(
            0,
            (item.orderedQty || 0) -
              (item.deliveredQty || 0) -
              (item.pendingQty || 0),
          ),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? inv.taxPercentage : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        accountId: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.message ||
          `Failed to ${editingInvoiceId ? "update" : "create"} invoice`,
        variant: "destructive",
      });
    }
  };

  // Reset form
  const resetForm = () => {
    setEditingInvoiceId(null);
    setShowNewInvoice(false);
    setNewInvoice({
      customerType: "registered", // Default to Party Sale
      items: [],
      overallDiscount: 0,
      overallDiscountType: "percent",
    });
    setInlineItems([]);
    setDiscount(0);
    setReceivedAmount(0);
    setBankAmount(0); // Reset bank amount
    setCashAmount(0); // Reset cash amount
    setSelectedBankAccount("");
    setSelectedCashAccount("");
    setTaxType("Without GST");
    setGstPercentage(0);
    setCustomGstPercentage("");
    setUseCustomGst(false);
    setDeliveredTo("");
    setRemarks("");
    setTerm("");
    setInvoiceDate(new Date().toISOString().split("T")[0]); // Reset to today when starting a new invoice
    setSelectedCustomerId("");
    setSelectedCustomerName("");
    setCustomerPriceType(null);
    setSelectedCustomerCategory(null);
  };

  // Handle Edit Invoice
  const handleEditInvoice = async (invoice: Invoice) => {
    try {
      const fullInvoice = (await apiClient.getSalesInvoice(invoice.id)) as any;
      setEditingInvoiceId(invoice.id);

      setNewInvoice({
        customerType: invoice.customerType,
        customerName: invoice.customerName,
        salesPerson: invoice.salesPerson,
        items: [],
        overallDiscount: invoice.overallDiscount || 0,
        overallDiscountType: "percent",
      });
      setSelectedCustomerId(invoice.customerId || "");
      setSelectedCustomerName(invoice.customerName || "");
      // Restore invoice date when editing
      const invDate = fullInvoice.invoiceDate ?? invoice.invoiceDate;
      setInvoiceDate(
        typeof invDate === "string"
          ? invDate.slice(0, 10)
          : new Date(invDate).toISOString().split("T")[0],
      );
      setTerm(String(fullInvoice.term ?? invoice.term ?? ""));
      // Restore customer price type when editing
      const editCustomer = customers.find((c) => c.id === invoice.customerId);
      setCustomerPriceType(editCustomer?.priceType || null);
      setSelectedCustomerCategory(editCustomer?.category || null);

      const partItemsToMerge: PartItem[] = [];

      const convertedItems = (fullInvoice.SalesInvoiceItem || []).map(
        (item: any) => {
          if (item.Part && !parts.find((p) => p.id === item.Part.id)) {
            // Note: masterPartNo and partNo swapping logic to match fetchParts
            const stockLocations = (item.Part.PartRackShelf || []).map(
              (prs: any) => ({
                id: prs.id,
                storeId: prs.storeId,
                rackId: prs.Rack?.id,
                rackCode: prs.Rack?.codeNo,
                shelfId: prs.Shelf?.id,
                shelfNo: prs.Shelf?.shelfNo,
                quantity: prs.quantity,
              }),
            );

            partItemsToMerge.push({
              id: item.Part.id,
              partNo: String(
                item.Part.masterPartNo || item.partNo || "",
              ).trim(), // Blue block
              masterPartNo: String(item.Part.partNo || "").trim(), // Red block
              description: item.Part.description || item.description || "",
              category: item.Part.category?.name || "",
              price: item.Part.priceA || item.Part.cost || 0,
              priceA: item.Part.priceA || null,
              priceB: item.Part.priceB || null,
              priceM: item.Part.priceM || null,
              stockQty: item.Part.stockQty || 0,
              reservedQty: item.Part.reservedQty || 0,
              availableQty:
                (item.Part.stockQty || 0) - (item.Part.reservedQty || 0),
              grade: item.Part.grade || "A",
              brands: item.Part.Brand
                ? [{ id: item.Part.Brand.id || "", name: item.Part.Brand.name }]
                : [],
              locations: stockLocations,
              unlocatedStock: item.Part.unlocatedStock || 0,
            });
          }

          return {
            id: item.id,
            selectedPartId: item.partId,
            qty: item.orderedQty,
            // Restore unitPrice and infer selectedPriceType based on part prices
            unitPrice: item.unitPrice,
            selectedPriceType: (() => {
              const part = item.Part;
              const u = item.unitPrice;
              if (!part || u == null) return undefined;
              if (part.priceA != null && Math.abs(u - part.priceA) < 0.01)
                return "A";
              if (part.priceB != null && Math.abs(u - part.priceB) < 0.01)
                return "B";
              if (part.priceM != null && Math.abs(u - part.priceM) < 0.01)
                return "M";
              return undefined;
            })(),
            useUnlocatedStock: false,
            selectedLocationId: "",
            selectedLocationIds: [],
            selectedRackId: "",
            partNoFallback: item.Part?.partNo || item.partNo || "",
            descriptionFallback:
              item.Part?.description || item.description || "",
          };
        },
      );

      if (partItemsToMerge.length > 0) {
        setParts((prev) => {
          const merged = [...prev];
          partItemsToMerge.forEach((p) => {
            if (!merged.find((existing) => existing.id === p.id)) {
              merged.push(p);
            }
          });
          return merged;
        });

        // Also add to persistent lookup map
        setSelectedPartsMap((prev) => {
          const updated = { ...prev };
          partItemsToMerge.forEach((p) => {
            updated[p.id] = p;
          });
          return updated;
        });
      }

      setInlineItems(convertedItems);
      convertedItems.forEach((item: any) => {
        if (item.selectedPartId) {
          fetchPartStockBalance(item.selectedPartId);
          fetchPartModels(item.selectedPartId);
        }
      });

      setDiscount(invoice.overallDiscount || 0);
      setDeliveredTo(fullInvoice.deliveredTo || "");
      setRemarks(fullInvoice.remarks || "");

      // Handle account and payment amounts
      if (invoice.accountId) {
        const isBank = bankAccounts.some((acc) => acc.id === invoice.accountId);
        const isCash = cashAccounts.some((acc) => acc.id === invoice.accountId);

        if (isBank) {
          setSelectedBankAccount(invoice.accountId);
          setSelectedCashAccount("");
          setBankAmount(invoice.paidAmount || 0);
          setCashAmount(0);
        } else if (isCash) {
          setSelectedCashAccount(invoice.accountId);
          setSelectedBankAccount("");
          setCashAmount(invoice.paidAmount || 0);
          setBankAmount(0);
        } else {
          // Fallback if not specifically found in lists (might still be an account)
          setReceivedAmount(invoice.paidAmount || 0);
        }
      } else {
        setReceivedAmount(invoice.paidAmount || 0);
        setSelectedBankAccount("");
        setSelectedCashAccount("");
        setBankAmount(0);
        setCashAmount(0);
      }

      setShowNewInvoice(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load invoice details",
        variant: "destructive",
      });
    }
  };

  // Handle customer created in the CustomerFormDialog
  const handleCustomerCreated = async (created: {
    id: string;
    name: string;
    priceType: string | null;
  }) => {
    // Refresh customers list
    try {
      const customersResponse = await apiClient.getCustomers({
        status: "active",
        limit: 1000,
      });
      const customersData = Array.isArray(customersResponse)
        ? customersResponse
        : customersResponse.data || [];
      if (Array.isArray(customersData)) {
        const formattedCustomers: Customer[] = customersData
          .filter((c: any) => !c.name.toLowerCase().includes("demo"))
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type || "registered",
            balance: c.balance || 0,
            creditLimit: c.creditLimit || 0,
            creditDays: c.creditDays || 0,
            priceType: c.priceType || null,
            tax: c.tax || 0,
          }));
        setCustomers(formattedCustomers);
      }
    } catch {
      /* ignore refresh error */
    }

    // Auto-select the newly created customer
    setSelectedCustomerId(created.id);
    setSelectedCustomerName(created.name);
    const pt = (created.priceType as "A" | "B" | "M" | null) || null;
    setCustomerPriceType(pt);
    if (pt) {
      setInlineItems((prev) =>
        prev.map((item) =>
          item.selectedPartId ? { ...item, selectedPriceType: pt } : item,
        ),
      );
    }
  };

  // Handle payment recording
  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    if (paymentForm.amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }
    if (!paymentForm.accountId) {
      toast({
        title: "Select Account",
        description: "Please select a bank or cash account for the payment.",
        variant: "destructive",
      });
      return;
    }

    setRecordingPayment(true);
    try {
      const response = await apiClient.post(
        `/sales/invoices/${selectedInvoice.id}/payment`,
        {
          amount: paymentForm.amount,
          accountId: paymentForm.accountId,
          paymentDate: paymentForm.paymentDate,
        },
      );

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to record payment",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Payment Recorded",
        description: `Successfully recorded payment of Rs ${paymentForm.amount} for invoice ${selectedInvoice.invoiceNo}.`,
      });

      setShowPaymentDialog(false);

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: Math.max(
            0,
            (item.orderedQty || 0) -
              (item.deliveredQty || 0) -
              (item.pendingQty || 0),
          ),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? inv.taxPercentage : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        accountId: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setRecordingPayment(false);
    }
  };

  // Handle delivery recording
  const handleRecordDelivery = async (
    delivery: DeliveryLogEntry,
    updatedItems: InvoiceItem[],
  ) => {
    if (!selectedInvoice) return;

    try {
      const response = await apiClient.recordDelivery(selectedInvoice.id, {
        challanNo: delivery.challanNo,
        deliveryDate: delivery.deliveryDate,
        deliveredBy: delivery.deliveredBy,
        items: delivery.items,
      });

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to record delivery",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Delivery Recorded",
        description: `${delivery.challanNo} - Items moved from RESERVED to OUT stock.`,
      });

      refreshPartsData();

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: Math.max(
            0,
            (item.orderedQty || 0) -
              (item.deliveredQty || 0) -
              (item.pendingQty || 0),
          ),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        account: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);

      // Update selected invoice
      const updatedInvoice = transformedInvoices.find(
        (inv) => inv.id === selectedInvoice.id,
      );
      if (updatedInvoice) {
        setSelectedInvoice({
          ...updatedInvoice,
          items: updatedInvoice.items || [],
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record delivery",
        variant: "destructive",
      });
    }
  };

  // Handle reverse quantity for multiple items
  const handleReverseQuantity = async () => {
    if (!selectedInvoice || itemsToReverse.length === 0) return;

    // Validate all quantities
    for (const item of itemsToReverse) {
      const qty = reverseQuantities[item.id] || 0;
      // maxReverse = pendingQty (which is orderedQty - deliveredQty, stored correctly in DB)
      const maxReverse = item.pendingQty || 0;
      if (qty <= 0) {
        toast({
          title: "Invalid Quantity",
          description: `Please enter a valid quantity for ${item.partNo}.`,
          variant: "destructive",
        });
        return;
      }
      if (qty > maxReverse) {
        toast({
          title: "Invalid Quantity",
          description: `Cannot reverse more than ${maxReverse} units for ${item.partNo}.`,
          variant: "destructive",
        });
        return;
      }
    }

    setReversing(true);
    try {
      // Create a single bulk reverse request
      const reverseItems = itemsToReverse.map((item) => ({
        invoiceItemId: item.id,
        quantity: reverseQuantities[item.id],
      }));

      // Use the apiClient to make authenticated request
      const response = await apiClient.bulkReverseInvoiceItems(
        selectedInvoice.id,
        {
          items: reverseItems,
          reason: `Bulk reverse - Invoice ${selectedInvoice.invoiceNo}`,
        },
      );

      if (response.error) {
        throw new Error(response.error || "Failed to reverse items");
      }

      const totalReversed = itemsToReverse.reduce(
        (sum, item) => sum + (reverseQuantities[item.id] || 0),
        0,
      );
      const voucherNumber = (response as any).voucherNumber || "N/A";
      toast({
        title: "Quantity Reversed",
        description: `Successfully reversed ${totalReversed} units from ${itemsToReverse.length} items back to stock. Voucher ${voucherNumber} created.`,
      });

      setShowReverseDialog(false);
      setItemsToReverse([]);
      setReverseQuantities({});

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: Math.max(
            0,
            (item.orderedQty || 0) -
              (item.deliveredQty || 0) -
              (item.pendingQty || 0),
          ),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? inv.taxPercentage : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        accountId: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items:
              log.items?.map((item: any) => ({
                invoiceItemId: item.invoiceItemId,
                quantity: item.quantity,
              })) || [],
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);

      // Update selected invoice
      if (selectedInvoice) {
        const updatedInvoice = transformedInvoices.find(
          (inv) => inv.id === selectedInvoice.id,
        );
        if (updatedInvoice) {
          setSelectedInvoice(updatedInvoice);
        }
      }
    } catch (error: any) {
      console.error("Error reversing quantity:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reverse quantity",
        variant: "destructive",
      });
    } finally {
      setReversing(false);
    }
  };

  const openSaleReturnDialog = async (inv: Invoice) => {
    setShowSaleReturnDialog(true);
    setLoadingSaleReturn(true);
    setSaleReturnInvoice(null);
    try {
      const resp = (await apiClient.getSalesInvoice(inv.id)) as any;
      const fullInv = resp?.data || resp;
      if (!fullInv?.id) throw new Error("Invalid invoice response");
      const fullItems = Array.isArray(fullInv.SalesInvoiceItem)
        ? fullInv.SalesInvoiceItem
        : [];
      const mappedItems = mapApiSalesInvoiceItemsToInvoiceItems(fullItems);
      const returnedByPart = aggregateReturnedQtyByPartId(fullInv.SalesReturn);
      setSaleReturnReturnedByPartId(returnedByPart);
      setSaleReturnDeductionTouched(false);
      setSaleReturnDeductionDraft("");
      setSaleReturnRefundPaidTouched(false);
      setSaleReturnRefundPaidDraft("");
      setSaleReturnPaymentAccountId("");
      const merged: Invoice = {
        ...inv,
        invoiceDate: fullInv.invoiceDate || inv.invoiceDate,
        term: fullInv.term ?? inv.term,
        customerName: fullInv.customerName || inv.customerName,
        customerId: fullInv.customerId || inv.customerId,
        customerType: (fullInv.customerType || inv.customerType) as CustomerType,
        subtotal: Number(fullInv.subtotal ?? inv.subtotal),
        overallDiscount: Number(fullInv.overallDiscount ?? inv.overallDiscount),
        tax: Number(fullInv.tax ?? inv.tax),
        taxPercentage: fullInv.taxPercentage ?? inv.taxPercentage,
        grandTotal: Number(fullInv.grandTotal ?? inv.grandTotal),
        paidAmount: Number(fullInv.paidAmount ?? inv.paidAmount),
        status: (fullInv.status || inv.status) as InvoiceStatus,
        paymentStatus: (fullInv.paymentStatus || inv.paymentStatus) as PaymentStatus,
        items: mappedItems,
      };
      setSaleReturnInvoice(merged);
      const draft: Record<string, string> = {};
      mappedItems.forEach((item) => {
        draft[item.id] = "";
      });
      setSaleReturnQtyDraft(draft);
      setSaleReturnReason("");
      setSaleReturnDate(new Date().toISOString().split("T")[0]);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load invoice for return.",
        variant: "destructive",
      });
      setShowSaleReturnDialog(false);
    } finally {
      setLoadingSaleReturn(false);
    }
  };

  const handleSubmitSaleReturn = async () => {
    if (!saleReturnInvoice) return;
    const qtyByItemId = parseSaleReturnDraftToQuantities(
      saleReturnInvoice.items,
      saleReturnQtyDraft,
      saleReturnReturnedByPartId,
    );
    const err = validateSaleReturnByPart(
      saleReturnInvoice.items,
      qtyByItemId,
      saleReturnReturnedByPartId,
    );
    if (err) {
      toast({
        title: "Invalid quantities",
        description: err,
        variant: "destructive",
      });
      return;
    }
    const items: { part_id: string; return_quantity: number }[] = [];
    for (const line of saleReturnInvoice.items) {
      const q = qtyByItemId[line.id] ?? 0;
      if (q > 0) items.push({ part_id: line.partId, return_quantity: q });
    }
    if (items.length === 0) {
      toast({
        title: "Nothing to return",
        description: "Enter a return quantity for at least one line.",
        variant: "destructive",
      });
      return;
    }
    const isWalkingReturn = saleReturnInvoice.customerType === "walking";
    const netCap = Math.round(saleReturnNet.net * 100) / 100;
    let refundPaid = 0;
    if (isWalkingReturn) {
      if (netCap > 0) {
        if (!saleReturnPaymentAccountId) {
          toast({
            title: "Payment account",
            description:
              "Select the cash or bank account to refund the walk-in customer.",
            variant: "destructive",
          });
          return;
        }
        refundPaid = netCap;
      }
    } else {
      refundPaid = parseSaleReturnDeductionDraft(saleReturnRefundPaidDraft);
      refundPaid = Math.max(0, Math.min(refundPaid, netCap));
      if (refundPaid > 0 && !saleReturnPaymentAccountId) {
        toast({
          title: "Payment account",
          description:
            "Select the cash or bank account to pay the refund, or clear the paid amount.",
          variant: "destructive",
        });
        return;
      }
      if (refundPaid <= 0 && saleReturnPaymentAccountId) {
        toast({
          title: "Paid amount",
          description:
            "Enter the amount to pay the customer or clear the payment account.",
          variant: "destructive",
        });
        return;
      }
    }
    setSubmittingSaleReturn(true);
    try {
      const payload: Parameters<typeof apiClient.createSalesReturn>[0] = {
        invoice_id: saleReturnInvoice.id,
        return_date: saleReturnDate,
        reason: saleReturnReason.trim() || undefined,
        items,
      };
      if (Number(saleReturnInvoice.overallDiscount) > 0) {
        payload.deduction = saleReturnNet.deduction;
      }
      if (refundPaid > 0 && saleReturnPaymentAccountId) {
        payload.paid_amount = refundPaid;
        payload.payment_account_id = saleReturnPaymentAccountId;
      }
      const response = await apiClient.createSalesReturn(payload);
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Sales return created",
        description:
          (response as any)?.message ||
          "Return is saved as pending. Approve it from Sales Returns.",
      });
      setShowSaleReturnDialog(false);
      setSaleReturnInvoice(null);
      setSaleReturnQtyDraft({});
      setSaleReturnReturnedByPartId({});
      setSaleReturnReason("");
      setSaleReturnDeductionDraft("");
      setSaleReturnDeductionTouched(false);
      setSaleReturnRefundPaidDraft("");
      setSaleReturnRefundPaidTouched(false);
      setSaleReturnPaymentAccountId("");
      setInvoiceListRefreshTick((t) => t + 1);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to create sales return.",
        variant: "destructive",
      });
    } finally {
      setSubmittingSaleReturn(false);
    }
  };

  // Approve Cash Sale Invoice
  const handleApproveInvoice = async (invoice: Invoice) => {
    if (invoice.customerType !== "registered") {
      toast({
        title: "Error",
        description:
          "Only Party Sale (registered customer) invoices can be approved.",
        variant: "destructive",
      });
      return;
    }

    try {
      setApprovingInvoice(invoice.id);
      const response = await apiClient.approveSalesInvoice(
        invoice.id,
        "Store Manager",
      );

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to approve invoice",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Invoice Approved",
        description: `Invoice ${invoice.invoiceNo} approved. Stock has been reduced.`,
      });

      refreshPartsData();

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: item.reversedQty || 0,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
          storeName: item.Store?.name,
          rackCode: item.Rack?.codeNo,
          shelfNo: item.Shelf?.shelfNo,
          useUnlocatedStock: item.useUnlocatedStock,
        })),
        subtotal: inv.subtotal || 0,
        overallDiscount: inv.overallDiscount || 0,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal || 0,
        paidAmount: inv.paidAmount || 0,
        status: inv.status || "pending",
        paymentStatus: inv.paymentStatus || "unpaid",
        accountId: inv.accountId,
        deliveredTo: inv.deliveredTo,
        remarks: inv.remarks,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve invoice",
        variant: "destructive",
      });
    } finally {
      setApprovingInvoice(null);
    }
  };

  // Hold invoice
  const handleHoldInvoice = async (
    backendHoldLocations: Record<string, any[]>,
  ) => {
    if (!invoiceToHold) return;

    try {
      // First update status (triggers stock movement to hold with locations)
      await apiClient.updateInvoiceStatus(
        invoiceToHold.id,
        "on_hold",
        undefined,
        "Admin",
        backendHoldLocations,
      );

      // Then save holdReason via dedicated endpoint
      if (holdReason) {
        await apiClient.holdInvoice(invoiceToHold.id, { holdReason });
      }

      toast({
        title: "Invoice On Hold",
        description: `Invoice ${invoiceToHold.invoiceNo} is now on hold with specific stock locations.`,
      });

      refreshPartsData();

      // Refresh invoices
      const response = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(response)
        ? response
        : response.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items:
          inv.SalesInvoiceItem?.map((item: any) => ({
            id: item.id,
            partId: item.partId,
            partNo: item.partNo,
            description: item.description || "",
            orderedQty: item.orderedQty,
            deliveredQty: item.deliveredQty,
            pendingQty: item.pendingQty,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            discountType: "percent" as const,
            lineTotal: item.lineTotal,
            grade: (item.grade || "A") as ItemGrade,
            brand: item.brand,
            storeName: item.Store?.name,
            rackCode: item.Rack?.codeNo,
            shelfNo: item.Shelf?.shelfNo,
            useUnlocatedStock: item.useUnlocatedStock,
          })) || [],
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus:
          inv.status === "paid"
            ? "paid"
            : inv.paidAmount > 0
              ? "partial"
              : "unpaid",
        accountId: inv.accountId,
        deliveryLog: [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);

      setShowHoldDialog(false);
      setHoldReason("");
      setInvoiceToHold(null);
      setHoldLocationQtys({});
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to put invoice on hold",
        variant: "destructive",
      });
    }
  };

  // Cancel invoice
  const handleCancelInvoice = async () => {
    if (!invoiceToCancel) return;

    try {
      const response = await apiClient.cancelInvoice(invoiceToCancel.id);

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to cancel invoice",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Invoice Cancelled",
        description: `Invoice has been cancelled. Reserved stock returned to available.`,
      });

      refreshPartsData();

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: item.reversedQty || 0,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
          storeName: item.Store?.name,
          rackCode: item.Rack?.codeNo,
          shelfNo: item.Shelf?.shelfNo,
          useUnlocatedStock: item.useUnlocatedStock,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? inv.taxPercentage : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        accountId: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);

      setShowCancelConfirm(false);
      setInvoiceToCancel(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel invoice",
        variant: "destructive",
      });
    }
  };

  // Soft delete invoice with stock reversal
  const handleSoftDeleteInvoice = async () => {
    if (!invoiceToSoftDelete) return;

    try {
      const response = (await apiClient.softDeleteInvoice(
        invoiceToSoftDelete.id,
      )) as any;

      if (response?.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to soft delete invoice",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Invoice Soft Deleted",
        description: `Invoice ${invoiceToSoftDelete.invoiceNo} has been deleted and stock has been reversed.`,
      });

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse?.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: Math.max(
            0,
            (item.orderedQty || 0) -
              (item.deliveredQty || 0) -
              (item.pendingQty || 0),
          ),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        account: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);

      setShowSoftDeleteConfirm(false);
      setInvoiceToSoftDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to soft delete invoice",
        variant: "destructive",
      });
    }
  };

  // Permanently delete a cancelled invoice
  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    try {
      const response = (await apiClient.deleteInvoice(
        invoiceToDelete.id,
      )) as any;

      if (response?.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to delete invoice",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Invoice Deleted",
        description: `Invoice ${invoiceToDelete.invoiceNo} has been permanently removed.`,
      });

      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse?.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: Math.max(
            0,
            (item.orderedQty || 0) -
              (item.deliveredQty || 0) -
              (item.pendingQty || 0),
          ),
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        account: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);

      setShowDeleteConfirm(false);
      setInvoiceToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice",
        variant: "destructive",
      });
    }
  };

  // Release hold
  const handleReleaseHold = async (invoice: Invoice) => {
    try {
      const response = await apiClient.releaseHold(invoice.id);

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to release hold",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Hold Released",
        description: "Invoice is now active again.",
      });

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: item.reversedQty || 0,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        account: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to release hold",
        variant: "destructive",
      });
    }
  };

  // Update invoice status
  const handleUpdateStatus = async (
    invoice: Invoice,
    newStatus: InvoiceStatus,
    deliveredQtys?: Record<string, number>,
  ) => {
    if (newStatus === "approved") {
      setApprovingInvoice(invoice.id);
    }

    try {
      const response = await apiClient.updateInvoiceStatus(
        invoice.id,
        newStatus,
        deliveredQtys,
      );

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to update invoice status",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Status Updated",
        description: `Invoice status updated to ${getStatusLabel(newStatus)}`,
      });

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices(
        salesInvoicesQueryParams,
      );
      const invoicesData: any = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : invoicesResponse.data || [];
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerType: inv.customerType as CustomerType,
        customerId: inv.customerId,
        customerName: inv.customerName,
        term: inv.term ?? null,
        salesPerson: inv.salesPerson || "Admin",
        items: inv.SalesInvoiceItem?.map((item: any) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          pendingQty: item.pendingQty,
          reversedQty: item.reversedQty || 0,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: "percent" as const,
          lineTotal: item.lineTotal,
          grade: (item.grade || "A") as ItemGrade,
          brand: item.brand,
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
        taxPercentage:
          inv.taxPercentage != null ? Number(inv.taxPercentage) : undefined,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        status: inv.status as InvoiceStatus,
        paymentStatus: inv.paymentStatus as "unpaid" | "partial" | "paid",
        account: inv.accountId,
        deliveryLog:
          inv.deliveryLogs?.map((log: any) => ({
            challanNo: log.challanNo,
            deliveryDate: log.deliveryDate,
            deliveredBy: log.deliveredBy || "",
            items: log.items?.map((item: any) => ({
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          })) || [],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      }));
      setInvoices(transformedInvoices);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoice status",
        variant: "destructive",
      });
    } finally {
      setApprovingInvoice(null);
    }
  };

  const handlePrintInvoice = (invoice: Invoice, columns?: string[]) => {
    const invoiceMeta = invoice as any;
    const enabledColumns = new Set(columns || selectedInvoicePrintColumns);
    const include = (id: string) => enabledColumns.has(id);
    const visibleColumnCount = Math.max(
      1,
      invoicePrintColumns.filter((c) => include(c.id)).length,
    );
    const numberToWords = (num: number): string => {
      const ones = [
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
      ];
      const tens = [
        "",
        "",
        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety",
      ];
      if (!Number.isFinite(num) || num <= 0) return "Zero";

      const convertLessThanThousand = (n: number): string => {
        if (n === 0) return "";
        if (n < 20) return ones[n];
        if (n < 100)
          return (
            tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ` ${ones[n % 10]}` : "")
          );
        return (
          `${ones[Math.floor(n / 100)]} Hundred` +
          (n % 100 !== 0 ? ` ${convertLessThanThousand(n % 100)}` : "")
        );
      };

      const whole = Math.floor(num);
      if (whole >= 10000000) {
        const crore = Math.floor(whole / 10000000);
        const rem = whole % 10000000;
        return (
          `${convertLessThanThousand(crore)} Crore` +
          (rem > 0 ? ` ${numberToWords(rem)}` : "")
        );
      }
      if (whole >= 100000) {
        const lakh = Math.floor(whole / 100000);
        const rem = whole % 100000;
        return (
          `${convertLessThanThousand(lakh)} Lakh` +
          (rem > 0 ? ` ${numberToWords(rem)}` : "")
        );
      }
      if (whole >= 1000) {
        const thousand = Math.floor(whole / 1000);
        const rem = whole % 1000;
        return (
          `${convertLessThanThousand(thousand)} Thousand` +
          (rem > 0 ? ` ${convertLessThanThousand(rem)}` : "")
        );
      }
      return convertLessThanThousand(whole);
    };
    const esc = (v: any) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const dateText = invoice.invoiceDate
      ? new Date(invoice.invoiceDate).toLocaleDateString()
      : "";
    const printDateTime = new Date().toLocaleString();
    const getPrintedBy = () => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) return "Unknown User";
        const parts = token.split(".");
        if (parts.length < 2) return "Unknown User";
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        return (
          payload?.name ||
          payload?.username ||
          payload?.fullName ||
          payload?.userName ||
          payload?.email ||
          payload?.sub ||
          "Unknown User"
        );
      } catch {
        return "Unknown User";
      }
    };
    const printedBy = getPrintedBy();
    const matchedCustomer = customers.find(
      (c) =>
        c.id === invoice.customerId ||
        c.name?.trim().toLowerCase() === invoice.customerName?.trim().toLowerCase(),
    );
    const addressParts = String(matchedCustomer?.address || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const formattedAddressHtml = addressParts.length
      ? addressParts.map((part) => esc(part)).join(",<br/>")
      : "";
    const areaText = matchedCustomer?.area ? esc(matchedCustomer.area) : "";
    const totalQty =
      invoice.items?.reduce((sum, i) => sum + (i.orderedQty || 0), 0) || 0;
    const baseTotal = Number(
      invoice.subtotal ??
        invoice.items?.reduce((sum, i) => sum + Number(i.lineTotal || 0), 0) ??
        0,
    );
    const discountAmount = Number(invoice.overallDiscount || 0);
    const taxAmount = Number(invoice.tax || 0);
    const taxPercentageStored = Number(
      invoice.taxPercentage ?? invoiceMeta.taxPercentage ?? 0,
    );
    const currentAmount = Number(invoice.grandTotal || 0);
    const invoiceDue = Math.max(
      0,
      Number(invoice.grandTotal || 0) - Number(invoice.paidAmount || 0),
    );
    // Prefer explicit previous balance from backend if present; fallback from
    // customer current balance by subtracting this invoice's due amount.
    const explicitPrevBalance = Number(invoiceMeta.previousBalance ?? NaN);
    const customerCurrentBalanceFromInvoice = Number(
      invoiceMeta.customerBalance ?? NaN,
    );
    const customerCurrentBalanceFromState = Number(
      customers.find(
        (c) =>
          c.id === invoice.customerId ||
          c.name?.trim().toLowerCase() ===
            invoice.customerName?.trim().toLowerCase(),
      )?.balance ?? NaN,
    );
    const customerCurrentBalance = Number.isFinite(
      customerCurrentBalanceFromInvoice,
    )
      ? customerCurrentBalanceFromInvoice
      : customerCurrentBalanceFromState;
    const balBf = Number.isFinite(explicitPrevBalance)
      ? Math.max(0, explicitPrevBalance)
      : Number.isFinite(customerCurrentBalance)
        ? Math.max(0, customerCurrentBalance - invoiceDue)
        : 0;
    const totalReceivable = balBf + currentAmount;
    const currentAmountWords = numberToWords(currentAmount);
    const linesBeforeCurrentAmount =
      (discountAmount > 0 ? 1 : 0) + (taxAmount > 0 ? 1 : 0);
    const amountWordsOffsetPx = linesBeforeCurrentAmount * 22;

    const rows =
      invoice.items?.length
        ? invoice.items
            .map(
              (item, idx) => `
                <tr>
                  ${include("sr") ? `<td class="c">${idx + 1}</td>` : ""}
                  ${include("partNo") ? `<td>${esc(item.partNo)}</td>` : ""}
                  ${include("altPartNo") ? `<td>${esc(item.partNo || "")}</td>` : ""}
                  ${include("description") ? `<td>${esc(item.description)}</td>` : ""}
                  ${include("brand") ? `<td>${esc(item.brand || "")}</td>` : ""}
                  ${include("uom") ? `<td class="c">NOS</td>` : ""}
                  ${include("qty") ? `<td class="c">${item.orderedQty || 0}</td>` : ""}
                  ${include("price") ? `<td class="r">${(item.unitPrice || 0).toLocaleString()}</td>` : ""}
                  ${include("amount") ? `<td class="r">${(item.lineTotal || 0).toLocaleString()}</td>` : ""}
                </tr>`,
            )
            .join("")
        : `<tr><td colspan="${visibleColumnCount}" class="c">No items</td></tr>`;

    const printHTML = `
      <html>
        <head>
          <title>Invoice ${esc(invoice.invoiceNo)}</title>
          <style>
            @page { size: A5 landscape; margin: 8mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }
            .page { width: 100%; }
            .row { display: flex; justify-content: space-between; align-items: flex-start; }
            .mt-8 { margin-top: 8px; }
            .muted { color: #444; }
            .title { font-weight: bold; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #444; padding: 3px 4px; font-size: 10px; vertical-align: top; }
            th { text-align: left; background: #f5f5f5; }
            .c { text-align: center; }
            .r { text-align: right; }
            .totals { width: 42%; margin-left: auto; margin-top: 0; }
            .totals td { border: none; border-bottom: 1px solid #aaa; }
            .totals tr:last-child td { border-bottom: 2px solid #000; font-weight: bold; }
            .amount-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
            .amount-words { flex: 1; font-size: 11px; padding-top: 2px; }
            .notes { margin-top: 10px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="page">
            <div style="text-align: center; margin-bottom: 6px;">
              <div style="font-weight: bold; font-size: 14px;">CRYSTAL TRADING COMPANY</div>
              <div style="font-size: 12px; color: #444; margin-top: 1px;">Sale Invoice</div>
            </div>
            <div class="row">
              <div>
                <div class="title">${esc(invoice.customerName || "Walk-in Customer")}</div>
                ${
                  invoice.customerType === "registered" && formattedAddressHtml
                    ? `<div class="muted">${formattedAddressHtml}</div>`
                    : ""
                }
                ${
                  invoice.customerType === "registered" && areaText
                    ? `<div class="muted">${areaText}</div>`
                    : ""
                }
              </div>
              <div class="r">
                <div>Print: ${esc(printDateTime)}</div>
                <div>Page 1 of 1</div>
                <div>${esc(invoice.invoiceNo)}</div>
                <div>Date: ${esc(dateText)}</div>
                ${
                  String(invoice.term || "").trim()
                    ? invoice.customerType === "registered"
                      ? `<div>Term: credit for ${esc(String(invoice.term || "").trim())} days</div>`
                      : `<div>Term: ${esc(String(invoice.term || "").trim())}</div>`
                    : ""
                }
                <div>User: ${esc(printedBy)}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  ${include("sr") ? '<th class="c">Sr#</th>' : ""}
                  ${include("partNo") ? "<th>Part No.</th>" : ""}
                  ${include("altPartNo") ? "<th>Alt. Part No.</th>" : ""}
                  ${include("description") ? "<th>Description</th>" : ""}
                  ${include("brand") ? "<th>Brand</th>" : ""}
                  ${include("uom") ? '<th class="c">UOM</th>' : ""}
                  ${include("qty") ? '<th class="c">Qty</th>' : ""}
                  ${include("price") ? '<th class="r">Price</th>' : ""}
                  ${include("amount") ? '<th class="r">Amount</th>' : ""}
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr>
                  ${
                    include("qty")
                      ? `<td colspan="${Math.max(
                          1,
                          (include("sr") ? 1 : 0) +
                            (include("partNo") ? 1 : 0) +
                            (include("altPartNo") ? 1 : 0) +
                            (include("description") ? 1 : 0) +
                            (include("brand") ? 1 : 0) +
                            (include("uom") ? 1 : 0),
                        )}" class="r"><b>Total</b></td>
                         <td class="c"><b>${totalQty}</b></td>`
                      : `<td colspan="${Math.max(
                          1,
                          (include("sr") ? 1 : 0) +
                            (include("partNo") ? 1 : 0) +
                            (include("altPartNo") ? 1 : 0) +
                            (include("description") ? 1 : 0) +
                            (include("brand") ? 1 : 0) +
                            (include("uom") ? 1 : 0),
                        )}" class="r"><b>Total</b></td>`
                  }
                  ${include("price") ? "<td></td>" : ""}
                  ${
                    include("amount")
                      ? `<td class="r"><b>${baseTotal.toLocaleString()}</b></td>`
                      : ""
                  }
                </tr>
              </tbody>
            </table>

            <div class="amount-row">
              <div class="amount-words" style="margin-top:${amountWordsOffsetPx}px;"><b>Rupees:-</b> (${esc(currentAmountWords)} Only.)</div>
              <table class="totals">
                ${
                  discountAmount > 0
                    ? `<tr><td>Discount</td><td class="r">- ${discountAmount.toLocaleString()}</td></tr>`
                    : ""
                }
                ${
                  taxAmount > 0
                    ? `<tr><td>GST ${taxPercentageStored > 0 ? `@ ${taxPercentageStored}%` : ""}</td><td class="r">${taxAmount.toLocaleString()}</td></tr>`
                    : ""
                }
                <tr><td>Current Amount</td><td class="r">${currentAmount.toLocaleString()}</td></tr>
                <tr><td>Bal. B/F</td><td class="r">${balBf.toLocaleString()}</td></tr>
                <tr><td>Total Receivable</td><td class="r">${totalReceivable.toLocaleString()}</td></tr>
              </table>
            </div>

            <div class="notes">
              <div><b>Delivered to:</b> ${esc(invoiceMeta.deliveredTo || "-")}</div>
              <div><b>Remarks:</b> ${esc(invoiceMeta.remarks || "-")}</div>
              <div style="margin-top:8px;">
                <b>Note:-</b> All manufacturer's Names, Numbers, Symbols and Descriptions are used for reference only.
                Document invalid without authorised signature and stamp.
              </div>
              <div style="margin-top:6px;">
                Parts sold may be Exchanged/returned same day only.
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    // Use hidden iframe printing to avoid opening a separate tab/window.
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.setAttribute("aria-hidden", "true");
    document.body.appendChild(printFrame);

    const cleanup = () => {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
        window.focus();
      }, 200);
    };

    printFrame.onload = () => {
      const frameWindow = printFrame.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }
      frameWindow.onafterprint = cleanup;
      setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
      }, 100);
      // Fallback for browsers that don't fire onafterprint reliably.
      setTimeout(cleanup, 3000);
    };

    printFrame.srcdoc = printHTML;
  };

  const handlePrintDeliveryChallan = async (invoice: Invoice) => {
    try {
      const response = (await apiClient.getSalesInvoice(invoice.id)) as any;
      const fullInvoice = response?.data || response;
      const rawItems = fullInvoice?.SalesInvoiceItem || [];

      const getPrintedBy = () => {
        try {
          const token = localStorage.getItem("authToken");
          if (!token) return "Unknown User";
          const parts = token.split(".");
          if (parts.length < 2) return "Unknown User";
          const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
          const payload = JSON.parse(atob(padded));
          return (
            payload?.name ||
            payload?.username ||
            payload?.fullName ||
            payload?.userName ||
            payload?.email ||
            payload?.sub ||
            "Unknown User"
          );
        } catch {
          return "Unknown User";
        }
      };

      const challanNo = `CH-${fullInvoice?.invoiceNo || invoice.invoiceNo}`;
      const challanItems = (rawItems as any[]).map((item) => {
        const selectedLocations = Array.isArray(item.InvoiceRackShelf)
          ? item.InvoiceRackShelf
          : [];
        const locationText = selectedLocations.length
          ? selectedLocations
              .map((loc: any) => {
                const rack =
                  loc?.Rack?.code ||
                  loc?.Rack?.codeNo ||
                  loc?.Rack?.rackCode ||
                  loc?.rackCode ||
                  "-";
                const shelf =
                  loc?.Shelf?.shelfNo || loc?.Shelf?.name || loc?.shelfNo || "-";
                return `${rack}-${shelf}`;
              })
              .join(", ")
          : "-";

        return {
          partNo: item.partNo || "-",
          ssPartNo: item?.Part?.masterPartNo || item.partNo || "-",
          description: item.description || "",
          brand: item.brand || item?.Part?.Brand?.name || "",
          uom: "NOS",
          qty: Number(item.orderedQty || 0),
          deliveredQty: Number(item.deliveredQty || 0),
          pendingQty: Number(item.pendingQty || 0),
          location: locationText,
          weight: Number(item?.Part?.weight || 0),
        };
      });

      printDeliveryChallan({
        challanNo,
        invoiceNo: fullInvoice?.invoiceNo || invoice.invoiceNo,
        invoiceDate: fullInvoice?.invoiceDate || invoice.invoiceDate,
        customerName: fullInvoice?.customerName || invoice.customerName,
        deliveredTo: fullInvoice?.deliveredTo || "",
        status: fullInvoice?.status || invoice.status,
        userName: getPrintedBy(),
        items: challanItems,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to print delivery challan",
        variant: "destructive",
      });
    }
  };

  const openSalesInvoicePrintDialog = async (invoice: Invoice) => {
    try {
      const resp = (await apiClient.getSalesInvoice(invoice.id)) as any;
      const fullInv = resp?.data || resp;
      setInvoiceForPrint({
        ...invoice,
        taxPercentage:
          fullInv?.taxPercentage != null
            ? Number(fullInv.taxPercentage)
            : invoice.taxPercentage,
        tax: fullInv?.tax != null ? Number(fullInv.tax) : invoice.tax,
        subtotal:
          fullInv?.subtotal != null ? Number(fullInv.subtotal) : invoice.subtotal,
        grandTotal:
          fullInv?.grandTotal != null
            ? Number(fullInv.grandTotal)
            : invoice.grandTotal,
        overallDiscount:
          fullInv?.overallDiscount != null
            ? Number(fullInv.overallDiscount)
            : invoice.overallDiscount,
      });
    } catch {
      setInvoiceForPrint(invoice);
    } finally {
      setShowInvoicePrintColumnsDialog(true);
    }
  };

  const getStatusLabel = (status: InvoiceStatus): string => {
    const labels: Record<InvoiceStatus, string> = {
      pending: "Pending",
      on_hold: "On Hold",
      approved: "Approved",
      partially_delivered: "Partially Delivered",
      partially_delivered_reversed: "Partially Delivered Reverse",
      delivered: "Delivered",
      cancelled: "Cancelled",
      fully_delivered: "Fully Delivered",
    };
    return labels[status] ?? status;
  };

  const formatInvoiceDateDisplay = (value?: string) => {
    if (!value) return "-";
    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      return `${d}/${m}/${y.slice(-2)}`;
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    const day = String(dt.getDate()).padStart(2, "0");
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const year = String(dt.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const getStatusBadge = (status: InvoiceStatus | string) => {
    const styles: Record<string, string> = {
      pending: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      on_hold: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      approved: "bg-indigo-600/10 text-indigo-700 border-indigo-600/20",
      partially_delivered:
        "bg-orange-500/10 text-orange-600 border-orange-500/20",
      partially_delivered_reversed:
        "bg-red-500/10 text-red-600 border-red-500/20",
      delivered: "bg-green-500/10 text-green-600 border-green-500/20",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      on_hold: "On Hold",
      approved: "Approved",
      partially_delivered: "Partially Delivered",
      partially_delivered_reversed: "Partially Delivered Reverse",
      delivered: "Delivered",
    };

    const style =
      styles[status] || "bg-gray-500/10 text-gray-600 border-gray-500/20";
    const label = labels[status] || status;

    return (
      <Badge variant="outline" className={style}>
        {label}
      </Badge>
    );
  };

  const getPaymentBadge = (status: "unpaid" | "partial" | "paid") => {
    const styles = {
      unpaid: "bg-red-500/10 text-red-600 border-red-500/20",
      partial: "bg-orange-500/10 text-orange-600 border-orange-500/20",
      paid: "bg-green-500/10 text-green-600 border-green-500/20",
    };
    return (
      <Badge variant="outline" className={styles[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getGradeColor = (grade: ItemGrade) => {
    switch (grade) {
      case "A":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "B":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "C":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "D":
        return "bg-red-500/10 text-red-600 border-red-500/20";
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Manage your sales invoices and inventory movements.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant="outline"
            size="icon"
            onClick={refreshPartsData}
            title="Refresh Stock Data"
            disabled={partsLoading}
            className={
              partsLoading ? "animate-spin flex-shrink-0" : "flex-shrink-0"
            }
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => {
              setInvoiceDate(new Date().toISOString().split("T")[0]);
              setShowNewInvoice(true);
            }}
            className="gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </Button>
        </div>
      </div>

      {!showNewInvoice && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {totalInvoices}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total Invoices
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      Rs {totalReceived.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Received</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <DollarSign className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      Rs {totalReceivable.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Receivable</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Truck className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {pendingDelivery}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pending Delivery
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/10 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {onHoldCount}
                    </p>
                    <p className="text-xs text-muted-foreground">On Hold</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by invoice number or customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="w-full sm:w-56 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Brand
                  </Label>
                  <SearchableSelect
                    options={brandFilterOptions}
                    value={filterBrandId}
                    onValueChange={setFilterBrandId}
                    placeholder="All brands"
                    className="w-full"
                  />
                </div>
                <div className="w-full sm:min-w-[280px] sm:max-w-md space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Item (part no · master)
                  </Label>
                  <SearchableSelect
                    options={itemFilterOptions}
                    value={filterPartId}
                    onValueChange={setFilterPartId}
                    placeholder="All items"
                    className="w-full"
                    disabled={partsLoading && parts.length === 0}
                  />
                </div>
                <Select
                  value={filterCustomerType}
                  onValueChange={setFilterCustomerType}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Customer Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="walking">Cash Sale</SelectItem>
                    <SelectItem value="registered">Party Sale</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="partially_delivered">
                      Partially Delivered
                    </SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterInvoiceKind}
                  onValueChange={setFilterInvoiceKind}
                >
                  <SelectTrigger className="w-full sm:w-[11.5rem]">
                    <SelectValue placeholder="Invoice type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All invoices</SelectItem>
                    <SelectItem value="simple">Simple (no tax, no discount)</SelectItem>
                    <SelectItem value="with_tax">With tax (GST)</SelectItem>
                    <SelectItem value="with_discount">With discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* New Invoice Inline Form OR Invoices Table */}
      {showNewInvoice ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                {editingInvoiceId ? "Edit Invoice" : "Create New Invoice"}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-8 p-6">
            {/* Customer & Order Logistics Section */}
            <div className="bg-primary/5 rounded-xl p-5 border border-primary/10">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-primary/80 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" /> Customer & Delivery Info
              </h3>
              <div className="flex flex-wrap gap-3 items-start">
                <div className="space-y-1.5 w-40">
                  <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                    Sale Type
                  </Label>
                  <Select
                    value={newInvoice.customerType}
                    onValueChange={(v) => {
                      const customerType = v as CustomerType;
                      setNewInvoice((prev) => ({ ...prev, customerType }));
                      // Reset customer selections when switching
                      setSelectedCustomerId("");
                      setSelectedCustomerName("");
                      setCustomerPriceType(null);
                      setSelectedCustomerCategory(null);
                    }}
                  >
                    <SelectTrigger className="bg-background border-primary/20 hover:border-primary/40 focus:ring-primary/30 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="registered">
                        Party Sale (Credit)
                      </SelectItem>
                      <SelectItem value="walking">
                        Cash Sale (Walk-in)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Customer Name Input - Only show for Cash Sale (walking) */}
                {newInvoice.customerType === "walking" && (
                  <div className="space-y-1.5 w-56">
                    <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                      Customer Name
                    </Label>
                    <Input
                      placeholder=""
                      value={newInvoice.customerName || ""}
                      onChange={(e) =>
                        setNewInvoice((prev) => ({
                          ...prev,
                          customerName: e.target.value,
                        }))
                      }
                      className="bg-background border-primary/20 h-9 text-sm"
                    />
                  </div>
                )}

                {/* Customer Dropdown - Only show for Party Sale (registered) */}
                {newInvoice.customerType === "registered" && (
                  <div className="space-y-1.5 w-85">
                    <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                      Select Customer
                    </Label>
                    <div className="flex gap-2">
                      <SearchableSelect
                        options={customers.map((customer) => ({
                          value: customer.id,
                          label: customer.priceType
                            ? `${customer.name} (Price ${customer.priceType})`
                            : customer.name,
                        }))}
                        value={selectedCustomerId || ""}
                        onValueChange={(value) => {
                          setSelectedCustomerId(value);
                          const customer = customers.find(
                            (c) => c.id === value,
                          );
                          if (customer) {
                            setSelectedCustomerName(customer.name);
                            const pt = customer.priceType || null;
                            setCustomerPriceType(pt);
                            setSelectedCustomerCategory(
                              customer.category || null,
                            );
                            // Auto-apply price type to all existing inline items
                            if (pt) {
                              setInlineItems((prev) =>
                                prev.map((item) => {
                                  if (!item.selectedPartId) return item;
                                  return { ...item, selectedPriceType: pt };
                                }),
                              );
                            }
                          }
                        }}
                        disabled={loadingCustomers}
                        placeholder={
                          loadingCustomers
                            ? "Loading..."
                            : customers.length === 0
                              ? "No customers available"
                              : "Search customer..."
                        }
                        className="flex-1 h-9"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowAddCustomerDialog(true)}
                        title="Add New Customer"
                        className="shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* Show Previous Balance and Credit Limit */}
                    {selectedCustomerId &&
                      (() => {
                        const customer = customers.find(
                          (c) => c.id === selectedCustomerId,
                        );
                        if (!customer) return null;
                        return (
                          <div className="text-xs flex flex-row gap-4 mt-1 bg-muted/50 p-2 rounded-md items-center shadow-sm border border-border/50">
                            <div>
                              <span className="text-muted-foreground font-medium mr-1 tracking-tight">
                                Previous Balance:
                              </span>
                              <span
                                className={`font-semibold tracking-tight ${customer.balance && customer.balance > 0 ? "text-red-600" : "text-emerald-600"}`}
                              >
                                Rs {customer.balance?.toFixed(2) || "0.00"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[11px] bg-background/50 py-1 px-2 rounded border border-border/40">
                              <span className="text-muted-foreground uppercase tracking-wider font-semibold">
                                Credit Limit:
                              </span>
                              <span className="font-bold">
                                {customer.creditLimit &&
                                customer.creditLimit > 0
                                  ? `Rs ${customer.creditLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : "Unlimited"}
                              </span>
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-[10px] text-blue-600 hover:text-blue-800 flex items-center"
                                onClick={() => {
                                  setEditingCreditLimit(
                                    customer.creditLimit || 0,
                                  );
                                  setShowEditCreditLimitDialog(true);
                                }}
                              >
                                (EDIT)
                              </Button>
                              <label className="flex items-center gap-1 ml-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={overrideCreditLimit}
                                  onChange={(e) =>
                                    setOverrideCreditLimit(e.target.checked)
                                  }
                                />
                                <span className="text-[10px] text-amber-700 font-semibold">
                                  Allow over credit limit
                                </span>
                              </label>
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                )}

                <div className="space-y-1.5 w-36">
                  <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                    Tax Type
                  </Label>
                  <Select value={taxType} onValueChange={setTaxType}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Without GST">Without GST</SelectItem>
                      <SelectItem value="With GST">With GST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {taxType === "With GST" && (
                  <div className="space-y-1.5 w-44">
                    <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                      GST Percentage
                    </Label>
                    {newInvoice.customerType === "walking" ? (
                      /* Walk-in (Cash Sale): Show only Custom Input, no buttons/dropdown */
                      <div className="flex-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder=""
                          value={customGstPercentage}
                          onChange={(e) =>
                            setCustomGstPercentage(e.target.value)
                          }
                          className="h-9 text-xs font-medium w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    ) : /* Registered (Party Sale): Toggle between Preset and Custom */
                    !useCustomGst ? (
                      <div className="flex gap-3">
                        <Select
                          value={gstPercentage.toString()}
                          onValueChange={(value) => {
                            setGstPercentage(parseFloat(value) || 0);
                            setUseCustomGst(false);
                          }}
                        >
                          <SelectTrigger className="flex-1 h-9 text-sm">
                            <SelectValue placeholder="Select GST %" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="18">18%</SelectItem>
                            <SelectItem value="22">22%</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setUseCustomGst(true);
                            if (gstPercentage > 0) {
                              setCustomGstPercentage(gstPercentage.toString());
                            }
                          }}
                          className="h-9 text-sm font-medium whitespace-nowrap px-5 min-w-[85px]"
                        >
                          Custom
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder=""
                            value={customGstPercentage}
                            onChange={(e) =>
                              setCustomGstPercentage(e.target.value)
                            }
                            className="h-9 text-xs font-medium w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setUseCustomGst(false);
                            setCustomGstPercentage("");
                          }}
                          className="h-9 text-sm font-medium whitespace-nowrap px-5 min-w-[85px]"
                        >
                          Preset
                        </Button>
                      </div>
                    )}
                    <p className="text-xs font-medium text-muted-foreground mt-1">
                      GST Amount: Rs {calculateTax().toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Invoice Date */}
                <div className="space-y-1.5 w-56">
                  <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                    Invoice Date
                  </Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="bg-background border-primary/20 h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Items Section - Inline Table Like Reference */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => handleAddNewItem()}
                  className="gap-2 bg-primary"
                >
                  <Plus className="w-4 h-4" />
                  Add New Item
                </Button>
                <span className="text-xs text-muted-foreground">
                  Shortcut: <span className="font-semibold">Alt + Z</span>
                </span>
                <div className="ml-0 md:ml-3 flex flex-wrap items-center gap-2">
                  <SearchableSelect
                    options={searchableModelFilterOptions}
                    value={partsModelFilter || "__all__"}
                    onValueChange={(value) =>
                      setPartsModelFilter(value === "__all__" ? "" : value)
                    }
                    placeholder="Model"
                    className="min-w-[180px]"
                  />
                  <SearchableSelect
                    options={searchableDescriptionFilterOptions}
                    value={partsDescriptionFilter || "__all__"}
                    onValueChange={(value) =>
                      setPartsDescriptionFilter(value === "__all__" ? "" : value)
                    }
                    placeholder="Description"
                    className="min-w-[200px]"
                  />
                  <SearchableSelect
                    options={searchableApplicationFilterOptions}
                    value={partsApplicationFilter || "__all__"}
                    onValueChange={(value) =>
                      setPartsApplicationFilter(value === "__all__" ? "" : value)
                    }
                    placeholder="Application"
                    className="min-w-[190px]"
                  />
                </div>
              </div>

              {inlineItems.length > 0 && (
                <div className="border rounded-lg overflow-x-auto shadow-sm">
                  <Table>
                    <TableHeader className="hidden md:table-header-group bg-muted/50">
                      <TableRow className="border-b">
                        <TableHead className="w-[380px] font-bold text-foreground">
                          Part Details
                        </TableHead>
                        <TableHead className="w-[130px] text-center font-bold text-foreground">
                          Brand
                        </TableHead>
                        <TableHead
                          className="w-[100px] text-center font-bold text-foreground select-none"
                          onClick={() => setShowLastSaleInfo((prev) => !prev)}
                        >
                          In Stock
                        </TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-foreground">
                          Reserved
                        </TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-foreground">
                          Available
                        </TableHead>
                        <TableHead className="w-[110px] text-center font-bold text-foreground">
                          Qty
                        </TableHead>
                        <TableHead className="w-[110px] text-center font-bold text-foreground">
                          Assoc. Prices
                        </TableHead>
                        <TableHead className="w-[110px] text-center font-bold text-foreground">
                          Price
                        </TableHead>
                        <TableHead className="w-[110px] text-center font-bold text-foreground">
                          Total
                        </TableHead>
                        <TableHead className="w-[60px] text-center font-bold text-foreground">
                          Action
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inlineItems.map((item) => {
                        const part = getPartForItem(item.selectedPartId);
                        return (
                          <TableRow
                            key={item.id}
                            className="flex flex-col md:table-row border-b md:border-b-0 p-4 md:p-0 space-y-4 md:space-y-0 relative"
                          >
                            <TableCell className="md:table-cell block p-0 md:p-4 align-middle">
                              <span className="md:hidden text-xs font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                                Part Details
                              </span>
                              <div className="space-y-2">
                                <div className="relative">
                                  <Input
                                    ref={(el) => {
                                      if (el) inputRefs.current[item.id] = el;
                                    }}
                                    placeholder="Select part..."
                                    value={(() => {
                                      // If user is typing (search term exists and is not empty), show search term
                                      const searchValue =
                                        partsSearchTerm[item.id];
                                      if (
                                        searchValue !== undefined &&
                                        searchValue !== ""
                                      ) {
                                        return searchValue;
                                      }

                                      // Otherwise, if a part is selected, show the part name
                                      if (item.selectedPartId) {
                                        const selectedPart = getPartForItem(
                                          item.selectedPartId,
                                        );
                                        if (selectedPart) {
                                          const partNo =
                                            selectedPart.partNo || "";
                                          const masterPartNo =
                                            selectedPart.masterPartNo || "";
                                          const description =
                                            selectedPart.description || "";
                                          const brandName =
                                            selectedPart.brands?.[0]?.name ||
                                            "";
                                          const partLabel =
                                            masterPartNo &&
                                            masterPartNo !== partNo
                                              ? `${masterPartNo} | ${partNo}`
                                              : partNo;
                                          const baseLabel = description
                                            ? `${partLabel} - ${description}`
                                            : partLabel;
                                          return brandName
                                            ? `${baseLabel} (${brandName})`
                                            : baseLabel;
                                        }

                                        // Fallback if parts didn't load yet but we have data from Edit
                                        if (item.partNoFallback) {
                                          const partNo = item.partNoFallback;
                                          const description =
                                            item.descriptionFallback || "";
                                          // Note: we don't have brand fallback currently, so we just use the existing logic
                                          return description
                                            ? `${partNo} - ${description}`
                                            : partNo;
                                        }
                                      }

                                      // Otherwise, show empty (placeholder will show)
                                      return "";
                                    })()}
                                    onClick={(e) => {
                                      // Always show dropdown when clicking on input
                                      e.stopPropagation();
                                      const input = inputRefs.current[item.id];
                                      if (input) {
                                        const rect =
                                          input.getBoundingClientRect();
                                        setDropdownPosition((prev) => ({
                                          ...prev,
                                          [item.id]: {
                                            top:
                                              rect.bottom + window.scrollY + 4,
                                            left: rect.left + window.scrollX,
                                            width: rect.width,
                                          },
                                        }));
                                        // Clear the input to allow searching
                                        if (
                                          item.selectedPartId &&
                                          !partsSearchTerm[item.id]
                                        ) {
                                          input.select();
                                          setPartsSearchTerm((prev) => ({
                                            ...prev,
                                            [item.id]: "",
                                          }));
                                        }
                                      }
                                      setShowPartsDropdown((prev) => ({
                                        ...prev,
                                        [item.id]: true,
                                      }));
                                      // Load parts when dropdown opens (if not already loaded)
                                      if (!hasFetchedInitialPartsRef.current) {
                                        fetchParts("", true);
                                      }
                                    }}
                                    onChange={(e) => {
                                      const searchValue = e.target.value;
                                      setPartsSearchTerm((prev) => ({
                                        ...prev,
                                        [item.id]: searchValue,
                                      }));

                                      // Clear selected part when user starts typing
                                      if (
                                        searchValue.length > 0 &&
                                        item.selectedPartId
                                      ) {
                                        handleUpdateInlineItem(
                                          item.id,
                                          "selectedPartId",
                                          "",
                                        );
                                      }

                                      // Calculate position
                                      const input = inputRefs.current[item.id];
                                      if (input) {
                                        const rect =
                                          input.getBoundingClientRect();
                                        setDropdownPosition((prev) => ({
                                          ...prev,
                                          [item.id]: {
                                            top:
                                              rect.bottom + window.scrollY + 4,
                                            left: rect.left + window.scrollX,
                                            width: rect.width,
                                          },
                                        }));
                                      }

                                      setShowPartsDropdown((prev) => ({
                                        ...prev,
                                        [item.id]: true,
                                      }));

                                      // Clear existing debounce timer for this item
                                      if (
                                        partsSearchDebounceRef.current[item.id]
                                      ) {
                                        clearTimeout(
                                          partsSearchDebounceRef.current[
                                            item.id
                                          ],
                                        );
                                      }

                                      // Server-side search with debounce
                                      partsSearchDebounceRef.current[item.id] =
                                        setTimeout(() => {
                                          if (searchValue.trim().length > 0) {
                                            fetchParts(searchValue.trim());
                                          } else {
                                            // Reset to all parts when clearing search
                                            fetchParts("", false, true);
                                          }
                                        }, 400);

                                      // Client-side filtering still provides instant feedback
                                      // but the server-side call above will refresh 'parts' list with fresh data from DB
                                    }}
                                    onKeyDown={(e) => {
                                      // Allow all key inputs including backspace
                                      if (e.key === "Escape") {
                                        setShowPartsDropdown((prev) => ({
                                          ...prev,
                                          [item.id]: false,
                                        }));
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        // Select first result if available
                                        if (parts.length > 0) {
                                          const filteredParts =
                                            getFilteredPartsForInlineRow(item.id);
                                          if (filteredParts.length > 0) {
                                            handleUpdateInlineItem(
                                              item.id,
                                              "selectedPartId",
                                              filteredParts[0].id,
                                            );
                                            setPartsSearchTerm((prev) => ({
                                              ...prev,
                                              [item.id]: "",
                                            }));
                                            setShowPartsDropdown((prev) => ({
                                              ...prev,
                                              [item.id]: false,
                                            }));
                                          }
                                        }
                                      }
                                      // Don't prevent default for other keys (like Backspace)
                                    }}
                                    onFocus={() => {
                                      const input = inputRefs.current[item.id];
                                      if (input) {
                                        const rect =
                                          input.getBoundingClientRect();
                                        setDropdownPosition((prev) => ({
                                          ...prev,
                                          [item.id]: {
                                            top:
                                              rect.bottom + window.scrollY + 4,
                                            left: rect.left + window.scrollX,
                                            width: rect.width,
                                          },
                                        }));
                                      }
                                      setShowPartsDropdown((prev) => ({
                                        ...prev,
                                        [item.id]: true,
                                      }));
                                      // Load parts when dropdown opens (if not already loaded)
                                      if (parts.length === 0) {
                                        fetchParts("", true);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      // If we're clicking on the dropdown, don't close it
                                      if (isClickingDropdown.current[item.id]) {
                                        isClickingDropdown.current[item.id] =
                                          false;
                                        return;
                                      }

                                      // Delay to allow click on dropdown item
                                      setTimeout(() => {
                                        // Only close if we're not clicking on dropdown
                                        if (
                                          !isClickingDropdown.current[item.id]
                                        ) {
                                          setShowPartsDropdown((prev) => ({
                                            ...prev,
                                            [item.id]: false,
                                          }));
                                          // Clear search term if part is selected
                                          if (item.selectedPartId) {
                                            setPartsSearchTerm((prev) => ({
                                              ...prev,
                                              [item.id]: "",
                                            }));
                                          }
                                        }
                                      }, 200);
                                    }}
                                    className="w-full"
                                  />
                                  {showLastSaleInfo &&
                                    item.selectedPartId && (
                                      <div className="mt-1 text-[10px] text-muted-foreground flex flex-col gap-1.5">
                                        <div className="flex flex-col gap-1">
                                          <span className="font-semibold">
                                            Last 3 sales (invoices)
                                          </span>
                                          {loadingRecentSalesByPartId[
                                            item.selectedPartId
                                          ] ? (
                                            <span>Loading…</span>
                                          ) : (recentSalesByPartId[
                                                item.selectedPartId
                                              ]?.length ?? 0) > 0 ? (
                                            <ul className="list-none space-y-0.5 m-0 p-0">
                                              {recentSalesByPartId[
                                                item.selectedPartId
                                              ]!.map((row, idx) => (
                                                <li
                                                  key={`${row.invoiceNo}-${idx}`}
                                                >
                                                  #{row.invoiceNo} ·{" "}
                                                  {formatInvoiceDateDisplay(
                                                    row.invoiceDate,
                                                  )}
                                                  {row.qty != null
                                                    ? ` · ${row.qty} pcs`
                                                    : ""}
                                                  {row.unitPrice != null
                                                    ? ` @ Rs ${row.unitPrice.toFixed(2)}`
                                                    : ""}
                                                  {row.customerName
                                                    ? ` · ${row.customerName}`
                                                    : ""}
                                                </li>
                                              ))}
                                            </ul>
                                          ) : part &&
                                            (part.lastSalePrice ||
                                              part.lastSaleQty ||
                                              part.lastSaleCustomerName) ? (
                                            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                                              <span>Summary:</span>
                                              <span>
                                                {part.lastSaleQty
                                                  ? `${part.lastSaleQty} pcs`
                                                  : ""}
                                                {part.lastSaleQty &&
                                                (part.lastSalePrice ||
                                                  part.lastSaleCustomerName)
                                                  ? " "
                                                  : ""}
                                                {part.lastSalePrice
                                                  ? `@ Rs ${part.lastSalePrice.toFixed(2)}`
                                                  : ""}
                                                {part.lastSaleCustomerName
                                                  ? ` · ${part.lastSaleCustomerName}`
                                                  : ""}
                                              </span>
                                            </div>
                                          ) : (
                                            <span>
                                              No sales invoices on record for
                                              this part
                                            </span>
                                          )}
                                        </div>

                                        <div>
                                          {part?.machineModels &&
                                          part.machineModels.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                              {part.machineModels.map((m) => (
                                                <span
                                                  key={m.id}
                                                  className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-muted/30 border border-border/60"
                                                >
                                                  <span className="font-semibold">
                                                    {m.name}
                                                  </span>
                                                  {m.requiredQty ? (
                                                    <span className="text-muted-foreground/80">
                                                      (Req: {m.requiredQty} pcs)
                                                    </span>
                                                  ) : null}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            <span>
                                              {loadingModels[item.selectedPartId]
                                                ? "Loading models..."
                                                : "No machine models"}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  {item.selectedPartId && (
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {part?.brands?.[0]?.name && (
                                        <Badge
                                          variant="secondary"
                                          className="px-1 py-0 h-4 text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-black hover:bg-primary/20 transition-colors"
                                        >
                                          {part.brands[0].name}
                                        </Badge>
                                      )}
                                      {part?.category && (
                                        <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">
                                          {part.category}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {showPartsDropdown[item.id] &&
                                    typeof window !== "undefined" &&
                                    dropdownPosition[item.id] &&
                                    createPortal(
                                      <div
                                        ref={(el) => {
                                          if (el)
                                            dropdownRefs.current[item.id] = el;
                                        }}
                                        className="fixed z-[9999] bg-card border border-border rounded-md shadow-lg max-h-80 overflow-auto"
                                        data-dropdown-item
                                        style={{
                                          top: `${dropdownPosition[item.id].top}px`,
                                          left: `${dropdownPosition[item.id].left}px`,
                                          width: `${dropdownPosition[item.id].width}px`,
                                        }}
                                        onMouseDown={(e) => {
                                          // Mark that we're clicking on dropdown
                                          isClickingDropdown.current[item.id] =
                                            true;
                                          // Prevent blur when clicking inside dropdown
                                          e.preventDefault();
                                        }}
                                      >
                                        {partsLoading ? (
                                          <div className="px-3 py-2 text-sm text-muted-foreground">
                                            Loading parts...
                                          </div>
                                        ) : (
                                          <>
                                            {(() => {
                                              const filteredParts =
                                                getFilteredPartsForInlineRow(
                                                  item.id,
                                                );

                                              return filteredParts.length >
                                                0 ? (
                                                <>
                                                  {filteredParts.map((p) => (
                                                    <div
                                                      key={p.id}
                                                      data-dropdown-item
                                                      className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer border-b border-border last:border-b-0 transition-colors"
                                                      onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        // Mark that we're clicking on dropdown
                                                        isClickingDropdown.current[
                                                          item.id
                                                        ] = true;

                                                        // Clear search term first to ensure input shows selected part
                                                        setPartsSearchTerm(
                                                          (prev) => {
                                                            const updated = {
                                                              ...prev,
                                                            };
                                                            delete updated[
                                                              item.id
                                                            ];
                                                            return updated;
                                                          },
                                                        );

                                                        // Then update the selection
                                                        handleUpdateInlineItem(
                                                          item.id,
                                                          "selectedPartId",
                                                          p.id,
                                                        );

                                                        setShowPartsDropdown(
                                                          (prev) => ({
                                                            ...prev,
                                                            [item.id]: false,
                                                          }),
                                                        );
                                                        // Reset flag after a short delay
                                                        setTimeout(() => {
                                                          isClickingDropdown.current[
                                                            item.id
                                                          ] = false;
                                                        }, 100);
                                                      }}
                                                    >
                                                      <div className="flex items-center justify-between gap-2">
                                                        <div className="font-medium">
                                                          {p.masterPartNo &&
                                                          p.masterPartNo !==
                                                            p.partNo
                                                            ? `${p.masterPartNo} | ${p.partNo}`
                                                            : p.partNo}
                                                        </div>
                                                        <span
                                                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                            (p.availableQty ??
                                                              p.stockQty ??
                                                              0) > 0
                                                              ? "bg-green-100 text-green-700"
                                                              : "bg-red-100 text-red-600"
                                                          }`}
                                                        >
                                                          {p.availableQty ??
                                                            p.stockQty ??
                                                            0}{" "}
                                                          pcs
                                                        </span>
                                                      </div>
                                                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                        {p.description ||
                                                          "No description available"}
                                                      </div>
                                                      {p.category && (
                                                        <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                                                          {p.category}
                                                        </div>
                                                      )}
                                                      {p.application && (
                                                        <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                                                          App: {p.application}
                                                        </div>
                                                      )}
                                                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                                        {p.brands &&
                                                          p.brands.length >
                                                            0 && (
                                                            <div className="text-[10px] uppercase font-semibold text-black tracking-wider">
                                                              {p.brands
                                                                .map(
                                                                  (b) => b.name,
                                                                )
                                                                .join(", ")}
                                                            </div>
                                                          )}
                                                        {(p.priceA !== null ||
                                                          p.priceB !==
                                                            null) && (
                                                          <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600">
                                                            {p.priceA !==
                                                              null && (
                                                              <span className="bg-blue-50 px-1 rounded border border-blue-100 italic">
                                                                A:{" "}
                                                                {Number(
                                                                  p.priceA,
                                                                ).toLocaleString()}
                                                              </span>
                                                            )}
                                                            {p.priceB !==
                                                              null && (
                                                              <span className="bg-indigo-50 px-1 rounded border border-indigo-100 italic">
                                                                B:{" "}
                                                                {Number(
                                                                  p.priceB,
                                                                ).toLocaleString()}
                                                              </span>
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </>
                                              ) : (
                                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                                  {(partsSearchTerm[item.id] || "").trim()
                                                    ? "No parts found matching your search"
                                                    : "No parts available"}
                                                </div>
                                              );
                                            })()}
                                          </>
                                        )}
                                      </div>,
                                      document.body,
                                    )}
                                </div>
                                {!item.selectedPartId && (
                                  <p className="text-destructive text-xs">
                                    Required
                                  </p>
                                )}
                              </div>
                            </TableCell>

                            {/* Column 4: Brand (Desktop ONLY) */}
                            <TableCell className="hidden md:table-cell text-center align-middle">
                              <span className="text-xs font-medium text-foreground">
                                {part?.brands?.[0]?.name || "-"}
                              </span>
                            </TableCell>

                            {/* Column 4: In Stock (Desktop ONLY, Mobile combined in section below) */}
                            <TableCell className="hidden md:table-cell text-center align-middle">
                              {(() => {
                                const stockBalance =
                                  partStockBalances[item.selectedPartId];
                                const currentStock =
                                  stockBalance?.current_stock ??
                                  (part?.stockQty || 0);
                                const avgCost =
                                  stockBalance?.avg_cost ?? (part?.price || 0);
                                const isLoading =
                                  loadingStock[item.selectedPartId];
                                return (
                                  <div className="flex flex-col items-center justify-center">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`text-sm font-bold ${currentStock > 0 ? "text-foreground" : "text-muted-foreground"}`}
                                      >
                                        {isLoading ? "..." : currentStock}
                                      </span>
                                      {part?.id && (
                                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                                      )}
                                    </div>
                                    {showLastSaleInfo && (
                                      <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded whitespace-nowrap mt-1">
                                        Cost: {avgCost.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>

                            {/* Column 5: Reserved (Desktop ONLY) */}
                            <TableCell className="hidden md:table-cell text-center align-middle">
                              {(() => {
                                const stockBalance =
                                  partStockBalances[item.selectedPartId];
                                const reservedStock =
                                  stockBalance?.reserved_stock ??
                                  (part?.reservedQty || 0);
                                const isLoading =
                                  loadingStock[item.selectedPartId];
                                return (
                                  <span className="text-sm font-semibold text-orange-600">
                                    {isLoading ? "..." : reservedStock}
                                  </span>
                                );
                              })()}
                            </TableCell>

                            {/* Column 6: Available (Desktop ONLY) */}
                            <TableCell className="hidden md:table-cell text-center align-middle">
                              {(() => {
                                const stockBalance =
                                  partStockBalances[item.selectedPartId];
                                const inStock =
                                  stockBalance?.current_stock ??
                                  (part?.stockQty || 0);
                                const reserved =
                                  stockBalance?.reserved_stock ??
                                  (part?.reservedQty || 0);
                                const available = stockBalance
                                  ? Math.max(0, inStock - reserved)
                                  : Math.max(0, part?.availableQty ?? 0);
                                const isLoading =
                                  loadingStock[item.selectedPartId];
                                return isLoading ? (
                                  <span className="text-xs text-muted-foreground">
                                    ...
                                  </span>
                                ) : (
                                  <Badge
                                    variant={
                                      available > 0 ? "default" : "destructive"
                                    }
                                    className="px-2 py-0.5 font-bold h-fit"
                                  >
                                    {available}
                                  </Badge>
                                );
                              })()}
                            </TableCell>

                            {/* Mobile Section: Stock Status (Hidden on Desktop) */}
                            <TableCell className="md:hidden block p-0 align-middle">
                              <span className="text-xs font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                                Stock Status
                              </span>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col items-center justify-center bg-muted/20 p-2 rounded">
                                  <span className="text-[9px] text-muted-foreground uppercase mb-1">
                                    In Stock
                                  </span>
                                  {(() => {
                                    const stockBalance =
                                      partStockBalances[item.selectedPartId];
                                    const currentStock =
                                      stockBalance?.current_stock ??
                                      (part?.stockQty || 0);
                                    const isLoading =
                                      loadingStock[item.selectedPartId];
                                    return (
                                      <span
                                        className={`text-sm font-bold ${currentStock > 0 ? "text-foreground" : "text-muted-foreground"}`}
                                      >
                                        {isLoading ? "..." : currentStock}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div className="flex flex-col items-center justify-center bg-muted/20 p-2 rounded">
                                  <span className="text-[9px] text-muted-foreground uppercase mb-1">
                                    Reserved
                                  </span>
                                  {(() => {
                                    const stockBalance =
                                      partStockBalances[item.selectedPartId];
                                    const reservedStock =
                                      stockBalance?.reserved_stock ??
                                      (part?.reservedQty || 0);
                                    const isLoading =
                                      loadingStock[item.selectedPartId];
                                    return (
                                      <span className="text-sm font-semibold text-orange-600">
                                        {isLoading ? "..." : reservedStock}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div className="flex flex-col items-center justify-center bg-muted/20 p-2 rounded">
                                  <span className="text-[9px] text-muted-foreground uppercase mb-1">
                                    Available
                                  </span>
                                  {(() => {
                                    const stockBalance =
                                      partStockBalances[item.selectedPartId];
                                    const inStock =
                                      stockBalance?.current_stock ??
                                      (part?.stockQty || 0);
                                    const reserved =
                                      stockBalance?.reserved_stock ??
                                      (part?.reservedQty || 0);
                                    const available = stockBalance
                                      ? Math.max(0, inStock - reserved)
                                      : Math.max(0, part?.availableQty ?? 0);
                                    const isLoading =
                                      loadingStock[item.selectedPartId];
                                    return isLoading ? (
                                      <span className="text-xs text-muted-foreground">
                                        ...
                                      </span>
                                    ) : (
                                      <Badge
                                        variant={
                                          available > 0
                                            ? "default"
                                            : "destructive"
                                        }
                                        className="px-2 py-0.5 font-bold h-fit"
                                      >
                                        {available}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>

                            {/* Column 7: Qty (Desktop ONLY UI, Mobile combined section below) */}
                            <TableCell className="hidden md:table-cell align-middle">
                              <div className="flex flex-col items-center justify-center">
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.qty || ""}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    const currentStock =
                                      (part?.id
                                        ? partStockBalances[part.id]
                                        : null
                                      )?.available_stock ??
                                      (part?.availableQty || 0);
                                    if (
                                      val > currentStock &&
                                      currentStock >= 0
                                    ) {
                                      toast({
                                        title: "Insufficient Stock",
                                        description: `Cannot enter ${val}. Available stock is only ${currentStock}.`,
                                        variant: "destructive",
                                      });
                                      handleUpdateInlineItem(
                                        item.id,
                                        "qty",
                                        currentStock,
                                      );
                                    } else
                                      handleUpdateInlineItem(
                                        item.id,
                                        "qty",
                                        val,
                                      );
                                  }}
                                  className="w-16 h-8 text-center font-bold"
                                  placeholder="0"
                                />
                                {item.qty === 0 && item.selectedPartId && (
                                  <p className="text-destructive text-[9px] font-semibold">
                                    Required
                                  </p>
                                )}
                              </div>
                            </TableCell>

                            {/* Column 8: Assoc. Prices (Desktop ONLY) */}
                            <TableCell className="hidden md:table-cell text-center align-middle">
                              {(() => {
                                const priceAValue =
                                  item.priceA ?? part?.priceA ?? null;
                                const priceBValue =
                                  item.priceB ?? part?.priceB ?? null;

                                if (priceAValue == null && priceBValue == null) {
                                  return (
                                    <span className="text-xs text-muted-foreground">
                                      -
                                    </span>
                                  );
                                }

                                return (
                                  <div className="flex flex-col gap-1 items-stretch">
                                    {priceAValue != null && (
                                      <Button
                                        variant={
                                          item.selectedPriceType === "A"
                                            ? "default"
                                            : "outline"
                                        }
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={() => {
                                          handleUpdateInlineItem(
                                            item.id,
                                            "selectedPriceType",
                                            "A",
                                          );
                                          handleUpdateInlineItem(
                                            item.id,
                                            "unitPrice",
                                            priceAValue,
                                          );
                                        }}
                                      >
                                        {priceAValue.toFixed(0)}
                                      </Button>
                                    )}
                                    {priceBValue != null && (
                                      <Button
                                        variant={
                                          item.selectedPriceType === "B"
                                            ? "default"
                                            : "outline"
                                        }
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={() => {
                                          handleUpdateInlineItem(
                                            item.id,
                                            "selectedPriceType",
                                            "B",
                                          );
                                          handleUpdateInlineItem(
                                            item.id,
                                            "unitPrice",
                                            priceBValue,
                                          );
                                        }}
                                      >
                                        {priceBValue.toFixed(0)}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>

                            {/* Column 9: Editable Price (Desktop ONLY) */}
                            <TableCell className="hidden md:table-cell text-center align-middle">
                              <Input
                                type="number"
                                min={0}
                                value={item.unitPrice ?? ""}
                                onChange={(e) =>
                                  handleUpdateInlineItem(
                                    item.id,
                                    "unitPrice",
                                    e.target.value === ""
                                      ? undefined
                                      : parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-24 text-center h-8"
                              />
                            </TableCell>

                            {/* Mobile Section: Qty & Price (Hidden on Desktop) */}
                            <TableCell className="md:hidden block p-0 align-middle">
                              <span className="text-xs font-bold text-muted-foreground block mb-2 uppercase tracking-wider">
                                Quantity & Price
                              </span>
                              <div className="grid grid-cols-3 gap-2 items-center">
                                <div className="space-y-1">
                                  <span className="text-[9px] text-muted-foreground uppercase">
                                    Qty
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={item.qty || ""}
                                    onChange={(e) =>
                                      handleUpdateInlineItem(
                                        item.id,
                                        "qty",
                                        parseInt(e.target.value) || 0,
                                      )
                                    }
                                    className="h-8 text-center font-bold"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] text-muted-foreground uppercase">
                                    Price A
                                  </span>
                                  {(() => {
                                    const val =
                                      item.priceA ?? part?.priceA ?? null;
                                    return val != null ? (
                                      <Button
                                        variant={
                                          item.selectedPriceType === "A"
                                            ? "default"
                                            : "outline"
                                        }
                                        size="sm"
                                        className="w-full h-8 text-[10px]"
                                        onClick={() =>
                                          handleUpdateInlineItem(
                                            item.id,
                                            "selectedPriceType",
                                            "A",
                                          )
                                        }
                                      >
                                        {val.toFixed(0)}
                                      </Button>
                                    ) : (
                                      <div className="h-8 flex items-center justify-center text-xs text-muted-foreground">
                                        -
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] text-muted-foreground uppercase">
                                    Price B
                                  </span>
                                  {(() => {
                                    const val =
                                      item.priceB ?? part?.priceB ?? null;
                                    return val != null ? (
                                      <Button
                                        variant={
                                          item.selectedPriceType === "B"
                                            ? "default"
                                            : "outline"
                                        }
                                        size="sm"
                                        className="w-full h-8 text-[10px]"
                                        onClick={() =>
                                          handleUpdateInlineItem(
                                            item.id,
                                            "selectedPriceType",
                                            "B",
                                          )
                                        }
                                      >
                                        {val.toFixed(0)}
                                      </Button>
                                    ) : (
                                      <div className="h-8 flex items-center justify-center text-xs text-muted-foreground">
                                        -
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>

                            {/* Column 10: Total */}
                            <TableCell className="md:table-cell block p-0 md:p-4 md:text-center align-middle font-bold">
                              <div className="flex md:flex-col justify-between items-center bg-primary/5 p-3 md:p-0 rounded border border-primary/10 md:border-0 md:bg-transparent">
                                <span className="md:hidden text-xs font-bold text-primary uppercase">
                                  Total
                                </span>
                                <span className="text-lg md:text-base text-primary">
                                  Rs {calculateLineTotal(item).toLocaleString()}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive md:hidden"
                                  onClick={() =>
                                    handleRemoveInlineItem(item.id)
                                  }
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>

                            {/* Column 11: Action (Desktop Only) */}
                            <TableCell className="hidden md:table-cell align-middle text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-primary hover:bg-primary/10"
                                  onClick={() => handleAddNewItem(true)}
                                  title="Add New Item"
                                >
                                  <Plus className="w-5 h-5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRemoveInlineItem(item.id)}
                                  title="Remove Item"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Payment Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Discount</Label>
                  <Input
                    type="number"
                    min={0}
                    value={discount || ""}
                    onChange={(e) =>
                      setDiscount(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select
                    value={selectedBankAccount}
                    onValueChange={(value) => {
                      setSelectedBankAccount(value);
                      if (!value) setBankAmount(0); // Reset amount if account is deselected
                    }}
                    disabled={loadingAccounts || bankAccounts.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          loadingAccounts
                            ? "Loading bank accounts..."
                            : bankAccounts.length === 0
                              ? "No bank accounts available. Add accounts in Accounting → Accounts (Subgroup: Bank Account)."
                              : "Select bank account..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingAccounts ? (
                        <SelectItem value="loading" disabled>
                          Loading bank accounts...
                        </SelectItem>
                      ) : bankAccounts.length === 0 ? (
                        <SelectItem value="no-accounts" disabled>
                          No bank accounts available. Please add accounts in
                          Accounting → Accounts (Subgroup: Bank Account).
                        </SelectItem>
                      ) : (
                        bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code
                              ? `${account.code} - ${account.name}`
                              : account.name}{" "}
                            {account.type &&
                            account.type !== "General" &&
                            account.type !== "Current Assets"
                              ? `(${account.type})`
                              : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedBankAccount && (
                    <div className="space-y-1">
                      <Label className="text-sm">Bank Amount (Rs)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={bankAmount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setBankAmount(val);
                          // Auto-update receivedAmount for backward compatibility
                          setReceivedAmount(val + cashAmount);
                        }}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Cash Account</Label>
                  <Select
                    value={selectedCashAccount}
                    onValueChange={(value) => {
                      setSelectedCashAccount(value);
                      if (!value) setCashAmount(0); // Reset amount if account is deselected
                    }}
                    disabled={loadingAccounts || cashAccounts.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          loadingAccounts
                            ? "Loading cash accounts..."
                            : cashAccounts.length === 0
                              ? "No cash accounts available. Add accounts in Accounting → Accounts (Subgroup: Cash Account)."
                              : "Select cash account..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingAccounts ? (
                        <SelectItem value="loading" disabled>
                          Loading cash accounts...
                        </SelectItem>
                      ) : cashAccounts.length === 0 ? (
                        <SelectItem value="no-accounts" disabled>
                          No cash accounts available. Please add accounts in
                          Accounting → Accounts (Subgroup: Cash Account).
                        </SelectItem>
                      ) : (
                        cashAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code
                              ? `${account.code} - ${account.name}`
                              : account.name}{" "}
                            {account.type &&
                            account.type !== "General" &&
                            account.type !== "Current Assets"
                              ? `(${account.type})`
                              : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedCashAccount && (
                    <div className="space-y-1">
                      <Label className="text-sm">Cash Amount (Rs)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cashAmount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCashAmount(val);
                          // Auto-update receivedAmount for backward compatibility
                          setReceivedAmount(bankAmount + val);
                        }}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
                {!selectedBankAccount && !selectedCashAccount && (
                  <div className="space-y-2">
                    <Label>Received Amount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={receivedAmount || ""}
                      onChange={(e) =>
                        setReceivedAmount(parseFloat(e.target.value) || 0)
                      }
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter remarks..."
                  rows={6}
                />
              </div>

              <div className="space-y-3 p-4 bg-background rounded-lg border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Amount:</span>
                  <span className="font-medium">
                    Rs {calculateTotalAmount().toLocaleString()}
                  </span>
                </div>
                {taxType === "With GST" && (
                  <>
                    <div className="flex justify-between text-blue-600">
                      <span>GST %:</span>
                      <span>{getCurrentGstRate()}%</span>
                    </div>
                    <div className="flex justify-between text-blue-600">
                      <span>GST Amount:</span>
                      <span>Rs {calculateTax().toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold text-green-600">
                      <span>Total after GST:</span>
                      <span>
                        Rs {calculateTotalAfterGst().toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-destructive border-t pt-2">
                  <span>Discount:</span>
                  <span>-Rs {discount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">After Discount:</span>
                  <span className="font-bold">
                    Rs {(calculateTotalAfterGst() - discount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-lg">
                  <span>Grand Total:</span>
                  <span className="text-green-600">
                    Rs {calculateAmountAfterDiscount().toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Received:</span>
                  <span>Rs {calculateTotalReceived().toLocaleString()}</span>
                </div>
                {selectedBankAccount && bankAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="ml-4"> Bank:</span>
                    <span>Rs {bankAmount.toLocaleString()}</span>
                  </div>
                )}
                {selectedCashAccount && cashAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="ml-4"> Cash:</span>
                    <span>Rs {cashAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Due Amount:</span>
                  <span className="text-xl font-bold text-primary">
                    Rs {calculateDueAmount().toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Term & delivered to — end of invoice (before save) */}
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/80 mb-3">
                Term and delivery
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                    Term
                  </Label>
                  <Input
                    type={
                      newInvoice.customerType === "registered" ? "number" : "text"
                    }
                    min={0}
                    placeholder={
                      newInvoice.customerType === "registered"
                        ? "Days"
                        : "Auto (Cash / Online)"
                    }
                    value={
                      newInvoice.customerType === "registered"
                        ? term
                        : selectedBankAccount && bankAmount > 0
                          ? "online"
                          : selectedCashAccount && cashAmount > 0
                            ? "cash"
                            : ""
                    }
                    onChange={(e) => {
                      if (newInvoice.customerType === "registered") {
                        setTerm(e.target.value);
                      }
                    }}
                    readOnly={newInvoice.customerType !== "registered"}
                    className="h-9 text-sm bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                    Delivered To
                  </Label>
                  <Input
                    placeholder="Delivery address or party"
                    value={deliveredTo}
                    onChange={(e) => setDeliveredTo(e.target.value)}
                    className="h-9 text-sm bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={resetForm}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveInvoice}
                className="w-full sm:w-auto order-1 sm:order-2"
              >
                <FileText className="w-4 h-4 mr-2" />
                {editingInvoiceId ? "Save Changes" : "Create Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Invoices Table */
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invoice List</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingInvoices ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading invoices...
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <Table className="min-w-[800px] md:min-w-full">
                  <TableHeader className="hidden md:table-header-group">
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Tax %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right px-4">Paid</TableHead>
                      <TableHead className="text-center">Delivery</TableHead>
                      <TableHead className="text-center">Payment</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="flex flex-col md:table-row border-b md:border-b-0 p-4 md:p-0 space-y-3 md:space-y-0 relative"
                      >
                        <TableCell className="md:table-cell font-bold md:font-medium p-0 md:p-4 block">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Invoice #
                          </span>
                          {inv.invoiceNo}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Date
                          </span>
                          {formatInvoiceDateDisplay(inv.invoiceDate)}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Term
                          </span>
                          {formatTermDisplay(inv)}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Customer
                          </span>
                          {inv.customerName}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Type
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] md:text-xs"
                          >
                            {inv.customerType === "walking"
                              ? "Cash Sale"
                              : "Party Sale"}
                          </Badge>
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4 md:text-right">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Tax %
                          </span>
                          {inv.taxPercentage != null &&
                          Number(inv.taxPercentage) > 0
                            ? `${Number(inv.taxPercentage)}%`
                            : "-"}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4 md:text-right font-medium">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Total
                          </span>
                          Rs {inv.grandTotal.toLocaleString()}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4 md:text-right">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Paid
                          </span>
                          Rs {inv.paidAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4 md:text-center">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Delivery
                          </span>
                          {getStatusBadge(inv.status)}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4 md:text-center">
                          <span className="md:hidden text-xs text-muted-foreground block mb-1">
                            Payment
                          </span>
                          {getPaymentBadge(inv.paymentStatus)}
                        </TableCell>
                        <TableCell className="md:table-cell block p-0 md:p-4 md:text-center pt-2 md:pt-4 border-t md:border-t-0">
                          <div className="flex items-center md:justify-center gap-1">
                            {/* Record Payment */}
                            {inv.paymentStatus !== "paid" &&
                              inv.status !== "pending" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => {
                                    setSelectedInvoice(inv);
                                    setPaymentForm({
                                      amount: inv.grandTotal - inv.paidAmount,
                                      accountId: inv.accountId || "",
                                      paymentDate: new Date()
                                        .toISOString()
                                        .split("T")[0],
                                    });
                                    setShowPaymentDialog(true);
                                  }}
                                  title="Record Payment"
                                >
                                  <DollarSign className="w-4 h-4" />
                                </Button>
                              )}
                            {/* View */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={async () => {
                                try {
                                  const resp = (await apiClient.getSalesInvoice(
                                    inv.id,
                                  )) as any;
                                  const fullInv = resp?.data || resp;
                                  const fullItems = Array.isArray(
                                    fullInv?.SalesInvoiceItem,
                                  )
                                    ? fullInv.SalesInvoiceItem
                                    : inv.items || [];

                                  const mappedItems: InvoiceItem[] = fullItems.map(
                                    (item: any) => {
                                      const selectedRackCodes = (
                                        item.InvoiceRackShelf || []
                                      )
                                        .map(
                                          (irs: any) =>
                                            irs?.Rack?.code ||
                                            irs?.Rack?.codeNo ||
                                            "",
                                        )
                                        .filter(Boolean);
                                      const selectedShelfNos = (
                                        item.InvoiceRackShelf || []
                                      )
                                        .map(
                                          (irs: any) =>
                                            irs?.Shelf?.shelfNo ||
                                            irs?.Shelf?.name ||
                                            "",
                                        )
                                        .filter(Boolean);

                                      return {
                                        id: item.id,
                                        partId: item.partId,
                                        partNo: item.partNo,
                                        description: item.description || "",
                                        orderedQty: Number(item.orderedQty || 0),
                                        deliveredQty: Number(
                                          item.deliveredQty || 0,
                                        ),
                                        pendingQty: Number(item.pendingQty || 0),
                                        reversedQty: Math.max(
                                          0,
                                          Number(item.orderedQty || 0) -
                                            Number(item.deliveredQty || 0) -
                                            Number(item.pendingQty || 0),
                                        ),
                                        unitPrice: Number(item.unitPrice || 0),
                                        discount: Number(item.discount || 0),
                                        discountType: "percent",
                                        lineTotal: Number(item.lineTotal || 0),
                                        grade: (item.grade || "A") as ItemGrade,
                                        brand: item.brand,
                                        rackCode: selectedRackCodes.join(", "),
                                        shelfNo: selectedShelfNos.join(", "),
                                      };
                                    },
                                  );

                                  setSelectedInvoice({
                                    ...inv,
                                    invoiceDate:
                                      fullInv?.invoiceDate || inv.invoiceDate,
                                    items: mappedItems,
                                  });
                                } catch {
                                  setSelectedInvoice({
                                    ...inv,
                                    items: inv.items || [],
                                  });
                                } finally {
                                  setShowViewInvoice(true);
                                }
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {/* Approve — pending or on_hold */}
                            {(inv.status === "pending" ||
                              inv.status === "on_hold") && (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                                onClick={() =>
                                  handleUpdateStatus(inv, "approved")
                                }
                                disabled={approvingInvoice === inv.id}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                {approvingInvoice === inv.id
                                  ? "Approving..."
                                  : "Approve"}
                              </Button>
                            )}
                            {/* Print */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Print"
                                >
                                  <Printer className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    openSalesInvoicePrintDialog(inv)
                                  }
                                >
                                  Print Sales Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handlePrintDeliveryChallan(inv)}
                                >
                                  Print Delivery Challan
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Sale return once approved or in any delivery-complete state; reverse undelivered stock is the orange icon */}
                            {(inv.status === "approved" ||
                              inv.status === "partially_delivered" ||
                              inv.status === "delivered" ||
                              inv.status === "fully_delivered") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                title="Sale return"
                                onClick={() => void openSaleReturnDialog(inv)}
                              >
                                <Undo2 className="w-4 h-4" />
                              </Button>
                            )}
                            {/* Edit (Pending only) */}
                            {inv.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => handleEditInvoice(inv)}
                                title="Edit Invoice"
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            )}
                            {/* Reverse Stock - for approved or partially delivered party sale (registered) only; not for cash sale */}
                            {inv.customerType === "registered" &&
                              (inv.status === "approved" ||
                                inv.status === "partially_delivered") &&
                              inv.items?.some(
                                (item) => (item.pendingQty || 0) > 0,
                              ) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                  onClick={() => {
                                    // Show all items that still have pending (undelivered) quantity
                                    const itemsToProcess = inv.items?.filter(
                                      (item) => (item.pendingQty || 0) > 0,
                                    );

                                    if (
                                      itemsToProcess &&
                                      itemsToProcess.length > 0
                                    ) {
                                      setSelectedInvoice({
                                        ...inv,
                                        items: inv.items || [],
                                      });
                                      setItemsToReverse(itemsToProcess);
                                      // Initialize reverse quantities to the full pending amount
                                      const initialQtys: Record<
                                        string,
                                        number
                                      > = {};
                                      itemsToProcess.forEach((item) => {
                                        initialQtys[item.id] =
                                          item.pendingQty || 0;
                                      });
                                      setReverseQuantities(initialQtys);
                                      setShowReverseDialog(true);
                                    } else {
                                      toast({
                                        title: "No Reversible Items",
                                        description:
                                          "This invoice has no items that can be reversed.",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                  title="Reverse undelivered stock to inventory"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </Button>
                              )}
                            {/* Delete (Pending only) */}
                            {inv.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setInvoiceToSoftDelete(inv);
                                  setShowSoftDeleteConfirm(true);
                                }}
                                title="Delete Invoice"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No invoices found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* View Invoice Dialog */}
      <Dialog open={showViewInvoice} onOpenChange={setShowViewInvoice}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Invoice Details - {selectedInvoice?.invoiceNo}
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {formatInvoiceDateDisplay(selectedInvoice.invoiceDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedInvoice.customerName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="outline">
                    {selectedInvoice.customerType === "walking"
                      ? "Cash Sale"
                      : "Party Sale"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {getStatusBadge(selectedInvoice.status)}
                </div>
              </div>

              {selectedInvoice.holdReason && (
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <p className="text-sm font-medium text-yellow-600">On Hold</p>
                  <p className="text-sm text-muted-foreground">
                    Reason: {selectedInvoice.holdReason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Since: {selectedInvoice.holdSince}
                  </p>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Rack/Shelf</TableHead>
                      <TableHead className="text-center">Ordered</TableHead>
                      <TableHead className="text-center">Delivered</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Reversed</TableHead>
                      <TableHead className="text-center">Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.items?.length > 0 ? (
                      selectedInvoice.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.partNo}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.description}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.rackCode || item.shelfNo
                              ? `${item.rackCode || "-"} / ${item.shelfNo || "-"}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.orderedQty}
                          </TableCell>
                          <TableCell className="text-center text-green-600">
                            {item.deliveredQty}
                          </TableCell>
                          <TableCell className="text-center text-orange-600">
                            {item.pendingQty}
                          </TableCell>
                          <TableCell className="text-center text-red-600">
                            {item.reversedQty || 0}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.unitPrice
                              ? item.unitPrice.toFixed(2)
                              : "0.00"}
                          </TableCell>
                          <TableCell className="text-right">
                            Rs {item.lineTotal.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            {selectedInvoice.customerType === "registered" &&
                              (item.pendingQty || 0) - (item.reversedQty || 0) >
                                0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                  onClick={() => {
                                    // Set only this item for reversal
                                    setItemsToReverse([item]);
                                    setReverseQuantities({
                                      [item.id]:
                                        (item.pendingQty || 0) -
                                        (item.reversedQty || 0),
                                    });
                                    setShowReverseDialog(true);
                                  }}
                                  title="Reverse undelivered quantity to stock"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-4">
                          <p className="text-muted-foreground">
                            No items found for this invoice
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Payment Status
                  </p>
                  {getPaymentBadge(selectedInvoice.paymentStatus)}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Sub Total</p>
                  <p className="text-base font-semibold">
                    Rs {(selectedInvoice.subtotal || 0).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Discount</p>
                  <p className="text-base font-semibold text-orange-600">
                    Rs {(selectedInvoice.overallDiscount || 0).toLocaleString()}
                  </p>
                  {Number(selectedInvoice.tax || 0) > 0 && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        GST
                        {selectedInvoice.taxPercentage != null &&
                        Number(selectedInvoice.taxPercentage) > 0
                          ? ` @ ${Number(selectedInvoice.taxPercentage)}%`
                          : ""}
                      </p>
                      <p className="text-base font-semibold">
                        Rs {Number(selectedInvoice.tax || 0).toLocaleString()}
                      </p>
                    </>
                  )}
                  <p className="text-sm text-muted-foreground">Grand Total</p>
                  <p className="text-2xl font-bold text-primary">
                    Rs {selectedInvoice.grandTotal.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Paid: Rs {selectedInvoice.paidAmount.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedInvoice &&
                    openSalesInvoicePrintDialog(selectedInvoice)
                  }
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print Invoice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedInvoice &&
                    handlePrintDeliveryChallan(selectedInvoice)
                  }
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print Challan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showInvoicePrintColumnsDialog}
        onOpenChange={setShowInvoicePrintColumnsDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print Column Selection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {invoicePrintColumns.map((col) => (
              <div key={col.id} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedInvoicePrintColumns.includes(col.id)}
                  onCheckedChange={(checked) => {
                    setSelectedInvoicePrintColumns((prev) => {
                      if (checked) return Array.from(new Set([...prev, col.id]));
                      const next = prev.filter((id) => id !== col.id);
                      return next.length > 0 ? next : [col.id];
                    });
                  }}
                />
                <Label>{col.label}</Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInvoicePrintColumnsDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!invoiceForPrint) return;
                handlePrintInvoice(invoiceForPrint, selectedInvoicePrintColumns);
                setShowInvoicePrintColumnsDialog(false);
              }}
            >
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Record Payment - {selectedInvoice?.invoiceNo}
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6 pt-4">
              {/* Payment Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    Total Amount
                  </p>
                  <p className="text-lg font-bold">
                    Rs {selectedInvoice.grandTotal.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    Discount
                  </p>
                  <p className="text-lg font-bold text-orange-600">
                    - Rs{" "}
                    {(selectedInvoice.overallDiscount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    Paid So Far
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    Rs {selectedInvoice.paidAmount.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    Remaining
                  </p>
                  <p className="text-xl font-black text-primary">
                    Rs{" "}
                    {(
                      selectedInvoice.grandTotal - selectedInvoice.paidAmount
                    ).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Input Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Payment Date</Label>
                    <Input
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          paymentDate: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount to Pay (Rs)</Label>
                    <Input
                      type="number"
                      value={paymentForm.amount || ""}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          amount: Number(e.target.value),
                        })
                      }
                      className="font-bold text-primary"
                      max={
                        selectedInvoice.grandTotal - selectedInvoice.paidAmount
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Select Account (Bank/Cash)</Label>
                  <Select
                    value={paymentForm.accountId}
                    onValueChange={(val) =>
                      setPaymentForm({ ...paymentForm, accountId: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50">
                        Cash Accounts
                      </div>
                      {cashAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.code || "No Code"})
                        </SelectItem>
                      ))}
                      <div className="p-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 mt-1">
                        Bank Accounts
                      </div>
                      {bankAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.code || "Bank"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setShowPaymentDialog(false)}
              disabled={recordingPayment}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={recordingPayment}
              className="bg-green-600 hover:bg-green-700"
            >
              {recordingPayment ? (
                <>Saving...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Log */}
      {selectedInvoice && (
        <InvoiceDeliveryLog
          open={showDeliveryLog}
          onOpenChange={setShowDeliveryLog}
          invoiceNo={selectedInvoice.invoiceNo}
          items={selectedInvoice.items || []}
          deliveryLog={selectedInvoice.deliveryLog}
          onRecordDelivery={handleRecordDelivery}
        />
      )}

      {/* Hold Dialog */}
      <Dialog
        open={showHoldDialog}
        onOpenChange={(open) => {
          setShowHoldDialog(open);
          if (!open) setHoldLocationQtys({});
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              Put Invoice On Hold
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="p-3 bg-yellow-50 rounded-md border border-yellow-200">
              <p className="text-sm text-yellow-800">
                Please select which <strong>Rack and Shelf</strong> the items
                will be taken from to move to <strong>Hold Quantity</strong>.
              </p>
            </div>

            <div className="space-y-4">
              {invoiceToHold?.items?.map((item) => {
                const totalTarget = item.pendingQty || item.orderedQty;
                const totalSelected = Object.values(
                  holdLocationQtys[item.id] || {},
                ).reduce((a, b) => a + b, 0);
                const remaining = totalTarget - totalSelected;

                return (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-3 bg-muted/30"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-sm">{item.partNo}</h4>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={remaining === 0 ? "default" : "outline"}
                          className={
                            remaining === 0
                              ? "bg-green-500 hover:bg-green-600"
                              : ""
                          }
                        >
                          {totalSelected} / {totalTarget} Selected
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {item.stockLocations && item.stockLocations.length > 0 ? (
                        item.stockLocations.map((loc, idx) => {
                          const locKey = `${loc.rackId}-${loc.shelfId}`;
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs bg-background p-2 rounded border"
                            >
                              <div className="flex items-center gap-4">
                                <span className="font-medium">
                                  Rack: {loc.rackCode || "N/A"}
                                </span>
                                <span className="font-medium">
                                  Shelf: {loc.shelfNo || "N/A"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  (Available: {loc.quantity})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-[10px]">Qty:</Label>
                                <Input
                                  type="number"
                                  className="h-8 w-20 text-xs"
                                  value={
                                    holdLocationQtys[item.id]?.[locKey] || ""
                                  }
                                  onChange={(e) => {
                                    const val = Math.min(
                                      parseInt(e.target.value) || 0,
                                      loc.quantity,
                                      totalTarget -
                                        (totalSelected -
                                          (holdLocationQtys[item.id]?.[
                                            locKey
                                          ] || 0)),
                                    );
                                    setHoldLocationQtys((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...(prev[item.id] || {}),
                                        [locKey]: val,
                                      },
                                    }));
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-destructive py-2">
                          No stock locations available for this item.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label>Reason for Hold</Label>
              <Textarea
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Enter reason..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background pt-4">
            <Button variant="outline" onClick={() => setShowHoldDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!invoiceToHold) return;

                // Validate that all items have their full quantity allocated
                for (const item of invoiceToHold.items) {
                  const target = item.pendingQty || item.orderedQty;
                  const selected = Object.values(
                    holdLocationQtys[item.id] || {},
                  ).reduce((a, b) => a + b, 0);
                  if (selected < target && item.stockLocations?.length > 0) {
                    toast({
                      title: "Incomplete Allocation",
                      description: `Please allocate the full quantity for ${item.partNo}`,
                      variant: "destructive",
                    });
                    return;
                  }
                }

                // Prepare holdLocations for backend
                const backendHoldLocations: Record<string, any[]> = {};
                Object.entries(holdLocationQtys).forEach(([itemId, locs]) => {
                  backendHoldLocations[itemId] = Object.entries(locs)
                    .filter(([_, qty]) => qty > 0)
                    .map(([locKey, qty]) => {
                      const [rackId, shelfId] = locKey.split("-");
                      return { rackId, shelfId, quantity: qty };
                    });
                });

                handleHoldInvoice(backendHoldLocations);
              }}
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              Confirm Hold & Stock Movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial Delivery Dialog */}
      <Dialog
        open={showPartialDeliveryDialog}
        onOpenChange={(open) => {
          setShowPartialDeliveryDialog(open);
          if (!open) setPartialDeliveryQtys({});
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              Record Partial Delivery
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the quantity delivered for each item. Leave 0 for items
                not yet delivered.
              </p>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {selectedInvoice.items?.length > 0 ? (
                  selectedInvoice.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.partNo}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ordered: {item.orderedQty} | Delivered:{" "}
                          {item.deliveredQty} | Pending: {item.pendingQty}
                        </p>
                        {item.stockLocations &&
                          item.stockLocations.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground px-1">
                                Stock Locations:
                              </p>
                              {item.stockLocations.map((loc, idx) => (
                                <div
                                  key={idx}
                                  className="text-[10px] flex items-center justify-between px-2 py-1 rounded bg-background/50 border border-border/50"
                                >
                                  <div className="flex gap-2">
                                    <span className="opacity-70">Rack:</span>
                                    <span className="font-semibold">
                                      {loc.rackCode || "Unallocated"}
                                    </span>
                                    <span className="opacity-70 ml-1">
                                      Shelf:
                                    </span>
                                    <span className="font-semibold">
                                      {loc.shelfNo || "-"}
                                    </span>
                                  </div>
                                  <div className="flex gap-1 items-center">
                                    <span className="opacity-70">
                                      In Stock:
                                    </span>
                                    <span
                                      className={`font-bold ${
                                        loc.quantity > 0
                                          ? "text-blue-600"
                                          : "text-destructive"
                                      }`}
                                    >
                                      {loc.quantity}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {item.totalStock !== undefined && (
                                <div className="text-[10px] font-bold text-green-600 px-1 mt-1 flex justify-between">
                                  <span>Total Available Stock:</span>
                                  <span>{item.totalStock}</span>
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                      <div className="w-24 shrink-0 self-start mt-1">
                        <Label className="text-xs">Deliver Qty</Label>
                        <Input
                          type="number"
                          min={0}
                          max={item.pendingQty}
                          value={partialDeliveryQtys[item.id] ?? 0}
                          onChange={(e) =>
                            setPartialDeliveryQtys((prev) => ({
                              ...prev,
                              [item.id]: Math.min(
                                Number(e.target.value) || 0,
                                item.pendingQty,
                              ),
                            }))
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">
                      No items found for this invoice
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPartialDeliveryDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={async () => {
                if (!selectedInvoice) return;
                setShowPartialDeliveryDialog(false);
                await handleUpdateStatus(
                  selectedInvoice,
                  "partially_delivered",
                  partialDeliveryQtys,
                );
                setPartialDeliveryQtys({});
              }}
            >
              <Truck className="w-4 h-4 mr-2" />
              Confirm Partial Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Cancel Invoice?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the invoice and return all RESERVED items back to
              AVAILABLE stock. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvoice}
              className="bg-destructive hover:bg-destructive/90"
            >
              Cancel Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Soft Delete Confirmation */}
      <AlertDialog
        open={showSoftDeleteConfirm}
        onOpenChange={(open) => {
          setShowSoftDeleteConfirm(open);
          if (!open) setInvoiceToSoftDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Delete Invoice & Reverse Stock?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete invoice {invoiceToSoftDelete?.invoiceNo} and
              automatically reverse all stock movements.
              <br />
              <br />
              <strong>Stock reversal will:</strong>
              <div className="mt-2 space-y-1">
                <ul className="list-disc list-inside">
                  <li>Return all delivered items to stock</li>
                  <li>Release all reserved items</li>
                  <li>Cancel the receivable</li>
                  <li>Mark invoice as cancelled</li>
                </ul>
              </div>
              <br />
              This action cannot be undone, but the invoice record will be
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToSoftDelete(null)}>
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSoftDeleteInvoice}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Delete & Reverse Stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete (permanent) Confirmation – for cancelled invoices */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) setInvoiceToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Invoice Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove invoice {invoiceToDelete?.invoiceNo}{" "}
              from the list. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInvoice}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Customer Dialog */}
      <CustomerFormDialog
        open={showAddCustomerDialog}
        onOpenChange={setShowAddCustomerDialog}
        onCreated={handleCustomerCreated}
      />
      <Dialog
        open={showEditCreditLimitDialog}
        onOpenChange={setShowEditCreditLimitDialog}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Credit Limit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-credit-limit">New Credit Limit</Label>
              <Input
                id="edit-credit-limit"
                type="number"
                placeholder="Enter new credit limit"
                value={editingCreditLimit}
                onChange={(e) =>
                  setEditingCreditLimit(parseFloat(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter 0 for unlimited credit limit.
              </p>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setShowEditCreditLimitDialog(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={updatingCreditLimit}
              onClick={async () => {
                if (!selectedCustomerId) return;
                try {
                  setUpdatingCreditLimit(true);
                  const response = await apiClient.updateCustomer(
                    selectedCustomerId,
                    {
                      creditLimit: editingCreditLimit,
                    },
                  );
                  if (response.error) {
                    toast({
                      title: "Error",
                      description: response.error,
                      variant: "destructive",
                    });
                    return;
                  }
                  toast({
                    title: "Success",
                    description: "Credit limit updated.",
                  });
                  // Update local state without full refresh
                  setCustomers((prev) =>
                    prev.map((c) =>
                      c.id === selectedCustomerId
                        ? { ...c, creditLimit: editingCreditLimit }
                        : c,
                    ),
                  );
                  setShowEditCreditLimitDialog(false);
                } catch (e: any) {
                  toast({
                    title: "Error",
                    description: "Failed to update credit limit.",
                    variant: "destructive",
                  });
                } finally {
                  setUpdatingCreditLimit(false);
                }
              }}
            >
              {updatingCreditLimit ? "Saving..." : "Save Limit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale return — delivered qty only */}
      <Dialog
        open={showSaleReturnDialog}
        onOpenChange={(open) => {
          setShowSaleReturnDialog(open);
          if (!open) {
            setSaleReturnInvoice(null);
            setSaleReturnQtyDraft({});
            setSaleReturnReturnedByPartId({});
            setSaleReturnReason("");
            setSaleReturnDeductionDraft("");
            setSaleReturnDeductionTouched(false);
            setSaleReturnRefundPaidDraft("");
            setSaleReturnRefundPaidTouched(false);
            setSaleReturnPaymentAccountId("");
          }
        }}
      >
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-6 sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-violet-600" />
              Sale return
              {saleReturnInvoice?.invoiceNo
                ? ` — ${saleReturnInvoice.invoiceNo}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Return only up to what was delivered, minus any quantity already returned on prior
              sale returns for this invoice (see Returned (part)). Undelivered / pending qty cannot
              be returned here.
            </DialogDescription>
          </DialogHeader>

          {loadingSaleReturn || !saleReturnInvoice ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {loadingSaleReturn ? "Loading invoice…" : ""}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
              <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{saleReturnInvoice.customerName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice date</p>
                  <p className="font-medium">
                    {formatInvoiceDateDisplay(saleReturnInvoice.invoiceDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="outline">
                    {saleReturnInvoice.customerType === "walking"
                      ? "Cash Sale"
                      : "Party Sale"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {getStatusBadge(saleReturnInvoice.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Grand total</p>
                  <p className="font-medium">
                    Rs {saleReturnInvoice.grandTotal.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-medium">
                    Rs {saleReturnInvoice.paidAmount.toLocaleString()}
                  </p>
                </div>
                {Number(saleReturnInvoice.overallDiscount) > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice discount</p>
                    <p className="font-medium">
                      Rs{" "}
                      {Number(saleReturnInvoice.overallDiscount).toLocaleString()}
                    </p>
                  </div>
                ) : null}
                {saleReturnMoney.isTaxInvoice ? (
                  <div>
                    <p className="text-xs text-muted-foreground">GST on invoice</p>
                    <p className="font-medium">
                      {saleReturnMoney.gstPct}% tax · Rs{" "}
                      {Number(saleReturnInvoice.tax || 0).toLocaleString()}
                    </p>
                  </div>
                ) : null}
                <div className="col-span-2 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Return date</Label>
                  <Input
                    type="date"
                    className="mt-1 max-w-[200px]"
                    value={saleReturnDate}
                    onChange={(e) => setSaleReturnDate(e.target.value)}
                  />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
                  <Textarea
                    className="mt-1 min-h-[72px] resize-y"
                    placeholder="Reason for return…"
                    value={saleReturnReason}
                    onChange={(e) => setSaleReturnReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="w-full min-w-0 overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b">
                    <TableRow>
                      <TableHead>Part no</TableHead>
                      <TableHead className="min-w-[160px]">Description</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Returned (part)</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right w-[120px]">Return qty</TableHead>
                      <TableHead className="text-right">
                        Line {saleReturnMoney.isTaxInvoice ? "(excl. tax)" : "return"}
                      </TableHead>
                      {saleReturnMoney.isTaxInvoice ? (
                        <TableHead className="text-right">Line GST</TableHead>
                      ) : null}
                      {saleReturnMoney.isTaxInvoice ? (
                        <TableHead className="text-right">Line (incl. tax)</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleReturnInvoice.items.map((item) => {
                      const retSoFar = saleReturnReturnedByPartId[item.partId] || 0;
                      const lineCap = lineReturnableCapForDraft(
                        item,
                        saleReturnInvoice.items,
                        saleReturnQtyDraft,
                        saleReturnReturnedByPartId,
                      );
                      const delivered = Number(item.deliveredQty) || 0;
                      const rq = effectiveReturnQtyFromDraft(
                        saleReturnQtyDraft[item.id],
                        lineCap,
                      );
                      const lineExcl = rq * item.unitPrice;
                      const gstPct = saleReturnMoney.gstPct;
                      const lineGst =
                        saleReturnMoney.isTaxInvoice && rq > 0
                          ? Math.round(((lineExcl * gstPct) / 100) * 100) / 100
                          : 0;
                      const lineIncl =
                        saleReturnMoney.isTaxInvoice && rq > 0
                          ? Math.round((lineExcl + lineGst) * 100) / 100
                          : lineExcl;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.partNo}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.description || "—"}
                          </TableCell>
                          <TableCell className="text-right">{item.orderedQty}</TableCell>
                          <TableCell className="text-right">{item.deliveredQty}</TableCell>
                          <TableCell className="text-right text-xs">{retSoFar}</TableCell>
                          <TableCell className="text-right">
                            Rs {item.unitPrice.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              className="h-8 w-24 text-right ml-auto"
                              disabled={lineCap <= 0}
                              value={
                                lineCap <= 0
                                  ? ""
                                  : (saleReturnQtyDraft[item.id] ?? "")
                              }
                              placeholder={lineCap <= 0 ? "—" : "0"}
                              title={
                                lineCap <= 0 && delivered > 0
                                  ? "Nothing left to return on this line (already fully returned vs delivered)."
                                  : lineCap > 0
                                    ? `Max return qty this time: ${lineCap} (delivered ${delivered}, already returned ${retSoFar} on this part)`
                                    : undefined
                              }
                              onChange={(e) => {
                                const onlyDigits = e.target.value.replace(/\D/g, "");
                                setSaleReturnQtyDraft((prev) => ({
                                  ...prev,
                                  [item.id]: onlyDigits,
                                }));
                              }}
                              onBlur={() => {
                                setSaleReturnQtyDraft((prev) => {
                                  const t = prev[item.id] ?? "";
                                  if (t === "") return prev;
                                  let n = parseInt(t, 10);
                                  if (Number.isNaN(n) || n < 0) {
                                    return { ...prev, [item.id]: "" };
                                  }
                                  const capNow = lineReturnableCapForDraft(
                                    item,
                                    saleReturnInvoice.items,
                                    prev,
                                    saleReturnReturnedByPartId,
                                  );
                                  n = Math.min(n, capNow);
                                  return { ...prev, [item.id]: n === 0 ? "" : String(n) };
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {rq > 0 ? `Rs ${lineExcl.toLocaleString()}` : "—"}
                          </TableCell>
                          {saleReturnMoney.isTaxInvoice ? (
                            <TableCell className="text-right text-sm">
                              {rq > 0 ? `Rs ${lineGst.toLocaleString()}` : "—"}
                            </TableCell>
                          ) : null}
                          {saleReturnMoney.isTaxInvoice ? (
                            <TableCell className="text-right text-sm font-medium">
                              {rq > 0 ? `Rs ${lineIncl.toLocaleString()}` : "—"}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm shrink-0">
                {saleReturnMoney.isTaxInvoice ? (
                  <>
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">
                        Return subtotal (excl. tax)
                      </span>
                      <span className="font-medium tabular-nums text-foreground">
                        Rs {saleReturnMoney.subtotalExclTax.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">
                        GST @ {saleReturnMoney.gstPct}%
                      </span>
                      <span className="font-medium tabular-nums text-foreground">
                        Rs {saleReturnMoney.taxAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border pt-2 font-semibold">
                      <span>Return total (incl. tax, before deduction)</span>
                      <span className="tabular-nums">
                        Rs {saleReturnMoney.totalInclTax.toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">
                      Return amount
                      {saleReturnNet.showDeductionRow ? " (before deduction)" : ""}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      Rs {saleReturnMoney.subtotalExclTax.toLocaleString()}
                    </span>
                  </div>
                )}

                {saleReturnNet.showDeductionRow ? (
                  <>
                    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <Label
                        htmlFor="sale-return-deduction"
                        className="text-muted-foreground shrink-0"
                      >
                        Deduction (invoice discount)
                      </Label>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Input
                          id="sale-return-deduction"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          className="h-9 w-36 text-right tabular-nums"
                          placeholder="0"
                          value={saleReturnDeductionDraft}
                          onChange={(e) => {
                            let v = e.target.value.replace(/[^\d.]/g, "");
                            const dot = v.indexOf(".");
                            if (dot !== -1) {
                              v =
                                v.slice(0, dot + 1) +
                                v.slice(dot + 1).replace(/\./g, "");
                            }
                            setSaleReturnDeductionDraft(v);
                            setSaleReturnDeductionTouched(true);
                          }}
                          onBlur={() => {
                            const base = saleReturnMoney.isTaxInvoice
                              ? saleReturnMoney.totalInclTax
                              : saleReturnMoney.subtotalExclTax;
                            const cap = Math.max(
                              0,
                              Math.round(base * 100) / 100,
                            );
                            let d = parseSaleReturnDeductionDraft(
                              saleReturnDeductionDraft,
                            );
                            if (d > cap) d = cap;
                            setSaleReturnDeductionDraft(
                              d > 0 ? String(d) : "",
                            );
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          Max Rs {saleReturnNet.maxDeduction.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border pt-2 text-base font-semibold">
                      <span>Net return total</span>
                      <span className="tabular-nums">
                        Rs {saleReturnNet.net.toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="space-y-3 rounded-md border bg-muted/20 px-3 py-3 text-sm shrink-0">
                <p className="font-medium text-foreground">
                  {saleReturnInvoice.customerType === "walking"
                    ? "Refund to customer (walk-in)"
                    : "Refund to customer (on approve)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {saleReturnInvoice.customerType === "walking"
                    ? saleReturnNet.net > 0
                      ? "Amount to pay matches the net return (after tax and discount when applicable). Choose the cash or bank account to refund from."
                      : "Add return quantities to see the refund amount."
                    : `Enter an amount to pay only if you want a refund on approve, up to the net return (Rs ${saleReturnNet.net.toLocaleString()}). Leave blank for no payment on this return.`}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="sale-return-pay-account">
                    Cash / bank account
                    {saleReturnInvoice.customerType === "walking" &&
                    saleReturnNet.net > 0
                      ? " (required)"
                      : ""}
                  </Label>
                  <Select
                    value={saleReturnPaymentAccountId || undefined}
                    onValueChange={(v) => {
                      setSaleReturnPaymentAccountId(v);
                    }}
                    disabled={
                      loadingAccounts ||
                      (saleReturnInvoice.customerType === "walking" &&
                        saleReturnNet.net <= 0)
                    }
                  >
                    <SelectTrigger id="sale-return-pay-account">
                      <SelectValue
                        placeholder={
                          saleReturnInvoice.customerType === "walking"
                            ? saleReturnNet.net > 0
                              ? "Select cash or bank…"
                              : "—"
                            : "Optional — select if paying customer now"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50">
                        Cash
                      </div>
                      {cashAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.code || "—"})
                        </SelectItem>
                      ))}
                      <div className="mt-1 p-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50">
                        Bank
                      </div>
                      {bankAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.code || "Bank"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sale-return-paid-amt">Amount to pay</Label>
                  <Input
                    id="sale-return-paid-amt"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    readOnly={saleReturnInvoice.customerType === "walking"}
                    className={
                      saleReturnInvoice.customerType === "walking"
                        ? "h-9 max-w-[11rem] cursor-default bg-muted/50 text-right tabular-nums"
                        : "h-9 max-w-[11rem] text-right tabular-nums"
                    }
                    placeholder="0"
                    value={saleReturnRefundPaidDraft}
                    onChange={(e) => {
                      if (saleReturnInvoice.customerType === "walking") return;
                      let v = e.target.value.replace(/[^\d.]/g, "");
                      const dot = v.indexOf(".");
                      if (dot !== -1) {
                        v =
                          v.slice(0, dot + 1) +
                          v.slice(dot + 1).replace(/\./g, "");
                      }
                      setSaleReturnRefundPaidDraft(v);
                      setSaleReturnRefundPaidTouched(true);
                    }}
                    onBlur={() => {
                      if (saleReturnInvoice.customerType === "walking") return;
                      const cap = Math.max(
                        0,
                        Math.round(saleReturnNet.net * 100) / 100,
                      );
                      let p = parseSaleReturnDeductionDraft(
                        saleReturnRefundPaidDraft,
                      );
                      if (p > cap) p = cap;
                      setSaleReturnRefundPaidDraft(p > 0 ? String(p) : "");
                    }}
                  />
                </div>
              </div>
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background pt-4 mt-0 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submittingSaleReturn}
                  onClick={() => setShowSaleReturnDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={submittingSaleReturn}
                  onClick={() => void handleSubmitSaleReturn()}
                >
                  {submittingSaleReturn ? "Saving…" : "Create return"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reverse Quantity Dialog */}
      <AlertDialog open={showReverseDialog} onOpenChange={setShowReverseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-orange-600" />
              Reverse Quantity to Stock
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemsToReverse.length > 0 && (
                <div className="space-y-4">
                  <p>
                    Are you sure you want to reverse back the remaining qty of{" "}
                    {itemsToReverse.length} item(s)?
                  </p>
                  <div className="text-sm bg-muted p-3 rounded max-h-40 overflow-y-auto">
                    {itemsToReverse.map((item) => (
                      <div
                        key={item.id}
                        className="mb-2 pb-2 border-b last:border-0"
                      >
                        <p>
                          <strong>Part:</strong> {item.partNo}
                        </p>
                        <p>
                          <strong>Pending Qty:</strong> {item.pendingQty || 0}{" "}
                          units
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setItemsToReverse([]);
                setReverseQuantities({});
              }}
              disabled={reversing}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReverseQuantity}
              disabled={reversing}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {reversing ? "Reversing..." : "Yes, Reverse to Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
