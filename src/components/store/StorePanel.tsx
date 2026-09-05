import { formatUiDate } from "@/utils/dateUtils";
import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { apiClient } from "@/lib/api";
import { useNotifications } from "@/contexts/NotificationContext";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Package,
  Calendar as CalendarIcon,
  Bell,
  CheckCircle,
  Printer,
  Eye,
  Search,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  List,
  Trash,
  Edit,
  MapPin,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { StoreOrderDetail } from "./StoreOrderDetail";
import { StoreReceipt } from "./StoreReceipt";
import { StorePurchaseOrderDetail } from "./StorePurchaseOrderDetail";
import { StoreSalesInvoiceReceipt } from "./StoreSalesInvoiceReceipt";
import { StoreEditDPO } from "./StoreEditDPO";
import { StoreEditPO } from "./StoreEditPO";
import { StoreEditSalesInvoice } from "./StoreEditSalesInvoice";
import { usePageActions } from "@/permissions/pageActions";
import { StoreLocationAssign } from "./StoreLocationAssign";
import { printDeliveryChallan, getChallanItemLocation } from "@/lib/printDeliveryChallan";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { getUserRole, isStoreUserRole } from "@/utils/auth";
import { resolveInvoiceLinePartFields } from "@/utils/invoiceLinePart";
import { SalesInquiry } from "@/components/sales/SalesInquiry";
import {
  performedByPayload,
  useStoreOperatorAuth,
} from "@/hooks/useStoreOperatorAuth";

const ORDER_TABLE_DATE_CLASS = "whitespace-nowrap min-w-[6.5rem] w-[6.5rem]";

interface DirectPurchaseOrderItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  origin?: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  amount: number;
  rackId?: string;
  shelfId?: string;
  rackCode?: string;
  shelfNo?: string;
  rackStoreId?: string | null;
  rackStoreName?: string | null;
}

interface DirectPurchaseOrder {
  id: string;
  dpo_no: string;
  po_number?: string;
  date: string;
  store_id: string;
  store_name: string;
  supplier_id?: string;
  supplier_name?: string;
  branch_account_name?: string;
  branch_account_id?: string;
  order_type?: string;
  account?: string;
  description?: string;
  status: string;
  total_amount: number;
  items_count: number;
  total_quantity?: number;
  expenses_count: number;
  created_at: string;
  items?: DirectPurchaseOrderItem[];
}

type StoreOrderTypeFilter =
  | "all"
  | "receiving-po"
  | "receiving-dpo"
  | "stock-out"
  | "transfer-in"
  | "transfer-out"
  | "part-association";

const STOCK_OUT_BLOCKED_STATUSES = new Set([
  "pending",
  "fully_delivered",
  "reversed",
  "partially_reversed",
  "cancelled",
  "return",
  "partially_return",
]);

function isStockOutBlocked(status: string | undefined | null): boolean {
  return STOCK_OUT_BLOCKED_STATUSES.has(String(status || "").toLowerCase());
}

function getStockOutButtonLabel(status: string | undefined | null): string {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "fully_delivered") return "Delivered";
  if (s === "reversed" || s === "partially_reversed") return "Reversed";
  if (s === "cancelled") return "Cancelled";
  if (s === "return") return "Returned";
  if (s === "partially_return") return "Partially Return";
  return "Stock Out";
}

function formatPurchaseOrderStatusLabel(status?: string | null) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "purchase invoice pending") return "Invoice Pending";
  if (normalized === "stock receiving pending") return "Stock Receiving Pending";
  if (normalized === "received") return "Received";
  if (normalized === "pending") return "Pending";
  if (normalized === "draft") return "Draft";
  return String(status || "-");
}

function getPurchaseOrderStatusBadgeClass(status?: string | null) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "pending") {
    return "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-100";
  }
  if (normalized === "purchase invoice pending") {
    return "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100";
  }
  if (normalized === "stock receiving pending") {
    return "border-transparent bg-sky-100 text-sky-800 hover:bg-sky-100";
  }
  if (normalized === "received") {
    return "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }
  if (normalized === "draft") {
    return "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-100";
  }
  return "border-transparent bg-muted text-muted-foreground hover:bg-muted";
}

function resolveDpoSupplierName(order: any): string {
  return (
    order.supplier_name ||
    order.supplier?.companyName ||
    order.supplier?.name ||
    "N/A"
  );
}

function getDpoPartyLabel(order: DirectPurchaseOrder): string {
  if (order.order_type === "transfer_in") {
    return order.branch_account_name || order.store_name || "N/A";
  }
  return order.supplier_name || "N/A";
}

const mapApiDpoToStoreOrder = (order: any): DirectPurchaseOrder => ({
  id: order.id,
  dpo_no: order.dpo_no || order.dpoNumber,
  date: order.date,
  store_id: order.store_id || order.storeId,
  store_name: order.store_name || order.store?.name || "N/A",
  supplier_id: order.supplier_id || order.supplierId,
  supplier_name: resolveDpoSupplierName(order),
  branch_account_id: order.branch_account_id || order.branchAccountId,
  branch_account_name:
    order.branch_account_name || order.BranchAccount?.name || undefined,
  order_type: order.order_type || order.orderType,
  account: order.account,
  description: order.description,
  status: order.status || "Completed",
  total_amount: order.total_amount || order.totalAmount || 0,
  items_count: order.items_count || order.items?.length || 0,
  total_quantity:
    order.total_quantity ||
    (order.items && order.items.length > 0
      ? order.items.reduce(
          (sum: number, item: any) => sum + (item.quantity || 0),
          0,
        )
      : 0),
  expenses_count: order.expenses_count || order.expenses?.length || 0,
  created_at: order.created_at || order.createdAt,
  items: Array.isArray(order.items)
    ? order.items.map((item: any) => ({
        id: String(item.id || ""),
        partId: String(item.part_id || item.partId || ""),
        part_id: String(item.part_id || item.partId || ""),
        partNo: item.part_no || item.partNo || item.part?.partNo || "N/A",
        description:
          item.part_description || item.description || item.part?.description || "",
        brand: item.brand || item.part?.brand?.name || "N/A",
        origin: item.origin || item.part?.origin || undefined,
        quantity: Number(item.quantity) || 0,
        purchasePrice: Number(item.purchase_price ?? item.purchasePrice ?? 0),
        salePrice: Number(item.sale_price ?? item.salePrice ?? 0),
        amount: Number(
          item.amount ??
            (item.purchase_price ?? item.purchasePrice ?? 0) *
              (item.quantity ?? 0),
        ),
      }))
    : [],
});

interface Store {
  id: string;
  name: string;
  code: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  date: string;
  invoice_date?: string | null;
  supplier_name?: string;
  status: string;
  total_amount: number;
  items_count: number;
  total_quantity?: number;
  created_at: string;
  items?: Array<{
    id: string;
    partId?: string;
    part_id?: string;
    quantity: number;
  }>;
}

interface StockOutOrder {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerId?: string;
  status: string;
  grandTotal: number;
  subtotal?: number;
  overallDiscount?: number;
  items_count: number;
  deliveredTo?: string;
  remarks?: string;
  createdAt: string;
  customerType?: string;
  items?: Array<{
    id: string;
    partId: string;
    partNo: string;
    description: string;
    brand?: string;
    orderedQty: number;
    deliveredQty: number;
    pendingQty: number;
    unitPrice: number;
    discount: number;
    discountType: "percent" | "fixed";
    lineTotal: number;
    grade: string;
  }>;
}

interface StorePanelProps {
  onStoreChange?: (storeName: string) => void;
}

type StorePartOption = {
  id: string;
  partNo: string;
  masterPartNo: string;
  description: string;
  brand: string;
};

const mapRowToStorePartOption = (row: any): StorePartOption | null => {
  const id = String(row?.id || "").trim();
  if (!id) return null;

  const partNo = String(row.part_no || row.partNo || "").trim();
  const masterPartNo = String(row.master_part_no || row.masterPartNo || "").trim();
  if (!partNo && !masterPartNo) return null;

  return {
    id,
    partNo,
    masterPartNo,
    description: String(row.description || "").trim(),
    brand: String(row.brand_name || row.brandName || row.brand || "").trim(),
  };
};

const buildStorePartSelectOption = (part: StorePartOption): SearchableSelectOption => {
  const partNo = part.partNo.trim();
  const masterPartNo = part.masterPartNo.trim();
  const label =
    masterPartNo && partNo
      ? `${masterPartNo} | ${partNo}`
      : partNo || masterPartNo;
  const descParts = [part.brand, part.description].filter(Boolean);

  return {
    value: part.id,
    label,
    description: descParts.length ? descParts.join(" · ") : undefined,
  };
};

const mapInvoiceLineItems = (invoice: any) => {
  const rawItems =
    invoice.SalesInvoiceItem ||
    invoice.salesInvoiceItem ||
    invoice.items ||
    [];
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item: any) => {
    const linePart = resolveInvoiceLinePartFields(item);
    return {
    id: String(item.id || ""),
    partId: String(item.partId || item.part_id || ""),
    part_id: String(item.partId || item.part_id || ""),
    partNo: linePart.partNo,
    description: linePart.description,
    orderedQty: Number(item.orderedQty ?? item.ordered_qty) || 0,
    deliveredQty: Number(item.deliveredQty ?? item.delivered_qty) || 0,
    pendingQty: Number(item.pendingQty ?? item.pending_qty) || 0,
    unitPrice: Number(item.unitPrice ?? item.unit_price) || 0,
    discount: Number(item.discount) || 0,
    discountType: (item.discountType || item.discount_type || "percent") as
      | "percent"
      | "fixed",
    lineTotal: Number(item.lineTotal ?? item.line_total) || 0,
    grade: item.grade || "A",
  };
  });
};

