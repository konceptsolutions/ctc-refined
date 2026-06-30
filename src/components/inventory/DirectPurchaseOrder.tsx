import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { apiClient, getApiBaseUrl } from "@/lib/api";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
  Save,
  RotateCcw,
  Calendar,
  Printer,
  Undo2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  branchAccountDisplayName,
  fetchBranchAccountOptions,
} from "@/lib/branch-accounts";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DirectPurchaseOrderItem {
  id: string;
  partNo: string;
  description: string;
  brand: string;
  uom: string;
  quantity: number;
  returnedQuantity: number;
  purchasePrice: number;
  amount: number;
}

interface DirectPurchaseOrder {
  id: string;
  dpoNo: string;
  invoiceNo?: string;
  invoiceDate?: string;
  store: string;
  supplier?: string;
  requestDate: string;
  date: string; // Raw date for sorting
  description: string;
  grandTotal: number;
  /** Supplier discount on items subtotal only */
  discount?: number;
  /** Sum of DPO expense rows (added to grand total) */
  totalExpenses?: number;
  status: "Draft" | "Order Receivable Pending" | "Completed" | "Cancelled" | "Received";
  items: DirectPurchaseOrderItem[];
  account: string;
}

// Expense types are fetched from API - only user-created expense types will be shown

type ViewMode = "list" | "create" | "edit";

interface OrderItemForm {
  id: string;
  partId: string;
  quantity: number | "";
  purchasePrice: number | "";
  priceA: number | "";
  priceB: number | "";
  priceM: number | "";
  weight: number; // Weight in kg for expense distribution
}

interface ExpenseForm {
  id: string;
  expenseType: string;
  payableAccount: string;
  description: string;
  amount: number;
}

type InquiryConversionDraft = {
  source: "sales-inquiry";
  target: "invoice" | "quotation" | "dpo";
  inquiryNo?: string;
  description?: string;
  items?: Array<{
    partId: string;
    quantity: number;
    purchasePrice?: number;
    priceA?: number;
    priceB?: number;
    priceM?: number;
    partNo?: string;
    description?: string;
  }>;
};

const DPO_FIXED_EXPENSE_ACCOUNT = "Local Purchase Freight";

const DPO_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];

type DirectPurchaseOrderVariant = "local-purchase" | "transfer-in";

const DPO_VARIANT_LABELS: Record<
  DirectPurchaseOrderVariant,
  {
    listTitle: string;
    listSubtitle: string;
    newButton: string;
    allOrdersTitle: string;
    formTitleCreate: string;
    formTitleEdit: string;
    viewDialogTitle: string;
    createdToast: string;
    updatedToast: string;
    deletedToast: string;
    numberPrefix: string;
    orderNumberLabel: string;
    partyColumnLabel: string;
    partyFieldLabel: string;
    formTabLabel: string;
    listTabLabel: string;
  }
> = {
  "local-purchase": {
    listTitle: "Local Purchase Orders",
    listSubtitle: "Manage local purchase orders",
    newButton: "New Local Purchase Order",
    allOrdersTitle: "All Local Purchase Orders",
    formTabLabel: "Local Purchase Form",
    listTabLabel: "Local Purchase List",
    formTitleCreate: "Add Local Purchase Order",
    formTitleEdit: "Edit Local Purchase Order",
    viewDialogTitle: "Local Purchase Order Details",
    createdToast: "Local Purchase Order created successfully",
    updatedToast: "Local Purchase Order updated successfully",
    deletedToast: "Local Purchase Order deleted successfully",
    numberPrefix: "DPO",
    orderNumberLabel: "DPO No.",
    partyColumnLabel: "Supplier",
    partyFieldLabel: "Supplier",
  },
  "transfer-in": {
    listTitle: "Transfer In",
    listSubtitle: "Record stock received via transfer in",
    newButton: "New Transfer In",
    allOrdersTitle: "All Transfer In",
    formTabLabel: "Transfer In Form",
    listTabLabel: "Transfer In List",
    formTitleCreate: "Add Transfer In",
    formTitleEdit: "Edit Transfer In",
    viewDialogTitle: "Transfer In Details",
    createdToast: "Transfer In created successfully",
    updatedToast: "Transfer In updated successfully",
    deletedToast: "Transfer In deleted successfully",
    numberPrefix: "TIN",
    orderNumberLabel: "Transfer In No.",
    partyColumnLabel: "Branch",
    partyFieldLabel: "Branch",
  },
};

const createDefaultDpoExpense = (): ExpenseForm => ({
  id: String(Date.now() + Math.random()),
  expenseType: DPO_FIXED_EXPENSE_ACCOUNT,
  payableAccount: DPO_FIXED_EXPENSE_ACCOUNT,
  description: "",
  amount: 0,
});

