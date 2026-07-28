import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FileText, Plus, Trash, Pencil, Check, Eye, ShoppingCart, PackageCheck, ArrowUpFromLine, Receipt, FileBarChart2 } from "lucide-react";
import { BackOrderSummaryTab } from "@/components/purchase-import/BackOrderSummaryTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printPurchaseImportInquiry } from "@/utils/printPurchaseImportInquiryPdf";
import { printPurchaseImportQuotation } from "@/utils/printPurchaseImportQuotationPdf";
import { printPurchaseImportQuotationComparison } from "@/utils/printPurchaseImportQuotationComparisonPdf";
import { printPurchaseImportOrder } from "@/utils/printPurchaseImportOrderPdf";
import { apiClient } from "@/lib/api";
import { fetchBranchAccountOptions } from "@/lib/branch-accounts";
import {
  getListRowNumber,
  LIST_NUMBER_HEAD_CLASS,
  LIST_NUMBER_CELL_CLASS,
} from "@/components/ui/list-table-number";

type PurchaseImportTab =
  | "inquiry"
  | "quotation"
  | "revise-quotation"
  | "confirm-quotation"
  | "purchase-order"
  | "purchase-invoice"
  | "back-order-summary";

interface TabConfig {
  id: PurchaseImportTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const PURCHASE_IMPORT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];

/** Last 3 Purchases panel under inquiry item rows (includes PO history). */
const SHOW_INQUIRY_LAST_PURCHASES = false;

/** Other Qty column/inputs across Purchase Import (kept in data model as 0). */
const SHOW_OTHER_QTY = false;

