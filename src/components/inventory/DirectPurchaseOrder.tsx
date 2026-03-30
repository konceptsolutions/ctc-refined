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
  ArrowLeft,
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  store: string;
  requestDate: string;
  date: string; // Raw date for sorting
  description: string;
  grandTotal: number;
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

export const DirectPurchaseOrder = () => {
  const navigate = useNavigate();

  // Orders state
  const [orders, setOrders] = useState<DirectPurchaseOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
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
  const [bankCashAccounts, setBankCashAccounts] = useState<{ id: string; value: string; label: string }[]>([]);

  // Form state
  const [formStore, setFormStore] = useState("");
  const [formSupplier, setFormSupplier] = useState("");
  const [formRequestDate, setFormRequestDate] = useState<Date>(new Date());
  const [formDescription, setFormDescription] = useState("");
  const [formAccount, setFormAccount] = useState("");
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
  const [accounts, setAccounts] = useState<{ id: string; value: string; label: string }[]>([]);
  const [payableAccounts, setPayableAccounts] = useState<{ id: string; value: string; label: string }[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<{ id: string; name: string; code?: string }[]>([]);

  // History sidebar state
  const [selectedPartForHistory, setSelectedPartForHistory] = useState<string | null>(null);
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
  const [itemsPerPage] = useState(25);

  // Fetch orders
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getDirectPurchaseOrders({
        status: statusFilter !== "all" ? statusFilter : undefined,
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
            order.description?.toLowerCase().includes(searchLower)
          );
        });
      }

      setOrders(filteredData.map((o: any) => ({
        id: o.id,
        dpoNo: o.dpo_no,
        store: o.store_name || "N/A",
        requestDate: new Date(o.date).toLocaleDateString('en-GB'),
        date: o.date, // Raw date for sorting
        description: o.description || "",
        grandTotal: o.total_amount || 0,
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

          // Filter for Cash (101) and Bank (102, 103) accounts
          const subgroupCode = acc.subgroup?.code || '';
          const subgroupName = (acc.subgroup?.name || '').toLowerCase();
          const accountName = (acc.name || '').toLowerCase();

          // Check by subgroup code
          const isCash = subgroupCode === '101';
          const isBank = subgroupCode === '102' || subgroupCode === '103' || subgroupCode === '108';

          // Also check by names as fallback
          const isCashByName = subgroupName.includes('cash') || accountName.includes('cash');
          const isBankByName = subgroupName.includes('bank') || accountName.includes('bank');

          return isCash || isBank || isCashByName || isBankByName;
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

          // Filter for Cash (101) and Bank (102, 103) accounts
          const subgroupCode = acc.subgroup?.code || '';
          const subgroupName = (acc.subgroup?.name || '').toLowerCase();
          const accountName = (acc.name || '').toLowerCase();

          // Check by subgroup code
          const isCash = subgroupCode === '101';
          const isBank = subgroupCode === '102' || subgroupCode === '103' || subgroupCode === '108';

          // Also check by names as fallback
          const isCashByName = subgroupName.includes('cash') || accountName.includes('cash');
          const isBankByName = subgroupName.includes('bank') || accountName.includes('bank');

          return isCash || isBank || isCashByName || isBankByName;
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
  }, [currentPage, itemsPerPage, statusFilter]);

  useEffect(() => {
    if (viewMode === "list") {
      fetchOrders();
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchStores();
    fetchParts();
    fetchBrands();
    fetchSuppliers();
    fetchAccounts();
    fetchPayableAccounts();
    fetchExpenseTypes();
    fetchBankCashAccounts();
  }, []);

  // Filter and sort orders (client-side for search) - most recent first
  const filteredOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      // Handle date parsing with fallback
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;

      // If dates are invalid, push to end
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;

      // Sort by date descending (newest first)
      if (dateB !== dateA) {
        return dateB - dateA;
      }

      // If dates are equal, sort by ID descending (newer IDs first)
      return (b.id || "").localeCompare(a.id || "");
    });
  }, [orders]);

  // Pagination
  const totalPages = Math.ceil(totalRecords / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    return filteredOrders;
  }, [filteredOrders]);

  // Generate new DPO number - backend will ensure uniqueness if duplicate
  const generateDpoNo = () => {
    const year = new Date().getFullYear();
    // Generate based on current year and records count
    // Backend will auto-correct if duplicate
    const nextNum = totalRecords + 1;
    return `DPO-${year}-${String(nextNum).padStart(3, "0")}`;
  };

  // Reset form
  const resetForm = () => {
    setFormStore("");
    setFormSupplier("");
    setFormRequestDate(new Date());
    setFormDescription("");
    setFormAccount("");
    setFormItems([]);
    setFormExpenses([]);
    setSelectedPartForHistory(null);
    setPartHistory(null);
  };

  // Open create view
  const handleNewOrder = () => {
    resetForm();
    setViewMode("create");
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
      setFormDescription(dpo.description || "");

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
          expenseType: exp.expense_type || exp.expenseType || "",
          payableAccount: exp.payable_account || exp.payableAccount || "",
          description: exp.description || "",
          amount: exp.amount || 0,
        }));
        setFormExpenses(loadedExpenses);
      } else {
        setFormExpenses([]);
      }

      // Load items with prices from DPO item (or fallback to part prices)
      const itemsWithDetails = await Promise.all(
        (dpo.items || []).map(async (item: any, idx: number) => {
          // Use prices from DPO item first (they may have been customized)
          let priceA = item.price_a !== undefined && item.price_a !== null ? item.price_a : null;
          let priceB = item.price_b !== undefined && item.price_b !== null ? item.price_b : null;
          let priceM = item.price_m !== undefined && item.price_m !== null ? item.price_m : null;

          // If DPO item doesn't have prices, fetch from part as fallback
          if ((priceA === null || priceB === null || priceM === null) && item.part_id) {
            try {
              const partResponse = await apiClient.getPart(item.part_id) as any;
              if (!partResponse.error && partResponse) {
                if (priceA === null) priceA = partResponse.price_a || null;
                if (priceB === null) priceB = partResponse.price_b || null;
                if (priceM === null) priceM = partResponse.price_m || null;
              }
            } catch (error) {
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
          };
        })
      );

      setFormItems(itemsWithDetails);

      setFormExpenses(
        (dpo.expenses || []).map((exp: any, idx: number) => ({
          id: String(idx + 1),
          expenseType: exp.expense_type,
          payableAccount: exp.payable_account,
          description: exp.description || "",
          amount: exp.amount,
        }))
      );

      setViewMode("edit");
    } catch (error: any) {
      toast.error(`Error fetching order: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Open view dialog
  const handleView = async (order: DirectPurchaseOrder) => {
    try {
      setLoading(true);
      const response = await apiClient.getDirectPurchaseOrder(order.id) as any;

      if (response.error) {
        toast.error(response.error);
        return;
      }

      const dpo = response;
      const viewOrder: DirectPurchaseOrder = {
        id: dpo.id,
        dpoNo: dpo.dpo_no,
        store: dpo.store_name || "N/A",
        requestDate: new Date(dpo.date).toLocaleDateString('en-GB'),
        date: dpo.date, // Raw date for sorting
        description: dpo.description || "",
        grandTotal: dpo.total_amount || 0,
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
      };

      setSelectedOrder(viewOrder);
      setShowViewDialog(true);
    } catch (error: any) {
      toast.error(`Error fetching order: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Back to list
  const handleBackToList = () => {
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

      toast.success("Direct Purchase Order deleted successfully");

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
      setPartHistory(null);
    }
  };

  // Fetch part history
  const fetchPartHistory = async (partId: string) => {
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

      try {
        const partResponse = await apiClient.getPart(partId) as any;
        if (!partResponse.error && partResponse) {
          partPriceA = partResponse.price_a ?? partResponse.priceA ?? null;
          partPriceB = partResponse.price_b ?? partResponse.priceB ?? null;
          partPriceM = partResponse.price_m ?? partResponse.priceM ?? null;
        }
      } catch (error: any) {
        // Don't throw - just continue without part prices
      }

      // Fetch direct purchase orders to find last purchase for this part
      let dpoResponse: any = null;
      try {
        dpoResponse = await apiClient.getDirectPurchaseOrders({ limit: 100 }) as any;
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

                // Get purchase price from this DPO item
                const purchasePrice = partItem.purchase_price ?? partItem.purchasePrice ?? null;
                const orderDate = fullOrderResponse.date ?? order.date ?? null;
                const orderDpoNo = fullOrderResponse.dpo_no ?? order.dpo_no ?? order.dpoNumber ?? null;

                // Calculate Direct Purchase Cost Price including expenses
                const itemQty = partItem.quantity ?? partItem.qty ?? 1;
                const itemAmount = purchasePrice ? purchasePrice * itemQty : 0;

                // Calculate total expenses for this DPO
                const dpoExpenses = fullOrderResponse.expenses || [];
                const totalExpenses = dpoExpenses.reduce((sum: number, exp: any) => {
                  const amount = exp.amount || exp.expense_amount || 0;
                  return sum + amount;
                }, 0);

                // Calculate distributed expense for this item (weighted by item amount)
                const allItems = fullOrderResponse.items || [];
                const totalItemsAmount = allItems.reduce((sum: number, item: any) => {
                  const price = item.purchase_price ?? item.purchasePrice ?? 0;
                  const qty = item.quantity ?? item.qty ?? 0;
                  return sum + (price * qty);
                }, 0);

                const distributedExpense = totalItemsAmount > 0
                  ? (itemAmount / totalItemsAmount) * totalExpenses
                  : 0;

                // Calculate cost per unit including distributed expenses
                const costPerUnitWithExpenses = itemQty > 0
                  ? (itemAmount + distributedExpense) / itemQty
                  : purchasePrice;

                // Update lastPurchasePrice and date from the most recent DPO containing this part
                // This should be the first DPO we find (since sorted by date, most recent first)
                if (lastPurchasePrice === null && purchasePrice !== null && purchasePrice !== undefined) {
                  // Use the cost per unit including expenses
                  lastPurchasePrice = costPerUnitWithExpenses || purchasePrice;
                  lastPurchaseDate = orderDate;
                  lastPurchaseDpoNo = orderDpoNo;

                  // Mark that we found a DPO for this part
                  foundDPO = true;

                  // Debug: Log what we're getting from the API

                  // Since we're sorted by date and this is the most recent DPO, we can break
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

      // Debug: Log final values being set (only if we have some data)
      const hasAnyData = priceA !== null || priceB !== null || priceM !== null ||
        lastPurchasePrice !== null || lastPurchaseDate !== null || lastPurchaseDpoNo !== null;
      if (hasAnyData) {
      }

      setPartHistory({
        priceA: priceA !== null && priceA !== undefined ? Number(priceA) : null,
        priceB: priceB !== null && priceB !== undefined ? Number(priceB) : null,
        priceM: priceM !== null && priceM !== undefined ? Number(priceM) : null,
        lastPurchasePrice: lastPurchasePrice !== null && lastPurchasePrice !== undefined ? Number(lastPurchasePrice) : null,
        lastPurchaseDate,
        lastPurchaseDpoNo,
      });
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

          // When part is selected, also set its weight
          if (field === "partId" && typeof value === "string") {
            const selectedPart = parts.find(p => p.id === value);
            if (selectedPart) {
              updated.weight = selectedPart.weight || 0;
            }
          }

          // Update brand information when part is selected (but don't auto-fill prices)
          if (field === "partId") {
            // Fetch part details to get brand information
            if (typeof value === "string" && value) {
              apiClient.getPart(value)
                .then((partResponse) => {
                  const part = partResponse as any;
                  // Check if response has error (like 502 Bad Gateway)
                  if (part?.error) {
                    return; // Exit early if there's an error
                  }
                  if (part) {
                    // Update the parts array with brand information if missing
                    setParts((currentParts) =>
                      currentParts.map((p) => {
                        if (p.id === value && !p.brand && part.brand_name) {
                          return { ...p, brand: part.brand_name };
                        }
                        return p;
                      })
                    );
                  }
                })
                .catch((error: any) => {
                  // Don't throw - just log and continue
                });
              setSelectedPartForHistory(value);
              fetchPartHistory(value);
            }
          }
          return updated;
        }
        return item;
      })
    );
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

  // Calculate total expenses
  const calculateTotalExpenses = () => {
    return formExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  };

  // Calculate distributed expenses based on weight
  const calculateDistributedExpenses = useMemo(() => {
    const totalExpenses = calculateTotalExpenses();
    if (totalExpenses === 0 || formItems.length === 0) {
      return formItems.map(() => 0);
    }

    // Separate items with weight from items without weight
    const itemsWithWeight = formItems.filter(item => item.weight > 0);
    const itemsWithoutWeight = formItems.filter(item => item.weight === 0);

    const totalWeight = itemsWithWeight.reduce((sum, item) => sum + item.weight, 0);

    // If no items have weight, distribute equally
    if (totalWeight === 0) {
      const equalShare = totalExpenses / formItems.length;
      return formItems.map(() => equalShare);
    }

    // Calculate weight-based distribution for items with weight
    const weightBasedExpenses = itemsWithWeight.map(item => {
      return (item.weight / totalWeight) * totalExpenses;
    });

    // If there are items without weight, distribute remaining equally
    let distributedExpenses: { [key: string]: number } = {};

    itemsWithWeight.forEach((item, index) => {
      distributedExpenses[item.id] = weightBasedExpenses[index];
    });

    // Items without weight get equal share of remaining (if any)
    const equalShare = itemsWithoutWeight.length > 0 ? 0 : 0;
    itemsWithoutWeight.forEach(item => {
      distributedExpenses[item.id] = equalShare;
    });

    return formItems.map(item => distributedExpenses[item.id] || 0);
  }, [formItems, formExpenses]);

  // Calculate grand total (items + expenses)
  const calculateTotal = () => {
    return calculateItemsTotal() + calculateTotalExpenses();
  };

  // Add expense
  const handleAddExpense = () => {
    setFormExpenses((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        expenseType: "",
        payableAccount: "",
        description: "",
        amount: 0,
      },
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
    if (!formStore) {
      toast.error("Please select a store");
      return;
    }
    if (!formSupplier) {
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

    // Validate expenses - if expense type or payable account is filled, both must be filled (amount can be 0 or empty)
    const invalidExpenses = formExpenses.filter(
      (exp) => {
        const hasType = exp.expenseType && exp.expenseType.trim() !== "";
        const hasAccount = exp.payableAccount && exp.payableAccount.trim() !== "";
        // Invalid if only one field is filled (incomplete entry)
        return (hasType && !hasAccount) || (!hasType && hasAccount);
      }
    );
    if (invalidExpenses.length > 0) {
      toast.error("Please fill all expense fields (Type and Payable Account) or remove incomplete expense rows");
      return;
    }

    try {
      setLoading(true);

      // Store current part ID for history refresh
      const currentPartId = selectedPartForHistory;

      const dpoData = {
        dpo_number: viewMode === "edit" && selectedOrder ? selectedOrder.dpoNo : (formItems.length > 0 ? generateDpoNo() : undefined),
        date: format(formRequestDate, "yyyy-MM-dd"),
        store_id: formStore,
        supplier_id: formSupplier || undefined,
        account: formAccount || undefined, // Send Account ID (bank/cash account ID)
        description: formDescription || undefined,
        status: "Order Receivable Pending",
        items: validItems.map((item) => {
          const qty = typeof item.quantity === "number" ? item.quantity : 0;
          const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;

          // Properly handle price values - convert empty strings to null, preserve 0 values
          const getPriceValue = (value: number | ""): number | null => {
            if (value === "" || value === null || value === undefined) return null;
            const numValue = typeof value === "number" ? value : parseFloat(String(value));
            return isNaN(numValue) ? null : numValue;
          };

          const priceA = getPriceValue(item.priceA);
          const priceB = getPriceValue(item.priceB);
          const priceM = getPriceValue(item.priceM);

          return {
            part_id: item.partId,
            quantity: qty,
            purchase_price: price,
            price_a: priceA !== null ? priceA : undefined,
            price_b: priceB !== null ? priceB : undefined,
            price_m: priceM !== null ? priceM : undefined,
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
        ? "Direct Purchase Order updated successfully"
        : "Direct Purchase Order created successfully";
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
          const dpo = updatedOrder;
          const viewOrder: DirectPurchaseOrder = {
            id: dpo.id,
            dpoNo: dpo.dpo_no,
            store: dpo.store_name || "N/A",
            requestDate: new Date(dpo.date).toLocaleDateString('en-GB'),
            date: dpo.date, // Raw date for sorting
            description: dpo.description || "",
            grandTotal: dpo.total_amount || 0,
            status: dpo.status as "Draft" | "Order Receivable Pending" | "Completed" | "Cancelled",
            account: dpo.account || "",
            items: (dpo.items || []).map((item: any) => ({
              id: item.id,
              partNo: item.part_no,
              description: item.part_description || item.part_no,
              brand: item.brand || "",
              uom: item.uom || "pcs",
              quantity: item.quantity,
              purchasePrice: item.purchase_price,
              amount: item.amount,
            })),
          };
          setSelectedOrder(viewOrder);
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
      const response = await apiClient.updateDirectPurchaseOrder(order.id, {
        status: "Completed",
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
          const dpo = updatedOrder;
          const viewOrder: DirectPurchaseOrder = {
            id: dpo.id,
            dpoNo: dpo.dpo_no,
            store: dpo.store_name || "N/A",
            requestDate: new Date(dpo.date).toLocaleDateString('en-GB'),
            date: dpo.date, // Raw date for sorting
            description: dpo.description || "",
            grandTotal: dpo.total_amount || 0,
            status: dpo.status as "Draft" | "Order Receivable Pending" | "Completed" | "Cancelled",
            account: dpo.account || "",
            items: (dpo.items || []).map((item: any) => ({
              id: item.id,
              partNo: item.part_no,
              description: item.part_description || item.part_no,
              brand: item.brand || "",
              uom: item.uom || "pcs",
              quantity: item.quantity,
              purchasePrice: item.purchase_price,
              amount: item.amount,
            })),
          };
          setSelectedOrder(viewOrder);
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
        return <Badge className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20">{status}</Badge>;
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Direct Purchase Orders</h1>
        <p className="text-muted-foreground text-sm">Manage direct purchase orders</p>
      </div>

      {/* New Order Button */}
      <Button onClick={handleNewOrder} className="bg-orange-500 hover:bg-orange-600 text-white">
        <Plus className="w-4 h-4 mr-2" />
        New Direct Purchase Order
      </Button>

      {/* Orders Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">
            All Direct Purchase Orders ({filteredOrders.length})
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
                      <TableHead className="w-12">S.NO</TableHead>
                      <TableHead className="min-w-[120px]">DPO No.</TableHead>
                      <TableHead className="min-w-[100px]">Store</TableHead>
                      <TableHead className="min-w-[110px]">Request Date</TableHead>
                      <TableHead className="min-w-[150px]">Description</TableHead>
                      <TableHead className="text-right min-w-[120px]">Grand Total</TableHead>
                      <TableHead className="min-w-[140px]">Status</TableHead>
                      <TableHead className="text-center min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order, index) => (
                      <TableRow key={order.id}>
                        <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                        <TableCell className="font-medium">{order.dpoNo}</TableCell>
                        <TableCell>{order.store}</TableCell>
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
                                  className="h-8 w-8 text-orange-500 hover:text-orange-600"
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </ActionButtonTooltip>
                            )}
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
              No direct purchase orders found. Create one to get started.
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} entries
              </p>
              <div className="flex items-center gap-2">
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
                  <p className="text-sm font-medium">
                    {(partHistory.priceA !== null && partHistory.priceA !== undefined && !isNaN(Number(partHistory.priceA)))
                      ? Number(partHistory.priceA).toLocaleString("en-PK", { style: "currency", currency: "PKR" })
                      : "N/A"}
                  </p>
                </div>

                {/* Price B */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price B</Label>
                  <p className="text-sm font-medium">
                    {(partHistory.priceB !== null && partHistory.priceB !== undefined && !isNaN(Number(partHistory.priceB)))
                      ? Number(partHistory.priceB).toLocaleString("en-PK", { style: "currency", currency: "PKR" })
                      : "N/A"}
                  </p>
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

              {/* Edit Button */}
              {selectedPart && (
                <div className="border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => {
                      // Store part number in localStorage for Pricing & Costing page to pick up
                      if (selectedPart.masterPartNo || selectedPart.partNo) {
                        localStorage.setItem(
                          'pricingCostingSearchPartNo',
                          selectedPart.masterPartNo || selectedPart.partNo,
                        );
                      }
                      // Navigate to Pricing & Costing page
                      navigate('/pricing-costing');
                    }}
                  >
                    <Edit className="w-4 h-4" />
                    Edit Price
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
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="flex-1 space-y-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                {viewMode === "edit" ? "Edit Direct Purchase Order" : "Add Direct Purchase Order"}
              </h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackToList}
            className="shrink-0"
            aria-label="Close form"
            title="Close"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>

        {/* Form Card */}
        <Card>
          <CardContent className="pt-6">
            {/* Header Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
              <div className="space-y-2">
                <Label>PO NO</Label>
                <Input
                  value={viewMode === "edit" && selectedOrder ? selectedOrder.dpoNo : generateDpoNo()}
                  disabled
                  className="bg-muted"
                />
              </div>
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
                <Label>Supplier</Label>
                <SearchableSelect
                  options={suppliers}
                  value={formSupplier}
                  onValueChange={setFormSupplier}
                  placeholder="Select supplier..."
                />
              </div>
              <div className="space-y-2">
                <Label>Store</Label>
                <SearchableSelect
                  options={stores}
                  value={formStore}
                  onValueChange={setFormStore}
                  placeholder="Select store..."
                />
                {!formStore && <p className="text-xs text-destructive">Required</p>}
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Enter description..."
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
                  <div className="rounded-md border overflow-x-auto -mx-1 sm:mx-0">
                    <div className="min-w-[800px] sm:min-w-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead className="min-w-[200px]">Part</TableHead>
                            <TableHead className="min-w-[80px]">Brand</TableHead>
                            <TableHead className="min-w-[60px]">UoM</TableHead>
                            <TableHead className="w-20 sm:w-24">Qty</TableHead>
                            <TableHead className="w-28 sm:w-32">Purchase Price</TableHead>

                            <TableHead className="w-20 text-right">Weight (kg)</TableHead>
                            <TableHead className="w-28 text-right">Dist. Expense</TableHead>
                            <TableHead className="text-right min-w-[100px]">Total Amount</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formItems.map((item, index) => {
                            const selectedPart = parts.find((p) => p.id === item.partId);
                            return (
                              <TableRow key={item.id}>
                                <TableCell>{index + 1}</TableCell>
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

                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {item.weight > 0 ? `${item.weight} kg` : "-"}
                                </TableCell>
                                <TableCell className="text-right text-xs text-primary">
                                  {calculateDistributedExpenses[index] > 0
                                    ? `Rs ${calculateDistributedExpenses[index].toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {(() => {
                                    const price = typeof item.purchasePrice === "number" ? item.purchasePrice : 0;
                                    const qty = typeof item.quantity === "number" ? item.quantity : 0;
                                    const itemAmount = price * qty;
                                    const distributedExpense = calculateDistributedExpenses[index] || 0;
                                    const totalWithExpense = itemAmount + distributedExpense;
                                    return totalWithExpense.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expense Section */}
            <Card className="mb-6">
              <CardHeader className="py-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="text-base font-medium">Expenses</CardTitle>
                  <Button onClick={handleAddExpense} variant="outline" size="sm" className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {formExpenses.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-sm">No expenses added yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden sm:grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground pb-2 border-b">
                      <div className="col-span-12 sm:col-span-3">Expense Type</div>
                      <div className="col-span-12 sm:col-span-3">Payable Account</div>
                      <div className="col-span-12 sm:col-span-3">Description</div>
                      <div className="col-span-12 sm:col-span-2 text-right">Amount</div>
                      <div className="col-span-12 sm:col-span-1"></div>
                    </div>
                    {formExpenses.map((expense) => (
                      <div key={expense.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-2 items-start sm:items-center p-2 sm:p-0 border sm:border-0 rounded-lg sm:rounded-none">
                        <div className="col-span-12 sm:col-span-3">
                          <Select
                            value={expense.expenseType}
                            onValueChange={(value) => handleUpdateExpense(expense.id, "expenseType", value)}
                          >
                            <SelectTrigger className={!expense.expenseType ? "border-orange-500" : ""}>
                              <SelectValue placeholder="Select expense type..." />
                            </SelectTrigger>
                            <SelectContent>
                              {expenseTypes.length > 0 ? (
                                expenseTypes.map((type) => (
                                  <SelectItem key={type.id} value={type.name}>
                                    {type.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="NO_EXPENSE_TYPES" disabled>
                                  No expense types available. Please create expense types first.
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-12 sm:col-span-3">
                          <Label className="text-xs text-muted-foreground sm:hidden mb-1 block">Payable Account</Label>
                          <Select
                            value={expense.payableAccount}
                            onValueChange={(value) => handleUpdateExpense(expense.id, "payableAccount", value)}
                          >
                            <SelectTrigger className={!expense.payableAccount ? "border-orange-500" : ""}>
                              <SelectValue placeholder="Select payable account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {payableAccounts.length > 0 ? (
                                payableAccounts.map((account) => (
                                  <SelectItem key={account.id} value={account.value || account.id}>
                                    {account.label}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="NO_ACCOUNTS_AVAILABLE" disabled>No accounts available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-12 sm:col-span-3">
                          <Label className="text-xs text-muted-foreground sm:hidden mb-1 block">Description</Label>
                          <Input
                            value={expense.description}
                            onChange={(e) => handleUpdateExpense(expense.id, "description", e.target.value)}
                            placeholder="Enter description..."
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-2">
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
                            className={cn("text-right", expense.amount <= 0 && "border-orange-500")}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-1 flex justify-center sm:justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveExpense(expense.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-2 border-t mt-2">
                      <div className="text-sm font-medium">
                        Total Expenses: <span className="text-primary">{calculateTotalExpenses().toLocaleString("en-PK")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Account and Total */}
            <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-start gap-4 mb-6">
              <div className="space-y-2 flex-1 sm:flex-initial w-full sm:w-auto">
                <Label>Account</Label>
                <SearchableSelect
                  options={accounts}
                  value={formAccount}
                  onValueChange={setFormAccount}
                  placeholder="Select account..."
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Items Total</Label>
                <Input value={calculateItemsTotal().toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} disabled className="w-full sm:w-40 text-right bg-muted" />
                <Label>Grand Total</Label>
                <Input value={calculateTotal().toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} disabled className="w-full sm:w-40 text-right bg-muted font-semibold" />
                <p className="text-xs text-muted-foreground">
                  Expenses: {calculateTotalExpenses().toLocaleString("en-PK")}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t">
              <Button variant="destructive" onClick={resetForm} className="w-full sm:w-auto">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white flex-1 sm:flex-initial">
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

      {/* History Sidebar */}
      {(viewMode === "create" || viewMode === "edit") && renderHistorySidebar()}
    </div>
  );

  // Render view dialog
  const renderViewDialog = () => (
    <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 border-b bg-muted/30">
          <DialogTitle>Direct Purchase Order Details</DialogTitle>
          <DialogDescription>
            {selectedOrder?.dpoNo} - {selectedOrder?.requestDate}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedOrder && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Fixed Top Info */}
              <div className="p-6 pb-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <Label className="text-muted-foreground">DPO No</Label>
                    <p className="font-medium">{selectedOrder.dpoNo}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Store</Label>
                    <p className="font-medium">{selectedOrder.store}</p>
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
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="font-medium">{selectedOrder.description || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Account</Label>
                    <p className="font-medium">{selectedOrder.account}</p>
                  </div>
                </div>
              </div>

              {/* Scrollable Items Table */}
              <div className="flex-1 overflow-hidden px-6 py-2">
                <div className="h-full border rounded-md flex flex-col overflow-hidden bg-card">
                  <ScrollArea className="flex-1">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                        <TableRow>
                          <TableHead>#</TableHead>
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
                            <TableCell>{index + 1}</TableCell>
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
                    </Table>
                  </ScrollArea>
                </div>
              </div>

              {/* Fixed Grand Total at bottom */}
              <div className="px-6 py-4 bg-muted/10 border-t">
                <div className="flex justify-end">
                  <div className="text-right">
                    <p className="text-muted-foreground text-sm uppercase font-semibold">Grand Total</p>
                    <p className="text-2xl font-bold text-primary">
                      {selectedOrder.grandTotal.toLocaleString("en-PK", { style: "currency", currency: "PKR" })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <div className="flex gap-2">
            {selectedOrder && (selectedOrder.status === "Order Receivable Pending" || selectedOrder.status === "Completed") && (
              <>
                <Button onClick={() => handlePaymentClick(selectedOrder)} className="bg-green-600 hover:bg-green-700 text-white">
                  <Save className="w-4 h-4 mr-2" />
                  Pay Supplier
                </Button>
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
                            <div className="text-orange-500">Returned Qty: {item.alreadyReturned}</div>
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

  return (
    <div className="space-y-4">
      {viewMode === "list" && renderListView()}
      {(viewMode === "create" || viewMode === "edit") && renderCreateEditView()}
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
                <p><span className="text-muted-foreground">DPO No:</span> {selectedOrder.dpoNo}</p>
                <p><span className="text-muted-foreground">Grand Total:</span> <span className="font-semibold">{selectedOrder.grandTotal.toLocaleString("en-PK", { style: "currency", currency: "PKR" })}</span></p>
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
              Are you sure you want to delete this direct purchase order? This action cannot be undone.
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
