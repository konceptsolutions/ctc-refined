import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { RefreshCw, Search, Plus, Save, ArrowLeftRight, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import apiClient from "@/lib/api";
import { cn } from "@/lib/utils";
import { fcHeaderClass, fcValueClass, lcHeaderClass, lcValueClass } from "@/utils/accountingColors";
import { formatPurchasePrice, formatFc } from "@/utils/purchasePriceRound";
import { formatUiDate } from "@/utils/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ListNumberCell,
  ListNumberHeader,
  LIST_NUMBER_HEAD_CLASS,
} from "@/components/ui/list-table-number";
import { BrandOriginCell } from "@/components/ui/brand-origin-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { usePageActions } from "@/permissions/pageActions";

const priceInputValue = (n: number | undefined | null) =>
  Number.isFinite(Number(n)) ? String(Number(n)) : "";

const parsePriceInput = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const mapApiPartToResult = (p: any): PartResult => ({
  id: String(p.id || ""),
  partNo: String(p.master_part_no || p.masterPart || p.partNo || "").trim() || "N/A",
  masterPart: String(p.part_no || p.masterPartNo || p.partNo || "").trim() || "N/A",
  brand: String(p.brand_name || p.brand?.name || p.brand || "").trim() || "N/A",
  description: String(p.description || "").trim() || "—",
  origin: String(p.origin || "").trim() || "—",
  stock: Number(p.current_stock ?? p.currentStock ?? p.stock ?? p.qty ?? 0),
  priceA: Number(p.price_a ?? p.priceA ?? 0),
  priceB: Number(p.price_b ?? p.priceB ?? 0),
  priceM: Number(p.price_m ?? p.priceM ?? 0),
  cost: Number(p.cost ?? 0),
  reOrderLevel: Number(p.reorder_level ?? p.reOrderLevel ?? 0),
  grade: String(p.grade || "A"),
  application: String(p.application_name || p.application?.name || p.application || ""),
  models: Array.isArray(p.models)
    ? p.models.map((m: any) => ({
        id: String(m.id ?? ""),
        name: String(m.name ?? ""),
        qtyUsed: Number(m.qty_used ?? m.qtyUsed ?? 0),
      }))
    : [],
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface PartResult {
  id: string;
  partNo: string;
  masterPart: string;
  brand: string;
  description: string;
  origin: string;
  stock: number;
  priceA: number;
  priceB: number;
  priceM: number;
  cost: number;
  reOrderLevel: number;
  grade: string;
  application?: string;
  models?: { id: string; name: string; qtyUsed: number }[];
}

interface LocationQty {
  po: number;
  co: number;
  bo: number;
}

interface InquiryData {
  isb: LocationQty;
  khi: LocationQty;
  poRecords: PoRecord[];
  quotationRecords: QuotationRecord[];
}

interface PoRecord {
  id: string;
  type: "Import" | "PO" | "DPO";
  poNo: string;
  date: string;
  status: string;
  currency?: string;
  consignee?: string;
  supplier?: string;
  qty: number;
  receivedQty?: number;
  backQty?: number;
  unitCost?: number;
  fcRate?: number;
}

interface QuotationRecord {
  id: string;
  quotationId: string;
  quotationNo: string;
  date: string;
  confirmationDate?: string;
  status: string;
  currency?: string;
  requestNo?: string;
  consignee?: string;
  supplier?: string;
  demandQty: number;
  quotationQty: number;
  fcRate?: number;
  lcRate?: number;
}

interface ModelAssociationItem {
  partId: string;
  masterPart: string;
  partNo: string;
  description: string;
  brand: string;
  origin?: string;
  application?: string;
  model: string;
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | undefined | null, digits = 2) =>
  Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";

const fmtQty = (n: number | undefined | null) =>
  Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "—";

/** Always show Part No | Master Part (mapped fields: partNo=master_part_no, masterPart=part_no). */
const fmtPartNos = (item: Pick<PartResult, "partNo" | "masterPart">) => {
  const partNo = String(item.partNo || "").trim() || "N/A";
  const masterPart = String(item.masterPart || "").trim() || "N/A";
  return partNo !== masterPart ? `${partNo} | ${masterPart}` : partNo;
};

const statusBadge = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "received" || s === "confirm" || s === "confirmed")
    return <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">{status}</Badge>;
  if (s === "draft" || s === "pending")
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{status}</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const PurchaseInquiry = ({
  initialPartId,
}: {
  initialPartId?: string;
} = {}) => {
  const { canCreate, canEdit, canDelete } = usePageActions(
    "inventory.purchase-inquiry",
  );
  // Multi-item list + active row
  const [items, setItems] = useState<PartResult[]>([]);
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const selectedPart = useMemo(
    () => items.find((p) => p.id === activePartId) || null,
    [items, activePartId],
  );

  // Part search (adds another item)
  const [partSearch, setPartSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PartResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Inquiry data cached per part (PO/CO/BO + purchase/quotation records)
  const [inquiryByPartId, setInquiryByPartId] = useState<Record<string, InquiryData>>({});
  const [loadingInquiryPartId, setLoadingInquiryPartId] = useState<string | null>(null);
  const inquiryData = activePartId ? inquiryByPartId[activePartId] || null : null;
  const loadingInquiry = loadingInquiryPartId === activePartId;

  // Part association (for active part)
  const [selectedModelName, setSelectedModelName] = useState("");
  const [modelAssociations, setModelAssociations] = useState<ModelAssociationItem[]>([]);
  const [loadingModelAssociations, setLoadingModelAssociations] = useState(false);
  const [associationDescriptionFilter, setAssociationDescriptionFilter] = useState("");
  const [associationApplicationFilter, setAssociationApplicationFilter] = useState("");

  // Alternate items (for active part)
  const [alternateItems, setAlternateItems] = useState<PartResult[]>([]);
  const [loadingAlternateItems, setLoadingAlternateItems] = useState(false);

  // Sales history (for active part)
  type SalesPeriodMonths = 3 | 6 | 9 | 12;
  const [salesPeriodMonths, setSalesPeriodMonths] = useState<SalesPeriodMonths>(3);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [salesDetailsExpanded, setSalesDetailsExpanded] = useState(true);

  // Editable Price A / B + O.Lvl (active part)
  const [editPriceA, setEditPriceA] = useState("");
  const [editPriceB, setEditPriceB] = useState("");
  const [editReorderLevel, setEditReorderLevel] = useState("");
  const [priceBaseline, setPriceBaseline] = useState<{
    priceA: number;
    priceB: number;
    reOrderLevel: number;
  } | null>(null);
  const [savingPrices, setSavingPrices] = useState(false);

  // Editable Price A / B + O.Lvl (alternate parts)
  type AltPriceDraft = { priceA: string; priceB: string; reOrderLevel: string };
  type AltPriceBaseline = { priceA: number; priceB: number; reOrderLevel: number };
  const [altEdits, setAltEdits] = useState<Record<string, AltPriceDraft>>({});
  const [altBaselines, setAltBaselines] = useState<Record<string, AltPriceBaseline>>({});
  const [savingAltPrices, setSavingAltPrices] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncEditableFields = useCallback(
    (part: Pick<PartResult, "priceA" | "priceB" | "reOrderLevel">) => {
      const a = Number(part.priceA) || 0;
      const b = Number(part.priceB) || 0;
      const lvl = Math.max(0, Math.floor(Number(part.reOrderLevel) || 0));
      setEditPriceA(priceInputValue(a));
      setEditPriceB(priceInputValue(b));
      setEditReorderLevel(String(lvl));
      setPriceBaseline({ priceA: a, priceB: b, reOrderLevel: lvl });
    },
    [],
  );

  const pricesDirty =
    !!selectedPart &&
    !!priceBaseline &&
    ((parsePriceInput(editPriceA) ?? priceBaseline.priceA) !== priceBaseline.priceA ||
      (parsePriceInput(editPriceB) ?? priceBaseline.priceB) !== priceBaseline.priceB ||
      (parsePriceInput(editReorderLevel) ?? priceBaseline.reOrderLevel) !==
        priceBaseline.reOrderLevel);

  const upsertItem = useCallback((part: PartResult) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === part.id);
      if (idx === -1) return [...prev, part];
      const next = [...prev];
      next[idx] = { ...next[idx], ...part };
      return next;
    });
  }, []);

  const loadInquiryForPart = useCallback(async (partId: string) => {
    if (!partId) return;
    setLoadingInquiryPartId(partId);
    try {
      const resp = await (apiClient as any).getPurchaseInquiryByPart(partId);
      const d = resp?.data || resp;
      const data: InquiryData = {
        isb: {
          po: Number(d?.isb?.po ?? 0),
          co: Number(d?.isb?.co ?? 0),
          bo: Number(d?.isb?.bo ?? 0),
        },
        khi: {
          po: Number(d?.khi?.po ?? 0),
          co: Number(d?.khi?.co ?? 0),
          bo: Number(d?.khi?.bo ?? 0),
        },
        poRecords: Array.isArray(d?.poRecords) ? d.poRecords : [],
        quotationRecords: Array.isArray(d?.quotationRecords) ? d.quotationRecords : [],
      };
      setInquiryByPartId((prev) => ({ ...prev, [partId]: data }));
    } catch {
      setInquiryByPartId((prev) => ({
        ...prev,
        [partId]: {
          isb: { po: 0, co: 0, bo: 0 },
          khi: { po: 0, co: 0, bo: 0 },
          poRecords: [],
          quotationRecords: [],
        },
      }));
    } finally {
      setLoadingInquiryPartId((cur) => (cur === partId ? null : cur));
    }
  }, []);

  const handleSavePrices = useCallback(async () => {
    if (!selectedPart?.id || !priceBaseline) return;

    const nextA = parsePriceInput(editPriceA);
    const nextB = parsePriceInput(editPriceB);
    const nextLvlRaw = parsePriceInput(editReorderLevel);
    if (nextA === null || nextB === null || nextLvlRaw === null) {
      toast({
        title: "Invalid value",
        description: "Enter valid non-negative numbers for Price A, Price B, and O.Lvl.",
        variant: "destructive",
      });
      return;
    }
    const nextLvl = Math.max(0, Math.floor(nextLvlRaw));

    const aChanged = nextA !== priceBaseline.priceA;
    const bChanged = nextB !== priceBaseline.priceB;
    const lvlChanged = nextLvl !== priceBaseline.reOrderLevel;
    if (!aChanged && !bChanged && !lvlChanged) return;

    setSavingPrices(true);
    try {
      if (aChanged || bChanged) {
        const pricePayload: { priceA?: number; priceB?: number } = {};
        if (aChanged) pricePayload.priceA = nextA;
        if (bChanged) pricePayload.priceB = nextB;
        const response = (await apiClient.updatePartPrices(selectedPart.id, pricePayload)) as {
          error?: string;
        };
        if (response?.error) {
          toast({
            title: "Failed to update price",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
      }

      if (lvlChanged) {
        const response = (await apiClient.updatePart(selectedPart.id, {
          reorder_level: nextLvl,
        })) as { error?: string };
        if (response?.error) {
          toast({
            title: "Failed to update O.Lvl",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
      }

      upsertItem({
        ...selectedPart,
        priceA: nextA,
        priceB: nextB,
        reOrderLevel: nextLvl,
      });
      setAlternateItems((prev) =>
        prev.map((p) =>
          p.id === selectedPart.id
            ? { ...p, priceA: nextA, priceB: nextB, reOrderLevel: nextLvl }
            : p,
        ),
      );
      setSearchResults((prev) =>
        prev.map((p) =>
          p.id === selectedPart.id
            ? { ...p, priceA: nextA, priceB: nextB, reOrderLevel: nextLvl }
            : p,
        ),
      );
      setPriceBaseline({ priceA: nextA, priceB: nextB, reOrderLevel: nextLvl });
      setEditPriceA(priceInputValue(nextA));
      setEditPriceB(priceInputValue(nextB));
      setEditReorderLevel(String(nextLvl));
      toast({
        title: "Updated",
        description: [
          aChanged || bChanged ? "Price A / B" : null,
          lvlChanged ? "O.Lvl (reorder level)" : null,
        ]
          .filter(Boolean)
          .join(" and ") + " saved.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to update",
        description: error?.message || String(error),
        variant: "destructive",
      });
    } finally {
      setSavingPrices(false);
    }
  }, [
    selectedPart,
    priceBaseline,
    editPriceA,
    editPriceB,
    editReorderLevel,
    upsertItem,
  ]);

  const altPricesDirty = useMemo(() => {
    return alternateItems.some((item) => {
      if (!item.id) return false;
      const draft = altEdits[item.id];
      const base = altBaselines[item.id];
      if (!draft || !base) return false;
      return (
        (parsePriceInput(draft.priceA) ?? base.priceA) !== base.priceA ||
        (parsePriceInput(draft.priceB) ?? base.priceB) !== base.priceB ||
        (parsePriceInput(draft.reOrderLevel) ?? base.reOrderLevel) !== base.reOrderLevel
      );
    });
  }, [alternateItems, altEdits, altBaselines]);

  const setAltEditField = useCallback(
    (partId: string, field: keyof AltPriceDraft, value: string) => {
      setAltEdits((prev) => ({
        ...prev,
        [partId]: {
          priceA: prev[partId]?.priceA ?? "",
          priceB: prev[partId]?.priceB ?? "",
          reOrderLevel: prev[partId]?.reOrderLevel ?? "",
          [field]: value,
        },
      }));
    },
    [],
  );

  const applyAlternatePriceUpdates = useCallback(
    (
      updates: Array<{
        id: string;
        priceA: number;
        priceB: number;
        reOrderLevel: number;
        item: PartResult;
      }>,
    ) => {
      if (updates.length === 0) return;
      const byId = new Map(updates.map((u) => [u.id, u]));
      setAlternateItems((prev) =>
        prev.map((p) => {
          const u = byId.get(p.id);
          return u
            ? { ...p, priceA: u.priceA, priceB: u.priceB, reOrderLevel: u.reOrderLevel }
            : p;
        }),
      );
      for (const u of updates) {
        upsertItem({
          ...u.item,
          priceA: u.priceA,
          priceB: u.priceB,
          reOrderLevel: u.reOrderLevel,
        });
      }
      setAltBaselines((prev) => {
        const next = { ...prev };
        for (const u of updates) {
          next[u.id] = {
            priceA: u.priceA,
            priceB: u.priceB,
            reOrderLevel: u.reOrderLevel,
          };
        }
        return next;
      });
      setAltEdits((prev) => {
        const next = { ...prev };
        for (const u of updates) {
          next[u.id] = {
            priceA: priceInputValue(u.priceA),
            priceB: priceInputValue(u.priceB),
            reOrderLevel: String(u.reOrderLevel),
          };
        }
        return next;
      });
      const activeUpdate = selectedPart?.id ? byId.get(selectedPart.id) : undefined;
      if (activeUpdate) {
        setPriceBaseline({
          priceA: activeUpdate.priceA,
          priceB: activeUpdate.priceB,
          reOrderLevel: activeUpdate.reOrderLevel,
        });
        setEditPriceA(priceInputValue(activeUpdate.priceA));
        setEditPriceB(priceInputValue(activeUpdate.priceB));
        setEditReorderLevel(String(activeUpdate.reOrderLevel));
      }
    },
    [upsertItem, selectedPart?.id],
  );

  const handleSaveAlternatePrices = useCallback(async () => {
    const dirtyRows = alternateItems.filter((item) => {
      if (!item.id) return false;
      const draft = altEdits[item.id];
      const base = altBaselines[item.id];
      if (!draft || !base) return false;
      const nextA = parsePriceInput(draft.priceA);
      const nextB = parsePriceInput(draft.priceB);
      const nextLvlRaw = parsePriceInput(draft.reOrderLevel);
      if (nextA === null || nextB === null || nextLvlRaw === null) return true;
      const nextLvl = Math.max(0, Math.floor(nextLvlRaw));
      return (
        nextA !== base.priceA || nextB !== base.priceB || nextLvl !== base.reOrderLevel
      );
    });
    if (dirtyRows.length === 0) return;

    for (const item of dirtyRows) {
      const draft = altEdits[item.id];
      const nextA = parsePriceInput(draft.priceA);
      const nextB = parsePriceInput(draft.priceB);
      const nextLvlRaw = parsePriceInput(draft.reOrderLevel);
      if (nextA === null || nextB === null || nextLvlRaw === null) {
        toast({
          title: "Invalid value",
          description: `Enter valid non-negative numbers for ${item.partNo || "alternate"} (Price A, Price B, O.Lvl).`,
          variant: "destructive",
        });
        return;
      }
    }

    setSavingAltPrices(true);
    const savedUpdates: Array<{
      id: string;
      priceA: number;
      priceB: number;
      reOrderLevel: number;
      item: PartResult;
    }> = [];
    try {
      for (const item of dirtyRows) {
        const draft = altEdits[item.id];
        const base = altBaselines[item.id];
        const nextA = parsePriceInput(draft.priceA)!;
        const nextB = parsePriceInput(draft.priceB)!;
        const nextLvl = Math.max(0, Math.floor(parsePriceInput(draft.reOrderLevel)!));
        const aChanged = nextA !== base.priceA;
        const bChanged = nextB !== base.priceB;
        const lvlChanged = nextLvl !== base.reOrderLevel;

        if (aChanged || bChanged) {
          const pricePayload: { priceA?: number; priceB?: number } = {};
          if (aChanged) pricePayload.priceA = nextA;
          if (bChanged) pricePayload.priceB = nextB;
          const response = (await apiClient.updatePartPrices(item.id, pricePayload)) as {
            error?: string;
          };
          if (response?.error) {
            toast({
              title: "Failed to update price",
              description: `${item.partNo || item.id}: ${response.error}`,
              variant: "destructive",
            });
            // Apply any rows already saved before this failure
            if (savedUpdates.length > 0) {
              applyAlternatePriceUpdates(savedUpdates);
            }
            return;
          }
        }

        if (lvlChanged) {
          const response = (await apiClient.updatePart(item.id, {
            reorder_level: nextLvl,
          })) as { error?: string };
          if (response?.error) {
            toast({
              title: "Failed to update O.Lvl",
              description: `${item.partNo || item.id}: ${response.error}`,
              variant: "destructive",
            });
            if (savedUpdates.length > 0) {
              applyAlternatePriceUpdates(savedUpdates);
            }
            return;
          }
        }

        savedUpdates.push({
          id: item.id,
          priceA: nextA,
          priceB: nextB,
          reOrderLevel: nextLvl,
          item,
        });
      }

      applyAlternatePriceUpdates(savedUpdates);
      toast({
        title: "Updated",
        description:
          savedUpdates.length === 1
            ? "Alternate Price A / B / O.Lvl saved."
            : `${savedUpdates.length} alternate parts updated.`,
      });
    } catch (error: any) {
      if (savedUpdates.length > 0) {
        applyAlternatePriceUpdates(savedUpdates);
      }
      toast({
        title: "Failed to update alternates",
        description: error?.message || String(error),
        variant: "destructive",
      });
    } finally {
      setSavingAltPrices(false);
    }
  }, [
    alternateItems,
    altEdits,
    altBaselines,
    applyAlternatePriceUpdates,
  ]);

  // ── Part search ──────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setLoadingSearch(true);
    try {
      const resp = await (apiClient as any).getParts({ search: query, limit: 30, page: 1, status: "active" });
      const raw: any[] = Array.isArray(resp) ? resp : (resp?.data || []);
      const results: PartResult[] = raw.map(mapApiPartToResult);
      setSearchResults(results);
      setShowDropdown(results.length > 0);
    } catch {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(partSearch), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [partSearch, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Part association ─────────────────────────────────────────────────────────

  const handleModelClick = useCallback(async (modelName: string) => {
    if (!modelName) return;
    setSelectedModelName(modelName);
    setLoadingModelAssociations(true);
    try {
      const resp = await (apiClient as any).getPartsByModelAssociation(modelName);
      const raw: any[] = Array.isArray(resp) ? resp : (resp?.data || []);
      const mapped: ModelAssociationItem[] = raw.map((item: any) => ({
        partId: String(item.part_id || item.partId || ""),
        masterPart: String(item.master_part_no || item.masterPart || ""),
        partNo: String(item.part_no || item.partNo || ""),
        description: String(item.description || ""),
        brand: String(item.brand_name || item.brand || ""),
        origin: String(item.origin || "").trim() || undefined,
        application: String(item.application_name || item.application || ""),
        model: String(item.model_name || item.model || modelName),
        quantity: Number(item.quantity ?? item.qty_used ?? 0),
      }));
      setModelAssociations(mapped);
    } catch {
      setModelAssociations([]);
    } finally {
      setLoadingModelAssociations(false);
    }
  }, []);

  const activatePart = useCallback(
    async (part: PartResult, opts?: { resetAssociationFilters?: boolean }) => {
      setActivePartId(part.id);
      syncEditableFields(part);
      setModelAssociations([]);
      setSelectedModelName("");
      if (opts?.resetAssociationFilters !== false) {
        setAssociationDescriptionFilter("");
        setAssociationApplicationFilter(String(part.application || "").trim());
      }

      // Enrich models / prices / reorder level if needed
      try {
        const resp = await (apiClient as any).getPart(part.id);
        const data = resp?.data || resp;
        if (data) {
          const nextFields = {
            priceA: Number(data.price_a ?? data.priceA ?? part.priceA ?? 0),
            priceB: Number(data.price_b ?? data.priceB ?? part.priceB ?? 0),
            reOrderLevel: Number(
              data.reorder_level ?? data.reorderLevel ?? data.reOrderLevel ?? part.reOrderLevel ?? 0,
            ),
          };
          const nextApplication = String(
            data.application_name || data.application?.name || data.application || part.application || "",
          ).trim();
          const nextModels = Array.isArray(data.models)
            ? data.models.map((m: any) => ({
                id: String(m.id ?? ""),
                name: String(m.name ?? ""),
                qtyUsed: Number(m.qty_used ?? m.qtyUsed ?? 0),
              }))
            : Array.isArray(part.models)
              ? part.models
              : [];
          const enriched: PartResult = {
            ...part,
            ...nextFields,
            application: nextApplication || part.application,
            models: nextModels.length > 0 ? nextModels : part.models,
          };
          upsertItem(enriched);
          syncEditableFields(nextFields);
          if (nextApplication) setAssociationApplicationFilter(nextApplication);

          const firstModel = nextModels.find((m) => String(m.name || "").trim());
          if (firstModel?.name) await handleModelClick(firstModel.name);
        } else if (Array.isArray(part.models) && part.models.length > 0) {
          const firstModel = part.models.find((m) => String(m.name || "").trim());
          if (firstModel?.name) await handleModelClick(firstModel.name);
        }
      } catch {
        const firstModel = part.models?.find((m) => String(m.name || "").trim());
        if (firstModel?.name) await handleModelClick(firstModel.name);
      }

      void loadInquiryForPart(part.id);
    },
    [syncEditableFields, handleModelClick, upsertItem, loadInquiryForPart],
  );

  const handleSelectPart = useCallback(
    async (part: PartResult) => {
      if (!part?.id) return;
      upsertItem(part);
      setPartSearch("");
      setShowDropdown(false);
      setSearchResults([]);
      await activatePart(part);
    },
    [upsertItem, activatePart],
  );

  // Prefill from parent (e.g. Import Inquiry item popup)
  const loadedInitialPartRef = useRef<string | null>(null);
  useEffect(() => {
    const partId = String(initialPartId || "").trim();
    if (!partId || loadedInitialPartRef.current === partId) return;
    loadedInitialPartRef.current = partId;
    let cancelled = false;
    void (async () => {
      try {
        const resp = await (apiClient as any).getPart(partId);
        if (cancelled) return;
        const data = resp?.data || resp;
        const part = mapApiPartToResult({ ...data, id: data?.id || partId });
        if (!part.id) return;
        await handleSelectPart(part);
      } catch {
        if (!cancelled) {
          toast({
            title: "Failed to load part",
            description: "Could not open the selected item in Purchase Inquiry.",
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPartId, handleSelectPart]);

  const handleActivateRow = useCallback(
    (part: PartResult) => {
      if (!part?.id || part.id === activePartId) return;
      void activatePart(part);
    },
    [activePartId, activatePart],
  );

  const handleAddItem = useCallback(() => {
    setPartSearch("");
    setSearchResults([]);
    setShowDropdown(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const handleRemoveItem = useCallback(
    (partId: string) => {
      const remaining = items.filter((p) => p.id !== partId);
      setItems(remaining);
      setInquiryByPartId((prev) => {
        const next = { ...prev };
        delete next[partId];
        return next;
      });
      if (activePartId !== partId) return;
      const fallback = remaining[0] || null;
      if (fallback) {
        void activatePart(fallback);
      } else {
        setActivePartId(null);
        setModelAssociations([]);
        setSelectedModelName("");
        setAssociationDescriptionFilter("");
        setAssociationApplicationFilter("");
        setAlternateItems([]);
            setEditPriceA("");
            setEditPriceB("");
            setEditReorderLevel("");
            setPriceBaseline(null);
      }
    },
    [items, activePartId, activatePart],
  );

  // Load inquiry data when active part changes (if not cached)
  useEffect(() => {
    if (!activePartId) return;
    if (inquiryByPartId[activePartId]) return;
    void loadInquiryForPart(activePartId);
  }, [activePartId, inquiryByPartId, loadInquiryForPart]);

  // ── Alternate items (match Part No / Master Part, same as Sales Inquiry) ─────

  useEffect(() => {
    const loadAlternateItems = async () => {
      if (!selectedPart) {
        setAlternateItems([]);
        setLoadingAlternateItems(false);
        return;
      }

      const selectedPartNo = String(selectedPart.partNo || "").trim();
      const selectedMasterPart = String(selectedPart.masterPart || "").trim();
      if (!selectedPartNo && !selectedMasterPart) {
        setAlternateItems([]);
        setLoadingAlternateItems(false);
        return;
      }

      setLoadingAlternateItems(true);
      try {
        const requests: Promise<any>[] = [];
        if (selectedPartNo && selectedPartNo !== "N/A") {
          requests.push((apiClient as any).getParts({ part_no: selectedPartNo, limit: 10000, page: 1 }));
          requests.push((apiClient as any).getParts({ master_part_no: selectedPartNo, limit: 10000, page: 1 }));
        }
        if (
          selectedMasterPart &&
          selectedMasterPart !== "N/A" &&
          selectedMasterPart.toLowerCase() !== selectedPartNo.toLowerCase()
        ) {
          requests.push((apiClient as any).getParts({ part_no: selectedMasterPart, limit: 10000, page: 1 }));
          requests.push((apiClient as any).getParts({ master_part_no: selectedMasterPart, limit: 10000, page: 1 }));
        }

        const responses = await Promise.all(requests);
        const rawParts = responses.flatMap((res) => {
          if (Array.isArray(res)) return res;
          if (Array.isArray((res as any)?.data)) return (res as any).data;
          return [];
        });

        const dedup = new Map<string, PartResult>();
        rawParts.forEach((row: any) => {
          const transformed = mapApiPartToResult(row);
          const key = String(
            transformed.id ||
              `${transformed.partNo}|${transformed.masterPart}|${transformed.brand}|${transformed.description}`,
          );
          dedup.set(key, transformed);
        });

        const normalizedPartNo = selectedPartNo.toLowerCase();
        const normalizedMaster = selectedMasterPart.toLowerCase();
        const selectedDescription = String(selectedPart.description || "").trim().toLowerCase();
        const selectedBrand = String(selectedPart.brand || "").trim().toLowerCase();

        const matched = Array.from(dedup.values()).filter((p) => {
          const partNo = String(p.partNo || "").trim().toLowerCase();
          const masterPart = String(p.masterPart || "").trim().toLowerCase();
          const description = String(p.description || "").trim().toLowerCase();
          const brand = String(p.brand || "").trim().toLowerCase();
          const isSelectedRecord =
            (selectedPart.id && p.id && p.id === selectedPart.id) ||
            (!selectedPart.id &&
              partNo === normalizedPartNo &&
              masterPart === normalizedMaster &&
              description === selectedDescription &&
              brand === selectedBrand);
          if (isSelectedRecord) return false;
          return (
            (normalizedPartNo &&
              normalizedPartNo !== "n/a" &&
              (partNo === normalizedPartNo || masterPart === normalizedPartNo)) ||
            (normalizedMaster &&
              normalizedMaster !== "n/a" &&
              (partNo === normalizedMaster || masterPart === normalizedMaster))
          );
        });

        setAlternateItems(matched);
      } catch {
        setAlternateItems([]);
      } finally {
        setLoadingAlternateItems(false);
      }
    };

    void loadAlternateItems();
  }, [selectedPart?.id, selectedPart?.partNo, selectedPart?.masterPart]);

  // Load PO/CO/BO inquiry qty for alternate parts (same details as main item row)
  useEffect(() => {
    for (const item of alternateItems) {
      if (!item.id) continue;
      if (inquiryByPartId[item.id]) continue;
      void loadInquiryForPart(item.id);
    }
  }, [alternateItems, inquiryByPartId, loadInquiryForPart]);

  // Sync editable drafts when the alternate list membership changes (not on price saves)
  const alternateIdsKey = useMemo(
    () => alternateItems.map((i) => i.id).filter(Boolean).join("|"),
    [alternateItems],
  );

  useEffect(() => {
    const nextEdits: Record<string, AltPriceDraft> = {};
    const nextBaselines: Record<string, AltPriceBaseline> = {};
    for (const item of alternateItems) {
      if (!item.id) continue;
      const a = Number(item.priceA) || 0;
      const b = Number(item.priceB) || 0;
      const lvl = Math.max(0, Math.floor(Number(item.reOrderLevel) || 0));
      nextEdits[item.id] = {
        priceA: priceInputValue(a),
        priceB: priceInputValue(b),
        reOrderLevel: String(lvl),
      };
      nextBaselines[item.id] = { priceA: a, priceB: b, reOrderLevel: lvl };
    }
    setAltEdits(nextEdits);
    setAltBaselines(nextBaselines);
    // Only re-init when which alternates are shown changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alternateIdsKey]);

  // ── Sales history for active part ────────────────────────────────────────────

  useEffect(() => {
    const loadSalesHistory = async () => {
      if (!selectedPart?.id) {
        setSalesHistory([]);
        setLoadingSalesHistory(false);
        return;
      }
      setLoadingSalesHistory(true);
      try {
        const response = await apiClient.getSalesInvoicesByPart(selectedPart.id, {
          page: 1,
          limit: 200,
          months: salesPeriodMonths,
        });
        if ((response as any)?.error) {
          setSalesHistory([]);
          return;
        }
        const rows = Array.isArray(response)
          ? response
          : Array.isArray((response as any)?.data)
            ? (response as any).data
            : [];
        setSalesHistory(rows);
      } catch {
        setSalesHistory([]);
      } finally {
        setLoadingSalesHistory(false);
      }
    };

    void loadSalesHistory();
  }, [selectedPart?.id, salesPeriodMonths]);

  const handleSelectAlternate = useCallback(
    (item: PartResult) => {
      if (!item?.id) return;
      setItems((prev) => {
        const withoutAlternateDup = prev.filter((p) => p.id !== item.id);
        if (!activePartId) return [...withoutAlternateDup, item];
        const replaced = withoutAlternateDup.map((p) =>
          p.id === activePartId ? item : p,
        );
        // If active wasn't in list somehow, just append
        if (!withoutAlternateDup.some((p) => p.id === activePartId)) {
          return [...withoutAlternateDup, item];
        }
        return replaced;
      });
      void activatePart(item);
      toast({
        title: "Switched part",
        description: `Now viewing ${item.partNo || item.masterPart}.`,
      });
    },
    [activePartId, activatePart],
  );

  const associationDescriptionOptions = useMemo(() => {
    const app = associationApplicationFilter.trim().toLowerCase();
    const set = new Set<string>();
    for (const item of modelAssociations) {
      if (app && String(item.application || "").toLowerCase() !== app) continue;
      const desc = String(item.description || "").trim();
      if (desc && desc !== "N/A") set.add(desc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [modelAssociations, associationApplicationFilter]);

  const associationApplicationOptions = useMemo(() => {
    const desc = associationDescriptionFilter.trim().toLowerCase();
    const set = new Set<string>();
    for (const item of modelAssociations) {
      if (desc && String(item.description || "").toLowerCase() !== desc) continue;
      const app = String(item.application || "").trim();
      if (app && app !== "N/A") set.add(app);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [modelAssociations, associationDescriptionFilter]);

  const associationDescriptionFilterOptions = useMemo<SearchableSelectOption[]>(
    () => {
      const options: SearchableSelectOption[] = [
        { value: "__all__", label: "Description" },
        ...associationDescriptionOptions.map((name) => ({
          value: name,
          label: name,
        })),
      ];
      if (
        associationDescriptionFilter &&
        !associationDescriptionOptions.some(
          (n) => n === associationDescriptionFilter,
        )
      ) {
        options.push({
          value: associationDescriptionFilter,
          label: associationDescriptionFilter,
        });
      }
      return options;
    },
    [associationDescriptionOptions, associationDescriptionFilter],
  );

  const associationApplicationFilterOptions = useMemo<SearchableSelectOption[]>(
    () => {
      const options: SearchableSelectOption[] = [
        { value: "__all__", label: "Application" },
        ...associationApplicationOptions.map((name) => ({
          value: name,
          label: name,
        })),
      ];
      if (
        associationApplicationFilter &&
        !associationApplicationOptions.some(
          (n) => n === associationApplicationFilter,
        )
      ) {
        options.push({
          value: associationApplicationFilter,
          label: associationApplicationFilter,
        });
      }
      return options;
    },
    [associationApplicationOptions, associationApplicationFilter],
  );

  const filteredModelAssociations = useMemo(() => {
    const desc = associationDescriptionFilter.trim().toLowerCase();
    const app = associationApplicationFilter.trim().toLowerCase();
    return modelAssociations.filter((item) => {
      if (desc && String(item.description || "").toLowerCase() !== desc) return false;
      if (app && String(item.application || "").toLowerCase() !== app) return false;
      return true;
    });
  }, [modelAssociations, associationDescriptionFilter, associationApplicationFilter]);

  const handleAddAssociationToList = useCallback(
    async (item: ModelAssociationItem) => {
      if (!item.partId) return;
      try {
        const resp = await (apiClient as any).getPart(item.partId);
        const data = resp?.data || resp;
        const part = data ? mapApiPartToResult(data) : null;
        if (part?.id) {
          await handleSelectPart(part);
          return;
        }
      } catch {
        // fall through to search
      }
      setPartSearch(item.partNo || item.masterPart);
      setShowDropdown(true);
      doSearch(item.partNo || item.masterPart);
    },
    [handleSelectPart, doSearch],
  );

  const renderQtyCell = (value: number | undefined, loading?: boolean) =>
    loading ? (
      <RefreshCw className="w-3 h-3 animate-spin mx-auto text-primary" />
    ) : (
      fmtQty(value)
    );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Purchase Inquiry</CardTitle>
            {canCreate && (
              <Button type="button" size="sm" className="h-8 gap-1.5" onClick={handleAddItem}>
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Part Search */}
          <div ref={searchRef} className="relative max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search part to add by Part No, Description, Brand…"
                className="pl-9 h-10"
                value={partSearch}
                onChange={(e) => {
                  setPartSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
              />
              {loadingSearch && (
                <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
              )}
            </div>

            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto bg-background border rounded-md shadow-lg">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b last:border-0"
                    onMouseDown={() => void handleSelectPart(p)}
                  >
                    <div className="text-xs font-semibold">{p.partNo}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.description} &bull; <span className="font-medium">{p.brand}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Parts Family Group Table (multi-item) */}
          {items.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="text-xs font-semibold text-muted-foreground">
                  Parts Family Group
                  <span className="ml-2 font-normal text-muted-foreground/80">
                    Click a row to view Purchase / Quotation / Association
                  </span>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={!pricesDirty || savingPrices || !selectedPart}
                    onClick={() => void handleSavePrices()}
                  >
                    {savingPrices ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Update
                  </Button>
                )}
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className={LIST_NUMBER_HEAD_CLASS} rowSpan={2}>#</TableHead>
                      <TableHead
                        className="text-xs whitespace-nowrap"
                        rowSpan={2}
                        title="Part No | Master Part"
                      >
                        Part No / Master
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Brand</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Origin</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Qty</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Price A</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Price B</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Stock</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Rev</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Cost</TableHead>
                      <TableHead
                        colSpan={3}
                        className="text-xs text-center whitespace-nowrap bg-blue-50 dark:bg-blue-950 border-x"
                      >
                        ISB
                      </TableHead>
                      <TableHead
                        colSpan={3}
                        className="text-xs text-center whitespace-nowrap bg-amber-50 dark:bg-amber-950 border-x"
                      >
                        KHI
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2} title="Reorder level">
                        O.Lvl
                      </TableHead>
                      <TableHead className="text-xs text-center w-10 px-1" rowSpan={2} />
                    </TableRow>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70 border-x">PO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70">CO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70 border-r">BO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70 border-x">PO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70">CO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70 border-r">BO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => {
                      const isActive = item.id === activePartId;
                      const rowInquiry = inquiryByPartId[item.id];
                      const rowLoading = loadingInquiryPartId === item.id && !rowInquiry;
                      return (
                        <TableRow
                          key={item.id}
                          className={cn(
                            "cursor-pointer hover:bg-muted/30",
                            isActive && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                          )}
                          onClick={() => handleActivateRow(item)}
                        >
                          <ListNumberCell index={index} total={items.length} className="text-xs" />
                          <TableCell
                            className="text-xs font-medium whitespace-nowrap"
                            title={fmtPartNos(item)}
                          >
                            {fmtPartNos(item)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <BrandOriginCell brand={item.brand} origin={item.origin} />
                          </TableCell>
                          <TableCell className="text-xs">{item.origin}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmtQty(item.stock)}</TableCell>
                          <TableCell
                            className="text-xs p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isActive) handleActivateRow(item);
                            }}
                          >
                            {isActive && canEdit ? (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPriceA}
                                onChange={(e) => setEditPriceA(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSavePrices();
                                  }
                                }}
                                disabled={savingPrices}
                                className="h-7 w-[88px] px-1.5 text-xs text-right tabular-nums"
                                placeholder="0.00"
                              />
                            ) : (
                              <span className="tabular-nums px-1.5">{fmt(item.priceA)}</span>
                            )}
                          </TableCell>
                          <TableCell
                            className="text-xs p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isActive) handleActivateRow(item);
                            }}
                          >
                            {isActive && canEdit ? (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPriceB}
                                onChange={(e) => setEditPriceB(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSavePrices();
                                  }
                                }}
                                disabled={savingPrices}
                                className="h-7 w-[88px] px-1.5 text-xs text-right tabular-nums"
                                placeholder="0.00"
                              />
                            ) : (
                              <span className="tabular-nums px-1.5">{fmt(item.priceB)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">{fmtQty(item.stock)}</TableCell>
                          <TableCell className="text-xs">{item.grade}</TableCell>
                          <TableCell className="text-xs tabular-nums">{formatPurchasePrice(item.cost)}</TableCell>
                          <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30 border-x">
                            {renderQtyCell(rowInquiry?.isb.po, rowLoading)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30">
                            {renderQtyCell(rowInquiry?.isb.co, rowLoading)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30 border-r">
                            {renderQtyCell(rowInquiry?.isb.bo, rowLoading)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30 border-x">
                            {renderQtyCell(rowInquiry?.khi.po, rowLoading)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30">
                            {renderQtyCell(rowInquiry?.khi.co, rowLoading)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30 border-r">
                            {renderQtyCell(rowInquiry?.khi.bo, rowLoading)}
                          </TableCell>
                          <TableCell
                            className="text-xs p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isActive) handleActivateRow(item);
                            }}
                          >
                            {isActive && canEdit ? (
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={editReorderLevel}
                                onChange={(e) => setEditReorderLevel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSavePrices();
                                  }
                                }}
                                disabled={savingPrices}
                                className="h-7 w-[72px] px-1.5 text-xs text-right tabular-nums"
                                placeholder="0"
                                title="Reorder level"
                              />
                            ) : (
                              <span className="tabular-nums px-1.5">{fmtQty(item.reOrderLevel)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-center px-1" onClick={(e) => e.stopPropagation()}>
                            {canDelete && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                title="Remove item"
                                onClick={() => handleRemoveItem(item.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* PO / CO / BO Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                <span><span className="font-semibold text-foreground">PO</span> = Open shipment / direct PO qty (clears when received)</span>
                <span><span className="font-semibold text-foreground">CO</span> = PO saved stage qty (before invoice)</span>
                <span><span className="font-semibold text-foreground">BO</span> = Back order qty</span>
                <span className="text-foreground/70">Split by ISB and KHI consignee</span>
                <span className="text-foreground/70">Edit Price A / B / O.Lvl on the active row, then Update</span>
              </div>
            </div>
          )}

          {/* Alternate Items — same detail columns as selected item row */}
          {selectedPart && (
            <div className="rounded-md border bg-card p-3 flex flex-col min-h-[160px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Alternate Items</div>
                  <div className="text-xs text-muted-foreground">
                    Edit Price A / B / O.Lvl, then Update — same as the selected item
                  </div>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={!altPricesDirty || savingAltPrices || alternateItems.length === 0}
                    onClick={() => void handleSaveAlternatePrices()}
                  >
                    {savingAltPrices ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Update
                  </Button>
                )}
              </div>
              <div className="rounded-md border overflow-x-auto flex-1 min-h-0 max-h-[360px]">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <ListNumberHeader className="text-xs px-2" rowSpan={2} />
                      <TableHead
                        className="text-xs whitespace-nowrap px-2"
                        rowSpan={2}
                        title="Part No | Master Part"
                      >
                        Part No / Master
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Description
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Brand
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Price A
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Price B
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Stock
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Rev
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap px-2" rowSpan={2}>
                        Cost
                      </TableHead>
                      <TableHead
                        colSpan={3}
                        className="text-xs text-center whitespace-nowrap bg-blue-50 dark:bg-blue-950 border-x"
                      >
                        ISB
                      </TableHead>
                      <TableHead
                        colSpan={3}
                        className="text-xs text-center whitespace-nowrap bg-amber-50 dark:bg-amber-950 border-x"
                      >
                        KHI
                      </TableHead>
                      <TableHead
                        className="text-xs whitespace-nowrap px-2"
                        rowSpan={2}
                        title="Reorder level"
                      >
                        O.Lvl
                      </TableHead>
                      <TableHead className="text-xs text-center w-14 px-2" rowSpan={2}>
                        Action
                      </TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70 border-x">
                        PO
                      </TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70">
                        CO
                      </TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70 border-r">
                        BO
                      </TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70 border-x">
                        PO
                      </TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70">
                        CO
                      </TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70 border-r">
                        BO
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAlternateItems ? (
                      <TableRow>
                        <TableCell
                          colSpan={16}
                          className="text-center py-8 text-sm text-muted-foreground"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                            Loading alternates...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : alternateItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={16}
                          className="text-center py-8 text-sm text-muted-foreground italic"
                        >
                          No alternate items found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      alternateItems.map((item, index) => {
                        const rowInquiry = item.id
                          ? inquiryByPartId[item.id]
                          : undefined;
                        const rowLoading = Boolean(item.id) && !rowInquiry;
                        const draft = item.id ? altEdits[item.id] : undefined;
                        return (
                          <TableRow
                            key={`${item.id || item.partNo}-${index}`}
                            className="hover:bg-muted/20"
                          >
                            <ListNumberCell
                              index={index}
                              total={alternateItems.length}
                              className="text-xs px-2 py-1.5 whitespace-nowrap"
                            />
                            <TableCell
                              className="text-xs font-medium px-2 py-1.5 whitespace-nowrap"
                              title={fmtPartNos(item)}
                            >
                              {fmtPartNos(item)}
                            </TableCell>
                            <TableCell
                              className="text-xs px-2 py-1.5 max-w-[180px] truncate"
                              title={item.description || "N/A"}
                            >
                              {item.description || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5 whitespace-nowrap">
                              <BrandOriginCell brand={item.brand || "N/A"} origin={item.origin} />
                            </TableCell>
                            <TableCell className="text-xs p-1">
                              {item.id && canEdit ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft?.priceA ?? priceInputValue(item.priceA)}
                                  onChange={(e) =>
                                    setAltEditField(item.id, "priceA", e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void handleSaveAlternatePrices();
                                    }
                                  }}
                                  disabled={savingAltPrices}
                                  className="h-7 w-[88px] px-1.5 text-xs text-right tabular-nums"
                                  placeholder="0.00"
                                />
                              ) : (
                                <span className="tabular-nums px-1.5">{fmt(item.priceA)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs p-1">
                              {item.id && canEdit ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft?.priceB ?? priceInputValue(item.priceB)}
                                  onChange={(e) =>
                                    setAltEditField(item.id, "priceB", e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void handleSaveAlternatePrices();
                                    }
                                  }}
                                  disabled={savingAltPrices}
                                  className="h-7 w-[88px] px-1.5 text-xs text-right tabular-nums"
                                  placeholder="0.00"
                                />
                              ) : (
                                <span className="tabular-nums px-1.5">{fmt(item.priceB)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5 tabular-nums text-right font-semibold">
                              {fmtQty(item.stock)}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5 whitespace-nowrap">
                              {item.grade || "—"}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5 tabular-nums text-right">
                              {formatPurchasePrice(item.cost)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30 border-x">
                              {renderQtyCell(rowInquiry?.isb.po, rowLoading)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30">
                              {renderQtyCell(rowInquiry?.isb.co, rowLoading)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30 border-r">
                              {renderQtyCell(rowInquiry?.isb.bo, rowLoading)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30 border-x">
                              {renderQtyCell(rowInquiry?.khi.po, rowLoading)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30">
                              {renderQtyCell(rowInquiry?.khi.co, rowLoading)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30 border-r">
                              {renderQtyCell(rowInquiry?.khi.bo, rowLoading)}
                            </TableCell>
                            <TableCell className="text-xs p-1">
                              {item.id && canEdit ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={
                                    draft?.reOrderLevel ??
                                    String(Math.max(0, Math.floor(Number(item.reOrderLevel) || 0)))
                                  }
                                  onChange={(e) =>
                                    setAltEditField(item.id, "reOrderLevel", e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void handleSaveAlternatePrices();
                                    }
                                  }}
                                  disabled={savingAltPrices}
                                  className="h-7 w-[72px] px-1.5 text-xs text-right tabular-nums"
                                  placeholder="0"
                                  title="Reorder level"
                                />
                              ) : (
                                <span className="tabular-nums px-1.5">
                                  {fmtQty(item.reOrderLevel)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-center px-2 py-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-primary hover:bg-primary/10"
                                onClick={() => handleSelectAlternate(item)}
                                title="Switch to this alternate"
                                disabled={!item.id}
                              >
                                <ArrowLeftRight className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Bottom Section: Part Association + Purchase + Quotation */}
          {selectedPart && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mt-2">

              {/* Part Association – col-span-2 */}
              <div className="xl:col-span-2 rounded-md border bg-card p-3 flex flex-col min-h-[340px]">
                <div className="mb-2">
                  <div className="text-sm font-semibold">Part Association</div>
                  <div className="text-xs text-muted-foreground">
                    Active:{" "}
                    <span className="font-medium text-foreground">
                      {selectedPart.partNo}
                    </span>
                    {" · "}
                    Model:{" "}
                    <span className="font-medium text-foreground">
                      {selectedModelName || "Click a model below"}
                    </span>
                  </div>
                </div>

                {/* Models chips */}
                {selectedPart.models && selectedPart.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedPart.models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleModelClick(m.name)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                          selectedModelName === m.name
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 hover:bg-muted border-border text-foreground"
                        }`}
                      >
                        {m.name}
                        {m.qtyUsed > 0 && (
                          <span className="ml-1 opacity-70">×{m.qtyUsed}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <SearchableSelect
                    options={associationDescriptionFilterOptions}
                    value={associationDescriptionFilter || "__all__"}
                    onValueChange={(value) =>
                      setAssociationDescriptionFilter(
                        value === "__all__" ? "" : value,
                      )
                    }
                    placeholder="Description"
                    className="w-[180px] [&_input]:h-8 [&_input]:text-xs"
                    disabled={!selectedModelName || loadingModelAssociations}
                  />
                  <SearchableSelect
                    options={associationApplicationFilterOptions}
                    value={associationApplicationFilter || "__all__"}
                    onValueChange={(value) =>
                      setAssociationApplicationFilter(
                        value === "__all__" ? "" : value,
                      )
                    }
                    placeholder="Application"
                    className="w-[180px] [&_input]:h-8 [&_input]:text-xs"
                    disabled={!selectedModelName || loadingModelAssociations}
                  />
                </div>

                <div className="rounded-md border overflow-y-auto flex-1 min-h-0">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <ListNumberHeader className="text-xs w-9 px-2" />
                        <TableHead className="text-xs w-[22%] px-2">Part</TableHead>
                        <TableHead className="text-xs w-[28%] px-2">Description</TableHead>
                        <TableHead className="text-xs w-14 px-2">Brand</TableHead>
                        <TableHead className="text-xs w-12 px-2">Model</TableHead>
                        <TableHead className="text-xs text-right w-12 px-2">Qty</TableHead>
                        <TableHead className="text-xs text-center w-10 px-2" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingModelAssociations ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : !selectedModelName ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground italic">
                            Select a model to view associated parts
                          </TableCell>
                        </TableRow>
                      ) : filteredModelAssociations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground italic">
                            {modelAssociations.length === 0
                              ? "No associated parts found for this model."
                              : "No associated parts match the selected filters."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredModelAssociations.map((item, index) => (
                          <TableRow key={`${item.partId}-${index}`} className="hover:bg-muted/20">
                            <ListNumberCell index={index} total={filteredModelAssociations.length} className="text-xs px-2 py-1.5" />
                            <TableCell
                              className="text-xs font-medium px-2 py-1.5 max-w-0 truncate"
                              title={`${item.masterPart || "N/A"} | ${item.partNo || "N/A"}`}
                            >
                              {item.masterPart && item.partNo && item.masterPart !== item.partNo
                                ? `${item.masterPart} | ${item.partNo}`
                                : item.masterPart || item.partNo || "N/A"}
                            </TableCell>
                            <TableCell
                              className="text-xs px-2 py-1.5 max-w-0 truncate"
                              title={item.description}
                            >
                              {item.description || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5">
                              <BrandOriginCell brand={item.brand || "N/A"} origin={item.origin} />
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5 truncate max-w-0">{item.model || "N/A"}</TableCell>
                            <TableCell className="text-xs text-right font-semibold px-2 py-1.5 tabular-nums">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="text-xs text-center px-2 py-1.5">
                              {canCreate && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary hover:bg-primary/10"
                                  onClick={() => void handleAddAssociationToList(item)}
                                  title="Add this part to inquiry"
                                  disabled={!item.partId}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Purchase + Quotation – col-span-3 */}
              <div className="xl:col-span-3 space-y-4">

                {/* Purchase Section (PO + DPO) */}
                <div className="rounded-md border bg-card p-3">
                  <div className="text-sm font-semibold mb-2">
                    Purchase
                    {selectedPart && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        for {selectedPart.partNo}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <ListNumberHeader className="text-xs" />
                          <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">V.No</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Qty</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Rcvd</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">BO</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Currency</TableHead>
                          <TableHead className={`text-xs whitespace-nowrap ${fcHeaderClass}`}>FC Rate</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Unit Cost</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Supplier</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingInquiry ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-6 text-sm text-muted-foreground">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : !inquiryData || inquiryData.poRecords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-6 text-xs text-muted-foreground italic">
                              No purchase records found
                            </TableCell>
                          </TableRow>
                        ) : (
                          inquiryData.poRecords.map((row, index) => (
                            <TableRow key={row.id || index} className="hover:bg-muted/20">
                              <ListNumberCell index={index} total={inquiryData.poRecords.length} className="text-xs" />
                              <TableCell className="text-xs">
                                <Badge
                                  variant={row.type === "DPO" ? "secondary" : "outline"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {row.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-medium whitespace-nowrap">{row.poNo || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatUiDate(row.date) || "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.qty)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.receivedQty)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.backQty)}</TableCell>
                              <TableCell className="text-xs">{row.currency || "—"}</TableCell>
                              <TableCell className={`text-xs tabular-nums ${fcValueClass()}`}>
                                {row.fcRate ? formatFc(row.fcRate) : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {row.unitCost ? formatPurchasePrice(row.unitCost) : "—"}
                              </TableCell>
                              <TableCell className="text-xs max-w-[120px] truncate" title={row.supplier}>
                                {row.supplier || "—"}
                              </TableCell>
                              <TableCell className="text-xs">{statusBadge(row.status || "")}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Import Quotation Section */}
                <div className="rounded-md border bg-card p-3">
                  <div className="text-sm font-semibold mb-2">
                    Imp. Quotation
                    {selectedPart && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        for {selectedPart.partNo}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <ListNumberHeader className="text-xs" />
                          <TableHead className="text-xs whitespace-nowrap">V.No</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Ref. Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Cnf. Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Qty</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Currency</TableHead>
                          <TableHead className={`text-xs whitespace-nowrap ${fcHeaderClass}`}>FC Rate</TableHead>
                          <TableHead className={`text-xs whitespace-nowrap ${lcHeaderClass}`}>LC Rate</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Supplier</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingInquiry ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-6 text-sm text-muted-foreground">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : !inquiryData || inquiryData.quotationRecords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-6 text-xs text-muted-foreground italic">
                              No quotation records found
                            </TableCell>
                          </TableRow>
                        ) : (
                          inquiryData.quotationRecords.map((row, index) => (
                            <TableRow key={row.id || index} className="hover:bg-muted/20">
                              <ListNumberCell index={index} total={inquiryData.quotationRecords.length} className="text-xs" />
                              <TableCell className="text-xs font-medium whitespace-nowrap">{row.quotationNo || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatUiDate(row.date) || "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.confirmationDate
                                  ? formatUiDate(row.confirmationDate) || "—"
                                  : row.status?.toLowerCase() === "confirm" ||
                                      row.status?.toLowerCase() === "confirmed"
                                    ? "Confirmed"
                                    : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.quotationQty)}</TableCell>
                              <TableCell className="text-xs">{row.currency || "—"}</TableCell>
                              <TableCell className={`text-xs tabular-nums ${fcValueClass()}`}>
                                {row.fcRate ? formatFc(row.fcRate) : "—"}
                              </TableCell>
                              <TableCell className={`text-xs tabular-nums ${lcValueClass()}`}>
                                {row.lcRate ? formatPurchasePrice(row.lcRate) : "—"}
                              </TableCell>
                              <TableCell className="text-xs max-w-[120px] truncate" title={row.supplier}>
                                {row.supplier || "—"}
                              </TableCell>
                              <TableCell className="text-xs">{statusBadge(row.status || "")}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Sales Section */}
                <div className="rounded-md border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-sm font-semibold">
                        Sales
                        {selectedPart && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            for {selectedPart.partNo}
                          </span>
                        )}
                      </div>
                      {!salesDetailsExpanded && salesHistory.length > 0 && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          ({salesHistory.length} invoice{salesHistory.length === 1 ? "" : "s"})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {salesDetailsExpanded && (
                        <Select
                          value={String(salesPeriodMonths)}
                          onValueChange={(value) =>
                            setSalesPeriodMonths(Number(value) as SalesPeriodMonths)
                          }
                        >
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue placeholder="Period" />
                          </SelectTrigger>
                          <SelectContent className="z-[10000]">
                            <SelectItem value="3" className="text-xs">Last 3 months</SelectItem>
                            <SelectItem value="6" className="text-xs">Last 6 months</SelectItem>
                            <SelectItem value="9" className="text-xs">Last 9 months</SelectItem>
                            <SelectItem value="12" className="text-xs">Last 1 year</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setSalesDetailsExpanded((prev) => !prev)}
                        title={salesDetailsExpanded ? "Minimize sales details" : "Maximize sales details"}
                      >
                        {salesDetailsExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Minimize
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Maximize
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {salesDetailsExpanded && (
                  <div className="overflow-x-auto mt-2">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <ListNumberHeader className="text-xs" />
                          <TableHead className="text-xs whitespace-nowrap">Invoice No</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Customer</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Category</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Qty</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Unit Price</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Line Total</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!selectedPart ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-6 text-xs text-muted-foreground italic">
                              Select a part to view sales history
                            </TableCell>
                          </TableRow>
                        ) : loadingSalesHistory ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : salesHistory.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-6 text-xs text-muted-foreground italic">
                              No sales found in the selected period
                            </TableCell>
                          </TableRow>
                        ) : (
                          salesHistory.map((invoice, index) => (
                            <TableRow key={invoice.id || index} className="hover:bg-muted/20">
                              <ListNumberCell index={index} total={salesHistory.length} className="text-xs" />
                              <TableCell className="text-xs font-medium whitespace-nowrap">
                                {invoice.invoice_no || "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {invoice.invoice_date
                                  ? formatUiDate(invoice.invoice_date) || "—"
                                  : "—"}
                              </TableCell>
                              <TableCell
                                className="text-xs max-w-[140px] truncate"
                                title={invoice.customer_name || ""}
                              >
                                {invoice.customer_name || "—"}
                              </TableCell>
                              <TableCell
                                className="text-xs max-w-[120px] truncate"
                                title={invoice.customer_category || ""}
                              >
                                {invoice.customer_category || "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {fmtQty(
                                  invoice.item?.sold_qty ??
                                    invoice.item?.ordered_qty,
                                )}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {invoice.item?.unit_price != null
                                  ? fmt(invoice.item.unit_price)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums font-medium">
                                {invoice.item?.line_total != null
                                  ? fmt(invoice.item.line_total)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {statusBadge(invoice.status || "")}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!selectedPart && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Search for a part to view purchase inquiry details</p>
              <p className="text-xs mt-1">Use Add Item to inquire multiple parts</p>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};