type ListPaginationProps = {
  currentPage: number;
  itemsPerPage: number;
  totalRecords: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const PurchaseImportListPagination = ({
  currentPage,
  itemsPerPage,
  totalRecords,
  onPageChange,
  onPageSizeChange,
}: ListPaginationProps) => {
  const totalPages = Math.ceil(totalRecords / itemsPerPage) || 1;

  return (
    <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        {totalRecords === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to{" "}
        {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords}{" "}
        entries
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rows per page:</span>
        <Select
          value={String(itemsPerPage)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PURCHASE_IMPORT_PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <span className="text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages || totalRecords === 0}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

const tabs: TabConfig[] = [
  {
    id: "inquiry",
    label: "Inquiry",
    icon: FileText,
    description: "Create and manage purchase import inquiries",
  },
  {
    id: "quotation",
    label: "Quotation",
    icon: Check,
    description: "Create quotations from confirmed inquiries",
  },
  {
    id: "revise-quotation",
    label: "Revise Quotation",
    icon: Pencil,
    description: "Revise open purchase quotations",
  },
  {
    id: "confirm-quotation",
    label: "Confirmation",
    icon: PackageCheck,
    description: "View confirmed purchase quotations",
  },
  {
    id: "purchase-order",
    label: "Shipments",
    icon: ShoppingCart,
    description: "Purchase orders created from confirmed quotations",
  },
  {
    id: "purchase-invoice",
    label: "Invoices",
    icon: Receipt,
    description: "Enter invoice details and import expenses",
  },
  {
    id: "back-order-summary",
    label: "Back Order Summary",
    icon: FileBarChart2,
    description: "Back order summary report by supplier and date range",
  },
];

type SupplierOption = {
  id: string;
  label: string;
  country: string;
  area: string;
  type: "local" | "international";
  currencyName?: string;
};

type PartOption = {
  id: string;
  partNo: string;
  masterPartNo: string;
  description: string;
  hsCode: string;
  brand: string;
  weight: number;
};

type LastPurchase = {
  source: string;
  documentNumber: string;
  date: string;
  supplierName: string;
  quantity: number;
  rate: number;
  amount: number;
};

type SupplierRow = {
  id: string;
  supplierId: string;
};

type ItemRow = {
  id: string;
  partId: string;
  currentStock: number;
  salesQty: number;
  khiQuantity: number;
  isbQuantity: number;
  otherQuantity: number;
  weight: number;
  totalWeight: number;
  lastPurchases: LastPurchase[];
  loadingDetails: boolean;
};

type InquiryItemSort = "none" | "alphabetical" | "numeric" | "description" | "hsCode";
type SortDirection = "asc" | "desc";
type InquirySalesPeriodMonths = 3 | 6 | 9 | 12;

type PurchaseImportRequestRecord = {
  id: string;
  requestNo?: string;
  batchId: string;
  supplierId?: string | null;
  partReference?: string | null;
  consignee?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  Supplier?: {
    id: string;
    code?: string | null;
    name?: string | null;
    companyName?: string | null;
    currencyName?: string | null;
  };
  PurchaseImportRequestItem?: Array<{
    id: string;
    demandQuantity: number;
    totalWeight: number;
    khiQuantity?: number;
    isbQuantity?: number;
    otherQuantity?: number;
  }>;
  PurchaseQuotation?: Array<{
    id: string;
    status: string;
    quotationNo?: string | null;
  }>;
};

type PurchaseQuotationRecord = {
  id: string;
  quotationNo: string;
  status: string;
  quotationType: string;
  currency: string;
  fcTotal: number;
  lcTotal: number;
  quotationDate: string;
  revisedQuotationDate?: string | null;
  confirmationDate?: string | null;
  consigneeLabel?: string;
  PurchaseImportRequest?: {
    id: string;
    requestNo?: string | null;
    partReference?: string | null;
    consignee?: string | null;
    batchId?: string;
    PurchaseImportRequestItem?: Array<{
      khiQuantity?: number;
      isbQuantity?: number;
      otherQuantity?: number;
    }>;
  };
  Supplier?: {
    id: string;
    code?: string | null;
    name?: string | null;
    companyName?: string | null;
  };
  PurchaseQuotationItem?: Array<{
    id: string;
    demandQuantity: number;
    quotationQuantity: number;
    totalWeight: number;
  }>;
  PurchaseOrder?: Array<{
    id: string;
    poNumber: string;
    status: string;
    consignee?: string | null;
    PurchaseOrderItem?: Array<{
      fcRate?: number | null;
      receivedQty?: number | null;
    }>;
  }>;
};

type ImportPurchaseOrderRecord = {
  id: string;
  poNumber: string;
  date: string;
  status: string;
  consignee?: string | null;
  totalAmount: number;
  notes?: string | null;
  itemsCount: number;
  importSaved?: boolean;
  stockedOut?: boolean;
  transferOutInvoiceId?: string | null;
  forwarder?: string | null;
  estTimeDate?: string | null;
  expectedDate?: string | null;
  supplier?: {
    id: string;
    code?: string | null;
    name?: string | null;
  } | null;
  quotation?: {
    id: string;
    quotationNo: string;
    currency?: string;
    requestNo?: string | null;
  } | null;
};

type ImportPurchaseOrderReceiveLine = {
  id: string;
  partId: string;
  isNewRow?: boolean;
  loadingPartDetails?: boolean;
  masterPartNo: string;
  partNo: string;
  description: string;
  brand: string;
  currentStock: number;
  demandQuantity: number;
  quotationQuantity: number;
  shipDays: number;
  fcRate: number;
  fcRateText: string;
  fcAmount: number;
  lcRate: number;
  lcAmount: number;
  weight: number;
  totalWeight: number;
  priceA: number;
  priceB: number;
  priceAText: string;
  priceBText: string;
  orderQty: number;
  receiveQty: string;
  additionalQty: number;
  backQty: number;
};

type ImportPurchaseOrderReceiveDetail = {
  supplierName: string;
  quotationNo: string;
  requestNo?: string | null;
  currency: string;
  conversionRate: number;
  consignee?: string | null;
  isRevised: boolean;
};

type ImportPurchaseOrderExpenses = {
  pkgExpPercent: number;
  invDiscPercent: number;
  frtExp: number;
  discAmt: number;
  customsDuty: number;
  additionalCustomsDuty: number;
  regulatoryDuty: number;
  salesTax: number;
  additionalSalesTax: number;
  incomeTax: number;
  ed: number;
  doAmount: number;
  crnExp: number;
  cmExp: number;
  agencyExp: number;
  miscExp: number;
  locFrt: number;
  totalExp: number;
};

type ImportPoExpenseFieldKey = keyof Omit<
  ImportPurchaseOrderExpenses,
  "totalExp"
>;

const EMPTY_IMPORT_PO_EXPENSES: ImportPurchaseOrderExpenses = {
  pkgExpPercent: 0,
  invDiscPercent: 0,
  frtExp: 0,
  discAmt: 0,
  customsDuty: 0,
  additionalCustomsDuty: 0,
  regulatoryDuty: 0,
  salesTax: 0,
  additionalSalesTax: 0,
  incomeTax: 0,
  ed: 0,
  doAmount: 0,
  crnExp: 0,
  cmExp: 0,
  agencyExp: 0,
  miscExp: 0,
  locFrt: 0,
  totalExp: 0,
};

const IMPORT_PO_EXPENSE_AMOUNT_KEYS: ImportPoExpenseFieldKey[] = [
  "customsDuty",
  "additionalCustomsDuty",
  "regulatoryDuty",
  "salesTax",
  "additionalSalesTax",
  "incomeTax",
  "ed",
  "doAmount",
  "crnExp",
  "cmExp",
  "agencyExp",
  "miscExp",
  "locFrt",
];

const IMPORT_PO_CLEARING_EXPENSE_SECTIONS = [
  {
    title: "Clearing Cost (International)",
    fields: [
      { key: "customsDuty" as const, label: "C.D." },
      { key: "additionalCustomsDuty" as const, label: "A.C.D." },
      { key: "regulatoryDuty" as const, label: "R.D." },
      { key: "salesTax" as const, label: "S.T." },
      { key: "additionalSalesTax" as const, label: "A.S.T." },
      { key: "incomeTax" as const, label: "I.T." },
    ],
  },
  {
    title: "Local Expenses",
    fields: [
      { key: "ed" as const, label: "E.D." },
      { key: "doAmount" as const, label: "D.O." },
      { key: "crnExp" as const, label: "Dmg.Exp." },
      { key: "cmExp" as const, label: "CRN.Exp." },
      { key: "agencyExp" as const, label: "Agency.Exp." },
      { key: "miscExp" as const, label: "Misc.Exp." },
      { key: "locFrt" as const, label: "Loc.Frt." },
    ],
  },
];

function formatImportPoAmount(value: number) {
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeImportPoExpenseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function computeImportPoCommercialAmounts(
  expenses: Pick<
    ImportPurchaseOrderExpenses,
    "pkgExpPercent" | "invDiscPercent" | "frtExp"
  >,
  invoiceLcAmount: number,
  conversionRate: number,
  invoiceFcAmount = 0,
) {
  const invoiceLc = Math.max(0, Number(invoiceLcAmount) || 0);
  const invoiceFc = Math.max(0, Number(invoiceFcAmount) || 0);
  const rate = Math.max(0, Number(conversionRate) || 0);
  const pkgExpPercent = normalizeImportPoExpenseNumber(expenses.pkgExpPercent);
  const invDiscPercent = normalizeImportPoExpenseNumber(expenses.invDiscPercent);
  const frtExp = normalizeImportPoExpenseNumber(expenses.frtExp);
  const pkgExpAmt = (invoiceLc * pkgExpPercent) / 100;
  const invDiscAmt = (invoiceLc * invDiscPercent) / 100;
  const pkgExpFcAmt =
    invoiceFc > 0
      ? (invoiceFc * pkgExpPercent) / 100
      : rate > 0
        ? pkgExpAmt / rate
        : 0;
  const invDiscFcAmt =
    invoiceFc > 0
      ? (invoiceFc * invDiscPercent) / 100
      : rate > 0
        ? invDiscAmt / rate
        : 0;
  return {
    pkgExpAmt,
    pkgExpFcAmt,
    invDiscAmt,
    invDiscFcAmt,
    frtExpLc: frtExp * rate,
  };
}

function computeImportPoTotalExp(
  expenses: Omit<ImportPurchaseOrderExpenses, "totalExp">,
  invoiceLcAmount = 0,
  conversionRate = 1,
) {
  const commercial = computeImportPoCommercialAmounts(
    expenses,
    invoiceLcAmount,
    conversionRate,
  );
  const clearingLocalTotal = IMPORT_PO_EXPENSE_AMOUNT_KEYS.reduce(
    (sum, key) => sum + normalizeImportPoExpenseNumber(expenses[key]),
    0,
  );
  return commercial.pkgExpAmt + commercial.frtExpLc + clearingLocalTotal;
}

function computeImportPoInvoiceTotal(
  lcAmount: number,
  totalExp: number,
  invDiscAmt: number,
) {
  return Math.max(
    0,
    normalizeImportPoExpenseNumber(lcAmount) +
      normalizeImportPoExpenseNumber(totalExp) -
      normalizeImportPoExpenseNumber(invDiscAmt),
  );
}

function parseImportPoExpenses(raw: unknown): ImportPurchaseOrderExpenses {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_IMPORT_PO_EXPENSES };
  }
  const source = raw as Record<string, unknown>;
  const base = {
    pkgExpPercent: normalizeImportPoExpenseNumber(source.pkgExpPercent),
    invDiscPercent: normalizeImportPoExpenseNumber(source.invDiscPercent),
    frtExp: normalizeImportPoExpenseNumber(source.frtExp),
    discAmt: normalizeImportPoExpenseNumber(source.discAmt),
    customsDuty: normalizeImportPoExpenseNumber(source.customsDuty),
    additionalCustomsDuty: normalizeImportPoExpenseNumber(source.additionalCustomsDuty),
    regulatoryDuty: normalizeImportPoExpenseNumber(source.regulatoryDuty),
    salesTax: normalizeImportPoExpenseNumber(source.salesTax),
    additionalSalesTax: normalizeImportPoExpenseNumber(source.additionalSalesTax),
    incomeTax: normalizeImportPoExpenseNumber(source.incomeTax),
    ed: normalizeImportPoExpenseNumber(source.ed),
    doAmount: normalizeImportPoExpenseNumber(source.doAmount),
    crnExp: normalizeImportPoExpenseNumber(source.crnExp),
    cmExp: normalizeImportPoExpenseNumber(source.cmExp),
    agencyExp: normalizeImportPoExpenseNumber(source.agencyExp),
    miscExp: normalizeImportPoExpenseNumber(source.miscExp),
    locFrt: normalizeImportPoExpenseNumber(source.locFrt),
  };
  const storedTotal = normalizeImportPoExpenseNumber(source.totalExp);
  return {
    ...base,
    totalExp: storedTotal > 0 ? storedTotal : computeImportPoTotalExp(base),
  };
}

function computeImportReceiveVariance(
  orderQty: number | string,
  receiveQty: number | string,
) {
  const normalizedReceive = Math.max(0, Math.floor(Number(receiveQty) || 0));
  const normalizedOrder = Math.max(0, Math.floor(Number(orderQty) || 0));
  return {
    additionalQty:
      normalizedReceive > normalizedOrder
        ? normalizedReceive - normalizedOrder
        : 0,
    backQty:
      normalizedReceive < normalizedOrder
        ? normalizedOrder - normalizedReceive
        : 0,
  };
}

function computeImportReceiveLineAmounts(
  line: Pick<ImportPurchaseOrderReceiveLine, "fcRate" | "lcRate" | "weight">,
  receiveQty: number | string,
) {
  const qty = Math.max(0, Math.floor(Number(receiveQty) || 0));
  return {
    fcAmount: line.fcRate * qty,
    lcAmount: line.lcRate * qty,
    totalWeight: line.weight * qty,
  };
}

function computeImportPoExpenseDistributionShares(
  lines: Array<{ receiveQty: number | string; weight: number }>,
) {
  return lines.map((line) => {
    const qty = Math.max(0, Math.floor(Number(line.receiveQty) || 0));
    const unitWeight = Math.max(0, Number(line.weight) || 0);
    if (qty <= 0) return 0;
    return unitWeight > 0 ? qty * unitWeight : qty;
  });
}

function computeImportPoDistributedExpenses(
  lines: Array<{ receiveQty: number | string; weight: number }>,
  totalExpenses: number,
) {
  if (totalExpenses <= 0 || lines.length === 0) {
    return lines.map(() => 0);
  }

  const shares = computeImportPoExpenseDistributionShares(lines);
  const totalShare = shares.reduce((sum, value) => sum + value, 0);

  if (totalShare <= 0) {
    const equalShare = totalExpenses / lines.length;
    return lines.map(() => equalShare);
  }

  return shares.map((share) => (share / totalShare) * totalExpenses);
}

function recalcReceiveLineRates(
  line: ImportPurchaseOrderReceiveLine,
  fcRate: number,
  conversionRate: number,
) {
  const lcRate = fcRate * conversionRate;
  const amounts = computeImportReceiveLineAmounts(
    { ...line, fcRate, lcRate },
    line.receiveQty,
  );
  return {
    ...line,
    fcRate,
    fcRateText: formatRateInput(fcRate),
    lcRate,
    fcAmount: amounts.fcAmount,
    lcAmount: amounts.lcAmount,
    totalWeight: amounts.totalWeight,
  };
}

function applyReceiveConversionRateToLines(
  lines: ImportPurchaseOrderReceiveLine[],
  conversionRate: number,
) {
  const rate = Math.max(0, Number(conversionRate) || 0);
  return lines.map((line) => recalcReceiveLineRates(line, line.fcRate, rate));
}

type PurchaseQuotationDetailItem = {
  partId: string;
  masterPartNo: string;
  partNo: string;
  description: string;
  brand: string;
  currentStock?: number;
  demandQuantity: number;
  quotationQuantity: number;
  khiQuantity?: number;
  isbQuantity?: number;
  otherQuantity?: number;
  shipDays: number;
  fcRate: number;
  fcAmount: number;
  lcRate: number;
  lcAmount: number;
  revisedFcRate: number;
  revisedFcAmount: number;
  revisedLcRate: number;
  revisedLcAmount: number;
  weight: number;
  totalWeight: number;
  lastFcRate?: number;
};

const isQuotationRevised = (detail: PurchaseQuotationDetailPayload | null) => {
  if (!detail) return false;
  const type = String(detail.quotationType || "").trim().toLowerCase();
  const status = String(detail.status || "").trim().toLowerCase();
  return type === "revised" || status === "revise";
};

const getEffectiveQuotationItemValues = (
  item: PurchaseQuotationDetailItem,
  isRevised: boolean,
) => {
  if (isRevised) {
    const fcRate =
      Number(item.revisedFcRate || 0) > 0
        ? Number(item.revisedFcRate)
        : Number(item.fcRate || 0);
    const fcAmount =
      Number(item.revisedFcAmount || 0) > 0
        ? Number(item.revisedFcAmount)
        : Number(item.fcAmount || 0);
    const lcRate =
      Number(item.revisedLcRate || 0) > 0
        ? Number(item.revisedLcRate)
        : Number(item.lcRate || 0);
    const lcAmount =
      Number(item.revisedLcAmount || 0) > 0
        ? Number(item.revisedLcAmount)
        : Number(item.lcAmount || 0);
    return { fcRate, fcAmount, lcRate, lcAmount };
  }
  return {
    fcRate: Number(item.fcRate || 0),
    fcAmount: Number(item.fcAmount || 0),
    lcRate: Number(item.lcRate || 0),
    lcAmount: Number(item.lcAmount || 0),
  };
};

type PurchaseQuotationDetailPayload = {
  id: string;
  quotationNo: string;
  quotationDate: string;
  revisedQuotationDate?: string | null;
  confirmationDate?: string | null;
  quotationType: string;
  terms?: string | null;
  status: string;
  currency: string;
  conversionRate: number;
  request?: {
    id: string;
    requestNo?: string | null;
    requestDate?: string;
    consignee?: string | null;
  };
  supplier?: {
    id: string;
    code?: string | null;
    name: string;
    currency: string;
  };
  items: PurchaseQuotationDetailItem[];
};

type PurchaseImportRequestEditPayload = {
  id: string;
  batchId: string;
  requestNo?: string;
  baseRequestNo?: string;
  requestDate?: string;
  partReference?: string;
  consignee?: string | null;
  notes?: string;
  status?: string;
  supplierIds: string[];
  items: Array<{
    id?: string;
    partId: string;
    demandQuantity: number;
    khiQuantity?: number;
    isbQuantity?: number;
    otherQuantity?: number;
    weight: number;
    currentStock?: number;
    totalWeight?: number;
  }>;
};

type PurchaseQuotationContextItem = {
  partId: string;
  masterPartNo: string;
  partNo: string;
  description: string;
  brand: string;
  currentStock: number;
  demandQuantity: number;
  khiQuantity?: number;
  isbQuantity?: number;
  otherQuantity?: number;
  weight: number;
};

type PurchaseQuotationContextPayload = {
  requestId: string;
  requestNo: string;
  requestDate: string;
  batchId?: string;
  supplierCount?: number;
  quotationsInBatch?: number;
  consignee?: string | null;
  quotationNo: string;
  quotationDate: string;
  existingQuotationId?: string | null;
  currency?: string;
  conversionRate?: number;
  terms?: string | null;
  supplier: {
    id: string;
    name: string;
    currency: string;
  };
  currencyOptions: string[];
  defaultCurrency: string;
  items: Array<
    PurchaseQuotationContextItem & {
      quotationQuantity?: number;
      shipDays?: number;
      fcRate?: number;
      revisedFcRate?: number;
      lastFcRate?: number;
    }
  >;
};

type PurchaseQuotationComparisonPayload = {
  requestId: string;
  requestNo?: string | null;
  baseRequestNo?: string | null;
  requestDate?: string | null;
  consignee?: string | null;
  supplierCount?: number | null;
  quotationsAvailable?: number | null;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    quotationNo?: string | null;
    quotationDate?: string | Date | null;
    currency?: string | null;
    conversionRate?: number | null;
    fcTotal?: number | null;
    lcTotal?: number | null;
  }>;
  items: Array<{
    partId: string;
    masterPartNo?: string | null;
    partNo?: string | null;
    description?: string | null;
    brand?: string | null;
    demandQty?: number | null;
    quotes: Record<
      string,
      {
        quotationQty: number;
        fcRate: number;
        lcRate: number;
        fcAmount: number;
        lcAmount: number;
      } | null
    >;
  }>;
};

const printPurchaseQuotationComparisonPdf = async (
  requestId: string,
): Promise<boolean> => {
  const [comparisonRes, requestRes] = await Promise.all([
    apiClient.getPurchaseQuotationComparison(requestId),
    apiClient.getPurchaseImportRequestById(requestId).catch(() => null),
  ]);
  const data = (comparisonRes as any)?.data as
    | PurchaseQuotationComparisonPayload
    | undefined;
  if (!data) {
    throw new Error("Comparison data is unavailable.");
  }

  const requestData = (requestRes as any)?.data as
    | {
        consignee?: string | null;
        items?: Array<{
          isbQuantity?: number | null;
          khiQuantity?: number | null;
          otherQuantity?: number | null;
        }>;
      }
    | undefined;

  const consigneeFromItems = formatConsigneesFromSplitQuantities(
    Array.isArray(requestData?.items) ? requestData.items : [],
    null,
  );
  const consigneeFromApi = String(
    requestData?.consignee || data.consignee || "",
  ).trim();
  const consignee =
    (consigneeFromItems && consigneeFromItems !== "-"
      ? consigneeFromItems
      : consigneeFromApi) || "-";

  return printPurchaseImportQuotationComparison({
    detail: {
      requestNo: data.requestNo,
      baseRequestNo: data.baseRequestNo,
      requestDate: data.requestDate,
      consignee,
      supplierCount: data.supplierCount,
      quotationsAvailable: data.quotationsAvailable,
    },
    suppliers: data.suppliers.map((supplier) => ({
      supplierId: supplier.supplierId,
      supplierName: supplier.supplierName,
      quotationNo: supplier.quotationNo,
      quotationDate: supplier.quotationDate,
      currency: supplier.currency,
      conversionRate: supplier.conversionRate,
      fcTotal: supplier.fcTotal,
      lcTotal: supplier.lcTotal,
    })),
    items: data.items,
  });
};

type PurchaseQuotationFormItem = PurchaseQuotationContextItem & {
  rowId: string;
  isNewRow?: boolean;
  loadingPartDetails?: boolean;
  quotationQuantity: number;
  shipDays: number;
  fcRate: number;
  fcRateText: string;
  revisedFcRate: number;
  revisedFcRateText: string;
  lastFcRate: number;
};

const RATE_INPUT_PATTERN = /^\d*\.?\d{0,4}$/;

const formatRateInput = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return "";
  return String(Math.round(value * 10000) / 10000);
};

const parseRateInput = (raw: string): number => {
  if (!raw || raw === ".") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10000) / 10000;
};

type LinkedExpenseKind = "pkg" | "disc";
type LinkedExpenseField = "percent" | "fc" | "lc";

type LinkedExpenseText = {
  percent: string;
  fc: string;
  lc: string;
};

const EMPTY_LINKED_EXPENSE_TEXT: LinkedExpenseText = {
  percent: "",
  fc: "",
  lc: "",
};

function calcLinkedExpenseValues(
  field: LinkedExpenseField,
  rawValue: number,
  invoiceFc: number,
  invoiceLc: number,
  conversionRate: number,
): { percent: number; fc: number; lc: number } {
  const value = Math.max(0, Number(rawValue) || 0);
  const fcTotal = Math.max(0, Number(invoiceFc) || 0);
  const lcTotal = Math.max(0, Number(invoiceLc) || 0);
  const rate = Math.max(0, Number(conversionRate) || 0);

  if (field === "percent") {
    return {
      percent: value,
      fc: (fcTotal * value) / 100,
      lc: (lcTotal * value) / 100,
    };
  }

  if (field === "fc") {
    const percent = fcTotal > 0 ? (value / fcTotal) * 100 : 0;
    return {
      percent,
      fc: value,
      lc: lcTotal > 0 ? (lcTotal * percent) / 100 : rate > 0 ? value * rate : 0,
    };
  }

  const percent = lcTotal > 0 ? (value / lcTotal) * 100 : 0;
  return {
    percent,
    fc: fcTotal > 0 ? (fcTotal * percent) / 100 : rate > 0 ? value / rate : 0,
    lc: value,
  };
}

function formatLinkedExpenseText(values: {
  percent: number;
  fc: number;
  lc: number;
}): LinkedExpenseText {
  return {
    percent: formatRateInput(values.percent),
    fc: formatRateInput(values.fc),
    lc: formatRateInput(values.lc),
  };
}

function buildLinkedExpenseTextFromPercent(
  percent: number,
  invoiceFc: number,
  invoiceLc: number,
  conversionRate: number,
): LinkedExpenseText {
  return formatLinkedExpenseText(
    calcLinkedExpenseValues("percent", percent, invoiceFc, invoiceLc, conversionRate),
  );
}

const QUOTATION_QTY_COL_CLASS = "text-right p-2 border-b w-24 whitespace-nowrap";
const QUOTATION_SHIP_DAYS_COL_CLASS = "text-right p-2 border-b w-20 whitespace-nowrap";
const QUOTATION_FC_RATE_COL_CLASS = "text-right p-2 border-b w-24 whitespace-nowrap";
const QUOTATION_LAST_FC_RATE_COL_CLASS =
  "text-right p-2 border-b w-28 whitespace-nowrap";
const QUOTATION_QTY_INPUT_CLASS =
  "h-8 w-24 min-w-0 text-right text-xs px-2 ml-auto";
const QUOTATION_SHIP_DAYS_INPUT_CLASS =
  "h-8 w-20 min-w-0 text-right text-xs px-2 ml-auto";
const QUOTATION_FC_RATE_INPUT_CLASS =
  "h-8 w-24 min-w-0 text-right text-xs px-2 ml-auto";

const INQUIRY_KHI_QTY_INPUT_CLASS =
  "h-8 w-20 text-right ml-auto border-2 border-sky-500 focus-visible:ring-sky-500/30 dark:border-sky-400";
const INQUIRY_ISB_QTY_INPUT_CLASS =
  "h-8 w-20 text-right ml-auto border-2 border-emerald-500 focus-visible:ring-emerald-500/30 dark:border-emerald-400";
const INQUIRY_OTHER_QTY_INPUT_CLASS =
  "h-8 w-20 text-right ml-auto border-2 border-amber-500 focus-visible:ring-amber-500/30 dark:border-amber-400";
const INQUIRY_KHI_QTY_HEAD_CLASS = "text-right p-2 border-b text-sky-700 dark:text-sky-400";
const INQUIRY_ISB_QTY_HEAD_CLASS =
  "text-right p-2 border-b text-emerald-700 dark:text-emerald-400";
const INQUIRY_OTHER_QTY_HEAD_CLASS =
  "text-right p-2 border-b text-amber-700 dark:text-amber-400";
const INQUIRY_KHI_QTY_DISPLAY_CLASS =
  "inline-flex h-8 min-w-[5rem] items-center justify-end rounded-md border-2 border-sky-500 px-2 tabular-nums dark:border-sky-400";
const INQUIRY_ISB_QTY_DISPLAY_CLASS =
  "inline-flex h-8 min-w-[5rem] items-center justify-end rounded-md border-2 border-emerald-500 px-2 tabular-nums dark:border-emerald-400";
const INQUIRY_OTHER_QTY_DISPLAY_CLASS =
  "inline-flex h-8 min-w-[5rem] items-center justify-end rounded-md border-2 border-amber-500 px-2 tabular-nums dark:border-amber-400";

const formatLastFcRateDisplay = (value?: number) => {
  const rate = Number(value || 0);
  if (!Number.isFinite(rate) || rate <= 0) return "-";
  return rate.toFixed(4);
};

const loadLastFcRateForPart = async (
  supplierId: string,
  partId: string,
  excludeQuotationId?: string | null,
): Promise<number> => {
  if (!supplierId || !partId) return 0;
  try {
    const res = await apiClient.getLastSupplierQuotationFcRates(
      supplierId,
      [partId],
      excludeQuotationId || undefined,
    );
    const rates = (res as any)?.data || {};
    return Number(rates[partId] || 0);
  } catch {
    return 0;
  }
};

const createEmptyQuotationRow = (): PurchaseQuotationFormItem => ({
  rowId: createRowId(),
  isNewRow: true,
  partId: "",
  masterPartNo: "",
  partNo: "",
  description: "",
  brand: "",
  currentStock: 0,
  demandQuantity: 0,
  khiQuantity: 0,
  isbQuantity: 0,
  otherQuantity: 0,
  weight: 0,
  quotationQuantity: 0,
  shipDays: 0,
  fcRate: 0,
  fcRateText: "",
  revisedFcRate: 0,
  revisedFcRateText: "",
  lastFcRate: 0,
  loadingPartDetails: false,
});

type NewSupplierForm = {
  code: string;
  type: "local" | "international";
  currencyName: string;
  companyName: string;
  name: string;
  shortTitle: string;
  referenceName: string;
  address: string;
  area: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  phone: string;
  cellNumber: string;
  email: string;
  cnic: string;
  gstNumber: string;
  ntn: string;
  taxId: string;
  paymentTerms: string;
  openingBalance: string;
  date: string;
  status: "active" | "inactive";
  notes: string;
  remarks: string;
};

const emptyNewSupplierForm: NewSupplierForm = {
  code: "",
  type: "local",
  currencyName: "",
  companyName: "",
  name: "",
  shortTitle: "",
  referenceName: "",
  address: "",
  area: "",
  city: "",
  state: "",
  country: "",
  zipCode: "",
  phone: "",
  cellNumber: "",
  email: "",
  cnic: "",
  gstNumber: "",
  ntn: "",
  taxId: "",
  paymentTerms: "",
  openingBalance: "",
  date: "",
  status: "active",
  notes: "",
  remarks: "",
};

const createRowId = () =>
  `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createEmptySupplierRow = (): SupplierRow => ({
  id: createRowId(),
  supplierId: "",
});

const createEmptyItem = (): ItemRow => ({
  id: createRowId(),
  partId: "",
  currentStock: 0,
  salesQty: 0,
  khiQuantity: 0,
  isbQuantity: 0,
  otherQuantity: 0,
  weight: 0,
  totalWeight: 0,
  lastPurchases: [],
  loadingDetails: false,
});

const createEmptyReceiveLine = (): ImportPurchaseOrderReceiveLine => ({
  id: createRowId(),
  partId: "",
  isNewRow: true,
  loadingPartDetails: false,
  masterPartNo: "",
  partNo: "",
  description: "",
  brand: "",
  currentStock: 0,
  demandQuantity: 0,
  quotationQuantity: 0,
  shipDays: 0,
  fcRate: 0,
  fcRateText: "",
  fcAmount: 0,
  lcRate: 0,
  lcAmount: 0,
  weight: 0,
  totalWeight: 0,
  priceA: 0,
  priceB: 0,
  priceAText: "",
  priceBText: "",
  orderQty: 0,
  receiveQty: "",
  additionalQty: 0,
  backQty: 0,
});

const getInquiryRowDemandQuantity = (row: Pick<ItemRow, "khiQuantity" | "isbQuantity" | "otherQuantity">) =>
  Number(row.khiQuantity || 0) +
  Number(row.isbQuantity || 0) +
  (SHOW_OTHER_QTY ? Number(row.otherQuantity || 0) : 0);

const isInquiryConfirmed = (status?: string | null) =>
  String(status || "").trim().toLowerCase() === "confirm";

const formatInquiryListStatus = (status?: string | null) =>
  isInquiryConfirmed(status) ? "Confirmed" : "Pending";

/** Build list consignee label from ISB / KHI (/ Other) split quantities. */
const formatConsigneesFromSplitQuantities = (
  items?: Array<{
    isbQuantity?: number | null;
    khiQuantity?: number | null;
    otherQuantity?: number | null;
  }> | null,
  fallbackConsignee?: string | null,
): string => {
  let hasIsb = false;
  let hasKhi = false;
  let hasOther = false;

  for (const item of items || []) {
    if (Number(item.isbQuantity || 0) > 0) hasIsb = true;
    if (Number(item.khiQuantity || 0) > 0) hasKhi = true;
    if (Number(item.otherQuantity || 0) > 0) hasOther = true;
  }

  const parts: string[] = [];
  if (hasIsb) parts.push("ISB");
  if (hasKhi) parts.push("KHI");
  if (SHOW_OTHER_QTY && hasOther) parts.push("Other");
  if (parts.length > 0) return parts.join(", ");

  const fallback = String(fallbackConsignee || "")
    .trim()
    .toUpperCase();
  if (fallback === "ISB" || fallback === "KHI") return fallback;
  if (fallback === "OTHER") return "Other";
  if (fallback.includes("ISB") || fallback.includes("KHI") || fallback.includes("OTHER")) {
    return String(fallbackConsignee || "").trim();
  }
  return "-";
};

const getQuotationListConsigneeLabel = (
  quotation: PurchaseQuotationRecord,
  options?: {
    purchaseOrderConsignee?: string | null;
  },
): string => {
  const poConsignee = String(options?.purchaseOrderConsignee || "")
    .trim()
    .toUpperCase();
  if (poConsignee === "ISB" || poConsignee === "KHI") return poConsignee;
  if (poConsignee === "OTHER") return "Other";
  if (options?.purchaseOrderConsignee) return options.purchaseOrderConsignee;

  if (quotation.consigneeLabel && quotation.consigneeLabel !== "-") {
    return quotation.consigneeLabel;
  }

  const request =
    quotation.PurchaseImportRequest ||
    (quotation as { purchaseImportRequest?: PurchaseQuotationRecord["PurchaseImportRequest"] })
      .purchaseImportRequest;
  const requestItems =
    request?.PurchaseImportRequestItem ||
    (request as { purchaseImportRequestItem?: PurchaseQuotationRecord["PurchaseImportRequest"]["PurchaseImportRequestItem"] })
      ?.purchaseImportRequestItem;

  return formatConsigneesFromSplitQuantities(requestItems, request?.consignee);
};

const getQuotationRowDemandQuantity = (
  row: Pick<PurchaseQuotationFormItem, "khiQuantity" | "isbQuantity" | "otherQuantity">,
) =>
  Number(row.khiQuantity || 0) +
  Number(row.isbQuantity || 0) +
  (SHOW_OTHER_QTY ? Number(row.otherQuantity || 0) : 0);

const distributeConfirmSplitQuantities = (
  confirmQty: number,
  khi: number,
  isb: number,
  other: number,
): { khiQuantity: number; isbQuantity: number; otherQuantity: number } => {
  const safeConfirm = Math.max(0, Math.floor(Number(confirmQty) || 0));
  if (safeConfirm <= 0) {
    return { khiQuantity: 0, isbQuantity: 0, otherQuantity: 0 };
  }

  const safeKhi = Math.max(0, khi);
  const safeIsb = Math.max(0, isb);
  const safeOther = SHOW_OTHER_QTY ? Math.max(0, other) : 0;
  const splitTotal = safeKhi + safeIsb + safeOther;

  if (splitTotal <= 0) {
    // Default remaining qty to ISB when Other is hidden.
    return {
      khiQuantity: 0,
      isbQuantity: safeConfirm,
      otherQuantity: 0,
    };
  }

  const khiQuantity = Math.round((safeKhi / splitTotal) * safeConfirm);
  const isbQuantity = SHOW_OTHER_QTY
    ? Math.round((safeIsb / splitTotal) * safeConfirm)
    : safeConfirm - khiQuantity;
  let otherQuantity = SHOW_OTHER_QTY
    ? safeConfirm - khiQuantity - isbQuantity
    : 0;
  if (otherQuantity < 0) {
    otherQuantity = 0;
  }

  return { khiQuantity, isbQuantity, otherQuantity };
};

const getConfirmRowSplitSum = (row: {
  isbQuantity?: number;
  khiQuantity?: number;
  otherQuantity?: number;
}) =>
  Number(row.isbQuantity || 0) +
  Number(row.khiQuantity || 0) +
  (SHOW_OTHER_QTY ? Number(row.otherQuantity || 0) : 0);

const getConfirmRowSplitMismatch = (row: {
  confirmQuantity?: number;
  isbQuantity?: number;
  khiQuantity?: number;
  otherQuantity?: number;
  masterPartNo?: string;
  partNo?: string;
}) => {
  const confirmQty = Math.max(0, Math.floor(Number(row.confirmQuantity || 0)));
  if (confirmQty <= 0) return null;

  const splitSum = getConfirmRowSplitSum(row);
  if (splitSum === confirmQty) return null;

  const label = row.masterPartNo || row.partNo || "Item";
  const diff = splitSum - confirmQty;
  const splitLabel = SHOW_OTHER_QTY ? "ISB + KHI + Other" : "ISB + KHI";
  if (diff > 0) {
    return `${label}: ${splitLabel} (${splitSum}) exceeds confirm qty (${confirmQty}) by ${diff}.`;
  }
  return `${label}: ${splitLabel} (${splitSum}) is short of confirm qty (${confirmQty}) by ${Math.abs(diff)}.`;
};

type PartSortFields = {
  masterPartNo?: string;
  partNo?: string;
  description?: string;
  hsCode?: string;
};

const compareInquiryItemSort = (
  a: PartSortFields,
  b: PartSortFields,
  itemSort: InquiryItemSort,
  itemSortDirection: SortDirection,
): number => {
  const directionMultiplier = itemSortDirection === "asc" ? 1 : -1;
  if (itemSort === "description") {
    const descriptionDiff = String(a.description || "")
      .trim()
      .toLowerCase()
      .localeCompare(String(b.description || "").trim().toLowerCase());
    if (descriptionDiff !== 0) return descriptionDiff * directionMultiplier;
  }
  if (itemSort === "hsCode") {
    const hsCodeDiff = String(a.hsCode || "")
      .trim()
      .toLowerCase()
      .localeCompare(String(b.hsCode || "").trim().toLowerCase());
    if (hsCodeDiff !== 0) return hsCodeDiff * directionMultiplier;
  }
  if (itemSort === "numeric") {
    const combinedA = `${a.masterPartNo || ""} ${a.partNo || ""}`;
    const combinedB = `${b.masterPartNo || ""} ${b.partNo || ""}`;
    const matchedA = combinedA.match(/\d+(\.\d+)?/);
    const matchedB = combinedB.match(/\d+(\.\d+)?/);
    const numericA = matchedA ? Number(matchedA[0]) : Number.POSITIVE_INFINITY;
    const numericB = matchedB ? Number(matchedB[0]) : Number.POSITIVE_INFINITY;
    if (numericA !== numericB) return (numericA - numericB) * directionMultiplier;
  }

  const textA = `${a.masterPartNo || ""} ${a.partNo || ""} ${a.description || ""}`
    .trim()
    .toLowerCase();
  const textB = `${b.masterPartNo || ""} ${b.partNo || ""} ${b.description || ""}`
    .trim()
    .toLowerCase();
  return textA.localeCompare(textB) * directionMultiplier;
};

const buildSortedPartSelectOptions = (
  partOptions: PartOption[],
  itemSort: InquiryItemSort,
  itemSortDirection: SortDirection,
) => {
  const sortedParts =
    itemSort === "none"
      ? partOptions
      : [...partOptions].sort((a, b) =>
          compareInquiryItemSort(a, b, itemSort, itemSortDirection),
        );
  return sortedParts.map((p) => ({
    value: p.id,
    label: `${p.masterPartNo || "-"} | ${p.partNo}`,
    description: String(p.description || "").trim() || "-",
    listOnlyDescription: String(p.brand || "").trim() || undefined,
  }));
};

const sortInquiryItemRows = <T extends { partId: string }>(
  rows: T[],
  partOptions: PartOption[],
  itemSort: InquiryItemSort,
  itemSortDirection: SortDirection,
  getRowFields?: (row: T, part?: PartOption) => PartSortFields,
): T[] => {
  if (itemSort === "none") {
    return rows;
  }

  const withPart = rows.filter((row) => row.partId);
  const withoutPart = rows.filter((row) => !row.partId);
  const partById = new Map(partOptions.map((part) => [part.id, part]));
  const resolveFields = (row: T): PartSortFields => {
    if (getRowFields) return getRowFields(row, partById.get(row.partId));
    const part = partById.get(row.partId);
    return {
      masterPartNo: part?.masterPartNo,
      partNo: part?.partNo,
      description: part?.description,
      hsCode: part?.hsCode,
    };
  };
  const sortedWithPart = [...withPart].sort((a, b) =>
    compareInquiryItemSort(resolveFields(a), resolveFields(b), itemSort, itemSortDirection),
  );
  return [...sortedWithPart, ...withoutPart];
};

const buildQuotationPartFieldsFromSelection = (
  alternate: PartOption,
  detailsData: { part?: Record<string, unknown>; currentStock?: number } | null | undefined,
  partOptionsList: PartOption[],
) => {
  const part = (detailsData?.part || {}) as Record<string, unknown>;
  const fromOptions = partOptionsList.find((p) => p.id === alternate.id);
  return {
    partId: alternate.id,
    masterPartNo: String(
      alternate.masterPartNo || part.masterPartNo || fromOptions?.masterPartNo || "",
    ).trim(),
    partNo: String(alternate.partNo || part.partNo || fromOptions?.partNo || "").trim(),
    description: String(
      alternate.description || part.description || fromOptions?.description || "",
    ).trim(),
    brand: String(alternate.brand || part.brand || fromOptions?.brand || "").trim(),
    currentStock: Number(detailsData?.currentStock ?? 0),
    weight: Number(part.weight ?? alternate.weight ?? fromOptions?.weight ?? 0),
    priceA: Number(part.priceA ?? part.price_a ?? 0),
    priceB: Number(part.priceB ?? part.price_b ?? 0),
  };
};

const toInputDate = (value?: string | Date | null) => {
  if (!value) return "";
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) return "";
  return dateObj.toISOString().split("T")[0];
};

const mapApiPartToOption = (row: any): PartOption => ({
  id: String(row.id || ""),
  partNo: String(row.part_no || row.partNo || "").trim(),
  masterPartNo: String(
    row.master_part_no || row.masterPartNo || row.MasterPart?.masterPartNo || "",
  ).trim(),
  description: String(row.description || "").trim(),
  hsCode: String(row.hs_code || row.hsCode || "").trim(),
  brand: String(row.brand_name || row.brand || row.Brand?.name || "").trim(),
  weight: Number(row.weight || 0),
});

const filterAlternateOptions = (
  parts: PartOption[],
  current: Pick<PartOption, "partNo" | "masterPartNo">,
  excludePartId: string,
): PartOption[] => {
  const partNo = String(current.partNo || "").trim();
  const masterPartNo = String(current.masterPartNo || "").trim();
  if (!partNo && !masterPartNo) return [];

  const normalizedPartNo = partNo.toLowerCase();
  const normalizedMaster = masterPartNo.toLowerCase();

  return parts.filter((part) => {
    if (!part.id || part.id === excludePartId) return false;
    const candidatePartNo = String(part.partNo || "").trim().toLowerCase();
    const candidateMaster = String(part.masterPartNo || "").trim().toLowerCase();
    return (
      (normalizedPartNo &&
        (candidatePartNo === normalizedPartNo || candidateMaster === normalizedPartNo)) ||
      (normalizedMaster &&
        (candidatePartNo === normalizedMaster || candidateMaster === normalizedMaster))
    );
  });
};

const fetchAlternatePartsFromPartsApi = async (
  partId: string,
  current: Pick<PartOption, "partNo" | "masterPartNo">,
): Promise<PartOption[]> => {
  const partNo = String(current.partNo || "").trim();
  const masterPartNo = String(current.masterPartNo || "").trim();
  const searchValues = Array.from(new Set([partNo, masterPartNo].filter(Boolean)));
  if (searchValues.length === 0) return [];

  const requests = searchValues.flatMap((value) => [
    apiClient.getParts({ part_no: value, limit: 500, page: 1 }),
    apiClient.getParts({ master_part_no: value, limit: 500, page: 1 }),
  ]);

  const responses = await Promise.all(requests);
  const dedup = new Map<string, PartOption>();
  responses.forEach((res) => {
    const rawParts = Array.isArray((res as { data?: unknown[] })?.data)
      ? (res as { data: unknown[] }).data
      : Array.isArray(res)
        ? (res as unknown[])
        : [];
    rawParts.forEach((row) => {
      const mapped = mapApiPartToOption(row);
      if (mapped.id) dedup.set(mapped.id, mapped);
    });
  });

  return filterAlternateOptions(Array.from(dedup.values()), current, partId);
};

const fetchAlternateParts = async (
  partId: string,
  current?: Pick<PartOption, "partNo" | "masterPartNo">,
): Promise<PartOption[]> => {
  const id = String(partId || "").trim();
  if (!id) return [];

  let resolvedCurrent = current;
  if (!resolvedCurrent?.partNo && !resolvedCurrent?.masterPartNo) {
    const res = await apiClient.getPurchaseImportPartDetails(id);
    const part = (res as { data?: { part?: Record<string, unknown> } })?.data?.part;
    resolvedCurrent = {
      partNo: String(part?.partNo || ""),
      masterPartNo: String(part?.masterPartNo || ""),
    };
  }

  try {
    const res = await apiClient.getPurchaseImportAlternateParts(id);
    if ((res as { error?: string })?.error) {
      throw new Error(String((res as { error?: string }).error));
    }

    const rawParts = Array.isArray((res as { data?: unknown[] })?.data)
      ? (res as { data: unknown[] }).data
      : [];

    const mapped = rawParts
      .map((row) => mapApiPartToOption(row))
      .filter((part) => part.id && part.id !== id);

    const filtered = filterAlternateOptions(
      mapped,
      resolvedCurrent ?? { partNo: "", masterPartNo: "" },
      id,
    );
    if (filtered.length > 0) {
      return filtered;
    }
  } catch {
    // Fall back to parts list API (e.g. when alternate-parts route is unavailable).
  }

  return fetchAlternatePartsFromPartsApi(
    id,
    resolvedCurrent ?? { partNo: "", masterPartNo: "" },
  );
};

const PurchaseImportRequestForm = ({
  requestId,
  readOnly = false,
  onSaved,
  onCancel,
}: {
  requestId?: string | null;
  readOnly?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) => {
  const { toast } = useToast();
  const [loadingForm, setLoadingForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>([]);
  const [partReference, setPartReference] = useState("");
  const [consignee, setConsignee] = useState<"ISB" | "KHI" | "Other">("ISB");
  const [items, setItems] = useState<ItemRow[]>([createEmptyItem()]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [notes, setNotes] = useState("");
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] =
    useState<NewSupplierForm>(emptyNewSupplierForm);
  const [loadingEditRequest, setLoadingEditRequest] = useState(false);
  const [inquiryNumber, setInquiryNumber] = useState("");
  const [inquiryDate, setInquiryDate] = useState(() => toInputDate(new Date()));
  const [itemSort, setItemSort] = useState<InquiryItemSort>("none");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");
  const [brandFilter, setBrandFilter] = useState("all");
  const [salesPeriodMonths, setSalesPeriodMonths] =
    useState<InquirySalesPeriodMonths>(3);
  const [loadingSalesQty, setLoadingSalesQty] = useState(false);
  const [openItemSelectRowId, setOpenItemSelectRowId] = useState<string | null>(null);
  const [jumpToItemRowId, setJumpToItemRowId] = useState("");
  const [highlightedItemRowId, setHighlightedItemRowId] = useState<string | null>(
    null,
  );
  const itemRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const isEditMode = Boolean(requestId);
  const isViewMode = Boolean(readOnly);

  const itemTotals = useMemo(() => {
    const totalWeight = items.reduce(
      (sum, row) => sum + (Number(row.totalWeight) || 0),
      0,
    );
    const totalQty = items.reduce(
      (sum, row) => sum + getInquiryRowDemandQuantity(row),
      0,
    );
    const itemCount = items.filter((row) => row.partId).length;
    return { totalWeight, totalQty, itemCount };
  }, [items]);

  const sortedItems = useMemo(
    () => sortInquiryItemRows(items, partOptions, itemSort, itemSortDirection),
    [items, itemSort, itemSortDirection, partOptions],
  );

  const inquiryItemsScrollRef = useRef<HTMLDivElement>(null);
  const inquiryRowVirtualizer = useVirtualizer({
    count: sortedItems.length,
    getScrollElement: () => inquiryItemsScrollRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });
  const inquiryRowVirtualizerRef = useRef(inquiryRowVirtualizer);
  inquiryRowVirtualizerRef.current = inquiryRowVirtualizer;
  const inquiryVirtualItems = inquiryRowVirtualizer.getVirtualItems();
  const inquiryVirtualPaddingTop =
    inquiryVirtualItems.length > 0 ? inquiryVirtualItems[0].start : 0;
  const inquiryVirtualPaddingBottom =
    inquiryVirtualItems.length > 0
      ? inquiryRowVirtualizer.getTotalSize() -
        inquiryVirtualItems[inquiryVirtualItems.length - 1].end
      : 0;

  const loadSuppliers = async () => {
    const suppliersRes = await apiClient.getSuppliers({
      status: "active",
      page: 1,
      limit: 1000,
    });
    const suppliersData = ((suppliersRes as any)?.data || []).filter(
      (supplier: any) =>
        String(supplier?.type || "")
          .trim()
          .toLowerCase() === "international",
    );
    const nextSuppliers = suppliersData.map((s: any) => ({
      id: s.id,
      label: s.companyName || s.name || s.code || "Unnamed Supplier",
      country: s.country || "-",
      area: s.area || "-",
      type: s.type === "international" ? "international" : "local",
      currencyName: s.currencyName || "",
    }));
    setSupplierOptions(nextSuppliers);
  };

  useEffect(() => {
    const loadInitial = async () => {
      setLoadingForm(true);
      try {
        const partsResPromise = apiClient.getPartsDropdown();
        await loadSuppliers();
        const partsRes = await partsResPromise;

        const partsData = (partsRes as any)?.data || [];
        const nextParts = partsData.map((p: any) => ({
          id: p.id,
          partNo: p.partNo || "",
          masterPartNo: p.masterPartNo || "",
          description: p.description || "",
          hsCode: p.hs_code || p.hsCode || "",
          brand: p.brand || "",
          weight: Number(p.weight || 0),
        }));
        setPartOptions(nextParts);

        if (requestId) {
          setLoadingEditRequest(true);
          const requestRes = await apiClient.getPurchaseImportRequestById(requestId);
          const editData = (requestRes as any)?.data as
            | PurchaseImportRequestEditPayload
            | undefined;

          if (editData) {
            const editSupplierIds = Array.isArray(editData.supplierIds)
              ? editData.supplierIds
              : [];
            setSupplierRows(
              editSupplierIds.map((supplierId) => ({
                id: createRowId(),
                supplierId,
              })),
            );
            const normalizedConsignee = String(editData.consignee || "")
              .trim()
              .toUpperCase();
            setConsignee(
              normalizedConsignee === "KHI"
                ? "KHI"
                : normalizedConsignee === "OTHER"
                  ? "Other"
                  : "ISB",
            );
            setNotes(editData.notes || "");
            setPartReference(editData.partReference || "");
            setInquiryNumber(
              editData.baseRequestNo || editData.requestNo || "",
            );
            setInquiryDate(toInputDate(editData.requestDate));
            setJumpToItemRowId("");

            const nextItems = Array.isArray(editData.items)
              ? editData.items.map((item, index) => {
                  const demandQty = Number(item.demandQuantity || 0);
                  const rawKhi = Number(item.khiQuantity || 0);
                  const rawIsb = Number(item.isbQuantity || 0);
                  const rawOther = Number(item.otherQuantity || 0);
                  const splitQty = rawKhi + rawIsb + rawOther;
                  const khiQuantity =
                    splitQty > 0 ? rawKhi : normalizedConsignee === "KHI" ? demandQty : 0;
                  const isbBase =
                    splitQty > 0 ? rawIsb : normalizedConsignee === "ISB" ? demandQty : 0;
                  const otherBase =
                    splitQty > 0 ? rawOther : normalizedConsignee === "OTHER" ? demandQty : 0;
                  const isbQuantity = SHOW_OTHER_QTY ? isbBase : isbBase + otherBase;
                  const otherQuantity = SHOW_OTHER_QTY ? otherBase : 0;

                  return {
                    id: `row-${item.partId}-${index}-${Math.random().toString(16).slice(2)}`,
                    partId: item.partId || "",
                    currentStock: Number(item.currentStock || 0),
                    salesQty: 0,
                    khiQuantity,
                    isbQuantity,
                    otherQuantity,
                    weight: Number(item.weight || 0),
                    totalWeight:
                      Number(item.totalWeight || 0) ||
                      Number(item.weight || 0) * (khiQuantity + isbQuantity + otherQuantity),
                    lastPurchases: [],
                    loadingDetails: false,
                  };
                })
              : [];

            if (nextItems.length > 0) {
              // Use saved stock/weight from the request — do not N-fetch part details
              // (that freezes edit of 100–1000 line inquiries).
              setItems([...nextItems, createEmptyItem()]);
            } else {
              setItems([createEmptyItem()]);
            }
          }
        }
      } catch (error: any) {
        toast({
          title: "Failed to load form data",
          description: error?.message || "Could not load suppliers and items.",
          variant: "destructive",
        });
      } finally {
        setLoadingEditRequest(false);
        setLoadingForm(false);
      }
    };

    loadInitial();
  }, [toast, requestId]);

  const brandOptions = useMemo(
    () =>
      [...new Set(partOptions.map((part) => part.brand).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [partOptions],
  );

  const partById = useMemo(
    () => new Map(partOptions.map((part) => [part.id, part])),
    [partOptions],
  );

  const selectedPartIdsKey = items.map((row) => row.partId).join("|");

  // One shared options list — never rebuild a full catalog copy per row.
  // Allow duplicate items/alternates (no uniqueness enforcement on select).
  const partSelectOptions = useMemo(() => {
    const selectedPartIds = new Set(
      selectedPartIdsKey.split("|").filter(Boolean),
    );
    const brandFilteredParts =
      brandFilter === "all"
        ? partOptions
        : partOptions.filter(
            (part) =>
              part.brand === brandFilter || selectedPartIds.has(part.id),
          );
    return buildSortedPartSelectOptions(
      brandFilteredParts,
      itemSort,
      itemSortDirection,
    );
  }, [partOptions, brandFilter, selectedPartIdsKey, itemSort, itemSortDirection]);

  const brandSelectOptions = useMemo(
    () => [
      { value: "all", label: "All Brands" },
      ...brandOptions.map((brand) => ({
        value: brand,
        label: brand,
      })),
    ],
    [brandOptions],
  );

  const inquirySelectedItemOptions = useMemo(() => {
    const partById = new Map(partOptions.map((part) => [part.id, part]));
    return items
      .filter((row) => row.partId)
      .map((row) => {
        const part = partById.get(row.partId);
        return {
          value: row.id,
          label: `${part?.masterPartNo || "-"} | ${part?.partNo || "-"}`,
          description: part?.description || "-",
        };
      });
  }, [items, partOptions]);

  const scrollToInquiryItemRow = useCallback((rowId: string) => {
    if (!rowId) return;
    const index = sortedItems.findIndex((row) => row.id === rowId);
    if (index >= 0) {
      inquiryRowVirtualizerRef.current.scrollToIndex(index, { align: "center" });
    }
    requestAnimationFrame(() => {
      const rowEl = itemRowRefs.current[rowId];
      rowEl?.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightedItemRowId(rowId);
      window.setTimeout(() => {
        setHighlightedItemRowId((current) =>
          current === rowId ? null : current,
        );
      }, 2000);
    });
  }, [sortedItems]);

  useEffect(() => {
    if (!jumpToItemRowId) return;
    scrollToInquiryItemRow(jumpToItemRowId);
  }, [jumpToItemRowId, sortedItems, scrollToInquiryItemRow]);

  useEffect(() => {
    if (!jumpToItemRowId) return;
    if (!items.some((row) => row.id === jumpToItemRowId && row.partId)) {
      setJumpToItemRowId("");
    }
  }, [items, jumpToItemRowId]);

  const handleBrandFilterChange = (value: string) => {
    setBrandFilter(value || "all");
  };

  const handleInquiryItemJump = (rowId: string) => {
    setJumpToItemRowId(rowId);
  };

  const supplierSelectOptions = useMemo(
    () =>
      supplierOptions.map((supplier) => ({
        value: supplier.id,
        label: supplier.label,
        description: `${supplier.country || "-"} | ${supplier.area || "-"} | ${supplier.type === "international" ? "International" : "Local"}${supplier.type === "international" && supplier.currencyName ? ` | ${supplier.currencyName}` : ""}`,
      })),
    [supplierOptions],
  );

  const selectedSupplierIds = useMemo(
    () =>
      [
        ...new Set(
          supplierRows.map((row) => row.supplierId).filter(Boolean),
        ),
      ],
    [supplierRows],
  );

  const getSupplierOptionsForRow = (rowId: string) => {
    const usedIds = new Set(
      supplierRows
        .filter((row) => row.id !== rowId && row.supplierId)
        .map((row) => row.supplierId),
    );
    return supplierSelectOptions.filter((opt) => !usedIds.has(opt.value));
  };

  const addSupplierRow = () => {
    setSupplierRows((prev) => [...prev, createEmptySupplierRow()]);
  };

  const updateSupplierRow = (rowId: string, supplierId: string) => {
    setSupplierRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, supplierId } : row)),
    );
  };

  const removeSupplierRow = (rowId: string) => {
    setSupplierRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const handleSupplierFieldChange = (field: keyof NewSupplierForm, value: string) => {
    setNewSupplierForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name") {
        const initials = value
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w[0].toUpperCase())
          .join("")
          .slice(0, 3);
        next.shortTitle = initials;
      }
      return next;
    });
  };

  const handleCreateSupplier = async () => {
    const companyOrName =
      newSupplierForm.companyName.trim() || newSupplierForm.name.trim();
    if (!companyOrName) {
      toast({
        title: "Supplier name required",
        description: "Please enter at least company name or title.",
        variant: "destructive",
      });
      return;
    }

    setAddingSupplier(true);
    try {
      const payload = {
        code: newSupplierForm.code.trim() || undefined,
        type: newSupplierForm.type,
        currencyName:
          newSupplierForm.type === "international"
            ? newSupplierForm.currencyName.trim() || undefined
            : undefined,
        companyName: companyOrName,
        name: newSupplierForm.name.trim() || undefined,
        shortTitle: newSupplierForm.shortTitle.trim() || undefined,
        referenceName: newSupplierForm.referenceName.trim() || undefined,
        address: newSupplierForm.address.trim() || undefined,
        area: newSupplierForm.area.trim() || undefined,
        city: newSupplierForm.city.trim() || undefined,
        state: newSupplierForm.state.trim() || undefined,
        country: newSupplierForm.country.trim() || undefined,
        zipCode: newSupplierForm.zipCode.trim() || undefined,
        phone: newSupplierForm.phone.trim() || undefined,
        cellNumber: newSupplierForm.cellNumber.trim() || undefined,
        email: newSupplierForm.email.trim() || undefined,
        cnic: newSupplierForm.cnic.trim() || undefined,
        gstNumber: newSupplierForm.gstNumber.trim() || undefined,
        ntn: newSupplierForm.ntn.trim() || undefined,
        taxId: newSupplierForm.taxId.trim() || undefined,
        paymentTerms: newSupplierForm.paymentTerms.trim() || undefined,
        openingBalance: Number(newSupplierForm.openingBalance || 0),
        date: newSupplierForm.date || undefined,
        status: newSupplierForm.status,
        notes: newSupplierForm.notes.trim() || undefined,
        remarks: newSupplierForm.remarks.trim() || undefined,
      };
      const created = await apiClient.createSupplier(payload as any);
      const createdId = (created as any)?.data?.id;
      await loadSuppliers();
      if (createdId) {
        setSupplierRows((prev) => {
          const emptyRowIndex = prev.findIndex((row) => !row.supplierId);
          if (emptyRowIndex >= 0) {
            return prev.map((row, index) =>
              index === emptyRowIndex ? { ...row, supplierId: createdId } : row,
            );
          }
          return [...prev, { id: createRowId(), supplierId: createdId }];
        });
      }
      setNewSupplierForm(emptyNewSupplierForm);
      setIsSupplierDialogOpen(false);
      toast({
        title: "Supplier added",
        description: "New supplier has been created and selected.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to add supplier",
        description:
          error?.response?.data?.error || error?.message || "Could not create supplier.",
        variant: "destructive",
      });
    } finally {
      setAddingSupplier(false);
    }
  };

  const addItemRow = useCallback(() => {
    const newItem = createEmptyItem();
    setItems((prev) => [...prev, newItem]);
    window.requestAnimationFrame(() => {
      const lastIndex = Math.max(
        0,
        inquiryRowVirtualizerRef.current.options.count - 1,
      );
      inquiryRowVirtualizerRef.current.scrollToIndex(lastIndex, {
        align: "end",
      });
      setOpenItemSelectRowId(newItem.id);
      window.setTimeout(() => setOpenItemSelectRowId(null), 400);
    });
  }, []);

  useEffect(() => {
    if (isViewMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        addItemRow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isViewMode, addItemRow]);

  const removeItemRow = (rowId: string) => {
    if (jumpToItemRowId === rowId) {
      setJumpToItemRowId("");
    }
    setItems((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== rowId) : prev));
  };

  const updateItem = (rowId: string, patch: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, ...patch };
        next.totalWeight =
          (Number(next.weight) || 0) * getInquiryRowDemandQuantity(next);
        return next;
      }),
    );
  };

  const fetchPartDetails = async (rowId: string, partId: string) => {
    if (!partId) {
      updateItem(rowId, {
        partId: "",
        currentStock: 0,
        salesQty: 0,
        weight: 0,
        lastPurchases: [],
      });
      return;
    }

    // Allow duplicate items and alternates; we only validate required fields on save.
    const candidatePart = partById.get(partId);

    const localWeight = Number(candidatePart?.weight || 0);
    updateItem(rowId, {
      partId,
      weight: localWeight,
      salesQty: 0,
      loadingDetails: true,
    });
    try {
      const res = await apiClient.getPurchaseImportPartDetails(partId, {
        includeHistory: SHOW_INQUIRY_LAST_PURCHASES,
      });
      const details = (res as any)?.data;
      updateItem(rowId, {
        partId,
        currentStock: Number(details?.currentStock || 0),
        weight: Number(details?.part?.weight ?? localWeight) || 0,
        lastPurchases: Array.isArray(details?.lastPurchases)
          ? details.lastPurchases
          : [],
        loadingDetails: false,
      });
    } catch {
      updateItem(rowId, { loadingDetails: false });
      toast({
        title: "Failed to load part details",
        description: "Could not fetch current stock and purchase history.",
        variant: "destructive",
      });
    }
  };

  const inquiryPartIdsKey = items
    .map((row) => row.partId)
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    const partIds = Array.from(
      new Set(
        inquiryPartIdsKey
          .split("|")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    );

    if (partIds.length === 0) {
      setItems((prev) =>
        prev.map((row) => (row.salesQty === 0 ? row : { ...row, salesQty: 0 })),
      );
      return;
    }

    let cancelled = false;
    const loadSales = async () => {
      setLoadingSalesQty(true);
      try {
        const res = await apiClient.getPurchaseImportPartsSales({
          partIds,
          months: salesPeriodMonths,
        });
        if (cancelled) return;
        const salesByPartId =
          ((res as any)?.data as Record<string, number> | undefined) || {};
        setItems((prev) =>
          prev.map((row) => {
            if (!row.partId) {
              return row.salesQty === 0 ? row : { ...row, salesQty: 0 };
            }
            const nextQty = Number(salesByPartId[row.partId] || 0);
            return row.salesQty === nextQty ? row : { ...row, salesQty: nextQty };
          }),
        );
      } catch {
        if (cancelled) return;
        toast({
          title: "Failed to load sales",
          description: "Could not fetch sold quantities for the selected period.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoadingSalesQty(false);
      }
    };

    void loadSales();
    return () => {
      cancelled = true;
    };
  }, [inquiryPartIdsKey, salesPeriodMonths, toast]);

  const handleSave = async () => {
    const currentItems = itemsRef.current;
    const incompleteRows = currentItems.filter(
      (row) =>
        (row.partId && getInquiryRowDemandQuantity(row) <= 0) ||
        (!row.partId && getInquiryRowDemandQuantity(row) > 0),
    );
    if (incompleteRows.length > 0) {
      toast({
        title: "Incomplete item rows",
        description:
          "Each item row needs a part selected from the dropdown and demand quantity greater than zero. Click the part option in the list to select it (typing alone is not enough).",
        variant: "destructive",
      });
      return;
    }

    const validItems = currentItems.filter(
      (row) => row.partId && getInquiryRowDemandQuantity(row) > 0,
    );
    if (validItems.length === 0) {
      toast({
        title: "Items required",
        description: "Please add at least one item with demand quantity.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierIds: selectedSupplierIds,
        partReference,
        notes,
        requestDate: inquiryDate,
        items: validItems.map((row) => ({
          partId: row.partId,
          demandQuantity: getInquiryRowDemandQuantity(row),
          khiQuantity: Number(row.khiQuantity || 0),
          isbQuantity: Number(row.isbQuantity || 0),
          otherQuantity: SHOW_OTHER_QTY ? Number(row.otherQuantity || 0) : 0,
          weight: Number(row.weight || 0),
        })),
      };

      if (requestId) {
        const res = await apiClient.updatePurchaseImportRequest(requestId, payload);
        const updatedCount = (res as any)?.data?.updatedCount || 0;

        toast({
          title: "Purchase import inquiry updated",
          description: `${validItems.length} item(s) saved.${
            selectedSupplierIds.length > 0
              ? ` (${updatedCount} records across suppliers.)`
              : ""
          }`,
        });
        onSaved?.();
        return;
      } else {
        const res = await apiClient.createPurchaseImportRequest(payload);
        const createdCount = (res as any)?.data?.createdCount || 0;
        const baseRequestNo = (res as any)?.data?.baseRequestNo as
          | string
          | undefined;
        if (baseRequestNo) {
          setInquiryNumber(baseRequestNo);
          setInquiryDate(toInputDate(new Date()));
        }
        toast({
          title: "Purchase import inquiry saved",
          description:
            selectedSupplierIds.length > 0
              ? `${createdCount} records were created based on selected suppliers.`
              : `${createdCount} records were created.`,
        });
      }

      setSupplierRows([]);
      setPartReference("");
      setItems([createEmptyItem()]);
      setNotes("");
      setInquiryNumber("");
      setInquiryDate(toInputDate(new Date()));
      onSaved?.();
    } catch (error: any) {
      const apiError =
        error?.response?.data?.error || error?.message || "Could not save inquiry.";
      const isDuplicateRequestNo = /requestNo|Unique constraint/i.test(String(apiError));
      toast({
        title: "Save failed",
        description:
          isDuplicateRequestNo && !requestId
            ? "This inquiry number already exists. Open it from Inquiry List and click Edit to update it."
            : apiError,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-5">
      <div className={cn("space-y-5", isViewMode && "pointer-events-none opacity-95")}>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(140px,220px)_1fr] gap-4 items-start">
        <div className="space-y-2 min-w-0">
          <Label>Part Reference</Label>
          <Input
            value={partReference}
            onChange={(e) => setPartReference(e.target.value)}
            placeholder="Part reference"
            disabled={loadingForm}
          />
        </div>
        <div className="space-y-2 min-w-0">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this import inquiry"
            className="min-h-[40px]"
          />
        </div>
      </div>

      <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Code (optional)</Label>
                <Input
                  value={newSupplierForm.code}
                  onChange={(e) => handleSupplierFieldChange("code", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={newSupplierForm.type}
                  onValueChange={(value: "local" | "international") =>
                    setNewSupplierForm((prev) => ({
                      ...prev,
                      type: value,
                      currencyName:
                        value === "international" ? prev.currencyName : "",
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newSupplierForm.type === "international" && (
                <div className="space-y-1">
                  <Label className="text-xs">Currency Name</Label>
                  <Input
                    value={newSupplierForm.currencyName}
                    onChange={(e) =>
                      handleSupplierFieldChange("currencyName", e.target.value)
                    }
                    placeholder="e.g. USD"
                    className="h-8 text-xs uppercase"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Company Name</Label>
                <Input
                  value={newSupplierForm.companyName}
                  onChange={(e) =>
                    handleSupplierFieldChange("companyName", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  value={newSupplierForm.name}
                  onChange={(e) => handleSupplierFieldChange("name", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Short Title</Label>
                <Input
                  value={newSupplierForm.shortTitle}
                  onChange={(e) =>
                    handleSupplierFieldChange("shortTitle", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                value={newSupplierForm.address}
                onChange={(e) => handleSupplierFieldChange("address", e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Area</Label>
                <Input
                  value={newSupplierForm.area}
                  onChange={(e) => handleSupplierFieldChange("area", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input
                  value={newSupplierForm.city}
                  onChange={(e) => handleSupplierFieldChange("city", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input
                  value={newSupplierForm.state}
                  onChange={(e) => handleSupplierFieldChange("state", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Input
                  value={newSupplierForm.country}
                  onChange={(e) =>
                    handleSupplierFieldChange("country", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Zip Code</Label>
                <Input
                  value={newSupplierForm.zipCode}
                  onChange={(e) =>
                    handleSupplierFieldChange("zipCode", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={newSupplierForm.phone}
                  onChange={(e) => handleSupplierFieldChange("phone", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cell Number</Label>
                <Input
                  value={newSupplierForm.cellNumber}
                  onChange={(e) =>
                    handleSupplierFieldChange("cellNumber", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={newSupplierForm.email}
                  onChange={(e) => handleSupplierFieldChange("email", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">CNIC</Label>
                <Input
                  value={newSupplierForm.cnic}
                  onChange={(e) => handleSupplierFieldChange("cnic", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">GST Number</Label>
                <Input
                  value={newSupplierForm.gstNumber}
                  onChange={(e) =>
                    handleSupplierFieldChange("gstNumber", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">NTN</Label>
                <Input
                  value={newSupplierForm.ntn}
                  onChange={(e) => handleSupplierFieldChange("ntn", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tax ID</Label>
                <Input
                  value={newSupplierForm.taxId}
                  onChange={(e) => handleSupplierFieldChange("taxId", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Terms</Label>
                <Input
                  value={newSupplierForm.paymentTerms}
                  onChange={(e) =>
                    handleSupplierFieldChange("paymentTerms", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Opening Balance</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newSupplierForm.openingBalance}
                  onChange={(e) =>
                    handleSupplierFieldChange("openingBalance", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Account Opening Date</Label>
                <Input
                  type="date"
                  value={newSupplierForm.date}
                  onChange={(e) => handleSupplierFieldChange("date", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={newSupplierForm.status}
                  onValueChange={(value: "active" | "inactive") =>
                    setNewSupplierForm((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={newSupplierForm.notes}
                  onChange={(e) => handleSupplierFieldChange("notes", e.target.value)}
                  className="text-xs min-h-[60px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Remarks</Label>
                <Textarea
                  value={newSupplierForm.remarks}
                  onChange={(e) =>
                    handleSupplierFieldChange("remarks", e.target.value)
                  }
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={handleCreateSupplier}
                disabled={addingSupplier}
                className="flex-1"
              >
                {addingSupplier ? "Saving..." : "Save Supplier"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSupplierDialogOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
<div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Items</h3>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isEditMode && !isViewMode && inquirySelectedItemOptions.length > 0 && (
              <SearchableSelect
                options={inquirySelectedItemOptions}
                value={jumpToItemRowId}
                onValueChange={handleInquiryItemJump}
                placeholder="Go to item..."
                aria-label="Jump to inquiry item"
                className="w-[260px] [&_input]:h-9 [&_input]:text-sm"
                disabled={loadingForm}
              />
            )}
            <SearchableSelect
              options={brandSelectOptions}
              value={brandFilter}
              onValueChange={handleBrandFilterChange}
              placeholder="All Brands"
              aria-label="Filter by brand"
              className="w-[180px] [&_input]:h-9 [&_input]:text-sm"
              disabled={loadingForm}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Sales Period
              </Label>
              <Select
                value={String(salesPeriodMonths)}
                onValueChange={(value) =>
                  setSalesPeriodMonths(Number(value) as InquirySalesPeriodMonths)
                }
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="9">9 Months</SelectItem>
                  <SelectItem value="12">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={itemSort} onValueChange={(value: InquiryItemSort) => setItemSort(value)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sort: Entry Order</SelectItem>
                <SelectItem value="alphabetical">Sort: Alphabetical</SelectItem>
                <SelectItem value="numeric">Sort: Numeric</SelectItem>
                <SelectItem value="description">Sort: Description</SelectItem>
                <SelectItem value="hsCode">Sort: HS Code</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={itemSortDirection}
              onValueChange={(value: SortDirection) => setItemSortDirection(value)}
              disabled={itemSort === "none"}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={addItemRow}>
              <Plus className="w-4 h-4 mr-1" />
              Add Item (Alt + Z)
            </Button>
          </div>
        </div>

        <div
          ref={inquiryItemsScrollRef}
          className="max-h-[70vh] overflow-auto border border-border rounded-md"
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr>
                <th className="text-center p-2 border-b w-12 bg-muted/40">#</th>
                <th className="text-left p-2 border-b bg-muted/40">Item</th>
                <th className="text-right p-2 border-b bg-muted/40">Current Stock</th>
                <th className="text-right p-2 border-b bg-muted/40 whitespace-nowrap">
                  Sales
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {salesPeriodMonths === 12 ? "1 Year" : `${salesPeriodMonths} Mo`}
                  </span>
                </th>
                <th className={`${INQUIRY_ISB_QTY_HEAD_CLASS} bg-muted/40`}>ISB Qty</th>
                <th className={`${INQUIRY_KHI_QTY_HEAD_CLASS} bg-muted/40`}>KHI Qty</th>
                <th className="text-right p-2 border-b bg-muted/40">Total Demand</th>
                <th className="text-right p-2 border-b bg-muted/40">Weight</th>
                <th className="text-right p-2 border-b bg-muted/40">Total Weight</th>
                <th className="text-center p-2 border-b w-16 bg-muted/40">Action</th>
              </tr>
            </thead>
            <tbody>
              {inquiryVirtualPaddingTop > 0 ? (
                <tr aria-hidden="true">
                  <td
                    colSpan={10}
                    style={{
                      height: inquiryVirtualPaddingTop,
                      padding: 0,
                      border: 0,
                    }}
                  />
                </tr>
              ) : null}
              {inquiryVirtualItems.map((virtualRow) => {
                const row = sortedItems[virtualRow.index];
                const index = virtualRow.index;
                if (!row) return null;
                return (
                <Fragment key={row.id}>
                  <tr
                    data-index={virtualRow.index}
                    ref={(el) => {
                      itemRowRefs.current[row.id] = el;
                      if (el) inquiryRowVirtualizer.measureElement(el);
                    }}
                    className={cn(
                      "align-top",
                      highlightedItemRowId === row.id &&
                        "bg-primary/10 ring-2 ring-primary/30 ring-inset",
                    )}
                  >
                    <td className="p-2 border-b text-center text-muted-foreground tabular-nums">
                      {index + 1}
                    </td>
                    <td className="p-2 border-b min-w-[320px]">
                      <SearchableSelect
                        options={partSelectOptions}
                        value={row.partId}
                        onValueChange={(partId) => fetchPartDetails(row.id, partId)}
                        placeholder="Master Part | Part No"
                        disabled={loadingForm}
                        autoOpen={openItemSelectRowId === row.id}
                      />
                      {row.loadingDetails && (
                        <p className="text-xs text-muted-foreground mt-1">Loading details...</p>
                      )}
                    </td>
                    <td className="p-2 border-b text-right">{row.currentStock}</td>
                    <td className="p-2 border-b text-right tabular-nums">
                      {!row.partId
                        ? "-"
                        : loadingSalesQty
                          ? "..."
                          : row.salesQty}
                    </td>
                    <td className="p-2 border-b">
                      <Input
                        type="number"
                        min={0}
                        className={INQUIRY_ISB_QTY_INPUT_CLASS}
                        value={row.isbQuantity === 0 ? "" : row.isbQuantity}
                        onChange={(e) =>
                          updateItem(row.id, {
                            isbQuantity: Number(e.target.value || 0),
                          })
                        }
                      />
                    </td>
                    <td className="p-2 border-b">
                      <Input
                        type="number"
                        min={0}
                        className={INQUIRY_KHI_QTY_INPUT_CLASS}
                        value={row.khiQuantity === 0 ? "" : row.khiQuantity}
                        onChange={(e) =>
                          updateItem(row.id, {
                            khiQuantity: Number(e.target.value || 0),
                          })
                        }
                      />
                    </td>
                    {/* <td className="p-2 border-b">
                      <Input
                        type="number"
                        min={0}
                        className={INQUIRY_OTHER_QTY_INPUT_CLASS}
                        value={row.otherQuantity === 0 ? "" : row.otherQuantity}
                        onChange={(e) =>
                          updateItem(row.id, {
                            otherQuantity: Number(e.target.value || 0),
                          })
                        }
                      />
                    </td> */}
                    <td className="p-2 border-b text-right font-medium tabular-nums">
                      {getInquiryRowDemandQuantity(row)}
                    </td>
                    <td className="p-2 border-b">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 text-right"
                        value={row.weight}
                        onChange={(e) =>
                          updateItem(row.id, {
                            weight: Number(e.target.value || 0),
                          })
                        }
                      />
                    </td>
                    <td className="p-2 border-b text-right font-medium">
                      {row.totalWeight.toFixed(2)}
                    </td>
                    <td className="p-2 border-b text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItemRow(row.id)}
                        disabled={items.length === 1}
                      >
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                  {SHOW_INQUIRY_LAST_PURCHASES ? (
                  <tr>
                    <td colSpan={10} className="px-2 pb-3 border-b">
                      <div className="rounded-md border border-dashed border-border p-2">
                        <p className="text-xs font-medium mb-2">Last 3 Purchases</p>
                        {row.lastPurchases.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No purchase history found.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left py-1">Date</th>
                                  <th className="text-left py-1">Source</th>
                                  <th className="text-left py-1">Doc No</th>
                                  <th className="text-left py-1">Supplier</th>
                                  <th className="text-right py-1">Qty</th>
                                  <th className="text-right py-1">Rate</th>
                                  <th className="text-right py-1">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.lastPurchases.map((p, idx) => (
                                  <tr key={`${row.id}-p-${idx}`} className="border-t">
                                    <td className="py-1">
                                      {p.date ? new Date(p.date).toLocaleDateString() : "-"}
                                    </td>
                                    <td className="py-1">{p.source}</td>
                                    <td className="py-1">{p.documentNumber}</td>
                                    <td className="py-1">{p.supplierName}</td>
                                    <td className="py-1 text-right">{p.quantity}</td>
                                    <td className="py-1 text-right">{Number(p.rate || 0).toFixed(2)}</td>
                                    <td className="py-1 text-right">{Number(p.amount || 0).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  ) : null}
                </Fragment>
                );
              })}
              {inquiryVirtualPaddingBottom > 0 ? (
                <tr aria-hidden="true">
                  <td
                    colSpan={10}
                    style={{
                      height: inquiryVirtualPaddingBottom,
                      padding: 0,
                      border: 0,
                    }}
                  />
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold border-t">
                <td className="p-2" />
                <td className="p-2 text-left">
                  Total Items:{" "}
                  <span className="tabular-nums">{itemTotals.itemCount}</span>
                </td>
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2 text-right tabular-nums">
                  {itemTotals.totalQty}
                </td>
                <td className="p-2" />
                <td className="p-2 text-right tabular-nums">
                  {itemTotals.totalWeight.toFixed(2)}
                </td>
                <td className="p-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            onClick={addSupplierRow}
            disabled={loadingForm}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Supplier
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setIsSupplierDialogOpen(true)}
            disabled={loadingForm}
            title="Add new supplier"
          >
            <Plus className="w-4 h-4" />
            <span className="sr-only">Add new supplier</span>
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-muted-foreground border-b">
                <th className="text-left p-2 min-w-[280px] w-[32%]">Supplier</th>
                <th className="text-left p-2 w-[100px]">Country</th>
                <th className="text-left p-2 w-[80px]">Area</th>
                <th className="text-left p-2 w-[80px]">Currency</th>
                <th className="text-center p-2 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-3 text-xs text-muted-foreground text-center"
                  >
                    No suppliers added. Click Add Supplier to add a row.
                  </td>
                </tr>
              ) : (
                supplierRows.map((row) => {
                  const supplier = supplierOptions.find(
                    (s) => s.id === row.supplierId,
                  );
                  return (
                    <tr key={row.id} className="border-b align-top">
                      <td className="p-2 min-w-[280px] w-[32%]">
                        <SearchableSelect
                          options={getSupplierOptionsForRow(row.id)}
                          value={row.supplierId}
                          onValueChange={(supplierId) =>
                            updateSupplierRow(row.id, supplierId)
                          }
                          placeholder="Select supplier"
                          disabled={loadingForm}
                          selectedDisplayLabelOnly
                          className="w-full"
                        />
                      </td>
                      <td className="p-2">{supplier?.country || "-"}</td>
                      <td className="p-2">{supplier?.area || "-"}</td>
                      <td className="p-2 uppercase">
                        {supplier?.currencyName || "-"}
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeSupplierRow(row.id)}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-2">
            <Label>Inquiry Number</Label>
            <Input
              value={inquiryNumber || "—"}
              disabled
              readOnly
              className="bg-muted/40"
            />
          </div>
          <div className="space-y-2">
            <Label>Inquiry Date</Label>
            <Input
              type="date"
              value={inquiryDate}
              onChange={(e) => setInquiryDate(e.target.value)}
              disabled={isViewMode}
              readOnly={isViewMode}
              className={isViewMode ? "bg-muted/40" : undefined}
            />
          </div>
        </div>
      </div>

      {isViewMode ? (
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Back to List
          </Button>
        </div>
      ) : (
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loadingForm || loadingEditRequest}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : isEditMode ? "Update Inquiry" : "Save Inquiry"}
          </Button>
        </div>
      )}
    </div>
  );
};

const PurchaseImportRequestView = ({
  requestId,
  onBack,
}: {
  requestId: string;
  onBack: () => void;
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PurchaseImportRequestEditPayload | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [itemSort, setItemSort] = useState<InquiryItemSort>("none");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    let cancelled = false;

    const loadView = async () => {
      setLoading(true);
      try {
        const [requestRes, suppliersRes, partsRes] = await Promise.all([
          apiClient.getPurchaseImportRequestById(requestId),
          apiClient.getSuppliers({ page: 1, limit: 1000 }),
          apiClient.getPartsDropdown(),
        ]);

        if (cancelled) return;

        const requestData = (requestRes as any)?.data as
          | PurchaseImportRequestEditPayload
          | undefined;
        if (!requestData) {
          throw new Error("Inquiry detail is unavailable.");
        }

        setDetail(requestData);
        setSupplierOptions(
          (((suppliersRes as any)?.data || []) as any[]).map((s) => ({
            id: s.id,
            label: s.companyName || s.name || s.code || "Unnamed Supplier",
            country: s.country || "-",
            area: s.area || "-",
            type: s.type === "international" ? "international" : "local",
            currencyName: s.currencyName || "",
          })),
        );
        setPartOptions(
          (((partsRes as any)?.data || []) as any[]).map((p) => ({
            id: p.id || "",
            partNo: p.partNo || "",
            masterPartNo: p.masterPartNo || "",
            description: p.description || "",
            hsCode: p.hs_code || p.hsCode || "",
            brand: p.brand || "",
            weight: Number(p.weight || 0),
          })),
        );
      } catch (error: any) {
        if (cancelled) return;
        toast({
          title: "Failed to load inquiry",
          description: error?.message || "Could not load inquiry detail.",
          variant: "destructive",
        });
        onBackRef.current();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadView();

    return () => {
      cancelled = true;
    };
  }, [requestId, toast]);

  const supplierRows = useMemo(
    () =>
      (detail?.supplierIds || []).map((supplierId) => {
        const supplier = supplierOptions.find((row) => row.id === supplierId);
        return {
          supplierId,
          name: supplier?.label || supplierId,
          country: supplier?.country || "-",
          area: supplier?.area || "-",
          type: supplier?.type || "-",
          currencyName: supplier?.currencyName || "-",
        };
      }),
    [detail?.supplierIds, supplierOptions],
  );

  const itemRows = useMemo(
    () =>
      (detail?.items || []).map((item) => {
        const part = partOptions.find((row) => row.id === item.partId);
        const khiQuantity = Number(item.khiQuantity || 0);
        const isbQuantity = Number(item.isbQuantity || 0);
        const otherQuantity = SHOW_OTHER_QTY ? Number(item.otherQuantity || 0) : 0;
        const totalDemand =
          khiQuantity + isbQuantity + otherQuantity ||
          Number(item.demandQuantity || 0);
        const weight = Number(item.weight || part?.weight || 0);
        return {
          ...item,
          masterPartNo: part?.masterPartNo || "-",
          partNo: part?.partNo || "-",
          description: part?.description || "-",
          brand: part?.brand || "-",
          khiQuantity,
          isbQuantity,
          otherQuantity,
          totalDemand,
          weight,
          totalWeight: Number(item.totalWeight || totalDemand * weight || 0),
        };
      }),
    [detail?.items, partOptions],
  );

  const sortedItemRows = useMemo(
    () =>
      sortInquiryItemRows(itemRows, partOptions, itemSort, itemSortDirection, (item) => ({
        masterPartNo: item.masterPartNo,
        partNo: item.partNo,
        description: item.description,
        hsCode: partOptions.find((part) => part.id === item.partId)?.hsCode,
      })),
    [itemRows, partOptions, itemSort, itemSortDirection],
  );

  const totals = useMemo(
    () => ({
      qty: sortedItemRows.reduce((sum, row) => sum + row.totalDemand, 0),
      weight: sortedItemRows.reduce((sum, row) => sum + row.totalWeight, 0),
    }),
    [sortedItemRows],
  );

  const handlePrintPdf = () => {
    if (!detail) return;
    const started = printPurchaseImportInquiry({
      detail,
      supplierRows,
      itemRows: sortedItemRows,
      totals,
    });
    if (!started) {
      toast({
        title: "Print blocked",
        description: "Allow pop-ups for this site and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Print Started",
      description: "PDF is being generated...",
    });
  };

  if (loading || !detail) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading inquiry detail...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">View Import Inquiry</h2>
          <p className="text-sm text-muted-foreground">
            Read-only inquiry details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintPdfButton onPrint={handlePrintPdf} />
          <Button type="button" variant="outline" onClick={onBack}>
            Back to List
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Inquiry No</p>
          <p className="font-medium">{detail.requestNo || "-"}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Inquiry Date</p>
          <p className="font-medium">{toInputDate(detail.requestDate) || "-"}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-medium capitalize">{detail.status || "pending"}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Part Reference</p>
          <p className="font-medium">{detail.partReference || "-"}</p>
        </div>
      </div>

      {detail.notes ? (
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="text-sm">{detail.notes}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Suppliers</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className={`${LIST_NUMBER_HEAD_CLASS} p-2 border-b`}>#</th>
                <th className="text-left p-2 border-b">Supplier</th>
                <th className="text-left p-2 border-b">Country</th>
                <th className="text-left p-2 border-b">Area</th>
                {/* <th className="text-left p-2 border-b">Currency</th> */}
              </tr>
            </thead>
            <tbody>
              {supplierRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-muted-foreground">
                    No suppliers found.
                  </td>
                </tr>
              ) : (
                supplierRows.map((supplier, index) => (
                  <tr key={supplier.supplierId} className="border-b">
                    <td className={`${LIST_NUMBER_CELL_CLASS} p-2`}>
                      {getListRowNumber(index, 1, undefined, supplierRows.length)}
                    </td>
                    <td className="p-2">{supplier.name}</td>
                    <td className="p-2">{supplier.country}</td>
                    <td className="p-2">{supplier.area}</td>
                    {/* <td className="p-2 uppercase">{supplier.currencyName}</td> */}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Items</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={itemSort} onValueChange={(value: InquiryItemSort) => setItemSort(value)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sort: Entry Order</SelectItem>
                <SelectItem value="alphabetical">Sort: Alphabetical</SelectItem>
                <SelectItem value="numeric">Sort: Numeric</SelectItem>
                <SelectItem value="description">Sort: Description</SelectItem>
                <SelectItem value="hsCode">Sort: HS Code</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={itemSortDirection}
              onValueChange={(value: SortDirection) => setItemSortDirection(value)}
              disabled={itemSort === "none"}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className={`${LIST_NUMBER_HEAD_CLASS} p-2 border-b`}>#</th>
                <th className="text-left p-2 border-b">Item</th>
                <th className="text-left p-2 border-b">Brand</th>
                <th className="text-right p-2 border-b">Stock</th>
                <th className="text-right p-2 border-b">ISB</th>
                <th className="text-right p-2 border-b">KHI</th>
                {/* <th className="text-right p-2 border-b">Other</th> */}
                <th className="text-right p-2 border-b">Total Qty</th>
                <th className="text-right p-2 border-b">Weight</th>
                <th className="text-right p-2 border-b">Total Weight</th>
              </tr>
            </thead>
            <tbody>
              {sortedItemRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-3 text-center text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : (
                sortedItemRows.map((item, index) => (
                  <tr
                    key={item.id || `${item.partId}-${index}`}
                    className="border-b"
                  >
                    <td className={`${LIST_NUMBER_CELL_CLASS} p-2`}>
                      {getListRowNumber(index, 1, undefined, sortedItemRows.length)}
                    </td>
                    <td className="p-2">
                      <div className="font-medium">
                        {item.masterPartNo} | {item.partNo}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    </td>
                    <td className="p-2">{item.brand}</td>
                    <td className="p-2 text-right">{Number(item.currentStock || 0)}</td>
                    <td className="p-2 text-right">
                      <span className={INQUIRY_ISB_QTY_DISPLAY_CLASS}>
                        {item.isbQuantity}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <span className={INQUIRY_KHI_QTY_DISPLAY_CLASS}>
                        {item.khiQuantity}
                      </span>
                    </td>
                    {/* <td className="p-2 text-right">{item.otherQuantity}</td> */}
                    <td className="p-2 text-right font-medium">{item.totalDemand}</td>
                    <td className="p-2 text-right">{item.weight.toFixed(2)}</td>
                    <td className="p-2 text-right">{item.totalWeight.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="p-2" colSpan={7}>
                  Totals
                </td>
                <td className="p-2 text-right">{totals.qty}</td>
                <td className="p-2" />
                <td className="p-2 text-right">{totals.weight.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

const PurchaseQuotationForm = ({
  requestId,
  initialConsignee,
  onSaved,
  onCancel,
}: {
  requestId: string;
  initialConsignee?: string | null;
  onSaved?: () => void;
  onCancel?: () => void;
}) => {
  const { toast } = useToast();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [context, setContext] = useState<PurchaseQuotationContextPayload | null>(null);
  const [existingQuotationId, setExistingQuotationId] = useState<string | null>(null);
  const [quotationNo, setQuotationNo] = useState("");
  const [quotationDate, setQuotationDate] = useState(toInputDate(new Date()));
  const [currency, setCurrency] = useState("USD");
  const [conversionRate, setConversionRate] = useState(1);
  const [rows, setRows] = useState<PurchaseQuotationFormItem[]>([]);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [replaceRowId, setReplaceRowId] = useState<string | null>(null);
  const [alternateParts, setAlternateParts] = useState<PartOption[]>([]);
  const [loadingAlternates, setLoadingAlternates] = useState(false);
  const [replacingRowId, setReplacingRowId] = useState<string | null>(null);
  const [itemSort, setItemSort] = useState<InquiryItemSort>("none");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");
  const [printingComparison, setPrintingComparison] = useState(false);

  const showQuotationComparison =
    Number(context?.supplierCount || 0) >= 2;

  const partSelectOptions = useMemo(
    () => buildSortedPartSelectOptions(partOptions, itemSort, itemSortDirection),
    [partOptions, itemSort, itemSortDirection],
  );

  const sortedRows = useMemo(
    () =>
      sortInquiryItemRows(rows, partOptions, itemSort, itemSortDirection, (row, part) => ({
        masterPartNo: row.masterPartNo || part?.masterPartNo,
        partNo: row.partNo || part?.partNo,
        description: row.description || part?.description,
        hsCode: part?.hsCode,
      })),
    [rows, partOptions, itemSort, itemSortDirection],
  );

  useEffect(() => {
    const loadParts = async () => {
      try {
        const partsRes = await apiClient.getPartsDropdown();
        const partsData = (partsRes as any)?.data || [];
        setPartOptions(
          partsData.map((p: any) => ({
            id: p.id || "",
            partNo: p.partNo || "",
            masterPartNo: p.masterPartNo || "",
            description: p.description || "",
            hsCode: p.hs_code || p.hsCode || "",
            brand: p.brand || "",
            weight: Number(p.weight || 0),
          })),
        );
      } catch {
        setPartOptions([]);
      }
    };
    loadParts();
  }, []);

  useEffect(() => {
    const loadContext = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getPurchaseQuotationContext(requestId);
        const raw = (res as any)?.data as PurchaseQuotationContextPayload | undefined;
        if (!raw) {
          throw new Error("Quotation context is unavailable.");
        }
        const data: PurchaseQuotationContextPayload = {
          ...raw,
          consignee:
            raw.consignee ||
            initialConsignee ||
            null,
        };
        setContext(data);
        setExistingQuotationId(data.existingQuotationId || null);
        setQuotationNo(data.quotationNo || "");
        setQuotationDate(toInputDate(data.quotationDate || new Date()));
        setCurrency(data.currency || data.defaultCurrency || "USD");
        setConversionRate(Number(data.conversionRate || 1));
        setRows(
          Array.isArray(data.items)
            ? data.items.map((item) => {
                const rawOther = Number(item.otherQuantity || 0);
                const rawIsb = Number(item.isbQuantity || 0);
                const rawKhi = Number(item.khiQuantity || 0);
                return {
                ...item,
                rowId: createRowId(),
                isNewRow: false,
                khiQuantity: rawKhi,
                isbQuantity: SHOW_OTHER_QTY ? rawIsb : rawIsb + rawOther,
                otherQuantity: SHOW_OTHER_QTY ? rawOther : 0,
                quotationQuantity: Number(
                  item.quotationQuantity ?? item.demandQuantity ?? 0,
                ),
                shipDays: Number(item.shipDays || 0),
                fcRate: Number(item.fcRate || 0),
                fcRateText: formatRateInput(Number(item.fcRate || 0)),
                revisedFcRate: Number(item.revisedFcRate || 0),
                revisedFcRateText: formatRateInput(
                  Number(item.revisedFcRate || 0),
                ),
                lastFcRate: Number(item.lastFcRate || 0),
                loadingPartDetails: false,
              };
              })
            : [],
        );
      } catch (error: any) {
        toast({
          title: "Failed to load quotation context",
          description: error?.response?.data?.error || error?.message || "Could not load quotation data.",
          variant: "destructive",
        });
        onCancelRef.current?.();
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [requestId, initialConsignee]);

  const updateRow = (rowId: string, patch: Partial<PurchaseQuotationFormItem>) => {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  };

  const updateQuotationSplitQuantity = (
    rowId: string,
    field: "khiQuantity" | "isbQuantity" | "otherQuantity",
    value: number,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = { ...row, [field]: Number(value || 0) };
        return {
          ...next,
          demandQuantity: getQuotationRowDemandQuantity(next),
        };
      }),
    );
  };

  const addQuotationRow = () => {
    setRows((prev) => [...prev, createEmptyQuotationRow()]);
  };

  const removeQuotationRow = (rowId: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev));
    if (replaceRowId === rowId) {
      closeReplacePanel();
    }
  };

  const selectPartForRow = async (rowId: string, partId: string) => {
    if (!partId) {
      updateRow(rowId, {
        partId: "",
        masterPartNo: "",
        partNo: "",
        description: "",
        brand: "",
        currentStock: 0,
        weight: 0,
        lastFcRate: 0,
        loadingPartDetails: false,
      });
      return;
    }

    updateRow(rowId, { partId, loadingPartDetails: true });
    try {
      const res = await apiClient.getPurchaseImportPartDetails(partId);
      if ((res as any)?.error) {
        throw new Error(String((res as any).error));
      }
      const details = (res as any)?.data;
      const option =
        partOptions.find((p) => p.id === partId) ||
        ({
          id: partId,
          partNo: "",
          masterPartNo: "",
          description: "",
          brand: "",
          weight: 0,
        } as PartOption);
      const fields = buildQuotationPartFieldsFromSelection(option, details, partOptions);
      const lastFcRate = context?.supplier?.id
        ? await loadLastFcRateForPart(
            context.supplier.id,
            partId,
            existingQuotationId,
          )
        : 0;
      setRows((prev) =>
        prev.map((row) => {
          if (row.rowId !== rowId) return row;
          const demandQuantity = Number(row.demandQuantity || 0);
          return {
            ...row,
            ...fields,
            lastFcRate,
            quotationQuantity:
              Number(row.quotationQuantity || 0) > 0
                ? Number(row.quotationQuantity)
                : demandQuantity,
            loadingPartDetails: false,
          };
        }),
      );
    } catch {
      updateRow(rowId, { loadingPartDetails: false });
      toast({
        title: "Failed to load part details",
        description: "Could not fetch stock and weight for the selected part.",
        variant: "destructive",
      });
    }
  };

  const closeReplacePanel = () => {
    setReplaceRowId(null);
    setAlternateParts([]);
    setLoadingAlternates(false);
  };

  const toggleReplacePanel = async (rowId: string) => {
    if (replaceRowId === rowId) {
      closeReplacePanel();
      return;
    }

    const row = rows.find((item) => item.rowId === rowId);
    if (!row?.partId) return;

    setReplaceRowId(rowId);
    setAlternateParts([]);
    setLoadingAlternates(true);
    try {
      const matched = await fetchAlternateParts(row.partId, {
        partNo: row.partNo,
        masterPartNo: row.masterPartNo,
      });
      setAlternateParts(matched);
    } catch {
      setAlternateParts([]);
      toast({
        title: "Failed to load alternates",
        description: "Could not fetch alternate items for this part.",
        variant: "destructive",
      });
    } finally {
      setLoadingAlternates(false);
    }
  };

  const handleReplaceWithAlternate = async (rowId: string, alternate: PartOption) => {
    if (replacingRowId) return;

    // Allow duplicate items/alternates on the same quotation.
    // We still update the selected row immediately, then hydrate details below.
    setRows((prev) => {
      const targetRow = prev.find((row) => row.rowId === rowId);
      if (!targetRow) return prev;

      const fields = buildQuotationPartFieldsFromSelection(
        alternate,
        null,
        partOptions,
      );
      return prev.map((row) =>
        row.rowId === rowId
          ? { ...row, ...fields, loadingPartDetails: true }
          : row,
      );
    });

    closeReplacePanel();
    setReplacingRowId(rowId);

    try {
      const res = await apiClient.getPurchaseImportPartDetails(alternate.id);
      if ((res as any)?.error) {
        throw new Error(String((res as any).error));
      }
      const details = (res as any)?.data;
      const fields = buildQuotationPartFieldsFromSelection(
        alternate,
        details,
        partOptions,
      );
      const lastFcRate = context?.supplier?.id
        ? await loadLastFcRateForPart(
            context.supplier.id,
            alternate.id,
            existingQuotationId,
          )
        : 0;
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId
            ? { ...row, ...fields, lastFcRate, loadingPartDetails: false }
            : row,
        ),
      );
      toast({
        title: "Item replaced",
        description: `${fields.masterPartNo || "-"} | ${fields.partNo || "-"} | ${fields.brand || "-"}`,
      });
    } catch {
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId ? { ...row, loadingPartDetails: false } : row,
        ),
      );
      toast({
        title: "Failed to replace item",
        description: "Could not load details for the selected alternate.",
        variant: "destructive",
      });
    } finally {
      setReplacingRowId(null);
    }
  };

  const calculations = useMemo(
    () =>
      rows.map((row) => {
        const quotationQuantity = Number(row.quotationQuantity || 0);
        const fcRate = Number(row.fcRate || 0);
        const lcRate = fcRate * Number(conversionRate || 0);
        const fcAmount = quotationQuantity * fcRate;
        const lcAmount = quotationQuantity * lcRate;
        const totalWeight = quotationQuantity * Number(row.weight || 0);
        return {
          rowId: row.rowId,
          partId: row.partId,
          quotationQuantity,
          fcRate,
          lcRate,
          fcAmount,
          lcAmount,
          totalWeight,
        };
      }),
    [rows, conversionRate],
  );

  const quotationTotals = useMemo(
    () => ({
      requestQty: rows.reduce((sum, row) => sum + Number(row.demandQuantity || 0), 0),
      quotationQty: calculations.reduce(
        (sum, calc) => sum + Number(calc.quotationQuantity || 0),
        0,
      ),
      fcAmount: calculations.reduce((sum, calc) => sum + Number(calc.fcAmount || 0), 0),
      lcAmount: calculations.reduce((sum, calc) => sum + Number(calc.lcAmount || 0), 0),
      totalWeight: calculations.reduce(
        (sum, calc) => sum + Number(calc.totalWeight || 0),
        0,
      ),
    }),
    [rows, calculations],
  );

  const handlePrintPdf = () => {
    if (!context) return;
    const started = printPurchaseImportQuotation({
      detail: {
        requestNo: context.requestNo,
        requestDate: context.requestDate,
        quotationNo: quotationNo || context.quotationNo,
        quotationDate,
        supplierName: context.supplier?.name,
        currency,
        conversionRate,
        status: existingQuotationId ? "saved" : "draft",
        terms: context.terms,
      },
      itemRows: sortedRows.map((row) => {
        const calc = calculations.find((item) => item.rowId === row.rowId);
        return {
          masterPartNo: row.masterPartNo,
          partNo: row.partNo,
          description: row.description,
          brand: row.brand,
          currentStock: row.currentStock,
          requestQty: row.demandQuantity,
          quotationQty: calc?.quotationQuantity ?? row.quotationQuantity,
          shipDays: row.shipDays,
          lastFcRate: row.lastFcRate,
          fcRate: calc?.fcRate ?? row.fcRate,
          fcAmount: calc?.fcAmount ?? 0,
          lcRate: calc?.lcRate ?? 0,
          lcAmount: calc?.lcAmount ?? 0,
          totalWeight: calc?.totalWeight ?? 0,
        };
      }),
      totals: quotationTotals,
    });
    if (!started) {
      toast({
        title: "Print blocked",
        description: "Allow pop-ups for this site and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Print Started",
      description: "PDF is being generated...",
    });
  };

  const handlePrintComparisonPdf = async () => {
    if (!context || !showQuotationComparison) return;
    setPrintingComparison(true);
    try {
      const started = await printPurchaseQuotationComparisonPdf(requestId);
      if (!started) {
        toast({
          title: "Print blocked",
          description: "Allow pop-ups for this site and try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Comparison PDF",
        description: "Supplier quotation comparison is being generated...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to print comparison",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not generate quotation comparison PDF.",
        variant: "destructive",
      });
    } finally {
      setPrintingComparison(false);
    }
  };

  const handleSaveQuotation = async () => {
    if (!context) return;

    const trimmedQuotationNo = quotationNo.trim();
    if (!trimmedQuotationNo) {
      toast({
        title: "Quotation number required",
        description: "Enter the supplier quotation number before saving.",
        variant: "destructive",
      });
      return;
    }

    const incompleteRows = rows.filter(
      (row) =>
        (row.partId && Number(row.quotationQuantity || 0) <= 0) ||
        (!row.partId &&
          (Number(row.quotationQuantity || 0) > 0 ||
            Number(row.demandQuantity || 0) > 0)),
    );
    if (incompleteRows.length > 0) {
      toast({
        title: "Incomplete item rows",
        description:
          "Each row needs a part selected and quotation quantity greater than zero.",
        variant: "destructive",
      });
      return;
    }

    const validItems = rows.filter(
      (row) => row.partId && Number(row.quotationQuantity || 0) > 0,
    );
    if (validItems.length === 0) {
      toast({
        title: "Items required",
        description: "Please add at least one item with quotation quantity.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        quotationNo: trimmedQuotationNo,
        quotationDate,
        currency,
        conversionRate: Number(conversionRate || 1),
        quotationType: "original" as const,
        status: "pending",
        items: validItems.map((row) => ({
          partId: row.partId,
          demandQuantity: Number(row.demandQuantity || 0),
          khiQuantity: Number(row.khiQuantity || 0),
          isbQuantity: Number(row.isbQuantity || 0),
          otherQuantity: SHOW_OTHER_QTY ? Number(row.otherQuantity || 0) : 0,
          quotationQuantity: Number(row.quotationQuantity || 0),
          shipDays: Number(row.shipDays || 0),
          fcRate: Number(row.fcRate || 0),
          revisedFcRate: Number(row.revisedFcRate || 0),
          weight: Number(row.weight || 0),
        })),
      };

      const res = existingQuotationId
        ? await apiClient.updatePurchaseQuotation(existingQuotationId, payload)
        : await apiClient.createPurchaseQuotation(requestId, payload);
      const quotationNoSaved =
        (res as any)?.data?.quotationNo || trimmedQuotationNo || context?.quotationNo;
      toast({
        title: existingQuotationId ? "Quotation updated" : "Quotation saved",
        description: quotationNoSaved
          ? `Quotation ${quotationNoSaved} has been ${existingQuotationId ? "updated" : "created"} successfully.`
          : `Quotation has been ${existingQuotationId ? "updated" : "created"} successfully.`,
      });
      onSaved?.();
    } catch (error: any) {
      toast({
        title: "Failed to save quotation",
        description: error?.response?.data?.error || error?.message || "Could not create quotation.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Quotation</h2>
          <p className="text-sm text-muted-foreground">
            {existingQuotationId
              ? "View and update the saved quotation for this inquiry."
              : "Create quotation for the selected confirmed supplier inquiry."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showQuotationComparison ? (
            <PrintPdfButton
              onPrint={() => {
                void handlePrintComparisonPdf();
              }}
              disabled={loading || !context || printingComparison}
              label={printingComparison ? "Comparing..." : "Compare PDF"}
            />
          ) : null}
          <PrintPdfButton
            onPrint={handlePrintPdf}
            disabled={loading || !context || sortedRows.length === 0}
          />
        </div>
      </div>

      {loading || !context ? (
        <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
          Loading quotation form...
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1 min-w-0">
                <Label>Import Inquiry No</Label>
                <Input value={context.requestNo || "-"} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Import Inquiry Date</Label>
                <Input value={toInputDate(context.requestDate)} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Quotation No</Label>
                <Input
                  value={quotationNo}
                  onChange={(e) => setQuotationNo(e.target.value)}
                  placeholder="Enter supplier quotation number"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Quotation Date</Label>
                <Input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1 md:col-span-2 min-w-0">
                <Label>Supplier</Label>
                <Input value={context.supplier?.name || "-"} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Supplier Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(context.currencyOptions || ["USD"]).map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Exchange Rate</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={conversionRate}
                  onChange={(e) => setConversionRate(Number(e.target.value || 0))}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Items</h3>
            <div className="flex items-center gap-2">
              <Select value={itemSort} onValueChange={(value: InquiryItemSort) => setItemSort(value)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sort: Entry Order</SelectItem>
                  <SelectItem value="alphabetical">Sort: Alphabetical</SelectItem>
                  <SelectItem value="numeric">Sort: Numeric</SelectItem>
                  <SelectItem value="description">Sort: Description</SelectItem>
                  <SelectItem value="hsCode">Sort: HS Code</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={itemSortDirection}
                onValueChange={(value: SortDirection) => setItemSortDirection(value)}
                disabled={itemSort === "none"}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                onClick={addQuotationRow}
                disabled={loading || saving}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-center p-2 border-b w-12">#</th>
                  <th className="text-left p-2 border-b">Item</th>
                  <th className="text-left p-2 border-b">Brand</th>
                  <th className="text-right p-2 border-b">Current Stock</th>
                  <th className="text-right p-2 border-b">Request QTY</th>
                  <th className={QUOTATION_QTY_COL_CLASS}>Quotation QTY</th>
                  <th className={QUOTATION_SHIP_DAYS_COL_CLASS}>Ship Days</th>
                  <th className={QUOTATION_LAST_FC_RATE_COL_CLASS}>Last FC Rate</th>
                  <th className={QUOTATION_FC_RATE_COL_CLASS}>FC Rate</th>
                  <th className="text-right p-2 border-b">FC Amount</th>
                  <th className="text-right p-2 border-b">LC Rate</th>
                  <th className="text-right p-2 border-b">LC Amount</th>
                  <th className="text-right p-2 border-b">Total Weight</th>
                  <th className="text-center p-2 border-b min-w-[90px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => {
                  const calc = calculations.find((item) => item.rowId === row.rowId);
                  return (
                    <Fragment key={`${row.rowId}-${row.partId}`}>
                    <tr className="border-b hover:bg-muted/20">
                      <td className="p-2 text-center text-muted-foreground tabular-nums">
                        {index + 1}
                      </td>
                      <td className="p-2 min-w-[280px]">
                        {row.isNewRow ? (
                          <div className="space-y-1">
                            <SearchableSelect
                              options={partSelectOptions}
                              value={row.partId}
                              onValueChange={(partId) => selectPartForRow(row.rowId, partId)}
                              placeholder="Master Part | Part No"
                              selectedDisplayLabelOnly
                              disabled={loading || saving}
                            />
                            {row.loadingPartDetails && (
                              <p className="text-xs text-muted-foreground">Loading details...</p>
                            )}
                            {row.partId && !row.loadingPartDetails && (
                              <p className="text-xs text-muted-foreground">
                                {row.description || "-"}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div
                            title={`${row.masterPartNo || "-"} | ${row.partNo || "-"} | ${row.description || "-"} | ${row.brand || "-"}`}
                          >
                            <div className="font-medium">
                              {row.masterPartNo || "-"} | {row.partNo || "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.description || "-"}
                            </div>
                            {row.loadingPartDetails && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Updating part details...
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-2">{row.brand || "-"}</td>
                      <td className="p-2 text-right">{row.currentStock}</td>
                      <td className="p-2 text-right">
                        {row.isNewRow ? (
                          <div className="flex items-center gap-1.5 min-w-[290px]">
                            <Input
                              type="number"
                              min={0}
                              className={cn(
                                INQUIRY_ISB_QTY_INPUT_CLASS,
                                "h-7 w-16 min-w-0 text-xs px-2",
                              )}
                              placeholder="ISB"
                              value={Number(row.isbQuantity || 0) === 0 ? "" : Number(row.isbQuantity || 0)}
                              onChange={(e) =>
                                updateQuotationSplitQuantity(
                                  row.rowId,
                                  "isbQuantity",
                                  Number(e.target.value || 0),
                                )
                              }
                            />
                            <Input
                              type="number"
                              min={0}
                              className={cn(
                                INQUIRY_KHI_QTY_INPUT_CLASS,
                                "h-7 w-16 min-w-0 text-xs px-2",
                              )}
                              placeholder="KHI"
                              value={Number(row.khiQuantity || 0) === 0 ? "" : Number(row.khiQuantity || 0)}
                              onChange={(e) =>
                                updateQuotationSplitQuantity(
                                  row.rowId,
                                  "khiQuantity",
                                  Number(e.target.value || 0),
                                )
                              }
                            />
                            {SHOW_OTHER_QTY ? (
                              <Input
                                type="number"
                                min={0}
                                className="h-7 w-20 min-w-0 text-right text-xs px-2"
                                placeholder="Other"
                                value={Number(row.otherQuantity || 0) === 0 ? "" : Number(row.otherQuantity || 0)}
                                onChange={(e) =>
                                  updateQuotationSplitQuantity(
                                    row.rowId,
                                    "otherQuantity",
                                    Number(e.target.value || 0),
                                  )
                                }
                              />
                            ) : null}
                            <Input
                              type="number"
                              className="h-7 w-20 min-w-0 text-right text-xs px-2 bg-muted/40"
                              value={row.demandQuantity === 0 ? "" : row.demandQuantity}
                              placeholder="Total"
                              disabled
                            />
                          </div>
                        ) : (
                          row.demandQuantity
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          className={QUOTATION_QTY_INPUT_CLASS}
                          value={row.quotationQuantity === 0 ? "" : row.quotationQuantity}
                          onChange={(e) =>
                            updateRow(row.rowId, {
                              quotationQuantity: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          className={QUOTATION_SHIP_DAYS_INPUT_CLASS}
                          value={row.shipDays === 0 ? "" : row.shipDays}
                          onChange={(e) =>
                            updateRow(row.rowId, {
                              shipDays: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2 text-right text-muted-foreground tabular-nums">
                        {formatLastFcRateDisplay(row.lastFcRate)}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className={QUOTATION_FC_RATE_INPUT_CLASS}
                          value={row.fcRateText}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw !== "" && !RATE_INPUT_PATTERN.test(raw)) return;
                            updateRow(row.rowId, {
                              fcRateText: raw,
                              fcRate: parseRateInput(raw),
                            });
                          }}
                          onBlur={() => {
                            updateRow(row.rowId, {
                              fcRateText: formatRateInput(row.fcRate),
                            });
                          }}
                        />
                      </td>
                      <td className="p-2 text-right">{Number(calc?.fcAmount || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(calc?.lcRate || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(calc?.lcAmount || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(calc?.totalWeight || 0).toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.partId && !row.isNewRow ? (
                            <Button
                              type="button"
                              variant={replaceRowId === row.rowId ? "default" : "outline"}
                              size="sm"
                              className="h-8 px-2 text-xs"
                              disabled={
                                loading ||
                                saving ||
                                replacingRowId !== null ||
                                (loadingAlternates && replaceRowId !== row.rowId)
                              }
                              onClick={() => toggleReplacePanel(row.rowId)}
                            >
                              Replace
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={loading || saving || rows.length === 1}
                            onClick={() => removeQuotationRow(row.rowId)}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {replaceRowId === row.rowId && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={14} className="p-2">
                          <div className="rounded-md border border-dashed border-border p-2">
                            <p className="text-xs font-medium mb-2">
                              Alternate items (same Part No / Master Part No)
                            </p>
                            {loadingAlternates ? (
                              <p className="text-xs text-muted-foreground">Loading alternates...</p>
                            ) : alternateParts.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No alternate items found.
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {alternateParts.map((alternate) => (
                                  <button
                                    key={alternate.id}
                                    type="button"
                                    disabled={replacingRowId !== null}
                                    className="w-full text-left rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                    onClick={() =>
                                      handleReplaceWithAlternate(row.rowId, alternate)
                                    }
                                  >
                                    <span className="font-medium">
                                      {alternate.masterPartNo || "-"} | {alternate.partNo}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      | {alternate.description || "-"} | {alternate.brand || "-"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-semibold border-t">
                  <td className="p-2" />
                  <td className="p-2">Totals</td>
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.requestQty}</td>
                  <td className="p-2 text-right">{quotationTotals.quotationQty}</td>
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.fcAmount.toFixed(2)}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.lcAmount.toFixed(2)}</td>
                  <td className="p-2 text-right">{quotationTotals.totalWeight.toFixed(2)}</td>
                  <td className="p-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSaveQuotation}
          disabled={loading || saving || !context}
        >
          {saving ? "Saving..." : existingQuotationId ? "Update Quotation" : "Save Quotation"}
        </Button>
      </div>
    </div>
  );
};

const PurchaseQuotationRevisionForm = ({
  quotationId,
  onSaved,
  onCancel,
}: {
  quotationId: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) => {
  const { toast } = useToast();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<PurchaseQuotationDetailPayload | null>(null);
  const [quotationDate, setQuotationDate] = useState(toInputDate(new Date()));
  const [revisedQuotationDate, setRevisedQuotationDate] = useState(toInputDate(new Date()));
  const [currency, setCurrency] = useState("USD");
  const [conversionRate, setConversionRate] = useState(1);
  const [rows, setRows] = useState<PurchaseQuotationFormItem[]>([]);
  const [replaceRowId, setReplaceRowId] = useState<string | null>(null);
  const [alternateParts, setAlternateParts] = useState<PartOption[]>([]);
  const [loadingAlternates, setLoadingAlternates] = useState(false);
  const [replacingRowId, setReplacingRowId] = useState<string | null>(null);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [itemSort, setItemSort] = useState<InquiryItemSort>("alphabetical");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");

  const sortedRows = useMemo(
    () =>
      sortInquiryItemRows(rows, partOptions, itemSort, itemSortDirection, (row, part) => ({
        masterPartNo: row.masterPartNo || part?.masterPartNo,
        partNo: row.partNo || part?.partNo,
        description: row.description || part?.description,
        hsCode: part?.hsCode,
      })),
    [rows, partOptions, itemSort, itemSortDirection],
  );

  useEffect(() => {
    const loadParts = async () => {
      try {
        const partsRes = await apiClient.getPartsDropdown();
        const partsData = (partsRes as any)?.data || [];
        setPartOptions(
          partsData.map((p: any) => ({
            id: p.id || "",
            partNo: p.partNo || "",
            masterPartNo: p.masterPartNo || "",
            description: p.description || "",
            hsCode: p.hs_code || p.hsCode || "",
            brand: p.brand || "",
            weight: Number(p.weight || 0),
          })),
        );
      } catch {
        setPartOptions([]);
      }
    };
    loadParts();
  }, []);

  useEffect(() => {
    const loadQuotation = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getPurchaseQuotationById(quotationId);
        const data = (res as any)?.data as PurchaseQuotationDetailPayload | undefined;
        if (!data) {
          throw new Error("Quotation detail is unavailable.");
        }
        setDetail(data);
        setQuotationDate(toInputDate(data.quotationDate || new Date()));
        setRevisedQuotationDate(toInputDate(data.revisedQuotationDate || new Date()));
        setCurrency(data.currency || "USD");
        setConversionRate(Number(data.conversionRate || 1));
        setRows(
          Array.isArray(data.items)
            ? data.items.map((item) => {
                const rawOther = Number((item as any).otherQuantity || 0);
                const rawIsb = Number((item as any).isbQuantity || 0);
                return {
                rowId: createRowId(),
                isNewRow: false,
                partId: item.partId,
                masterPartNo: item.masterPartNo || "",
                partNo: item.partNo || "",
                description: item.description || "",
                brand: item.brand || "",
                currentStock: Number((item as any).currentStock || 0),
                demandQuantity: Number(item.demandQuantity || 0),
                khiQuantity: Number((item as any).khiQuantity || 0),
                isbQuantity: SHOW_OTHER_QTY ? rawIsb : rawIsb + rawOther,
                otherQuantity: SHOW_OTHER_QTY ? rawOther : 0,
                quotationQuantity: Number(item.quotationQuantity || 0),
                shipDays: Number(item.shipDays || 0),
                fcRate: Number(item.fcRate || 0),
                fcRateText: formatRateInput(Number(item.fcRate || 0)),
                revisedFcRate: Number(item.revisedFcRate || 0),
                revisedFcRateText: formatRateInput(
                  Number(item.revisedFcRate || 0),
                ),
                lastFcRate: Number((item as any).lastFcRate || 0),
                weight: Number(item.weight || 0),
                loadingPartDetails: false,
              };
              })
            : [],
        );
      } catch (error: any) {
        toast({
          title: "Failed to load quotation",
          description: error?.response?.data?.error || error?.message || "Could not load quotation detail.",
          variant: "destructive",
        });
        onCancelRef.current?.();
      } finally {
        setLoading(false);
      }
    };

    loadQuotation();
  }, [quotationId]);

  const updateRow = (rowId: string, patch: Partial<PurchaseQuotationFormItem>) => {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  };

  const closeReplacePanel = () => {
    setReplaceRowId(null);
    setAlternateParts([]);
    setLoadingAlternates(false);
  };

  const toggleReplacePanel = async (rowId: string) => {
    if (replaceRowId === rowId) {
      closeReplacePanel();
      return;
    }

    const row = rows.find((item) => item.rowId === rowId);
    if (!row?.partId) return;

    setReplaceRowId(rowId);
    setAlternateParts([]);
    setLoadingAlternates(true);
    try {
      const matched = await fetchAlternateParts(row.partId, {
        partNo: row.partNo,
        masterPartNo: row.masterPartNo,
      });
      setAlternateParts(matched);
    } catch {
      setAlternateParts([]);
      toast({
        title: "Failed to load alternates",
        description: "Could not fetch alternate items for this part.",
        variant: "destructive",
      });
    } finally {
      setLoadingAlternates(false);
    }
  };

  const handleReplaceWithAlternate = async (rowId: string, alternate: PartOption) => {
    if (replacingRowId) return;

    // Allow duplicate items/alternates on the same quotation.
    setRows((prev) => {
      const targetRow = prev.find((row) => row.rowId === rowId);
      if (!targetRow) return prev;

      const fields = buildQuotationPartFieldsFromSelection(
        alternate,
        null,
        partOptions,
      );
      return prev.map((row) =>
        row.rowId === rowId
          ? { ...row, ...fields, loadingPartDetails: true }
          : row,
      );
    });

    closeReplacePanel();
    setReplacingRowId(rowId);

    try {
      const res = await apiClient.getPurchaseImportPartDetails(alternate.id);
      if ((res as any)?.error) {
        throw new Error(String((res as any).error));
      }
      const details = (res as any)?.data;
      const fields = buildQuotationPartFieldsFromSelection(
        alternate,
        details,
        partOptions,
      );
      const lastFcRate = detail?.supplier?.id
        ? await loadLastFcRateForPart(detail.supplier.id, alternate.id, quotationId)
        : 0;
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId
            ? { ...row, ...fields, lastFcRate, loadingPartDetails: false }
            : row,
        ),
      );
      toast({
        title: "Item replaced",
        description: `${fields.masterPartNo || "-"} | ${fields.partNo || "-"} | ${fields.brand || "-"}`,
      });
    } catch {
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId ? { ...row, loadingPartDetails: false } : row,
        ),
      );
      toast({
        title: "Failed to replace item",
        description: "Could not load details for the selected alternate.",
        variant: "destructive",
      });
    } finally {
      setReplacingRowId(null);
    }
  };

  const calculations = useMemo(
    () =>
      rows.map((row) => {
        const quotationQuantity = Number(row.quotationQuantity || 0);
        const fcRate = Number(row.fcRate || 0);
        const revisedFcRate = Number(row.revisedFcRate || 0);
        const lcRate = fcRate * Number(conversionRate || 0);
        const revisedLcRate = revisedFcRate * Number(conversionRate || 0);
        const fcAmount = quotationQuantity * fcRate;
        const revisedFcAmount = quotationQuantity * revisedFcRate;
        const lcAmount = quotationQuantity * lcRate;
        const revisedLcAmount = quotationQuantity * revisedLcRate;
        const totalWeight = quotationQuantity * Number(row.weight || 0);
        return {
          rowId: row.rowId,
          partId: row.partId,
          quotationQuantity,
          fcRate,
          lcRate,
          fcAmount,
          lcAmount,
          revisedFcRate,
          revisedFcAmount,
          revisedLcRate,
          revisedLcAmount,
          totalWeight,
        };
      }),
    [rows, conversionRate],
  );

  const quotationTotals = useMemo(
    () => ({
      requestQty: rows.reduce((sum, row) => sum + Number(row.demandQuantity || 0), 0),
      quotationQty: calculations.reduce(
        (sum, calc) => sum + Number(calc.quotationQuantity || 0),
        0,
      ),
      fcAmount: calculations.reduce((sum, calc) => sum + Number(calc.fcAmount || 0), 0),
      lcAmount: calculations.reduce((sum, calc) => sum + Number(calc.lcAmount || 0), 0),
      revisedFcAmount: calculations.reduce(
        (sum, calc) => sum + Number(calc.revisedFcAmount || 0),
        0,
      ),
      revisedLcAmount: calculations.reduce(
        (sum, calc) => sum + Number(calc.revisedLcAmount || 0),
        0,
      ),
      totalWeight: calculations.reduce(
        (sum, calc) => sum + Number(calc.totalWeight || 0),
        0,
      ),
    }),
    [rows, calculations],
  );

  const handleSaveRevision = async () => {
    if (!detail) return;

    setSaving(true);
    try {
      await apiClient.revisePurchaseQuotation(quotationId, {
        quotationDate,
        revisedQuotationDate,
        status: "revise",
        currency,
        conversionRate: Number(conversionRate || 1),
        items: rows.map((row) => ({
          partId: row.partId,
          demandQuantity: Number(row.demandQuantity || 0),
          quotationQuantity: Number(row.quotationQuantity || 0),
          shipDays: Number(row.shipDays || 0),
          fcRate: Number(row.fcRate || 0),
          revisedFcRate: Number(row.revisedFcRate || 0),
          weight: Number(row.weight || 0),
        })),
      });
      toast({
        title: "Quotation revised",
        description: `${detail.quotationNo} has been revised successfully.`,
      });
      onSaved?.();
    } catch (error: any) {
      toast({
        title: "Failed to save revision",
        description: error?.response?.data?.error || error?.message || "Could not revise quotation.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrintPdf = () => {
    if (!detail) return;
    const started = printPurchaseImportQuotation({
      detail: {
        requestNo: detail.request?.requestNo,
        requestDate: detail.request?.requestDate,
        quotationNo: detail.quotationNo,
        quotationDate,
        revisedQuotationDate,
        supplierName: detail.supplier?.name || detail.supplier?.code || null,
        currency,
        conversionRate,
        status: "revise",
        terms: detail.terms,
      },
      showRevisedFields: true,
      itemRows: sortedRows.map((row) => {
        const calc = calculations.find((item) => item.rowId === row.rowId);
        return {
          masterPartNo: row.masterPartNo,
          partNo: row.partNo,
          description: row.description,
          brand: row.brand,
          currentStock: row.currentStock,
          requestQty: row.demandQuantity,
          quotationQty: calc?.quotationQuantity ?? row.quotationQuantity,
          shipDays: row.shipDays,
          lastFcRate: row.lastFcRate,
          fcRate: Number(calc?.fcRate || row.fcRate || 0),
          fcAmount: Number(calc?.fcAmount || 0),
          lcRate: Number(calc?.lcRate || 0),
          lcAmount: Number(calc?.lcAmount || 0),
          revisedFcRate: Number(calc?.revisedFcRate || row.revisedFcRate || 0),
          revisedFcAmount: Number(calc?.revisedFcAmount || 0),
          revisedLcRate: Number(calc?.revisedLcRate || 0),
          revisedLcAmount: Number(calc?.revisedLcAmount || 0),
          totalWeight: calc?.totalWeight ?? 0,
        };
      }),
      totals: {
        requestQty: quotationTotals.requestQty,
        quotationQty: quotationTotals.quotationQty,
        fcAmount: quotationTotals.fcAmount,
        lcAmount: quotationTotals.lcAmount,
        revisedFcAmount: quotationTotals.revisedFcAmount,
        revisedLcAmount: quotationTotals.revisedLcAmount,
        totalWeight: quotationTotals.totalWeight,
      },
    });
    if (!started) {
      toast({
        title: "Print blocked",
        description: "Allow pop-ups for this site and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Print Started",
      description: "PDF is being generated...",
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Revise Quotation</h2>
          <p className="text-sm text-muted-foreground">
            Update quotation with revised FC/LC rates and revised quotation date.
          </p>
        </div>
        <PrintPdfButton
          onPrint={handlePrintPdf}
          disabled={loading || !detail || sortedRows.length === 0}
        />
      </div>

      {loading || !detail ? (
        <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
          Loading quotation form...
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="space-y-1 min-w-0">
                <Label>Import Inquiry No</Label>
                <Input value={detail.request?.requestNo || "-"} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Import Inquiry Date</Label>
                <Input value={toInputDate(detail.request?.requestDate)} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Quotation No</Label>
                <Input value={detail.quotationNo || "-"} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Quotation Date</Label>
                <Input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Revised Quotation Date</Label>
                <Input
                  type="date"
                  value={revisedQuotationDate}
                  onChange={(e) => setRevisedQuotationDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1 md:col-span-2 min-w-0">
                <Label>Supplier</Label>
                <Input value={detail.supplier?.name || "-"} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Supplier Currency</Label>
                <Input value={currency || "-"} disabled />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>Exchange Rate</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={conversionRate}
                  onChange={(e) => setConversionRate(Number(e.target.value || 0))}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Items</h3>
            <div className="flex items-center gap-2">
              <Select value={itemSort} onValueChange={(value: InquiryItemSort) => setItemSort(value)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alphabetical">Sort: Alphabetical</SelectItem>
                  <SelectItem value="numeric">Sort: Numeric</SelectItem>
                  <SelectItem value="description">Sort: Description</SelectItem>
                  <SelectItem value="hsCode">Sort: HS Code</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={itemSortDirection}
                onValueChange={(value: SortDirection) => setItemSortDirection(value)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-center p-2 border-b w-12">#</th>
                  <th className="text-left p-2 border-b">Item</th>
                  <th className="text-left p-2 border-b">Brand</th>
                  <th className="text-right p-2 border-b">Current Stock</th>
                  <th className="text-right p-2 border-b">Request QTY</th>
                  <th className={QUOTATION_QTY_COL_CLASS}>Quotation QTY</th>
                  <th className={QUOTATION_SHIP_DAYS_COL_CLASS}>Ship Days</th>
                  <th className={QUOTATION_LAST_FC_RATE_COL_CLASS}>Last FC Rate</th>
                  <th className={QUOTATION_FC_RATE_COL_CLASS}>FC Rate</th>
                  <th className="text-right p-2 border-b">FC Amount</th>
                  <th className="text-right p-2 border-b">LC Rate</th>
                  <th className="text-right p-2 border-b">LC Amount</th>
                  <th className={QUOTATION_FC_RATE_COL_CLASS}>Revised FC Rate</th>
                  <th className="text-right p-2 border-b">Revised FC Amount</th>
                  <th className="text-right p-2 border-b">Revised LC Rate</th>
                  <th className="text-right p-2 border-b">Revised LC Amount</th>
                  <th className="text-right p-2 border-b">Total Weight</th>
                  <th className="text-center p-2 border-b min-w-[90px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => {
                  const calc = calculations.find((item) => item.rowId === row.rowId);
                  return (
                    <Fragment key={`${row.rowId}-${row.partId}`}>
                    <tr className="border-b hover:bg-muted/20">
                      <td className="p-2 text-center text-muted-foreground tabular-nums">
                        {index + 1}
                      </td>
                      <td
                        className="p-2 min-w-[280px]"
                        title={`${row.masterPartNo || "-"} | ${row.partNo || "-"} | ${row.description || "-"} | ${row.brand || "-"}`}
                      >
                        <div className="font-medium">
                          {row.masterPartNo || "-"} | {row.partNo || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.description || "-"}
                        </div>
                      </td>
                      <td className="p-2">{row.brand || "-"}</td>
                      <td className="p-2 text-right">{row.currentStock || 0}</td>
                      <td className="p-2 text-right">{row.demandQuantity}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          className={QUOTATION_QTY_INPUT_CLASS}
                          value={row.quotationQuantity === 0 ? "" : row.quotationQuantity}
                          onChange={(e) =>
                            updateRow(row.rowId, {
                              quotationQuantity: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          className={QUOTATION_SHIP_DAYS_INPUT_CLASS}
                          value={row.shipDays === 0 ? "" : row.shipDays}
                          onChange={(e) =>
                            updateRow(row.rowId, {
                              shipDays: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2 text-right text-muted-foreground tabular-nums">
                        {formatLastFcRateDisplay(row.lastFcRate)}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className={QUOTATION_FC_RATE_INPUT_CLASS}
                          value={row.fcRateText}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw !== "" && !RATE_INPUT_PATTERN.test(raw)) return;
                            updateRow(row.rowId, {
                              fcRateText: raw,
                              fcRate: parseRateInput(raw),
                            });
                          }}
                          onBlur={() => {
                            updateRow(row.rowId, {
                              fcRateText: formatRateInput(row.fcRate),
                            });
                          }}
                        />
                      </td>
                      <td className="p-2 text-right">{Number(calc?.fcAmount || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(calc?.lcRate || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(calc?.lcAmount || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className={QUOTATION_FC_RATE_INPUT_CLASS}
                          value={row.revisedFcRateText}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw !== "" && !RATE_INPUT_PATTERN.test(raw)) return;
                            updateRow(row.rowId, {
                              revisedFcRateText: raw,
                              revisedFcRate: parseRateInput(raw),
                            });
                          }}
                          onBlur={() => {
                            updateRow(row.rowId, {
                              revisedFcRateText: formatRateInput(row.revisedFcRate),
                            });
                          }}
                        />
                      </td>
                      <td className="p-2 text-right">
                        {Number(calc?.revisedFcAmount || 0).toFixed(2)}
                      </td>
                      <td className="p-2 text-right">
                        {Number(calc?.revisedLcRate || 0).toFixed(2)}
                      </td>
                      <td className="p-2 text-right">
                        {Number(calc?.revisedLcAmount || 0).toFixed(2)}
                      </td>
                      <td className="p-2 text-right">{Number(calc?.totalWeight || 0).toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <Button
                          type="button"
                          variant={replaceRowId === row.rowId ? "default" : "outline"}
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={
                            loading ||
                            saving ||
                            replacingRowId !== null ||
                            (loadingAlternates && replaceRowId !== row.rowId)
                          }
                          onClick={() => toggleReplacePanel(row.rowId)}
                        >
                          Replace
                        </Button>
                      </td>
                    </tr>
                    {replaceRowId === row.rowId && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={18} className="p-2">
                          <div className="rounded-md border border-dashed border-border p-2">
                            <p className="text-xs font-medium mb-2">
                              Alternate items (same Part No / Master Part No)
                            </p>
                            {loadingAlternates ? (
                              <p className="text-xs text-muted-foreground">Loading alternates...</p>
                            ) : alternateParts.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No alternate items found.
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {alternateParts.map((alternate) => (
                                  <button
                                    key={alternate.id}
                                    type="button"
                                    disabled={replacingRowId !== null}
                                    className="w-full text-left rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                    onClick={() =>
                                      handleReplaceWithAlternate(row.rowId, alternate)
                                    }
                                  >
                                    <span className="font-medium">
                                      {alternate.masterPartNo || "-"} | {alternate.partNo}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      | {alternate.description || "-"} | {alternate.brand || "-"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-semibold border-t">
                  <td className="p-2" />
                  <td className="p-2">Totals</td>
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.requestQty}</td>
                  <td className="p-2 text-right">{quotationTotals.quotationQty}</td>
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.fcAmount.toFixed(2)}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.lcAmount.toFixed(2)}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.revisedFcAmount.toFixed(2)}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.revisedLcAmount.toFixed(2)}</td>
                  <td className="p-2 text-right">{quotationTotals.totalWeight.toFixed(2)}</td>
                  <td className="p-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSaveRevision}
          disabled={loading || saving || !detail}
        >
          {saving ? "Saving..." : "Save Revision"}
        </Button>
      </div>
    </div>
  );
};

type InquiryListMode = "manage" | "quotation";

type PurchaseInquiryListPanelProps = {
  mode: InquiryListMode;
  onViewRequest?: (requestId: string) => void;
  onEditRequest?: (requestId: string) => void;
  onOpenQuotation?: (requestId: string, consignee: string | null) => void;
  showNewInquiryButton?: boolean;
  onNewInquiry?: () => void;
};

const PurchaseInquiryListPanel = ({
  mode,
  onViewRequest,
  onEditRequest,
  onOpenQuotation,
  showNewInquiryButton = false,
  onNewInquiry,
}: PurchaseInquiryListPanelProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [confirmingRequestId, setConfirmingRequestId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requests, setRequests] = useState<PurchaseImportRequestRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterInquiryNo, setFilterInquiryNo] = useState("");
  const [filterPartReference, setFilterPartReference] = useState("");
  const [printingRequestId, setPrintingRequestId] = useState<string | null>(null);
  const [comparingRequestId, setComparingRequestId] = useState<string | null>(null);
  const [supplierFilterOptions, setSupplierFilterOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  const batchSupplierCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of requests) {
      if (!row.batchId || !row.supplierId) continue;
      counts.set(row.batchId, (counts.get(row.batchId) || 0) + 1);
    }
    return counts;
  }, [requests]);

  const batchHasQuotation = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of requests) {
      if (!row.batchId) continue;
      if ((row.PurchaseQuotation || []).length > 0) {
        map.set(row.batchId, true);
      }
    }
    return map;
  }, [requests]);

  const batchHasConfirmedQuotation = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of requests) {
      if (!row.batchId) continue;
      const hasConfirmed = (row.PurchaseQuotation || []).some(
        (quotation) =>
          String(quotation.status || "")
            .trim()
            .toLowerCase() === "confirm",
      );
      if (hasConfirmed) {
        map.set(row.batchId, true);
      }
    }
    return map;
  }, [requests]);

  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const response = await apiClient.getPurchaseImportRequests({
        page: currentPage,
        limit: itemsPerPage,
        supplierId: filterSupplierId || undefined,
        requestNo: filterInquiryNo.trim() || undefined,
        partReference: filterPartReference.trim() || undefined,
      });
      const rows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      const pagination = (response as any)?.pagination;
      setRequests(rows);
      setTotalRecords(pagination?.total ?? rows.length);
    } catch (error: any) {
      toast({
        title: "Failed to load inquiries",
        description: error?.message || "Could not fetch purchase import inquiries.",
        variant: "destructive",
      });
    } finally {
      setLoadingRequests(false);
    }
  }, [
    currentPage,
    itemsPerPage,
    filterSupplierId,
    filterInquiryNo,
    filterPartReference,
    toast,
  ]);

  useEffect(() => {
    const loadSupplierFilters = async () => {
      try {
        const suppliersRes = await apiClient.getSuppliers({
          status: "active",
          page: 1,
          limit: 1000,
        });
        const suppliersData = ((suppliersRes as any)?.data || []).filter(
          (supplier: any) =>
            String(supplier?.type || "")
              .trim()
              .toLowerCase() === "international",
        );
        setSupplierFilterOptions(
          suppliersData.map((supplier: any) => ({
            value: supplier.id,
            label:
              supplier.companyName || supplier.name || supplier.code || "Unnamed Supplier",
          })),
        );
      } catch {
        setSupplierFilterOptions([]);
      }
    };

    void loadSupplierFilters();
  }, []);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const handleFilterSupplierChange = (value: string) => {
    setFilterSupplierId(value);
    setCurrentPage(1);
  };

  const handleFilterInquiryNoChange = (value: string) => {
    setFilterInquiryNo(value);
    setCurrentPage(1);
  };

  const handleFilterPartReferenceChange = (value: string) => {
    setFilterPartReference(value);
    setCurrentPage(1);
  };

  const clearInquiryFilters = () => {
    setFilterSupplierId("");
    setFilterInquiryNo("");
    setFilterPartReference("");
    setCurrentPage(1);
  };

  const handleConfirmRequest = async (requestId: string) => {
    const row = requests.find((r) => r.id === requestId);
    const hasSupplier = Boolean(row?.supplierId || row?.Supplier?.id);
    if (!hasSupplier) {
      toast({
        title: "Supplier required",
        description:
          "Select at least one supplier on the inquiry before confirming.",
        variant: "destructive",
      });
      return;
    }

    setConfirmingRequestId(requestId);
    try {
      await apiClient.updatePurchaseImportRequestStatus(requestId, "confirm");
      toast({
        title: "Inquiry confirmed",
        description: "Inquiry status has been updated to confirm.",
      });
      await fetchRequests();
    } catch (error: any) {
      toast({
        title: "Failed to confirm inquiry",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not update inquiry status.",
        variant: "destructive",
      });
    } finally {
      setConfirmingRequestId(null);
    }
  };

  const handleUnconfirmRequest = async (requestId: string) => {
    const row = requests.find((r) => r.id === requestId);
    if (row?.batchId && batchHasConfirmedQuotation.get(row.batchId)) {
      toast({
        title: "Cannot unconfirm inquiry",
        description:
          "A quotation for this inquiry has already been confirmed.",
        variant: "destructive",
      });
      return;
    }

    const inquiryNo = row?.requestNo || "this inquiry";
    if (
      !window.confirm(
        `Unconfirm inquiry ${inquiryNo}? It will return to pending status.`,
      )
    ) {
      return;
    }

    setConfirmingRequestId(requestId);
    try {
      await apiClient.updatePurchaseImportRequestStatus(requestId, "pending");
      toast({
        title: "Inquiry unconfirmed",
        description: "Inquiry status has been updated to pending.",
      });
      await fetchRequests();
    } catch (error: any) {
      toast({
        title: "Failed to unconfirm inquiry",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not update inquiry status.",
        variant: "destructive",
      });
    } finally {
      setConfirmingRequestId(null);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    const row = requests.find((r) => r.id === requestId);
    const inquiryNo = row?.requestNo || "this inquiry";
    if (
      !window.confirm(
        `Delete inquiry ${inquiryNo}? This is only allowed when no quotation has been made.`,
      )
    ) {
      return;
    }

    setDeletingRequestId(requestId);
    try {
      await apiClient.deletePurchaseImportRequest(requestId);
      toast({
        title: "Inquiry deleted",
        description: `Inquiry ${inquiryNo} has been deleted.`,
      });
      await fetchRequests();
    } catch (error: any) {
      toast({
        title: "Failed to delete inquiry",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not delete the inquiry.",
        variant: "destructive",
      });
    } finally {
      setDeletingRequestId(null);
    }
  };

  const handlePrintQuotationPdf = async (requestId: string) => {
    setPrintingRequestId(requestId);
    try {
      const res = await apiClient.getPurchaseQuotationContext(requestId);
      const data = (res as any)?.data as PurchaseQuotationContextPayload | undefined;
      if (!data) {
        throw new Error("Quotation data is unavailable.");
      }

      const conversionRate = Number(data.conversionRate || 1);
      const items = Array.isArray(data.items) ? data.items : [];
      const itemRows = items.map((item) => {
        const quotationQty = Number(
          item.quotationQuantity ?? item.demandQuantity ?? 0,
        );
        const fcRate = Number(item.fcRate || 0);
        const lcRate = fcRate * conversionRate;
        return {
          masterPartNo: item.masterPartNo,
          partNo: item.partNo,
          description: item.description,
          brand: item.brand,
          currentStock: item.currentStock,
          requestQty: Number(item.demandQuantity || 0),
          quotationQty,
          shipDays: Number(item.shipDays || 0),
          lastFcRate: Number(item.lastFcRate || 0),
          fcRate,
          fcAmount: quotationQty * fcRate,
          lcRate,
          lcAmount: quotationQty * lcRate,
          totalWeight: quotationQty * Number(item.weight || 0),
        };
      });

      const totals = itemRows.reduce(
        (acc, row) => ({
          requestQty: acc.requestQty + Number(row.requestQty || 0),
          quotationQty: acc.quotationQty + Number(row.quotationQty || 0),
          fcAmount: acc.fcAmount + Number(row.fcAmount || 0),
          lcAmount: acc.lcAmount + Number(row.lcAmount || 0),
          totalWeight: acc.totalWeight + Number(row.totalWeight || 0),
        }),
        {
          requestQty: 0,
          quotationQty: 0,
          fcAmount: 0,
          lcAmount: 0,
          totalWeight: 0,
        },
      );

      const started = printPurchaseImportQuotation({
        detail: {
          requestNo: data.requestNo,
          requestDate: data.requestDate,
          quotationNo: data.quotationNo,
          quotationDate: data.quotationDate,
          supplierName: data.supplier?.name,
          currency: data.currency || data.defaultCurrency || data.supplier?.currency,
          conversionRate,
          status: data.existingQuotationId ? "saved" : "draft",
          terms: data.terms,
        },
        itemRows,
        totals,
      });

      if (!started) {
        toast({
          title: "Print blocked",
          description: "Allow pop-ups for this site and try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Print Started",
        description: "PDF is being generated...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to print quotation",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not load quotation data for printing.",
        variant: "destructive",
      });
    } finally {
      setPrintingRequestId(null);
    }
  };

  const handlePrintComparisonPdf = async (requestId: string) => {
    setComparingRequestId(requestId);
    try {
      const started = await printPurchaseQuotationComparisonPdf(requestId);
      if (!started) {
        toast({
          title: "Print blocked",
          description: "Allow pop-ups for this site and try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Comparison PDF",
        description: "Supplier quotation comparison is being generated...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to print comparison",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not generate quotation comparison PDF.",
        variant: "destructive",
      });
    } finally {
      setComparingRequestId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
      {mode === "quotation" && (
        <div>
          <h2 className="text-base font-semibold">Quotation</h2>
          <p className="text-sm text-muted-foreground">
            Select a confirmed inquiry to create or update a supplier quotation.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${mode}-inquiry-filter-supplier`}>Supplier</Label>
            <SearchableSelect
              id={`${mode}-inquiry-filter-supplier`}
              options={supplierFilterOptions}
              value={filterSupplierId}
              onValueChange={handleFilterSupplierChange}
              placeholder="All suppliers"
              aria-label="Filter by supplier"
              className="w-[240px] [&_input]:h-9 [&_input]:text-sm"
              disabled={loadingRequests}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${mode}-inquiry-filter-no`}>Inquiry No</Label>
            <Input
              id={`${mode}-inquiry-filter-no`}
              value={filterInquiryNo}
              onChange={(event) => handleFilterInquiryNoChange(event.target.value)}
              placeholder="Search inquiry no"
              className="h-9 w-[180px]"
              disabled={loadingRequests}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${mode}-inquiry-filter-part-reference`}>Part Reference</Label>
            <Input
              id={`${mode}-inquiry-filter-part-reference`}
              value={filterPartReference}
              onChange={(event) => handleFilterPartReferenceChange(event.target.value)}
              placeholder="Search part reference"
              className="h-9 w-[200px]"
              disabled={loadingRequests}
            />
          </div>
          {(filterSupplierId || filterInquiryNo || filterPartReference) && (
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={clearInquiryFilters}
              disabled={loadingRequests}
            >
              Clear Filters
            </Button>
          )}
        </div>
        {showNewInquiryButton && onNewInquiry ? (
          <Button type="button" onClick={onNewInquiry}>
            <Plus className="w-4 h-4 mr-1" />
            New Inquiry
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className={`${LIST_NUMBER_HEAD_CLASS} p-2 border-b`}>#</th>
              <th className="text-left p-2 border-b">Date</th>
              <th className="text-left p-2 border-b">Inquiry No</th>
              <th className="text-left p-2 border-b">Supplier</th>
              <th className="text-left p-2 border-b">Part Reference</th>
              <th className="text-left p-2 border-b">Consignee</th>
              <th className="text-right p-2 border-b">Items</th>
              <th className="text-right p-2 border-b">Total Qty</th>
              <th className="text-right p-2 border-b">Total Weight</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Notes</th>
              <th className="text-center p-2 border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            {loadingRequests ? (
              <tr>
                <td colSpan={12} className="p-4 text-center text-muted-foreground">
                  Loading inquiries...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-4 text-center text-muted-foreground">
                  {mode === "quotation"
                    ? "No inquiries found."
                    : (
                      <>
                        No inquiries found. Use <span className="font-medium">New Inquiry</span> or the Inquiry Form tab.
                      </>
                    )}
                </td>
              </tr>
            ) : (
              requests.map((row, index) => {
                const isConfirmed = isInquiryConfirmed(row.status);
                const hasQuotation = (row.PurchaseQuotation || []).length > 0;
                const hasConfirmedQuotation = (row.PurchaseQuotation || []).some(
                  (quotation) =>
                    String(quotation.status || "")
                      .trim()
                      .toLowerCase() === "confirm",
                );
                const itemRows = row.PurchaseImportRequestItem || [];
                const totalQty = itemRows.reduce(
                  (sum, item) => sum + Number(item.demandQuantity || 0),
                  0,
                );
                const totalWeight = itemRows.reduce(
                  (sum, item) => sum + Number(item.totalWeight || 0),
                  0,
                );
                const supplierName =
                  row.Supplier?.companyName ||
                  row.Supplier?.name ||
                  row.Supplier?.code ||
                  "N/A";
                const hasSupplier = Boolean(row.supplierId || row.Supplier?.id);
                const consigneeLabel = formatConsigneesFromSplitQuantities(
                  itemRows,
                  row.consignee,
                );
                const batchSupplierCount = batchSupplierCounts.get(row.batchId) || 0;
                const showComparisonPdf =
                  mode === "quotation" &&
                  batchSupplierCount >= 2 &&
                  Boolean(batchHasQuotation.get(row.batchId));
                const canUnconfirmInquiry =
                  isConfirmed && !batchHasConfirmedQuotation.get(row.batchId);
                return (
                  <tr key={row.id} className="border-b hover:bg-muted/20">
                    <td className={`${LIST_NUMBER_CELL_CLASS} p-2`}>
                      {getListRowNumber(index, currentPage, itemsPerPage, totalRecords)}
                    </td>
                    <td className="p-2">
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-2 font-mono text-xs">{row.requestNo || "-"}</td>
                    <td className="p-2">{supplierName}</td>
                    <td className="p-2 max-w-[180px] truncate" title={row.partReference || ""}>
                      {row.partReference || "-"}
                    </td>
                    <td className="p-2 font-medium">{consigneeLabel}</td>
                    <td className="p-2 text-right">{itemRows.length}</td>
                    <td className="p-2 text-right">{totalQty}</td>
                    <td className="p-2 text-right">{totalWeight.toFixed(2)}</td>
                    <td className="p-2 font-medium">
                      {formatInquiryListStatus(row.status)}
                    </td>
                    <td className="p-2 max-w-[260px] truncate" title={row.notes || ""}>
                      {row.notes || "-"}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {mode === "manage" ? (
                          <>
                            {!isConfirmed ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmRequest(row.id)}
                                disabled={
                                  confirmingRequestId === row.id || !hasSupplier
                                }
                                title={
                                  !hasSupplier
                                    ? "Select at least one supplier before confirming"
                                    : undefined
                                }
                              >
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Confirm
                              </Button>
                            ) : canUnconfirmInquiry ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleUnconfirmRequest(row.id)}
                                disabled={confirmingRequestId === row.id}
                                title="Unconfirm inquiry (only before a quotation is confirmed)"
                              >
                                Unconfirm
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onViewRequest?.(row.id)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isConfirmed}
                              onClick={() => {
                                if (isConfirmed) return;
                                onEditRequest?.(row.id);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                            {!hasQuotation ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                disabled={deletingRequestId === row.id}
                                title="Delete inquiry (only when no quotation exists)"
                                onClick={() => void handleDeleteRequest(row.id)}
                              >
                                <Trash className="w-3.5 h-3.5 mr-1" />
                                {deletingRequestId === row.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!isConfirmed || hasConfirmedQuotation}
                              title={
                                hasConfirmedQuotation
                                  ? "Quotation is already confirmed"
                                  : !isConfirmed
                                    ? "Confirm the inquiry before creating a quotation"
                                    : undefined
                              }
                              onClick={() => {
                                if (!isConfirmed || hasConfirmedQuotation) return;
                                onOpenQuotation?.(row.id, row.consignee || null);
                              }}
                            >
                              Quotation
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                navigate(`/purchase-import/inquiry?view=${row.id}`)
                              }
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Inquiry
                            </Button>
                            <PrintPdfButton
                              size="sm"
                              disabled={
                                !isConfirmed || printingRequestId === row.id
                              }
                              label={
                                printingRequestId === row.id
                                  ? "Printing..."
                                  : "Print PDF"
                              }
                              onPrint={() => {
                                if (!isConfirmed || printingRequestId) return;
                                void handlePrintQuotationPdf(row.id);
                              }}
                            />
                            {showComparisonPdf ? (
                              <PrintPdfButton
                                size="sm"
                                disabled={comparingRequestId === row.id}
                                label={
                                  comparingRequestId === row.id
                                    ? "Comparing..."
                                    : "Compare PDF"
                                }
                                onPrint={() => {
                                  if (comparingRequestId) return;
                                  void handlePrintComparisonPdf(row.id);
                                }}
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loadingRequests && totalRecords > 0 && (
        <PurchaseImportListPagination
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalRecords={totalRecords}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
};

type QuotationListView = "open" | "confirmed";
type QuotationListAction = "revise" | "confirm" | "revise-confirm" | "none";

const isQuotationPurchaseImportSaved = (
  purchaseOrders?: PurchaseQuotationRecord["PurchaseOrder"],
) =>
  (purchaseOrders || []).some((po) => {
    const status = String(po.status || "")
      .trim()
      .toLowerCase();
    if (
      status === "purchase invoice pending" ||
      status === "stock receiving pending" ||
      status === "received"
    ) {
      return true;
    }
    return (po.PurchaseOrderItem || []).some(
      (item) => Number(item.fcRate || 0) > 0 || Number(item.receivedQty || 0) > 0,
    );
  });

type PurchaseQuotationListPanelProps = {
  view: QuotationListView;
  action: QuotationListAction;
  title: string;
  description: string;
  onRevise?: (quotationId: string) => void;
  onConfirm?: (quotationId: string) => void;
};

const PurchaseQuotationListPanel = ({
  view,
  action,
  title,
  description,
  onRevise,
  onConfirm,
}: PurchaseQuotationListPanelProps) => {
  const { toast } = useToast();
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [quotations, setQuotations] = useState<PurchaseQuotationRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [printingQuotationId, setPrintingQuotationId] = useState<string | null>(null);
  const [deletingQuotationId, setDeletingQuotationId] = useState<string | null>(null);
  const [unconfirmingQuotationId, setUnconfirmingQuotationId] = useState<string | null>(
    null,
  );
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterQuotationNo, setFilterQuotationNo] = useState("");
  const [filterPartReference, setFilterPartReference] = useState("");
  const [appliedPartReference, setAppliedPartReference] = useState("");
  const [supplierFilterOptions, setSupplierFilterOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [quotationNoFilterOptions, setQuotationNoFilterOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  const isConfirmedView = view === "confirmed";
  const showUnconfirmAction = action === "revise-confirm" || action === "confirm";
  const openListColSpan = 14;
  const confirmedListColSpan = 12;
  const CONSIGNEE_ORDER = ["ISB", "KHI", "Other"] as const;
  const listStatus =
    view === "confirmed"
      ? ("confirm" as const)
      : action === "revise-confirm" || action === "confirm"
        ? ("all" as const)
        : ("open" as const);

  const fetchQuotations = useCallback(async () => {
    setLoadingQuotations(true);
    try {
      const response = await apiClient.getPurchaseQuotations({
        page: currentPage,
        limit: itemsPerPage,
        status: listStatus,
        supplierId: filterSupplierId || undefined,
        quotationNo: filterQuotationNo.trim() || undefined,
        partReference: appliedPartReference || undefined,
      });
      const rows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      const pagination = (response as any)?.pagination;
      setQuotations(rows);
      setTotalRecords(pagination?.total ?? rows.length);
    } catch (error: any) {
      toast({
        title: "Failed to load quotations",
        description: error?.message || "Could not fetch purchase quotations.",
        variant: "destructive",
      });
    } finally {
      setLoadingQuotations(false);
    }
  }, [
    currentPage,
    itemsPerPage,
    listStatus,
    filterSupplierId,
    filterQuotationNo,
    appliedPartReference,
    toast,
  ]);

  useEffect(() => {
    const loadSupplierFilters = async () => {
      try {
        const suppliersRes = await apiClient.getSuppliers({
          status: "active",
          page: 1,
          limit: 1000,
        });
        const suppliersData = ((suppliersRes as any)?.data || []).filter(
          (supplier: any) =>
            String(supplier?.type || "")
              .trim()
              .toLowerCase() === "international",
        );
        setSupplierFilterOptions(
          suppliersData.map((supplier: any) => ({
            value: supplier.id,
            label:
              supplier.companyName || supplier.name || supplier.code || "Unnamed Supplier",
          })),
        );
      } catch {
        setSupplierFilterOptions([]);
      }
    };

    void loadSupplierFilters();
  }, []);

  useEffect(() => {
    const loadQuotationNoFilters = async () => {
      try {
        const response = await apiClient.getPurchaseQuotations({
          page: 1,
          limit: 1000,
          status: listStatus,
        });
        const rows = Array.isArray((response as any)?.data)
          ? (response as any).data
          : Array.isArray(response)
            ? response
            : [];
        const seen = new Set<string>();
        const options: Array<{ value: string; label: string }> = [];
        for (const row of rows) {
          const quotationNo = String(row?.quotationNo || "").trim();
          if (!quotationNo || seen.has(quotationNo)) continue;
          seen.add(quotationNo);
          options.push({ value: quotationNo, label: quotationNo });
        }
        options.sort((a, b) => a.label.localeCompare(b.label));
        setQuotationNoFilterOptions(options);
      } catch {
        setQuotationNoFilterOptions([]);
      }
    };

    void loadQuotationNoFilters();
  }, [listStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = filterPartReference.trim();
      setAppliedPartReference((prev) => {
        if (prev === next) return prev;
        setCurrentPage(1);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [filterPartReference]);

  useEffect(() => {
    void fetchQuotations();
  }, [fetchQuotations]);

  const handleFilterSupplierChange = (value: string) => {
    setFilterSupplierId(value);
    setCurrentPage(1);
  };

  const handleFilterQuotationNoChange = (value: string) => {
    setFilterQuotationNo(value);
    setCurrentPage(1);
  };

  const clearQuotationFilters = () => {
    setFilterSupplierId("");
    setFilterQuotationNo("");
    setFilterPartReference("");
    setAppliedPartReference("");
    setCurrentPage(1);
  };

  const handleDeleteQuotation = async (quotationId: string) => {
    const row = quotations.find((q) => q.id === quotationId);
    const quotationNo = row?.quotationNo || "this quotation";
    if (
      !window.confirm(
        `Delete quotation ${quotationNo}? This is only allowed when the quotation is not confirmed. If this is the last quotation for its inquiry, the inquiry will go back to unconfirmed.`,
      )
    ) {
      return;
    }

    setDeletingQuotationId(quotationId);
    try {
      await apiClient.deletePurchaseQuotation(quotationId);
      toast({
        title: "Quotation deleted",
        description: `Quotation ${quotationNo} has been deleted.`,
      });
      await fetchQuotations();
    } catch (error: any) {
      toast({
        title: "Failed to delete quotation",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not delete the quotation.",
        variant: "destructive",
      });
    } finally {
      setDeletingQuotationId(null);
    }
  };

  const handleUnconfirmQuotation = async (quotationId: string) => {
    const row = quotations.find((q) => q.id === quotationId);
    const quotationNo = row?.quotationNo || "this quotation";
    if (isQuotationPurchaseImportSaved(row?.PurchaseOrder)) {
      toast({
        title: "Cannot unconfirm quotation",
        description:
          "Purchase Import has already been saved for this quotation.",
        variant: "destructive",
      });
      return;
    }

    if (
      !window.confirm(
        `Unconfirm quotation ${quotationNo}? Related purchase order(s) will be deleted and the quotation will return to an open status.`,
      )
    ) {
      return;
    }

    setUnconfirmingQuotationId(quotationId);
    try {
      await apiClient.unconfirmPurchaseQuotation(quotationId);
      toast({
        title: "Quotation unconfirmed",
        description: `Quotation ${quotationNo} has been unconfirmed.`,
      });
      await fetchQuotations();
    } catch (error: any) {
      toast({
        title: "Failed to unconfirm quotation",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not unconfirm quotation.",
        variant: "destructive",
      });
    } finally {
      setUnconfirmingQuotationId(null);
    }
  };

  const handlePrintQuotationById = async (
    quotationId: string,
    extras?: {
      poNumber?: string | null;
      consignee?: string | null;
    },
  ) => {
    setPrintingQuotationId(quotationId);
    try {
      const res = await apiClient.getPurchaseQuotationById(quotationId);
      const data = (res as any)?.data as PurchaseQuotationDetailPayload | undefined;
      if (!data) {
        throw new Error("Quotation detail is unavailable.");
      }

      const revised = isQuotationRevised(data);
      const statusLower = String(data.status || "")
        .trim()
        .toLowerCase();
      const items = Array.isArray(data.items) ? data.items : [];
      const conversionRate = Number(data.conversionRate || 1);
      const itemRows = items.map((item) => {
        const quotationQty = Number(item.quotationQuantity || 0);
        const fcRate = Number(item.fcRate || 0);
        const lcRate = Number(item.lcRate || fcRate * conversionRate);
        const fcAmount = Number(item.fcAmount || quotationQty * fcRate);
        const lcAmount = Number(item.lcAmount || quotationQty * lcRate);
        const revisedFcRate = Number(item.revisedFcRate || 0);
        const revisedLcRate = Number(
          item.revisedLcRate || revisedFcRate * conversionRate,
        );
        const revisedFcAmount = Number(
          item.revisedFcAmount || quotationQty * revisedFcRate,
        );
        const revisedLcAmount = Number(
          item.revisedLcAmount || quotationQty * revisedLcRate,
        );
        return {
          masterPartNo: item.masterPartNo,
          partNo: item.partNo,
          description: item.description,
          brand: item.brand,
          currentStock: item.currentStock,
          requestQty: Number(item.demandQuantity || 0),
          quotationQty,
          shipDays: Number(item.shipDays || 0),
          lastFcRate: Number(item.lastFcRate || 0),
          fcRate,
          fcAmount,
          lcRate,
          lcAmount,
          revisedFcRate,
          revisedFcAmount,
          revisedLcRate,
          revisedLcAmount,
          totalWeight: Number(
            item.totalWeight || quotationQty * Number(item.weight || 0),
          ),
        };
      });

      const totals = itemRows.reduce(
        (acc, row) => ({
          requestQty: acc.requestQty + Number(row.requestQty || 0),
          quotationQty: acc.quotationQty + Number(row.quotationQty || 0),
          fcAmount: acc.fcAmount + Number(row.fcAmount || 0),
          lcAmount: acc.lcAmount + Number(row.lcAmount || 0),
          revisedFcAmount: acc.revisedFcAmount + Number(row.revisedFcAmount || 0),
          revisedLcAmount: acc.revisedLcAmount + Number(row.revisedLcAmount || 0),
          totalWeight: acc.totalWeight + Number(row.totalWeight || 0),
        }),
        {
          requestQty: 0,
          quotationQty: 0,
          fcAmount: 0,
          lcAmount: 0,
          revisedFcAmount: 0,
          revisedLcAmount: 0,
          totalWeight: 0,
        },
      );

      const started = printPurchaseImportQuotation({
        detail: {
          requestNo: data.request?.requestNo,
          requestDate: data.request?.requestDate,
          quotationNo: data.quotationNo,
          quotationDate: data.quotationDate,
          revisedQuotationDate: data.revisedQuotationDate,
          confirmationDate: data.confirmationDate,
          supplierName:
            data.supplier?.name ||
            data.supplier?.code ||
            null,
          currency: data.currency,
          conversionRate: data.conversionRate,
          status: data.status,
          terms: data.terms,
          poNumber: extras?.poNumber || null,
          consignee: extras?.consignee || data.request?.consignee || null,
        },
        showRevisedFields: revised,
        itemRows,
        totals,
      });

      if (!started) {
        toast({
          title: "Print blocked",
          description: "Allow pop-ups for this site and try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Print Started",
        description: "PDF is being generated...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to print quotation",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not load quotation data for printing.",
        variant: "destructive",
      });
    } finally {
      setPrintingQuotationId(null);
    }
  };

  const displayRows = useMemo(() => {
    type ConfirmedListRow = {
      key: string;
      quotation: PurchaseQuotationRecord;
      purchaseOrder: NonNullable<PurchaseQuotationRecord["PurchaseOrder"]>[number] | null;
    };

    if (!isConfirmedView) {
      return quotations.map((row) => ({
        key: row.id,
        quotation: row,
        purchaseOrder: null,
      })) as ConfirmedListRow[];
    }

    const expanded: ConfirmedListRow[] = [];

    for (const row of quotations) {
      const purchaseOrders = [...(row.PurchaseOrder || [])].sort((a, b) => {
        const aKey = String(a.consignee || "").trim().toUpperCase();
        const bKey = String(b.consignee || "").trim().toUpperCase();
        const aIndex = CONSIGNEE_ORDER.findIndex(
          (value) => value.toUpperCase() === aKey,
        );
        const bIndex = CONSIGNEE_ORDER.findIndex(
          (value) => value.toUpperCase() === bKey,
        );
        const safeA = aIndex === -1 ? CONSIGNEE_ORDER.length : aIndex;
        const safeB = bIndex === -1 ? CONSIGNEE_ORDER.length : bIndex;
        if (safeA !== safeB) return safeA - safeB;
        return String(a.poNumber || "").localeCompare(String(b.poNumber || ""));
      });

      if (purchaseOrders.length === 0) {
        expanded.push({
          key: row.id,
          quotation: row,
          purchaseOrder: null,
        });
        continue;
      }

      for (const purchaseOrder of purchaseOrders) {
        expanded.push({
          key: `${row.id}-${purchaseOrder.id}`,
          quotation: row,
          purchaseOrder,
        });
      }
    }

    return expanded;
  }, [isConfirmedView, quotations]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`quotation-filter-no-${view}-${action}`}>Quotation No</Label>
          <SearchableSelect
            id={`quotation-filter-no-${view}-${action}`}
            options={quotationNoFilterOptions}
            value={filterQuotationNo}
            onValueChange={handleFilterQuotationNoChange}
            placeholder="All quotation nos"
            aria-label="Filter by quotation number"
            className="w-[200px] [&_input]:h-9 [&_input]:text-sm"
            selectedDisplayLabelOnly
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`quotation-filter-supplier-${view}-${action}`}>Supplier</Label>
          <SearchableSelect
            id={`quotation-filter-supplier-${view}-${action}`}
            options={supplierFilterOptions}
            value={filterSupplierId}
            onValueChange={handleFilterSupplierChange}
            placeholder="All suppliers"
            aria-label="Filter by supplier"
            className="w-[240px] [&_input]:h-9 [&_input]:text-sm"
            selectedDisplayLabelOnly
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`quotation-filter-part-reference-${view}-${action}`}>
            Part Reference
          </Label>
          <Input
            id={`quotation-filter-part-reference-${view}-${action}`}
            value={filterPartReference}
            onChange={(event) => setFilterPartReference(event.target.value)}
            placeholder="Search part reference"
            className="h-9 w-[200px]"
          />
        </div>
        {(filterSupplierId || filterQuotationNo || filterPartReference) && (
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={clearQuotationFilters}
          >
            Clear Filters
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className={`${LIST_NUMBER_HEAD_CLASS} p-2 border-b`}>#</th>
              {isConfirmedView ? (
                <>
                  <th className="text-left p-2 border-b">Confirmation Date</th>
                  <th className="text-left p-2 border-b">Quotation Date</th>
                </>
              ) : (
                <th className="text-left p-2 border-b">Date</th>
              )}
              <th className="text-left p-2 border-b">Quotation No</th>
              {!isConfirmedView && (
                <th className="text-left p-2 border-b">Inquiry No</th>
              )}
              <th className="text-left p-2 border-b">Supplier</th>
              <th className="text-left p-2 border-b">Part Reference</th>
              <th className="text-left p-2 border-b">Consignee</th>
              <th className="text-right p-2 border-b">Items</th>
              <th className="text-right p-2 border-b">FC Total</th>
              <th className="text-right p-2 border-b">LC Total</th>
              {!isConfirmedView && (
                <>
                  <th className="text-left p-2 border-b">Type</th>
                  <th className="text-left p-2 border-b">Status</th>
                </>
              )}
              <th className="text-left p-2 border-b">PO No</th>
              <th className="text-center p-2 border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            {loadingQuotations ? (
              <tr>
                <td
                  colSpan={
                    isConfirmedView ? confirmedListColSpan : openListColSpan
                  }
                  className="p-4 text-center text-muted-foreground"
                >
                  Loading quotations...
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    isConfirmedView ? confirmedListColSpan : openListColSpan
                  }
                  className="p-4 text-center text-muted-foreground"
                >
                  {isConfirmedView
                    ? "No confirmed quotations found yet."
                    : "No quotations found yet."}
                </td>
              </tr>
            ) : (
              displayRows.map((entry, index) => {
                const row = entry.quotation;
                const normalizedStatus = String(row.status || "")
                  .trim()
                  .toLowerCase();
                const isConfirmed = normalizedStatus === "confirm";
                const isRevised = normalizedStatus === "revise";
                const itemRows = row.PurchaseQuotationItem || [];
                const purchaseOrders = row.PurchaseOrder || [];
                const supplierName =
                  row.Supplier?.companyName ||
                  row.Supplier?.name ||
                  row.Supplier?.code ||
                  "N/A";
                const poNumber = isConfirmedView
                  ? entry.purchaseOrder?.poNumber || "-"
                  : purchaseOrders
                      .map((po) => po.poNumber)
                      .filter(Boolean)
                      .join(", ") || "-";
                const consigneeLabel = getQuotationListConsigneeLabel(row, {
                  purchaseOrderConsignee: entry.purchaseOrder?.consignee,
                });
                const canUnconfirmQuotation =
                  isConfirmed &&
                  !isQuotationPurchaseImportSaved(purchaseOrders);
                const isFirstRowForQuotation =
                  index === 0 ||
                  displayRows[index - 1]?.quotation.id !== row.id;

                return (
                  <tr key={entry.key} className="border-b hover:bg-muted/20">
                    <td className={`${LIST_NUMBER_CELL_CLASS} p-2`}>
                      {getListRowNumber(index, currentPage, itemsPerPage, totalRecords)}
                    </td>
                    {isConfirmedView ? (
                      <>
                        <td className="p-2">
                          {row.confirmationDate
                            ? new Date(row.confirmationDate).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="p-2">
                          {row.quotationDate
                            ? new Date(row.quotationDate).toLocaleDateString()
                            : "-"}
                        </td>
                      </>
                    ) : (
                      <td className="p-2">
                        {row.quotationDate
                          ? new Date(row.quotationDate).toLocaleDateString()
                          : "-"}
                      </td>
                    )}
                    <td className="p-2 font-mono text-xs">{row.quotationNo || "-"}</td>
                    {!isConfirmedView && (
                      <td className="p-2 font-mono text-xs">
                        {row.PurchaseImportRequest?.requestNo || "-"}
                      </td>
                    )}
                    <td className="p-2">{supplierName}</td>
                    <td
                      className="p-2 max-w-[180px] truncate"
                      title={row.PurchaseImportRequest?.partReference || ""}
                    >
                      {row.PurchaseImportRequest?.partReference || "-"}
                    </td>
                    <td className="p-2 font-medium">{consigneeLabel}</td>
                    <td className="p-2 text-right">{itemRows.length}</td>
                    <td className="p-2 text-right">
                      {Number(row.fcTotal || 0).toFixed(2)} {row.currency || ""}
                    </td>
                    <td className="p-2 text-right">{Number(row.lcTotal || 0).toFixed(2)}</td>
                    {!isConfirmedView && (
                      <>
                        <td className="p-2 capitalize">{row.quotationType || "original"}</td>
                        <td className="p-2 capitalize">{row.status || "pending"}</td>
                      </>
                    )}
                    <td className="p-2 font-mono text-xs">{poNumber}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {!isConfirmedView &&
                        (action === "confirm" || action === "revise-confirm") ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onConfirm?.(row.id)}
                            disabled={isConfirmed}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {isConfirmed ? "Confirmed" : "Confirm"}
                          </Button>
                        ) : null}
                        {!isConfirmedView &&
                        (action === "revise" || action === "revise-confirm") ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onRevise?.(row.id)}
                            disabled={isConfirmed}
                          >
                            {isRevised ? "Revise Again" : "Revise"}
                          </Button>
                        ) : null}
                        {showUnconfirmAction &&
                        isFirstRowForQuotation &&
                        canUnconfirmQuotation ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={unconfirmingQuotationId === row.id}
                            title="Unconfirm quotation (only before Purchase Import is saved)"
                            onClick={() => void handleUnconfirmQuotation(row.id)}
                          >
                            {unconfirmingQuotationId === row.id
                              ? "Unconfirming..."
                              : "Unconfirm"}
                          </Button>
                        ) : null}
                        {showUnconfirmAction &&
                        isFirstRowForQuotation &&
                        isConfirmed &&
                        !canUnconfirmQuotation ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                            title="Purchase Import already saved — quotation cannot be unconfirmed"
                            className="opacity-50 cursor-not-allowed"
                          >
                            Unconfirm
                          </Button>
                        ) : null}
                        <PrintPdfButton
                          size="sm"
                          disabled={printingQuotationId === row.id}
                          label={
                            printingQuotationId === row.id
                              ? "Printing..."
                              : "Print PDF"
                          }
                          onPrint={() => {
                            if (printingQuotationId) return;
                            void handlePrintQuotationById(row.id, {
                              poNumber:
                                entry.purchaseOrder?.poNumber ||
                                (poNumber !== "-" ? poNumber : null),
                              consignee:
                                consigneeLabel !== "-"
                                  ? consigneeLabel
                                  : entry.purchaseOrder?.consignee || null,
                            });
                          }}
                        />
                        {!isConfirmed ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={deletingQuotationId === row.id}
                            title="Delete quotation (only when not confirmed)"
                            onClick={() => void handleDeleteQuotation(row.id)}
                          >
                            <Trash className="w-3.5 h-3.5 mr-1" />
                            {deletingQuotationId === row.id
                              ? "Deleting..."
                              : "Delete"}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loadingQuotations && totalRecords > 0 && (
        <PurchaseImportListPagination
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalRecords={totalRecords}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
};

const PurchaseImportRequestTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requestView, setRequestView] = useState<"form" | "list">("form");
  const showRequestForm = requestView === "form";
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [viewingRequestId, setViewingRequestId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  useEffect(() => {
    const editId = searchParams.get("edit");
    const viewId = searchParams.get("view");
    if (viewId) {
      setEditingRequestId(viewId);
      setViewingRequestId(viewId);
      setRequestView("form");
    } else if (editId) {
      setEditingRequestId(editId);
      setViewingRequestId(null);
      setRequestView("form");
    }
  }, [searchParams]);

  const goToRequestList = () => {
    setRequestView("list");
    setEditingRequestId(null);
    setViewingRequestId(null);
    setSearchParams({}, { replace: true });
    setListRefreshKey((value) => value + 1);
  };

  const goToNewRequestForm = () => {
    setEditingRequestId(null);
    setViewingRequestId(null);
    setRequestView("form");
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={requestView}
        onValueChange={(v) => setRequestView(v as "form" | "list")}
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="form">Inquiry Form</TabsTrigger>
          <TabsTrigger value="list">Inquiry List</TabsTrigger>
        </TabsList>
      </Tabs>

      {showRequestForm ? (
        viewingRequestId ? (
          <PurchaseImportRequestView
            requestId={viewingRequestId}
            onBack={goToRequestList}
          />
        ) : (
          <PurchaseImportRequestForm
            requestId={editingRequestId}
            onCancel={goToRequestList}
            onSaved={goToRequestList}
          />
        )
      ) : (
        <PurchaseInquiryListPanel
          key={listRefreshKey}
          mode="manage"
          showNewInquiryButton
          onNewInquiry={goToNewRequestForm}
          onViewRequest={(requestId) => {
            setEditingRequestId(requestId);
            setViewingRequestId(requestId);
            setRequestView("form");
            setSearchParams({ view: requestId }, { replace: true });
          }}
          onEditRequest={(requestId) => {
            setEditingRequestId(requestId);
            setViewingRequestId(null);
            setRequestView("form");
            setSearchParams({ edit: requestId }, { replace: true });
          }}
        />
      )}
    </div>
  );
};

type PurchaseQuotationConfirmRow = {
  rowId: string;
  quotationId: string;
  quotationNo: string;
  inquiryNo?: string | null;
  partId: string;
  masterPartNo: string;
  partNo: string;
  description: string;
  brand: string;
  currentStock: number;
  demandQuantity: number;
  quotationQuantity: number;
  shipDays: number;
  lastFcRate: number;
  fcRate: number;
  fcAmount: number;
  lcRate: number;
  lcAmount: number;
  weight: number;
  totalWeight: number;
  khiQuantity: number;
  isbQuantity: number;
  otherQuantity: number;
  confirmQuantity: number;
};

const recalcConfirmRowAmounts = (
  row: Pick<PurchaseQuotationConfirmRow, "fcRate" | "lcRate" | "weight" | "confirmQuantity">,
) => {
  const confirmQuantity = Math.max(0, Number(row.confirmQuantity) || 0);
  const fcRate = Number(row.fcRate) || 0;
  const lcRate = Number(row.lcRate) || 0;
  const weight = Number(row.weight) || 0;
  return {
    confirmQuantity,
    fcAmount: fcRate * confirmQuantity,
    lcAmount: lcRate * confirmQuantity,
    totalWeight: weight * confirmQuantity,
  };
};

const buildConfirmRowsFromQuotationDetail = (
  data: PurchaseQuotationDetailPayload,
): PurchaseQuotationConfirmRow[] => {
  const revised = isQuotationRevised(data);
  return (Array.isArray(data.items) ? data.items : []).map((item) => {
    const effective = getEffectiveQuotationItemValues(item, revised);
    const confirmQuantity = Number(item.quotationQuantity || 0);
    const quotationQuantity = Number(item.quotationQuantity || 0);
    const storedWeight = Number(item.weight || 0);
    const weight =
      storedWeight > 0
        ? storedWeight
        : quotationQuantity > 0
          ? Number(item.totalWeight || 0) / quotationQuantity
          : 0;
    const split = distributeConfirmSplitQuantities(
      confirmQuantity,
      Number(item.khiQuantity || 0),
      Number(item.isbQuantity || 0),
      Number(item.otherQuantity || 0),
    );
    const amounts = recalcConfirmRowAmounts({
      fcRate: effective.fcRate,
      lcRate: effective.lcRate,
      weight,
      confirmQuantity,
    });
    return {
      rowId: createRowId(),
      quotationId: data.id,
      quotationNo: data.quotationNo || "",
      inquiryNo: data.request?.requestNo || null,
      partId: item.partId,
      masterPartNo: item.masterPartNo || "",
      partNo: item.partNo || "",
      description: item.description || "",
      brand: item.brand || "",
      currentStock: Number(item.currentStock || 0),
      demandQuantity: Number(item.demandQuantity || 0),
      quotationQuantity,
      shipDays: Number(item.shipDays || 0),
      lastFcRate: Number(item.lastFcRate || 0),
      fcRate: effective.fcRate,
      lcRate: effective.lcRate,
      weight,
      ...split,
      ...amounts,
    };
  });
};

const PurchaseQuotationConfirmForm = ({
  quotationId,
  onSaved,
  onCancel,
}: {
  quotationId: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) => {
  const { toast } = useToast();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<PurchaseQuotationDetailPayload | null>(null);
  const [confirmationDate, setConfirmationDate] = useState(toInputDate(new Date()));
  const [rows, setRows] = useState<PurchaseQuotationConfirmRow[]>([]);
  const [combinableQuotations, setCombinableQuotations] = useState<
    Array<{
      id: string;
      quotationNo: string;
      inquiryNo?: string | null;
      partReference?: string | null;
      itemsCount: number;
      currency?: string | null;
    }>
  >([]);
  const [selectedCombineIds, setSelectedCombineIds] = useState<string[]>([]);
  const [loadingCombineId, setLoadingCombineId] = useState<string | null>(null);

  const isRevised = isQuotationRevised(detail);
  const isCombinedView = selectedCombineIds.length > 0;

  useEffect(() => {
    const loadQuotation = async () => {
      setLoading(true);
      setCombinableQuotations([]);
      setSelectedCombineIds([]);
      try {
        const res = await apiClient.getPurchaseQuotationById(quotationId);
        const data = (res as any)?.data as PurchaseQuotationDetailPayload | undefined;
        if (!data) {
          throw new Error("Quotation detail is unavailable.");
        }
        setDetail(data);
        setConfirmationDate(toInputDate(new Date()));
        setRows(buildConfirmRowsFromQuotationDetail(data));

        const supplierId = String(data.supplier?.id || "").trim();
        if (supplierId) {
          try {
            const openRes = await apiClient.getPurchaseQuotations({
              status: "open",
              supplierId,
              page: 1,
              limit: 200,
            });
            const openRows = Array.isArray((openRes as any)?.data)
              ? (openRes as any).data
              : [];
            const primaryCurrency = String(data.currency || "")
              .trim()
              .toUpperCase();
            setCombinableQuotations(
              openRows
                .filter((row: any) => {
                  const id = String(row.id || "");
                  if (!id || id === quotationId) return false;
                  const status = String(row.status || "")
                    .trim()
                    .toLowerCase();
                  if (status === "confirm") return false;
                  if ((row.PurchaseOrder || []).length > 0) return false;
                  const currency = String(row.currency || "")
                    .trim()
                    .toUpperCase();
                  if (primaryCurrency && currency && currency !== primaryCurrency) {
                    return false;
                  }
                  return true;
                })
                .map((row: any) => ({
                  id: String(row.id),
                  quotationNo: String(row.quotationNo || ""),
                  inquiryNo: row.PurchaseImportRequest?.requestNo || null,
                  partReference: row.PurchaseImportRequest?.partReference || null,
                  itemsCount: Array.isArray(row.PurchaseQuotationItem)
                    ? row.PurchaseQuotationItem.length
                    : 0,
                  currency: row.currency || null,
                })),
            );
          } catch {
            setCombinableQuotations([]);
          }
        }
      } catch (error: any) {
        toast({
          title: "Failed to load quotation",
          description:
            error?.response?.data?.error || error?.message || "Could not load quotation detail.",
          variant: "destructive",
        });
        onCancelRef.current?.();
      } finally {
        setLoading(false);
      }
    };

    void loadQuotation();
  }, [quotationId, toast]);

  const toggleCombineQuotation = async (targetId: string, checked: boolean) => {
    if (!checked) {
      setSelectedCombineIds((prev) => prev.filter((id) => id !== targetId));
      setRows((prev) => prev.filter((row) => row.quotationId !== targetId));
      return;
    }

    setLoadingCombineId(targetId);
    try {
      const res = await apiClient.getPurchaseQuotationById(targetId);
      const data = (res as any)?.data as PurchaseQuotationDetailPayload | undefined;
      if (!data) {
        throw new Error("Selected quotation detail is unavailable.");
      }
      const nextRows = buildConfirmRowsFromQuotationDetail(data);
      setRows((prev) => [
        ...prev.filter((row) => row.quotationId !== targetId),
        ...nextRows,
      ]);
      setSelectedCombineIds((prev) =>
        prev.includes(targetId) ? prev : [...prev, targetId],
      );
    } catch (error: any) {
      toast({
        title: "Failed to add quotation",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not load the selected quotation to combine.",
        variant: "destructive",
      });
    } finally {
      setLoadingCombineId(null);
    }
  };

  const handleConfirmQtyChange = (rowId: string, rawValue: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const confirmQuantity =
          rawValue.trim() === ""
            ? 0
            : Math.max(0, Math.floor(Number(rawValue)));
        return {
          ...row,
          ...recalcConfirmRowAmounts({
            fcRate: row.fcRate,
            lcRate: row.lcRate,
            weight: row.weight,
            confirmQuantity,
          }),
        };
      }),
    );
  };

  const updateConfirmSplitQuantity = (
    rowId: string,
    field: "khiQuantity" | "isbQuantity" | "otherQuantity",
    value: number,
  ) => {
    if (!SHOW_OTHER_QTY && field === "otherQuantity") return;
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = {
          ...row,
          [field]: qty,
          ...(SHOW_OTHER_QTY ? {} : { otherQuantity: 0 }),
        };
        const confirmQuantity = getConfirmRowSplitSum(next);
        return {
          ...next,
          ...recalcConfirmRowAmounts({
            fcRate: next.fcRate,
            lcRate: next.lcRate,
            weight: next.weight,
            confirmQuantity,
          }),
        };
      }),
    );
  };

  const splitMismatchMessages = useMemo(
    () =>
      rows
        .map((row) => getConfirmRowSplitMismatch(row))
        .filter((message): message is string => Boolean(message)),
    [rows],
  );
  const hasSplitMismatch = splitMismatchMessages.length > 0;

  const quotationTotals = useMemo(
    () => ({
      requestQty: rows.reduce((sum, row) => sum + Number(row.demandQuantity || 0), 0),
      quotationQty: rows.reduce((sum, row) => sum + Number(row.quotationQuantity || 0), 0),
      confirmQty: rows.reduce((sum, row) => sum + Number(row.confirmQuantity || 0), 0),
      isbQty: rows.reduce((sum, row) => sum + Number(row.isbQuantity || 0), 0),
      khiQty: rows.reduce((sum, row) => sum + Number(row.khiQuantity || 0), 0),
      otherQty: rows.reduce((sum, row) => sum + Number(row.otherQuantity || 0), 0),
      fcAmount: rows.reduce((sum, row) => sum + Number(row.fcAmount || 0), 0),
      lcAmount: rows.reduce((sum, row) => sum + Number(row.lcAmount || 0), 0),
      totalWeight: rows.reduce((sum, row) => sum + Number(row.totalWeight || 0), 0),
    }),
    [rows],
  );

  const handleConfirm = async () => {
    const itemsToConfirm = rows.filter((row) => Number(row.confirmQuantity || 0) > 0);
    if (itemsToConfirm.length === 0) {
      toast({
        title: "No items to confirm",
        description: "Enter confirm quantity greater than zero for at least one item.",
        variant: "destructive",
      });
      return;
    }

    for (const row of itemsToConfirm) {
      const confirmQty = Number(row.confirmQuantity);
      const splitSum = getConfirmRowSplitSum(row);
      if (splitSum !== confirmQty) {
        toast({
          title: "Split quantities must match confirm quantity",
          description: `For ${row.masterPartNo || row.partNo || "item"}, ${
            SHOW_OTHER_QTY ? "ISB + KHI + Other" : "ISB + KHI"
          } (${splitSum}) must equal confirm quantity (${confirmQty}).`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const response = await apiClient.confirmPurchaseQuotation(quotationId, {
        confirmationDate,
        combineQuotationIds: selectedCombineIds,
        items: itemsToConfirm.map((row) => ({
          quotationId: row.quotationId || quotationId,
          partId: row.partId,
          confirmQuantity: Number(row.confirmQuantity),
          khiQuantity: Number(row.khiQuantity || 0),
          isbQuantity: Number(row.isbQuantity || 0),
          otherQuantity: SHOW_OTHER_QTY ? Number(row.otherQuantity || 0) : 0,
        })),
      });
      const purchaseOrders = (response as { purchaseOrders?: Array<{ poNumber?: string }> })
        .purchaseOrders;
      const poLabels = (purchaseOrders || [])
        .map((po) => po.poNumber)
        .filter(Boolean)
        .join(", ");
      const combinedCount = selectedCombineIds.length + 1;
      toast({
        title: combinedCount > 1 ? "Quotations confirmed" : "Quotation confirmed",
        description: poLabels
          ? `Purchase order${purchaseOrders && purchaseOrders.length > 1 ? "s" : ""} ${poLabels} created${
              combinedCount > 1 ? ` from ${combinedCount} quotations` : ""
            }.`
          : combinedCount > 1
            ? `${combinedCount} quotations have been confirmed.`
            : "Quotation has been confirmed.",
      });
      onSaved?.();
    } catch (error: any) {
      toast({
        title: "Failed to confirm quotation",
        description:
          error?.response?.data?.error || error?.message || "Could not confirm quotation.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const itemTableColSpan = (SHOW_OTHER_QTY ? 17 : 16) + (isCombinedView ? 1 : 0);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Loading quotation confirmation...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">Confirm Purchase Quotation</h2>
        <p className="text-sm text-muted-foreground">
          Review quotation details and confirm quantities before creating purchase orders by
          consignee (ISB / KHI / Other).
          {isRevised ? " Showing revised quotation values." : " Showing original quotation values."}
          {isCombinedView
            ? " Combined quotations will confirm together and create shared purchase orders."
            : ""}
        </p>
      </div>

      {combinableQuotations.length > 0 ? (
        <div className="rounded-md border border-border p-3 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Combine quotations</h3>
            <p className="text-xs text-muted-foreground">
              This supplier has other unconfirmed quotations. Select any to confirm together
              with this one.
            </p>
          </div>
          <div className="space-y-2">
            {combinableQuotations.map((row) => {
              const checked = selectedCombineIds.includes(row.id);
              const busy = loadingCombineId === row.id;
              return (
                <label
                  key={row.id}
                  className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    disabled={saving || busy || loadingCombineId !== null}
                    onCheckedChange={(value) => {
                      void toggleCombineQuotation(row.id, value === true);
                    }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium font-mono text-xs">
                      {row.quotationNo || row.id}
                      {busy ? (
                        <span className="ml-2 text-muted-foreground font-sans">
                          Loading...
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Inquiry {row.inquiryNo || "-"}
                      {row.partReference ? ` · ${row.partReference}` : ""}
                      {` · ${row.itemsCount} item${row.itemsCount === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div
          className={cn(
            "grid grid-cols-1 gap-3",
            isRevised ? "md:grid-cols-3 lg:grid-cols-6" : "md:grid-cols-2 lg:grid-cols-5",
          )}
        >
          <div className="space-y-1 min-w-0">
            <Label>Import Inquiry No</Label>
            <Input value={detail?.request?.requestNo || "—"} readOnly />
          </div>
          <div className="space-y-1 min-w-0">
            <Label>Import Inquiry Date</Label>
            <Input value={toInputDate(detail?.request?.requestDate)} readOnly />
          </div>
          <div className="space-y-1 min-w-0">
            <Label>Quotation No</Label>
            <Input value={detail?.quotationNo || "—"} readOnly />
          </div>
          <div className="space-y-1 min-w-0">
            <Label>Quotation Date</Label>
            <Input value={toInputDate(detail?.quotationDate)} readOnly />
          </div>
          {isRevised ? (
            <div className="space-y-1 min-w-0">
              <Label>Revised Quotation Date</Label>
              <Input value={toInputDate(detail?.revisedQuotationDate)} readOnly />
            </div>
          ) : null}
          <div className="space-y-1 min-w-0">
            <Label>Confirmation Date</Label>
            <Input
              type="date"
              value={confirmationDate}
              onChange={(e) => setConfirmationDate(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-2 min-w-0">
            <Label>Supplier</Label>
            <Input value={detail?.supplier?.name || "—"} readOnly />
          </div>
          <div className="space-y-1 min-w-0">
            <Label>Supplier Currency</Label>
            <Input value={detail?.currency || detail?.supplier?.currency || "—"} readOnly />
          </div>
          <div className="space-y-1 min-w-0">
            <Label>Exchange Rate</Label>
            <Input value={Number(detail?.conversionRate || 1)} readOnly />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Items</h3>
        {isRevised ? (
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Revised rates
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-center p-2 border-b w-12">#</th>
              {isCombinedView ? (
                <th className="text-left p-2 border-b">Quotation No</th>
              ) : null}
              <th className="text-left p-2 border-b">Item</th>
              <th className="text-left p-2 border-b">Brand</th>
              <th className="text-right p-2 border-b">Current Stock</th>
              <th className="text-right p-2 border-b">Request QTY</th>
              <th className={QUOTATION_QTY_COL_CLASS}>Quotation QTY</th>
              <th className={QUOTATION_SHIP_DAYS_COL_CLASS}>Ship Days</th>
              <th className={INQUIRY_ISB_QTY_HEAD_CLASS}>ISB QTY</th>
              <th className={INQUIRY_KHI_QTY_HEAD_CLASS}>KHI QTY</th>
              {SHOW_OTHER_QTY ? (
                <th className={INQUIRY_OTHER_QTY_HEAD_CLASS}>Other QTY</th>
              ) : null}
              <th className="text-right p-2 border-b min-w-[120px]">Confirm QTY</th>
              <th className={QUOTATION_LAST_FC_RATE_COL_CLASS}>Last FC Rate</th>
              <th className={QUOTATION_FC_RATE_COL_CLASS}>
                {isRevised ? "Revised FC Rate" : "FC Rate"}
              </th>
              <th className="text-right p-2 border-b">
                {isRevised ? "Revised FC Amount" : "FC Amount"}
              </th>
              <th className="text-right p-2 border-b">
                {isRevised ? "Revised LC Rate" : "LC Rate"}
              </th>
              <th className="text-right p-2 border-b">
                {isRevised ? "Revised LC Amount" : "LC Amount"}
              </th>
              <th className="text-right p-2 border-b">Total Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={itemTableColSpan} className="p-4 text-center text-muted-foreground">
                  No quotation items found.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const splitMismatch = getConfirmRowSplitMismatch(row);
                const splitInputClass = splitMismatch ? "border-destructive focus-visible:ring-destructive" : "";

                return (
                <tr key={row.rowId} className="border-b hover:bg-muted/20">
                  <td className="p-2 text-center text-muted-foreground tabular-nums">
                    {index + 1}
                  </td>
                  {isCombinedView ? (
                    <td className="p-2 font-mono text-xs">
                      <div>{row.quotationNo || "-"}</div>
                      {row.inquiryNo ? (
                        <div className="text-muted-foreground">{row.inquiryNo}</div>
                      ) : null}
                    </td>
                  ) : null}
                  <td
                    className="p-2 min-w-[280px]"
                    title={`${row.masterPartNo || "-"} | ${row.partNo || "-"} | ${row.description || "-"} | ${row.brand || "-"}`}
                  >
                    <div className="font-medium">
                      {row.masterPartNo || "-"} | {row.partNo || "-"}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.description || "-"}</div>
                  </td>
                  <td className="p-2">{row.brand || "-"}</td>
                  <td className="p-2 text-right tabular-nums">{row.currentStock}</td>
                  <td className="p-2 text-right tabular-nums">{row.demandQuantity}</td>
                  <td className="p-2 text-right tabular-nums">{row.quotationQuantity}</td>
                  <td className="p-2 text-right tabular-nums">{row.shipDays}</td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      className={cn(INQUIRY_ISB_QTY_INPUT_CLASS, splitInputClass)}
                      value={row.isbQuantity === 0 ? "" : row.isbQuantity}
                      onChange={(e) =>
                        updateConfirmSplitQuantity(
                          row.rowId,
                          "isbQuantity",
                          Number(e.target.value || 0),
                        )
                      }
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      className={cn(INQUIRY_KHI_QTY_INPUT_CLASS, splitInputClass)}
                      value={row.khiQuantity === 0 ? "" : row.khiQuantity}
                      onChange={(e) =>
                        updateConfirmSplitQuantity(
                          row.rowId,
                          "khiQuantity",
                          Number(e.target.value || 0),
                        )
                      }
                    />
                  </td>
                  {SHOW_OTHER_QTY ? (
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        className={cn(INQUIRY_OTHER_QTY_INPUT_CLASS, splitInputClass)}
                        value={row.otherQuantity === 0 ? "" : row.otherQuantity}
                        onChange={(e) =>
                          updateConfirmSplitQuantity(
                            row.rowId,
                            "otherQuantity",
                            Number(e.target.value || 0),
                          )
                        }
                      />
                    </td>
                  ) : null}
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      className={cn(QUOTATION_QTY_INPUT_CLASS, splitInputClass)}
                      value={row.confirmQuantity === 0 ? "" : row.confirmQuantity}
                      onChange={(e) => handleConfirmQtyChange(row.rowId, e.target.value)}
                    />
                    {splitMismatch ? (
                      <p className="mt-1 text-left text-xs text-destructive">{splitMismatch}</p>
                    ) : null}
                  </td>
                  <td className="p-2 text-right text-muted-foreground tabular-nums">
                    {formatLastFcRateDisplay(row.lastFcRate)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{row.fcRate.toFixed(4)}</td>
                  <td className="p-2 text-right tabular-nums">{row.fcAmount.toFixed(2)}</td>
                  <td className="p-2 text-right tabular-nums">{row.lcRate.toFixed(2)}</td>
                  <td className="p-2 text-right tabular-nums">{row.lcAmount.toFixed(2)}</td>
                  <td className="p-2 text-right tabular-nums">{row.totalWeight.toFixed(2)}</td>
                </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-muted/40 font-semibold border-t">
                <td className="p-2" />
                {isCombinedView ? <td className="p-2" /> : null}
                <td className="p-2">Totals</td>
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2 text-right">{quotationTotals.requestQty}</td>
                <td className="p-2 text-right">{quotationTotals.quotationQty}</td>
                <td className="p-2" />
                <td className="p-2 text-right">{quotationTotals.isbQty}</td>
                <td className="p-2 text-right">{quotationTotals.khiQty}</td>
                {SHOW_OTHER_QTY ? (
                  <td className="p-2 text-right">{quotationTotals.otherQty}</td>
                ) : null}
                <td className="p-2 text-right">{quotationTotals.confirmQty}</td>
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2 text-right">{quotationTotals.fcAmount.toFixed(2)}</td>
                <td className="p-2" />
                <td className="p-2 text-right">{quotationTotals.lcAmount.toFixed(2)}</td>
                <td className="p-2 text-right">{quotationTotals.totalWeight.toFixed(2)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {hasSplitMismatch ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
          <p className="font-medium">
            {SHOW_OTHER_QTY
              ? "ISB, KHI, and Other must equal confirm quantity for each item."
              : "ISB and KHI must equal confirm quantity for each item."}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {splitMismatchMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={saving || !detail || hasSplitMismatch}
        >
          {saving
            ? "Confirming..."
            : isCombinedView
              ? "Confirm Combined & Create PO"
              : "Confirm & Create PO"}
        </Button>
      </div>
    </div>
  );
};

const PurchaseQuotationTab = () => {
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [quotationRequestId, setQuotationRequestId] = useState<string | null>(null);
  const [quotationConsignee, setQuotationConsignee] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  if (showQuotationForm && quotationRequestId) {
    return (
      <PurchaseQuotationForm
        requestId={quotationRequestId}
        initialConsignee={quotationConsignee}
        onCancel={() => {
          setShowQuotationForm(false);
          setQuotationRequestId(null);
          setQuotationConsignee(null);
        }}
        onSaved={() => {
          setShowQuotationForm(false);
          setQuotationRequestId(null);
          setQuotationConsignee(null);
          setListRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  return (
    <PurchaseInquiryListPanel
      key={listRefreshKey}
      mode="quotation"
      onOpenQuotation={(requestId, consignee) => {
        setQuotationConsignee(consignee);
        setQuotationRequestId(requestId);
        setShowQuotationForm(true);
      }}
    />
  );
};

const PurchaseReviseQuotationTab = () => {
  const navigate = useNavigate();
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionQuotationId, setRevisionQuotationId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  if (showRevisionForm && revisionQuotationId) {
    return (
      <PurchaseQuotationRevisionForm
        quotationId={revisionQuotationId}
        onCancel={() => {
          setShowRevisionForm(false);
          setRevisionQuotationId(null);
        }}
        onSaved={() => {
          setShowRevisionForm(false);
          setRevisionQuotationId(null);
          setListRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate("/purchase-import/confirm-quotation")}
        >
          Back to Confirmation
        </Button>
      </div>
      <PurchaseQuotationListPanel
        key={listRefreshKey}
        view="open"
        action="revise"
        title="Revise Quotation"
        description="Review open supplier quotations and revise rates."
        onRevise={(quotationId) => {
          setRevisionQuotationId(quotationId);
          setShowRevisionForm(true);
        }}
      />
    </div>
  );
};

const PurchaseConfirmQuotationTab = () => {
  return (
    <div className="space-y-4">
      <PurchaseQuotationListPanel
        view="open"
        action="confirm"
        title="Confirmation"
        description="Review open supplier quotations and confirm to create shipment record(s)."
      />
      <PurchaseQuotationListPanel
        view="confirmed"
        action="none"
        title="Confirmed List"
        description="Confirmed quotations split by consignee."
      />
    </div>
  );
};

const isKhiConsignee = (consignee?: string | null) =>
  String(consignee || "").trim().toUpperCase() === "KHI";

const isReceivedPurchaseOrder = (status?: string | null) =>
  String(status || "").trim().toLowerCase() === "received";

const normalizeImportPurchaseOrderStatus = (status?: string | null) =>
  String(status || "").trim().toLowerCase();

const isPurchaseInvoicePendingStatus = (status?: string | null) =>
  normalizeImportPurchaseOrderStatus(status) === "purchase invoice pending";

const isStockReceivingPendingStatus = (status?: string | null) =>
  normalizeImportPurchaseOrderStatus(status) === "stock receiving pending";

/** Invoice has been saved at least once (locks further Purchase Import edits). */
const isPurchaseInvoiceCreatedStatus = (status?: string | null) =>
  isStockReceivingPendingStatus(status) || isReceivedPurchaseOrder(status);

const isImportPurchaseOrderSaved = (order: {
  importSaved?: boolean | null;
  status?: string | null;
}) =>
  Boolean(order.importSaved) ||
  isPurchaseInvoicePendingStatus(order.status) ||
  isStockReceivingPendingStatus(order.status) ||
  isReceivedPurchaseOrder(order.status);

const formatImportPurchaseOrderStatus = (status?: string | null) => {
  const normalized = normalizeImportPurchaseOrderStatus(status);
  if (normalized === "purchase invoice pending") return "Invoice Pending";
  if (normalized === "stock receiving pending") return "Stock Receiving Pending";
  if (normalized === "received") return "Received";
  if (normalized === "pending") return "Pending";
  return String(status || "-");
};

const getImportPurchaseOrderStatusBadgeClass = (status?: string | null) => {
  const normalized = normalizeImportPurchaseOrderStatus(status);
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
  return "border-transparent bg-muted text-muted-foreground hover:bg-muted";
};

const ImportPurchaseOrderStatusBadge = ({
  status,
}: {
  status?: string | null;
}) => (
  <Badge
    variant="secondary"
    className={cn(
      "whitespace-nowrap font-medium",
      getImportPurchaseOrderStatusBadgeClass(status),
    )}
  >
    {formatImportPurchaseOrderStatus(status)}
  </Badge>
);

const PurchaseOrderTab = ({
  mode = "purchase-order",
}: {
  mode?: "purchase-order" | "purchase-invoice";
}) => {
  const isInvoiceMode = mode === "purchase-invoice";
  const formTitle = isInvoiceMode ? "Invoice" : "Purchase Import";
  const formActionLabel = isInvoiceMode ? "Invoice" : "PO";
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ImportPurchaseOrderRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [receiveOrderLabel, setReceiveOrderLabel] = useState("");
  const [receiveDetail, setReceiveDetail] = useState<ImportPurchaseOrderReceiveDetail | null>(null);
  const [receiveImportSaved, setReceiveImportSaved] = useState(false);
  const [receiveOrderStatus, setReceiveOrderStatus] = useState<string>("");
  const [receiveLines, setReceiveLines] = useState<ImportPurchaseOrderReceiveLine[]>([]);
  const [receivePartOptions, setReceivePartOptions] = useState<PartOption[]>([]);
  const [jumpToReceiveLineId, setJumpToReceiveLineId] = useState("");
  const [highlightedReceiveLineId, setHighlightedReceiveLineId] = useState<
    string | null
  >(null);
  const receiveLineRowRefs = useRef<Record<string, HTMLTableRowElement | null>>(
    {},
  );
  const [loadingReceiveForm, setLoadingReceiveForm] = useState(false);
  const [savingReceive, setSavingReceive] = useState(false);
  const [receiveInvoiceNo, setReceiveInvoiceNo] = useState("");
  const [receiveInvoiceDate, setReceiveInvoiceDate] = useState("");
  const [receiveBlNo, setReceiveBlNo] = useState("");
  const [receiveBlDate, setReceiveBlDate] = useState("");
  const [receiveForwarder, setReceiveForwarder] = useState("");
  const [receiveEstTimeDate, setReceiveEstTimeDate] = useState("");
  const [receiveConversionRate, setReceiveConversionRate] = useState("1");
  const [importExpenses, setImportExpenses] = useState<ImportPurchaseOrderExpenses>(
    EMPTY_IMPORT_PO_EXPENSES,
  );
  const [importExpenseLinkedText, setImportExpenseLinkedText] = useState<{
    pkg: LinkedExpenseText;
    disc: LinkedExpenseText;
  }>({
    pkg: { ...EMPTY_LINKED_EXPENSE_TEXT },
    disc: { ...EMPTY_LINKED_EXPENSE_TEXT },
  });

  const updateImportExpense = (key: ImportPoExpenseFieldKey, value: string) => {
    setImportExpenses((prev) => ({
      ...prev,
      [key]: normalizeImportPoExpenseNumber(value),
    }));
  };

  const resetImportExpenseLinkedText = (
    expenses: Pick<ImportPurchaseOrderExpenses, "pkgExpPercent" | "invDiscPercent">,
    invoiceFc = 0,
    invoiceLc = 0,
    conversionRate = 1,
  ) => ({
    pkg: buildLinkedExpenseTextFromPercent(
      expenses.pkgExpPercent,
      invoiceFc,
      invoiceLc,
      conversionRate,
    ),
    disc: buildLinkedExpenseTextFromPercent(
      expenses.invDiscPercent,
      invoiceFc,
      invoiceLc,
      conversionRate,
    ),
  });

  const resetImportPurchaseForm = () => {
    setReceiveOrderId(null);
    setReceiveLines([]);
    setReceivePartOptions([]);
    setJumpToReceiveLineId("");
    setHighlightedReceiveLineId(null);
    receiveLineRowRefs.current = {};
    setReceiveDetail(null);
    setReceiveImportSaved(false);
    setReceiveOrderStatus("");
    setReceiveInvoiceNo("");
    setReceiveInvoiceDate("");
    setReceiveBlNo("");
    setReceiveBlDate("");
    setReceiveForwarder("");
    setReceiveEstTimeDate("");
    setReceiveConversionRate("1");
    setImportExpenses({ ...EMPTY_IMPORT_PO_EXPENSES });
    setImportExpenseLinkedText({
      pkg: { ...EMPTY_LINKED_EXPENSE_TEXT },
      disc: { ...EMPTY_LINKED_EXPENSE_TEXT },
    });
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getImportPurchaseOrders({
        page: currentPage,
        limit: itemsPerPage,
      });
      const rows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      const pagination = (response as any)?.pagination;
      setOrders(rows);
      setTotalRecords(pagination?.total ?? rows.length);
    } catch (error: any) {
      toast({
        title: "Failed to load purchase orders",
        description: error?.message || "Could not fetch import purchase orders.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, toast]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const openOrderDetail = async (orderId: string) => {
    setViewOrderId(orderId);
    setLoadingDetail(true);
    setViewOrder(null);
    try {
      const response = await apiClient.getImportPurchaseOrder(orderId);
      const orderData = (response as any)?.data || response;
      setViewOrder(orderData);
    } catch (error: any) {
      toast({
        title: "Failed to load purchase order",
        description: error?.message || "Could not load order details.",
        variant: "destructive",
      });
      setViewOrderId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const row = orders.find((o) => o.id === orderId);
    const poNumber = row?.poNumber || "this purchase order";
    if (
      !window.confirm(
        `Delete purchase order ${poNumber}? This is only allowed when the order has not been received. If this is the last order for its quotation, the quotation will go back to unconfirmed.`,
      )
    ) {
      return;
    }

    setDeletingOrderId(orderId);
    try {
      await apiClient.deleteImportPurchaseOrder(orderId);
      toast({
        title: "Purchase order deleted",
        description: `Purchase order ${poNumber} has been deleted.`,
      });
      await fetchOrders();
    } catch (error: any) {
      toast({
        title: "Failed to delete purchase order",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not delete the purchase order.",
        variant: "destructive",
      });
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handlePrintOrderPdf = async (orderId: string) => {
    setPrintingOrderId(orderId);
    try {
      const response = await apiClient.getImportPurchaseOrder(orderId);
      const orderData: any = (response as any)?.data || response;
      if (!orderData) {
        throw new Error("Purchase order detail is unavailable.");
      }

      const isRevised = Boolean(orderData.quotation?.isRevised);
      const conversionRate = Number(
        orderData.conversionRate ?? orderData.quotation?.conversionRate ?? 1,
      );
      const items = Array.isArray(orderData.items) ? orderData.items : [];

      const itemRows = items.map((item: any) => {
        const orderQty = Number(item.orderQty ?? item.quantity ?? 0);
        const receivedQty = Number(item.receivedQty ?? item.received_qty ?? 0);
        const additionalQty = Number(item.additionalQty ?? item.additional_qty ?? 0);
        const backQty = Number(item.backQty ?? item.back_qty ?? 0);
        const fcRate = Number(item.fcRate ?? item.fc_rate ?? 0);
        const fcAmount = Number(
          item.fcAmount ?? item.fc_amount ?? fcRate * orderQty,
        );
        const lcRate = Number(
          item.lcRate ?? item.lc_rate ?? item.unit_cost ?? 0,
        );
        const lcAmount = Number(
          item.lcAmount ?? item.lc_amount ?? item.total_cost ?? lcRate * orderQty,
        );
        const weight = Number(item.weight || 0);
        const totalWeight = Number(
          item.totalWeight ?? item.total_weight ?? weight * orderQty,
        );

        return {
          masterPartNo: item.masterPartNo || item.master_part_no || "",
          partNo: item.partNo || item.part_no || "-",
          description: item.description || item.part_description || "-",
          brand: item.brand || "",
          orderQty,
          receivedQty,
          additionalQty,
          backQty,
          fcRate,
          fcAmount,
          lcRate,
          lcAmount,
          weight,
          totalWeight,
        };
      });

      const totals = itemRows.reduce(
        (acc, row) => ({
          orderQty: acc.orderQty + Number(row.orderQty || 0),
          receivedQty: acc.receivedQty + Number(row.receivedQty || 0),
          fcAmount: acc.fcAmount + Number(row.fcAmount || 0),
          lcAmount: acc.lcAmount + Number(row.lcAmount || 0),
          totalWeight: acc.totalWeight + Number(row.totalWeight || 0),
        }),
        {
          orderQty: 0,
          receivedQty: 0,
          fcAmount: 0,
          lcAmount: 0,
          totalWeight: 0,
        },
      );

      const started = printPurchaseImportOrder({
        detail: {
          poNumber: orderData.poNumber || orderData.po_number || "-",
          date: orderData.date,
          status: orderData.status,
          supplierName:
            orderData.supplier?.name ||
            orderData.supplier_name ||
            "-",
          quotationNo: orderData.quotation?.quotationNo || "-",
          requestNo: orderData.quotation?.requestNo || null,
          consignee: orderData.consignee || null,
          currency: orderData.currency || orderData.quotation?.currency || "USD",
          conversionRate:
            orderData.conversionRate ??
            orderData.conversion_rate ??
            orderData.quotation?.conversionRate ??
            1,
          invoiceNo: orderData.invoiceNo || orderData.invoice_no || null,
          invoiceDate: orderData.invoiceDate || orderData.invoice_date || null,
          blNo: orderData.blNo || orderData.bl_no || null,
          blDate: orderData.blDate || orderData.bl_date || null,
          forwarder: orderData.forwarder || null,
          estTimeDate:
            orderData.estTimeDate || orderData.expectedDate || null,
          isRevised,
          notes: orderData.notes || null,
          fcTotal: orderData.fcTotal || orderData.fc_total || totals.fcAmount,
          lcTotal:
            orderData.totalAmount ||
            orderData.total_amount ||
            totals.lcAmount,
          totalExp: orderData.expenses?.totalExp || null,
        },
        itemRows,
        totals,
      });

      if (!started) {
        toast({
          title: "Print blocked",
          description: "Allow pop-ups for this site and try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Print Started",
        description: "PDF is being generated...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to print purchase order",
        description:
          error?.message || "Could not load purchase order data for printing.",
        variant: "destructive",
      });
    } finally {
      setPrintingOrderId(null);
    }
  };

  const openReceiveForm = async (order: ImportPurchaseOrderRecord) => {
    const importSaved = isImportPurchaseOrderSaved(order);
    if (!isInvoiceMode && isPurchaseInvoiceCreatedStatus(order.status)) {
      toast({
        title: "Purchase Import locked",
        description:
          "Invoice has already been saved. Purchase Import can no longer be edited.",
        variant: "destructive",
      });
      return;
    }
    if (isInvoiceMode && !importSaved) {
      toast({
        title: "Purchase Import required",
        description:
          "Save the Purchase Import form at least once before opening Invoice.",
        variant: "destructive",
      });
      return;
    }

    setReceiveOrderId(order.id);
    setReceiveOrderLabel(order.poNumber || "");
    setReceiveDetail(null);
    setReceiveImportSaved(importSaved);
    setReceiveOrderStatus(String(order.status || ""));
    setReceiveLines([]);
    setReceiveInvoiceNo("");
    setReceiveInvoiceDate("");
    setReceiveBlNo("");
    setReceiveBlDate("");
    setReceiveForwarder("");
    setReceiveEstTimeDate("");
    setReceiveConversionRate("1");
    setImportExpenses({ ...EMPTY_IMPORT_PO_EXPENSES });
    setImportExpenseLinkedText({
      pkg: { ...EMPTY_LINKED_EXPENSE_TEXT },
      disc: { ...EMPTY_LINKED_EXPENSE_TEXT },
    });
    setJumpToReceiveLineId("");
    setHighlightedReceiveLineId(null);
    receiveLineRowRefs.current = {};
    setLoadingReceiveForm(true);
    try {
      const response = await apiClient.getImportPurchaseOrder(order.id);
      const orderData: any = (response as any)?.data || response;
      const detailImportSaved = isImportPurchaseOrderSaved({
        importSaved: orderData.importSaved,
        status: orderData.status,
      });
      if (isInvoiceMode && !detailImportSaved) {
        toast({
          title: "Purchase Import required",
          description:
            "Save the Purchase Import form at least once before opening Invoice.",
          variant: "destructive",
        });
        resetImportPurchaseForm();
        setLoadingReceiveForm(false);
        return;
      }
      if (
        !isInvoiceMode &&
        isPurchaseInvoiceCreatedStatus(orderData.status || order.status)
      ) {
        toast({
          title: "Purchase Import locked",
          description:
            "Invoice has already been saved. Purchase Import can no longer be edited.",
          variant: "destructive",
        });
        resetImportPurchaseForm();
        setLoadingReceiveForm(false);
        return;
      }
      setReceiveImportSaved(detailImportSaved);
      setReceiveOrderStatus(String(orderData.status || order.status || ""));
      const initialConversionRate = Number(
        orderData.conversionRate ?? orderData.quotation?.conversionRate ?? 1,
      );
      const lines = (orderData.items || []).map((item: any) => {
        const orderQty = Number(item.orderQty ?? item.quantity) || 0;
        const existingReceive =
          Number(item.receivedQty ?? item.received_qty) > 0
            ? Number(item.receivedQty ?? item.received_qty)
            : orderQty;
        const variance = computeImportReceiveVariance(orderQty, existingReceive);
        const fcRate = Number(item.fcRate || 0);
        const lcRate = Number(item.lcRate || fcRate * initialConversionRate);
        const weight = Number(item.weight || 0);
        const amounts = computeImportReceiveLineAmounts(
          { fcRate, lcRate, weight },
          existingReceive,
        );
        const priceA = Number(item.priceA ?? item.price_a ?? 0);
        const priceB = Number(item.priceB ?? item.price_b ?? 0);
        return {
          id: item.id,
          partId: String(item.partId || item.part_id || "").trim(),
          isNewRow: false,
          masterPartNo: item.masterPartNo || "",
          partNo: item.partNo || item.part_no || "-",
          description: item.description || item.part_description || "-",
          brand: item.brand || "",
          currentStock: Number(item.currentStock || 0),
          demandQuantity: Number(item.demandQuantity || 0),
          quotationQuantity: Number(item.quotationQuantity || 0),
          shipDays: Number(item.shipDays || 0),
          fcRate,
          fcRateText: formatRateInput(fcRate),
          fcAmount: amounts.fcAmount,
          lcRate,
          lcAmount: amounts.lcAmount,
          weight,
          totalWeight: amounts.totalWeight,
          priceA,
          priceB,
          priceAText: formatRateInput(priceA),
          priceBText: formatRateInput(priceB),
          orderQty,
          receiveQty: String(existingReceive),
          additionalQty: variance.additionalQty,
          backQty: variance.backQty,
        };
      });
      if (lines.length === 0) {
        toast({
          title: "No items found",
          description: "This purchase order has no line items for purchase import.",
          variant: "destructive",
        });
        setReceiveOrderId(null);
        return;
      }
      try {
        const partsRes = await apiClient.getPartsDropdown();
        const partsData = (partsRes as any)?.data || [];
        setReceivePartOptions(
          partsData.map((p: any) => ({
            id: p.id || "",
            partNo: p.partNo || "",
            masterPartNo: p.masterPartNo || "",
            description: p.description || "",
            hsCode: p.hs_code || p.hsCode || "",
            brand: p.brand || "",
            weight: Number(p.weight || 0),
          })),
        );
      } catch {
        setReceivePartOptions([]);
      }
      setReceiveDetail({
        supplierName: orderData.supplier?.name || order.supplier?.name || "-",
        quotationNo: orderData.quotation?.quotationNo || order.quotation?.quotationNo || "-",
        requestNo: orderData.quotation?.requestNo || order.quotation?.requestNo || null,
        currency: orderData.currency || orderData.quotation?.currency || "USD",
        conversionRate: initialConversionRate,
        consignee: orderData.consignee || order.consignee || null,
        isRevised: Boolean(orderData.quotation?.isRevised),
      });
      setReceiveConversionRate(String(initialConversionRate));
      setReceiveInvoiceNo(String(orderData.invoiceNo || ""));
      setReceiveInvoiceDate(toInputDate(orderData.invoiceDate));
      setReceiveBlNo(String(orderData.blNo || ""));
      setReceiveBlDate(toInputDate(orderData.blDate));
      setReceiveForwarder(String(orderData.forwarder || ""));
      setReceiveEstTimeDate(toInputDate(orderData.estTimeDate || orderData.expectedDate));
      setReceiveLines(lines);
      const loadedExpenses = parseImportPoExpenses(orderData.expenses);
      setImportExpenses(loadedExpenses);
      setImportExpenseLinkedText(
        resetImportExpenseLinkedText(
          loadedExpenses,
          0,
          0,
          initialConversionRate,
        ),
      );
    } catch (error: any) {
      toast({
        title: "Failed to load purchase import",
        description: error?.message || "Could not open purchase import form.",
        variant: "destructive",
      });
      setReceiveOrderId(null);
    } finally {
      setLoadingReceiveForm(false);
    }
  };

  const handleStockOutFromPo = async (order: ImportPurchaseOrderRecord) => {
    if (!isReceivedPurchaseOrder(order.status)) {
      toast({
        title: "PO not received",
        description: "Stock out is available only after the purchase order is received.",
        variant: "destructive",
      });
      return;
    }
    if (!isKhiConsignee(order.consignee)) {
      toast({
        title: "KHI consignee only",
        description: "Stock out from purchase order is available for KHI consignee orders.",
        variant: "destructive",
      });
      return;
    }
    if (order.stockedOut || order.transferOutInvoiceId) {
      toast({
        title: "Already stocked out",
        description: `PO ${order.poNumber} already has a transfer-out stock out.`,
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.getImportPurchaseOrder(order.id);
      const orderData: any = (response as any)?.data || response;
      const items = (orderData?.items || [])
        .map((item: any) => {
          const partId = String(item.partId || item.part_id || "").trim();
          const quantity = Math.max(
            0,
            Math.floor(
              Number(item.receivedQty ?? item.received_qty ?? item.receiveQty ?? 0),
            ),
          );
          if (!partId || quantity <= 0) return null;
          return {
            partId,
            quantity,
            partNo: item.partNo || item.part_no || "",
            masterPartNo: item.masterPartNo || item.master_part_no || "",
            description: item.description || item.part_description || "",
            purchasePrice: Number(item.unitCost ?? item.unit_cost ?? 0) || 0,
          };
        })
        .filter(Boolean);

      if (items.length === 0) {
        toast({
          title: "No received items",
          description: "This purchase order has no received quantity to stock out.",
          variant: "destructive",
        });
        return;
      }

      const branchAccounts = await fetchBranchAccountOptions("Current Assets");
      const khiBranch =
        branchAccounts.find((branch) =>
          String(branch.label || "").toUpperCase().includes("KHI"),
        ) ||
        branchAccounts.find((branch) =>
          String(branch.label || "").toUpperCase().includes("KARACHI"),
        ) ||
        null;

      sessionStorage.setItem(
        "importPoStockOutDraft",
        JSON.stringify({
          source: "import-po",
          target: "transfer-out",
          poNumber: order.poNumber || orderData?.poNumber || "",
          poId: order.id,
          consignee: String(order.consignee || "KHI").toUpperCase(),
          branchAccountId: khiBranch?.id || undefined,
          branchAccountName: khiBranch?.label || undefined,
          items,
        }),
      );

      navigate("/transfer/transfer-out");
      toast({
        title: "Opening stock out",
        description: `Loaded ${items.length} item(s) from PO ${order.poNumber}.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to open stock out",
        description: error?.message || "Could not load purchase order items.",
        variant: "destructive",
      });
    }
  };

  const handleConversionRateChange = (value: string) => {
    setReceiveConversionRate(value);
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) return;
    setReceiveLines((prev) => applyReceiveConversionRateToLines(prev, rate));
  };

  const handleReceiveFcRateChange = (lineId: string, raw: string) => {
    if (raw !== "" && !RATE_INPUT_PATTERN.test(raw)) return;
    const fcRate = parseRateInput(raw);
    const conversionRate = Number(receiveConversionRate) || 0;
    setReceiveLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const updated = recalcReceiveLineRates(line, fcRate, conversionRate);
        return { ...updated, fcRateText: raw };
      }),
    );
  };

  const handleReceiveFcRateBlur = (lineId: string) => {
    setReceiveLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? { ...line, fcRateText: formatRateInput(line.fcRate) }
          : line,
      ),
    );
  };

  const handleReceivePriceChange = (
    lineId: string,
    field: "priceA" | "priceB",
    raw: string,
  ) => {
    if (raw !== "" && !RATE_INPUT_PATTERN.test(raw)) return;
    const textField = field === "priceA" ? "priceAText" : "priceBText";
    setReceiveLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [textField]: raw,
              [field]: parseRateInput(raw),
            }
          : line,
      ),
    );
  };

  const handleReceivePriceBlur = (lineId: string, field: "priceA" | "priceB") => {
    const textField = field === "priceA" ? "priceAText" : "priceBText";
    setReceiveLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [textField]: formatRateInput(line[field]),
            }
          : line,
      ),
    );
  };

  const handleReceiveQtyChange = (lineId: string, value: string) => {
    setReceiveLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const receiveQtyNum = Math.max(0, Math.floor(Number(value) || 0));
        const orderQty = line.isNewRow ? receiveQtyNum : line.orderQty;
        const variance = computeImportReceiveVariance(orderQty, value);
        const amounts = computeImportReceiveLineAmounts(line, value);
        return {
          ...line,
          orderQty,
          receiveQty: value,
          additionalQty: variance.additionalQty,
          backQty: variance.backQty,
          fcAmount: amounts.fcAmount,
          lcAmount: amounts.lcAmount,
          totalWeight: amounts.totalWeight,
        };
      }),
    );
  };

  const receivePartSelectOptions = useMemo(
    () => buildSortedPartSelectOptions(receivePartOptions, "none", "asc"),
    [receivePartOptions],
  );

  const addReceiveLine = () => {
    setReceiveLines((prev) => [...prev, createEmptyReceiveLine()]);
  };

  const removeReceiveLine = (lineId: string) => {
    setReceiveLines((prev) =>
      prev.filter((line) => !(line.id === lineId && line.isNewRow)),
    );
  };

  const selectPartForReceiveLine = async (lineId: string, partId: string) => {
    if (!partId) {
      setReceiveLines((prev) =>
        prev.map((line) =>
          line.id === lineId
            ? {
                ...line,
                partId: "",
                masterPartNo: "",
                partNo: "",
                description: "",
                brand: "",
                currentStock: 0,
                weight: 0,
                totalWeight: 0,
                priceA: 0,
                priceB: 0,
                priceAText: "",
                priceBText: "",
                loadingPartDetails: false,
              }
            : line,
        ),
      );
      return;
    }

    setReceiveLines((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, partId, loadingPartDetails: true } : line,
      ),
    );

    try {
      const res = await apiClient.getPurchaseImportPartDetails(partId);
      if ((res as any)?.error) {
        throw new Error(String((res as any).error));
      }
      const details = (res as any)?.data;
      const option =
        receivePartOptions.find((p) => p.id === partId) ||
        ({
          id: partId,
          partNo: "",
          masterPartNo: "",
          description: "",
          brand: "",
          weight: 0,
          hsCode: "",
        } as PartOption);
      const fields = buildQuotationPartFieldsFromSelection(
        option,
        details,
        receivePartOptions,
      );
      const conversionRate = Number(receiveConversionRate) || 0;
      setReceiveLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const next = {
            ...line,
            ...fields,
            loadingPartDetails: false,
          };
          const priceA = Number(fields.priceA ?? 0);
          const priceB = Number(fields.priceB ?? 0);
          const amounts = computeImportReceiveLineAmounts(next, next.receiveQty);
          const updatedRates = recalcReceiveLineRates(
            { ...next, ...amounts },
            next.fcRate,
            conversionRate,
          );
          return {
            ...updatedRates,
            fcRateText: formatRateInput(updatedRates.fcRate),
            priceA,
            priceB,
            priceAText: formatRateInput(priceA),
            priceBText: formatRateInput(priceB),
            loadingPartDetails: false,
          };
        }),
      );
    } catch {
      setReceiveLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, loadingPartDetails: false } : line,
        ),
      );
      toast({
        title: "Failed to load part details",
        description: "Could not fetch stock and weight for the selected part.",
        variant: "destructive",
      });
    }
  };

  const receiveTotals = useMemo(
    () =>
      receiveLines.reduce(
        (acc, line) => {
          const receiveQty = Math.max(0, Number(line.receiveQty) || 0);
          acc.orderQty += line.orderQty;
          acc.receiveQty += receiveQty;
          acc.fcAmount += line.fcRate * receiveQty;
          acc.lcAmount += line.lcRate * receiveQty;
          acc.totalWeight += line.weight * receiveQty;
          return acc;
        },
        {
          orderQty: 0,
          receiveQty: 0,
          fcAmount: 0,
          lcAmount: 0,
          totalWeight: 0,
        },
      ),
    [receiveLines],
  );

  const receiveItemJumpOptions = useMemo(
    () =>
      receiveLines
        .filter((line) => line.partId)
        .map((line) => ({
          value: line.id,
          label: `${line.masterPartNo || "-"} | ${line.partNo || "-"}`,
          description: line.description || "-",
        })),
    [receiveLines],
  );

  const scrollToReceiveLineRow = useCallback((lineId: string) => {
    if (!lineId) return;
    requestAnimationFrame(() => {
      const rowEl = receiveLineRowRefs.current[lineId];
      rowEl?.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightedReceiveLineId(lineId);
      window.setTimeout(() => {
        setHighlightedReceiveLineId((current) =>
          current === lineId ? null : current,
        );
      }, 2000);
    });
  }, []);

  useEffect(() => {
    if (!jumpToReceiveLineId) return;
    scrollToReceiveLineRow(jumpToReceiveLineId);
  }, [jumpToReceiveLineId, receiveLines, scrollToReceiveLineRow]);

  useEffect(() => {
    if (!jumpToReceiveLineId) return;
    if (!receiveLines.some((line) => line.id === jumpToReceiveLineId && line.partId)) {
      setJumpToReceiveLineId("");
    }
  }, [receiveLines, jumpToReceiveLineId]);

  const handleReceiveItemJump = (lineId: string) => {
    setJumpToReceiveLineId(lineId);
    scrollToReceiveLineRow(lineId);
  };

  const receiveConversionRateNum = Number(receiveConversionRate);
  const effectiveReceiveConversionRate =
    Number.isFinite(receiveConversionRateNum) && receiveConversionRateNum > 0
      ? receiveConversionRateNum
      : 1;

  const importPoCommercialAmounts = useMemo(
    () =>
      computeImportPoCommercialAmounts(
        importExpenses,
        receiveTotals.lcAmount,
        effectiveReceiveConversionRate,
        receiveTotals.fcAmount,
      ),
    [
      importExpenses.pkgExpPercent,
      importExpenses.invDiscPercent,
      importExpenses.frtExp,
      receiveTotals.lcAmount,
      receiveTotals.fcAmount,
      effectiveReceiveConversionRate,
    ],
  );

  const updateLinkedExpenseField = (
    kind: LinkedExpenseKind,
    field: LinkedExpenseField,
    raw: string,
  ) => {
    if (raw !== "" && !RATE_INPUT_PATTERN.test(raw)) return;

    const values = calcLinkedExpenseValues(
      field,
      parseRateInput(raw),
      receiveTotals.fcAmount,
      receiveTotals.lcAmount,
      effectiveReceiveConversionRate,
    );

    setImportExpenseLinkedText((prev) => ({
      ...prev,
      [kind]: {
        ...formatLinkedExpenseText(values),
        [field]: raw,
      },
    }));

    setImportExpenses((prev) => ({
      ...prev,
      [kind === "pkg" ? "pkgExpPercent" : "invDiscPercent"]: values.percent,
    }));
  };

  const blurLinkedExpenseField = (kind: LinkedExpenseKind) => {
    const percent =
      kind === "pkg"
        ? importExpenses.pkgExpPercent
        : importExpenses.invDiscPercent;
    setImportExpenseLinkedText((prev) => ({
      ...prev,
      [kind]: buildLinkedExpenseTextFromPercent(
        percent,
        receiveTotals.fcAmount,
        receiveTotals.lcAmount,
        effectiveReceiveConversionRate,
      ),
    }));
  };

  // Recalculate FC/LC displays when invoice totals or exchange rate change.
  useEffect(() => {
    setImportExpenseLinkedText(
      resetImportExpenseLinkedText(
        {
          pkgExpPercent: importExpenses.pkgExpPercent,
          invDiscPercent: importExpenses.invDiscPercent,
        },
        receiveTotals.fcAmount,
        receiveTotals.lcAmount,
        effectiveReceiveConversionRate,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only resync when invoice base amounts change
  }, [
    receiveTotals.fcAmount,
    receiveTotals.lcAmount,
    effectiveReceiveConversionRate,
  ]);

  const importPoTotalExp = useMemo(
    () =>
      computeImportPoTotalExp(
        importExpenses,
        receiveTotals.lcAmount,
        effectiveReceiveConversionRate,
      ),
    [importExpenses, receiveTotals.lcAmount, effectiveReceiveConversionRate],
  );

  const importPoInvoiceTotal = useMemo(
    () =>
      computeImportPoInvoiceTotal(
        receiveTotals.lcAmount,
        importPoTotalExp,
        importPoCommercialAmounts.invDiscAmt,
      ),
    [
      receiveTotals.lcAmount,
      importPoTotalExp,
      importPoCommercialAmounts.invDiscAmt,
    ],
  );

  const receiveDistributedExpenses = useMemo(
    () => computeImportPoDistributedExpenses(receiveLines, importPoTotalExp),
    [receiveLines, importPoTotalExp],
  );

  const receiveExpenseTotal = useMemo(
    () => receiveDistributedExpenses.reduce((sum, amount) => sum + amount, 0),
    [receiveDistributedExpenses],
  );

  const saveLabel = isInvoiceMode
    ? isStockReceivingPendingStatus(receiveOrderStatus)
      ? "Update Invoice"
      : "Invoice"
    : receiveImportSaved
      ? "Update PO"
      : "PO";

  const handleSaveReceive = async () => {
    if (!receiveOrderId || receiveLines.length === 0) return;

    if (!isInvoiceMode && isPurchaseInvoiceCreatedStatus(receiveOrderStatus)) {
      toast({
        title: "Purchase Import locked",
        description:
          "Invoice has already been saved. Purchase Import can no longer be edited.",
        variant: "destructive",
      });
      return;
    }

    const incompleteNewLine = receiveLines.find(
      (line) => line.isNewRow && !String(line.partId || "").trim(),
    );
    if (incompleteNewLine) {
      toast({
        title: "Select a part",
        description: "Choose a part for every newly added item before saving.",
        variant: "destructive",
      });
      return;
    }

    const invalidLine = receiveLines.find(
      (line) => line.receiveQty.trim() === "" || Number.isNaN(Number(line.receiveQty)),
    );
    if (invalidLine) {
      toast({
        title: "Invalid quantity",
        description: "Enter a quantity for every line item.",
        variant: "destructive",
      });
      return;
    }

    const conversionRate = Number(receiveConversionRate);
    if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
      toast({
        title: "Invalid exchange rate",
        description: "Enter a valid conversion rate greater than zero.",
        variant: "destructive",
      });
      return;
    }

    setSavingReceive(true);
    try {
      await apiClient.receiveImportPurchaseOrder(receiveOrderId, {
        stage: isInvoiceMode ? "invoice" : "import",
        conversionRate,
        invoiceNo: receiveInvoiceNo,
        invoiceDate: receiveInvoiceDate || undefined,
        blNo: receiveBlNo,
        blDate: receiveBlDate || undefined,
        forwarder: receiveForwarder,
        estTimeDate: receiveEstTimeDate || undefined,
        expenses: {
          ...importExpenses,
          discAmt: importPoCommercialAmounts.invDiscAmt,
          totalExp: importPoTotalExp,
        },
        items: receiveLines.map((line) => ({
          id: line.isNewRow ? undefined : line.id,
          partId: line.partId || undefined,
          receiveQty: Math.max(0, Math.floor(Number(line.receiveQty) || 0)),
          fcRate: line.fcRate,
          ...(isInvoiceMode
            ? {
                priceA: line.priceA,
                priceB: line.priceB,
              }
            : {}),
        })),
      });
      toast({
        title: isInvoiceMode ? "Invoice saved" : "Purchase import saved",
        description: isInvoiceMode
          ? `PO ${receiveOrderLabel} invoice saved. Status set to Stock Receiving Pending.`
          : `PO ${receiveOrderLabel} purchase import saved. Status set to Invoice Pending.`,
      });
      resetImportPurchaseForm();
      await fetchOrders();
    } catch (error: any) {
      toast({
        title: isInvoiceMode
          ? "Failed to save invoice"
          : "Failed to save purchase import",
        description:
          error?.message ||
          (isInvoiceMode
            ? "Could not save invoice details."
            : "Could not save purchase import details."),
        variant: "destructive",
      });
    } finally {
      setSavingReceive(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {isInvoiceMode ? "Invoices" : "Shipments"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isInvoiceMode
            ? "Select a purchase order to enter invoice details and import expenses."
            : "Orders created automatically when a purchase quotation is confirmed."}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className={`${LIST_NUMBER_HEAD_CLASS} p-2 border-b`}>#</th>
              <th className="text-left p-2 border-b">Date</th>
              <th className="text-left p-2 border-b">PO No</th>
              <th className="text-left p-2 border-b">Quotation No</th>
              <th className="text-left p-2 border-b">Inquiry No</th>
              <th className="text-left p-2 border-b">Supplier</th>
              <th className="text-left p-2 border-b">Consignee</th>
              <th className="text-left p-2 border-b">Forwarder</th>
              <th className="text-left p-2 border-b">Est Time Date</th>
              <th className="text-right p-2 border-b">Items</th>
              <th className="text-right p-2 border-b">Total (LC)</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-center p-2 border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="p-4 text-center text-muted-foreground">
                  Loading purchase orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-4 text-center text-muted-foreground">
                  No purchase orders yet. Confirm a quotation to create one.
                </td>
              </tr>
            ) : (
              orders.map((row, index) => (
                <tr key={row.id} className="border-b hover:bg-muted/20">
                  <td className={`${LIST_NUMBER_CELL_CLASS} p-2`}>
                    {getListRowNumber(index, currentPage, itemsPerPage, totalRecords)}
                  </td>
                  <td className="p-2">
                    {row.date ? new Date(row.date).toLocaleDateString() : "-"}
                  </td>
                  <td className="p-2 font-mono text-xs">{row.poNumber || "-"}</td>
                  <td className="p-2 font-mono text-xs">
                    {row.quotation?.quotationNo || "-"}
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {row.quotation?.requestNo || "-"}
                  </td>
                  <td className="p-2">{row.supplier?.name || "-"}</td>
                  <td className="p-2 uppercase">{row.consignee || "-"}</td>
                  <td className="p-2">{row.forwarder || "-"}</td>
                  <td className="p-2">
                    {row.estTimeDate || row.expectedDate
                      ? new Date(
                          row.estTimeDate || row.expectedDate || "",
                        ).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="p-2 text-right">{row.itemsCount}</td>
                  <td className="p-2 text-right">
                    {Number(row.totalAmount || 0).toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="p-2">
                    <ImportPurchaseOrderStatusBadge status={row.status} />
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openOrderDetail(row.id)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View
                      </Button>
                      <PrintPdfButton
                        size="sm"
                        disabled={printingOrderId === row.id}
                        label={
                          printingOrderId === row.id ? "Printing..." : "Print PDF"
                        }
                        onPrint={() => {
                          if (printingOrderId) return;
                          void handlePrintOrderPdf(row.id);
                        }}
                      />
                      {!isReceivedPurchaseOrder(row.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingOrderId === row.id}
                          title="Delete purchase order (only when not received)"
                          onClick={() => void handleDeleteOrder(row.id)}
                        >
                          <Trash className="w-3.5 h-3.5 mr-1" />
                          {deletingOrderId === row.id ? "Deleting..." : "Delete"}
                        </Button>
                      ) : null}
                      {(() => {
                        const importSaved = isImportPurchaseOrderSaved(row);
                        const invoiceLocked = isInvoiceMode && !importSaved;
                        const importLocked =
                          !isInvoiceMode &&
                          isPurchaseInvoiceCreatedStatus(row.status);
                        const actionDisabled =
                          isReceivedPurchaseOrder(row.status) ||
                          invoiceLocked ||
                          importLocked;
                        const listActionLabel = isInvoiceMode
                          ? isStockReceivingPendingStatus(row.status)
                            ? "Update Invoice"
                            : formActionLabel
                          : importSaved
                            ? "Update PO"
                            : formActionLabel;
                        return (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={actionDisabled}
                        title={
                          importLocked
                            ? "Invoice already saved — Purchase Import is locked"
                            : invoiceLocked
                            ? "Save Purchase Import at least once before opening Invoice"
                            : undefined
                        }
                        onClick={() => openReceiveForm(row)}
                      >
                        {isInvoiceMode ? (
                          <Receipt className="w-3.5 h-3.5 mr-1" />
                        ) : (
                          <PackageCheck className="w-3.5 h-3.5 mr-1" />
                        )}
                        {listActionLabel}
                      </Button>
                        );
                      })()}
                      {isInvoiceMode &&
                      isReceivedPurchaseOrder(row.status) &&
                      isKhiConsignee(row.consignee) &&
                      !row.stockedOut &&
                      !row.transferOutInvoiceId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleStockOutFromPo(row)}
                        >
                          <ArrowUpFromLine className="w-3.5 h-3.5 mr-1" />
                          Stock Out
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && totalRecords > 0 && (
        <PurchaseImportListPagination
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalRecords={totalRecords}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
        />
      )}

      <Dialog open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
                  <DialogTitle>
                    Shipment {viewOrder?.po_number || viewOrder?.poNumber || ""}
                  </DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <p className="text-sm text-muted-foreground">Loading order details...</p>
          ) : viewOrder ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>{" "}
                  {viewOrder.supplier?.name || viewOrder.supplier_name || "-"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <ImportPurchaseOrderStatusBadge status={viewOrder.status} />
                </div>
                {viewOrder.consignee ? (
                  <div>
                    <span className="text-muted-foreground">Consignee:</span>{" "}
                    {String(viewOrder.consignee).toUpperCase()}
                  </div>
                ) : null}
                {viewOrder.quotation?.quotationNo ? (
                  <div>
                    <span className="text-muted-foreground">Quotation:</span>{" "}
                    {viewOrder.quotation.quotationNo}
                  </div>
                ) : null}
                <div>
                  <span className="text-muted-foreground">Date:</span>{" "}
                  {viewOrder.date
                    ? new Date(viewOrder.date).toLocaleDateString()
                    : "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Total (LC):</span>{" "}
                  {Number(viewOrder.totalAmount || viewOrder.total_amount || 0).toLocaleString(
                    "en-PK",
                    { minimumFractionDigits: 2 },
                  )}
                </div>
                {(viewOrder.invoiceNo || viewOrder.invoice_no) ? (
                  <div>
                    <span className="text-muted-foreground">Invoice No:</span>{" "}
                    {viewOrder.invoiceNo || viewOrder.invoice_no}
                  </div>
                ) : null}
                {(viewOrder.invoiceDate || viewOrder.invoice_date) ? (
                  <div>
                    <span className="text-muted-foreground">Invoice Date:</span>{" "}
                    {new Date(
                      viewOrder.invoiceDate || viewOrder.invoice_date,
                    ).toLocaleDateString()}
                  </div>
                ) : null}
                {(viewOrder.blNo || viewOrder.bl_no) ? (
                  <div>
                    <span className="text-muted-foreground">BL No:</span>{" "}
                    {viewOrder.blNo || viewOrder.bl_no}
                  </div>
                ) : null}
                {(viewOrder.blDate || viewOrder.bl_date) ? (
                  <div>
                    <span className="text-muted-foreground">BL Date:</span>{" "}
                    {new Date(viewOrder.blDate || viewOrder.bl_date).toLocaleDateString()}
                  </div>
                ) : null}
                <div>
                  <span className="text-muted-foreground">Forwarder:</span>{" "}
                  {viewOrder.forwarder || "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Est Time Date:</span>{" "}
                  {viewOrder.estTimeDate || viewOrder.expectedDate
                    ? new Date(
                        viewOrder.estTimeDate || viewOrder.expectedDate,
                      ).toLocaleDateString()
                    : "-"}
                </div>
                {viewOrder.currency ? (
                  <div>
                    <span className="text-muted-foreground">Currency:</span>{" "}
                    {viewOrder.currency}
                  </div>
                ) : null}
                {(viewOrder.conversionRate || viewOrder.conversion_rate) ? (
                  <div>
                    <span className="text-muted-foreground">Exchange Rate:</span>{" "}
                    {Number(
                      viewOrder.conversionRate ?? viewOrder.conversion_rate ?? 0,
                    ).toFixed(4)}
                  </div>
                ) : null}
                {Number(viewOrder.fcTotal || viewOrder.fc_total || 0) > 0 ? (
                  <div>
                    <span className="text-muted-foreground">FC Total:</span>{" "}
                    {Number(viewOrder.fcTotal || viewOrder.fc_total).toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                ) : null}
              </div>
              {(() => {
                const viewExpenses = parseImportPoExpenses(viewOrder.expenses);
                const invoiceLc = Number(
                  viewOrder.totalAmount || viewOrder.total_amount || 0,
                );
                const invoiceFc = Number(
                  viewOrder.fcTotal || viewOrder.fc_total || 0,
                );
                const conversionRate = (() => {
                  const rate = Number(
                    viewOrder.conversionRate ?? viewOrder.conversion_rate ?? 0,
                  );
                  return Number.isFinite(rate) && rate > 0 ? rate : 1;
                })();
                const commercial = computeImportPoCommercialAmounts(
                  viewExpenses,
                  invoiceLc,
                  conversionRate,
                  invoiceFc,
                );
                const totalExp =
                  viewExpenses.totalExp > 0
                    ? viewExpenses.totalExp
                    : computeImportPoTotalExp(
                        viewExpenses,
                        invoiceLc,
                        conversionRate,
                      );
                const invoiceTotal = computeImportPoInvoiceTotal(
                  invoiceLc,
                  totalExp,
                  commercial.invDiscAmt,
                );
                const hasCommercial =
                  viewExpenses.pkgExpPercent > 0 ||
                  viewExpenses.invDiscPercent > 0 ||
                  viewExpenses.frtExp > 0 ||
                  commercial.pkgExpAmt > 0 ||
                  commercial.invDiscAmt > 0;
                const hasClearing = IMPORT_PO_EXPENSE_AMOUNT_KEYS.some(
                  (key) => Number(viewExpenses[key] || 0) > 0,
                );
                const showExpenses =
                  isInvoiceMode || hasCommercial || hasClearing || totalExp > 0;

                if (!showExpenses) return null;

                return (
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">Expenses</h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total Exp.: </span>
                          <span className="font-semibold tabular-nums">
                            {formatImportPoAmount(totalExp)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Invoice Total: </span>
                          <span className="font-semibold tabular-nums">
                            {formatImportPoAmount(invoiceTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                      <div className="space-y-2 min-w-0 overflow-x-auto">
                        <div className="inline-flex flex-col gap-2">
                          <div className="flex items-center gap-2 pl-20">
                            <span className="w-[72px] shrink-0 text-[10px] text-muted-foreground text-center">
                              %
                            </span>
                            <span className="w-[90px] shrink-0 text-[10px] text-muted-foreground text-center">
                              FC
                            </span>
                            <span className="w-[90px] shrink-0 text-[10px] text-muted-foreground text-center">
                              LC
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs w-20 shrink-0">Pkg.Exp.</span>
                            <span className="h-8 w-[72px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatRateInput(viewExpenses.pkgExpPercent) || "0"}
                            </span>
                            <span className="h-8 w-[90px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatImportPoAmount(commercial.pkgExpFcAmt)}
                            </span>
                            <span className="h-8 w-[90px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatImportPoAmount(commercial.pkgExpAmt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs w-20 shrink-0">Inv.Disc.</span>
                            <span className="h-8 w-[72px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatRateInput(viewExpenses.invDiscPercent) || "0"}
                            </span>
                            <span className="h-8 w-[90px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatImportPoAmount(commercial.invDiscFcAmt)}
                            </span>
                            <span className="h-8 w-[90px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatImportPoAmount(commercial.invDiscAmt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs w-20 shrink-0">Frt.Exp (FC)</span>
                            <span className="h-8 w-[72px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatImportPoAmount(viewExpenses.frtExp)}
                            </span>
                            <span className="h-8 w-[90px] shrink-0 px-1 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                              {formatImportPoAmount(commercial.frtExpLc)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {IMPORT_PO_CLEARING_EXPENSE_SECTIONS.map((section) => (
                        <div key={section.title} className="space-y-2 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {section.title}
                          </p>
                          {section.fields.map((field) => (
                            <div
                              key={field.key}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-xs w-20 shrink-0">{field.label}</span>
                              <span className="h-8 min-w-[100px] px-2 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                                {formatImportPoAmount(Number(viewExpenses[field.key] || 0))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {viewOrder.notes ? (
                <p className="text-muted-foreground">{viewOrder.notes}</p>
              ) : null}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2">Master Part | Part No</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2">Order Qty</th>
                      <th className="text-right p-2">Received</th>
                      <th className="text-right p-2">From Back</th>
                      <th className="text-right p-2">Back</th>
                      <th className="text-right p-2">FC Rate</th>
                      <th className="text-right p-2">FC Amount</th>
                      <th className="text-right p-2">LC Rate</th>
                      <th className="text-right p-2">LC Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewOrder.items || []).map((item: any) => {
                      const orderQty = Number(item.orderQty ?? item.quantity ?? 0);
                      const receivedQty = Number(
                        item.receivedQty ?? item.received_qty ?? 0,
                      );
                      const additionalQty = Number(
                        item.additionalQty ?? item.additional_qty ?? 0,
                      );
                      const backQty = Number(item.backQty ?? item.back_qty ?? 0);
                      const fcRate = Number(item.fcRate ?? item.fc_rate ?? 0);
                      const fcAmount = Number(
                        item.fcAmount ??
                          item.fc_amount ??
                          fcRate * orderQty,
                      );
                      const lcRate = Number(
                        item.lcRate ?? item.lc_rate ?? item.unit_cost ?? 0,
                      );
                      const lcAmount = Number(
                        item.lcAmount ??
                          item.lc_amount ??
                          item.total_cost ??
                          lcRate * orderQty,
                      );
                      return (
                      <tr key={item.id} className="border-t">
                        <td className="p-2 font-mono">
                          {item.masterPartNo || item.master_part_no || "-"} |{" "}
                          {item.partNo || item.part_no || "-"}
                        </td>
                        <td className="p-2">
                          {item.description || item.part_description || "-"}
                        </td>
                        <td className="p-2 text-right tabular-nums">{orderQty}</td>
                        <td className="p-2 text-right tabular-nums">{receivedQty}</td>
                        <td className="p-2 text-right tabular-nums">
                          {additionalQty > 0 ? additionalQty : "-"}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {backQty > 0 ? backQty : "-"}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {fcRate.toFixed(4)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {fcAmount.toFixed(2)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {lcRate.toFixed(2)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {lcAmount.toFixed(2)}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!receiveOrderId}
        onOpenChange={(open) => {
          if (!open && !savingReceive) {
            resetImportPurchaseForm();
          }
        }}
      >
        <DialogContent className="left-0 top-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:rounded-none">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle>
              {formTitle} — {receiveOrderLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loadingReceiveForm ? (
            <p className="text-sm text-muted-foreground">
              Loading {formTitle.toLowerCase()}...
            </p>
          ) : (
            <div className="space-y-4">
              {receiveDetail ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Supplier:</span>{" "}
                    {receiveDetail.supplierName}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Quotation:</span>{" "}
                    {receiveDetail.quotationNo}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Inquiry:</span>{" "}
                    {receiveDetail.requestNo || "-"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Currency:</span>{" "}
                    {receiveDetail.currency}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Consignee:</span>{" "}
                    {(receiveDetail.consignee || "-").toUpperCase()}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="receive-invoice-no">Invoice No</Label>
                  <Input
                    id="receive-invoice-no"
                    value={receiveInvoiceNo}
                    onChange={(e) => setReceiveInvoiceNo(e.target.value)}
                    placeholder="Supplier invoice number"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="receive-invoice-date">Invoice Date</Label>
                  <Input
                    id="receive-invoice-date"
                    type="date"
                    value={receiveInvoiceDate}
                    onChange={(e) => setReceiveInvoiceDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="receive-bl-no">BL No</Label>
                  <Input
                    id="receive-bl-no"
                    value={receiveBlNo}
                    onChange={(e) => setReceiveBlNo(e.target.value)}
                    placeholder="Bill of lading number"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="receive-bl-date">BL Date</Label>
                  <Input
                    id="receive-bl-date"
                    type="date"
                    value={receiveBlDate}
                    onChange={(e) => setReceiveBlDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="receive-forwarder">Forwarder</Label>
                  <Input
                    id="receive-forwarder"
                    value={receiveForwarder}
                    onChange={(e) => setReceiveForwarder(e.target.value)}
                    placeholder="Forwarder name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="receive-est-time-date">Est Time Date</Label>
                  <Input
                    id="receive-est-time-date"
                    type="date"
                    value={receiveEstTimeDate}
                    onChange={(e) => setReceiveEstTimeDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="receive-conversion-rate">Exchange Rate</Label>
                  <Input
                    id="receive-conversion-rate"
                    type="number"
                    min={0}
                    step="0.0001"
                    value={receiveConversionRate}
                    onChange={(e) => handleConversionRateChange(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {isInvoiceMode
                  ? "Enter supplier invoice quantities, rates, and expenses for this import purchase order. FC rate and exchange rate can be changed; LC rate is FC rate × exchange rate."
                  : "Enter supplier invoice quantities and rates for this import purchase order. FC rate and exchange rate can be changed; LC rate is FC rate × exchange rate. Enter packaging and discount below; other clearing expenses can be added from Invoice. Final stock receipt is completed from Store."}
              </p>
              <div className="flex items-end justify-between gap-2 flex-wrap">
                {receiveItemJumpOptions.length > 0 ? (
                  <div className="w-full sm:w-[320px] space-y-1">
                    <Label className="text-xs">Item Filter</Label>
                    <SearchableSelect
                      options={receiveItemJumpOptions}
                      value={jumpToReceiveLineId}
                      onValueChange={handleReceiveItemJump}
                      placeholder="Go to item..."
                      selectedDisplayLabelOnly
                    />
                  </div>
                ) : (
                  <div />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loadingReceiveForm || savingReceive}
                  onClick={addReceiveLine}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 whitespace-nowrap">#</th>
                      <th className="text-left p-2 min-w-[220px]">Part</th>
                      <th className="text-left p-2">Brand</th>
                      {!isInvoiceMode ? (
                        <>
                          <th className="text-right p-2">Stock</th>
                          <th className="text-right p-2">Ship Days</th>
                          <th className="text-right p-2">Order Qty</th>
                        </>
                      ) : null}
                      <th className="text-right p-2">
                        {isInvoiceMode ? "Qty" : "Receive Qty"}
                      </th>
                      {!isInvoiceMode ? (
                        <>
                          <th className="text-right p-2">From Back Qty</th>
                          <th className="text-right p-2">Back Qty</th>
                        </>
                      ) : null}
                      <th className="text-right p-2">FC Rate</th>
                      <th className="text-right p-2">FC Amount</th>
                      <th className="text-right p-2">LC Rate</th>
                      <th className="text-right p-2">LC Amount</th>
                      {isInvoiceMode ? (
                        <>
                          <th className="text-right p-2">Unit Exp</th>
                          <th className="text-right p-2">Exp</th>
                          <th className="text-right p-2">Unit Cost</th>
                          <th className="text-right p-2">Cost</th>
                          <th className="text-right p-2">Price A</th>
                          <th className="text-right p-2">Price B</th>
                        </>
                      ) : null}
                      <th className="text-right p-2">Weight</th>
                      <th className="text-right p-2">Total Weight</th>
                      <th className="text-center p-2 min-w-[70px]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveLines.map((line, index) => {
                      const lineAmounts = computeImportReceiveLineAmounts(
                        line,
                        line.receiveQty,
                      );
                      const receiveQty = Math.max(0, Math.floor(Number(line.receiveQty) || 0));
                      const distributedExpense = receiveDistributedExpenses[index] ?? 0;
                      const unitExp = receiveQty > 0 ? distributedExpense / receiveQty : 0;
                      const unitCost = Number(line.lcRate || 0) + unitExp;
                      const lineCost = Number(lineAmounts.lcAmount || 0) + distributedExpense;
                      return (
                      <tr
                        key={line.id}
                        ref={(el) => {
                          receiveLineRowRefs.current[line.id] = el;
                        }}
                        className={cn(
                          "border-t",
                          highlightedReceiveLineId === line.id &&
                            "bg-primary/10 ring-2 ring-primary/30 ring-inset",
                        )}
                      >
                        <td className="p-2 text-center text-muted-foreground tabular-nums">
                          {index + 1}
                        </td>
                        <td className="p-2">
                          {line.isNewRow ? (
                            <div className="space-y-1 min-w-[240px]">
                              <SearchableSelect
                                options={receivePartSelectOptions}
                                value={line.partId}
                                onValueChange={(partId) =>
                                  void selectPartForReceiveLine(line.id, partId)
                                }
                                placeholder="Master Part | Part No"
                                selectedDisplayLabelOnly
                                disabled={loadingReceiveForm || savingReceive}
                              />
                              {line.loadingPartDetails ? (
                                <p className="text-xs text-muted-foreground">
                                  Loading details...
                                </p>
                              ) : line.partId ? (
                                <p className="text-xs text-muted-foreground">
                                  {line.description || "-"}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              <div className="font-medium">
                                {line.masterPartNo || "-"} | {line.partNo || "-"}
                              </div>
                              <div className="text-muted-foreground">{line.description}</div>
                            </>
                          )}
                        </td>
                        <td className="p-2">{line.brand || "-"}</td>
                        {!isInvoiceMode ? (
                          <>
                            <td className="p-2 text-right tabular-nums">{line.currentStock}</td>
                            <td className="p-2 text-right tabular-nums">{line.shipDays}</td>
                            <td className="p-2 text-right tabular-nums">{line.orderQty}</td>
                          </>
                        ) : null}
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={line.receiveQty}
                            onChange={(event) =>
                              handleReceiveQtyChange(line.id, event.target.value)
                            }
                            className="h-8 w-24 ml-auto text-right"
                          />
                        </td>
                        {!isInvoiceMode ? (
                          <>
                            <td className="p-2 text-right text-amber-700 dark:text-amber-400 tabular-nums">
                              {line.additionalQty > 0 ? line.additionalQty : "-"}
                            </td>
                            <td className="p-2 text-right text-rose-700 dark:text-rose-400 tabular-nums">
                              {line.backQty > 0 ? line.backQty : "-"}
                            </td>
                          </>
                        ) : null}
                        <td className="p-2 text-right">
                          <Input
                            type="text"
                            inputMode="decimal"
                            className={`${QUOTATION_FC_RATE_INPUT_CLASS} ml-auto`}
                            value={line.fcRateText}
                            onChange={(event) =>
                              handleReceiveFcRateChange(line.id, event.target.value)
                            }
                            onBlur={() => handleReceiveFcRateBlur(line.id)}
                          />
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {lineAmounts.fcAmount.toFixed(2)}
                        </td>
                        <td className="p-2 text-right tabular-nums">{line.lcRate.toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums">
                          {lineAmounts.lcAmount.toFixed(2)}
                        </td>
                        {isInvoiceMode ? (
                          <>
                            <td className="p-2 text-right tabular-nums">
                              {importPoTotalExp > 0
                                ? unitExp.toLocaleString("en-PK", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {importPoTotalExp > 0
                                ? distributedExpense.toLocaleString("en-PK", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}
                            </td>
                            <td className="p-2 text-right tabular-nums font-medium">
                              {unitCost.toLocaleString("en-PK", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-2 text-right tabular-nums font-medium">
                              {lineCost.toLocaleString("en-PK", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-2 text-right">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8 w-24 ml-auto text-right"
                                value={line.priceAText}
                                onChange={(event) =>
                                  handleReceivePriceChange(
                                    line.id,
                                    "priceA",
                                    event.target.value,
                                  )
                                }
                                onBlur={() => handleReceivePriceBlur(line.id, "priceA")}
                              />
                            </td>
                            <td className="p-2 text-right">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8 w-24 ml-auto text-right"
                                value={line.priceBText}
                                onChange={(event) =>
                                  handleReceivePriceChange(
                                    line.id,
                                    "priceB",
                                    event.target.value,
                                  )
                                }
                                onBlur={() => handleReceivePriceBlur(line.id, "priceB")}
                              />
                            </td>
                          </>
                        ) : null}
                        <td className="p-2 text-right tabular-nums">
                          {line.weight > 0 ? line.weight.toFixed(4) : "-"}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {lineAmounts.totalWeight > 0
                            ? lineAmounts.totalWeight.toFixed(4)
                            : "-"}
                        </td>
                        <td className="p-2 text-center">
                          {line.isNewRow ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={savingReceive}
                              onClick={() => removeReceiveLine(line.id)}
                              title="Remove item"
                            >
                              <Trash className="w-4 h-4 text-destructive" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  {receiveLines.length > 0 ? (
                    <tfoot>
                      <tr className="bg-muted/40 font-semibold border-t">
                        <td className="p-2" />
                        <td className="p-2">Totals</td>
                        {isInvoiceMode ? (
                          <>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.receiveQty}
                            </td>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.fcAmount.toFixed(2)}
                            </td>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.lcAmount.toFixed(2)}
                            </td>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {importPoTotalExp > 0
                                ? receiveExpenseTotal.toLocaleString("en-PK", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}
                            </td>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {(
                                Number(receiveTotals.lcAmount || 0) +
                                Number(receiveExpenseTotal || 0)
                              ).toLocaleString("en-PK", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-2" />
                            <td className="p-2" />
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.totalWeight.toFixed(4)}
                            </td>
                            <td className="p-2" />
                          </>
                        ) : (
                          <>
                            <td className="p-2" colSpan={3} />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.orderQty}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.receiveQty}
                            </td>
                            <td className="p-2" colSpan={2} />
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.fcAmount.toFixed(2)}
                            </td>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.lcAmount.toFixed(2)}
                            </td>
                            <td className="p-2" />
                            <td className="p-2 text-right tabular-nums">
                              {receiveTotals.totalWeight.toFixed(4)}
                            </td>
                            <td className="p-2" />
                          </>
                        )}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
              <div className="rounded-md border border-border p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">
                    {isInvoiceMode ? "Expenses" : "Packaging & Discount"}
                  </h4>
                  {isInvoiceMode ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Exp.: </span>
                        <span className="font-semibold tabular-nums">
                          {formatImportPoAmount(importPoTotalExp)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Invoice Total: </span>
                        <span className="font-semibold tabular-nums">
                          {formatImportPoAmount(importPoInvoiceTotal)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div
                  className={`grid grid-cols-1 gap-6 ${
                    isInvoiceMode ? "xl:grid-cols-3" : ""
                  }`}
                >
                  <div className="space-y-2 min-w-0 overflow-x-auto">
                    <div className="inline-flex flex-col gap-2">
                      <div className="flex items-center gap-2 pl-24">
                        <span className="w-[88px] shrink-0 text-[10px] text-muted-foreground text-center">
                          %
                        </span>
                        <span className="w-[110px] shrink-0 text-[10px] text-muted-foreground text-center">
                          FC Amount
                        </span>
                        <span className="w-[110px] shrink-0 text-[10px] text-muted-foreground text-center">
                          LC Amount
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-normal w-24 shrink-0">Pkg.Exp.</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-[88px] shrink-0 text-right text-xs"
                          placeholder="%"
                          title="Pkg.Exp. %"
                          value={importExpenseLinkedText.pkg.percent}
                          onChange={(event) =>
                            updateLinkedExpenseField("pkg", "percent", event.target.value)
                          }
                          onBlur={() => blurLinkedExpenseField("pkg")}
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-[110px] shrink-0 text-right text-xs"
                          placeholder="FC"
                          title="Pkg.Exp. foreign currency amount"
                          value={importExpenseLinkedText.pkg.fc}
                          onChange={(event) =>
                            updateLinkedExpenseField("pkg", "fc", event.target.value)
                          }
                          onBlur={() => blurLinkedExpenseField("pkg")}
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-[110px] shrink-0 text-right text-xs"
                          placeholder="LC"
                          title="Pkg.Exp. local currency amount"
                          value={importExpenseLinkedText.pkg.lc}
                          onChange={(event) =>
                            updateLinkedExpenseField("pkg", "lc", event.target.value)
                          }
                          onBlur={() => blurLinkedExpenseField("pkg")}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-normal w-24 shrink-0">Inv.Disc.</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-[88px] shrink-0 text-right text-xs"
                          placeholder="%"
                          title="Inv.Disc. %"
                          value={importExpenseLinkedText.disc.percent}
                          onChange={(event) =>
                            updateLinkedExpenseField("disc", "percent", event.target.value)
                          }
                          onBlur={() => blurLinkedExpenseField("disc")}
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-[110px] shrink-0 text-right text-xs"
                          placeholder="FC"
                          title="Inv.Disc. foreign currency amount"
                          value={importExpenseLinkedText.disc.fc}
                          onChange={(event) =>
                            updateLinkedExpenseField("disc", "fc", event.target.value)
                          }
                          onBlur={() => blurLinkedExpenseField("disc")}
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-[110px] shrink-0 text-right text-xs"
                          placeholder="LC"
                          title="Inv.Disc. local currency amount"
                          value={importExpenseLinkedText.disc.lc}
                          onChange={(event) =>
                            updateLinkedExpenseField("disc", "lc", event.target.value)
                          }
                          onBlur={() => blurLinkedExpenseField("disc")}
                        />
                      </div>
                      {isInvoiceMode ? (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-normal w-24 shrink-0">Frt.Exp (FC)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            className="h-8 w-[88px] shrink-0 text-right text-xs"
                            value={
                              importExpenses.frtExp === 0 ? "" : importExpenses.frtExp
                            }
                            onChange={(event) =>
                              updateImportExpense("frtExp", event.target.value)
                            }
                          />
                          <div className="h-8 w-[110px] shrink-0 px-2 flex items-center justify-end rounded-md border bg-muted/40 text-xs tabular-nums">
                            {formatImportPoAmount(importPoCommercialAmounts.frtExpLc)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {isInvoiceMode
                    ? IMPORT_PO_CLEARING_EXPENSE_SECTIONS.map((section) => (
                        <div key={section.title} className="space-y-2 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {section.title}
                          </p>
                          {section.fields.map((field) => (
                            <div
                              key={field.key}
                              className="flex items-center gap-2"
                            >
                              <Label className="text-xs font-normal w-20 shrink-0">
                                {field.label}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step={field.step || "1"}
                                className="h-8 w-full max-w-[140px] text-right text-xs"
                                value={
                                  importExpenses[field.key] === 0
                                    ? ""
                                    : importExpenses[field.key]
                                }
                                onChange={(event) =>
                                  updateImportExpense(field.key, event.target.value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      ))
                    : null}
                </div>
              </div>
            </div>
          )}
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={savingReceive}
              onClick={resetImportPurchaseForm}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                loadingReceiveForm ||
                savingReceive ||
                receiveLines.length === 0 ||
                (!isInvoiceMode &&
                  isPurchaseInvoiceCreatedStatus(receiveOrderStatus))
              }
              onClick={() => void handleSaveReceive()}
            >
              {savingReceive ? "Saving..." : saveLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PurchaseImport = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const normalizedTab = tab === "request" ? "inquiry" : tab;
  const activeTab: PurchaseImportTab = tabs.some((t) => t.id === normalizedTab)
    ? (normalizedTab as PurchaseImportTab)
    : "inquiry";

  useEffect(() => {
    if (!tab) {
      navigate("/purchase-import/inquiry", { replace: true });
      return;
    }
    if (tab === "request") {
      navigate("/purchase-import/inquiry", { replace: true });
      return;
    }
    if (tab === "costing" || tab === "history") {
      navigate("/purchase-import/inquiry", { replace: true });
    }
  }, [tab, navigate]);

  const handleTabChange = (tabId: PurchaseImportTab) => {
    navigate(`/purchase-import/${tabId}`);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "inquiry":
        return <PurchaseImportRequestTab />;
      case "quotation":
        return <PurchaseQuotationTab />;
      case "revise-quotation":
        return <PurchaseReviseQuotationTab />;
      case "confirm-quotation":
        return <PurchaseConfirmQuotationTab />;
      case "purchase-order":
        return <PurchaseOrderTab mode="purchase-order" />;
      case "purchase-invoice":
        return <PurchaseOrderTab mode="purchase-invoice" />;
      case "back-order-summary":
        return <BackOrderSummaryTab />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        <div className="bg-card border-b border-border relative z-10">
          <div className="px-4 py-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-max">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium whitespace-nowrap group",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          <div className="animate-fade-in">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
};

export default PurchaseImport;
