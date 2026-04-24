import { useState, useEffect, useRef } from "react";
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
  List,
  Trash2,
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
import { StoreLocationAssign } from "./StoreLocationAssign";
import { StoreAdjustedItem } from "./StoreAdjustedItem";
import { printDeliveryChallan } from "@/lib/printDeliveryChallan";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getUserRole, isStoreUserRole } from "@/utils/auth";

interface DirectPurchaseOrderItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
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
  date: string;
  store_id: string;
  store_name: string;
  supplier_id?: string;
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

interface Store {
  id: string;
  name: string;
  code: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  date: string;
  supplier_name?: string;
  status: string;
  total_amount: number;
  items_count: number;
  total_quantity?: number;
  created_at: string;
  items?: Array<{
    id: string;
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

export const StorePanel = ({ onStoreChange }: StorePanelProps) => {
  const { addNotification } = useNotifications();
  const [searchParams] = useSearchParams();
  const isStoreOnlyUser = getUserRole() === "store" || isStoreUserRole();
  const [orders, setOrders] = useState<DirectPurchaseOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [stockOutOrders, setStockOutOrders] = useState<StockOutOrder[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [partOptions, setPartOptions] = useState<Array<{
    id: string;
    partNo: string;
    masterPartNo: string;
    description: string;
  }>>([]);
  const [selectedAssociationPartId, setSelectedAssociationPartId] = useState("");
  const [associationRows, setAssociationRows] = useState<Array<{ model: string; qtyUsed: number }>>([]);
  const [associationLoading, setAssociationLoading] = useState(false);
  const hasInitializedStockOutRef = useRef(false);
  const notifiedApprovedInvoiceIdsRef = useRef<Set<string>>(new Set());
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "receiving" | "stock-out" | "adjusted" | "part-association">("all");
  const [receivingFilter, setReceivingFilter] = useState<"all" | "po" | "dpo">("all");
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
  const [selectedOrder, setSelectedOrder] = useState<DirectPurchaseOrder | null>(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [selectedPurchaseOrderFull, setSelectedPurchaseOrderFull] = useState<any>(null);
  const [receivingOrderType, setReceivingOrderType] = useState<"dpo" | "po" | null>(null);
  const [deleteOrderType, setDeleteOrderType] = useState<"dpo" | "po" | null>(null);
  const [selectedStockOutOrder, setSelectedStockOutOrder] = useState<StockOutOrder | null>(null);
  const [stockOutReceiptOpen, setStockOutReceiptOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<any | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
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
      if (typeFilter === "receiving") {
        // Fetch both Purchase Orders and Direct Purchase Orders for receiving
        fetchPurchaseOrders();
        fetchOrders(); // DPOs are receivable items
        setAdjustments([]);
        setStockOutOrders([]);
      } else if (typeFilter === "stock-out") {
        // Only fetch Sales Invoices for stock out
        fetchStockOutOrders();
        // Clear other data
        setOrders([]);
        setPurchaseOrders([]);
        setAdjustments([]);
      } else if (typeFilter === "adjusted") {
        // Fetch adjustments for adjusted items
        fetchAdjustments();
        // Clear other data
        setOrders([]);
        setPurchaseOrders([]);
        setStockOutOrders([]);
      } else if (typeFilter === "part-association") {
        setOrders([]);
        setPurchaseOrders([]);
        setStockOutOrders([]);
        setAdjustments([]);
        if (isStoreOnlyUser) {
          fetchAssociationParts();
        }
      } else {
        // All Orders - fetch everything (Receiving + Delivering + Adjusted)
        fetchPurchaseOrders();
        fetchOrders();
        fetchStockOutOrders();
        fetchAdjustments();
      }

      // Store users should keep receiving approved-invoice notifications
      // even when they are not currently on Stock Out Items.
      if (isStoreOnlyUser && typeFilter !== "stock-out" && typeFilter !== "all") {
        fetchStockOutOrders(true);
      }
    }
  }, [selectedStoreId, statusFilter, typeFilter]);

  // Support deep-linking to a specific filter, e.g. /store/orders?type=stock-out
  useEffect(() => {
    const requestedType = String(searchParams.get("type") || "")
      .trim()
      .toLowerCase();
    if (!requestedType) return;

    const allowedTypes = [
      "all",
      "receiving",
      "stock-out",
      "adjusted",
      ...(isStoreOnlyUser ? ["part-association"] : []),
    ] as const;

    if (
      (allowedTypes as readonly string[]).includes(requestedType) &&
      requestedType !== typeFilter
    ) {
      setTypeFilter(
        requestedType as "all" | "receiving" | "stock-out" | "adjusted" | "part-association",
      );
    }
  }, [searchParams, typeFilter, isStoreOnlyUser]);

  // Poll for new orders every 30 seconds
  useEffect(() => {
    if (!selectedStoreId) return;

    const interval = setInterval(() => {
      // Keep the currently selected view up-to-date, with newest orders on top.
      if (typeFilter === "stock-out") {
        fetchStockOutOrders(true);
      } else if (typeFilter === "receiving") {
        fetchPurchaseOrders(true);
        fetchOrders(true);
      } else if (typeFilter === "adjusted") {
        fetchAdjustments(true);
      } else if (typeFilter === "part-association") {
        if (isStoreOnlyUser) fetchAssociationParts(true);
      } else {
        fetchPurchaseOrders(true);
        fetchOrders(true);
        fetchStockOutOrders(true);
        fetchAdjustments(true);
      }

      if (isStoreOnlyUser && typeFilter !== "stock-out" && typeFilter !== "all") {
        fetchStockOutOrders(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedStoreId, typeFilter, statusFilter, isStoreOnlyUser]);

  const fetchAssociationParts = async (silent = false) => {
    try {
      if (!silent) setAssociationLoading(true);
      const response = await apiClient.getPartEntryList({ limit: 10000, page: 1 });
      const rawRows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      const mapped = rawRows
        .map((row: any) => ({
          id: String(row.id || "").trim(),
          partNo: String(row.part_no || row.partNo || "").trim(),
          masterPartNo: String(row.master_part_no || row.masterPartNo || "").trim(),
          description: String(row.description || "").trim(),
        }))
        .filter((row: any) => row.id && row.partNo);
      setPartOptions(mapped);
    } catch (error: any) {
      if (!silent) toast.error(error?.error || "Failed to load items");
    } finally {
      if (!silent) setAssociationLoading(false);
    }
  };

  const fetchPartAssociation = async (partId: string) => {
    if (!partId) {
      setAssociationRows([]);
      return;
    }
    try {
      setAssociationLoading(true);
      const response = await apiClient.getPart(partId);
      const partData = (response as any)?.data || response;
      const models = Array.isArray(partData?.models) ? partData.models : [];
      const rows = models.map((m: any) => ({
        model: String(m?.name || "").trim() || "N/A",
        qtyUsed: Number(m?.qty_used ?? m?.qtyUsed ?? 0) || 0,
      }));
      setAssociationRows(rows);
    } catch (error: any) {
      setAssociationRows([]);
      toast.error(error?.error || "Failed to load model association");
    } finally {
      setAssociationLoading(false);
    }
  };

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
      });

      const ordersData = response.data || response;
      if (Array.isArray(ordersData)) {
        const formattedOrders = ordersData.map((order: any) => ({
          id: order.id,
          dpo_no: order.dpo_no || order.dpoNumber,
          date: order.date,
          store_id: order.store_id || order.storeId,
          store_name: order.store_name || order.store?.name || "Unknown",
          supplier_id: order.supplier_id || order.supplierId,
          account: order.account,
          description: order.description,
          status: order.status || "Completed",
          total_amount: order.total_amount || order.totalAmount || 0,
          items_count: order.items_count || order.items?.length || 0,
          total_quantity: order.total_quantity || (order.items && order.items.length > 0 ? order.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) : 0),
          expenses_count: order.expenses_count || order.expenses?.length || 0,
          created_at: order.created_at || order.createdAt,
        }));

        // Check for new orders and show notifications
        if (!silent && orders.length > 0) {
          const newOrders = formattedOrders.filter(
            (newOrder: DirectPurchaseOrder) =>
              !orders.find((oldOrder) => oldOrder.id === newOrder.id)
          );

          newOrders.forEach((order: DirectPurchaseOrder) => {
            addNotification({
              title: "New Direct Purchase Order",
              message: `DPO ${order.dpo_no} has been created for your store.`,
              type: "info",
              module: "store",
              action: {
                label: "View Order",
                path: `/store`,
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
          store_name: orderData.store_name || orderData.store?.name || "Unknown",
          supplier_id: orderData.supplier_id || orderData.supplierId,
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
        page: 1,
        limit: 100,
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

  const fetchAdjustments = async (silent = false) => {
    if (!selectedStoreId || selectedStoreId === "all") return;

    try {
      if (!silent) setLoading(true);
      const response = await apiClient.getAdjustmentsByStore({
        store_id: selectedStoreId,
        status: "all", // Show all adjustments (pending + approved)
      });

      const adjustmentsData = response.data || [];
      if (Array.isArray(adjustmentsData)) {
        setAdjustments(adjustmentsData);
      } else {
        setAdjustments([]);
      }
    } catch (error: any) {
      if (!silent) toast.error(error.error || "Failed to fetch adjustments");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchStockOutOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // Fetch ALL invoices (both walking/cash and registered/party) without status filter
      const response = await apiClient.getSalesInvoices({});

      const invoicesData = Array.isArray(response) ? response : (response.data || []);
      if (Array.isArray(invoicesData)) {
        const formattedInvoices = invoicesData
          // Show ALL invoices regardless of status for Stock Out Items
          // This allows users to see all sales invoices that may need delivery
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
              message: `New invoice (${invoice.invoiceNo || "N/A"}) is created and approved. Refresh the page to view invoice in Stock Out Items.`,
              type: "info",
              module: "store",
              action: {
                label: "Open Stock Out Items",
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
      // Prevent opening stock out for fully delivered, reversed, or cancelled invoices
      if (order.status === "fully_delivered") {
        toast.info("This invoice is already fully delivered and cannot be processed for stock out.");
        return;
      }
      if (order.status === "reversed" || order.status === "partially_reversed") {
        toast.info("This invoice has been reversed and cannot be processed for stock out.");
        return;
      }
      if (order.status === "cancelled") {
        toast.info("This invoice has been cancelled and cannot be processed for stock out.");
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
          items: rawItems.map((item: any) => ({
            id: item.id,
            partId: item.partId || item.part_id || "",
            partNo: item.partNo || item.part_no,
            description: item.description || "",
            orderedQty: item.orderedQty || item.ordered_qty || 0,
            deliveredQty: item.deliveredQty || item.delivered_qty || 0,
            unitPrice: item.unitPrice || item.unit_price || 0,
            lineTotal: item.lineTotal || item.line_total || 0,
          })),
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
        const selectedLocations = Array.isArray(item.InvoiceRackShelf)
          ? item.InvoiceRackShelf
          : [];
        const location = selectedLocations.length
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
        setSelectedOrder(fullOrder);
        setLocationAssignDialogOpen(true);
      } else {
        toast.error("Failed to load order details");
      }
    } catch (error: any) {
      toast.error("Failed to load order details");
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

      if (deleteOrderType === "dpo" && selectedOrder) {
        await apiClient.deleteDirectPurchaseOrder(selectedOrder.id);
        toast.success(`Direct Purchase Order ${selectedOrder.dpo_no} deleted successfully`);
        await fetchOrders();
      } else if (deleteOrderType === "po" && selectedPurchaseOrder) {
        await apiClient.deletePurchaseOrder(selectedPurchaseOrder.id);
        toast.success(`Purchase Order ${selectedPurchaseOrder.po_number} deleted successfully`);
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
                  <p><strong>Date:</strong> ${format(new Date(order.date), "MMM dd, yyyy")}</p>
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
      // It's a Purchase Order
      setSelectedPurchaseOrder(order as PurchaseOrder);
      setSelectedOrder(null);
      setReceivingOrderType("po");
    }
    setReceiveDialogOpen(true);
  };

  const confirmReceive = async () => {
    if (!selectedOrder && !selectedPurchaseOrder) return;
    if (!selectedStoreId) {
      toast.error("Please select a store first");
      return;
    }

    try {
      setLoading(true);
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
          items: itemsForUpdate,
        });

        toast.success(`Order ${selectedOrder.dpo_no} has been received and stock added`);
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
          received_qty: item.quantity || item.orderedQty || 0, // Receive full quantity
        }));

        await apiClient.updatePurchaseOrder(selectedPurchaseOrder.id, {
          status: "Received",
          ...(resolvedStoreId ? { store_id: resolvedStoreId } : {}),
          items: itemsForUpdate,
        });

        toast.success(`Purchase Order ${selectedPurchaseOrder.po_number} has been received and stock added`);
      }

      setReceiveDialogOpen(false);
      setSelectedOrder(null);
      setSelectedPurchaseOrder(null);
      setReceivingOrderType(null);

      // Refresh orders
      if (typeFilter === "receiving") {
        await fetchOrders();
        await fetchPurchaseOrders();
      } else {
        await fetchOrders();
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
      return inDateRange && matchesSearch;
    })
    : [];

  // Filter Direct Purchase Orders (for Receiving - DPOs are receivable)
  const filteredDPOs = Array.isArray(orders)
    ? orders.filter((order) => {
      const inDateRange = isWithinDateRange(order.date);
      const matchesSearch =
        order.dpo_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.store_name.toLowerCase().includes(searchTerm.toLowerCase());
      return inDateRange && matchesSearch;
    })
    : [];

  // Apply receiving filter (PO vs DPO) when in receiving mode
  const displayPurchaseOrders = typeFilter === "receiving" && receivingFilter !== "dpo"
    ? filteredPurchaseOrders
    : [];
  const displayDPOs = typeFilter === "receiving" && receivingFilter !== "po"
    ? filteredDPOs
    : [];

  // Filter Sales Invoices (for Delivering)
  const filteredStockOutOrders = (stockOutOrders || []).filter((invoice) => {
    const inDateRange = isWithinDateRange(invoice.invoiceDate);
    const matchesSearch =
      invoice.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    return inDateRange && matchesSearch;
  });

  const mixedOrders = [
    ...filteredPurchaseOrders.map((order) => ({
      type: "po" as const,
      id: order.id,
      number: order.po_number,
      date: order.date,
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
      party: order.store_name || "N/A",
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                    {dateFrom ? format(new Date(dateFrom), "dd/MM/yyyy") : "Pick a date"}
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
                    {dateTo ? format(new Date(dateTo), "dd/MM/yyyy") : "Pick a date"}
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
                  variant={typeFilter === "receiving" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("receiving")}
                  className="gap-2"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Receiving Items
                </Button>
                <Button
                  variant={typeFilter === "stock-out" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("stock-out")}
                  className="gap-2"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Stock Out Items
                </Button>
                <Button
                  variant={typeFilter === "adjusted" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("adjusted")}
                  className="gap-2"
                >
                  <Package className="w-4 h-4" />
                  Adjusted Items
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
              {typeFilter === "receiving"
                ? "Receiving Items"
                : typeFilter === "stock-out"
                  ? "Stock Out Items"
                  : typeFilter === "adjusted"
                    ? "Adjusted Items"
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
                            <TableHead>Order Number</TableHead>
                            <TableHead>Date</TableHead>
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
                          {mixedOrders.map((row) => (
                            <TableRow key={`${row.type}-${row.id}`}>
                              <TableCell className="font-medium">{row.number}</TableCell>
                              <TableCell>
                                {row.date ? format(new Date(row.date), "MMM dd, yyyy") : "-"}
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
                                    variant={
                                      row.status === "Received"
                                        ? "default"
                                        : row.status === "Draft"
                                          ? "secondary"
                                          : "outline"
                                    }
                                  >
                                    {row.status}
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
                                      {(row.raw as PurchaseOrder).status !== "Cancelled" && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditPurchaseOrder(row.raw as PurchaseOrder)}
                                            title="Edit Order"
                                          >
                                            <Edit className="w-4 h-4" />
                                          </Button>
                                          {(row.raw as PurchaseOrder).status !== "Received" && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleDeleteOrder(row.raw as PurchaseOrder)}
                                              title="Delete Order"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          )}
                                        </>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handlePrintPurchaseOrder(row.raw as PurchaseOrder)}
                                        title="Print Order"
                                      >
                                        <Printer className="w-4 h-4" />
                                      </Button>
                                      {(row.raw as PurchaseOrder).status !== "Received" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleReceiveOrder(row.raw as PurchaseOrder)}
                                          title="Receive Order"
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
                                      {(row.raw as DirectPurchaseOrder).status !== "Cancelled" && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditDPO(row.raw as DirectPurchaseOrder)}
                                            title="Edit Order"
                                          >
                                            <Edit className="w-4 h-4" />
                                          </Button>
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
                                          {(row.raw as DirectPurchaseOrder).status !== "Received" &&
                                            (row.raw as DirectPurchaseOrder).status !== "Completed" && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteOrder(row.raw as DirectPurchaseOrder)}
                                                title="Delete Order"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </Button>
                                            )}
                                        </>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handlePrintReceipt(row.raw as DirectPurchaseOrder)}
                                        title="Print Receipt"
                                      >
                                        <Printer className="w-4 h-4" />
                                      </Button>
                                      {(row.raw as DirectPurchaseOrder).status !== "Received" && (
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

                                  {row.type === "stock-out" && row.status !== "fully_delivered" && row.status !== "reversed" && row.status !== "partially_reversed" && row.status !== "cancelled" && (
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

                {/* Receiving Items - Purchase Orders and DPOs */}
                {typeFilter === "receiving" && (
                  (displayPurchaseOrders.length === 0 && displayDPOs.length === 0) ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No orders found for receiving.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order Number</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Supplier/Store</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Purchase Orders */}
                          {displayPurchaseOrders.map((order) => (
                            <TableRow key={`po-${order.id}`}>
                              <TableCell className="font-medium">
                                {order.po_number}
                              </TableCell>
                              <TableCell>
                                {format(new Date(order.date), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">PO</Badge>
                              </TableCell>
                              <TableCell>{order.supplier_name}</TableCell>
                              <TableCell>{order.items_count} items</TableCell>
                              <TableCell>
                                {order.total_quantity || 0}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    order.status === "Received"
                                      ? "default"
                                      : order.status === "Draft"
                                        ? "secondary"
                                        : "outline"
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
                                    onClick={() => handleViewPurchaseOrder(order)}
                                    title="View Order"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {order.status !== "Cancelled" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditPurchaseOrder(order)}
                                        title="Edit Order"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      {order.status !== "Received" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteOrder(order)}
                                          title="Delete Order"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePrintPurchaseOrder(order)}
                                    title="Print Order"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </Button>
                                  {order.status !== "Received" && (
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
                          {/* Direct Purchase Orders (DPOs) */}
                          {displayDPOs.map((order) => (
                            <TableRow key={`dpo-${order.id}`}>
                              <TableCell className="font-medium">
                                {order.dpo_no}
                              </TableCell>
                              <TableCell>
                                {format(new Date(order.date), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">DPO</Badge>
                              </TableCell>
                              <TableCell>{order.store_name}</TableCell>
                              <TableCell>{order.items_count} items</TableCell>
                              <TableCell>
                                {order.total_quantity || 0}
                              </TableCell>
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
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditDPO(order)}
                                        title="Edit Order"
                                        disabled={order.status === "Received"}
                                        className={order.status === "Received" ? "opacity-50 cursor-not-allowed" : undefined}
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
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
                                      {order.status !== "Received" && order.status !== "Completed" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteOrder(order)}
                                          title="Delete Order"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePrintReceipt(order)}
                                    title="Print Receipt"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </Button>
                                  {order.status !== "Received" && (
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

                {/* Stock Out Items - Sales Invoices */}
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
                            <TableHead>Order Number</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Sent To</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStockOutOrders.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-medium">
                                {invoice.invoiceNo}
                              </TableCell>
                              <TableCell>
                                {format(new Date(invoice.invoiceDate), "MMM dd, yyyy")}
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
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handlePrintStockOutReceipt(invoice)}
                                    title="Confirm Stock Out"
                                    disabled={
                                      invoice.status === "pending" ||
                                      invoice.status === "fully_delivered" ||
                                      invoice.status === "reversed" ||
                                      invoice.status === "partially_reversed" ||
                                      invoice.status === "cancelled"
                                    }
                                  >
                                    <ArrowDownCircle className="w-4 h-4 mr-1" />
                                    {invoice.status === "pending"
                                      ? "Pending"
                                      : invoice.status === "fully_delivered" 
                                      ? "Delivered" 
                                      : invoice.status === "reversed" || invoice.status === "partially_reversed"
                                        ? "Reversed"
                                        : invoice.status === "cancelled"
                                          ? "Cancelled"
                                          : "Stock Out"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}

                {/* Adjusted Items - Adjustments */}
                {typeFilter === "adjusted" && (
                  adjustments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No adjustments found.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Voucher</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {adjustments.map((adjustment) => (
                            <TableRow key={adjustment.id}>
                              <TableCell>
                                {format(new Date(adjustment.date), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="font-medium">
                                {adjustment.subject || "Stock Adjustment"}
                              </TableCell>
                              <TableCell>{adjustment.items_count} items</TableCell>
                              <TableCell>
                                Rs {adjustment.total_amount?.toFixed(2) || "0.00"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    adjustment.status === "approved"
                                      ? "default"
                                      : adjustment.status === "pending"
                                        ? "secondary"
                                        : "outline"
                                  }
                                >
                                  {adjustment.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {adjustment.voucher_number ? (
                                  <Badge variant="outline">
                                    {adjustment.voucher_number} ({adjustment.voucher_status || "draft"})
                                  </Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedAdjustment(adjustment);
                                      setAdjustmentDialogOpen(true);
                                    }}
                                    title="View/Update Adjustment"
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    {adjustment.status === "pending" ? "Update" : "View"}
                                  </Button>
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
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                      <div className="space-y-2">
                        <Label>Select Item</Label>
                        <SearchableSelect
                          options={partOptions.map((part) => ({
                            value: part.id,
                            label: `${part.masterPartNo || "N/A"} | ${part.partNo}`,
                            description: part.description || "No description",
                          }))}
                          value={selectedAssociationPartId}
                          onValueChange={(value) => {
                            setSelectedAssociationPartId(value);
                            fetchPartAssociation(value);
                          }}
                          placeholder={
                            associationLoading && partOptions.length === 0
                              ? "Loading items..."
                              : "Select item"
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Model</TableHead>
                            <TableHead className="text-right">Quantity Used</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!selectedAssociationPartId ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                                Select an item to view model association.
                              </TableCell>
                            </TableRow>
                          ) : associationLoading ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                                Loading model association...
                              </TableCell>
                            </TableRow>
                          ) : associationRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                                No model association found for this item.
                              </TableCell>
                            </TableRow>
                          ) : (
                            associationRows.map((row, idx) => (
                              <TableRow key={`${row.model}-${idx}`}>
                                <TableCell>{row.model}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {row.qtyUsed.toLocaleString("en-US")}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
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
          onEdit={() => {
            setViewPODialogOpen(false);
            handleEditPurchaseOrder(selectedPurchaseOrder!);
          }}
          onDelete={() => {
            setViewPODialogOpen(false);
            handleDeleteOrder(selectedPurchaseOrder!);
          }}
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

      {/* Print Receipt Dialog */}
      {selectedOrder && (
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
            await fetchStockOutOrders();
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
            // Refresh orders
            await fetchOrders();
            if (typeFilter === "receiving") {
              await fetchPurchaseOrders();
            }
          }}
        />
      )}

      {/* Assign Location Dialog */}
      {selectedOrder && (
        <StoreLocationAssign
          order={selectedOrder}
          storeId={selectedStoreId}
          open={locationAssignDialogOpen}
          onOpenChange={setLocationAssignDialogOpen}
          onSuccess={async () => {
            setLocationAssignDialogOpen(false);
            setSelectedOrder(null);
            // Refresh orders
            await fetchOrders();
            if (typeFilter === "receiving") {
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
            if (typeFilter === "receiving") {
              await fetchOrders();
            }
          }}
        />
      )}


      {/* Adjusted Item Dialog */}
      {selectedAdjustment && (
        <StoreAdjustedItem
          adjustment={selectedAdjustment}
          open={adjustmentDialogOpen}
          onOpenChange={setAdjustmentDialogOpen}
          onSuccess={async () => {
            setAdjustmentDialogOpen(false);
            setSelectedAdjustment(null);
            // Refresh adjustments
            await fetchAdjustments();
          }}
        />
      )}

      {/* Receive Order Dialog */}
      <AlertDialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
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
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSelectedOrder(null);
                setSelectedPurchaseOrder(null);
                setReceivingOrderType(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmReceive}>
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