export const DirectPurchaseOrder = ({
  variant = "local-purchase",
}: {
  variant?: DirectPurchaseOrderVariant;
}) => {
  const labels = DPO_VARIANT_LABELS[variant];
  const isTransferIn = variant === "transfer-in";
  const navigate = useNavigate();

  // Orders state
  const [orders, setOrders] = useState<DirectPurchaseOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("create");
  const [pageView, setPageView] = useState<"form" | "list">("form");
  const [selectedOrder, setSelectedOrder] = useState<DirectPurchaseOrder | null>(null);

  // View dialog
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

  // Payment dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | "">("");
  const [paymentBankAccount, setPaymentBankAccount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentDescription, setPaymentDescription] = useState("");
  const [showBackToInquiry, setShowBackToInquiry] = useState(false);
  const [bankCashAccounts, setBankCashAccounts] = useState<{ id: string; value: string; label: string }[]>([]);

  // Form state
  const [formStore, setFormStore] = useState("");
  const [formSupplier, setFormSupplier] = useState("");
  const [formBranch, setFormBranch] = useState("");
  const [formRequestDate, setFormRequestDate] = useState<Date>(new Date());
  const [formInvoiceNo, setFormInvoiceNo] = useState("");
  const [formInvoiceDate, setFormInvoiceDate] = useState<Date | undefined>(
    undefined,
  );
  const [formDescription, setFormDescription] = useState("");
  const [formAccount, setFormAccount] = useState("");
  const [formDiscount, setFormDiscount] = useState<number | "">("");
  const [formItems, setFormItems] = useState<OrderItemForm[]>([]);
  const [formExpenses, setFormExpenses] = useState<ExpenseForm[]>([]);

  // Return dialog state
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnDpoData, setReturnDpoData] = useState<any>(null);
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [returnAccount, setReturnAccount] = useState("");
  const [returnDeduction, setReturnDeduction] = useState<number>(0);

  // API data state
  const [stores, setStores] = useState<{ value: string; label: string }[]>([]);
  const [parts, setParts] = useState<
    {
      id: string;
      partNo: string; // Part No (part_no)
      masterPartNo: string; // Master Part No (master_part_no)
      description: string;
      brand: string;
      uom: string;
      price: number;
      weight: number;
    }[]
  >([]);
  const [brands, setBrands] = useState<{ id: string; value: string; label: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; value: string; label: string }[]>([]);
  const [branchAccounts, setBranchAccounts] = useState<
    { id: string; value: string; label: string }[]
  >([]);
  const [accounts, setAccounts] = useState<{ id: string; value: string; label: string }[]>([]);
  const [payableAccounts, setPayableAccounts] = useState<{ id: string; value: string; label: string }[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<{ id: string; name: string; code?: string }[]>([]);

  const SHOW_EXPENSES_UI = true;

  // Per-row baselines for the Part's stored Price A/Price B at the time the
  // part was selected. Used to detect user edits and push back to the Part
  // record via updatePartPrices when the user blurs the input.
  const [rowPriceBaselines, setRowPriceBaselines] = useState<
    Record<string, { priceA: number | null; priceB: number | null }>
  >({});
  const [savingRowPrice, setSavingRowPrice] = useState<Record<string, boolean>>(
    {},
  );

  // History sidebar state
  const [selectedPartForHistory, setSelectedPartForHistory] = useState<string | null>(null);
  const [selectedHistoryRowId, setSelectedHistoryRowId] = useState<string | null>(
    null,
  );
  const [historyBasePrices, setHistoryBasePrices] = useState<{
    priceA: number | null;
    priceB: number | null;
  }>({ priceA: null, priceB: null });
  const [partHistory, setPartHistory] = useState<{
    priceA: number | null;
    priceB: number | null;
    priceM: number | null;
    lastPurchasePrice: number | null;
    lastPurchaseDate: string | null;
    lastPurchaseDpoNo: string | null;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Fetch orders
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getDirectPurchaseOrders({
        status: statusFilter !== "all" ? statusFilter : undefined,
        order_type: isTransferIn ? "transfer_in" : "local_purchase",
        page: currentPage,
        limit: itemsPerPage,
      }) as any;

      if (response.error) {
        toast.error(response.error);
        return;
      }

      const responseData = response;
      const data = responseData.data || [];
      const pagination = responseData.pagination || { total: 0 };

      // Filter by search term on client side
      let filteredData = data;
      if (searchTerm) {
        filteredData = data.filter((order: any) => {
          const searchLower = searchTerm.toLowerCase();
          return (
            order.dpo_no?.toLowerCase().includes(searchLower) ||
            order.store_name?.toLowerCase().includes(searchLower) ||
            order.supplier_name?.toLowerCase().includes(searchLower) ||
            order.branch_account_name?.toLowerCase().includes(searchLower) ||
            order.description?.toLowerCase().includes(searchLower)
          );
        });
      }

      setOrders(filteredData.map((o: any) => ({
        id: o.id,
        dpoNo: o.dpo_no,
        invoiceNo: o.invoice_no || "",
        invoiceDate: o.invoice_date
          ? new Date(o.invoice_date).toLocaleDateString("en-GB")
          : "",
        store: o.store_name || "N/A",
        supplier: isTransferIn
          ? branchAccountDisplayName(o.branch_account_name) || "N/A"
          : o.supplier_name || "N/A",
        requestDate: new Date(o.date).toLocaleDateString('en-GB'),
        date: o.date, // Raw date for sorting
        description: o.description || "",
        grandTotal: o.total_amount || 0,
        discount: Number(o.discount) || 0,
        status: o.status as "Draft" | "Order Receivable Pending" | "Completed" | "Cancelled",
        items: [],
        account: o.account || "",
      })));
      setTotalRecords(pagination.total || 0);
    } catch (error: any) {
      toast.error(`Error fetching orders: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch stores
  const fetchStores = async () => {
    try {
      const response = await apiClient.getStores() as any;
      const storesData = response.data || response;
      if (Array.isArray(storesData)) {
        setStores(storesData.map((s: any) => ({ value: s.id, label: s.name })));
      }
    } catch (error: any) {
      // Keep UI usable if stores request fails.
    }
  };

  // Fetch parts
  const fetchParts = async () => {
    try {
      // Load ALL active parts so the dropdown can show everything
      const response = await apiClient.getParts({ page: 1, limit: "all", status: "active" }) as any;
      const partsData = response.data || response;
      if (Array.isArray(partsData)) {
        setParts(partsData.map((p: any) => ({
          id: p.id,
          partNo: p.part_no || p.partNo || p.master_part_no || p.masterPartNo || '',
          masterPartNo: p.master_part_no || p.masterPartNo || '',
          description: p.description || '',
          brand: p.brand_name || p.brand?.name || null,
          uom: p.uom || 'pcs',
          price: p.price_a || p.priceA || p.cost || 0,
          weight: parseFloat(p.weight) || 0,
        })));
      }
    } catch (error: any) {
      // Keep UI usable if parts request fails.
    }
  };

  // Fetch brands from API
  const fetchBrands = async () => {
    try {
      const response = await apiClient.getBrands() as any;
      // API returns array directly or wrapped in data property
      let brandsData: any[] = [];

      if (Array.isArray(response)) {
        brandsData = response;
      } else if (response && Array.isArray(response.data)) {
        brandsData = response.data;
      } else if (response && response.error) {
        setBrands([]);
        return;
      }

      const formattedBrands = brandsData
        .filter((brand: any) => brand && brand.id && (brand.name || brand.label))
        .map((brand: any) => ({
          id: brand.id,
          value: brand.id,
          label: brand.name || brand.label || '',
        }));

      setBrands(formattedBrands);
    } catch (error: any) {
      setBrands([]);
    }
  };

  // Fetch suppliers from API
  const fetchSuppliers = async () => {
    try {
      const response = await apiClient.getSuppliers({ status: 'active', limit: 1000 }) as any;
      const data = response.data || response;
      const suppliersData = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

      const formattedSuppliers = suppliersData
        .filter((supplier: any) => {
          const name = (supplier.name || supplier.companyName || '').trim();
          return name !== '';
        })
        .map((supplier: any) => ({
          id: supplier.id,
          value: supplier.id,
          label: supplier.name || supplier.companyName || '',
        }));

      setSuppliers(formattedSuppliers);
    } catch (error: any) {
      setSuppliers([]);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await apiClient.getAccounts() as any;
      const accountsData = Array.isArray(response) ? response : (response.data || []);

      const formattedAccounts = accountsData
        .filter((acc: any) => {
          if (!acc || !acc.id || !acc.name) return false;

          // Case-insensitive status check
          const status = (acc.status || '').toLowerCase();
          if (status !== 'active') return false;

          const subgroupName = (
            acc.subgroup?.name ??
            acc.subGroup?.name ??
            acc.Subgroup?.name ??
            ""
          ).toLowerCase();

          // Strict requirement: only show Cash/Bank *subgroup* accounts.
          // (Do not include by code prefix.)
          return subgroupName.includes("cash") || subgroupName.includes("bank");
        })
        .map((acc: any) => ({
          id: acc.id,
          value: acc.id,
          label: `${acc.code} - ${acc.name}`,
        }));

      setAccounts(formattedAccounts);
    } catch (error: any) {
      setAccounts([]);
    }
  };

  const fetchBankCashAccounts = async () => {
    try {
      const response = await apiClient.getAccounts() as any;
      const accountsData = Array.isArray(response) ? response : (response.data || []);

      const formattedAccounts = accountsData
        .filter((acc: any) => {
          if (!acc || !acc.id || !acc.name) return false;

          // Case-insensitive status check
          const status = (acc.status || '').toLowerCase();
          if (status !== 'active') return false;

          const subgroupName = (
            acc.subgroup?.name ??
            acc.subGroup?.name ??
            acc.Subgroup?.name ??
            ""
          ).toLowerCase();

          // Strict requirement: only show Cash/Bank *subgroup* accounts.
          return subgroupName.includes("cash") || subgroupName.includes("bank");
        })
        .map((acc: any) => ({
          id: acc.id,
          value: acc.id,
          label: `${acc.code} - ${acc.name}`,
        }));

      setBankCashAccounts(formattedAccounts);
    } catch (error: any) {
      setBankCashAccounts([]);
    }
  };

  const fetchPayableAccounts = async () => {
    try {
      const response = await apiClient.getAccounts() as any;
      const accountsData = Array.isArray(response) ? response : (response.data || []);

      const formattedPayableAccounts = accountsData
        .filter((acc: any) => {
          if (!acc || !acc.id || !acc.name) return false;

          // Case-insensitive status check
          const status = (acc.status || '').toLowerCase();
          if (status !== 'active') return false;

          // Must be in subgroup 302 (Purchase Expenses Payables)
          const subgroupCode = acc.subgroup?.code || '';
          const subgroupName = (acc.subgroup?.name || '').toLowerCase();

          // Check by subgroup code first (most reliable)
          if (subgroupCode === '302') return true;

          // Fallback: check by subgroup name
          return subgroupName.includes('purchase expenses payables') ||
            subgroupName.includes('purchase expenses') ||
            (subgroupName.includes('purchase') && subgroupName.includes('expenses'));
        })
        .map((acc: any) => ({
          id: acc.id,
          value: acc.id,
          label: `${acc.code} - ${acc.name}`,
        }));

      // Debug: Log fetched payable accounts

      setPayableAccounts(formattedPayableAccounts);
    } catch (error: any) {
      setPayableAccounts([]);
    }
  };

  // Fetch expense types from API
  const fetchExpenseTypes = async () => {
    try {
      const response = await apiClient.getExpenseTypes({
        status: 'Active',
        limit: 1000
      }) as any;

      // API returns { data: [...], pagination: {...} }
      const expenseTypesData = response.data ? (Array.isArray(response.data) ? response.data : []) : [];

      // Filter only active expense types with valid names
      const activeExpenseTypes = expenseTypesData
        .filter((type: any) => {
          const status = (type.status || '').toLowerCase();
          const name = (type.name || '').trim();
          return status === 'active' && name !== '' && type.id;
        })
        .map((type: any) => ({
          id: type.id,
          name: type.name.trim(),
          code: type.code || '',
        }));

      // Only use expense types from API - no default/fallback types
      setExpenseTypes(activeExpenseTypes);
    } catch (error: any) {
      // If API fails, show empty list (user must create expense types first)
      setExpenseTypes([]);
    }
  };

  // Shortcut key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + Z
      if (e.altKey && e.key.toLowerCase() === "z") {
        if (viewMode === "create" || viewMode === "edit") {
          e.preventDefault();
          handleAddItem();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode]);

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, statusFilter]);

  useEffect(() => {
    if (viewMode === "list" || pageView === "list") {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, pageView]);

  useEffect(() => {
    fetchStores();
    fetchParts();
    fetchBrands();
    if (!isTransferIn) {
      fetchSuppliers();
    }
    fetchAccounts();
    fetchPayableAccounts();
    fetchExpenseTypes();
    fetchBankCashAccounts();
  }, [isTransferIn]);

  useEffect(() => {
    if (!isTransferIn) return;
    fetchBranchAccountOptions("Current Liabilities")
      .then(setBranchAccounts)
      .catch(() => setBranchAccounts([]));
  }, [isTransferIn]);

  // Form tab opens on create — initialize default expense row like resetForm()
  useEffect(() => {
    if (pageView !== "form" || viewMode !== "create") return;
    setFormExpenses((prev) =>
      prev.length > 0 ? prev : [createDefaultDpoExpense()],
    );
  }, [pageView, viewMode]);

  // Filter and sort orders (client-side for search) — DPO serial (dpo number) descending
  const filteredOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const byDpo = (b.dpoNo || "").localeCompare(a.dpoNo || "", undefined, { numeric: true, sensitivity: "base" });
      if (byDpo !== 0) return byDpo;
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return (b.id || "").localeCompare(a.id || "");
    });
  }, [orders]);

  // Pagination
  const totalPages = Math.ceil(totalRecords / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    return filteredOrders;
  }, [filteredOrders]);

  // Generate new DPO number - backend will ensure uniqueness if duplicate
  const generateDpoNo = () => {
    const year = new Date().getFullYear();
    // Generate based on current year and records count
    // Backend will auto-correct if duplicate
    const nextNum = totalRecords + 1;
    return `${labels.numberPrefix}-${year}-${String(nextNum).padStart(3, "0")}`;
  };

  // Reset form
  const resetForm = () => {
    setFormStore("");
    setFormSupplier("");
    setFormBranch("");
    setFormRequestDate(new Date());
    setFormInvoiceNo("");
    setFormInvoiceDate(undefined);
    setFormDescription("");
    setFormAccount("");
    setFormDiscount("");
    setFormItems([]);
    setFormExpenses([createDefaultDpoExpense()]);
    setSelectedPartForHistory(null);
    setPartHistory(null);
    setHistoryBasePrices({ priceA: null, priceB: null });
  };

  useEffect(() => {
    const raw = sessionStorage.getItem("salesInquiryConversionDraft");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as InquiryConversionDraft;
      if (!draft || draft.source !== "sales-inquiry" || draft.target !== "dpo") {
        return;
      }
      const mappedItems: OrderItemForm[] = (draft.items || [])
        .filter((item) => item.partId && Number(item.quantity) > 0)
        .map((item, idx) => ({
          id:
            typeof crypto !== "undefined" && (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : `inq-dpo-${Date.now()}-${idx}`,
          partId: item.partId,
          quantity: Number(item.quantity) || "",
          purchasePrice: Number(item.purchasePrice || 0),
          priceA: Number(item.priceA || 0),
          priceB: Number(item.priceB || 0),
          priceM: Number(item.priceM || 0),
          weight: 0,
        }));
      if (mappedItems.length === 0) return;

      const seededParts = (draft.items || [])
        .filter((item) => item.partId)
        .map((item) => ({
          id: item.partId,
          partNo: item.partNo || `PART-${item.partId.slice(0, 6)}`,
          masterPartNo: item.partNo || "",
          description: item.description || "",
          brand: "",
          uom: "",
          price:
            Number(item.priceA || 0) ||
            Number(item.priceB || 0) ||
            Number(item.priceM || 0) ||
            Number(item.purchasePrice || 0) ||
            0,
          weight: 0,
        }));

      if (seededParts.length > 0) {
        setParts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const toAdd = seededParts.filter((p) => !existingIds.has(p.id));
          return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
        });
      }

      resetForm();
      setViewMode("create");
      setPageView("form");
      setFormDescription(
        draft.inquiryNo
          ? `Converted from Inquiry ${draft.inquiryNo}`
          : "Converted from Sales Inquiry",
      );
      setFormItems(mappedItems);
      setShowBackToInquiry(true);
      sessionStorage.removeItem("salesInquiryConversionDraft");
      toast.success(`Loaded ${mappedItems.length} item(s) from Sales Inquiry`);
    } catch {
      sessionStorage.removeItem("salesInquiryConversionDraft");
    }
  }, []);

  // Open create view
  const handleNewOrder = () => {
    resetForm();
    setViewMode("create");
    setPageView("form");
  };

  // Open edit view
  const handleEdit = async (order: DirectPurchaseOrder) => {
    try {
      setLoading(true);
      const response = await apiClient.getDirectPurchaseOrder(order.id) as any;

      if (response.error) {
        toast.error(response.error);
        return;
      }

      const dpo = response;
      setSelectedOrder(order);
      setFormStore(dpo.store_id || "");
      setFormSupplier(dpo.supplier_id || "");
      setFormBranch(dpo.branch_account_id || "");
      setFormDescription(dpo.description || "");
      setFormInvoiceNo(dpo.invoice_no || "");
      setFormInvoiceDate(dpo.invoice_date ? new Date(dpo.invoice_date) : undefined);
      const dDisc = dpo.discount;
      setFormDiscount(
        dDisc !== undefined && dDisc !== null && Number(dDisc) > 0
          ? Number(dDisc)
          : "",
      );

      // Find account ID if account is provided (could be name or ID)
      // Ensure we send Account ID for bank/cash accounts
      if (dpo.account) {
        // First try to find by ID in the accounts list
        const accountById = accounts.find(acc => acc.id === dpo.account || acc.value === dpo.account);
        if (accountById) {
          setFormAccount(accountById.id || accountById.value);
        } else {
          // Try to find by name (label) in accounts list
          const accountByName = accounts.find(acc => acc.label === dpo.account);
          if (accountByName) {
            setFormAccount(accountByName.id || accountByName.value);
          } else {
            // If not found in accounts list yet, set the value as-is (will be resolved when accounts load)
            setFormAccount(dpo.account);
          }
        }
      } else {
        setFormAccount("");
      }

      setFormRequestDate(new Date(dpo.date));

      // Load expenses
      if (dpo.expenses && Array.isArray(dpo.expenses)) {
        const loadedExpenses: ExpenseForm[] = dpo.expenses.map((exp: any) => ({
          id: exp.id || String(Date.now() + Math.random()),
          expenseType: DPO_FIXED_EXPENSE_ACCOUNT,
          payableAccount: DPO_FIXED_EXPENSE_ACCOUNT,
          description: exp.description || "",
          amount: exp.amount || 0,
        }));
        setFormExpenses(loadedExpenses.length > 0 ? loadedExpenses : [createDefaultDpoExpense()]);
      } else {
        setFormExpenses([createDefaultDpoExpense()]);
      }

      // Load items with prices from DPO item (or fallback to part prices)
      const itemsWithDetails = await Promise.all(
        (dpo.items || []).map(async (item: any, idx: number) => {
          // Use prices from DPO item first (they may have been customized)
          let priceA = item.price_a !== undefined && item.price_a !== null ? item.price_a : null;
          let priceB = item.price_b !== undefined && item.price_b !== null ? item.price_b : null;
          let priceM = item.price_m !== undefined && item.price_m !== null ? item.price_m : null;
          let weight = typeof item.weight === "number" ? item.weight : parseFloat(item.weight) || 0;

          // If DPO item doesn't have prices, fetch from part as fallback
          if ((priceA === null || priceB === null || priceM === null) && item.part_id) {
            try {
              const partResponse = await apiClient.getPart(item.part_id) as any;
              if (!partResponse.error && partResponse) {
                if (priceA === null) priceA = partResponse.price_a || null;
                if (priceB === null) priceB = partResponse.price_b || null;
                if (priceM === null) priceM = partResponse.price_m || null;
                if (!weight || weight <= 0) weight = parseFloat(partResponse.weight) || 0;
              }
            } catch (error) {
              // Ignore fallback errors and continue with available row values.
            }
          }

          // If still missing, use weight from already loaded parts list
          if ((!weight || weight <= 0) && item.part_id) {
            const selectedPart = parts.find((p) => p.id === item.part_id);
            if (selectedPart) {
              weight = selectedPart.weight || 0;
            }
          }

          return {
            id: String(idx + 1),
            partId: item.part_id,
            quantity: item.quantity || "",
            purchasePrice: item.purchase_price || "",
            priceA: priceA !== null && priceA !== undefined ? priceA : "",
            priceB: priceB !== null && priceB !== undefined ? priceB : "",
            priceM: priceM !== null && priceM !== undefined ? priceM : "",
            weight,
          };
        })
      );

      setFormItems(itemsWithDetails);

      const mappedExpenses = (dpo.expenses || []).map((exp: any, idx: number) => ({
        id: String(idx + 1),
        expenseType: DPO_FIXED_EXPENSE_ACCOUNT,
        payableAccount: DPO_FIXED_EXPENSE_ACCOUNT,
        description: exp.description || "",
        amount: exp.amount,
      }));
      setFormExpenses(mappedExpenses.length > 0 ? mappedExpenses : [createDefaultDpoExpense()]);

      setViewMode("edit");
      setPageView("form");
    } catch (error: any) {
      toast.error(`Error fetching order: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePageViewChange = (value: string) => {
    const next = value as "form" | "list";
    setPageView(next);
    if (next === "form") {
      if (viewMode === "list") {
        setViewMode("create");
      }
      return;
    }
    setViewMode("list");
  };

  const mapDpoToViewOrder = (dpo: any): DirectPurchaseOrder => ({
    id: dpo.id,
    dpoNo: dpo.dpo_no,
    invoiceNo: dpo.invoice_no || "",
    invoiceDate: dpo.invoice_date
      ? new Date(dpo.invoice_date).toLocaleDateString("en-GB")
      : "",
    store: dpo.store_name || "N/A",
    supplier: dpo.supplier_name || "N/A",
    requestDate: new Date(dpo.date).toLocaleDateString("en-GB"),
    date: dpo.date,
    description: dpo.description || "",
    grandTotal: dpo.total_amount || 0,
    discount: Number(dpo.discount) || 0,
    totalExpenses: (dpo.expenses || []).reduce(
      (sum: number, exp: any) => sum + (Number(exp.amount) || 0),
      0,
    ),
    status: dpo.status as "Draft" | "Order Receivable Pending" | "Completed" | "Cancelled",
    account: dpo.account || "",
    items: (dpo.items || []).map((item: any) => ({
      id: item.id,
      partNo: item.part_no,
      description: item.part_description || item.part_no,
      brand: item.brand || "",
      uom: item.uom || "pcs",
      quantity: item.quantity,
      returnedQuantity: item.returned_quantity || 0,
      purchasePrice: item.purchase_price,
      amount: item.amount,
    })),
  });

  // Open view dialog
  const handleView = async (order: DirectPurchaseOrder) => {
    try {
      setLoading(true);
      const response = await apiClient.getDirectPurchaseOrder(order.id) as any;

      if (response.error) {
        toast.error(response.error);
        return;
      }

      setSelectedOrder(mapDpoToViewOrder(response));
      setShowViewDialog(true);
    } catch (error: any) {
      toast.error(`Error fetching order: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Back to list
  const handleBackToList = () => {
    setPageView("list");
    setViewMode("list");
    setSelectedOrder(null);
    resetForm();
  };

  // Delete order
  const handleDeleteClick = (order: DirectPurchaseOrder) => {
    setOrderToDelete(order.id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;

    try {
      setLoading(true);
      const response = await apiClient.deleteDirectPurchaseOrder(orderToDelete) as any;

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success(labels.deletedToast);

      // Warning: Stock movements are not automatically reversed (backend issue)
      toast.warning("⚠️ Important: Please verify stock movements in Stock In/Out page. Associated stock entries may need manual review.", {
        duration: 6000,
      });

      setOrderToDelete(null);
      fetchOrders();
    } catch (error: any) {
      toast.error(`Error deleting order: ${error.message}`);
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  // Add item to form
  const handleAddItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        partId: "",
        quantity: "",
        purchasePrice: "",
        priceA: "",
        priceB: "",
        priceM: "",
        weight: 0,
      },
    ]);
  };

  // Remove item from form
  const handleRemoveItem = (id: string) => {
    const itemToRemove = formItems.find((item) => item.id === id);
    setFormItems((prev) => prev.filter((item) => item.id !== id));
    // Clear history if the removed item was the one being viewed
    if (itemToRemove && itemToRemove.partId === selectedPartForHistory) {
      setSelectedPartForHistory(null);
      setSelectedHistoryRowId(null);
      setPartHistory(null);
      setHistoryBasePrices({ priceA: null, priceB: null });
    }
  };

  // Fetch part history (optional itemRowId: apply last purchase / catalog price to that line)
  const fetchPartHistory = async (
    partId: string,
    itemRowId?: string | null,
    shouldApplySuggestedPurchasePrice: boolean = true,
  ) => {
    if (!partId) {
      setPartHistory(null);
      return;
    }

    try {
      setLoadingHistory(true);

      // First, fetch the part details to get default prices (fallback)
      let partPriceA: number | null = null;
      let partPriceB: number | null = null;
      let partPriceM: number | null = null;
      let partCatalogPurchase: number | null = null;

      try {
        const partResponse = await apiClient.getPart(partId) as any;
        if (!partResponse.error && partResponse) {
          partPriceA = partResponse.price_a ?? partResponse.priceA ?? null;
          partPriceB = partResponse.price_b ?? partResponse.priceB ?? null;
          partPriceM = partResponse.price_m ?? partResponse.priceM ?? null;
          const pp =
            partResponse.purchase_price ??
            partResponse.purchasePrice ??
            null;
          const co = partResponse.cost ?? null;
          if (pp != null && Number(pp) > 0) {
            partCatalogPurchase = Number(pp);
          } else if (co != null && Number(co) > 0) {
            partCatalogPurchase = Number(co);
          }
        }
      } catch (error: any) {
        // Don't throw - just continue without part prices
      }

      // Fetch direct purchase orders to find last purchase for this part
      let dpoResponse: any = null;
      try {
        dpoResponse = await apiClient.getDirectPurchaseOrders({
          limit: 100,
          order_type: isTransferIn ? "transfer_in" : "local_purchase",
        }) as any;
        // Check if response has error (like 502 Bad Gateway)
        if (dpoResponse?.error) {
          dpoResponse = null; // Set to null to skip processing
        }
      } catch (error: any) {
        dpoResponse = null; // Set to null to skip processing
      }

      let lastPurchasePrice: number | null = null;
      let lastPurchaseDate: string | null = null;
      let lastPurchaseDpoNo: string | null = null;
      let priceA: number | null = null;
      let priceB: number | null = null;
      let priceM: number | null = null;
      let foundDPO = false; // Track if we found any DPO containing this part

      if (dpoResponse && dpoResponse.data && Array.isArray(dpoResponse.data)) {
        // Sort DPOs by date (most recent first) to ensure we get the latest purchase price
        const sortedDPOs = [...dpoResponse.data].sort((a: any, b: any) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA; // Most recent first
        });

        // Find the most recent direct purchase order that contains this part
        // We need to fetch full order details to get items with prices
        for (const order of sortedDPOs) {
          try {
            // Fetch full order details to get items with purchase_price and price A, B, M
            const fullOrderResponse = await apiClient.getDirectPurchaseOrder(order.id) as any;
            // Check if response has error (like 502 Bad Gateway)
            if (fullOrderResponse?.error) {
              continue; // Skip this order
            }
            if (fullOrderResponse && fullOrderResponse.items && Array.isArray(fullOrderResponse.items)) {
              const partItem = fullOrderResponse.items.find((item: any) => {
                // Check both part_id and partId formats
                return (item.part_id === partId || item.partId === partId);
              });
              if (partItem) {
                foundDPO = true; // Mark that we found a DPO containing this part

                // Get purchase price from this DPO item. Use the raw
                // purchase price (NOT loaded with distributed expenses) so
                // the auto-filled "Purchase Price" on the new DPO line
                // matches what was actually paid per unit on the last DPO.
                const purchasePrice = partItem.purchase_price ?? partItem.purchasePrice ?? null;
                const orderDate = fullOrderResponse.date ?? order.date ?? null;
                const orderDpoNo = fullOrderResponse.dpo_no ?? order.dpo_no ?? order.dpoNumber ?? null;

                // Update lastPurchasePrice from the most recent DPO containing
                // this part. This is sorted by date desc, so the first match
                // is the latest.
                if (lastPurchasePrice === null && purchasePrice !== null && purchasePrice !== undefined) {
                  lastPurchasePrice = Number(purchasePrice);
                  lastPurchaseDate = orderDate;
                  lastPurchaseDpoNo = orderDpoNo;
                  foundDPO = true;
                  break;
                }
              }
            }
          } catch (error: any) {
            // Continue to next order - don't break the loop
          }
        }

        // Always use prices from the Part Entry (parts table)
        // Since Price A, B, M fields were removed from DPO, they should always come from the part itself
        priceA = partPriceA;
        priceB = partPriceB;
        priceM = partPriceM;

      }

      setPartHistory({
        priceA: priceA !== null && priceA !== undefined ? Number(priceA) : null,
        priceB: priceB !== null && priceB !== undefined ? Number(priceB) : null,
        priceM: priceM !== null && priceM !== undefined ? Number(priceM) : null,
        lastPurchasePrice: lastPurchasePrice !== null && lastPurchasePrice !== undefined ? Number(lastPurchasePrice) : null,
        lastPurchaseDate,
        lastPurchaseDpoNo,
      });
      setHistoryBasePrices({
        priceA: priceA !== null && priceA !== undefined ? Number(priceA) : null,
        priceB: priceB !== null && priceB !== undefined ? Number(priceB) : null,
      });

      // Populate the row's inline Price A / Price B inputs with the values
      // currently stored on the Part record, and remember those as the
      // baseline so we can detect user edits later. Only fill in the row
      // referenced by `itemRowId`; if the same part appears on another row
      // it keeps whatever value the user typed there.
      if (itemRowId) {
        const numericPriceA =
          priceA !== null && priceA !== undefined ? Number(priceA) : null;
        const numericPriceB =
          priceB !== null && priceB !== undefined ? Number(priceB) : null;
        setFormItems((prev) =>
          prev.map((row) =>
            row.id === itemRowId
              ? {
                  ...row,
                  priceA: numericPriceA ?? "",
                  priceB: numericPriceB ?? "",
                }
              : row,
          ),
        );
        setRowPriceBaselines((prev) => ({
          ...prev,
          [itemRowId]: {
            priceA: numericPriceA,
            priceB: numericPriceB,
          },
        }));
      }

      const suggestPurchase: number | null =
        lastPurchasePrice !== null && lastPurchasePrice !== undefined
          ? Number(lastPurchasePrice)
          : partCatalogPurchase;

      if (
        shouldApplySuggestedPurchasePrice &&
        itemRowId &&
        suggestPurchase !== null &&
        !Number.isNaN(suggestPurchase)
      ) {
        setFormItems((prev) =>
          prev.map((row) => {
            if (row.id !== itemRowId || row.partId !== partId) {
              return row;
            }
            return { ...row, purchasePrice: suggestPurchase };
          }),
        );
      }
    } catch (error: any) {
      // Set all values to null to show N/A in the UI
      setPartHistory({
        priceA: null,
        priceB: null,
        priceM: null,
        lastPurchasePrice: null,
        lastPurchaseDate: null,
        lastPurchaseDpoNo: null,
      });
      setHistoryBasePrices({ priceA: null, priceB: null });
    } finally {
      setLoadingHistory(false);
    }
  };

  // Update form item
  const handleUpdateItem = (id: string, field: keyof OrderItemForm, value: string | number) => {
    setFormItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };

          // When part is selected, also set its weight and clear purchase price so last price can apply
          if (field === "partId" && typeof value === "string") {
            if (value) {
              updated.purchasePrice = "";
              const selectedPart = parts.find((p) => p.id === value);
              if (selectedPart) {
                updated.weight = selectedPart.weight || 0;
              }
            } else {
              updated.purchasePrice = "";
              updated.weight = 0;
              setSelectedPartForHistory(null);
              setSelectedHistoryRowId(null);
              setPartHistory(null);
              setHistoryBasePrices({ priceA: null, priceB: null });
            }
          }

          // Update brand information when part is selected; fetch history and suggested purchase price
          if (field === "partId") {
            if (typeof value === "string" && value) {
              setSelectedHistoryRowId(id);
              apiClient
                .getPart(value)
                .then((partResponse) => {
                  const part = partResponse as any;
                  if (part?.error) {
                    return;
                  }
                  if (part) {
                    setParts((currentParts) =>
                      currentParts.map((p) => {
                        if (p.id === value && !p.brand && part.brand_name) {
                          return { ...p, brand: part.brand_name };
                        }
                        return p;
                      }),
                    );
                  }
                })
                .catch(() => {});
              setSelectedPartForHistory(value);
              void fetchPartHistory(value, id);
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  const handleUpdatePriceFromHistory = (
    field: "priceA" | "priceB",
    value: string,
  ) => {
    const parsedValue = value === "" ? "" : Number(value);
    const normalizedValue =
      parsedValue === "" || Number.isNaN(parsedValue) ? "" : parsedValue;

    setFormItems((prev) =>
      prev.map((item) => {
        if (selectedHistoryRowId) {
          return item.id === selectedHistoryRowId
            ? { ...item, [field]: normalizedValue }
            : item;
        }
        if (selectedPartForHistory && item.partId === selectedPartForHistory) {
          return { ...item, [field]: normalizedValue };
        }
        return item;
      }),
    );

    setPartHistory((prev) => {
      if (!prev) return prev;
      const historyKey = field === "priceA" ? "priceA" : "priceB";
      return {
        ...prev,
        [historyKey]:
          normalizedValue === "" ? null : Number(normalizedValue),
      };
    });
  };

  const handleSelectHistoryRow = (item: OrderItemForm) => {
    setSelectedHistoryRowId(item.id);
    if (!item.partId) {
      setSelectedPartForHistory(null);
      setPartHistory(null);
      setHistoryBasePrices({ priceA: null, priceB: null });
      return;
    }
    setSelectedPartForHistory(item.partId);
    // Row click should not overwrite purchase price in edit/create form.
    void fetchPartHistory(item.partId, item.id, false);
  };

  // Push the row's current Price A / Price B back to the underlying Part
  // record. Skips the call when nothing has changed since the part was
  // loaded (compared against `rowPriceBaselines[rowId]`).
  const handleSaveRowPrice = async (rowId: string) => {
    const item = formItems.find((it) => it.id === rowId);
    if (!item || !item.partId) return;
    const baseline = rowPriceBaselines[rowId] || {
      priceA: null,
      priceB: null,
    };
    const currentA =
      item.priceA === "" || item.priceA === null
        ? null
        : Number(item.priceA);
    const currentB =
      item.priceB === "" || item.priceB === null
        ? null
        : Number(item.priceB);
    const aChanged = (currentA ?? null) !== (baseline.priceA ?? null);
    const bChanged = (currentB ?? null) !== (baseline.priceB ?? null);
    if (!aChanged && !bChanged) return;

    setSavingRowPrice((prev) => ({ ...prev, [rowId]: true }));
    try {
      const payload: { priceA?: number; priceB?: number } = {};
      if (aChanged && currentA !== null) payload.priceA = currentA;
      if (bChanged && currentB !== null) payload.priceB = currentB;
      if (Object.keys(payload).length === 0) return;

      const response = (await apiClient.updatePartPrices(
        item.partId,
        payload,
      )) as any;
      if (response?.error) {
        toast.error(response.error);
        return;
      }
      setRowPriceBaselines((prev) => ({
        ...prev,
        [rowId]: { priceA: currentA, priceB: currentB },
      }));
      // Keep the History sidebar's mirror of these values in sync if it's
      // still pointed at this part.
      if (selectedPartForHistory && selectedPartForHistory === item.partId) {
        setHistoryBasePrices({ priceA: currentA, priceB: currentB });
        setPartHistory((prev) =>
          prev ? { ...prev, priceA: currentA, priceB: currentB } : prev,
        );
      }
      toast.success("Price updated");
    } catch (error: any) {
      toast.error(`Error updating prices: ${error?.message || error}`);
    } finally {
      setSavingRowPrice((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
  };

  const handleSaveHistoryPrices = async () => {
    if (!selectedPartForHistory || !partHistory) return;
    try {
      const payload: { priceA?: number; priceB?: number } = {};

      if (partHistory.priceA !== null && partHistory.priceA !== undefined) {
        payload.priceA = Number(partHistory.priceA);
      }
      if (partHistory.priceB !== null && partHistory.priceB !== undefined) {
        payload.priceB = Number(partHistory.priceB);
      }

      const response = await apiClient.updatePartPrices(
        selectedPartForHistory,
        payload,
      ) as any;
      if (response?.error) {
        toast.error(response.error);
        return;
      }

      setHistoryBasePrices({
        priceA: partHistory.priceA !== null ? Number(partHistory.priceA) : null,
        priceB: partHistory.priceB !== null ? Number(partHistory.priceB) : null,
      });
      toast.success("Price updated successfully");
    } catch (error: any) {
      toast.error(`Error updating prices: ${error.message}`);
    }
  };

  // Calculate total
  // Calculate items total
  const calculateItemsTotal = () => {
    return formItems.reduce((sum, item) => {
      const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;
      const qty = typeof item.quantity === "number" ? item.quantity : 0;
      return sum + price * qty;
    }, 0);
  };

  // Per-line distribution weight = quantity × per-unit weight (kg). Items
  // without a weight fall back to their quantity so they still get a share
  // proportional to how many pieces they contribute. If neither weight nor
  // quantity is available, the line gets a zero share (handled below).
  const itemDistributionShares = useMemo(() => {
    return formItems.map((item) => {
      const qty = typeof item.quantity === "number" ? item.quantity : 0;
      const unitWeight = typeof item.weight === "number" ? item.weight : 0;
      if (qty <= 0) return 0;
      return unitWeight > 0 ? qty * unitWeight : qty;
    });
  }, [formItems]);

  // Calculate total expenses
  const calculateTotalExpenses = () => {
    return formExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  };

  // Distribute total expenses across items proportionally to qty × weight
  // (or qty alone when weight is missing). Falls back to an equal split if
  // every line has zero quantity.
  const calculateDistributedExpenses = useMemo(() => {
    const totalExpenses = formExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    if (totalExpenses === 0 || formItems.length === 0) {
      return formItems.map(() => 0);
    }

    const totalShare = itemDistributionShares.reduce((sum, value) => sum + value, 0);

    if (totalShare <= 0) {
      const equalShare = totalExpenses / formItems.length;
      return formItems.map(() => equalShare);
    }

    return itemDistributionShares.map((share) => (share / totalShare) * totalExpenses);
  }, [formItems, formExpenses, itemDistributionShares]);

  const itemPartTotals = useMemo(() => {
    const totalExpenses = formExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    return formItems.reduce(
      (acc, item, index) => {
        const qty = typeof item.quantity === "number" ? item.quantity : 0;
        const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;
        const unitWeight = typeof item.weight === "number" ? item.weight : 0;
        const distributedExpense = calculateDistributedExpenses[index] || 0;
        const expensePerUnit = qty > 0 ? distributedExpense / qty : 0;
        const itemValue =
          totalExpenses > 0
            ? qty * (price + expensePerUnit)
            : qty * price;

        acc.totalQty += qty;
        acc.totalWeight += unitWeight * qty;
        acc.totalAmount += itemValue;
        return acc;
      },
      { totalQty: 0, totalWeight: 0, totalAmount: 0 },
    );
  }, [formItems, formExpenses, calculateDistributedExpenses]);

  // Grand total: items − discount (capped at items) + expenses
  const calculateDiscountAmount = (itemsSub: number) => {
    let discountValue = formDiscount === "" ? 0 : Number(formDiscount);
    if (!Number.isFinite(discountValue) || discountValue < 0) discountValue = 0;
    discountValue = Math.min(discountValue, itemsSub);
    return Math.round(discountValue * 100) / 100;
  };

  const calculateTotal = () => {
    const itemsSub = calculateItemsTotal();
    const disc = calculateDiscountAmount(itemsSub);
    return Math.round((itemsSub - disc + calculateTotalExpenses()) * 100) / 100;
  };

  // Add expense
  const handleAddExpense = () => {
    setFormExpenses((prev) => [
      ...prev,
      createDefaultDpoExpense(),
    ]);
  };

  // Remove expense
  const handleRemoveExpense = (id: string) => {
    setFormExpenses((prev) => prev.filter((expense) => expense.id !== id));
  };

  // Update expense
  const handleUpdateExpense = (id: string, field: keyof ExpenseForm, value: string | number) => {
    setFormExpenses((prev) =>
      prev.map((expense) =>
        expense.id === id ? { ...expense, [field]: value } : expense
      )
    );
  };

  // Save order
  const handleSave = async () => {
    if (isTransferIn) {
      if (!formBranch) {
        toast.error("Please select a branch");
        return;
      }
    } else if (!formSupplier) {
      toast.error("Please select a supplier");
      return;
    }
    if (formItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    const validItems = formItems.filter((item) => {
      const qty = typeof item.quantity === "number" ? item.quantity : 0;
      return item.partId && qty > 0;
    });
    if (validItems.length === 0) {
      toast.error("Please select at least one part with quantity");
      return;
    }

    // Validate expenses: description is required when amount > 0
    const invalidExpenses = formExpenses.filter((exp) => {
      const amount = Number(exp.amount) || 0;
      const hasDescription = !!exp.description && exp.description.trim() !== "";
      return amount > 0 && !hasDescription;
    });
    if (invalidExpenses.length > 0) {
      toast.error("Please enter expense description when amount is greater than zero");
      return;
    }

    try {
      setLoading(true);

      // Store current part ID for history refresh
      const currentPartId = selectedPartForHistory;

      const itemsSubtotal = validItems.reduce((sum, item) => {
        const qty = typeof item.quantity === "number" ? item.quantity : 0;
        const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;
        return sum + qty * price;
      }, 0);
      const discountVal = calculateDiscountAmount(itemsSubtotal);

      const dpoData = {
        dpo_number: viewMode === "edit" && selectedOrder ? selectedOrder.dpoNo : (formItems.length > 0 ? generateDpoNo() : undefined),
        date: format(formRequestDate, "yyyy-MM-dd"),
        invoice_no: formInvoiceNo || undefined,
        invoice_date: formInvoiceDate
          ? format(formInvoiceDate, "yyyy-MM-dd")
          : undefined,
        store_id: formStore || undefined,
        order_type: isTransferIn ? "transfer_in" : "local_purchase",
        branch_account_id: isTransferIn ? formBranch || undefined : undefined,
        supplier_id: isTransferIn ? undefined : formSupplier || undefined,
        account: isTransferIn ? undefined : formAccount || undefined,
        description: formDescription || undefined,
        status: "Order Receivable Pending",
        discount: discountVal,
        items: validItems.map((item) => {
          const qty = typeof item.quantity === "number" ? item.quantity : 0;
          const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;

          // Price A / Price B / Price M are persisted to the Part record by
          // the inline blur handler (`handleSaveRowPrice`), so they are
          // intentionally NOT included here to avoid a second write/snapshot
          // on the DPO line item every time the form is saved.
          return {
            part_id: item.partId,
            quantity: qty,
            purchase_price: price,
            amount: price * qty,
          };
        }),
        expenses: formExpenses.length > 0 ? formExpenses
          .filter((exp) => exp.expenseType && exp.payableAccount && exp.amount > 0)
          .map((exp) => ({
            expense_type: exp.expenseType,
            payable_account: exp.payableAccount,
            description: exp.description || undefined,
            amount: exp.amount,
          })) : undefined,
      };

      let response: any;
      if (viewMode === "edit" && selectedOrder) {
        response = await apiClient.updateDirectPurchaseOrder(selectedOrder.id, dpoData) as any;
      } else {
        response = await apiClient.createDirectPurchaseOrder(dpoData) as any;
      }

      if (response.error) {
        toast.error(response.error);
        return;
      }

      // Show simple success message
      // Vouchers (JV/PV) are only created when the store manager receives/approves the order
      const successMessage = viewMode === "edit"
        ? labels.updatedToast
        : labels.createdToast;
      toast.success(successMessage);

      // Refresh history if a part was selected
      if (currentPartId) {
        // Wait a bit for the database to update, then refresh history
        setTimeout(() => {
          fetchPartHistory(currentPartId);
        }, 500);
      }

      handleBackToList();
      fetchOrders();
    } catch (error: any) {
      toast.error(`Error saving order: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle payment - create Payment Voucher (PV)
  const handlePaymentClick = (order: DirectPurchaseOrder) => {
    setSelectedOrder(order);
    setPaymentAmount(order.grandTotal);
    setPaymentBankAccount("");
    setPaymentDate(new Date());
    setPaymentDescription(`Payment for DPO ${order.dpoNo}`);
    setShowPaymentDialog(true);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedOrder) {
      toast.error("No order selected");
      return;
    }

    if (!paymentBankAccount) {
      toast.error("Please select a Bank or Cash account");
      return;
    }

    const amount = typeof paymentAmount === "number" ? paymentAmount : parseFloat(String(paymentAmount)) || 0;
    if (amount <= 0) {
      toast.error("Payment amount must be greater than 0");
      return;
    }

    try {
      setLoading(true);

      // Use shared base URL so Dev-Koncepts hits /dev-koncepts/api, not main app /api
      const API_BASE_URL = getApiBaseUrl();

      const paymentPayload = {
        amount,
        cashBankAccountId: paymentBankAccount,
        paymentDate: format(paymentDate, "yyyy-MM-dd"),
        description: paymentDescription || undefined,
      };

      const response = await fetch(`${API_BASE_URL}/inventory/direct-purchase-orders/${selectedOrder.id}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(paymentPayload),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        const errorMsg = result.error || result.message || `HTTP ${response.status}: ${response.statusText}` || "Failed to create payment voucher";
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      const voucherData = result.data || result;
      const voucherNumber = voucherData?.voucherNumber || 'PV';
      toast.success(`Payment Voucher ${voucherNumber} created successfully!`);

      // Reset payment form
      setPaymentAmount("");
      setPaymentBankAccount("");
      setPaymentDate(new Date());
      setPaymentDescription("");
      setShowPaymentDialog(false);
      setLoading(false);

      // Refresh orders
      fetchOrders();

      // Refresh view if dialog is open
      if (showViewDialog && selectedOrder) {
        const updatedOrder = await apiClient.getDirectPurchaseOrder(selectedOrder.id) as any;
        if (!updatedOrder.error) {
          setSelectedOrder(mapDpoToViewOrder(updatedOrder));
        }
      }
    } catch (error: any) {
      toast.error(`Error processing payment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle print - change status to Completed and create stock
  const handlePrint = async (order: DirectPurchaseOrder) => {
    if (order.status === "Completed") {
      toast.info("Order is already completed");
      return;
    }

    try {
      setLoading(true);
      // Update status to Completed
      const detail = (await apiClient.getDirectPurchaseOrder(order.id)) as any;
      const dpo = detail?.data || detail;

      const response = await apiClient.updateDirectPurchaseOrder(order.id, {
        status: "Completed",
        order_type: dpo?.order_type || dpo?.orderType,
        branch_account_id: dpo?.branch_account_id || dpo?.branchAccountId,
      }) as any;

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success("Order marked as Completed. Stock has been added.");
      fetchOrders();

      // Close view dialog if open and refresh selected order
      if (showViewDialog && selectedOrder) {
        const updatedOrder = await apiClient.getDirectPurchaseOrder(order.id) as any;
        if (!updatedOrder.error) {
          setSelectedOrder(mapDpoToViewOrder(updatedOrder));
        }
      }
    } catch (error: any) {
      toast.error(`Error updating order: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle return click
  const handleReturnClick = async (order: DirectPurchaseOrder) => {
    try {
      setLoading(true);
      const response = await apiClient.getDirectPurchaseOrder(order.id) as any;
      if (response.error) {
        toast.error(response.error);
        return;
      }

      const dpo = response;
      setReturnDpoData(dpo);
      setReturnDate(new Date());
      setReturnReason("");
      setReturnAccount(dpo.account_id || "");
      setReturnDeduction(0);

      // Fetch existing returns to calculate available qty
      const returnsRes = await apiClient.getDpoReturns({ dpo_id: order.id, status: "approved" }) as any;
      const approvedReturns = returnsRes.data || [];
      const completedRes = await apiClient.getDpoReturns({ dpo_id: order.id, status: "completed" }) as any;
      const completedReturns = completedRes.data || [];
      const allReturns = [...approvedReturns, ...completedReturns];

      const returnedQtys: Record<string, number> = {};
      allReturns.forEach((ret: any) => {
        (ret.DirectPurchaseOrderReturnItem || []).forEach((item: any) => {
          returnedQtys[item.partId] = (returnedQtys[item.partId] || 0) + item.returnQuantity;
        });
      });

      setReturnItems((dpo.items || []).map((item: any) => {
        const alreadyReturned = returnedQtys[item.part_id] || 0;
        return {
          partId: item.part_id,
          partNo: item.part_no,
          description: item.part_description || "",
          brand: item.brand || "",
          purchasedQty: item.quantity,
          alreadyReturned,
          availableToReturn: item.quantity - alreadyReturned,
          purchasePrice: item.purchase_price,
          returnQty: 0,
          total: 0,
          remarks: "",
        };
      }));

      setShowReturnDialog(true);
    } catch (error: any) {
      toast.error(`Error fetching DPO details: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnSubmit = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQty > 0);
    if (itemsToReturn.length === 0) {
      toast.error("Please enter return quantity for at least one item");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        dpo_id: returnDpoData.id,
        return_date: returnDate.toISOString(),
        reason: returnReason,
        account_id: returnAccount,
        deduction: returnDeduction,
        items: itemsToReturn.map(item => ({
          part_id: item.partId,
          return_quantity: item.returnQty,
        })),
      };

      const response = await apiClient.createDpoReturn(payload) as any;
      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success("DPO Return and Voucher created successfully");
      setShowReturnDialog(false);
      navigate("/inventory/dpo-return");
    } catch (error: any) {
      toast.error(`Error creating return: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateReturnQty = (partId: string, qty: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.partId === partId) {
        const finalQty = Math.min(Math.max(0, qty), item.availableToReturn);
        return {
          ...item,
          returnQty: finalQty,
          total: finalQty * item.purchasePrice,
        };
      }
      return item;
    }));
  };

  const totalReturnAmount = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + item.total, 0);
  }, [returnItems]);

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Completed":
      case "Received":
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">{status}</Badge>;
      case "Order Receivable Pending":
        return <Badge className="bg-primary/10 text-primary hover:bg-primary/20">{status}</Badge>;
      case "Draft":
        return <Badge variant="secondary">{status}</Badge>;
      case "Cancelled":
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Render list view
  const renderListView = () => (
    <div className="space-y-4">

      {/* Orders Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">
            {labels.allOrdersTitle} ({filteredOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-xs w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Order Receivable Pending">Order Receivable Pending</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Received">Received</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading...
            </div>
          ) : paginatedOrders.length > 0 ? (
            <div className="rounded-md border overflow-x-auto -mx-1 sm:mx-0">
              <div className="min-w-[800px] sm:min-w-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <ListNumberHeader />
                      <TableHead className="min-w-[120px]">{labels.orderNumberLabel}</TableHead>
                      <TableHead className="min-w-[120px]">Invoice No.</TableHead>
                      <TableHead className="min-w-[110px]">Invoice Date</TableHead>
                      <TableHead className="min-w-[140px]">{labels.partyColumnLabel}</TableHead>
                      <TableHead className="min-w-[110px]">Request Date</TableHead>
                      <TableHead className="min-w-[150px]">Remarks</TableHead>
                      <TableHead className="text-right min-w-[120px]">Grand Total</TableHead>
                      <TableHead className="min-w-[140px]">Status</TableHead>
                      <TableHead className="text-center min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order, index) => (
                      <TableRow key={order.id}>
                        <ListNumberCell
                          index={index}
                          page={currentPage}
                          pageSize={itemsPerPage}
                        />
                        <TableCell className="font-medium">{order.dpoNo}</TableCell>
                        <TableCell>{order.invoiceNo || "-"}</TableCell>
                        <TableCell>{order.invoiceDate || "-"}</TableCell>
                        <TableCell>{order.supplier || "-"}</TableCell>
                        <TableCell>{order.requestDate}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{order.description || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {order.grandTotal.toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <ActionButtonTooltip label="View" variant="view">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleView(order)}
                                className="h-8 w-8"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </ActionButtonTooltip>
                            {(order.status === "Completed" || order.status === "Received") && (
                              <ActionButtonTooltip label="Return" variant="edit">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleReturnClick(order)}
                                  className="h-8 w-8 text-primary hover:text-primary"
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </ActionButtonTooltip>
                            )}
                            {order.status !== "Completed" && order.status !== "Received" && (
                              <ActionButtonTooltip label="Edit" variant="edit">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(order)}
                                  className="h-8 w-8"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </ActionButtonTooltip>
                            )}
                            {order.status !== "Completed" && order.status !== "Received" && (
                              <ActionButtonTooltip label="Delete" variant="delete">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteClick(order)}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </ActionButtonTooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No local purchase orders found. Create one to get started.
            </div>
          )}

          {/* Pagination */}
          {totalRecords > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} entries
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows per page:</span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DPO_LIST_PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // Render history sidebar
  const renderHistorySidebar = () => {
    const selectedPart = selectedPartForHistory ? parts.find((p) => p.id === selectedPartForHistory) : null;
    const hasHistoryPriceChanges =
      !!partHistory &&
      ((partHistory.priceA ?? null) !== (historyBasePrices.priceA ?? null) ||
        (partHistory.priceB ?? null) !== (historyBasePrices.priceB ?? null));

    return (
      <Card className="w-full lg:w-80 h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Purchase History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedPart ? (
            <div className="pb-3 border-b">
              <p className="text-sm font-medium text-foreground">{selectedPart.partNo}</p>
              <p className="text-xs text-muted-foreground">{selectedPart.description}</p>
            </div>
          ) : (
            <div className="pb-3 border-b">
              <p className="text-sm text-muted-foreground">Select a part to view history</p>
            </div>
          )}

          {loadingHistory ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
          ) : !selectedPartForHistory || !partHistory ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>No part selected</p>
              <p className="text-xs mt-1">Select a part from the items table to view purchase history</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Last Direct Purchase Cost Price (including expenses) */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cost Price</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {partHistory.lastPurchasePrice !== null
                      ? partHistory.lastPurchasePrice.toLocaleString("en-PK", { style: "currency", currency: "PKR" })
                      : "N/A"}
                  </p>
                  {partHistory.lastPurchaseDpoNo && (
                    <p className="text-xs text-muted-foreground">{partHistory.lastPurchaseDpoNo}</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground italic">Includes distributed expenses</p>
                {partHistory.lastPurchaseDate && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(partHistory.lastPurchaseDate).toLocaleDateString('en-GB')}
                  </p>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                {/* Price A */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price A</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={partHistory.priceA ?? ""}
                    onChange={(e) =>
                      handleUpdatePriceFromHistory("priceA", e.target.value)
                    }
                    placeholder="Enter Price A"
                    className="h-8"
                  />
                </div>

                {/* Price B */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price B</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={partHistory.priceB ?? ""}
                    onChange={(e) =>
                      handleUpdatePriceFromHistory("priceB", e.target.value)
                    }
                    placeholder="Enter Price B"
                    className="h-8"
                  />
                </div>

                {/* Price M */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price M</Label>
                  <p className="text-sm font-medium">
                    {(partHistory.priceM !== null && partHistory.priceM !== undefined && !isNaN(Number(partHistory.priceM)))
                      ? Number(partHistory.priceM).toLocaleString("en-PK", { style: "currency", currency: "PKR" })
                      : "N/A"}
                  </p>
                </div>
              </div>

              {/* Update Price Button */}
              {selectedPart && (
                <div className="border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleSaveHistoryPrices}
                    disabled={!hasHistoryPriceChanges}
                  >
                    <Edit className="w-4 h-4" />
                    Update Price
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Render create/edit view
  const renderCreateEditView = () => (
    <div className="flex flex-col gap-4">
      <div className="flex-1 space-y-4 min-w-0">

        {/* Form Card */}
        <Card>
          <CardContent className="pt-6">
            {/* Header Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
              {!isTransferIn && (
                <div className="space-y-2">
                  <Label>PO NO</Label>
                  <Input
                    value={viewMode === "edit" && selectedOrder ? selectedOrder.dpoNo : generateDpoNo()}
                    disabled
                    className="bg-muted"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Request Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formRequestDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {formRequestDate ? format(formRequestDate, "MM/dd/yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={formRequestDate}
                      onSelect={(date) => date && setFormRequestDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Invoice No</Label>
                <Input
                  value={formInvoiceNo}
                  onChange={(e) => setFormInvoiceNo(e.target.value)}
                  placeholder="Enter invoice no..."
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formInvoiceDate && "text-muted-foreground",
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {formInvoiceDate
                        ? format(formInvoiceDate, "MM/dd/yyyy")
                        : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={formInvoiceDate}
                      onSelect={(date) => setFormInvoiceDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>{labels.partyFieldLabel}</Label>
                {isTransferIn ? (
                  <SearchableSelect
                    options={branchAccounts}
                    value={formBranch}
                    onValueChange={setFormBranch}
                    placeholder="Select branch..."
                  />
                ) : (
                  <SearchableSelect
                    options={suppliers}
                    value={formSupplier}
                    onValueChange={setFormSupplier}
                    placeholder="Select supplier..."
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Enter remarks..."
                />
              </div>
            </div>

            {/* Item Parts Section */}
            <Card className="mb-6">
              <CardHeader className="py-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="text-base font-medium">Item Parts</CardTitle>
                  <Button onClick={handleAddItem} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add New Item (Alt + Z)</span>
                    <span className="sm:hidden">Add Item (Alt + Z)</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {formItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No items added yet</p>
                    <p className="text-sm">Click "Add New Item" to add items</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-md border overflow-x-auto -mx-1 sm:mx-0">
                      <div className="min-w-[800px] sm:min-w-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <ListNumberHeader />
                              <TableHead className="min-w-[200px]">Part</TableHead>
                              <TableHead className="min-w-[80px]">Brand</TableHead>
                              <TableHead className="min-w-[60px]">UoM</TableHead>
                              <TableHead className="w-20 sm:w-24">Qty</TableHead>
                              <TableHead className="w-28 sm:w-32">Purchase Price</TableHead>
                              <TableHead className="w-24 sm:w-28">Price A</TableHead>
                              <TableHead className="w-24 sm:w-28">Price B</TableHead>
                              <TableHead className="w-20 text-right">Weight</TableHead>
                              <TableHead className="w-24 text-right">Total Weight</TableHead>
                              <TableHead className="text-right min-w-[100px]">Total Amount</TableHead>
                              <TableHead className="text-right min-w-[100px]">EXP / unit</TableHead>
                              <TableHead className="w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {formItems.map((item, index) => {
                              const selectedPart = parts.find((p) => p.id === item.partId);
                              return (
                                <TableRow
                                  key={item.id}
                                  onClick={() => handleSelectHistoryRow(item)}
                                  className={cn(
                                    "cursor-pointer",
                                    selectedHistoryRowId === item.id && "bg-muted/40",
                                  )}
                                >
                                  <ListNumberCell index={index} />
                                  <TableCell>
                                    <SearchableSelect
                                      options={parts.map(p => ({
                                        value: p.id,
                                        label: [p.partNo, p.masterPartNo && p.masterPartNo !== p.partNo ? p.masterPartNo : null]
                                          .filter(Boolean)
                                          .join(" / "),
                                        description: [
                                          p.description || null,
                                          p.brand ? `Brand: ${p.brand}` : null,
                                          p.masterPartNo && p.masterPartNo !== p.partNo
                                            ? `Master: ${p.masterPartNo}`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" | "),
                                      }))}
                                      value={item.partId}
                                      onValueChange={(value) => handleUpdateItem(item.id, "partId", value)}
                                      placeholder="Select part..."
                                    />
                                  </TableCell>
                                  <TableCell>{selectedPart?.brand || "-"}</TableCell>
                                  <TableCell>{selectedPart?.uom || "-"}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={item.quantity === "" ? "" : item.quantity}
                                      onChange={(e) => handleUpdateItem(item.id, "quantity", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
                                      placeholder=""
                                      className="w-full min-w-[60px]"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.purchasePrice === "" ? "" : item.purchasePrice}
                                      onChange={(e) => handleUpdateItem(item.id, "purchasePrice", e.target.value === "" ? "" : parseFloat(e.target.value) || "")}
                                      placeholder=""
                                      className="w-full min-w-[100px]"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.priceA === "" ? "" : item.priceA}
                                      onChange={(e) =>
                                        handleUpdateItem(
                                          item.id,
                                          "priceA",
                                          e.target.value === ""
                                            ? ""
                                            : parseFloat(e.target.value) || "",
                                        )
                                      }
                                      onBlur={() => handleSaveRowPrice(item.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="A"
                                      disabled={!item.partId || !!savingRowPrice[item.id]}
                                      className="w-full min-w-[80px]"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.priceB === "" ? "" : item.priceB}
                                      onChange={(e) =>
                                        handleUpdateItem(
                                          item.id,
                                          "priceB",
                                          e.target.value === ""
                                            ? ""
                                            : parseFloat(e.target.value) || "",
                                        )
                                      }
                                      onBlur={() => handleSaveRowPrice(item.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="B"
                                      disabled={!item.partId || !!savingRowPrice[item.id]}
                                      className="w-full min-w-[80px]"
                                    />
                                  </TableCell>

                                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                    {item.weight > 0
                                      ? item.weight.toLocaleString("en-PK", {
                                          minimumFractionDigits: 0,
                                          maximumFractionDigits: 4,
                                        })
                                      : "-"}
                                  </TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                    {(() => {
                                      const qty =
                                        typeof item.quantity === "number"
                                          ? item.quantity
                                          : 0;
                                      const unitWeight =
                                        typeof item.weight === "number"
                                          ? item.weight
                                          : 0;
                                      const lineTotalWeight = qty * unitWeight;
                                      return lineTotalWeight > 0
                                        ? lineTotalWeight.toLocaleString(
                                            "en-PK",
                                            {
                                              minimumFractionDigits: 0,
                                              maximumFractionDigits: 4,
                                            },
                                          )
                                        : "-";
                                    })()}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {(() => {
                                      const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;
                                      const qty = typeof item.quantity === "number" ? item.quantity : 0;
                                    const distributedExpense = calculateDistributedExpenses[index] || 0;
                                    const expensePerUnit = qty > 0 ? distributedExpense / qty : 0;
                                    const totalExpenses = calculateTotalExpenses();
                                    const itemValue =
                                      totalExpenses > 0
                                        ? qty * (price + expensePerUnit)
                                        : qty * price;
                                    return itemValue.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    })()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {(() => {
                                      const qty = typeof item.quantity === "number" ? item.quantity : 0;
                                      const distributedExpense = calculateDistributedExpenses[index] || 0;
                                      const perPartExpense = qty > 0 ? distributedExpense / qty : 0;

                                      return (
                                        <span className="text-sm font-medium tabular-nums">
                                          {perPartExpense.toLocaleString("en-PK", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                      );
                                    })()}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveItem(item.id)}
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                          <TableFooter className="bg-muted/30">
                            <TableRow className="hover:bg-transparent">
                              {/* # */}
                              <TableCell className="font-semibold text-xs uppercase text-muted-foreground">
                                Totals
                              </TableCell>
                              {/* Part */}
                              <TableCell />
                              {/* Brand */}
                              <TableCell />
                              {/* UoM */}
                              <TableCell />
                              {/* Qty */}
                              <TableCell className="font-semibold tabular-nums">
                                {itemPartTotals.totalQty.toLocaleString("en-PK")}
                              </TableCell>
                              {/* Purchase Price */}
                              <TableCell />
                              {/* Price A */}
                              <TableCell />
                              {/* Price B */}
                              <TableCell />
                              {/* Weight */}
                              <TableCell />
                              {/* Total Weight */}
                              <TableCell className="text-right font-semibold tabular-nums text-xs">
                                {itemPartTotals.totalWeight.toLocaleString(
                                  "en-PK",
                                  {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 4,
                                  },
                                )}
                              </TableCell>
                              {/* Total Amount */}
                              <TableCell className="text-right font-semibold tabular-nums">
                                {itemPartTotals.totalAmount.toLocaleString(
                                  "en-PK",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </TableCell>
                              {/* EXP / unit */}
                              <TableCell />
                              {/* Action */}
                              <TableCell />
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {SHOW_EXPENSES_UI && (
              <>
                {/* Expense Section */}
                <Card className="mb-6">
                  <CardHeader className="py-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <CardTitle className="text-base font-medium">Expenses</CardTitle>
                      <Button
                        type="button"
                        onClick={handleAddExpense}
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Expense
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {formExpenses.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-sm">No expenses added yet</p>
                        <Button
                          type="button"
                          onClick={handleAddExpense}
                          variant="outline"
                          size="sm"
                          className="mt-2"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Expense
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="hidden sm:grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground pb-2 border-b">
                          <div className="col-span-12 sm:col-span-4">Expense Account</div>
                          <div className="col-span-12 sm:col-span-5">Description</div>
                          <div className="col-span-12 sm:col-span-3 text-right">Amount</div>
                        </div>
                        {formExpenses.map((expense) => (
                          <div
                            key={expense.id}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-2 items-start sm:items-center p-2 sm:p-0 border sm:border-0 rounded-lg sm:rounded-none"
                          >
                            <div className="col-span-12 sm:col-span-4">
                              <Label className="text-xs text-muted-foreground sm:hidden mb-1 block">
                                Expense Account
                              </Label>
                              <Input value={DPO_FIXED_EXPENSE_ACCOUNT} disabled className="bg-muted" />
                            </div>
                            <div className="col-span-12 sm:col-span-5">
                              <Label className="text-xs text-muted-foreground sm:hidden mb-1 block">
                                Description
                              </Label>
                              <Input
                                value={expense.description}
                                onChange={(e) => handleUpdateExpense(expense.id, "description", e.target.value)}
                                placeholder="Enter description..."
                                className={cn(
                                  (Number(expense.amount) || 0) > 0 &&
                                    (!expense.description || expense.description.trim() === "") &&
                                    "border-primary"
                                )}
                              />
                            </div>
                            <div className="col-span-12 sm:col-span-3">
                              <Label className="text-xs text-muted-foreground sm:hidden mb-1 block">Amount</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={expense.amount || ""}
                                onChange={(e) => {
                                  const value = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
                                  handleUpdateExpense(expense.id, "amount", value);
                                }}
                                className={cn("text-right", expense.amount <= 0 && "border-primary")}
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-2 border-t mt-2">
                          <div className="text-sm font-medium">
                            Total Expenses:{" "}
                            <span className="text-primary">{calculateTotalExpenses().toLocaleString("en-PK")}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Account and Totals (single horizontal row) */}
            <div className="flex flex-col gap-4 mb-6">
              {!isTransferIn && (
                <div className="space-y-2 w-full sm:w-64">
                  <Label>Account</Label>
                  <SearchableSelect
                    options={accounts}
                    value={formAccount}
                    onValueChange={setFormAccount}
                    placeholder="Select account..."
                    className="w-full"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3 justify-end">
                {/* Items Total */}
                <div className="space-y-1 w-32">
                  <Label className="text-xs">Items Total</Label>
                  <Input
                    value={calculateItemsTotal().toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    disabled
                    className="w-full text-right bg-muted"
                  />
                </div>

                {/* Discount (on items): Percentage + Amount inline */}
                <div className="space-y-1">
                  <Label className="text-xs">Discount (on items)</Label>
                  <div className="flex items-stretch gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-20 text-right"
                      placeholder="0%"
                      title="Percentage"
                      value={(() => {
                        const itemsSub = calculateItemsTotal();
                        const disc = calculateDiscountAmount(itemsSub);
                        if (disc === 0 || itemsSub <= 0) return "";
                        return (
                          Math.round((disc / itemsSub) * 100 * 100) / 100
                        );
                      })()}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setFormDiscount("");
                          return;
                        }
                        const p = parseFloat(v);
                        if (!Number.isFinite(p)) {
                          setFormDiscount("");
                          return;
                        }
                        const pct = Math.min(Math.max(p, 0), 100);
                        const itemsSub = calculateItemsTotal();
                        const amount = (itemsSub * pct) / 100;
                        setFormDiscount(
                          amount === 0
                            ? ""
                            : Math.round(amount * 100) / 100,
                        );
                      }}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-28 text-right"
                      placeholder="0"
                      title="Amount"
                      value={formDiscount === "" ? "" : formDiscount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setFormDiscount("");
                          return;
                        }
                        const n = parseFloat(v);
                        setFormDiscount(Number.isFinite(n) ? n : "");
                      }}
                      onBlur={() => {
                        let d =
                          formDiscount === "" ? 0 : Number(formDiscount);
                        if (!Number.isFinite(d) || d < 0) d = 0;
                        d = Math.min(d, calculateItemsTotal());
                        setFormDiscount(
                          d === 0 ? "" : Math.round(d * 100) / 100,
                        );
                      }}
                    />
                  </div>
                </div>

                {/* Total After Discount */}
                <div className="space-y-1 w-36">
                  <Label className="text-xs">Total After Discount</Label>
                  <Input
                    value={(() => {
                      const itemsSub = calculateItemsTotal();
                      const disc = calculateDiscountAmount(itemsSub);
                      return (itemsSub - disc).toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });
                    })()}
                    disabled
                    className="w-full text-right bg-muted"
                  />
                </div>

                {/* Expense Amount */}
                {SHOW_EXPENSES_UI && (
                  <div className="space-y-1 w-32">
                    <Label className="text-xs">Expense Amount</Label>
                    <Input
                      value={calculateTotalExpenses().toLocaleString(
                        "en-PK",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                      disabled
                      className="w-full text-right bg-muted"
                    />
                  </div>
                )}

                {/* Grand Total */}
                <div className="space-y-1 w-36">
                  <Label className="text-xs">Grand Total</Label>
                  <Input
                    value={calculateTotal().toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    disabled
                    className="w-full text-right bg-muted font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t">
              <Button variant="destructive" onClick={resetForm} className="w-full sm:w-auto">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-white flex-1 sm:flex-initial">
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="link" onClick={handleBackToList} className="text-muted-foreground">
                  Close
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );

  // Render view dialog
  const renderViewDialog = () => (
    <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
      <DialogContent className="max-w-5xl h-[min(90vh,820px)] max-h-[90vh] overflow-hidden !flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b bg-muted/30 shrink-0">
          <DialogTitle>{labels.viewDialogTitle}</DialogTitle>
          <DialogDescription>
            {selectedOrder?.dpoNo} - {selectedOrder?.requestDate}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {selectedOrder && (
            <>
              {/* Fixed Top Info */}
              <div className="p-6 pb-2 shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <Label className="text-muted-foreground">{labels.orderNumberLabel}</Label>
                    <p className="font-medium">{selectedOrder.dpoNo}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Store</Label>
                    <p className="font-medium">{selectedOrder.store}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{labels.partyFieldLabel}</Label>
                    <p className="font-medium">{selectedOrder.supplier || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Request Date</Label>
                    <p className="font-medium">{selectedOrder.requestDate}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div>{getStatusBadge(selectedOrder.status)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Remarks</Label>
                    <p className="font-medium">{selectedOrder.description || "-"}</p>
                  </div>
                  {!isTransferIn && (
                    <div>
                      <Label className="text-muted-foreground">Account</Label>
                      <p className="font-medium">{selectedOrder.account}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Scrollable items — fills space between header meta and totals */}
              <div className="flex-1 min-h-0 px-6 py-2">
                <div className="h-full min-h-[140px] overflow-y-auto overscroll-contain border rounded-md bg-card">
                  <table className="w-full caption-bottom text-sm">
                    <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                      <TableRow>
                        <ListNumberHeader />
                        <TableHead className="min-w-[120px]">Part No</TableHead>
                        <TableHead className="min-w-[150px]">Description</TableHead>
                        <TableHead className="min-w-[80px]">Brand</TableHead>
                        <TableHead className="min-w-[60px]">UoM</TableHead>
                        <TableHead className="min-w-[60px]">Qty</TableHead>
                        <TableHead className="min-w-[120px]">Purchase Price</TableHead>
                        <TableHead className="text-right min-w-[100px]">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item, index) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <ListNumberCell index={index} />
                          <TableCell className="font-medium">
                            {item.partNo}
                            {item.returnedQuantity > 0 && (
                              <Badge variant="destructive" className="ml-2 text-[10px] h-5 px-1.5">
                                Returned {item.returnedQuantity === item.quantity ? "(All)" : `(${item.returnedQuantity})`}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.brand}</TableCell>
                          <TableCell>{item.uom}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.purchasePrice.toLocaleString("en-PK")}</TableCell>
                          <TableCell className="text-right font-medium">
                            {item.amount.toLocaleString("en-PK")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              </div>

              {/* Totals: items subtotal, discount, grand total */}
              <div className="px-6 py-4 bg-muted/10 border-t shrink-0 relative z-10">
                <div className="flex justify-end">
                  <div className="text-right space-y-1 min-w-[280px]">
                    <div className="flex justify-between gap-8 text-sm">
                      <span className="text-muted-foreground">Items subtotal</span>
                      <span className="font-medium tabular-nums">
                        {selectedOrder.items
                          .reduce((s, i) => s + (Number(i.amount) || 0), 0)
                          .toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                      </span>
                    </div>
                    {(selectedOrder.discount ?? 0) > 0 && (
                      <div className="flex justify-between gap-8 text-sm">
                        <span className="text-muted-foreground">Discount (on items)</span>
                        <span className="font-medium tabular-nums text-destructive">
                          -
                          {(selectedOrder.discount ?? 0).toLocaleString("en-PK", {
                            style: "currency",
                            currency: "PKR",
                          })}
                        </span>
                      </div>
                    )}
                    {(selectedOrder.totalExpenses ?? 0) > 0 && (
                      <div className="flex justify-between gap-8 text-sm">
                        <span className="text-muted-foreground">Expense amount</span>
                        <span className="font-medium tabular-nums">
                          {(selectedOrder.totalExpenses ?? 0).toLocaleString("en-PK", {
                            style: "currency",
                            currency: "PKR",
                          })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-8 pt-2 mt-2 border-t border-border/60">
                      <span className="text-sm uppercase font-semibold text-muted-foreground">
                        Grand total
                      </span>
                      <span className="text-xl sm:text-2xl font-bold text-primary tabular-nums">
                        {selectedOrder.grandTotal.toLocaleString("en-PK", {
                          style: "currency",
                          currency: "PKR",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background p-4">
          <div className="flex gap-2">
            {selectedOrder && (selectedOrder.status === "Order Receivable Pending" || selectedOrder.status === "Completed") && (
              <>
                {!isTransferIn && (
                  <Button
                    onClick={() => handlePaymentClick(selectedOrder)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Pay Supplier
                  </Button>
                )}
                {selectedOrder.status === "Order Receivable Pending" && (
                  <Button onClick={() => handlePrint(selectedOrder)} className="bg-primary hover:bg-primary/90">
                    <Printer className="w-4 h-4 mr-2" />
                    Print & Complete
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Render return dialog
  const renderReturnDialog = () => (
    <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
      <DialogContent className="max-w-6xl max-h-[95vh] h-[850px] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-primary" />
            <DialogTitle className="text-xl font-bold">Simple Purchase Return Order</DialogTitle>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6 pb-20">
            {/* Header Info */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg bg-card shadow-sm">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase font-semibold">PO NO</Label>
                <Input value={returnDpoData?.dpo_no || ""} disabled className="bg-muted/50 border-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase font-semibold">Store</Label>
                <Input value={returnDpoData?.store_name || ""} disabled className="bg-muted/50 border-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase font-semibold">Return Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-between text-left font-normal border-primary/20 hover:border-primary/50",
                        !returnDate && "text-muted-foreground"
                      )}
                    >
                      {returnDate ? format(returnDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                      <Calendar className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={returnDate}
                      onSelect={(date) => date && setReturnDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase font-semibold">Description</Label>
                <Input
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Reason for return..."
                  className="border-primary/20 focus-visible:ring-primary"
                />
              </div>
            </div>

            {/* Items Table */}
            <div className="border rounded-lg overflow-hidden shadow-premium bg-card">
              <Table>
                <TableHeader className="bg-muted/50 border-b">
                  <TableRow>
                    <TableHead className="w-[30%]">Items</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-center w-[150px]">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="min-w-[150px]">Remarks</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnItems.map((item) => (
                    <TableRow key={item.partId} className="group hover:bg-muted/20 transition-colors">
                      <TableCell>
                        <div className="font-medium text-foreground">{item.partNo} / {item.brand}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">{item.description}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {item.purchasePrice.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            type="number"
                            value={item.returnQty || ""}
                            onChange={(e) => updateReturnQty(item.partId, parseFloat(e.target.value) || 0)}
                            className="h-8 text-center font-semibold border-primary/30"
                            placeholder="0"
                          />
                          <div className="text-[10px] text-center space-y-0.5 font-medium">
                            <div className="text-muted-foreground">Purchased Qty: {item.purchasedQty}</div>
                            <div className="text-primary">Returned Qty: {item.alreadyReturned}</div>
                            <div className="text-emerald-600">Remaining Qty: {item.availableToReturn}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        {item.total.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.remarks}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReturnItems(prev => prev.map(i => i.partId === item.partId ? { ...i, remarks: val } : i));
                          }}
                          placeholder="Remarks..."
                          className="h-8 text-xs border-muted focus-visible:ring-primary"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setReturnItems(prev => prev.filter(i => i.partId !== item.partId))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 border rounded-lg bg-muted/20 shadow-inner">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">Total</Label>
                <div className="h-10 flex items-center px-3 font-bold text-lg bg-background border rounded font-mono">
                  {totalReturnAmount.toLocaleString()}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">Deduction</Label>
                <Input
                  type="number"
                  value={returnDeduction || ""}
                  onChange={(e) => setReturnDeduction(parseFloat(e.target.value) || 0)}
                  className="h-10 font-bold text-red-500"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">Total after Deduction</Label>
                <div className="h-10 flex items-center px-3 font-bold text-lg text-emerald-600 bg-emerald-50 border-emerald-200 border rounded font-mono">
                  {(totalReturnAmount - returnDeduction).toLocaleString()}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">Account</Label>
                <SearchableSelect
                  options={bankCashAccounts}
                  value={returnAccount}
                  onValueChange={setReturnAccount}
                  placeholder="Select account..."
                  className="h-10"
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/30 shrink-0 flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
              onClick={() => {
                setReturnItems(prev => prev.map(i => ({ ...i, returnQty: 0, total: 0 })));
                setReturnDeduction(0);
              }}
            >
              Reset
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowReturnDialog(false)}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-premium"
            onClick={handleReturnSubmit}
            disabled={loading || totalReturnAmount === 0}
          >
            <Undo2 className="w-4 h-4 mr-2" />
            {loading ? "Processing..." : "Return"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const showForm =
    pageView === "form" && (viewMode === "create" || viewMode === "edit");
  const showList = pageView === "list";

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Tabs value={pageView} onValueChange={handlePageViewChange}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="form">{labels.formTabLabel}</TabsTrigger>
            <TabsTrigger value="list">{labels.listTabLabel}</TabsTrigger>
          </TabsList>
        </Tabs>
        {showBackToInquiry && showForm && (
          <Button variant="outline" size="sm" onClick={() => navigate("/sales/inquiry")}>
            Back to Inquiry
          </Button>
        )}
      </div>

      {showList && renderListView()}
      {showForm && renderCreateEditView()}
      {renderViewDialog()}
      {renderReturnDialog()}

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay Supplier</DialogTitle>
            <DialogDescription>
              Create Payment Voucher (PV) for {selectedOrder?.dpoNo}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-muted/30 p-3 rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">{labels.orderNumberLabel}:</span> {selectedOrder.dpoNo}</p>
                <p>
                  <span className="text-muted-foreground">Items subtotal:</span>{" "}
                  <span className="font-medium tabular-nums">
                    {selectedOrder.items
                      .reduce((s, i) => s + (Number(i.amount) || 0), 0)
                      .toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                  </span>
                </p>
                {(selectedOrder.discount ?? 0) > 0 && (
                  <p>
                    <span className="text-muted-foreground">Discount (on items):</span>{" "}
                    <span className="font-medium tabular-nums text-destructive">
                      -
                      {(selectedOrder.discount ?? 0).toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                    </span>
                  </p>
                )}
                {(selectedOrder.totalExpenses ?? 0) > 0 && (
                  <p>
                    <span className="text-muted-foreground">Expense amount:</span>{" "}
                    <span className="font-medium tabular-nums">
                      {(selectedOrder.totalExpenses ?? 0).toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                    </span>
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Grand total:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {selectedOrder.grandTotal.toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment Amount *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value === "" ? "" : parseFloat(e.target.value) || "")}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Bank/Cash Account *</Label>
                <SearchableSelect
                  options={bankCashAccounts}
                  value={paymentBankAccount}
                  onValueChange={setPaymentBankAccount}
                  placeholder="Select bank or cash account..."
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !paymentDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {paymentDate ? format(paymentDate, "MM/dd/yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={paymentDate}
                      onSelect={(date) => date && setPaymentDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input
                  value={paymentDescription}
                  onChange={(e) => setPaymentDescription(e.target.value)}
                  placeholder="Payment description..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePaymentSubmit}
              disabled={loading || !paymentBankAccount || !paymentAmount || (typeof paymentAmount === "number" ? paymentAmount <= 0 : parseFloat(String(paymentAmount)) <= 0)}
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Creating PV..." : "Create Payment Voucher (PV)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this local purchase order? This action cannot be undone.
              <br /><br />
              <strong className="text-yellow-600">⚠️ Warning:</strong> Stock movements associated with this DPO will NOT be automatically deleted. You will need to manually verify and adjust stock entries in the Stock In/Out page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
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
