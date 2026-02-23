import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InvoiceDeliveryLog } from "./InvoiceDeliveryLog";
import {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  CustomerType,
  PartItem,
  Customer,
  DeliveryLogEntry,
  ItemGrade,
} from "@/types/invoice";

// Interface for inline item row
interface InlineItemRow {
  id: string;
  selectedPartId: string;
  qty: number;
  priceA?: number; // Editable Price A
  priceB?: number; // Editable Price B
  priceM?: number; // Editable Price M
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
  const [filterCustomerType, setFilterCustomerType] = useState<string>("all");
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [approvingInvoice, setApprovingInvoice] = useState<string | null>(null);

  // New / Edit Invoice State
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [newInvoice, setNewInvoice] = useState<Partial<Invoice>>({
    customerType: "walking", // Default to "walking" to show customer dropdown
    items: [],
    overallDiscount: 0,
    overallDiscountType: "percent",
  });

  // Customers data from API
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>("");

  // Add Customer Dialog State
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    address: "",
    email: "",
    cnic: "",
    contactNo: "",
    openingBalance: 0,
    date: "",
    creditLimit: 0,
    status: "active" as "active" | "inactive",
    priceType: "" as "A" | "B" | "M" | "",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Inline items state - matching reference design
  const [inlineItems, setInlineItems] = useState<InlineItemRow[]>([]);

  // Parts data from API
  const [parts, setParts] = useState<PartItem[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsSearchTerm, setPartsSearchTerm] = useState<
    Record<string, string>
  >({});
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

  // Navigation
  const navigate = useNavigate();

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
  const [deliveredTo, setDeliveredTo] = useState("");
  const [remarks, setRemarks] = useState("");

  // Delivery Log
  const [showDeliveryLog, setShowDeliveryLog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // View Invoice
  const [showViewInvoice, setShowViewInvoice] = useState(false);

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

  // Filter invoices (only by search term, status and customerType are filtered by API)
  // Also exclude invoices with demo customers
  const filteredInvoices = invoices.filter((inv) => {
    // Exclude invoices with demo customers (case-insensitive)
    if (inv.customerName.toLowerCase().includes("demo")) {
      return false;
    }

    if (!searchTerm) return true;
    return (
      inv.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

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
  const handleAddNewItem = () => {
    const newItem: InlineItemRow = {
      id: `row-${Date.now()}`,
      selectedPartId: "",
      qty: 0,
      priceA: undefined,
      priceB: undefined,
      priceM: undefined,
      selectedPriceType: undefined,
    };
    // Add new item at the top (first position), existing items move down
    setInlineItems([newItem, ...inlineItems]);
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
          let updated = { ...item, [field]: value };

          // Cross-field logic for location selection vs unlocated stock
          if (field === "useUnlocatedStock" && value === true) {
            updated.selectedRackId = "";
            updated.selectedLocationId = "";
            updated.selectedLocationIds = [];
          } else if (
            (field === "selectedRackId" ||
              field === "selectedLocationId" ||
              field === "selectedLocationIds") &&
            value
          ) {
            updated.useUnlocatedStock = false;
          }

          // If part changed, set prices from part data and fetch stock balance
          if (field === "selectedPartId" && value) {
            const part = parts.find((p) => p.id === value);
            if (part) {
              // Set editable prices from part data
              updated.priceA = part.priceA || 0;
              updated.priceB = part.priceB || 0;
              updated.priceM = part.priceM || 0;

              // Auto-select Price A if available, otherwise B, then M
              if (part.priceA) {
                updated.selectedPriceType = "A";
              } else if (part.priceB) {
                updated.selectedPriceType = "B";
              } else if (part.priceM) {
                updated.selectedPriceType = "M";
              }

              // Fetch accurate stock balance for this part
              fetchPartStockBalance(value);

              // Auto-complete Rack and Shelf if locations exist
              if (part.locations && part.locations.length > 0) {
                const firstLoc = part.locations[0];
                updated.selectedRackId = firstLoc.rackId;
                updated.selectedLocationId = firstLoc.id;
              } else if (part.unlocatedStock && part.unlocatedStock > 0) {
                // If no assigned locations but unlocated stock exists, auto-check unlocated
                updated.useUnlocatedStock = true;
              }
            }
          }
          return updated;
        }
        return item;
      }),
    );
  };

  // Fetch accurate stock balance for a part
  const fetchPartStockBalance = async (partId: string) => {
    if (partStockBalances[partId]) {
      // Already fetched, but refresh it
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
    } finally {
      setLoadingStock((prev) => ({ ...prev, [partId]: false }));
    }
  };

