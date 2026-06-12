import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FileText, Package, BarChart3, Plus, Trash2, Pencil, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
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
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

type PurchaseImportTab = "inquiry" | "quotation" | "costing" | "history";

interface TabConfig {
  id: PurchaseImportTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const PURCHASE_QUOTATION_TERMS = [
  "EX-Works",
  "F.O.B",
  "CTF/CNF",
  "CFR",
  "CIF",
] as const;

const tabs: TabConfig[] = [
  {
    id: "inquiry",
    label: "Purchase Import Inquiry",
    icon: FileText,
    description: "Create and manage purchase import inquiries",
  },
  {
    id: "quotation",
    label: "Purchase Quotation",
    icon: Check,
    description: "Review and update purchase quotations",
  },
  {
    id: "costing",
    label: "Landed Cost",
    icon: Package,
    description: "Manage landed costs and allocations",
  },
  {
    id: "history",
    label: "Import History",
    icon: BarChart3,
    description: "Review past purchase import records",
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
  khiQuantity: number;
  isbQuantity: number;
  otherQuantity: number;
  weight: number;
  totalWeight: number;
  lastPurchases: LastPurchase[];
  loadingDetails: boolean;
};

type InquiryItemSort = "alphabetical" | "numeric" | "description" | "hsCode";
type SortDirection = "asc" | "desc";

type PurchaseImportRequestRecord = {
  id: string;
  requestNo?: string;
  batchId: string;
  supplierId?: string | null;
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
  PurchaseImportRequest?: {
    id: string;
    requestNo?: string | null;
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
};

type PurchaseQuotationDetailItem = {
  partId: string;
  masterPartNo: string;
  partNo: string;
  description: string;
  brand: string;
  currentStock?: number;
  demandQuantity: number;
  quotationQuantity: number;
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
};

type PurchaseQuotationDetailPayload = {
  id: string;
  quotationNo: string;
  quotationDate: string;
  revisedQuotationDate?: string | null;
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
    }
  >;
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

const QUOTATION_QTY_COL_CLASS = "text-right p-2 border-b w-24 whitespace-nowrap";
const QUOTATION_SHIP_DAYS_COL_CLASS = "text-right p-2 border-b w-20 whitespace-nowrap";
const QUOTATION_FC_RATE_COL_CLASS = "text-right p-2 border-b w-24 whitespace-nowrap";
const QUOTATION_QTY_INPUT_CLASS =
  "h-8 w-24 min-w-0 text-right text-xs px-2 ml-auto";
const QUOTATION_SHIP_DAYS_INPUT_CLASS =
  "h-8 w-20 min-w-0 text-right text-xs px-2 ml-auto";
const QUOTATION_FC_RATE_INPUT_CLASS =
  "h-8 w-24 min-w-0 text-right text-xs px-2 ml-auto";

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
  khiQuantity: 0,
  isbQuantity: 0,
  otherQuantity: 0,
  weight: 0,
  totalWeight: 0,
  lastPurchases: [],
  loadingDetails: false,
});

const getInquiryRowDemandQuantity = (row: Pick<ItemRow, "khiQuantity" | "isbQuantity" | "otherQuantity">) =>
  Number(row.khiQuantity || 0) + Number(row.isbQuantity || 0) + Number(row.otherQuantity || 0);

const getQuotationRowDemandQuantity = (
  row: Pick<PurchaseQuotationFormItem, "khiQuantity" | "isbQuantity" | "otherQuantity">,
) =>
  Number(row.khiQuantity || 0) +
  Number(row.isbQuantity || 0) +
  Number(row.otherQuantity || 0);

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
) =>
  [...partOptions]
    .sort((a, b) => compareInquiryItemSort(a, b, itemSort, itemSortDirection))
    .map((p) => ({
      value: p.id,
      label: `${p.masterPartNo || "-"} | ${p.partNo}`,
      description: String(p.description || "").trim() || "-",
      listOnlyDescription: String(p.brand || "").trim() || undefined,
    }));