const orderContainsSelectedPart = (
  partId: string,
  items?: Array<{ partId?: string; part_id?: string }> | null,
): boolean => {
  if (!partId) return true;
  if (!items?.length) return false;
  return items.some(
    (item) => String(item.partId || item.part_id || "") === partId,
  );
};

export const StorePanel = ({ onStoreChange }: StorePanelProps) => {
  const { addNotification } = useNotifications();
  const [searchParams] = useSearchParams();
  const { canEdit, canApprove, canPrint } = usePageActions("store.orders");
  const { requiresOperatorAuth, requestOperatorAuth } = useStoreOperatorAuth();
  const isStoreOnlyUser = getUserRole() === "store" || isStoreUserRole();
  const [orders, setOrders] = useState<DirectPurchaseOrder[]>([]);
  const [transferInOrders, setTransferInOrders] = useState<DirectPurchaseOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [stockOutOrders, setStockOutOrders] = useState<StockOutOrder[]>([]);
  const [transferOutOrders, setTransferOutOrders] = useState<StockOutOrder[]>([]);
  const [partOptions, setPartOptions] = useState<StorePartOption[]>([]);
  const [associationLoading, setAssociationLoading] = useState(false);
  const hasInitializedStockOutRef = useRef(false);
  const notifiedApprovedInvoiceIdsRef = useRef<Set<string>>(new Set());
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPartId, setFilterPartId] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<StoreOrderTypeFilter>("all");
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewPODialogOpen, setViewPODialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDPODialogOpen, setEditDPODialogOpen] = useState(false);
  const [editPODialogOpen, setEditPODialogOpen] = useState(false);
  const [locationAssignDialogOpen, setLocationAssignDialogOpen] = useState(false);
  const [locationAssignOrder, setLocationAssignOrder] = useState<DirectPurchaseOrder | null>(null);
  const [locationAssignOrderKind, setLocationAssignOrderKind] = useState<"dpo" | "po">("dpo");
  const [selectedOrder, setSelectedOrder] = useState<DirectPurchaseOrder | null>(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [selectedPurchaseOrderFull, setSelectedPurchaseOrderFull] = useState<any>(null);
  const [receivingOrderType, setReceivingOrderType] = useState<"dpo" | "po" | null>(null);
  const [receiveDate, setReceiveDate] = useState("");
  const [deleteOrderType, setDeleteOrderType] = useState<"dpo" | "po" | null>(null);
  const [selectedStockOutOrder, setSelectedStockOutOrder] = useState<StockOutOrder | null>(null);
  const [stockOutReceiptOpen, setStockOutReceiptOpen] = useState(false);

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
    void loadPartOptions(true);
  }, []);

  // Notify parent when store changes
  useEffect(() => {
    if (onStoreChange && selectedStoreId) {
      if (selectedStoreId === "all") {
        onStoreChange("All Stores");
      } else {
        const store = stores.find((s) => s.id === selectedStoreId);
        if (store) {
          onStoreChange(store.name);
        }
      }
    }
  }, [selectedStoreId, stores, onStoreChange]);

  // Fetch orders when store or filters change
  useEffect(() => {
    if (selectedStoreId) {
      if (typeFilter === "receiving-po") {
        fetchPurchaseOrders();
        setOrders([]);
        setStockOutOrders([]);
        setTransferInOrders([]);
        setTransferOutOrders([]);
      } else if (typeFilter === "receiving-dpo") {
        fetchOrders();
        setPurchaseOrders([]);
        setStockOutOrders([]);
        setTransferInOrders([]);
        setTransferOutOrders([]);
      } else if (typeFilter === "stock-out") {
        fetchStockOutOrders();
        setOrders([]);
        setPurchaseOrders([]);
        setTransferInOrders([]);
        setTransferOutOrders([]);
      } else if (typeFilter === "transfer-in") {
        fetchTransferInOrders();
        setOrders([]);
        setPurchaseOrders([]);
        setStockOutOrders([]);
        setTransferOutOrders([]);
      } else if (typeFilter === "transfer-out") {
        fetchTransferOutOrders();
        setOrders([]);
        setPurchaseOrders([]);
        setStockOutOrders([]);
        setTransferInOrders([]);
      } else if (typeFilter === "part-association") {
        setOrders([]);
        setPurchaseOrders([]);
        setStockOutOrders([]);
        if (isStoreOnlyUser) {
          fetchAssociationParts();
        }
      } else {
        // All Orders - fetch everything (Receiving + Delivering)
        fetchPurchaseOrders();
        fetchOrders();
        fetchStockOutOrders();
      }

      // Store users should keep receiving approved-invoice notifications
      // even when they are not currently on Sales Stock Out.
      if (isStoreOnlyUser && typeFilter !== "stock-out" && typeFilter !== "all") {
        fetchStockOutOrders(true);
      }
    }
  }, [selectedStoreId, statusFilter, typeFilter, filterPartId]);

  useEffect(() => {
    if (!filterPartId) return;
    setOrders([]);
    setPurchaseOrders([]);
    setStockOutOrders([]);
    setTransferInOrders([]);
    setTransferOutOrders([]);
  }, [filterPartId]);

  // Support deep-linking to a specific filter, e.g. /store/orders?type=stock-out
  useEffect(() => {
    const requestedType = String(searchParams.get("type") || "")
      .trim()
      .toLowerCase();
    if (!requestedType) return;

    // Legacy combined receiving link maps to the PO receiving list.
    const normalizedType =
      requestedType === "receiving" ? "receiving-po" : requestedType;

    const allowedTypes = [
      "all",
      "receiving-po",
      "receiving-dpo",
      "stock-out",
      "transfer-in",
      "transfer-out",
      ...(isStoreOnlyUser ? ["part-association"] : []),
    ] as const;

    if (
      (allowedTypes as readonly string[]).includes(normalizedType) &&
      normalizedType !== typeFilter
    ) {
      setTypeFilter(normalizedType as StoreOrderTypeFilter);
    }
  }, [searchParams, typeFilter, isStoreOnlyUser]);

  // Poll for new orders every 30 seconds
  useEffect(() => {
    if (!selectedStoreId) return;

    const interval = setInterval(() => {
      // Keep the currently selected view up-to-date, with newest orders on top.
      if (typeFilter === "receiving-po") {
        fetchPurchaseOrders(true);
      } else if (typeFilter === "receiving-dpo") {
        fetchOrders(true);
      } else if (typeFilter === "stock-out") {
        fetchStockOutOrders(true);
      } else if (typeFilter === "transfer-in") {
        fetchTransferInOrders(true);
      } else if (typeFilter === "transfer-out") {
        fetchTransferOutOrders(true);
      } else if (typeFilter === "part-association") {
        if (isStoreOnlyUser) fetchAssociationParts(true);
      } else {
        fetchPurchaseOrders(true);
        fetchOrders(true);
        fetchStockOutOrders(true);
        fetchTransferInOrders(true);
        fetchTransferOutOrders(true);
      }

      if (isStoreOnlyUser && typeFilter !== "stock-out" && typeFilter !== "all") {
        fetchStockOutOrders(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedStoreId, typeFilter, statusFilter, filterPartId, isStoreOnlyUser]);

  const loadPartOptions = async (silent = false) => {
    try {
      if (!silent) setAssociationLoading(true);
      const response = await apiClient.getPartEntryList({ limit: 10000, page: 1 });
      const rawRows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      const mapped = rawRows
        .map(mapRowToStorePartOption)
        .filter((row): row is StorePartOption => row !== null);
      setPartOptions(mapped);
    } catch (error: any) {
      if (!silent) toast.error(error?.error || "Failed to load items");
    } finally {
      if (!silent) setAssociationLoading(false);
    }
  };

  const fetchAssociationParts = async (silent = false) => {
    await loadPartOptions(silent);
  };

  const itemFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "", label: "All items" },
      ...partOptions.map(buildStorePartSelectOption),
    ],
    [partOptions],
  );

  const fetchStores = async () => {
    try {
      const response = await apiClient.getStores("active");
      const storesData = response.data || response;
      if (Array.isArray(storesData) && storesData.length > 0) {
        const formattedStores = storesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          code: s.code || s.id,
        }));
        setStores(formattedStores);
        // Auto-select "All Stores" if available
        if (!selectedStoreId && formattedStores.length > 0) {
          setSelectedStoreId("all");
        }
      }
    } catch (error: any) {
      toast.error("Failed to fetch stores");
    }
  };

  const fetchOrders = async (silent = false) => {
    if (!selectedStoreId) return;

    try {
      if (!silent) setLoading(true);
      const response = await apiClient.getDirectPurchaseOrders({
        store_id: selectedStoreId === "all" ? undefined : selectedStoreId,
        status: statusFilter !== "all" ? statusFilter : undefined,
        part_id: filterPartId || undefined,
        page: 1,
        limit: filterPartId ? 1000 : 200,
      });

      const ordersData = response.data || response;
      if (Array.isArray(ordersData)) {
        const formattedOrders = ordersData.map(mapApiDpoToStoreOrder);

        // Check for new orders and show notifications
        if (!silent && orders.length > 0) {
          const newOrders = formattedOrders.filter(
            (newOrder: DirectPurchaseOrder) =>
              !orders.find((oldOrder) => oldOrder.id === newOrder.id)
          );

          newOrders.forEach((order: DirectPurchaseOrder) => {
            addNotification({
              title: "New Local Purchase Order",
              message: `DPO ${order.dpo_no} has been created for your store.`,
              type: "info",
              module: "store",
              action: {
                label: "View Order",
                path: `/store/orders?type=receiving-dpo`,
              },
            });
          });
        }

        setOrders(formattedOrders);
      }
    } catch (error: any) {
      if (!silent) {
        toast.error(error.error || "Failed to fetch orders");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchTransferInOrders = async (silent = false) => {
    if (!selectedStoreId) return;

    try {
      if (!silent) setLoading(true);
      const response = await apiClient.getDirectPurchaseOrders({
        store_id: selectedStoreId === "all" ? undefined : selectedStoreId,
        status: statusFilter !== "all" ? statusFilter : undefined,
        order_type: "transfer_in",
        part_id: filterPartId || undefined,
        page: 1,
        limit: filterPartId ? 1000 : 200,
      });

      const ordersData = response.data || response;
      if (Array.isArray(ordersData)) {
        const formattedOrders = ordersData.map(mapApiDpoToStoreOrder);

        if (!silent && transferInOrders.length > 0) {
          const newOrders = formattedOrders.filter(
            (newOrder: DirectPurchaseOrder) =>
              !transferInOrders.find((oldOrder) => oldOrder.id === newOrder.id),
          );
          newOrders.forEach((order: DirectPurchaseOrder) => {
            addNotification({
              title: "New Transfer In",
              message: `Transfer In ${order.dpo_no} has been created for your store.`,
              type: "info",
              module: "store",
              action: {
                label: "View Order",
                path: `/store/orders?type=transfer-in`,
              },
            });
          });
        }

        setTransferInOrders(formattedOrders);
      }
    } catch (error: any) {
      if (!silent) {
        toast.error(error.error || "Failed to fetch transfer in orders");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchOrderDetails = async (orderId: string) => {
    try {
      const response = await apiClient.getDirectPurchaseOrder(orderId);
      const orderData: any = response.data || response;

      if (orderData && typeof orderData === 'object') {
        const formattedOrder: DirectPurchaseOrder = {
          id: orderData.id || '',
          dpo_no: orderData.dpo_no || orderData.dpoNumber || '',
          date: orderData.date || new Date().toISOString(),
          store_id: orderData.store_id || orderData.storeId || '',
          store_name: orderData.store_name || orderData.store?.name || "N/A",
          supplier_id: orderData.supplier_id || orderData.supplierId,
          supplier_name: resolveDpoSupplierName(orderData),
          branch_account_id: orderData.branch_account_id || orderData.branchAccountId,
          branch_account_name: orderData.branch_account_name,
          order_type: orderData.order_type || orderData.orderType,
          account: orderData.account,
          description: orderData.description,
          status: orderData.status || "Completed",
          total_amount: orderData.total_amount || orderData.totalAmount || 0,
          items_count: Array.isArray(orderData.items) ? orderData.items.length : 0,
          expenses_count: Array.isArray(orderData.expenses) ? orderData.expenses.length : 0,
          created_at: orderData.created_at || orderData.createdAt || new Date().toISOString(),
          items: Array.isArray(orderData.items)
            ? orderData.items.map((item: any) => ({
              id: item.id || '',
              partId: item.part_id || item.partId || '',
              partNo: item.part_no || (item.part?.partNo) || "N/A",
              description: item.part_description || (item.part?.description) || item.description || "",
              brand: item.brand || (item.part?.brand?.name) || "N/A",
              origin: item.origin || item.part?.origin || undefined,
              quantity: item.quantity || 0,
              uom: item.uom || item.part?.uom || "pcs",
              purchasePrice: item.purchase_price || item.purchasePrice || 0,
              salePrice: item.sale_price || item.salePrice || 0,
              amount: item.amount || ((item.purchase_price || item.purchasePrice || 0) * (item.quantity || 0)),
              rackId: item.rack_id || item.rackId || null,
              shelfId: item.shelf_id || item.shelfId || null,
              rackCode: item.rack_name || (item.rack?.codeNo) || null,
              shelfNo: item.shelf_name || (item.shelf?.shelfNo) || null,
              rackStoreId: item.rack_store_id || item.rackStoreId || null,
              rackStoreName: item.rack_store_name || item.rackStoreName || null,
            }))
            : [],
        };
        return formattedOrder;
      }
    } catch (error: any) {
      toast.error("Failed to fetch order details");
    }
    return null;
  };

  const fetchPurchaseOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await apiClient.getPurchaseOrders({
        status: statusFilter !== "all" ? statusFilter : undefined,
        part_id: filterPartId || undefined,
        page: 1,
        limit: filterPartId ? 1000 : 200,
      });

      const responseData: any = response.data || response;
      let ordersArray: any[] = [];

      if (Array.isArray(responseData)) {
        ordersArray = responseData;
      } else if (responseData && Array.isArray(responseData.data)) {
        ordersArray = responseData.data;
      }

      if (ordersArray.length > 0) {
        const formattedOrders = ordersArray.map((order: any) => {
          // Calculate total quantity from items if available
          const total_quantity = order.items && order.items.length > 0
            ? order.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
            : 0;

          return {
            id: order.id,
            po_number: order.po_number || order.poNumber,
            date: order.date,
            invoice_date: order.invoice_date ?? order.invoiceDate ?? null,
            supplier_name: order.supplier_name || order.supplier?.companyName || "N/A",
            status: order.status || "Draft",
            total_amount: order.total_amount || order.totalAmount || 0,
            items_count: order.items_count || order.items?.length || 0,
            total_quantity: total_quantity,
            items: order.items || [],
            created_at: order.created_at || order.createdAt,
          };
        });
        setPurchaseOrders(formattedOrders);
      } else {
        setPurchaseOrders([]);
      }
    } catch (error: any) {
      if (!silent) toast.error(error.error || "Failed to fetch purchase orders");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchStockOutOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // Fetch ALL invoices (both walking/cash and registered/party) without status filter
      const response = await apiClient.getSalesInvoices({
        ...(filterPartId ? { partId: filterPartId } : {}),
      });

      const invoicesData = Array.isArray(response) ? response : (response.data || []);
      if (Array.isArray(invoicesData)) {
        const formattedInvoices = invoicesData
          .filter(
            (invoice: any) =>
              String(invoice.customerType || invoice.customer_type || "")
                .toLowerCase() !== "transfer",
          )
          .map((invoice: any) => ({
            id: invoice.id,
            invoiceNo: invoice.invoiceNo,
            invoiceDate: invoice.invoiceDate || invoice.invoice_date,
            customerName: invoice.customerName || invoice.customer_name,
            status: invoice.status || "pending",
            grandTotal: invoice.grandTotal || invoice.grand_total || 0,
            items_count:
              Number(invoice.items_count) ||
              (Array.isArray(invoice.SalesInvoiceItem)
                ? invoice.SalesInvoiceItem.length
                : 0) ||
              (Array.isArray(invoice.items) ? invoice.items.length : 0),
            deliveredTo: invoice.deliveredTo || invoice.delivered_to,
            createdAt: invoice.createdAt || invoice.created_at,
            customerType: invoice.customerType || 'walking',
            items: mapInvoiceLineItems(invoice),
          }));

        if (isStoreOnlyUser) {
          const previousStatusById = new Map(
            stockOutOrders.map((invoice) => [
              invoice.id,
              String(invoice.status || "").toLowerCase(),
            ]),
          );
          const nowMs = Date.now();
          const newlyApprovedInvoices = formattedInvoices.filter((invoice) => {
            const currentStatus = String(invoice.status || "").toLowerCase();
            if (currentStatus !== "approved") return false;
            if (notifiedApprovedInvoiceIdsRef.current.has(invoice.id)) return false;
            const previousStatus = previousStatusById.get(invoice.id);
            if (previousStatus && previousStatus !== "approved") return true;
            if (!previousStatus && !hasInitializedStockOutRef.current) {
              const createdAtMs = invoice.createdAt
                ? new Date(invoice.createdAt).getTime()
                : NaN;
              // On first fetch, only notify for recently approved invoices
              // to avoid old-notification spam on page load.
              if (!Number.isNaN(createdAtMs) && nowMs - createdAtMs <= 15 * 60 * 1000) {
                return true;
              }
            }
            if (!previousStatus && hasInitializedStockOutRef.current) return true;
            return false;
          });

          newlyApprovedInvoices.forEach((invoice) => {
            notifiedApprovedInvoiceIdsRef.current.add(invoice.id);
            addNotification({
              title: "New Invoice Approved",
              message: `New invoice (${invoice.invoiceNo || "N/A"}) is created and approved. Refresh the page to view invoice in Sales Stock Out.`,
              type: "info",
              module: "store",
              action: {
                label: "Open Sales Stock Out",
                path: "/store/orders?type=stock-out",
              },
            });
          });
        }

        hasInitializedStockOutRef.current = true;
        setStockOutOrders(formattedInvoices);
      } else {
        hasInitializedStockOutRef.current = true;
        setStockOutOrders([]);
      }
    } catch (error: any) {
      if (!silent) toast.error(error.error || "Failed to fetch sales invoices");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchTransferOutOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await apiClient.getSalesInvoices({
        customerType: "transfer",
        ...(filterPartId ? { partId: filterPartId } : {}),
      });

      const invoicesData = Array.isArray(response) ? response : (response.data || []);
      if (Array.isArray(invoicesData)) {
        const formattedInvoices = invoicesData.map((invoice: any) => ({
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          invoiceDate: invoice.invoiceDate || invoice.invoice_date,
          customerName:
            invoice.customerName ||
            invoice.customer_name ||
            invoice.branch_account_name ||
            "Branch",
          status: invoice.status || "pending",
          grandTotal: invoice.grandTotal || invoice.grand_total || 0,
          items_count:
            Number(invoice.items_count) ||
            (Array.isArray(invoice.SalesInvoiceItem)
              ? invoice.SalesInvoiceItem.length
              : 0) ||
            (Array.isArray(invoice.items) ? invoice.items.length : 0),
          deliveredTo: invoice.deliveredTo || invoice.delivered_to,
          createdAt: invoice.createdAt || invoice.created_at,
          customerType: "transfer",
          items: mapInvoiceLineItems(invoice),
        }));
        setTransferOutOrders(formattedInvoices);
      } else {
        setTransferOutOrders([]);
      }
    } catch (error: any) {
      if (!silent) {
        toast.error(error.error || "Failed to fetch transfer out orders");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleViewOrder = async (order: DirectPurchaseOrder) => {
    try {
      const fullOrder = await fetchOrderDetails(order.id);
      if (fullOrder) {
        setSelectedOrder(fullOrder);
        setViewDialogOpen(true);
      } else {
        toast.error("Failed to load order details");
      }
    } catch (error: any) {
      toast.error("Failed to load order details");
    }
  };

  const handlePrintReceipt = async (order: DirectPurchaseOrder) => {
    const fullOrder = await fetchOrderDetails(order.id);
    if (fullOrder) {
      setSelectedOrder(fullOrder);
      setReceiptDialogOpen(true);
    }
  };

  const handlePrintStockOutReceipt = async (order: StockOutOrder) => {
    try {
      if (isStockOutBlocked(order.status)) {
        const s = String(order.status || "").toLowerCase();
        if (s === "fully_delivered") {
          toast.info("This invoice is already fully delivered and cannot be processed for stock out.");
        } else if (s === "reversed" || s === "partially_reversed") {
          toast.info("This invoice has been reversed and cannot be processed for stock out.");
        } else if (s === "cancelled") {
          toast.info("This invoice has been cancelled and cannot be processed for stock out.");
        } else if (s === "return" || s === "partially_return") {
          toast.info("This invoice has sales returns recorded and cannot be processed for stock out.");
        } else if (s === "pending") {
          toast.info("Approve the invoice before recording stock out.");
        } else {
          toast.info("Stock out is not available for this invoice status.");
        }
        return;
      }

      // Fetch full invoice details
      const response = await apiClient.getSalesInvoice(order.id);
      const invoiceData: any = response.data || response;

      if (invoiceData) {
        // Backend returns items under SalesInvoiceItem (Prisma relation name)
        const rawItems = invoiceData.SalesInvoiceItem || invoiceData.items || [];
        const orderWithItems = {
          ...order,
          items: rawItems.map((item: any) => {
            const linePart = resolveInvoiceLinePartFields(item);
            return {
            id: item.id,
            partId: item.partId || item.part_id || "",
            partNo: linePart.partNo,
            description: linePart.description,
            orderedQty: item.orderedQty || item.ordered_qty || 0,
            deliveredQty: item.deliveredQty || item.delivered_qty || 0,
            unitPrice: item.unitPrice || item.unit_price || 0,
            lineTotal: item.lineTotal || item.line_total || 0,
            invoiceRackShelf: Array.isArray(item.InvoiceRackShelf)
              ? item.InvoiceRackShelf.map((irs: any) => ({
                  storeId: irs.storeId ?? irs.store_id ?? null,
                  rackId: irs.rackId ?? irs.rack_id ?? null,
                  shelfId: irs.shelfId ?? irs.shelf_id ?? null,
                  quantity: Number(irs.quantity || 0),
                }))
              : [],
          };
          }),
        };
        setSelectedStockOutOrder(orderWithItems as StockOutOrder);
        setStockOutReceiptOpen(true);
      }
    } catch (error: any) {
      toast.error("Failed to load invoice details");
    }
  };

  const handlePrintDeliveryChallan = async (order: StockOutOrder) => {
    try {
      const response = await apiClient.getSalesInvoice(order.id);
      const invoiceData: any = response.data || response;
      if (!invoiceData) {
        toast.error("Failed to load invoice details for challan");
        return;
      }

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

      const rawItems = invoiceData.SalesInvoiceItem || invoiceData.items || [];
      const challanItems = rawItems.map((item: any) => {
        const location = getChallanItemLocation(
          {
            ...item,
            Part: item.Part || item.part,
          },
          invoiceData,
        );
        const linePart = resolveInvoiceLinePartFields(item);

        return {
          partNo: linePart.partNo || "-",
          ssPartNo: item?.Part?.MasterPart?.masterPartNo || item?.Part?.masterPartNo || linePart.partNo || "-",
          description: linePart.description,
          brand: linePart.brand,
          uom: "NOS",
          qty: Number(item.orderedQty || item.ordered_qty || 0),
          deliveredQty: Number(item.deliveredQty || item.delivered_qty || 0),
          pendingQty: Number(item.pendingQty || item.pending_qty || 0),
          location,
          weight: Number(item?.Part?.weight || 0),
        };
      });

      printDeliveryChallan({
        challanNo: `CH-${invoiceData.invoiceNo || order.invoiceNo}`,
        invoiceNo: invoiceData.invoiceNo || order.invoiceNo,
        invoiceDate: invoiceData.invoiceDate || order.invoiceDate,
        customerName: invoiceData.customerName || order.customerName,
        deliveredTo: invoiceData.deliveredTo || order.deliveredTo || "-",
        status: invoiceData.status || order.status,
        userName: getPrintedBy(),
        items: challanItems,
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to print delivery challan");
    }
  };

  const handleViewPurchaseOrder = async (order: PurchaseOrder) => {
    try {
      const response = await apiClient.getPurchaseOrder(order.id);
      const poData: any = response.data || response;
      if (poData) {
        setSelectedPurchaseOrder(order);
        setSelectedPurchaseOrderFull(poData);
        setViewPODialogOpen(true);
      }
    } catch (error: any) {
      toast.error("Failed to load purchase order details");
    }
  };

  const handleEditPurchaseOrder = async (order: PurchaseOrder) => {
    try {
      // Fetch full order details
      const response = await apiClient.getPurchaseOrder(order.id);
      const poData: any = response.data || response;
      if (poData) {
        setSelectedPurchaseOrderFull(poData);
        setEditPODialogOpen(true);
      }
    } catch (error: any) {
      toast.error("Failed to load purchase order details");
    }
  };

  const handleEditDPO = async (order: DirectPurchaseOrder) => {
    try {
      // Fetch full order details
      const fullOrder = await fetchOrderDetails(order.id);
      if (fullOrder) {
        setSelectedOrder(fullOrder);
        setEditDPODialogOpen(true);
      } else {
        toast.error("Failed to load order details");
      }
    } catch (error: any) {
      toast.error("Failed to load order details");
    }
  };

  const handleAssignLocation = async (order: DirectPurchaseOrder) => {
    if (order.status !== "Received") {
      toast.info("Assign Location is available after order is received");
      return;
    }
    try {
      // Fetch full order details
      const fullOrder = await fetchOrderDetails(order.id);
      if (fullOrder) {
        setLocationAssignOrderKind("dpo");
        setLocationAssignOrder(fullOrder);
        setLocationAssignDialogOpen(true);
      } else {
        toast.error("Failed to load order details");
      }
    } catch (error: any) {
      toast.error("Failed to load order details");
    }
  };

  const formatPoForLocationAssign = (
    poData: any,
    fallbackStoreId?: string,
  ): DirectPurchaseOrder => ({
    id: poData.id,
    dpo_no: poData.po_number || poData.poNumber || "",
    po_number: poData.po_number || poData.poNumber || "",
    date: poData.date || new Date().toISOString(),
    store_id:
      poData.store_id ||
      poData.storeId ||
      (fallbackStoreId && fallbackStoreId !== "all" ? fallbackStoreId : ""),
    store_name: poData.store_name || poData.storeName || "",
    status: poData.status || "Received",
    total_amount: poData.total_amount || poData.totalAmount || 0,
    items_count: Array.isArray(poData.items) ? poData.items.length : 0,
    expenses_count: Number(poData.expenses_count || poData.expensesCount || 0),
    created_at: poData.created_at || poData.createdAt || new Date().toISOString(),
    items: Array.isArray(poData.items)
      ? poData.items.map((item: any) => ({
          id: item.id || "",
          partId: item.part_id || item.partId || "",
          partNo: item.part_no || item.partNo || "N/A",
          description: item.part_description || item.description || "",
          brand: item.brand || "N/A",
          origin: item.origin || item.part?.origin || undefined,
          quantity:
            Number(item.received_qty ?? item.receivedQty ?? item.quantity ?? 0) || 0,
          purchasePrice: Number(item.unit_cost || item.unitCost || 0),
          salePrice: 0,
          amount: Number(item.total_cost || item.totalCost || 0),
          rackId: item.rack_id || item.rackId || null,
          shelfId: item.shelf_id || item.shelfId || null,
          rackCode: item.rack_name || item.rackCode || null,
          shelfNo: item.shelf_name || item.shelfNo || null,
          rackStoreId: item.store_id || item.storeId || item.rack_store_id || null,
          rackStoreName: item.store_name || item.storeName || item.rack_store_name || null,
        }))
      : [],
  });

  const handleAssignLocationForPO = async (order: PurchaseOrder) => {
    if (order.status !== "Received") {
      toast.info("Assign Location is available after order is received");
      return;
    }
    try {
      const response = await apiClient.getPurchaseOrder(order.id);
      const poData: any = response.data || response;
      if (!poData?.items?.length) {
        toast.error("Failed to load purchase order details");
        return;
      }
      const resolvedStoreId =
        selectedStoreId && selectedStoreId !== "all" ? selectedStoreId : undefined;
      setLocationAssignOrderKind("po");
      setLocationAssignOrder(formatPoForLocationAssign(poData, resolvedStoreId));
      setLocationAssignDialogOpen(true);
    } catch (error: any) {
      toast.error("Failed to load purchase order details");
    }
  };


  const handleDeleteOrder = (order: DirectPurchaseOrder | PurchaseOrder) => {
    if ('dpo_no' in order) {
      setSelectedOrder(order as DirectPurchaseOrder);
      setSelectedPurchaseOrder(null);
      setDeleteOrderType("dpo");
    } else {
      setSelectedPurchaseOrder(order as PurchaseOrder);
      setSelectedOrder(null);
      setDeleteOrderType("po");
    }
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);

      const operator = await requestOperatorAuth();
      if (requiresOperatorAuth && !operator) {
        return;
      }
      const by = performedByPayload(operator);

      if (deleteOrderType === "dpo" && selectedOrder) {
        await apiClient.deleteDirectPurchaseOrder(selectedOrder.id, by);
        toast.success(`Local Purchase Order ${selectedOrder.dpo_no} deleted successfully`);
        if (operator) toast.success(`Saved as ${operator.name}`);
        await fetchOrders();
      } else if (deleteOrderType === "po" && selectedPurchaseOrder) {
        await apiClient.deletePurchaseOrder(selectedPurchaseOrder.id, by);
        toast.success(`Purchase Order ${selectedPurchaseOrder.po_number} deleted successfully`);
        if (operator) toast.success(`Saved as ${operator.name}`);
        await fetchPurchaseOrders();
      }

      setDeleteDialogOpen(false);
      setSelectedOrder(null);
      setSelectedPurchaseOrder(null);
      setDeleteOrderType(null);
    } catch (error: any) {
      toast.error(error.error || "Failed to delete order");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPurchaseOrder = async (order: PurchaseOrder) => {
    try {
      const response = await apiClient.getPurchaseOrder(order.id);
      const poData: any = response.data || response;

      if (poData) {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          const printContent = `
            <!DOCTYPE html>
            <html>
              <head>
                <title>Purchase Order - ${order.po_number}</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; }
                  .header { text-align: center; margin-bottom: 30px; }
                  .info { margin-bottom: 20px; }
                  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                  th { background-color: #f2f2f2; }
                  .total { text-align: right; font-weight: bold; margin-top: 20px; }
                </style>
              </head>
              <body>
                <div class="header">
                  <h1>Purchase Order</h1>
                  <h2>${order.po_number}</h2>
                </div>
                <div class="info">
                  <p><strong>Date:</strong> ${formatUiDate(order.date)}</p>
                  <p><strong>Supplier:</strong> ${order.supplier_name || "N/A"}</p>
                  <p><strong>Status:</strong> ${order.status}</p>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Part No</th>
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Unit Cost</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${poData.items?.map((item: any) => `
                      <tr>
                        <td>${item.part?.partNo || item.part_no || "N/A"}</td>
                        <td>${item.part?.description || item.description || ""}</td>
                        <td>${item.quantity || item.orderedQty || 0}</td>
                        <td>Rs ${(item.unit_cost || item.unitCost || 0).toFixed(2)}</td>
                        <td>Rs ${(item.total_cost || item.totalCost || 0).toFixed(2)}</td>
                      </tr>
                    `).join("") || ""}
                  </tbody>
                </table>
                <div class="total">
                  <p>Total Amount: Rs ${order.total_amount.toFixed(2)}</p>
                </div>
              </body>
            </html>
          `;
          printWindow.document.write(printContent);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 250);
        }
      }
    } catch (error: any) {
      toast.error("Failed to load purchase order for printing");
    }
  };

  const handleReceiveOrder = async (order: DirectPurchaseOrder | PurchaseOrder) => {
    if ('dpo_no' in order) {
      // It's a DPO
      setSelectedOrder(order as DirectPurchaseOrder);
      setSelectedPurchaseOrder(null);
      setReceivingOrderType("dpo");
    } else {
      // It's a Purchase Order (import)
      const poStatus = String((order as PurchaseOrder).status || "")
        .trim()
        .toLowerCase();
      if (poStatus !== "stock receiving pending") {
        toast.info(
          "Stock receiving is available after Invoice is saved (status: Stock Receiving Pending).",
        );
        return;
      }
      setSelectedPurchaseOrder(order as PurchaseOrder);
      setSelectedOrder(null);
      setReceivingOrderType("po");
    }
    setReceiveDate("");
    setReceiveDialogOpen(true);
  };

  const confirmReceive = async () => {
    if (!selectedOrder && !selectedPurchaseOrder) return;
    if (!selectedStoreId) {
      toast.error("Please select a store first");
      return;
    }
    if (receivingOrderType === "po" && !String(receiveDate || "").trim()) {
      toast.error("Please select a receive date before receiving the purchase order");
      return;
    }

    try {
      setLoading(true);

      const operator = await requestOperatorAuth();
      if (requiresOperatorAuth && !operator) {
        return;
      }
      const by = performedByPayload(operator);

      // IMPORTANT: "all" is a UI-only value; never send it to backend as store_id
      const resolvedStoreId = selectedStoreId === "all" ? undefined : selectedStoreId;

      if (receivingOrderType === "dpo" && selectedOrder) {
        // Receive Direct Purchase Order
        // Fetch full order details first to get items
        const fullOrder = await fetchOrderDetails(selectedOrder.id);
        if (!fullOrder || !fullOrder.items || fullOrder.items.length === 0) {
          toast.error("Failed to load order details");
          return;
        }

        // Update DPO status to "Received" and create stock movements
        // The backend will automatically create stock movements when updating DPO
        const itemsForUpdate = fullOrder.items.map((item) => ({
          part_id: item.partId,
          quantity: item.quantity,
          purchase_price: item.purchasePrice,
          sale_price: item.salePrice,
          amount: item.amount,
          rack_id: item.rackId || null,
          shelf_id: item.shelfId || null,
        }));

        await apiClient.updateDirectPurchaseOrder(selectedOrder.id, {
          status: "Received",
          ...(resolvedStoreId ? { store_id: resolvedStoreId } : {}),
          order_type: fullOrder.order_type || "local_purchase",
          branch_account_id: fullOrder.branch_account_id || undefined,
          items: itemsForUpdate,
          ...by,
        });

        toast.success(`Order ${selectedOrder.dpo_no} has been received and stock added`);
        if (operator) toast.success(`Saved as ${operator.name}`);
      } else if (receivingOrderType === "po" && selectedPurchaseOrder) {
        // Receive Purchase Order
        // First, fetch the full PO details to get items
        const poResponse = await apiClient.getPurchaseOrder(selectedPurchaseOrder.id);
        const poData: any = poResponse.data || poResponse;

        if (!poData || !poData.items || poData.items.length === 0) {
          toast.error("Failed to load purchase order details");
          return;
        }

        // Update PO with received quantities and status
        // The backend will automatically create stock movements when status changes to "Received"
        const itemsForUpdate = poData.items.map((item: any) => ({
          part_id: item.part_id || item.partId,
          quantity: item.quantity || item.orderedQty || 0,
          unit_cost: item.unit_cost || item.unitCost || 0,
          total_cost: item.total_cost || item.totalCost || (item.unit_cost || item.unitCost || 0) * (item.quantity || item.orderedQty || 0),
          received_qty:
            item.received_qty ??
            item.receivedQty ??
            item.quantity ??
            item.orderedQty ??
            0,
        }));

        await apiClient.updatePurchaseOrder(selectedPurchaseOrder.id, {
          status: "Received",
          date: receiveDate,
          ...(resolvedStoreId ? { store_id: resolvedStoreId } : {}),
          items: itemsForUpdate,
          ...by,
        });

        toast.success(`Purchase Order ${selectedPurchaseOrder.po_number} has been received and stock added`);
        if (operator) toast.success(`Saved as ${operator.name}`);

        const refreshedPo = await apiClient.getPurchaseOrder(selectedPurchaseOrder.id);
        const refreshedData: any = refreshedPo.data || refreshedPo;
        if (refreshedData?.items?.length) {
          setLocationAssignOrderKind("po");
          setLocationAssignOrder(
            formatPoForLocationAssign(refreshedData, resolvedStoreId),
          );
          setLocationAssignDialogOpen(true);
        }
      }

      setReceiveDialogOpen(false);
      setSelectedOrder(null);
      setSelectedPurchaseOrder(null);
      setReceivingOrderType(null);
      setReceiveDate("");
      setReceivingOrderType(null);

      if (typeFilter === "transfer-in") {
        await fetchTransferInOrders();
      } else {
        await fetchOrders();
        await fetchPurchaseOrders();
      }
    } catch (error: any) {
      toast.error(error.error || "Failed to receive order");
    } finally {
      setLoading(false);
    }
  };

  const isWithinDateRange = (rawDate?: string) => {
    if (!dateFrom && !dateTo) return true;
    if (!rawDate) return false;

    const valueTime = new Date(rawDate).getTime();
    if (Number.isNaN(valueTime)) return false;

    if (dateFrom) {
      const fromTime = new Date(`${dateFrom}T00:00:00`).getTime();
      if (!Number.isNaN(fromTime) && valueTime < fromTime) return false;
    }

    if (dateTo) {
      const toTime = new Date(`${dateTo}T23:59:59.999`).getTime();
      if (!Number.isNaN(toTime) && valueTime > toTime) return false;
    }

    return true;
  };

  // Filter Purchase Orders (for Receiving)
  const filteredPurchaseOrders = Array.isArray(purchaseOrders)
    ? purchaseOrders.filter((order) => {
      const inDateRange = isWithinDateRange(order.date);
      const matchesSearch =
        order.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
      const matchesPart = orderContainsSelectedPart(filterPartId, order.items);
      return inDateRange && matchesSearch && matchesPart;
    })
    : [];

  // Filter Direct Purchase Orders (for Receiving - DPOs are receivable)
  const filteredDPOs = Array.isArray(orders)
    ? orders.filter((order) => {
      const inDateRange = isWithinDateRange(order.date);
      const matchesSearch =
        order.dpo_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getDpoPartyLabel(order).toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.store_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPart = orderContainsSelectedPart(filterPartId, order.items);
      return inDateRange && matchesSearch && matchesPart;
    })
    : [];

  // Filter Sales Invoices (for Delivering)
  const filteredStockOutOrders = (stockOutOrders || []).filter((invoice) => {
    const inDateRange = isWithinDateRange(invoice.invoiceDate);
    const matchesSearch =
      invoice.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPart = orderContainsSelectedPart(filterPartId, invoice.items);
    return inDateRange && matchesSearch && matchesPart;
  });

  const filteredTransferInOrders = (transferInOrders || []).filter((order) => {
    const inDateRange = isWithinDateRange(order.date);
    const party = order.branch_account_name || order.store_name || "";
    const matchesSearch =
      order.dpo_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      party.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPart = orderContainsSelectedPart(filterPartId, order.items);
    return inDateRange && matchesSearch && matchesPart;
  });

  const filteredTransferOutOrders = (transferOutOrders || []).filter((invoice) => {
    const inDateRange = isWithinDateRange(invoice.invoiceDate);
    const matchesSearch =
      invoice.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPart = orderContainsSelectedPart(filterPartId, invoice.items);
    return inDateRange && matchesSearch && matchesPart;
  });

  const mixedOrders = [
    ...filteredPurchaseOrders.map((order) => ({
      type: "po" as const,
      id: order.id,
      number: order.po_number,
      date: order.invoice_date || order.date,
      party: order.supplier_name || "N/A",
      itemsCount: order.items_count,
      quantity: order.total_quantity || 0,
      amount: order.total_amount || 0,
      status: order.status,
      deliveredTo: "",
      raw: order,
    })),
    ...filteredDPOs.map((order) => ({
      type: "dpo" as const,
      id: order.id,
      number: order.dpo_no,
      date: order.date,
      party: getDpoPartyLabel(order),
      itemsCount: order.items_count,
      quantity: order.total_quantity || 0,
      amount: order.total_amount || 0,
      status: order.status,
      deliveredTo: "",
      raw: order,
    })),
    ...filteredStockOutOrders.map((invoice) => ({
      type: "stock-out" as const,
      id: invoice.id,
      number: invoice.invoiceNo,
      date: invoice.invoiceDate,
      party: invoice.customerName || "N/A",
      itemsCount: invoice.items_count,
      quantity: 0,
      amount: 0, // No amount for Store Manager on stock out
      status: invoice.status,
      deliveredTo: invoice.deliveredTo || "",
      raw: invoice,
    })),
  ].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  return (
    <div className="space-y-6">

      {/* Store Selection and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Store Selection & Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Select Store</Label>
              <Select
                value={selectedStoreId}
                onValueChange={setSelectedStoreId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name} ({store.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status Filter</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Received">Received</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Cancelled">Cancel</SelectItem>
                  <SelectItem value="Return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? formatUiDate(new Date(dateFrom)) : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom ? new Date(dateFrom) : undefined}
                    onSelect={(d) => {
                      if (!d) {
                        setDateFrom("");
                        return;
                      }
                      const nextFrom = format(d, "yyyy-MM-dd");
                      setDateFrom(nextFrom);
                      if (dateTo && new Date(nextFrom).getTime() > new Date(dateTo).getTime()) {
                        setDateTo(nextFrom);
                      }
                    }}
                    initialFocus
                  />
                  <div className="flex items-center justify-between p-3 pt-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDateFrom("")}
                      disabled={!dateFrom}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const today = format(new Date(), "yyyy-MM-dd");
                        setDateFrom(today);
                        if (dateTo && new Date(today).getTime() > new Date(dateTo).getTime()) {
                          setDateTo(today);
                        }
                      }}
                    >
                      Today
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? formatUiDate(new Date(dateTo)) : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo ? new Date(dateTo) : undefined}
                    onSelect={(d) => {
                      if (!d) {
                        setDateTo("");
                        return;
                      }
                      const nextTo = format(d, "yyyy-MM-dd");
                      setDateTo(nextTo);
                      if (dateFrom && new Date(nextTo).getTime() < new Date(dateFrom).getTime()) {
                        setDateFrom(nextTo);
                      }
                    }}
                    initialFocus
                  />
                  <div className="flex items-center justify-between p-3 pt-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDateTo("")}
                      disabled={!dateTo}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const today = format(new Date(), "yyyy-MM-dd");
                        setDateTo(today);
                        if (dateFrom && new Date(today).getTime() < new Date(dateFrom).getTime()) {
                          setDateFrom(today);
                        }
                      }}
                    >
                      Today
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Item</Label>
              <SearchableSelect
                value={filterPartId}
                onValueChange={setFilterPartId}
                placeholder="All items"
                className="w-full"
                options={itemFilterOptions}
              />
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              {(dateFrom || dateTo) && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    Clear Date
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Type Filter Tabs */}
      {selectedStoreId && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filter by Type:</span>
              <div className="flex gap-2 ml-4">
                <Button
                  variant={typeFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("all")}
                  className="gap-2"
                >
                  <List className="w-4 h-4" />
                  All Orders
                </Button>
                <Button
                  variant={typeFilter === "receiving-po" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("receiving-po")}
                  className="gap-2"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Import Order
                </Button>
                <Button
                  variant={typeFilter === "receiving-dpo" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("receiving-dpo")}
                  className="gap-2"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Local Order
                </Button>
                <Button
                  variant={typeFilter === "stock-out" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("stock-out")}
                  className="gap-2"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Sales Stock Out
                </Button>
                <Button
                  variant={typeFilter === "transfer-in" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("transfer-in")}
                  className="gap-2"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Transfer In
                </Button>
                <Button
                  variant={typeFilter === "transfer-out" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("transfer-out")}
                  className="gap-2"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Transfer Out
                </Button>
                {isStoreOnlyUser && (
                  <Button
                    variant={typeFilter === "part-association" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter("part-association")}
                    className="gap-2"
                  >
                    <Package className="w-4 h-4" />
                    Part Association
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders List */}
      {selectedStoreId ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {typeFilter === "receiving-po"
                ? "Import Order"
                : typeFilter === "receiving-dpo"
                  ? "Local Order"
                  : typeFilter === "stock-out"
                    ? "Sales Stock Out"
                    : typeFilter === "transfer-in"
                      ? "Transfer In"
                      : typeFilter === "transfer-out"
                        ? "Transfer Out"
                        : typeFilter === "part-association"
                          ? "Part Association"
                          : "All Orders"}
              {selectedStore && ` - ${selectedStore.name}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <>
                {/* All Orders - Mixed (Receiving + Delivering), Newest First */}
                {typeFilter === "all" && (
                  mixedOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No orders found.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ListNumberHeader />
                            <TableHead>Order Number</TableHead>
                            <TableHead className={ORDER_TABLE_DATE_CLASS}>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Supplier/Store/Customer</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Deliver To</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mixedOrders.map((row, index) => (
                            <TableRow key={`${row.type}-${row.id}`}>
                              <ListNumberCell index={index} total={mixedOrders.length} />
                              <TableCell className="font-medium">{row.number}</TableCell>
                              <TableCell className={ORDER_TABLE_DATE_CLASS}>
                                {row.date ? formatUiDate(row.date) : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {row.type === "po" ? "PO" : row.type === "dpo" ? "DPO" : "Stock Out"}
                                </Badge>
                              </TableCell>
                              <TableCell>{row.party}</TableCell>
                              <TableCell>{row.itemsCount} items</TableCell>
                              <TableCell>{row.type === "stock-out" ? "-" : row.quantity}</TableCell>
                              <TableCell>
                                {row.type === "stock-out" ? "-" : `Rs ${Number(row.amount || 0).toFixed(2)}`}
                              </TableCell>
                              <TableCell>
                                {row.type === "stock-out" ? (
                                  <Badge
                                    variant={
                                      row.status === "fully_delivered" || row.status === "approved"
                                        ? "default"
                                        : row.status === "pending"
                                          ? "secondary"
                                          : row.status === "on_hold"
                                            ? "destructive"
                                            : "outline"
                                    }
                                  >
                                    {row.status.replace('_', ' ')}
                                  </Badge>
                                ) : row.type === "po" ? (
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "whitespace-nowrap font-medium",
                                      getPurchaseOrderStatusBadgeClass(row.status),
                                    )}
                                  >
                                    {formatPurchaseOrderStatusLabel(row.status)}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant={
                                      row.status === "Completed"
                                        ? "default"
                                        : row.status === "Draft"
                                          ? "secondary"
                                          : "destructive"
                                    }
                                  >
                                    {row.status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>{row.type === "stock-out" ? (row.deliveredTo || "-") : "-"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {row.type === "po" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleViewPurchaseOrder(row.raw as PurchaseOrder)}
                                        title="View Order"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      {canPrint && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handlePrintPurchaseOrder(row.raw as PurchaseOrder)}
                                          title="Print Order"
                                        >
                                          <Printer className="w-4 h-4" />
                                        </Button>
                                      )}
                                      {canEdit && (row.raw as PurchaseOrder).status === "Received" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleAssignLocationForPO(row.raw as PurchaseOrder)
                                          }
                                          title="Assign Location"
                                        >
                                          <MapPin className="w-4 h-4" />
                                        </Button>
                                      )}
                                      {canApprove &&
                                        (row.raw as PurchaseOrder).status !== "Received" &&
                                        String((row.raw as PurchaseOrder).status || "")
                                          .trim()
                                          .toLowerCase() === "stock receiving pending" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleReceiveOrder(row.raw as PurchaseOrder)}
                                          title="Receive Order"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </Button>
                                      )}
                                      {canApprove &&
                                        (row.raw as PurchaseOrder).status !== "Received" &&
                                        String((row.raw as PurchaseOrder).status || "")
                                          .trim()
                                          .toLowerCase() !== "stock receiving pending" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled
                                          title="Available after Invoice is saved (Stock Receiving Pending)"
                                          className="opacity-50 cursor-not-allowed"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}

                                  {row.type === "dpo" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleViewOrder(row.raw as DirectPurchaseOrder)}
                                        title="View Order"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      {canEdit && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleAssignLocation(row.raw as DirectPurchaseOrder)}
                                          title="Assign Location"
                                          disabled={(row.raw as DirectPurchaseOrder).status !== "Received"}
                                          className={(row.raw as DirectPurchaseOrder).status !== "Received" ? "opacity-50 cursor-not-allowed" : undefined}
                                        >
                                          <MapPin className="w-4 h-4" />
                                        </Button>
                                      )}
                                      {canPrint && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handlePrintReceipt(row.raw as DirectPurchaseOrder)}
                                          title="Print Receipt"
                                        >
                                          <Printer className="w-4 h-4" />
                                        </Button>
                                      )}
                                      {canApprove && (row.raw as DirectPurchaseOrder).status !== "Received" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleReceiveOrder(row.raw as DirectPurchaseOrder)}
                                          title="Receive Order"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}

                                  {row.type === "stock-out" && !isStockOutBlocked(row.status) && canApprove && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePrintStockOutReceipt(row.raw as StockOutOrder)}
                                      title="Print Receipt & Confirm Stock Out"
                                    >
                                      <Printer className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Import Order - Purchase Orders only */}
                {typeFilter === "receiving-po" && (
                  filteredPurchaseOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No purchase orders found for receiving.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ListNumberHeader />
                            <TableHead>Order Number</TableHead>
                            <TableHead className={ORDER_TABLE_DATE_CLASS}>Date</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPurchaseOrders.map((order, index) => (
                            <TableRow key={`po-${order.id}`}>
                              <ListNumberCell index={index} total={filteredPurchaseOrders.length} />
                              <TableCell className="font-medium">
                                {order.po_number}
                              </TableCell>
                              <TableCell className={ORDER_TABLE_DATE_CLASS}>
                                {formatUiDate(order.date)}
                              </TableCell>
                              <TableCell>{order.supplier_name}</TableCell>
                              <TableCell>{order.items_count} items</TableCell>
                              <TableCell>
                                {order.total_quantity || 0}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "whitespace-nowrap font-medium",
                                    getPurchaseOrderStatusBadgeClass(order.status),
                                  )}
                                >
                                  {formatPurchaseOrderStatusLabel(order.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewPurchaseOrder(order)}
                                    title="View Order"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {canPrint && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePrintPurchaseOrder(order)}
                                      title="Print Order"
                                    >
                                      <Printer className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canEdit && order.status === "Received" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleAssignLocationForPO(order)}
                                      title="Assign Location"
                                    >
                                      <MapPin className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canApprove &&
                                    order.status !== "Received" &&
                                    String(order.status || "")
                                      .trim()
                                      .toLowerCase() === "stock receiving pending" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleReceiveOrder(order)}
                                      title="Receive Order"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canApprove &&
                                    order.status !== "Received" &&
                                    String(order.status || "")
                                      .trim()
                                      .toLowerCase() !== "stock receiving pending" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled
                                      title="Available after Invoice is saved (Stock Receiving Pending)"
                                      className="opacity-50 cursor-not-allowed"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Local Order - Direct Purchase Orders only */}
                {typeFilter === "receiving-dpo" && (
                  filteredDPOs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No direct purchase orders found for receiving.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ListNumberHeader />
                            <TableHead>Order Number</TableHead>
                            <TableHead className={ORDER_TABLE_DATE_CLASS}>Date</TableHead>
                            <TableHead>Supplier/Store</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredDPOs.map((order, index) => (
                            <TableRow key={`dpo-${order.id}`}>
                              <ListNumberCell index={index} total={filteredDPOs.length} />
                              <TableCell className="font-medium">
                                {order.dpo_no}
                              </TableCell>
                              <TableCell className={ORDER_TABLE_DATE_CLASS}>
                                {formatUiDate(order.date)}
                              </TableCell>
                              <TableCell>{getDpoPartyLabel(order)}</TableCell>
                              <TableCell>{order.items_count} items</TableCell>
                              <TableCell>
                                {order.total_quantity || 0}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    order.status === "Completed" ||
                                    order.status === "Received"
                                      ? "default"
                                      : order.status === "Draft"
                                        ? "secondary"
                                        : "destructive"
                                  }
                                >
                                  {order.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewOrder(order)}
                                    title="View Order"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {canEdit && order.status !== "Cancelled" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleAssignLocation(order)}
                                      title="Assign Location"
                                      disabled={order.status !== "Received"}
                                      className={order.status !== "Received" ? "opacity-50 cursor-not-allowed" : undefined}
                                    >
                                      <MapPin className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canPrint && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePrintReceipt(order)}
                                      title="Print Receipt"
                                    >
                                      <Printer className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canApprove && order.status !== "Received" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleReceiveOrder(order)}
                                      title="Receive Order"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Sales Stock Out - Sales Invoices */}
                {typeFilter === "stock-out" && (
                  filteredStockOutOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No stock out orders found.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ListNumberHeader />
                            <TableHead>Order Number</TableHead>
                            <TableHead className={ORDER_TABLE_DATE_CLASS}>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Sent To</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStockOutOrders.map((invoice, index) => (
                            <TableRow key={invoice.id}>
                              <ListNumberCell index={index} total={filteredStockOutOrders.length} />
                              <TableCell className="font-medium">
                                {invoice.invoiceNo}
                              </TableCell>
                              <TableCell className={ORDER_TABLE_DATE_CLASS}>
                                {formatUiDate(invoice.invoiceDate)}
                              </TableCell>
                              <TableCell>{invoice.customerName}</TableCell>
                              <TableCell>{invoice.items_count} items</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    invoice.status === "fully_delivered"
                                      ? "default"
                                      : invoice.status === "reversed" || invoice.status === "partially_reversed" || invoice.status === "cancelled"
                                        ? "destructive"
                                        : invoice.status === "pending"
                                          ? "secondary"
                                          : "outline"
                                  }
                                >
                                  {invoice.status.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>{invoice.deliveredTo || "-"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {canPrint && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handlePrintDeliveryChallan(invoice)
                                      }
                                      title="Print Delivery Challan"
                                    >
                                      <Printer className="w-4 h-4 mr-1" />
                                      Challan
                                    </Button>
                                  )}
                                  {canApprove && (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handlePrintStockOutReceipt(invoice)}
                                      title="Confirm Stock Out"
                                      disabled={isStockOutBlocked(invoice.status)}
                                    >
                                      <ArrowDownCircle className="w-4 h-4 mr-1" />
                                      {getStockOutButtonLabel(invoice.status)}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Transfer In — branch receipts (same workflow as DPO receiving) */}
                {typeFilter === "transfer-in" && (
                  filteredTransferInOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No transfer in orders found.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ListNumberHeader />
                            <TableHead>Order Number</TableHead>
                            <TableHead className={ORDER_TABLE_DATE_CLASS}>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransferInOrders.map((order, index) => (
                            <TableRow key={`tin-${order.id}`}>
                              <ListNumberCell index={index} total={filteredTransferInOrders.length} />
                              <TableCell className="font-medium">{order.dpo_no}</TableCell>
                              <TableCell className={ORDER_TABLE_DATE_CLASS}>
                                {formatUiDate(order.date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">Transfer In</Badge>
                              </TableCell>
                              <TableCell>
                                {order.branch_account_name || order.store_name}
                              </TableCell>
                              <TableCell>{order.items_count} items</TableCell>
                              <TableCell>{order.total_quantity || 0}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    order.status === "Completed"
                                      ? "default"
                                      : order.status === "Draft"
                                        ? "secondary"
                                        : "destructive"
                                  }
                                >
                                  {order.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewOrder(order)}
                                    title="View Order"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {order.status !== "Cancelled" && (
                                    <>
                                      {canEdit && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEditDPO(order)}
                                          title="Edit Order"
                                          disabled={order.status === "Received"}
                                          className={
                                            order.status === "Received"
                                              ? "opacity-50 cursor-not-allowed"
                                              : undefined
                                          }
                                        >
                                          <Edit className="w-4 h-4" />
                                        </Button>
                                      )}
                                      {canEdit && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleAssignLocation(order)}
                                          title="Assign Location"
                                          disabled={order.status !== "Received"}
                                          className={
                                            order.status !== "Received"
                                              ? "opacity-50 cursor-not-allowed"
                                              : undefined
                                          }
                                        >
                                          <MapPin className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  {canPrint && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePrintReceipt(order)}
                                      title="Print Receipt"
                                    >
                                      <Printer className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {canApprove && order.status !== "Received" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleReceiveOrder(order)}
                                      title="Receive Order"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Transfer Out — branch deliveries (same workflow as stock out) */}
                {typeFilter === "transfer-out" && (
                  filteredTransferOutOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No transfer out orders found.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ListNumberHeader />
                            <TableHead>Order Number</TableHead>
                            <TableHead className={ORDER_TABLE_DATE_CLASS}>Date</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Sent To</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransferOutOrders.map((invoice, index) => (
                            <TableRow key={`tout-${invoice.id}`}>
                              <ListNumberCell index={index} total={filteredTransferOutOrders.length} />
                              <TableCell className="font-medium">
                                {invoice.invoiceNo}
                              </TableCell>
                              <TableCell className={ORDER_TABLE_DATE_CLASS}>
                                {formatUiDate(invoice.invoiceDate)}
                              </TableCell>
                              <TableCell>{invoice.customerName}</TableCell>
                              <TableCell>{invoice.items_count} items</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    invoice.status === "fully_delivered"
                                      ? "default"
                                      : invoice.status === "reversed" ||
                                          invoice.status === "partially_reversed" ||
                                          invoice.status === "cancelled"
                                        ? "destructive"
                                        : invoice.status === "pending"
                                          ? "secondary"
                                          : "outline"
                                  }
                                >
                                  {invoice.status.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>{invoice.deliveredTo || "-"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {canPrint && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handlePrintDeliveryChallan(invoice)}
                                      title="Print Delivery Challan"
                                    >
                                      <Printer className="w-4 h-4 mr-1" />
                                      Challan
                                    </Button>
                                  )}
                                  {canApprove && (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handlePrintStockOutReceipt(invoice)}
                                      title="Confirm Stock Out"
                                      disabled={isStockOutBlocked(invoice.status)}
                                    >
                                      <ArrowDownCircle className="w-4 h-4 mr-1" />
                                      {getStockOutButtonLabel(invoice.status)}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Part Association - Store User only */}
                {typeFilter === "part-association" && isStoreOnlyUser && (
                  <SalesInquiry hidePrices hideShortcuts />
                )}

              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Please select a store to view orders.
          </CardContent>
        </Card>
      )}

      {/* View DPO Order Dialog */}
      {selectedOrder && (
        <StoreOrderDetail
          order={selectedOrder}
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
        />
      )}

      {/* View Purchase Order Dialog */}
      {selectedPurchaseOrderFull && (
        <StorePurchaseOrderDetail
          order={selectedPurchaseOrderFull}
          open={viewPODialogOpen}
          onOpenChange={setViewPODialogOpen}
          onPrint={() => {
            setViewPODialogOpen(false);
            handlePrintPurchaseOrder(selectedPurchaseOrder!);
          }}
          onReceive={() => {
            setViewPODialogOpen(false);
            handleReceiveOrder(selectedPurchaseOrder!);
          }}
        />
      )}

      {/* Print Receipt Dialog — only mount when open; selectedOrder is shared with receive/edit */}
      {selectedOrder && receiptDialogOpen && (
        <StoreReceipt
          order={selectedOrder}
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
        />
      )}

      {/* Stock Out Receipt Dialog */}
      {selectedStockOutOrder && (
        <StoreSalesInvoiceReceipt
          invoice={selectedStockOutOrder}
          open={stockOutReceiptOpen}
          onOpenChange={setStockOutReceiptOpen}
          onDeliveryConfirmed={async () => {
            setStockOutReceiptOpen(false);
            if (typeFilter === "transfer-out") {
              await fetchTransferOutOrders();
            } else {
              await fetchStockOutOrders();
            }
          }}
        />
      )}

      {/* Edit DPO Dialog */}
      {selectedOrder && (
        <StoreEditDPO
          order={selectedOrder}
          open={editDPODialogOpen}
          onOpenChange={setEditDPODialogOpen}
          onSuccess={async () => {
            setEditDPODialogOpen(false);
            setSelectedOrder(null);
            if (typeFilter === "transfer-in") {
              await fetchTransferInOrders();
            } else {
              await fetchOrders();
              await fetchPurchaseOrders();
            }
          }}
        />
      )}

      {/* Assign Location Dialog */}
      {locationAssignOrder && (
        <StoreLocationAssign
          order={locationAssignOrder}
          orderKind={locationAssignOrderKind}
          storeId={selectedStoreId}
          open={locationAssignDialogOpen}
          onOpenChange={setLocationAssignDialogOpen}
          onSuccess={async () => {
            setLocationAssignDialogOpen(false);
            setLocationAssignOrder(null);
            if (typeFilter === "transfer-in") {
              await fetchTransferInOrders();
            } else {
              await fetchOrders();
              await fetchPurchaseOrders();
            }
          }}
        />
      )}

      {/* Edit PO Dialog */}
      {selectedPurchaseOrderFull && (
        <StoreEditPO
          order={selectedPurchaseOrderFull}
          open={editPODialogOpen}
          onOpenChange={setEditPODialogOpen}
          onSuccess={async () => {
            setEditPODialogOpen(false);
            setSelectedPurchaseOrderFull(null);
            setSelectedPurchaseOrder(null);
            // Refresh orders
            await fetchPurchaseOrders();
            await fetchOrders();
          }}
        />
      )}


      {/* Receive Order Dialog */}
      <AlertDialog
        open={receiveDialogOpen}
        onOpenChange={(open) => {
          setReceiveDialogOpen(open);
          if (!open) {
            setSelectedOrder(null);
            setSelectedPurchaseOrder(null);
            setReceivingOrderType(null);
            setReceiveDate("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark order{" "}
              <strong>
                {receivingOrderType === "dpo"
                  ? selectedOrder?.dpo_no
                  : selectedPurchaseOrder?.po_number}
              </strong> as received?
              <br />
              <span className="text-sm text-muted-foreground mt-2 block">
                This will create stock movements and add items to inventory.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {receivingOrderType === "po" ? (
            <div className="space-y-2 py-2">
              <Label htmlFor="store-receive-date">
                Receive Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="store-receive-date"
                type="date"
                value={receiveDate}
                onChange={(event) => setReceiveDate(event.target.value)}
                required
              />
              {!receiveDate.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Select a receive date to receive this purchase order and create the voucher.
                </p>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSelectedOrder(null);
                setSelectedPurchaseOrder(null);
                setReceivingOrderType(null);
                setReceiveDate("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                if (
                  receivingOrderType === "po" &&
                  !String(receiveDate || "").trim()
                ) {
                  event.preventDefault();
                  toast.error(
                    "Please select a receive date before receiving the purchase order",
                  );
                  return;
                }
                void confirmReceive();
              }}
            >
              Confirm Receive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Order Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete order{" "}
              <strong>
                {deleteOrderType === "dpo"
                  ? selectedOrder?.dpo_no
                  : selectedPurchaseOrder?.po_number}
              </strong>?
              <br />
              <span className="text-sm text-destructive mt-2 block">
                This action cannot be undone. All associated data will be permanently deleted.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSelectedOrder(null);
                setSelectedPurchaseOrder(null);
                setDeleteOrderType(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