  // Remove inline item
  const handleRemoveInlineItem = (id: string) => {
    setInlineItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Debounce timer for parts search
  const partsSearchDebounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Fetch parts from API - Load initial set on dropdown open, searchable with client-side filtering
  const fetchParts = async (
    searchTerm: string = "",
    forceRefresh: boolean = false,
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

    setPartsLoading(true);
    try {
      const params: any = {
        limit: 500, // Load reasonable amount for fast initial display
        page: 1,
        status: "active",
      };

      // Use search parameter if provided (for server-side search when needed)
      if (searchTerm && searchTerm.trim().length > 0) {
        params.search = searchTerm.trim();
        params.limit = 200; // Smaller limit for search results
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
              category: p.category_name || "",
              price: p.price_a || p.cost || 0,
              priceA: p.price_a || null,
              priceB: p.price_b || null,
              priceM: p.price_m || null,
              stockQty: p.stock || 0,
              reservedQty: p.reserved_stock || 0,
              availableQty: (p.stock || 0) - (p.reserved_stock || 0),
              lastSalePrice: p.lastSalePrice || 0,
              grade: p.grade || "A",
              brands: p.brand_name
                ? [{ id: p.brand_id || "", name: p.brand_name }]
                : [],
              locations: p.locations || [],
              unlocatedStock: p.unlocated_stock || 0,
            };
          })
          .filter((p: PartItem | null): p is PartItem => p !== null);

        setParts(transformedParts);
      }
    } catch (error) {
      setParts([]);
    } finally {
      setPartsLoading(false);
    }
  };

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(partsSearchDebounceRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

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

  // Fetch invoices from backend
  useEffect(() => {
    const fetchInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const response = (await apiClient.getSalesInvoices({
          status: filterStatus !== "all" ? filterStatus : undefined,
          customerType:
            filterCustomerType !== "all" ? filterCustomerType : undefined,
          search: searchTerm || undefined,
        })) as any;

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
        const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => ({
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          customerType: inv.customerType as CustomerType,
          customerId: inv.customerId,
          customerName: inv.customerName,
          salesPerson: inv.salesPerson || "Admin",
          items:
            inv.items?.map((item: any) => ({
              id: item.id,
              partId: item.partId,
              partNo: item.partNo,
              description: item.description || "",
              orderedQty: item.orderedQty,
              deliveredQty: item.deliveredQty,
              pendingQty: item.pendingQty,
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
  }, [filterStatus, filterCustomerType, searchTerm]);

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
              balance: c.openingBalance || 0,
              creditLimit: c.creditLimit || 0,
              creditDays: c.creditDays || 0,
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

        // Separate Bank accounts (subgroup 102 = Bank Accounts)
        const bankAccountsList = currentAssetsAccounts
          .filter((acc: any) => {
            const subgroupCode = acc.Subgroup?.code || "";
            const accountCode = acc.code || "";
            const accountName = (acc.name || "").toLowerCase();

            // Explicitly exclude Accounts Receivable (103) and Inventory (104)
            if (subgroupCode === "103" || subgroupCode === "104") return false;

            // Check subgroup code first (most reliable)
            if (subgroupCode === "102") return true;

            // Check account code pattern (102xxx)
            if (/^102\d{3}$/.test(accountCode)) return true;

            // Check account name contains "bank" but not "inventory"
            return (
              accountName.includes("bank") && !accountName.includes("inventory")
            );
          })
          .map((acc: any) => ({
            id: acc.id,
            name: acc.name || "",
            type: acc.Subgroup?.MainGroup?.name || "General",
            code: acc.code || "",
          }));

        // Separate Cash accounts (subgroup 101 = Cash and Cash Equivalents)
        const cashAccountsList = currentAssetsAccounts
          .filter((acc: any) => {
            const subgroupCode = acc.Subgroup?.code || "";
            const accountCode = acc.code || "";
            const accountName = (acc.name || "").toLowerCase();

            // Explicitly exclude Accounts Receivable (103) and Inventory (104)
            if (subgroupCode === "103" || subgroupCode === "104") return false;

            // Check subgroup code first (most reliable)
            if (subgroupCode === "101") return true;

            // Check account code pattern (101xxx)
            if (/^101\d{3}$/.test(accountCode)) return true;

            // Check account name contains "cash" or "petty" but not "inventory"
            return (
              (accountName.includes("cash") || accountName.includes("petty")) &&
              !accountName.includes("inventory")
            );
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
    return parts.find((p) => p.id === partId);
  };

  // Calculate line total for inline item
  const calculateLineTotal = (item: InlineItemRow) => {
    const part = getPartForItem(item.selectedPartId);
    if (!part || !item.selectedPriceType) return 0;

    // Get the selected price value
    let selectedPrice = 0;
    if (item.selectedPriceType === "A") {
      selectedPrice =
        item.priceA !== undefined ? item.priceA : part.priceA || 0;
    } else if (item.selectedPriceType === "B") {
      selectedPrice =
        item.priceB !== undefined ? item.priceB : part.priceB || 0;
    } else if (item.selectedPriceType === "M") {
      selectedPrice =
        item.priceM !== undefined ? item.priceM : part.priceM || 0;
    }

    return item.qty * selectedPrice;
  };

  // Calculate total amount
  const calculateTotalAmount = () => {
    return inlineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  // Calculate amount after discount
  const calculateAmountAfterDiscount = () => {
    return calculateTotalAmount() - discount;
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

    // Check if all items have a selected price type
    const itemsWithoutPrice = inlineItems.filter(
      (i) => i.selectedPartId && i.qty > 0 && !i.selectedPriceType,
    );
    if (itemsWithoutPrice.length > 0) {
      toast({
        title: "Error",
        description: "Please select a price (Price A, B, or M) for all items",
        variant: "destructive",
      });
      return;
    }

    // NEW: Validation for Walk-in Customer (Cash Sale)
    const subtotal = calculateTotalAmount();
    const totalReceived = calculateTotalReceived();
    const grandTotal = calculateAmountAfterDiscount();

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

    // Validate stock and location requirements
    for (const item of inlineItems) {
      if (!item.selectedPartId || item.qty <= 0) continue;

      const part = getPartForItem(item.selectedPartId);
      if (!part) continue;

      const partNoDesc = part.description
        ? `${part.partNo} - ${part.description}`
        : part.partNo;

      // 1. Require a location selection or explicit unlocated flag
      if (
        !item.useUnlocatedStock &&
        (!item.selectedLocationIds || item.selectedLocationIds.length === 0)
      ) {
        toast({
          title: "Location Required",
          description: `Please select a Rack/Shelf location or check 'Unlocated Stock' for ${partNoDesc}.`,
          variant: "destructive",
        });
        return;
      }

      // 2. Validate quantity against available total stock
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

      // 3. Validate quantity against specifically selected locations
      if (
        !item.useUnlocatedStock &&
        item.selectedLocationIds &&
        item.selectedLocationIds.length > 0
      ) {
        let selectedStockTotal = 0;
        const selectedLocsText = [];
        for (const locId of item.selectedLocationIds) {
          const loc = part.locations?.find((l) => l.id === locId);
          if (loc) {
            selectedStockTotal += loc.quantity;
            selectedLocsText.push(
              `${loc.rackCode || "No Rack"}-${loc.shelfNo || "No Shelf"}`,
            );
          }
        }

        if (item.qty > selectedStockTotal) {
          toast({
            title: "Location Stock Exceeded",
            description: `Entered quantity (${item.qty}) for ${partNoDesc} exceeds the available stock in selected locations (${selectedLocsText.join(", ")}) which is ${selectedStockTotal}.`,
            variant: "destructive",
          });
          return;
        }
      }

      // 4. Validate quantity against unlocated stock if fully unlocated
      if (item.useUnlocatedStock) {
        if (item.qty > (part.unlocatedStock || 0)) {
          toast({
            title: "Unlocated Stock Exceeded",
            description: `Entered quantity (${item.qty}) for ${partNoDesc} exceeds available unlocated stock (${part.unlocatedStock || 0}).`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    // Convert inline items to invoice items
    const invoiceItems = inlineItems
      .filter((i) => i.selectedPartId && i.qty > 0 && i.selectedPriceType)
      .map((item) => {
        const part = getPartForItem(item.selectedPartId);

        // Get the selected price value
        let unitPrice = 0;
        if (item.selectedPriceType === "A") {
          unitPrice =
            item.priceA !== undefined ? item.priceA : part?.priceA || 0;
        } else if (item.selectedPriceType === "B") {
          unitPrice =
            item.priceB !== undefined ? item.priceB : part?.priceB || 0;
        } else if (item.selectedPriceType === "M") {
          unitPrice =
            item.priceM !== undefined ? item.priceM : part?.priceM || 0;
        }

        return {
          partId: item.selectedPartId,
          partNo: part?.partNo || "",
          description: part?.description || "",
          orderedQty: item.qty,
          unitPrice: unitPrice,
          discount: 0,
          lineTotal: calculateLineTotal(item),
          grade: part?.grade || "A",
          brand: part?.brands[0]?.name || "",
          selectedLocationId: item.selectedLocationId,
          selectedLocationIds: item.selectedLocationIds,
          useUnlocatedStock: item.useUnlocatedStock,
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
              : "Cash Customer"; // Cash Sale fallback

      let response;
      if (editingInvoiceId) {
        // UPDATE Existing Invoice
        response = await apiClient.updateSalesInvoice(editingInvoiceId, {
          invoiceDate: new Date().toISOString().split("T")[0],
          customerId: selectedCustomerId || undefined,
          customerName: customerName,
          deliveredTo: deliveredTo || undefined,
          remarks: remarks || undefined,
          items: invoiceItems,
          subtotal,
          overallDiscount: discount,
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
          invoiceDate: new Date().toISOString().split("T")[0],
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
          tax: 0,
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
          ? `Invoice ${editingInvoiceId ? "updated" : "created"}. Stock reserved. Approve when ready to reduce stock.`
          : `Invoice ${editingInvoiceId ? "updated" : "created"}. Stock reserved. Confirm delivery to complete.`;

      toast({
        title: `Invoice ${editingInvoiceId ? "Updated" : "Created"}`,
        description: `${invoiceType} invoice ${editingInvoiceId ? "updated" : "created"}. ${message}`,
      });

      resetForm();

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices();
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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
      customerType: "walking", // Default to "walking" to show customer dropdown
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
    setDeliveredTo("");
    setRemarks("");
    setSelectedCustomerId("");
    setSelectedCustomerName("");
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
            selectedPriceType: "A", // Defaulting to A, not tracked in backend natively
            useUnlocatedStock: item.useUnlocatedStock || false,
            selectedLocationId:
              item.InvoiceRackShelf?.[0]?.rackId &&
              item.InvoiceRackShelf?.[0]?.shelfId
                ? item.Part?.PartRackShelf?.find(
                    (prs: any) =>
                      prs.rackId === item.InvoiceRackShelf[0].rackId &&
                      prs.shelfId === item.InvoiceRackShelf[0].shelfId,
                  )?.id || ""
                : "",
            selectedLocationIds: (item.InvoiceRackShelf || [])
              .map((irs: any) => {
                return item.Part?.PartRackShelf?.find(
                  (prs: any) =>
                    prs.rackId === irs.rackId && prs.shelfId === irs.shelfId,
                )?.id;
              })
              .filter(Boolean),
            selectedRackId: item.InvoiceRackShelf?.[0]?.rackId || "",
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
      }

      setInlineItems(convertedItems);
      // Fetch stock balances for the loaded items so they render instantly
      convertedItems.forEach((item: any) => {
        if (item.selectedPartId) {
          fetchPartStockBalance(item.selectedPartId);
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

  // Handle Add Customer
  const handleAddCustomer = async () => {
    if (!newCustomerForm.name.trim()) {
      toast({
        title: "Error",
        description: "Customer name is required",
        variant: "destructive",
      });
      return;
    }

    setCreatingCustomer(true);
    try {
      const response = await apiClient.createCustomer({
        name: newCustomerForm.name.trim(),
        address: newCustomerForm.address || undefined,
        email: newCustomerForm.email || undefined,
        cnic: newCustomerForm.cnic || undefined,
        contactNo: newCustomerForm.contactNo || undefined,
        openingBalance: newCustomerForm.openingBalance || 0,
        date: newCustomerForm.date || undefined,
        creditLimit: newCustomerForm.creditLimit || 0,
        status: newCustomerForm.status,
        priceType: newCustomerForm.priceType || undefined,
      });

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to create customer",
          variant: "destructive",
        });
        return;
      }

      const customerData = response.data || response;
      toast({
        title: "Success",
        description: `Customer "${newCustomerForm.name}" created successfully`,
      });

      // Refresh customers list
      const customersResponse = await apiClient.getCustomers({
        status: "active",
        limit: 1000,
      });
      const customersData = Array.isArray(customersResponse)
        ? customersResponse
        : customersResponse.data || [];
      if (Array.isArray(customersData)) {
        const formattedCustomers: Customer[] = customersData.map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type || "registered",
          balance: c.openingBalance || 0,
          creditLimit: c.creditLimit || 0,
          creditDays: c.creditDays || 0,
        }));
        const filteredCustomers = formattedCustomers.filter(
          (c) => !c.name.toLowerCase().includes("demo"),
        );
        setCustomers(filteredCustomers);
      }

      // Select the newly created customer
      setSelectedCustomerId((customerData as any).id);
      setSelectedCustomerName((customerData as any).name);

      // Reset form and close dialog
      setNewCustomerForm({
        name: "",
        address: "",
        email: "",
        cnic: "",
        contactNo: "",
        openingBalance: 0,
        date: "",
        creditLimit: 0,
        status: "active",
        priceType: "",
      });
      setShowAddCustomerDialog(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    } finally {
      setCreatingCustomer(false);
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

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices();
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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
        setSelectedInvoice(updatedInvoice);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record delivery",
        variant: "destructive",
      });
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

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices({
        status: filterStatus !== "all" ? filterStatus : undefined,
        customerType:
          filterCustomerType !== "all" ? filterCustomerType : undefined,
      });
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal || 0,
        overallDiscount: inv.overallDiscount || 0,
        tax: inv.tax || 0,
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

      // Refresh invoices
      const response = await apiClient.getSalesInvoices();
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

      // Refresh invoices
      const invoicesResponse = await apiClient.getSalesInvoices();
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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
      const invoicesResponse = await apiClient.getSalesInvoices();
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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

      const invoicesResponse = await apiClient.getSalesInvoices();
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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
      const invoicesResponse = await apiClient.getSalesInvoices();
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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
      const invoicesResponse = await apiClient.getSalesInvoices({
        status: filterStatus !== "all" ? filterStatus : undefined,
        customerType:
          filterCustomerType !== "all" ? filterCustomerType : undefined,
        search: searchTerm || undefined,
      });
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
        salesPerson: inv.salesPerson || "Admin",
        items: inv.items?.map((item: any) => ({
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
        })),
        subtotal: inv.subtotal,
        overallDiscount: inv.overallDiscount || 0,
        overallDiscountType: "fixed" as const,
        tax: inv.tax || 0,
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

  const getStatusLabel = (status: InvoiceStatus): string => {
    const labels: Record<InvoiceStatus, string> = {
      pending: "Pending",
      on_hold: "On Hold",
      approved: "Approved",
      partially_delivered: "Partially Delivered",
      delivered: "Delivered",
    };
    return labels[status] ?? status;
  };

  const getStatusBadge = (status: InvoiceStatus | string) => {
    const styles: Record<string, string> = {
      pending: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      on_hold: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      approved: "bg-indigo-600/10 text-indigo-700 border-indigo-600/20",
      partially_delivered:
        "bg-orange-500/10 text-orange-600 border-orange-500/20",
      delivered: "bg-green-500/10 text-green-600 border-green-500/20",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      on_hold: "On Hold",
      approved: "Approved",
      partially_delivered: "Partially Delivered",
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Sales Invoice
          </h2>
          <p className="text-sm text-muted-foreground">
            Create invoices with stock reservation & partial delivery tracking
          </p>
        </div>
        <Button onClick={() => setShowNewInvoice(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Invoice
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                <p className="text-xs text-muted-foreground">Total Invoices</p>
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice number or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
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
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="partially_delivered">
                  Partially Delivered
                </SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

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
          <CardContent className="space-y-6">
            {/* Customer Section */}
            <div
              className={`grid grid-cols-1 gap-4 ${newInvoice.customerType === "registered" ? "md:grid-cols-5" : "md:grid-cols-4"}`}
            >
              <div className="space-y-2">
                <Label>Customer Type</Label>
                <Select
                  value={newInvoice.customerType}
                  onValueChange={(v) => {
                    const customerType = v as CustomerType;
                    setNewInvoice((prev) => ({ ...prev, customerType }));
                    // Reset customer selection when type changes to registered
                    if (customerType === "registered") {
                      setSelectedCustomerId("");
                      setSelectedCustomerName("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Party Sale</SelectItem>
                    <SelectItem value="walking">Cash Sale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Name Input - Only show for Cash Sale (walking) */}
              {newInvoice.customerType === "walking" && (
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input
                    placeholder="Enter customer name"
                    value={newInvoice.customerName || ""}
                    onChange={(e) =>
                      setNewInvoice((prev) => ({
                        ...prev,
                        customerName: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {/* Customer Dropdown - Only show for Party Sale (registered) */}
              {newInvoice.customerType === "registered" && (
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedCustomerId || undefined}
                      onValueChange={(value) => {
                        setSelectedCustomerId(value);
                        const customer = customers.find((c) => c.id === value);
                        if (customer) {
                          setSelectedCustomerName(customer.name);
                        }
                      }}
                      disabled={loadingCustomers}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue
                          placeholder={
                            loadingCustomers
                              ? "Loading..."
                              : customers.length === 0
                                ? "No customers available"
                                : "Select customer..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {!loadingCustomers &&
                          customers.length > 0 &&
                          customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        {!loadingCustomers && customers.length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No customers available
                          </div>
                        )}
                        {loadingCustomers && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Loading customers...
                          </div>
                        )}
                      </SelectContent>
                    </Select>
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
                </div>
              )}

              <div className="space-y-2">
                <Label>Tax Type</Label>
                <Select value={taxType} onValueChange={setTaxType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Without GST">Without GST</SelectItem>
                    <SelectItem value="With GST">With GST</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Delivered To</Label>
                <Input
                  placeholder="Enter name"
                  value={deliveredTo}
                  onChange={(e) => setDeliveredTo(e.target.value)}
                />
              </div>
            </div>

            {/* Items Section - Inline Table Like Reference */}
            <div className="space-y-3">
              <Button onClick={handleAddNewItem} className="gap-2 bg-primary">
                <Plus className="w-4 h-4" />
                Add New Item
              </Button>

              {inlineItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="min-w-[250px]">
                          Item Parts
                        </TableHead>
                        <TableHead>Rack</TableHead>
                        <TableHead>Shelf</TableHead>
                        <TableHead className="text-center">In Stock</TableHead>
                        <TableHead className="text-center">Reserved</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-center">Price A</TableHead>
                        <TableHead className="text-center">Price B</TableHead>
                        <TableHead className="text-center">Price M</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Remove</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inlineItems.map((item) => {
                        const part = getPartForItem(item.selectedPartId);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
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
                                          const description =
                                            selectedPart.description || "";
                                          return description
                                            ? `${partNo} - ${description}`
                                            : partNo;
                                        }

                                        // Fallback if parts didn't load yet but we have data from Edit
                                        if (item.partNoFallback) {
                                          const partNo = item.partNoFallback;
                                          const description =
                                            item.descriptionFallback || "";
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

                                      // Client-side filtering - no debounce needed, instant results
                                      // Parts are already loaded, just filter them client-side
                                      // No API call needed for search - use client-side filtering for speed
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
                                          const filteredParts = partsSearchTerm[
                                            item.id
                                          ]
                                            ? parts.filter(
                                                (p) =>
                                                  p.partNo
                                                    .toLowerCase()
                                                    .includes(
                                                      partsSearchTerm[
                                                        item.id
                                                      ].toLowerCase(),
                                                    ) ||
                                                  p.description
                                                    .toLowerCase()
                                                    .includes(
                                                      partsSearchTerm[
                                                        item.id
                                                      ].toLowerCase(),
                                                    ) ||
                                                  p.category
                                                    .toLowerCase()
                                                    .includes(
                                                      partsSearchTerm[
                                                        item.id
                                                      ].toLowerCase(),
                                                    ),
                                              )
                                            : parts;
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
                                              const searchValue =
                                                partsSearchTerm[item.id] || "";
                                              // Filter parts client-side for instant results while typing
                                              const filteredParts = searchValue
                                                ? parts.filter(
                                                    (p) =>
                                                      p.partNo
                                                        .toLowerCase()
                                                        .includes(
                                                          searchValue.toLowerCase(),
                                                        ) ||
                                                      p.description
                                                        .toLowerCase()
                                                        .includes(
                                                          searchValue.toLowerCase(),
                                                        ) ||
                                                      p.category
                                                        .toLowerCase()
                                                        .includes(
                                                          searchValue.toLowerCase(),
                                                        ),
                                                  )
                                                : parts; // Show all parts when no search term

                                              return filteredParts.length >
                                                0 ? (
                                                <>
                                                  {filteredParts.length >
                                                    100 && (
                                                    <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30">
                                                      Showing{" "}
                                                      {filteredParts.length}{" "}
                                                      parts{" "}
                                                      {searchValue
                                                        ? "matching your search"
                                                        : ""}
                                                    </div>
                                                  )}
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
                                                          {p.partNo}
                                                        </div>
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
                                                    </div>
                                                  ))}
                                                </>
                                              ) : (
                                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                                  {searchValue
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
                                {part && (
                                  <>
                                    <p className="text-xs text-muted-foreground">
                                      Last Sold at: {part.lastSalePrice || 0}
                                    </p>
                                    {part.brands && part.brands.length > 0 && (
                                      <p className="text-xs font-medium text-foreground">
                                        {part.brands
                                          .map((b) => b.name)
                                          .join(", ")}
                                      </p>
                                    )}
                                    {/* Show details automatically when part is selected */}
                                    {part && (
                                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-1">
                                        <p className="font-medium text-foreground">
                                          {part.description ||
                                            "No description available"}
                                        </p>
                                        <p>
                                          <strong>Grade:</strong>{" "}
                                          <Badge
                                            variant="outline"
                                            className={getGradeColor(
                                              part.grade,
                                            )}
                                          >
                                            {part.grade}
                                          </Badge>
                                        </p>
                                        <p>
                                          <strong>Category:</strong>{" "}
                                          {part.category}
                                        </p>
                                        {part.brands &&
                                          part.brands.length > 0 && (
                                            <p>
                                              <strong>Brands:</strong>{" "}
                                              {part.brands
                                                .map((b) => b.name)
                                                .join(", ")}
                                            </p>
                                          )}
                                        {part.machineModels && (
                                          <p>
                                            <strong>Machines:</strong>{" "}
                                            {part.machineModels
                                              .map(
                                                (m) =>
                                                  `${m.name} (${m.requiredQty})`,
                                              )
                                              .join(", ")}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.selectedPartId ? (
                                <ScrollArea className="h-32">
                                  <div className="space-y-1.5 py-1">
                                    {(() => {
                                      const allLocations =
                                        part?.locations || [];

                                      // Create FLATTENED Rack-Shelf Pairings
                                      const flatLocations = [];
                                      const locMap = new Map();
                                      allLocations.forEach((loc) => {
                                        const key = `${loc.rackId || "none"}-${loc.shelfNo || "none"}`;
                                        if (!locMap.has(key)) {
                                          const entry = {
                                            id: key,
                                            rackCode: loc.rackCode || "No Rack",
                                            shelfNo: loc.shelfNo || "No Shelf",
                                            ids: [loc.id],
                                            quantity: loc.quantity,
                                          };
                                          locMap.set(key, entry);
                                          flatLocations.push(entry);
                                        } else {
                                          const entry = locMap.get(key);
                                          entry.ids.push(loc.id);
                                          entry.quantity += loc.quantity;
                                        }
                                      });

                                      if (flatLocations.length === 0) {
                                        return (
                                          <div className="text-[10px] text-muted-foreground italic h-6 flex items-center">
                                            No Rack
                                          </div>
                                        );
                                      }

                                      return flatLocations.map((loc) => {
                                        const isChecked = loc.ids.every((id) =>
                                          (
                                            item.selectedLocationIds || []
                                          ).includes(id),
                                        );

                                        return (
                                          <div
                                            key={loc.id}
                                            className="flex items-center space-x-2 px-1 h-6 hover:bg-accent/50 rounded cursor-pointer transition-colors"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              const currentIds = [
                                                ...(item.selectedLocationIds ||
                                                  []),
                                              ];
                                              let nextIds: string[];
                                              if (isChecked) {
                                                nextIds = currentIds.filter(
                                                  (id) => !loc.ids.includes(id),
                                                );
                                              } else {
                                                nextIds = currentIds;
                                                loc.ids.forEach((id) => {
                                                  if (!nextIds.includes(id))
                                                    nextIds.push(id);
                                                });
                                              }
                                              handleUpdateInlineItem(
                                                item.id,
                                                "selectedLocationIds",
                                                nextIds,
                                              );
                                              handleUpdateInlineItem(
                                                item.id,
                                                "selectedLocationId",
                                                nextIds[0] || "",
                                              );
                                            }}
                                          >
                                            <Checkbox
                                              checked={isChecked}
                                              className="h-3.5 w-3.5"
                                            />
                                            <span className="text-[10px] font-medium truncate">
                                              {loc.rackCode}
                                            </span>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                </ScrollArea>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell>
                              {item.selectedPartId ? (
                                <ScrollArea className="h-32">
                                  <div className="space-y-1.5 py-1">
                                    {(() => {
                                      const allLocations =
                                        part?.locations || [];

                                      // Same Flattened logic for synchronization
                                      const flatLocations = [];
                                      const locMap = new Map();
                                      allLocations.forEach((loc) => {
                                        const key = `${loc.rackId || "none"}-${loc.shelfNo || "none"}`;
                                        if (!locMap.has(key)) {
                                          const entry = {
                                            id: key,
                                            rackCode: loc.rackCode || "No Rack",
                                            shelfNo: loc.shelfNo || "No Shelf",
                                            ids: [loc.id],
                                            quantity: loc.quantity,
                                          };
                                          locMap.set(key, entry);
                                          flatLocations.push(entry);
                                        } else {
                                          const entry = locMap.get(key);
                                          entry.ids.push(loc.id);
                                          entry.quantity += loc.quantity;
                                        }
                                      });

                                      if (flatLocations.length === 0) {
                                        return (
                                          <div className="text-[10px] text-muted-foreground italic h-6 flex items-center">
                                            No Shelf
                                          </div>
                                        );
                                      }

                                      return flatLocations.map((loc) => {
                                        const isChecked = loc.ids.every((id) =>
                                          (
                                            item.selectedLocationIds || []
                                          ).includes(id),
                                        );

                                        return (
                                          <div
                                            key={loc.id}
                                            className="flex items-center space-x-2 px-1 h-6 hover:bg-accent/50 rounded cursor-pointer transition-colors"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              const currentIds = [
                                                ...(item.selectedLocationIds ||
                                                  []),
                                              ];
                                              let nextIds: string[];
                                              if (isChecked) {
                                                nextIds = currentIds.filter(
                                                  (id) => !loc.ids.includes(id),
                                                );
                                              } else {
                                                nextIds = currentIds;
                                                loc.ids.forEach((id) => {
                                                  if (!nextIds.includes(id))
                                                    nextIds.push(id);
                                                });
                                              }
                                              handleUpdateInlineItem(
                                                item.id,
                                                "selectedLocationIds",
                                                nextIds,
                                              );
                                              handleUpdateInlineItem(
                                                item.id,
                                                "selectedLocationId",
                                                nextIds[0] || "",
                                              );
                                            }}
                                          >
                                            <Checkbox
                                              checked={isChecked}
                                              className="h-3.5 w-3.5"
                                            />
                                            <Label className="flex-1 text-[10px] cursor-pointer flex justify-between items-center gap-1 font-normal">
                                              <span className="truncate">
                                                {loc.shelfNo}
                                              </span>
                                              <span className="font-bold text-primary shrink-0">
                                                {loc.quantity}
                                              </span>
                                            </Label>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                </ScrollArea>
                              ) : (
                                "-"
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              <div>
                                {(() => {
                                  const stockBalance = part?.id
                                    ? partStockBalances[part.id]
                                    : null;
                                  const currentStock =
                                    stockBalance?.available_stock ??
                                    (part?.availableQty || 0);
                                  const avgCost =
                                    stockBalance?.avg_cost ??
                                    (part?.price || 0);
                                  const isLoading = part?.id
                                    ? loadingStock[part.id]
                                    : false;

                                  return (
                                    <>
                                      <div className="flex items-center justify-center gap-2">
                                        <p className="font-medium">
                                          {isLoading ? "..." : currentStock}
                                        </p>
                                        {part?.id && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4"
                                            onClick={() =>
                                              navigate("/inventory")
                                            }
                                            title="View Stock Details"
                                          >
                                            <Package className="w-3 h-3" />
                                          </Button>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Avg Cost: {avgCost.toFixed(2)}
                                      </p>
                                    </>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div>
                                {(() => {
                                  const stockBalance = part?.id
                                    ? partStockBalances[part.id]
                                    : null;
                                  const reservedStock =
                                    stockBalance?.reserved_stock ??
                                    (part?.reservedQty || 0);
                                  const isLoading = part?.id
                                    ? loadingStock[part.id]
                                    : false;

                                  return (
                                    <div className="flex items-center justify-center gap-2">
                                      <p className="font-medium text-orange-500">
                                        {isLoading ? "..." : reservedStock}
                                      </p>
                                    </div>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                value={item.qty || ""}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const stockBalance = part?.id
                                    ? partStockBalances[part.id]
                                    : null;
                                  const currentStock =
                                    stockBalance?.available_stock ??
                                    (part?.availableQty || 0);

                                  if (val > currentStock && currentStock >= 0) {
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
                                  } else {
                                    handleUpdateInlineItem(item.id, "qty", val);
                                  }
                                }}
                                className="w-20 text-center mx-auto"
                                placeholder="0"
                              />
                              {item.qty === 0 && item.selectedPartId && (
                                <p className="text-destructive text-xs text-center mt-1">
                                  Required
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                const priceAValue =
                                  item.priceA !== undefined
                                    ? item.priceA
                                    : part?.priceA || 0;
                                const isSelected =
                                  item.selectedPriceType === "A";
                                return priceAValue > 0 ? (
                                  <Button
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={() => {
                                      handleUpdateInlineItem(
                                        item.id,
                                        "selectedPriceType",
                                        "A",
                                      );
                                    }}
                                  >
                                    {priceAValue.toFixed(2)}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    -
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                const priceBValue =
                                  item.priceB !== undefined
                                    ? item.priceB
                                    : part?.priceB || 0;
                                const isSelected =
                                  item.selectedPriceType === "B";
                                return priceBValue > 0 ? (
                                  <Button
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={() => {
                                      handleUpdateInlineItem(
                                        item.id,
                                        "selectedPriceType",
                                        "B",
                                      );
                                    }}
                                  >
                                    {priceBValue.toFixed(2)}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    -
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                const priceMValue =
                                  item.priceM !== undefined
                                    ? item.priceM
                                    : part?.priceM || 0;
                                const isSelected =
                                  item.selectedPriceType === "M";
                                return priceMValue > 0 ? (
                                  <Button
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={() => {
                                      handleUpdateInlineItem(
                                        item.id,
                                        "selectedPriceType",
                                        "M",
                                      );
                                    }}
                                  >
                                    {priceMValue.toFixed(2)}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    -
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {calculateLineTotal(item).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    handleRemoveInlineItem(item.id)
                                  }
                                >
                                  <X className="w-4 h-4" />
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
                            {account.type && account.type !== "General"
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
                            {account.type && account.type !== "General"
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
                <div className="flex justify-between text-destructive">
                  <span>Discount:</span>
                  <span>-Rs {discount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">After Discount:</span>
                  <span className="font-bold">
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

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={resetForm}
                title="Discard this draft and return to invoice list"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button onClick={handleSaveInvoice}>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-center">Delivery</TableHead>
                      <TableHead className="text-center">Payment</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.invoiceNo}
                        </TableCell>
                        <TableCell>{inv.invoiceDate}</TableCell>
                        <TableCell>{inv.customerName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {inv.customerType === "walking"
                              ? "Cash Sale"
                              : "Party Sale"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          Rs {inv.grandTotal.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          Rs {inv.paidAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(inv.status)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getPaymentBadge(inv.paymentStatus)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* View */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setShowViewInvoice(true);
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                toast({
                                  title: "Printing",
                                  description: `Printing invoice ${inv.invoiceNo}`,
                                });
                              }}
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
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
                            {/* Status dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                >
                                  <Info className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* Pending ↔ On Hold — only before approved */}
                                {inv.status === "on_hold" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleUpdateStatus(inv, "pending")
                                    }
                                    className="text-blue-600"
                                  >
                                    <Circle className="w-4 h-4 mr-2" />
                                    Back to Pending
                                  </DropdownMenuItem>
                                )}
                                {inv.status === "pending" && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await apiClient.updateInvoiceStatus(
                                          inv.id,
                                          "on_hold",
                                          undefined,
                                          "Admin",
                                        );
                                        await apiClient.holdInvoice(inv.id, {
                                          holdReason: "",
                                        });
                                        toast({
                                          title: "Invoice On Hold",
                                          description: `Invoice ${inv.invoiceNo} is now on hold. All stock moved out.`,
                                        });
                                        const response =
                                          await apiClient.getSalesInvoices();
                                        const invoicesData: any = Array.isArray(
                                          response,
                                        )
                                          ? response
                                          : (response as any).data || [];
                                        setInvoices(
                                          invoicesData.map((i: any) => ({
                                            id: i.id,
                                            invoiceNo: i.invoiceNo,
                                            invoiceDate: i.invoiceDate,
                                            customerType:
                                              i.customerType as CustomerType,
                                            customerId: i.customerId,
                                            customerName: i.customerName,
                                            salesPerson:
                                              i.salesPerson || "Admin",
                                            items:
                                              i.SalesInvoiceItem?.map(
                                                (item: any) => ({
                                                  id: item.id,
                                                  partId: item.partId,
                                                  partNo: item.partNo,
                                                  description:
                                                    item.description || "",
                                                  orderedQty: item.orderedQty,
                                                  deliveredQty:
                                                    item.deliveredQty,
                                                  pendingQty: item.pendingQty,
                                                  unitPrice: item.unitPrice,
                                                  discount: item.discount || 0,
                                                  discountType:
                                                    "percent" as const,
                                                  lineTotal: item.lineTotal,
                                                  grade: (item.grade ||
                                                    "A") as ItemGrade,
                                                  brand: item.brand,
                                                  useUnlocatedStock:
                                                    item.useUnlocatedStock,
                                                }),
                                              ) || [],
                                            subtotal: i.subtotal,
                                            overallDiscount:
                                              i.overallDiscount || 0,
                                            overallDiscountType:
                                              "fixed" as const,
                                            tax: i.tax || 0,
                                            grandTotal: i.grandTotal,
                                            paidAmount: i.paidAmount || 0,
                                            status: i.status as InvoiceStatus,
                                            paymentStatus:
                                              i.status === "paid"
                                                ? "paid"
                                                : i.paidAmount > 0
                                                  ? "partial"
                                                  : "unpaid",
                                            accountId: i.accountId,
                                            deliveryLog: [],
                                            createdAt: i.createdAt,
                                            updatedAt: i.updatedAt,
                                          })),
                                        );
                                      } catch (err: any) {
                                        toast({
                                          title: "Error",
                                          description:
                                            err.message ||
                                            "Failed to put invoice on hold",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className="text-yellow-600"
                                  >
                                    <Clock className="w-4 h-4 mr-2" />
                                    Place On Hold
                                  </DropdownMenuItem>
                                )}
                                {inv.status !== "delivered" && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      // Fetch full invoice with items
                                      try {
                                        const full =
                                          (await apiClient.getSalesInvoice(
                                            inv.id,
                                          )) as any;
                                        const items = (
                                          full.SalesInvoiceItem || []
                                        ).map((item: any) => {
                                          const part = item.Part || {};
                                          const stockLocations = (
                                            part.PartRackShelf || []
                                          ).map((prs: any) => ({
                                            rackCode: prs.Rack?.codeNo,
                                            shelfNo: prs.Shelf?.shelfNo,
                                            quantity: prs.quantity,
                                          }));

                                          // Calculate total stock from PartRackShelf entries
                                          const totalStock =
                                            stockLocations.reduce(
                                              (sum: number, loc: any) =>
                                                sum + loc.quantity,
                                              0,
                                            );

                                          return {
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
                                            grade: (item.grade || "A") as any,
                                            brand: item.brand,
                                            stockLocations,
                                            totalStock,
                                          };
                                        });
                                        setSelectedInvoice({ ...inv, items });
                                      } catch {
                                        setSelectedInvoice(inv);
                                      }
                                      setShowPartialDeliveryDialog(true);
                                    }}
                                    className="text-orange-600"
                                  >
                                    <Package className="w-4 h-4 mr-2" />
                                    Partially Delivered
                                  </DropdownMenuItem>
                                )}
                                {/* Delivered — only after approved or pending */}
                                {inv.status !== "delivered" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleUpdateStatus(inv, "delivered")
                                    }
                                    className="text-green-600"
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Mark as Delivered
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={9}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                  <p className="font-medium">{selectedInvoice.invoiceDate}</p>
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
                      <TableHead className="text-center">Ordered</TableHead>
                      <TableHead className="text-center">Delivered</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Avg Cost</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.partNo}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.description}
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
                        <TableCell className="text-center">
                          {item.avgCost ? item.avgCost.toFixed(2) : "0.00"}
                        </TableCell>
                        <TableCell className="text-right">
                          Rs {item.lineTotal.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
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
                <Button variant="outline" size="sm">
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delivery Log */}
      {selectedInvoice && (
        <InvoiceDeliveryLog
          open={showDeliveryLog}
          onOpenChange={setShowDeliveryLog}
          invoiceNo={selectedInvoice.invoiceNo}
          items={selectedInvoice.items}
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
                {selectedInvoice.items.map((item) => (
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
                                  <span className="opacity-70">In Stock:</span>
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
                ))}
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
      <Dialog
        open={showAddCustomerDialog}
        onOpenChange={setShowAddCustomerDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name *</Label>
              <Input
                id="customer-name"
                placeholder="Enter customer name"
                value={newCustomerForm.name}
                onChange={(e) =>
                  setNewCustomerForm({
                    ...newCustomerForm,
                    name: e.target.value,
                  })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-contact">Contact No</Label>
                <Input
                  id="customer-contact"
                  placeholder="Contact number"
                  value={newCustomerForm.contactNo}
                  onChange={(e) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      contactNo: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  placeholder="Email address"
                  value={newCustomerForm.email}
                  onChange={(e) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      email: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-cnic">CNIC</Label>
                <Input
                  id="customer-cnic"
                  placeholder="CNIC number"
                  value={newCustomerForm.cnic}
                  onChange={(e) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      cnic: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-status">Status</Label>
                <Select
                  value={newCustomerForm.status}
                  onValueChange={(v) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      status: v as "active" | "inactive",
                    })
                  }
                >
                  <SelectTrigger id="customer-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-price-type">Price Type</Label>
                <Select
                  value={newCustomerForm.priceType || "none"}
                  onValueChange={(v) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      priceType: v === "none" ? "" : (v as "A" | "B" | "M"),
                    })
                  }
                >
                  <SelectTrigger id="customer-price-type">
                    <SelectValue placeholder="Select Price Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="A">Price A (Retail)</SelectItem>
                    <SelectItem value="B">Price B (Wholesale)</SelectItem>
                    <SelectItem value="M">Price M (Market)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-address">Address</Label>
              <Input
                id="customer-address"
                placeholder="Full address"
                value={newCustomerForm.address}
                onChange={(e) =>
                  setNewCustomerForm({
                    ...newCustomerForm,
                    address: e.target.value,
                  })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-opening-balance">
                  Opening Balance
                </Label>
                <Input
                  id="customer-opening-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newCustomerForm.openingBalance}
                  onChange={(e) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      openingBalance: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-date">Date</Label>
                <Input
                  id="customer-date"
                  type="date"
                  value={newCustomerForm.date}
                  onChange={(e) =>
                    setNewCustomerForm({
                      ...newCustomerForm,
                      date: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-credit-limit">Credit Limit</Label>
              <Input
                id="customer-credit-limit"
                type="number"
                placeholder="0"
                value={newCustomerForm.creditLimit}
                onChange={(e) =>
                  setNewCustomerForm({
                    ...newCustomerForm,
                    creditLimit: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddCustomerDialog(false);
                setNewCustomerForm({
                  name: "",
                  address: "",
                  email: "",
                  cnic: "",
                  contactNo: "",
                  openingBalance: 0,
                  date: "",
                  creditLimit: 0,
                  status: "active",
                  priceType: "",
                });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCustomer} disabled={creatingCustomer}>
              {creatingCustomer ? "Creating..." : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