const sortInquiryItemRows = <T extends { partId: string }>(
  rows: T[],
  partOptions: PartOption[],
  itemSort: InquiryItemSort,
  itemSortDirection: SortDirection,
  getRowFields?: (row: T, part?: PartOption) => PartSortFields,
): T[] => {
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

    const filtered = filterAlternateOptions(mapped, resolvedCurrent || {}, id);
    if (filtered.length > 0) {
      return filtered;
    }
  } catch {
    // Fall back to parts list API (e.g. when alternate-parts route is unavailable).
  }

  return fetchAlternatePartsFromPartsApi(id, resolvedCurrent || {});
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
  const [itemSort, setItemSort] = useState<InquiryItemSort>("alphabetical");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");

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

            const nextItems = Array.isArray(editData.items)
              ? editData.items.map((item, index) => {
                  const demandQty = Number(item.demandQuantity || 0);
                  const rawKhi = Number(item.khiQuantity || 0);
                  const rawIsb = Number(item.isbQuantity || 0);
                  const rawOther = Number(item.otherQuantity || 0);
                  const splitQty = rawKhi + rawIsb + rawOther;
                  const khiQuantity =
                    splitQty > 0 ? rawKhi : normalizedConsignee === "KHI" ? demandQty : 0;
                  const isbQuantity =
                    splitQty > 0 ? rawIsb : normalizedConsignee === "ISB" ? demandQty : 0;
                  const otherQuantity =
                    splitQty > 0 ? rawOther : normalizedConsignee === "OTHER" ? demandQty : 0;

                  return {
                    id: `row-${item.partId}-${index}-${Math.random().toString(16).slice(2)}`,
                    partId: item.partId || "",
                    currentStock: Number(item.currentStock || 0),
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
              setItems([...nextItems, createEmptyItem()]);
              nextItems.forEach((row) => {
                if (row.partId) {
                  fetchPartDetails(row.id, row.partId);
                }
              });
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

  const partSelectOptions = useMemo(
    () => buildSortedPartSelectOptions(partOptions, itemSort, itemSortDirection),
    [partOptions, itemSort, itemSortDirection],
  );

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

  const addItemRow = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  useEffect(() => {
    if (isViewMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setItems((prev) => [...prev, createEmptyItem()]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isViewMode]);

  const removeItemRow = (rowId: string) => {
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
        weight: 0,
        lastPurchases: [],
      });
      return;
    }

    updateItem(rowId, { partId, loadingDetails: true });
    try {
      const res = await apiClient.getPurchaseImportPartDetails(partId);
      const details = (res as any)?.data;
      updateItem(rowId, {
        partId,
        currentStock: Number(details?.currentStock || 0),
        weight: Number(details?.part?.weight || 0),
        lastPurchases: Array.isArray(details?.lastPurchases) ? details.lastPurchases : [],
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
        items: validItems.map((row) => ({
          partId: row.partId,
          demandQuantity: getInquiryRowDemandQuantity(row),
          khiQuantity: Number(row.khiQuantity || 0),
          isbQuantity: Number(row.isbQuantity || 0),
          otherQuantity: Number(row.otherQuantity || 0),
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
          <h3 className="text-sm font-semibold">Suppliers</h3>
          <div className="flex items-center gap-2">
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
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-muted-foreground border-b">
                <th className="text-left p-2 min-w-[280px] w-[32%]">Supplier</th>
                <th className="text-left p-2 w-[100px]">Country</th>
                <th className="text-left p-2 w-[80px]">Area</th>
                <th className="text-left p-2 w-[110px]">Type</th>
                <th className="text-left p-2 w-[80px]">Currency</th>
                <th className="text-center p-2 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                      <td className="p-2 capitalize">
                        {supplier?.type || "-"}
                      </td>
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
                          <Trash2 className="w-4 h-4" />
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

<div className="space-y-3">
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
            <Button type="button" size="sm" onClick={addItemRow}>
              <Plus className="w-4 h-4 mr-1" />
              Add Item (Alt + Z)
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border rounded-md">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-center p-2 border-b w-12">#</th>
                <th className="text-left p-2 border-b">Item</th>
                <th className="text-right p-2 border-b">Current Stock</th>
                <th className="text-right p-2 border-b">KHI Qty</th>
                <th className="text-right p-2 border-b">ISB Qty</th>
                <th className="text-right p-2 border-b">Other Qty</th>
                <th className="text-right p-2 border-b">Total Demand</th>
                <th className="text-right p-2 border-b">Weight</th>
                <th className="text-right p-2 border-b">Total Weight</th>
                <th className="text-center p-2 border-b w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((row, index) => (
                <Fragment key={row.id}>
                  <tr className="align-top">
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
                      />
                      {row.loadingDetails && (
                        <p className="text-xs text-muted-foreground mt-1">Loading details...</p>
                      )}
                    </td>
                    <td className="p-2 border-b text-right">{row.currentStock}</td>
                    <td className="p-2 border-b">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20 text-right ml-auto"
                        value={row.khiQuantity === 0 ? "" : row.khiQuantity}
                        onChange={(e) =>
                          updateItem(row.id, {
                            khiQuantity: Number(e.target.value || 0),
                          })
                        }
                      />
                    </td>
                    <td className="p-2 border-b">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20 text-right ml-auto"
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
                        className="h-8 w-20 text-right ml-auto"
                        value={row.otherQuantity === 0 ? "" : row.otherQuantity}
                        onChange={(e) =>
                          updateItem(row.id, {
                            otherQuantity: Number(e.target.value || 0),
                          })
                        }
                      />
                    </td>
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
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
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
                </Fragment>
              ))}
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
              disabled
              readOnly
              className="bg-muted/40"
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

  useEffect(() => {
    const loadView = async () => {
      setLoading(true);
      try {
        const [requestRes, suppliersRes, partsRes] = await Promise.all([
          apiClient.getPurchaseImportRequestById(requestId),
          apiClient.getSuppliers({ page: 1, limit: 1000 }),
          apiClient.getPartsDropdown(),
        ]);

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
        toast({
          title: "Failed to load inquiry",
          description: error?.message || "Could not load inquiry detail.",
          variant: "destructive",
        });
        onBack();
      } finally {
        setLoading(false);
      }
    };

    loadView();
  }, [requestId, toast, onBack]);

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
        const otherQuantity = Number(item.otherQuantity || 0);
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

  const totals = useMemo(
    () => ({
      qty: itemRows.reduce((sum, row) => sum + row.totalDemand, 0),
      weight: itemRows.reduce((sum, row) => sum + row.totalWeight, 0),
    }),
    [itemRows],
  );

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
        <Button type="button" variant="outline" onClick={onBack}>
          Back to List
        </Button>
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
                <th className="text-left p-2 border-b">Supplier</th>
                <th className="text-left p-2 border-b">Country</th>
                <th className="text-left p-2 border-b">Area</th>
                <th className="text-left p-2 border-b">Type</th>
                <th className="text-left p-2 border-b">Currency</th>
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
                supplierRows.map((supplier) => (
                  <tr key={supplier.supplierId} className="border-b">
                    <td className="p-2">{supplier.name}</td>
                    <td className="p-2">{supplier.country}</td>
                    <td className="p-2">{supplier.area}</td>
                    <td className="p-2 capitalize">{supplier.type}</td>
                    <td className="p-2 uppercase">{supplier.currencyName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Items</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2 border-b">Item</th>
                <th className="text-left p-2 border-b">Brand</th>
                <th className="text-right p-2 border-b">Stock</th>
                <th className="text-right p-2 border-b">KHI</th>
                <th className="text-right p-2 border-b">ISB</th>
                <th className="text-right p-2 border-b">Other</th>
                <th className="text-right p-2 border-b">Total Qty</th>
                <th className="text-right p-2 border-b">Weight</th>
                <th className="text-right p-2 border-b">Total Weight</th>
              </tr>
            </thead>
            <tbody>
              {itemRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-3 text-center text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : (
                itemRows.map((item) => (
                  <tr key={item.partId} className="border-b">
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
                    <td className="p-2 text-right">{item.khiQuantity}</td>
                    <td className="p-2 text-right">{item.isbQuantity}</td>
                    <td className="p-2 text-right">{item.otherQuantity}</td>
                    <td className="p-2 text-right font-medium">{item.totalDemand}</td>
                    <td className="p-2 text-right">{item.weight.toFixed(2)}</td>
                    <td className="p-2 text-right">{item.totalWeight.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="p-2" colSpan={6}>
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
  const [quotationDate, setQuotationDate] = useState(toInputDate(new Date()));
  const [currency, setCurrency] = useState("USD");
  const [conversionRate, setConversionRate] = useState(1);
  const [terms, setTerms] = useState("");
  const [rows, setRows] = useState<PurchaseQuotationFormItem[]>([]);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [replaceRowId, setReplaceRowId] = useState<string | null>(null);
  const [alternateParts, setAlternateParts] = useState<PartOption[]>([]);
  const [loadingAlternates, setLoadingAlternates] = useState(false);
  const [replacingRowId, setReplacingRowId] = useState<string | null>(null);
  const [itemSort, setItemSort] = useState<InquiryItemSort>("alphabetical");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");

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
        setQuotationDate(toInputDate(data.quotationDate || new Date()));
        setCurrency(data.currency || data.defaultCurrency || "USD");
        setConversionRate(Number(data.conversionRate || 1));
        setTerms(data.terms || "");
        setRows(
          Array.isArray(data.items)
            ? data.items.map((item) => ({
                ...item,
                rowId: createRowId(),
                isNewRow: false,
                khiQuantity: Number(item.khiQuantity || 0),
                isbQuantity: Number(item.isbQuantity || 0),
                otherQuantity: Number(item.otherQuantity || 0),
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
                loadingPartDetails: false,
              }))
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
    setRows((prev) => {
      const target = prev.find((row) => row.rowId === rowId);
      if (!target?.isNewRow) return prev;
      return prev.filter((row) => row.rowId !== rowId);
    });
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
        loadingPartDetails: false,
      });
      return;
    }

    const duplicate = rows.find((row) => row.rowId !== rowId && row.partId === partId);
    if (duplicate) {
      toast({
        title: "Part already added",
        description: "This part is already on the quotation.",
        variant: "destructive",
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
      setRows((prev) =>
        prev.map((row) => {
          if (row.rowId !== rowId) return row;
          const demandQuantity = Number(row.demandQuantity || 0);
          return {
            ...row,
            ...fields,
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

    let blocked = false;
    setRows((prev) => {
      const targetRow = prev.find((row) => row.rowId === rowId);
      if (!targetRow?.partId) {
        blocked = true;
        return prev;
      }
      if (alternate.id === targetRow.partId) {
        blocked = true;
        return prev;
      }
      if (prev.some((row) => row.rowId !== rowId && row.partId === alternate.id)) {
        blocked = true;
        return prev;
      }
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

    if (blocked) {
      const targetRow = rows.find((row) => row.rowId === rowId);
      if (!targetRow?.partId) return;
      if (alternate.id === targetRow.partId) {
        toast({
          title: "Already selected",
          description: "This item is already on this quotation line.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Part already added",
        description: "This part is already on the quotation.",
        variant: "destructive",
      });
      return;
    }

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
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId
            ? { ...row, ...fields, loadingPartDetails: false }
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

  const handleSaveQuotation = async () => {
    if (!context) return;

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
        quotationDate,
        currency,
        conversionRate: Number(conversionRate || 1),
        quotationType: "original" as const,
        status: "pending",
        terms: terms || undefined,
        items: validItems.map((row) => ({
          partId: row.partId,
          demandQuantity: Number(row.demandQuantity || 0),
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
      const quotationNo = (res as any)?.data?.quotationNo || context?.quotationNo;
      toast({
        title: existingQuotationId ? "Quotation updated" : "Quotation saved",
        description: quotationNo
          ? `Quotation ${quotationNo} has been ${existingQuotationId ? "updated" : "created"} successfully.`
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Purchase Quotation</h2>
          <p className="text-sm text-muted-foreground">
            {existingQuotationId
              ? "View and update the saved quotation for this inquiry."
              : "Create quotation for the selected confirmed supplier inquiry."}
          </p>
        </div>
        <Button type="button" onClick={handleSaveQuotation} disabled={loading || saving || !context}>
          {saving ? "Saving..." : existingQuotationId ? "Update Quotation" : "Save Quotation"}
        </Button>
      </div>

      <div className="flex justify-end -mt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back to List
        </Button>
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
                <Input value={context.quotationNo || "-"} disabled />
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
                            <div className="font-medium">{row.masterPartNo || "-"}</div>
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
                              className="h-7 w-16 min-w-0 text-right text-xs px-2"
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
                            <Input
                              type="number"
                              min={0}
                              className="h-7 w-16 min-w-0 text-right text-xs px-2"
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
                          {row.isNewRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              disabled={loading || saving}
                              onClick={() => removeQuotationRow(row.rowId)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {replaceRowId === row.rowId && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={13} className="p-2">
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
                  <td className="p-2 text-right">{quotationTotals.fcAmount.toFixed(2)}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{quotationTotals.lcAmount.toFixed(2)}</td>
                  <td className="p-2 text-right">{quotationTotals.totalWeight.toFixed(2)}</td>
                  <td className="p-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="max-w-xs">
            <div className="space-y-1">
              <Label>Terms</Label>
              <Select value={terms || undefined} onValueChange={setTerms}>
                <SelectTrigger>
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  {PURCHASE_QUOTATION_TERMS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
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
  const [terms, setTerms] = useState("");
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
        setTerms(data.terms || "");
        setRows(
          Array.isArray(data.items)
            ? data.items.map((item) => ({
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
                isbQuantity: Number((item as any).isbQuantity || 0),
                otherQuantity: Number((item as any).otherQuantity || 0),
                quotationQuantity: Number(item.quotationQuantity || 0),
                shipDays: Number(item.shipDays || 0),
                fcRate: Number(item.fcRate || 0),
                fcRateText: formatRateInput(Number(item.fcRate || 0)),
                revisedFcRate: Number(item.revisedFcRate || 0),
                revisedFcRateText: formatRateInput(
                  Number(item.revisedFcRate || 0),
                ),
                weight: Number(item.weight || 0),
                loadingPartDetails: false,
              }))
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

    let blocked = false;
    setRows((prev) => {
      const targetRow = prev.find((row) => row.rowId === rowId);
      if (!targetRow?.partId) {
        blocked = true;
        return prev;
      }
      if (alternate.id === targetRow.partId) {
        blocked = true;
        return prev;
      }
      if (prev.some((row) => row.rowId !== rowId && row.partId === alternate.id)) {
        blocked = true;
        return prev;
      }
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

    if (blocked) {
      const targetRow = rows.find((row) => row.rowId === rowId);
      if (!targetRow?.partId) return;
      if (alternate.id === targetRow.partId) {
        toast({
          title: "Already selected",
          description: "This item is already on this quotation line.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Part already added",
        description: "This part is already on the quotation.",
        variant: "destructive",
      });
      return;
    }

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
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId
            ? { ...row, ...fields, loadingPartDetails: false }
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
        terms: terms || undefined,
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

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Revise Purchase Quotation</h2>
          <p className="text-sm text-muted-foreground">
            Update quotation with revised FC/LC rates and revised quotation date.
          </p>
        </div>
        <Button type="button" onClick={handleSaveRevision} disabled={loading || saving || !detail}>
          {saving ? "Saving..." : "Save Revision"}
        </Button>
      </div>

      <div className="flex justify-end -mt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back to List
        </Button>
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
                        <div className="font-medium">{row.masterPartNo || "-"}</div>
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
                        <td colSpan={17} className="p-2">
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

          <div className="max-w-xs">
            <div className="space-y-1">
              <Label>Terms</Label>
              <Select value={terms || undefined} onValueChange={setTerms}>
                <SelectTrigger>
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  {PURCHASE_QUOTATION_TERMS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const PurchaseImportRequestTab = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requestView, setRequestView] = useState<"form" | "list">("form");
  const showRequestForm = requestView === "form";
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [viewingRequestId, setViewingRequestId] = useState<string | null>(null);
  const [quotationRequestId, setQuotationRequestId] = useState<string | null>(null);
  const [quotationConsignee, setQuotationConsignee] = useState<string | null>(null);
  const [confirmingRequestId, setConfirmingRequestId] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requests, setRequests] = useState<PurchaseImportRequestRecord[]>([]);

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await apiClient.getPurchaseImportRequests({
        page: 1,
        limit: 100,
      });
      const rows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      setRequests(rows);
    } catch (error: any) {
      toast({
        title: "Failed to load inquiries",
        description: error?.message || "Could not fetch purchase import inquiries.",
        variant: "destructive",
      });
    } finally {
      setLoadingRequests(false);
    }
  };

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

  useEffect(() => {
    if (!showQuotationForm && requestView === "list") {
      fetchRequests();
    }
  }, [showQuotationForm, requestView]);

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
    setConfirmingRequestId(requestId);
    try {
      await apiClient.updatePurchaseImportRequestStatus(requestId, "pending");
      toast({
        title: "Inquiry unconfirmed",
        description: "Inquiry status has been set back to pending.",
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
        }}
      />
    );
  }

  const goToRequestList = () => {
    setRequestView("list");
    setEditingRequestId(null);
    setViewingRequestId(null);
    setSearchParams({}, { replace: true });
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
            onSaved={() => {
              goToRequestList();
              void fetchRequests();
            }}
          />
        )
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-end">
            <Button type="button" onClick={goToNewRequestForm}>
              <Plus className="w-4 h-4 mr-1" />
              New Inquiry
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 border-b">Date</th>
              <th className="text-left p-2 border-b">Inquiry No</th>
              <th className="text-left p-2 border-b">Supplier</th>
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
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  Loading inquiries...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  No inquiries found. Use <span className="font-medium">New Inquiry</span> or the Inquiry Form tab.
                </td>
              </tr>
            ) : (
              requests.map((row) => {
                const isConfirmed =
                  String(row.status || "")
                    .trim()
                    .toLowerCase() === "confirm";
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
                return (
                  <tr key={row.id} className="border-b hover:bg-muted/20">
                    <td className="p-2">
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-2 font-mono text-xs">{row.requestNo || "-"}</td>
                    <td className="p-2">{supplierName}</td>
                    <td className="p-2 text-right">{itemRows.length}</td>
                    <td className="p-2 text-right">{totalQty}</td>
                    <td className="p-2 text-right">{totalWeight.toFixed(2)}</td>
                    <td className="p-2 capitalize">{row.status || "pending"}</td>
                    <td className="p-2 max-w-[260px] truncate" title={row.notes || ""}>
                      {row.notes || "-"}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            isConfirmed
                              ? handleUnconfirmRequest(row.id)
                              : handleConfirmRequest(row.id)
                          }
                          disabled={
                            confirmingRequestId === row.id ||
                            (!isConfirmed && !hasSupplier)
                          }
                          title={
                            !hasSupplier && !isConfirmed
                              ? "Select at least one supplier before confirming"
                              : undefined
                          }
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          {isConfirmed ? "Unconfirm" : "Confirm"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!isConfirmed}
                          onClick={() => {
                            if (!isConfirmed) return;
                            setQuotationConsignee(row.consignee || null);
                            setQuotationRequestId(row.id);
                            setShowQuotationForm(true);
                          }}
                        >
                          Quotation
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingRequestId(row.id);
                            setViewingRequestId(row.id);
                            setRequestView("form");
                            setSearchParams({ view: row.id }, { replace: true });
                          }}
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
                            setEditingRequestId(row.id);
                            setViewingRequestId(null);
                            setRequestView("form");
                            setSearchParams({ edit: row.id }, { replace: true });
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </div>
      )}
    </div>
  );
};

const PurchaseQuotationTab = () => {
  const { toast } = useToast();
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionQuotationId, setRevisionQuotationId] = useState<string | null>(null);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [updatingQuotationId, setUpdatingQuotationId] = useState<string | null>(null);
  const [quotations, setQuotations] = useState<PurchaseQuotationRecord[]>([]);

  const fetchQuotations = async () => {
    setLoadingQuotations(true);
    try {
      const response = await apiClient.getPurchaseQuotations({
        page: 1,
        limit: 100,
      });
      const rows = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      setQuotations(rows);
    } catch (error: any) {
      toast({
        title: "Failed to load quotations",
        description: error?.message || "Could not fetch purchase quotations.",
        variant: "destructive",
      });
    } finally {
      setLoadingQuotations(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const handleConfirmQuotation = async (quotationId: string) => {
    setUpdatingQuotationId(quotationId);
    try {
      await apiClient.updatePurchaseQuotationStatus(quotationId, "confirm");
      toast({
        title: "Quotation confirmed",
        description: "Quotation status has been updated to confirm.",
      });
      await fetchQuotations();
    } catch (error: any) {
      toast({
        title: "Failed to update quotation",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Could not update quotation status.",
        variant: "destructive",
      });
    } finally {
      setUpdatingQuotationId(null);
    }
  };

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
          fetchQuotations();
        }}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Purchase Quotations</h2>
          <p className="text-sm text-muted-foreground">
            Review supplier quotations and update them to confirm or revise.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 border-b">Date</th>
              <th className="text-left p-2 border-b">Quotation No</th>
              <th className="text-left p-2 border-b">Inquiry No</th>
              <th className="text-left p-2 border-b">Supplier</th>
              <th className="text-right p-2 border-b">Items</th>
              <th className="text-right p-2 border-b">FC Total</th>
              <th className="text-right p-2 border-b">LC Total</th>
              <th className="text-left p-2 border-b">Type</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-center p-2 border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            {loadingQuotations ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-muted-foreground">
                  Loading quotations...
                </td>
              </tr>
            ) : quotations.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-muted-foreground">
                  No quotations found yet.
                </td>
              </tr>
            ) : (
              quotations.map((row) => {
                const normalizedStatus = String(row.status || "")
                  .trim()
                  .toLowerCase();
                const isConfirmed = normalizedStatus === "confirm";
                const isRevised = normalizedStatus === "revise";
                const itemRows = row.PurchaseQuotationItem || [];
                const supplierName =
                  row.Supplier?.companyName ||
                  row.Supplier?.name ||
                  row.Supplier?.code ||
                  "N/A";

                return (
                  <tr key={row.id} className="border-b hover:bg-muted/20">
                    <td className="p-2">
                      {row.quotationDate
                        ? new Date(row.quotationDate).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="p-2 font-mono text-xs">{row.quotationNo || "-"}</td>
                    <td className="p-2 font-mono text-xs">
                      {row.PurchaseImportRequest?.requestNo || "-"}
                    </td>
                    <td className="p-2">{supplierName}</td>
                    <td className="p-2 text-right">{itemRows.length}</td>
                    <td className="p-2 text-right">
                      {Number(row.fcTotal || 0).toFixed(2)} {row.currency || ""}
                    </td>
                    <td className="p-2 text-right">{Number(row.lcTotal || 0).toFixed(2)}</td>
                    <td className="p-2 capitalize">{row.quotationType || "original"}</td>
                    <td className="p-2 capitalize">{row.status || "pending"}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirmQuotation(row.id)}
                          disabled={isConfirmed || updatingQuotationId === row.id}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          {isConfirmed ? "Confirmed" : "Confirm"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRevisionQuotationId(row.id);
                            setShowRevisionForm(true);
                          }}
                          disabled={updatingQuotationId === row.id}
                        >
                          {isRevised ? "Revise Again" : "Revise"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
      case "costing":
        return (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Landed Cost</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Track and allocate landed cost against imported items.
            </p>
          </div>
        );
      case "history":
        return (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Import History</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              View historical purchase import transactions and summaries.
            </p>
          </div>
        );
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
