import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/lib/api";
import { getCustomerTypeLabel } from "@/types/invoice";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Search,
  Eye,
  Trash,
  MoreVertical,
  RotateCcw,
  FileText,
  Printer,
  X,
  CheckCircle2,
  Ban,
  Plus,
  Pencil,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { Textarea } from "@/components/ui/textarea";
import { getUserRole, isAccountantRole } from "@/utils/auth";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";

interface ReturnItem {
  id: string;
  partNo: string;
  itemName: string;
  brand: string;
  model: string;
  uom: string;
  returnQty: number;
  avgCost?: number;
  price: number;
  total: number;
}

interface OriginalInvoiceItem {
  partNo: string;
  description: string;
  brand: string;
  uom: string;
  orderedQty: number;
  deliveredQty: number;
  pendingQty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

interface OriginalInvoiceDetails {
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerType: string;
  salesPerson: string;
  status: string;
  paymentStatus: string;
  remarks: string;
  subtotal: number;
  overallDiscount: number;
  freightCharges: number;
  tax: number;
  taxPercentage: number;
  grandTotal: number;
  paidAmount: number;
  items: OriginalInvoiceItem[];
}

interface SalesReturn {
  id: string;
  salesInvoiceId: string;
  invoiceNo: string;
  returnDate: string;
  customerName: string;
  remarks: string;
  subtotal: number;
  gst: number;
  totalAmount: number;
  discount: number;
  amountAfterDiscount: number;
  saleType: string;
  items: ReturnItem[];
  originalInvoiceNo?: string;
  isDirectReturn?: boolean;
  /** Server status: pending | completed | rejected */
  status?: string;
}

interface DirectPartItem {
  id: string;
  name: string;
  partNo: string;
  masterPartNo: string;
  brand: string;
  priceA: number | null;
  priceB: number | null;
  avgCost: number;
  cost: number;
}

interface DirectReturnLine {
  id: string;
  partId: string;
  returnQty: string;
  unitPrice: string;
  selectedPriceType?: "A" | "B" | "";
  /** Saved line COGS snapshot when editing an existing return */
  unitCostSnapshot?: number;
}

/** Matches backend resolveDirectReturnUnitCost — avg when > 0, else cost. */
const resolveDirectReturnUnitCost = (
  avgCost: number | null | undefined,
  cost: number | null | undefined,
): number => {
  const avg = Number(avgCost);
  if (Number.isFinite(avg) && avg > 0) return avg;
  const c = Number(cost);
  if (Number.isFinite(c) && c > 0) return c;
  return 0;
};

const parseDirectMoneyDraft = (value: string): number => {
  const n = parseFloat(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const inferDirectPriceType = (
  unitPrice: number,
  part?: Pick<DirectPartItem, "priceA" | "priceB">,
): "A" | "B" | "" => {
  if (!part) return "";
  if (part.priceA != null && Math.abs(unitPrice - part.priceA) < 0.01) return "A";
  if (part.priceB != null && Math.abs(unitPrice - part.priceB) < 0.01) return "B";
  return "";
};

const pickDirectLinePrice = (
  part: DirectPartItem,
  customerPriceType: "A" | "B" | null,
): { selectedPriceType: "A" | "B" | ""; unitPrice: string } => {
  if (customerPriceType === "A" && part.priceA != null) {
    return { selectedPriceType: "A", unitPrice: String(part.priceA) };
  }
  if (customerPriceType === "B" && part.priceB != null) {
    return { selectedPriceType: "B", unitPrice: String(part.priceB) };
  }
  if (part.priceA != null) {
    return { selectedPriceType: "A", unitPrice: String(part.priceA) };
  }
  if (part.priceB != null) {
    return { selectedPriceType: "B", unitPrice: String(part.priceB) };
  }
  return { selectedPriceType: "", unitPrice: "" };
};

const formatDisplayDate = (value?: string | Date | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
};

const mapOriginalInvoiceFromApi = (fullInv: any): OriginalInvoiceDetails => {
  const items: OriginalInvoiceItem[] = (fullInv.SalesInvoiceItem || []).map(
    (item: any) => {
      const part = item.Part || {};
      return {
        partNo: String(item.partNo || part.partNo || "").trim() || "—",
        description:
          String(item.description || part.description || "").trim() || "—",
        brand: String(item.brand || part.Brand?.name || "").trim() || "—",
        uom: String(part.uom || "pcs").trim() || "pcs",
        orderedQty: Number(item.orderedQty) || 0,
        deliveredQty: Number(item.deliveredQty) || 0,
        pendingQty: Number(item.pendingQty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        lineTotal: Number(item.lineTotal) || 0,
      };
    },
  );

  return {
    invoiceNo: String(fullInv.invoiceNo || "").trim() || "—",
    invoiceDate: formatDisplayDate(fullInv.invoiceDate),
    customerName: String(fullInv.customerName || "").trim() || "—",
    customerType: getCustomerTypeLabel(fullInv.customerType),
    salesPerson: String(fullInv.salesPerson || "").trim() || "—",
    status: String(fullInv.status || "").trim() || "—",
    paymentStatus: String(fullInv.paymentStatus || "").trim() || "—",
    remarks: String(fullInv.remarks || "").trim() || "—",
    subtotal: Number(fullInv.subtotal) || 0,
    overallDiscount: Number(fullInv.overallDiscount) || 0,
    freightCharges: Number(fullInv.freightCharges) || 0,
    tax: Number(fullInv.tax) || 0,
    taxPercentage: Number(fullInv.taxPercentage) || 0,
    grandTotal: Number(fullInv.grandTotal) || 0,
    paidAmount: Number(fullInv.paidAmount) || 0,
    items,
  };
};

/** Map Prisma/API sales return row to list UI model */
function mapApiSalesReturn(row: any): SalesReturn {
  const inv = row.SalesInvoice || {};
  const items: ReturnItem[] = (row.SalesReturnItem || []).map((it: any) => {
    const p = it.Part || {};
    const uom = String(p.uom || "pcs").trim() || "pcs";
    return {
      id: String(it.id),
      partNo: String(p.partNo || "").trim(),
      itemName: String(p.description || "").trim() || "—",
      brand: "",
      model: "",
      uom,
      returnQty: Number(it.returnQuantity) || 0,
      avgCost: Number(it.avgCost) || 0,
      price: Number(it.originalSalePrice) || 0,
      total: Number(it.amount) || 0,
    };
  });

  const subtotal = Number(row.subtotal) || 0;
  const tax = Number(row.tax) || 0;
  const deduction = Number(row.deduction) || 0;
  const net = Number(row.totalAmount) || 0;
  const grossBeforeDeduction = Math.round((subtotal + tax) * 100) / 100;

  let returnDate = "";
  if (row.returnDate) {
    try {
      returnDate = new Date(row.returnDate).toLocaleDateString();
    } catch {
      returnDate = String(row.returnDate);
    }
  }

  const isDirectReturn = Boolean(row.isDirectReturn);
  const saleType = isDirectReturn
    ? row.customerType === "registered"
      ? "Party (direct)"
      : "Walk-in (direct)"
    : inv.customerType === "walking"
      ? "Walk-in"
      : "Sale";

  const customerName = isDirectReturn
    ? String(
        row.legacyCustomerName || row.Customer?.name || "",
      ).trim() || "—"
    : String(inv.customerName || "").trim() || "—";

  return {
    id: String(row.id),
    salesInvoiceId: String(row.salesInvoiceId || "").trim(),
    invoiceNo: String(row.returnNumber || "").trim() || String(row.id),
    returnDate,
    customerName,
    remarks: row.reason != null && String(row.reason).trim() !== ""
      ? String(row.reason)
      : "—",
    subtotal,
    gst: tax,
    totalAmount: grossBeforeDeduction,
    discount: deduction,
    amountAfterDiscount: net,
    saleType,
    items,
    originalInvoiceNo: isDirectReturn
      ? row.legacyInvoiceNo
        ? String(row.legacyInvoiceNo)
        : undefined
      : inv.invoiceNo
        ? String(inv.invoiceNo)
        : undefined,
    isDirectReturn,
    status: row.status != null ? String(row.status) : undefined,
  };
}

const RETURN_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];

export const SalesReturns = () => {
  const isAccountant = isAccountantRole();
  const canMutateReturns = !isAccountant;
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [selectedReturns, setSelectedReturns] = useState<string[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [availableItems, setAvailableItems] = useState<DirectPartItem[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<{ id: string; name: string }[]>([]);

  // Filter states
  const [filterItem, setFilterItem] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [customerNameSearch, setCustomerNameSearch] = useState("");

  // Dialog states
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isOriginalInvoiceOpen, setIsOriginalInvoiceOpen] = useState(false);
  const [originalInvoice, setOriginalInvoice] =
    useState<OriginalInvoiceDetails | null>(null);
  const [loadingOriginalInvoice, setLoadingOriginalInvoice] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);
  const [returnToDelete, setReturnToDelete] = useState<SalesReturn | null>(null);
  const [returnToApprove, setReturnToApprove] = useState<SalesReturn | null>(null);
  const [returnToReject, setReturnToReject] = useState<SalesReturn | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [actionSubmittingId, setActionSubmittingId] = useState<string | null>(
    null,
  );

  const [isDirectReturnOpen, setIsDirectReturnOpen] = useState(false);
  const [editingDirectReturnId, setEditingDirectReturnId] = useState<
    string | null
  >(null);
  const [editingDirectReturnNo, setEditingDirectReturnNo] = useState("");
  const [loadingDirectReturnEdit, setLoadingDirectReturnEdit] = useState(false);
  const [submittingDirectReturn, setSubmittingDirectReturn] = useState(false);
  const [directLegacyInvoiceNo, setDirectLegacyInvoiceNo] = useState("");
  const [directReturnDate, setDirectReturnDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [directCustomerType, setDirectCustomerType] = useState<
    "walking" | "registered"
  >("walking");
  const [directCustomerId, setDirectCustomerId] = useState("");
  const [directCustomerName, setDirectCustomerName] = useState("");
  const [directTaxPct, setDirectTaxPct] = useState("0");
  const [directReason, setDirectReason] = useState("");
  const [directPaymentAccountId, setDirectPaymentAccountId] = useState("");
  const [directDeductionDraft, setDirectDeductionDraft] = useState("");
  const [directRefundPaidDraft, setDirectRefundPaidDraft] = useState("");
  const [directRefundPaidTouched, setDirectRefundPaidTouched] = useState(false);
  const [directLines, setDirectLines] = useState<DirectReturnLine[]>([
    { id: "1", partId: "", returnQty: "", unitPrice: "", selectedPriceType: "" },
  ]);
  const [directCustomerPriceType, setDirectCustomerPriceType] = useState<
    "A" | "B" | null
  >(null);
  const [directCustomers, setDirectCustomers] = useState<
    { id: string; name: string; priceType: "A" | "B" | "M" | null }[]
  >([]);
  const [customerOptions, setCustomerOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [refundAccountOptions, setRefundAccountOptions] = useState<
    { value: string; label: string }[]
  >([]);

  // Simple pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const approverLabel = () => {
    const role = getUserRole();
    return role ? `Role: ${role}` : "Web user";
  };

  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const res = (await apiClient.getSalesReturns({
        page: 1,
        limit: 2000,
      })) as { data?: unknown[]; error?: string };

      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }

      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : [];
      setReturns(list.map(mapApiSalesReturn));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load sales returns",
        variant: "destructive",
      });
      setReturns([]);
    } finally {
      setLoadingReturns(false);
    }
  }, []);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  // Fetch parts/items from database for filters
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await apiClient.getParts({
          status: 'active',
          limit: 1000,
          page: 1
        });

        if (response.error) {
          return;
        }

        let partsDataArray: any[] = [];
        if (Array.isArray(response)) {
          partsDataArray = response;
        } else if (response.data && Array.isArray(response.data)) {
          partsDataArray = response.data;
        } else if (response.pagination && response.data) {
          partsDataArray = response.data as any[];
        }

        const transformedItems: DirectPartItem[] = partsDataArray
          .filter((p: any) => p.status === 'active' || !p.status)
          .map((p: any) => {
            const priceARaw = p.price_a ?? p.priceA;
            const priceBRaw = p.price_b ?? p.priceB;
            const priceA =
              priceARaw != null && priceARaw !== ""
                ? Number(priceARaw)
                : null;
            const priceB =
              priceBRaw != null && priceBRaw !== ""
                ? Number(priceBRaw)
                : null;
            const avgCost = Number(p.avg_cost ?? p.avgCost) || 0;
            const cost = Number(p.cost) || 0;
            return {
              id: p.id,
              name: String(p.description || p.part_no || '').trim() || 'No description',
              partNo: String(p.part_no || p.partNo || '').trim(),
              masterPartNo: String(
                p.master_part_no || p.masterPartNo || '',
              ).trim(),
              brand: String(p.brand_name || p.brand || '').trim(),
              priceA: Number.isFinite(priceA) ? priceA : null,
              priceB: Number.isFinite(priceB) ? priceB : null,
              avgCost,
              cost,
            };
          })
          .filter((item) => item.partNo && item.partNo.trim() !== '');

        setAvailableItems(transformedItems);
      } catch (error: unknown) {
        console.error("Failed to load parts for filters:", error);
      }
    };

    fetchItems();
  }, []);

  useEffect(() => {
    if (!isDirectReturnOpen) return;
    void (async () => {
      try {
        const [custRes, accRes] = await Promise.all([
          apiClient.getCustomers({ limit: 2000, page: 1 }),
          apiClient.getAccounts({ status: "Active" }),
        ]);
        const custRaw = Array.isArray(custRes)
          ? custRes
          : (custRes as { data?: unknown[] })?.data || [];
        const customers = (custRaw as any[])
          .map((c) => {
            const pt = c.priceType || c.price_type || null;
            const priceType =
              pt === "A" || pt === "B" || pt === "M" ? pt : null;
            return {
              id: String(c.id),
              name: String(c.name || c.companyName || "").trim(),
              priceType,
            };
          })
          .filter((c) => c.name);
        setDirectCustomers(customers);
        setCustomerOptions(
          customers.map((c) => ({
            value: c.id,
            label: c.priceType ? `${c.name} (Price ${c.priceType})` : c.name,
          })),
        );
        const accRaw = Array.isArray(accRes)
          ? accRes
          : (accRes as { data?: unknown[] })?.data || [];
        setRefundAccountOptions(
          (accRaw as any[])
            .filter((acc) => {
              const sg = String(acc.Subgroup?.code || "").trim();
              return sg.startsWith("102") || sg.startsWith("103");
            })
            .map((acc) => ({
              value: String(acc.id),
              label: `${acc.code ? `${acc.code} — ` : ""}${acc.name || ""}`,
            })),
        );
      } catch {
        setDirectCustomers([]);
        setCustomerOptions([]);
        setRefundAccountOptions([]);
      }
    })();
  }, [isDirectReturnOpen]);

  const directPartOptions = useMemo(
    () =>
      availableItems.map((item) => ({
        value: item.id,
        label: `${item.masterPartNo || "—"} | ${item.partNo}`,
        description: item.name,
        listOnlyDescription: item.brand || undefined,
      })),
    [availableItems],
  );

  const directReturnTotals = useMemo(() => {
    let subtotal = 0;
    for (const line of directLines) {
      const qty = parseInt(line.returnQty, 10) || 0;
      const price = parseFloat(line.unitPrice) || 0;
      if (qty > 0 && price >= 0) subtotal += qty * price;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const taxPct = parseFloat(directTaxPct) || 0;
    const tax =
      taxPct > 0
        ? Math.round(subtotal * (taxPct / 100) * 100) / 100
        : 0;
    const grossAfterTax = Math.round((subtotal + tax) * 100) / 100;
    const maxDeduction = grossAfterTax;
    let deduction = parseDirectMoneyDraft(directDeductionDraft);
    if (deduction > maxDeduction) deduction = maxDeduction;
    if (deduction < 0) deduction = 0;
    deduction = Math.round(deduction * 100) / 100;
    const net = Math.round((grossAfterTax - deduction) * 100) / 100;
    return { subtotal, tax, grossAfterTax, deduction, maxDeduction, net };
  }, [directLines, directTaxPct, directDeductionDraft]);

  useEffect(() => {
    if (!isDirectReturnOpen || directCustomerType !== "walking") return;
    if (directRefundPaidTouched) return;
    const net = directReturnTotals.net;
    setDirectRefundPaidDraft(net > 0 ? String(net) : "");
  }, [
    isDirectReturnOpen,
    directCustomerType,
    directReturnTotals.net,
    directRefundPaidTouched,
  ]);

  useEffect(() => {
    if (!isDirectReturnOpen || !editingDirectReturnId) return;
    if (directCustomerType === "registered" && directCustomerId) {
      const customer = directCustomers.find((c) => c.id === directCustomerId);
      if (customer?.priceType === "A" || customer?.priceType === "B") {
        setDirectCustomerPriceType(customer.priceType);
      }
    }
    if (!availableItems.length) return;
    setDirectLines((prev) =>
      prev.map((line) => {
        if (!line.partId || line.selectedPriceType) return line;
        const part = availableItems.find((p) => p.id === line.partId);
        const unitPrice = parseFloat(line.unitPrice) || 0;
        const selectedPriceType = inferDirectPriceType(unitPrice, part);
        return selectedPriceType ? { ...line, selectedPriceType } : line;
      }),
    );
  }, [
    isDirectReturnOpen,
    editingDirectReturnId,
    availableItems,
    directCustomers,
    directCustomerId,
    directCustomerType,
  ]);

  const applyDirectCustomerPriceType = (customerId: string) => {
    const customer = directCustomers.find((c) => c.id === customerId);
    const pt =
      customer?.priceType === "A" || customer?.priceType === "B"
        ? customer.priceType
        : null;
    setDirectCustomerPriceType(pt);
    if (!pt) return;
    setDirectLines((prev) =>
      prev.map((row) => {
        if (!row.partId) return row;
        const part = availableItems.find((p) => p.id === row.partId);
        if (!part) return { ...row, selectedPriceType: pt };
        const picked = pickDirectLinePrice(part, pt);
        return { ...row, ...picked };
      }),
    );
  };

  const handleDirectLinePartChange = (lineId: string, partId: string) => {
    const part = availableItems.find((p) => p.id === partId);
    setDirectLines((prev) =>
      prev.map((row) => {
        if (row.id !== lineId) return row;
        if (!part) {
          return {
            ...row,
            partId,
            unitPrice: "",
            selectedPriceType: "",
          };
        }
        const picked = pickDirectLinePrice(part, directCustomerPriceType);
        return { ...row, partId, ...picked };
      }),
    );
  };

  const resetDirectReturnForm = () => {
    setEditingDirectReturnId(null);
    setEditingDirectReturnNo("");
    setDirectCustomerPriceType(null);
    setDirectLegacyInvoiceNo("");
    setDirectReturnDate(new Date().toISOString().split("T")[0]);
    setDirectCustomerType("walking");
    setDirectCustomerId("");
    setDirectCustomerName("");
    setDirectTaxPct("0");
    setDirectReason("");
    setDirectPaymentAccountId("");
    setDirectDeductionDraft("");
    setDirectRefundPaidDraft("");
    setDirectRefundPaidTouched(false);
    setDirectLines([
      { id: "1", partId: "", returnQty: "", unitPrice: "", selectedPriceType: "" },
    ]);
  };

  const populateDirectReturnFormFromApi = (row: Record<string, unknown>) => {
    setDirectLegacyInvoiceNo(String(row.legacyInvoiceNo || ""));
    if (row.returnDate) {
      try {
        setDirectReturnDate(
          new Date(String(row.returnDate)).toISOString().split("T")[0],
        );
      } catch {
        setDirectReturnDate(new Date().toISOString().split("T")[0]);
      }
    }
    const ct = row.customerType === "registered" ? "registered" : "walking";
    setDirectCustomerType(ct);
    const customerId = String(row.customerId || "");
    setDirectCustomerId(customerId);
    if (ct === "registered" && customerId) {
      const customer = directCustomers.find((c) => c.id === customerId);
      setDirectCustomerPriceType(
        customer?.priceType === "A" || customer?.priceType === "B"
          ? customer.priceType
          : null,
      );
    } else {
      setDirectCustomerPriceType(null);
    }
    const customer = row.Customer as { name?: string } | undefined;
    setDirectCustomerName(
      String(row.legacyCustomerName || customer?.name || ""),
    );
    setDirectTaxPct(String(row.taxPercentage ?? 0));
    const reason =
      row.reason != null && String(row.reason).trim()
        ? String(row.reason)
        : "";
    setDirectReason(reason);
    setDirectPaymentAccountId(String(row.paymentAccountId || ""));
    const ded = Number(row.deduction) || 0;
    setDirectDeductionDraft(ded > 0 ? String(ded) : "");
    const paid = Number(row.paidAmount) || 0;
    setDirectRefundPaidDraft(paid > 0 ? String(paid) : "");
    setDirectRefundPaidTouched(paid > 0);
    const items = Array.isArray(row.SalesReturnItem) ? row.SalesReturnItem : [];
    const lines: DirectReturnLine[] = items.map(
      (it: Record<string, unknown>, idx: number) => {
        const partId = String(it.partId || "");
        const unitPrice = Number(it.originalSalePrice) || 0;
        const part = availableItems.find((p) => p.id === partId);
        return {
          id: String(it.id || idx + 1),
          partId,
          returnQty: String(it.returnQuantity ?? ""),
          unitPrice: String(it.originalSalePrice ?? ""),
          selectedPriceType: inferDirectPriceType(unitPrice, part),
          unitCostSnapshot: Number(it.avgCost) || 0,
        };
      },
    );
    setDirectLines(
      lines.length > 0
        ? lines
        : [
            {
              id: "1",
              partId: "",
              returnQty: "",
              unitPrice: "",
              selectedPriceType: "",
            },
          ],
    );
  };

  const handleEditDirectReturn = async (returnItem: SalesReturn) => {
    if (!returnItem.isDirectReturn || returnItem.status !== "pending") return;
    setLoadingDirectReturnEdit(true);
    try {
      const row = (await apiClient.getSalesReturn(returnItem.id)) as Record<
        string,
        unknown
      > & { error?: string };
      if (row?.error) throw new Error(row.error);
      resetDirectReturnForm();
      populateDirectReturnFormFromApi(row);
      setEditingDirectReturnId(returnItem.id);
      setEditingDirectReturnNo(
        String(row.returnNumber || returnItem.invoiceNo || ""),
      );
      setIsDirectReturnOpen(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to load direct return";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingDirectReturnEdit(false);
    }
  };

  const handleSubmitDirectReturn = async () => {
    const legacyNo = directLegacyInvoiceNo.trim();
    if (!legacyNo) {
      toast({
        title: "Legacy invoice required",
        description: "Enter the original invoice number from the old system.",
        variant: "destructive",
      });
      return;
    }
    if (directCustomerType === "walking" && !directCustomerName.trim()) {
      toast({
        title: "Customer name required",
        description: "Enter the customer name for this walk-in return.",
        variant: "destructive",
      });
      return;
    }
    if (directCustomerType === "registered" && !directCustomerId) {
      toast({
        title: "Customer required",
        description: "Select the registered customer for this return.",
        variant: "destructive",
      });
      return;
    }

    const items: {
      part_id: string;
      return_quantity: number;
      unit_price: number;
    }[] = [];
    for (const line of directLines) {
      const qty = parseInt(line.returnQty, 10) || 0;
      const price = parseFloat(line.unitPrice);
      if (!line.partId || qty <= 0) continue;
      if (!Number.isFinite(price) || price < 0) {
        toast({
          title: "Invalid price",
          description: "Each line needs a valid unit price.",
          variant: "destructive",
        });
        return;
      }
      items.push({
        part_id: line.partId,
        return_quantity: qty,
        unit_price: price,
      });
    }
    if (items.length === 0) {
      toast({
        title: "No items",
        description: "Add at least one item with return quantity.",
        variant: "destructive",
      });
      return;
    }

    const net = directReturnTotals.net;
    const deduction = directReturnTotals.deduction;
    const isWalking = directCustomerType === "walking";
    let refundPaid = 0;
    if (isWalking) {
      if (net > 0) {
        if (!directPaymentAccountId) {
          toast({
            title: "Refund account required",
            description:
              "Select cash or bank account to refund the walk-in customer.",
            variant: "destructive",
          });
          return;
        }
        refundPaid = net;
      }
    } else {
      refundPaid = parseDirectMoneyDraft(directRefundPaidDraft);
      refundPaid = Math.max(0, Math.min(refundPaid, net));
      if (refundPaid > 0 && !directPaymentAccountId) {
        toast({
          title: "Payment account required",
          description:
            "Select cash or bank account when entering an amount to pay the customer.",
          variant: "destructive",
        });
        return;
      }
      if (refundPaid <= 0 && directPaymentAccountId) {
        toast({
          title: "Amount required",
          description:
            "Enter the amount to pay the customer or clear the payment account.",
          variant: "destructive",
        });
        return;
      }
    }

    setSubmittingDirectReturn(true);
    try {
      const payload: Parameters<typeof apiClient.createDirectSalesReturn>[0] = {
        legacy_invoice_no: legacyNo,
        return_date: directReturnDate,
        reason: directReason.trim() || undefined,
        customer_type: directCustomerType,
        customer_id:
          directCustomerType === "registered" ? directCustomerId : undefined,
        legacy_customer_name:
          directCustomerType === "walking"
            ? directCustomerName.trim()
            : directCustomerName.trim() || undefined,
        tax_percentage: parseFloat(directTaxPct) || 0,
        items,
      };
      if (deduction > 0) payload.deduction = deduction;
      if (refundPaid > 0 && directPaymentAccountId) {
        payload.paid_amount = refundPaid;
        payload.payment_account_id = directPaymentAccountId;
      }

      const res = editingDirectReturnId
        ? ((await apiClient.updateDirectSalesReturn(
            editingDirectReturnId,
            payload,
          )) as { error?: string; message?: string })
        : ((await apiClient.createDirectSalesReturn(
            payload,
          )) as { error?: string; message?: string });

      if (res?.error) throw new Error(res.error);

      toast({
        title: editingDirectReturnId
          ? "Direct return updated"
          : "Direct return created",
        description:
          res?.message ||
          (editingDirectReturnId
            ? "Changes saved. Approve when ready to post stock and accounts."
            : "Return saved as pending. Approve it from this list to post stock and accounts."),
      });
      setIsDirectReturnOpen(false);
      resetDirectReturnForm();
      await loadReturns();
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.message ||
          (editingDirectReturnId
            ? "Failed to update direct return"
            : "Failed to create direct return"),
        variant: "destructive",
      });
    } finally {
      setSubmittingDirectReturn(false);
    }
  };

  // Extract unique customers from returns for filter dropdown
  useEffect(() => {
    const uniqueCustomers = Array.from(
      new Set(returns.map(r => r.customerName))
    ).map((name, index) => ({
      id: String(index + 1),
      name: name,
    }));
    setAvailableCustomers(uniqueCustomers);
  }, [returns]);

  const itemFilterOptions = useMemo(
    () => [
      { value: "all", label: "All Items" },
      ...availableItems.map((item) => ({
        value: item.partNo,
        label: item.partNo,
        description: item.name,
      })),
    ],
    [availableItems],
  );

  const filteredReturns = returns.filter((item) => {
    const matchesItem =
      !filterItem ||
      filterItem === "all" ||
      item.items.some(
        (i) =>
          i.partNo === filterItem ||
          i.itemName.toLowerCase().includes(filterItem.toLowerCase()),
      );
    const matchesCustomer =
      !filterCustomer ||
      filterCustomer === "all" ||
      item.customerName === filterCustomer;
    const searchText = customerNameSearch.trim().toLowerCase();
    const matchesCustomerName =
      !searchText ||
      item.customerName.toLowerCase().includes(searchText) ||
      item.invoiceNo.toLowerCase().includes(searchText) ||
      (item.originalInvoiceNo?.toLowerCase().includes(searchText) ?? false);
    return matchesItem && matchesCustomer && matchesCustomerName;
  });

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage) || 1;
  const paginatedReturns = filteredReturns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReturns(paginatedReturns.map((r) => r.id));
    } else {
      setSelectedReturns([]);
    }
  };

  const handleSelectReturn = (returnId: string, checked: boolean) => {
    if (checked) {
      setSelectedReturns([...selectedReturns, returnId]);
    } else {
      setSelectedReturns(selectedReturns.filter((id) => id !== returnId));
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    const filteredCount = filteredReturns.length;
    toast({
      title: "Search Applied",
      description: `Found ${filteredCount} return${filteredCount !== 1 ? 's' : ''} matching your filters.`,
    });
  };

  const handleViewReturn = (returnItem: SalesReturn) => {
    setSelectedReturn(returnItem);
    setIsViewOpen(true);
  };

  const handleDeleteClick = (returnItem: SalesReturn) => {
    setReturnToDelete(returnItem);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!returnToDelete) {
      setIsDeleteConfirmOpen(false);
      return;
    }

    const id = returnToDelete.id;
    const label = returnToDelete.invoiceNo;

    try {
      const res = (await apiClient.deleteSalesReturn(id)) as {
        error?: string;
        message?: string;
      };
      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }

      setReturns((prev) => prev.filter((r) => r.id !== id));
      setSelectedReturns((prev) => prev.filter((x) => x !== id));
      toast({
        title: "Return Deleted",
        description: `Return ${label} has been deleted successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete return",
        variant: "destructive",
      });
    } finally {
      setReturnToDelete(null);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleApproveClick = (returnItem: SalesReturn) => {
    setReturnToApprove(returnItem);
    setIsApproveConfirmOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!returnToApprove) {
      setIsApproveConfirmOpen(false);
      return;
    }
    const id = returnToApprove.id;
    const label = returnToApprove.invoiceNo;
    setActionSubmittingId(id);
    try {
      const res = (await apiClient.approveSalesReturn(id, {
        approved_by: approverLabel(),
      })) as { error?: string; message?: string };
      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }
      toast({
        title: "Return approved",
        description:
          res?.message ||
          `Return ${label} completed. Stock and vouchers have been posted.`,
      });
      setSelectedReturn((prev) =>
        prev?.id === id ? { ...prev, status: "completed" } : prev,
      );
      await loadReturns();
    } catch (error: any) {
      toast({
        title: "Approve failed",
        description: error?.message || "Could not approve this return.",
        variant: "destructive",
      });
    } finally {
      setActionSubmittingId(null);
      setReturnToApprove(null);
      setIsApproveConfirmOpen(false);
    }
  };

  const handleRejectClick = (returnItem: SalesReturn) => {
    setReturnToReject(returnItem);
    setRejectReasonDraft("");
    setIsRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!returnToReject) {
      setIsRejectDialogOpen(false);
      return;
    }
    const id = returnToReject.id;
    const label = returnToReject.invoiceNo;
    setActionSubmittingId(id);
    try {
      const res = (await apiClient.rejectSalesReturn(id, {
        rejected_by: approverLabel(),
        rejection_reason: rejectReasonDraft.trim() || undefined,
      })) as { error?: string; message?: string };
      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }
      toast({
        title: "Return rejected",
        description: res?.message || `Return ${label} was rejected.`,
      });
      setSelectedReturn((prev) =>
        prev?.id === id ? { ...prev, status: "rejected" } : prev,
      );
      await loadReturns();
    } catch (error: any) {
      toast({
        title: "Reject failed",
        description: error?.message || "Could not reject this return.",
        variant: "destructive",
      });
    } finally {
      setActionSubmittingId(null);
      setReturnToReject(null);
      setRejectReasonDraft("");
      setIsRejectDialogOpen(false);
    }
  };

  const handleViewOriginalInvoice = async (returnItem: SalesReturn) => {
    setSelectedReturn(returnItem);
    setIsOriginalInvoiceOpen(true);
    setOriginalInvoice(null);

    const invoiceId = returnItem.salesInvoiceId;
    if (!invoiceId) {
      toast({
        title: "Error",
        description: "Original invoice reference not found for this return.",
        variant: "destructive",
      });
      return;
    }

    setLoadingOriginalInvoice(true);
    try {
      const resp = (await apiClient.getSalesInvoice(invoiceId)) as any;
      const fullInv = resp?.data || resp;
      if (!fullInv?.id) {
        throw new Error("Could not load original invoice");
      }
      setOriginalInvoice(mapOriginalInvoiceFromApi(fullInv));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load original invoice",
        variant: "destructive",
      });
      setIsOriginalInvoiceOpen(false);
    } finally {
      setLoadingOriginalInvoice(false);
    }
  };

  const handlePrint = () => {
    if (!selectedReturn) return;

    const itemsRows = selectedReturn.items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.partNo}</td>
        <td>${item.itemName}</td>
        <td>${item.brand}</td>
        <td>${item.uom}</td>
        <td>${item.returnQty}</td>
        <td>${item.price.toLocaleString()}</td>
        <td>${item.total.toLocaleString()}</td>
      </tr>
    `).join('');

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Sale Return Invoice</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
              .invoice-container { max-width: 800px; margin: 0 auto; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
              .shop-info { display: flex; gap: 15px; align-items: flex-start; }
              .logo-placeholder { width: 80px; height: 80px; border: 1px solid #ccc; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
              .shop-details p { margin: 3px 0; font-size: 12px; }
              .shop-details .shop-name { font-weight: bold; font-size: 14px; }
              .invoice-title { text-align: right; }
              .invoice-title h1 { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
              .invoice-title p { font-size: 12px; margin: 3px 0; }
              .customer-section { background-color: #1664da; color: white; padding: 6px 12px; font-weight: bold; font-size: 12px; margin-bottom: 0; }
              .customer-details { padding: 10px 12px; border: 1px solid #ddd; border-top: none; margin-bottom: 15px; }
              .customer-details p { margin: 3px 0; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th { background-color: #1664da; color: white; padding: 8px; text-align: left; font-size: 11px; font-weight: 600; }
              td { border: 1px solid #ddd; padding: 8px; font-size: 11px; }
              tr:nth-child(even) { background-color: #f9f9f9; }
              .totals-section { display: flex; justify-content: space-between; margin-top: 20px; }
              .delivery-note { font-size: 12px; }
              .delivery-note strong { font-weight: bold; }
              .note-section { margin-top: 15px; font-size: 10px; color: #666; }
              .note-section strong { font-weight: bold; color: #333; }
              .totals-box { text-align: right; }
              .totals-box p { margin: 5px 0; font-size: 12px; }
              .totals-box .total-label { display: inline-block; width: 130px; text-align: right; }
              .totals-box .total-value { display: inline-block; width: 100px; text-align: right; font-weight: bold; }
              .totals-box .grand-total { font-size: 14px; font-weight: bold; }
              .signature-section { margin-top: 60px; text-align: right; padding-top: 20px; }
              .signature-line { border-top: 1px solid #333; width: 200px; display: inline-block; margin-bottom: 5px; }
              .signature-label { font-size: 12px; font-weight: bold; }
              @media print {
                body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              }
              @page { size: A4; margin: 10mm; }
            </style>
          </head>
          <body>
            <div class="invoice-container">
              <div class="header">
                <div class="shop-info">
                  <div class="logo-placeholder">LOGO</div>
                  <div class="shop-details">
                    <p class="shop-name">Shop: LUCKY HYDRAULIC PARTS</p>
                    <p>Address: Shop#8, Adeel Market, Beside Ithihad Plaza, Tarnol, Islamabad</p>
                    <p>Tel: 03120576487</p>
                    <p>Email: daniyalarshad881996@gmail.com</p>
                  </div>
                </div>
                <div class="invoice-title">
                  <h1>SALE RETURN</h1>
                  <p>Invoice : ${selectedReturn.invoiceNo}</p>
                  <p>Date: ${selectedReturn.returnDate}</p>
                </div>
              </div>

              <div class="customer-section">Customer</div>
              <div class="customer-details">
                <p>Name: ${selectedReturn.customerName}</p>
                <p>Contact: ${selectedReturn.remarks || 'N/A'}</p>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>S.No.</th>
                    <th>OEM/ Part No</th>
                    <th>ITEM</th>
                    <th>Brand</th>
                    <th>Uom</th>
                    <th>QTY</th>
                    <th>PRICE</th>
                    <th>SUB TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <div class="totals-section">
                <div class="left-section">
                  <div class="note-section">
                    <p><strong>NOTE:</strong> All manufacturer's Names, Numbers, Symbols and Descriptions are used for reference.</p>
                    <p>Document invalid without authorised signature and stamp.</p>
                    <p>Goods once sold can not be taken back.</p>
                  </div>
                </div>
                <div class="totals-box">
                  <p><span class="total-label">Subtotal</span> <span class="total-value">PKR ${selectedReturn.subtotal.toLocaleString()}/-</span></p>
                  <p><span class="total-label">GST</span> <span class="total-value">PKR ${selectedReturn.gst.toLocaleString()}/-</span></p>
                  <p><span class="total-label">Total Amount</span> <span class="total-value">PKR ${selectedReturn.totalAmount.toLocaleString()}/-</span></p>
                  <p><span class="total-label">Discount</span> <span class="total-value">PKR ${selectedReturn.discount.toLocaleString()}/-</span></p>
                  <p class="grand-total"><span class="total-label">Total After Discount</span> <span class="total-value">PKR ${selectedReturn.amountAfterDiscount.toLocaleString()}/-</span></p>
                </div>
              </div>

              <div class="signature-section">
                <div class="signature-line"></div>
                <p class="signature-label">Authorised Signature</p>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
    toast({
      title: "Printing",
      description: "Document sent to printer.",
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <RotateCcw className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Return Sale Orders
              </h2>
            </div>
            {canMutateReturns && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => {
                  resetDirectReturnForm();
                  setIsDirectReturnOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Direct Return
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div className="space-y-1">
              <Label className="text-xs text-primary">Item</Label>
              <SearchableSelect
                options={itemFilterOptions}
                value={filterItem}
                onValueChange={setFilterItem}
                placeholder="Search part no or description..."
                className="h-9 text-xs"
                selectedDisplayLabelOnly
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-primary">Customer</Label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {availableCustomers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.name}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-primary">Search</Label>
              <Input
                value={customerNameSearch}
                onChange={(e) => setCustomerNameSearch(e.target.value)}
                placeholder="Invoice no or customer name..."
                className="h-9 text-xs"
              />
            </div>
          </div>

          <Button
            onClick={handleSearch}
            size="sm"
            className="gap-2 bg-primary text-primary-foreground"
          >
            <Search className="w-4 h-4" />
            Search
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <ListNumberHeader />
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedReturns.length === paginatedReturns.length && paginatedReturns.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Invoice No</TableHead>
                  <TableHead className="text-xs font-semibold">Return Date</TableHead>
                  <TableHead className="text-xs font-semibold">Customer Name</TableHead>
                  <TableHead className="text-xs font-semibold">Remarks</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Total Amount</TableHead>
                  <TableHead className="text-xs font-semibold">Discount</TableHead>
                  <TableHead className="text-xs font-semibold">Amount After Discount</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReturns ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground text-xs">
                      Loading returns...
                    </TableCell>
                  </TableRow>
                ) : paginatedReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground text-xs">
                      {filterItem !== "all" || filterCustomer !== "all" || customerNameSearch
                        ? "No return orders found matching your filters"
                        : "No return orders found. Returns will appear here once created."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedReturns.map((returnItem, index) => (
                    <TableRow key={returnItem.id}>
                      <ListNumberCell
                        index={index}
                        page={currentPage}
                        pageSize={itemsPerPage}
                        total={filteredReturns.length}
                      />
                      <TableCell>
                        <Checkbox
                          checked={selectedReturns.includes(returnItem.id)}
                          onCheckedChange={(checked) => handleSelectReturn(returnItem.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span>{returnItem.invoiceNo}</span>
                          {returnItem.isDirectReturn ? (
                            <Badge
                              variant="outline"
                              className="w-fit text-[10px] px-1 py-0"
                            >
                              Direct
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{returnItem.returnDate}</TableCell>
                      <TableCell className="text-xs">{returnItem.customerName}</TableCell>
                      <TableCell className="text-xs">{returnItem.remarks || "-"}</TableCell>
                      <TableCell className="text-xs capitalize">
                        {returnItem.status || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{returnItem.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{returnItem.discount}</TableCell>
                      <TableCell className="text-xs">{returnItem.amountAfterDiscount.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <ActionButtonTooltip label="View" variant="view">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              onClick={() => handleViewReturn(returnItem)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </ActionButtonTooltip>
                          {canMutateReturns && returnItem.status === "pending" && (
                            <>
                              {returnItem.isDirectReturn ? (
                                <ActionButtonTooltip
                                  label="Edit direct return"
                                  variant="view"
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    disabled={
                                      loadingDirectReturnEdit ||
                                      actionSubmittingId === returnItem.id
                                    }
                                    onClick={() =>
                                      void handleEditDirectReturn(returnItem)
                                    }
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                </ActionButtonTooltip>
                              ) : null}
                              <ActionButtonTooltip
                                label="Approve return"
                                variant="view"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                                  disabled={actionSubmittingId === returnItem.id}
                                  onClick={() => handleApproveClick(returnItem)}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Approve
                                </Button>
                              </ActionButtonTooltip>
                              <ActionButtonTooltip
                                label="Reject return"
                                variant="more"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  disabled={actionSubmittingId === returnItem.id}
                                  onClick={() => handleRejectClick(returnItem)}
                                >
                                  <Ban className="w-3 h-3" />
                                  Reject
                                </Button>
                              </ActionButtonTooltip>
                              <ActionButtonTooltip label="Delete" variant="delete">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-destructive"
                                  disabled={actionSubmittingId === returnItem.id}
                                  onClick={() => handleDeleteClick(returnItem)}
                                >
                                  <Trash className="w-3 h-3" />
                                  Delete
                                </Button>
                              </ActionButtonTooltip>
                            </>
                          )}
                          <DropdownMenu>
                            <ActionButtonTooltip label="More Actions" variant="more">
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 bg-primary text-primary-foreground">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </ActionButtonTooltip>
                            <DropdownMenuContent align="end" className="bg-card border-border">
                              {!returnItem.isDirectReturn ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleViewOriginalInvoice(returnItem)
                                  }
                                  className="text-xs cursor-pointer"
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  View Original Invoice
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled
                                  className="text-xs opacity-60"
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  Legacy invoice (not in system)
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Simple Pagination */}
          <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                {filteredReturns.length === 0
                  ? 0
                  : (currentPage - 1) * itemsPerPage + 1}{" "}
                to{" "}
                {Math.min(currentPage * itemsPerPage, filteredReturns.length)}{" "}
                of {filteredReturns.length} entries
              </p>
            </div>
            <div className="flex items-center space-x-2">
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
                  {RETURN_LIST_PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || filteredReturns.length === 0}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Return Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <RotateCcw className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle className="text-lg">Return Invoice Details</DialogTitle>
              <p className="text-xs text-muted-foreground">Invoice Number: {selectedReturn?.invoiceNo}</p>
            </div>
          </DialogHeader>

          {selectedReturn && (
            <div className="space-y-4" id="return-print-content">
              {/* Invoice Details Header */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs p-4 border rounded-lg bg-muted/20">
                <div>
                  <p className="text-muted-foreground">Return Date:</p>
                  <p className="font-medium">{selectedReturn.returnDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    {selectedReturn.isDirectReturn
                      ? "Return / legacy invoice:"
                      : "Invoice No:"}
                  </p>
                  <p className="font-medium">{selectedReturn.invoiceNo}</p>
                  {selectedReturn.isDirectReturn &&
                  selectedReturn.originalInvoiceNo ? (
                    <p className="text-[10px] text-muted-foreground">
                      Legacy ref: {selectedReturn.originalInvoiceNo}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-muted-foreground">Sale Type:</p>
                  <p className="font-medium">{selectedReturn.saleType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer Name:</p>
                  <p className="font-medium">{selectedReturn.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remarks:</p>
                  <p className="font-medium">{selectedReturn.remarks || "none"}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-semibold">Sr. No.</TableHead>
                      <TableHead className="text-xs font-semibold">OEM/ Part No</TableHead>
                      <TableHead className="text-xs font-semibold">Item</TableHead>
                      <TableHead className="text-xs font-semibold">Brand</TableHead>
                      <TableHead className="text-xs font-semibold">Model</TableHead>
                      <TableHead className="text-xs font-semibold">Uom</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Return Qty</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Avg Cost</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Price</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReturn.items.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-xs">{item.partNo}</TableCell>
                        <TableCell className="text-xs">{item.itemName}</TableCell>
                        <TableCell className="text-xs">{item.brand}</TableCell>
                        <TableCell className="text-xs">{item.model || "-"}</TableCell>
                        <TableCell className="text-xs">{item.uom}</TableCell>
                        <TableCell className="text-xs text-right">{item.returnQty}</TableCell>
                        <TableCell className="text-xs text-right">{item.avgCost?.toLocaleString() || "0"}</TableCell>
                        <TableCell className="text-xs text-right">{item.price.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{item.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex flex-col items-end gap-1 text-xs">
                <p>Subtotal:<span className="font-semibold ml-2">PKR {selectedReturn.subtotal.toLocaleString()}</span></p>
                <p>GST:<span className="font-semibold ml-2">PKR {selectedReturn.gst.toLocaleString()}</span></p>
                <p>Total Amount:<span className="font-semibold ml-2">PKR {selectedReturn.totalAmount.toLocaleString()}</span></p>
                <p>Discount:<span className="font-semibold ml-2">PKR {selectedReturn.discount.toLocaleString()}</span></p>
                <p>Total After Discount:<span className="font-semibold ml-2">PKR {selectedReturn.amountAfterDiscount.toLocaleString()}</span></p>
              </div>
            </div>
          )}

          {/* Dialog Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setIsViewOpen(false)}
              className="gap-2 text-primary text-xs"
            >
              <Trash className="w-4 h-4" />
              Close
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {selectedReturn?.status === "pending" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={actionSubmittingId === selectedReturn.id}
                    onClick={() =>
                      selectedReturn && handleRejectClick(selectedReturn)
                    }
                  >
                    <Ban className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={actionSubmittingId === selectedReturn.id}
                    onClick={() =>
                      selectedReturn && handleApproveClick(selectedReturn)
                    }
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Approve
                  </Button>
                </>
              )}
              <Button
                onClick={handlePrint}
                className="gap-2 bg-primary text-primary-foreground text-xs"
              >
                <Printer className="w-4 h-4" />
                PRINT
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Original Invoice Dialog */}
      <Dialog
        open={isOriginalInvoiceOpen}
        onOpenChange={(open) => {
          setIsOriginalInvoiceOpen(open);
          if (!open) {
            setOriginalInvoice(null);
            setLoadingOriginalInvoice(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle className="text-lg">Original Sale Invoice</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Return: {selectedReturn?.invoiceNo || "—"}
                {selectedReturn?.originalInvoiceNo
                  ? ` · Invoice: ${selectedReturn.originalInvoiceNo}`
                  : ""}
              </p>
            </div>
          </DialogHeader>

          {loadingOriginalInvoice ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading original invoice...
            </p>
          ) : originalInvoice ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs p-4 border rounded-lg bg-muted/20">
                <div>
                  <p className="text-muted-foreground">Invoice No</p>
                  <p className="font-medium">{originalInvoice.invoiceNo}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{originalInvoice.invoiceDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{originalInvoice.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer Type</p>
                  <p className="font-medium">{originalInvoice.customerType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sales Person</p>
                  <p className="font-medium">{originalInvoice.salesPerson}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{originalInvoice.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Status</p>
                  <p className="font-medium capitalize">
                    {originalInvoice.paymentStatus}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remarks</p>
                  <p className="font-medium">{originalInvoice.remarks}</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-semibold">Sr.</TableHead>
                      <TableHead className="text-xs font-semibold">Part No</TableHead>
                      <TableHead className="text-xs font-semibold">Item</TableHead>
                      <TableHead className="text-xs font-semibold">Brand</TableHead>
                      <TableHead className="text-xs font-semibold">Uom</TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Ordered
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Delivered
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Pending
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Price
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Discount
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {originalInvoice.items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          className="text-center text-xs text-muted-foreground py-6"
                        >
                          No line items on this invoice.
                        </TableCell>
                      </TableRow>
                    ) : (
                      originalInvoice.items.map((item, idx) => (
                        <TableRow key={`${item.partNo}-${idx}`}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-xs">{item.partNo}</TableCell>
                          <TableCell className="text-xs">{item.description}</TableCell>
                          <TableCell className="text-xs">{item.brand}</TableCell>
                          <TableCell className="text-xs">{item.uom}</TableCell>
                          <TableCell className="text-xs text-right">
                            {item.orderedQty}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {item.deliveredQty}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {item.pendingQty}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {item.unitPrice.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {item.discount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {item.lineTotal.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-end gap-1 text-xs">
                <p>
                  Subtotal:
                  <span className="font-semibold ml-2">
                    PKR {originalInvoice.subtotal.toLocaleString()}
                  </span>
                </p>
                <p>
                  Overall Discount:
                  <span className="font-semibold ml-2">
                    PKR {originalInvoice.overallDiscount.toLocaleString()}
                  </span>
                </p>
                <p>
                  Freight:
                  <span className="font-semibold ml-2">
                    PKR {originalInvoice.freightCharges.toLocaleString()}
                  </span>
                </p>
                <p>
                  GST
                  {originalInvoice.taxPercentage > 0
                    ? ` (${originalInvoice.taxPercentage}%)`
                    : ""}
                  :
                  <span className="font-semibold ml-2">
                    PKR {originalInvoice.tax.toLocaleString()}
                  </span>
                </p>
                <p>
                  Grand Total:
                  <span className="font-semibold ml-2">
                    PKR {originalInvoice.grandTotal.toLocaleString()}
                  </span>
                </p>
                <p>
                  Paid Amount:
                  <span className="font-semibold ml-2">
                    PKR {originalInvoice.paidAmount.toLocaleString()}
                  </span>
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsOriginalInvoiceOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete return invoice{" "}
              <span className="font-semibold">{returnToDelete?.invoiceNo}</span>? This action cannot be undone.
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

      <AlertDialog
        open={isApproveConfirmOpen}
        onOpenChange={(open) => {
          setIsApproveConfirmOpen(open);
          if (!open) setReturnToApprove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve sales return?</AlertDialogTitle>
            <AlertDialogDescription>
              This will post stock movements, restore rack/shelf quantities where
              applicable, and create the accounting vouchers for return{" "}
              <span className="font-semibold">{returnToApprove?.invoiceNo}</span>.
              This cannot be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionSubmittingId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!!actionSubmittingId}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmApprove();
              }}
            >
              {actionSubmittingId ? "Working…" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={isRejectDialogOpen}
        onOpenChange={(open) => {
          setIsRejectDialogOpen(open);
          if (!open) {
            setReturnToReject(null);
            setRejectReasonDraft("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject return</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Reject{" "}
            <span className="font-medium text-foreground">
              {returnToReject?.invoiceNo}
            </span>
            ? It will be marked rejected (no stock or voucher posting).
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              value={rejectReasonDraft}
              onChange={(e) => setRejectReasonDraft(e.target.value)}
              className="text-xs min-h-[80px]"
              placeholder="Optional note for audit…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!actionSubmittingId}
              onClick={() => setIsRejectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!!actionSubmittingId}
              onClick={() => void handleConfirmReject()}
            >
              {actionSubmittingId ? "Working…" : "Reject return"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDirectReturnOpen}
        onOpenChange={(open) => {
          setIsDirectReturnOpen(open);
          if (!open) resetDirectReturnForm();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDirectReturnId
                ? "Edit direct return"
                : "Direct Return (legacy invoice)"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {editingDirectReturnId
                ? `Update pending return ${editingDirectReturnNo || ""} before approval. Stock and accounts post only when you approve.`
                : "Use when the original sale was in the older system and there is no invoice in this app. Stock and accounts are posted when you approve the return from the list."}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Legacy invoice no *</Label>
                <Input
                  className="h-9 text-xs"
                  placeholder="e.g. 1834"
                  value={directLegacyInvoiceNo}
                  onChange={(e) => setDirectLegacyInvoiceNo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Return date *</Label>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={directReturnDate}
                  onChange={(e) => setDirectReturnDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sale type *</Label>
                <Select
                  value={directCustomerType}
                  onValueChange={(v) => {
                    const next = v as "walking" | "registered";
                    setDirectCustomerType(next);
                    if (next === "walking") {
                      setDirectCustomerPriceType(null);
                      setDirectCustomerId("");
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walking">Walk-in</SelectItem>
                    <SelectItem value="registered">Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {directCustomerType === "walking" ? (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Customer name *</Label>
                  <Input
                    className="h-9 text-xs"
                    value={directCustomerName}
                    onChange={(e) => setDirectCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>
              ) : (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Customer *</Label>
                  <SearchableSelect
                    options={customerOptions}
                    value={directCustomerId}
                    onValueChange={(v) => {
                      setDirectCustomerId(v);
                      applyDirectCustomerPriceType(v);
                    }}
                    placeholder="Search customer…"
                    className="h-9 text-xs"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">GST %</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-9 text-xs"
                  value={directTaxPct}
                  onChange={(e) => setDirectTaxPct(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea
                  className="text-xs min-h-[64px]"
                  value={directReason}
                  onChange={(e) => setDirectReason(e.target.value)}
                  placeholder="Notes about this legacy return…"
                />
              </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs min-w-[180px]">Part</TableHead>
                    <TableHead className="text-xs w-[100px] text-right">
                      Return qty
                    </TableHead>
                    <TableHead className="text-xs w-[88px] text-center">
                      Price A
                    </TableHead>
                    <TableHead className="text-xs w-[88px] text-center">
                      Price B
                    </TableHead>
                    <TableHead className="text-xs w-[120px] text-right">
                      Unit price
                    </TableHead>
                    <TableHead className="text-xs w-[100px] text-right">
                      Line total
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directLines.map((line) => {
                    const qty = parseInt(line.returnQty, 10) || 0;
                    const price = parseFloat(line.unitPrice) || 0;
                    const lineTotal = Math.round(qty * price * 100) / 100;
                    const part = availableItems.find((p) => p.id === line.partId);
                    const priceAValue = part?.priceA ?? null;
                    const priceBValue = part?.priceB ?? null;
                    const returnUnitCost = part
                      ? resolveDirectReturnUnitCost(part.avgCost, part.cost)
                      : line.unitCostSnapshot ?? 0;
                    const returnCostSource =
                      part && part.avgCost > 0
                        ? "avg"
                        : part && part.cost > 0
                          ? "cost"
                          : returnUnitCost > 0
                            ? "saved"
                            : null;
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="align-top">
                          <div className="space-y-1 min-w-[220px]">
                            <SearchableSelect
                              options={directPartOptions}
                              value={line.partId}
                              onValueChange={(v) =>
                                handleDirectLinePartChange(line.id, v)
                              }
                              placeholder="Search master part, part no, brand…"
                              className="h-8 text-xs"
                              selectedDisplayLabelOnly
                            />
                            {line.partId ? (
                              <div className="text-[10px] leading-snug text-muted-foreground space-y-0.5">
                                <p className="tabular-nums">
                                  Avg cost:{" "}
                                  {part && part.avgCost > 0
                                    ? part.avgCost.toLocaleString()
                                    : "—"}
                                </p>
                                <p className="tabular-nums">
                                  Cost price:{" "}
                                  {part && part.cost > 0
                                    ? part.cost.toLocaleString()
                                    : "—"}
                                </p>
                                <p
                                  className={
                                    returnUnitCost > 0
                                      ? "tabular-nums font-medium text-foreground"
                                      : "text-destructive"
                                  }
                                >
                                  Return cost:{" "}
                                  {returnUnitCost > 0
                                    ? `${returnUnitCost.toLocaleString()} (${
                                        returnCostSource === "avg"
                                          ? "uses avg"
                                          : returnCostSource === "cost"
                                            ? "uses cost"
                                            : "saved"
                                      })`
                                    : "Missing — set avg or cost on part"}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            className="h-8 text-xs text-right"
                            value={line.returnQty}
                            onChange={(e) =>
                              setDirectLines((prev) =>
                                prev.map((row) =>
                                  row.id === line.id
                                    ? { ...row, returnQty: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {priceAValue == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              type="button"
                              variant={
                                line.selectedPriceType === "A"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              className="h-8 w-full min-w-0 px-1 text-xs"
                              onClick={() =>
                                setDirectLines((prev) =>
                                  prev.map((row) =>
                                    row.id === line.id
                                      ? {
                                          ...row,
                                          selectedPriceType: "A",
                                          unitPrice: String(priceAValue),
                                        }
                                      : row,
                                  ),
                                )
                              }
                            >
                              {priceAValue.toLocaleString()}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {priceBValue == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              type="button"
                              variant={
                                line.selectedPriceType === "B"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              className="h-8 w-full min-w-0 px-1 text-xs"
                              onClick={() =>
                                setDirectLines((prev) =>
                                  prev.map((row) =>
                                    row.id === line.id
                                      ? {
                                          ...row,
                                          selectedPriceType: "B",
                                          unitPrice: String(priceBValue),
                                        }
                                      : row,
                                  ),
                                )
                              }
                            >
                              {priceBValue.toLocaleString()}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-xs text-right"
                            value={line.unitPrice}
                            onChange={(e) =>
                              setDirectLines((prev) =>
                                prev.map((row) =>
                                  row.id === line.id
                                    ? {
                                        ...row,
                                        unitPrice: e.target.value,
                                        selectedPriceType: "",
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {lineTotal.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={directLines.length <= 1}
                            onClick={() =>
                              setDirectLines((prev) =>
                                prev.filter((row) => row.id !== line.id),
                              )
                            }
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                setDirectLines((prev) => [
                  ...prev,
                  {
                    id: String(Date.now()),
                    partId: "",
                    returnQty: "",
                    unitPrice: "",
                    selectedPriceType: "",
                  },
                ])
              }
            >
              <Plus className="w-4 h-4" />
              Add item
            </Button>

            <div className="rounded-md border bg-muted/20 px-3 py-3 text-sm space-y-2">
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">
                  Rs {directReturnTotals.subtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-muted-foreground">GST</span>
                <span className="font-medium tabular-nums">
                  Rs {directReturnTotals.tax.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border pt-2">
                <span className="text-muted-foreground">
                  Total (incl. tax, before deduction)
                </span>
                <span className="font-medium tabular-nums">
                  Rs {directReturnTotals.grossAfterTax.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
                <Label className="text-xs text-muted-foreground shrink-0">
                  Deduction
                </Label>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-9 w-36 text-right text-xs tabular-nums"
                    placeholder="0"
                    value={directDeductionDraft}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^\d.]/g, "");
                      const dot = v.indexOf(".");
                      if (dot !== -1) {
                        v =
                          v.slice(0, dot + 1) +
                          v.slice(dot + 1).replace(/\./g, "");
                      }
                      setDirectDeductionDraft(v);
                    }}
                    onBlur={() => {
                      const cap = directReturnTotals.maxDeduction;
                      let d = parseDirectMoneyDraft(directDeductionDraft);
                      if (d > cap) d = cap;
                      setDirectDeductionDraft(d > 0 ? String(d) : "");
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Max Rs {directReturnTotals.maxDeduction.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border pt-2 font-semibold">
                <span>Net return total</span>
                <span className="tabular-nums text-primary">
                  Rs {directReturnTotals.net.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-3 rounded-md border bg-muted/20 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">
                {directCustomerType === "walking"
                  ? "Refund to customer (walk-in)"
                  : "Refund to customer (on approve)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {directCustomerType === "walking"
                  ? directReturnTotals.net > 0
                    ? "Amount to pay matches the net return. Choose the cash or bank account to refund from."
                    : "Add return line items to see the refund amount."
                  : `Enter an amount to pay on approve, up to the net return (Rs ${directReturnTotals.net.toLocaleString()}). Leave blank for no payment.`}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Cash / bank account
                    {directCustomerType === "walking" &&
                    directReturnTotals.net > 0
                      ? " *"
                      : ""}
                  </Label>
                  <SearchableSelect
                    options={refundAccountOptions}
                    value={directPaymentAccountId}
                    onValueChange={setDirectPaymentAccountId}
                    placeholder={
                      directCustomerType === "walking" &&
                      directReturnTotals.net <= 0
                        ? "—"
                        : "Select cash or bank…"
                    }
                    className="h-9 text-xs"
                    disabled={
                      directCustomerType === "walking" &&
                      directReturnTotals.net <= 0
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount to pay</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    readOnly={directCustomerType === "walking"}
                    className={
                      directCustomerType === "walking"
                        ? "h-9 text-xs text-right tabular-nums bg-muted/50 cursor-default"
                        : "h-9 text-xs text-right tabular-nums"
                    }
                    placeholder="0"
                    value={
                      directCustomerType === "walking"
                        ? directReturnTotals.net > 0
                          ? String(directReturnTotals.net)
                          : ""
                        : directRefundPaidDraft
                    }
                    onChange={(e) => {
                      if (directCustomerType === "walking") return;
                      let v = e.target.value.replace(/[^\d.]/g, "");
                      const dot = v.indexOf(".");
                      if (dot !== -1) {
                        v =
                          v.slice(0, dot + 1) +
                          v.slice(dot + 1).replace(/\./g, "");
                      }
                      setDirectRefundPaidDraft(v);
                      setDirectRefundPaidTouched(true);
                    }}
                    onBlur={() => {
                      if (directCustomerType === "walking") return;
                      const cap = directReturnTotals.net;
                      let p = parseDirectMoneyDraft(directRefundPaidDraft);
                      if (p > cap) p = cap;
                      setDirectRefundPaidDraft(p > 0 ? String(p) : "");
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDirectReturnOpen(false)}
                disabled={submittingDirectReturn}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmitDirectReturn()}
                disabled={submittingDirectReturn || loadingDirectReturnEdit}
              >
                {submittingDirectReturn
                  ? "Saving…"
                  : editingDirectReturnId
                    ? "Save changes"
                    : "Save direct return"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
