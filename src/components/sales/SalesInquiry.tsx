import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  Fragment,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { Plus, Search, Eye, FileText, CalendarIcon, Package, ShoppingCart, Boxes, Settings2, Truck, Printer, RefreshCw, ArrowRight, ArrowLeftRight, Trash, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { PrintableDocument, printDocument } from "./PrintableDocument";
import { apiClient } from "@/lib/api";
import { formatPurchasePrice } from "@/utils/purchasePriceRound";
import {
  extractLatestPriceDatesFromHistory,
  formatPriceLastUpdatedLabel,
} from "@/lib/part-price-dates";
import { getCustomerTypeLabel } from "@/types/invoice";
import { formatPartIdentityFromUi } from "@/lib/part-identity";
import { shareImagesAcrossFamilyItems } from "@/lib/part-images";

interface Inquiry {
  id: string;
  inquiryNo: string;
  inquiryDate: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  subject: string;
  description: string;
  status: "New" | "In Progress" | "Quoted" | "Closed" | "Cancelled";
  items?: InquiryItem[];
}

interface InquiryItem {
  id?: string;
  partId: string;
  quantity: number;
  purchasePrice?: number;
  priceA?: number;
  priceB?: number;
  priceM?: number;
  location?: string;
  stock?: number;
  reservedQty?: number;
  part?: {
    partNo: string;
    description?: string;
    brand?: { name: string };
    category?: { name: string };
  };
}

interface PartDetail {
  id?: string; // Part ID for fetching full details
  partNo: string;
  masterPart: string;
  brand: string;
  description: string;
  category: string;
  subCategory: string;
  application?: string;
  uom: string;
  hsCode: string;
  weight: string;
  cost: string;
  priceA: string;
  priceB: string;
  priceM: string;
  origin: string;
  grade: string;
  status: string;
  rackNo: string;
  reOrderLevel: string;
  quantity?: number; // Available stock quantity
  /** From parts API when present; used in dropdown before available qty */
  reservedQty?: number;
  images?: string[];
}

interface ModelAssociationItem {
  partId: string;
  masterPart: string;
  partNo: string;
  description: string;
  brand: string;
  application?: string;
  model: string;
  quantity: number;
}

const resolvePartStockQty = (p: any): number => {
  const fromParts = Number(
    p.current_stock ?? p.currentStock ?? p.stock ?? p.qty,
  );
  return Number.isFinite(fromParts) ? Math.max(0, fromParts) : 0;
};

const formatPartNumber = (val: any): string => {
  if (val === null || val === undefined || val === "") return "0";
  const num = parseFloat(val);
  if (isNaN(num)) return "0";
  return num % 1 === 0 ? String(num) : num.toFixed(2);
};

const formatPartImageSrc = (img?: string | null): string | null => {
  if (!img || !String(img).trim()) return null;
  const trimmed = String(img).trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("http")
  ) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
};

const getPartImageList = (
  part?: {
    images?: string[];
    imageP1?: string | null;
    imageP2?: string | null;
    image_p1?: string | null;
    image_p2?: string | null;
  } | null,
): string[] => {
  if (!part) return [];
  if (part.images?.length) {
    return part.images
      .map((img) => formatPartImageSrc(img))
      .filter((img): img is string => Boolean(img));
  }
  return [part.imageP1, part.imageP2, part.image_p1, part.image_p2]
    .map((img) => formatPartImageSrc(img))
    .filter((img): img is string => Boolean(img));
};

// Correctly transform parts based on project convention (Swapped)
const transformPart = (
  p: any,
  rackMapData: Record<string, string>,
): PartDetail => ({
  id: p.id,
  partNo:
    String(p.master_part_no || p.masterPart || p.master_part_no || "").trim() ||
    "N/A",
  masterPart: String(p.part_no || p.partNo || p.part_no || "").trim() || "N/A",
  brand: String(p.brand_name || p.brand || "").trim() || "N/A",
  description:
    String(p.description || p.part_no || "").trim() || "No description",
  category: String(p.category_name || p.category || "").trim() || "N/A",
  subCategory:
    String(p.subcategory_name || p.subcategory || "").trim() || "N/A",
  application:
    String(
      p.application_name || p.application?.name || p.application || "",
    ).trim() || "N/A",
  uom: String(p.uom || "NOS").trim(),
  hsCode: String(p.hs_code || p.hsCode || "").trim() || "N/A",
  weight: formatPartNumber(p.weight),
  cost: formatPartNumber(p.cost),
  priceA: formatPartNumber(p.price_a || p.priceA),
  priceB: formatPartNumber(p.price_b || p.priceB),
  priceM: formatPartNumber(p.price_m || p.priceM),
  origin: String(p.origin || "").trim() || "N/A",
  grade: String(p.grade || "A").trim(),
  status: (p.status || "active").toUpperCase() === "ACTIVE" ? "A" : "I",
  rackNo: rackMapData[p.id] || "N/A",
  reOrderLevel: formatPartNumber(p.reorder_level || p.reorderLevel),
  quantity: resolvePartStockQty(p),
  reservedQty:
    Number(p.reserved_stock ?? p.reservedStock ?? p.reservedQty ?? 0) || 0,
  images: getPartImageList({
    image_p1: p.image_p1,
    image_p2: p.image_p2,
    imageP1: p.imageP1,
    imageP2: p.imageP2,
  }),
});

const extractPartModels = (part: any) => {
  const models = Array.isArray(part?.models) ? part.models : [];
  return models
    .map((m: any) => ({
      id: String(m.id ?? `${part?.id || "part"}-${m?.name || "model"}`),
      name: String(m.name ?? "").trim(),
      qtyUsed: Number(m.qty_used ?? m.qtyUsed ?? 0) || 0,
    }))
    .filter((m: { name: string }) => !!m.name);
};

interface SalesInquiryProps {
  /** Hide all price columns/inputs (used by the Store Part Association view). */
  hidePrices?: boolean;
  /** Hide the To Invoice / To Quotation / To Local Purchase shortcut buttons. */
  hideShortcuts?: boolean;
}

export const SalesInquiry = ({
  hidePrices = false,
  hideShortcuts = false,
}: SalesInquiryProps = {}) => {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [inquiryDate, setInquiryDate] = useState<Date>(new Date());
  const [formData, setFormData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    subject: "",
    description: "",
    status: "New" as Inquiry["status"],
  });
  const [inquiryItems, setInquiryItems] = useState<InquiryItem[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [fullInquiryData, setFullInquiryData] = useState<Inquiry | null>(null);
  const [printInquiry, setPrintInquiry] = useState<Inquiry | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [inquiryToDelete, setInquiryToDelete] = useState<Inquiry | null>(null);
  const [loadingInquiryDetails, setLoadingInquiryDetails] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Part lookup state with dropdowns
  const [itemSearch, setItemSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<PartDetail | null>(null);
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  // Multi-row lookup table state (each row mirrors the Sales Invoice item row)
  type LookupRow = {
    id: string;
    partId: string;
    search: string;
    qty: number;
    unitPrice?: number;
    priceA?: number;
    priceB?: number;
    priceM?: number;
    selectedPriceType?: "A" | "B" | "M";
  };
  const makeLookupRow = useCallback((): LookupRow => ({
    id:
      typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : `lr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partId: "",
    search: "",
    qty: 0,
  }), []);
  const [lookupRows, setLookupRows] = useState<LookupRow[]>([]);
  const [activeLookupRowId, setActiveLookupRowId] = useState<string | null>(
    null,
  );
  // Remembers each row's last-clicked model name so switching items restores
  // that row's own model selection rather than carrying the previous row's.
  const [lookupRowSelectedModel, setLookupRowSelectedModel] = useState<
    Record<string, string>
  >({});
  const [showLookupRowDropdown, setShowLookupRowDropdown] = useState<
    Record<string, boolean>
  >({});
  /** Keyboard highlight index per lookup row part dropdown */
  const [lookupRowHighlightIndex, setLookupRowHighlightIndex] = useState<
    Record<string, number>
  >({});
  const lookupRowHighlightIndexRef = useRef<Record<string, number>>({});
  const lookupRowDropdownRefs = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const lookupRowPortalRefs = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const lookupRowInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const [lookupDropdownRects, setLookupDropdownRects] = useState<
    Record<string, { top: number; left: number; width: number }>
  >({});

  // Top filters (shared across all rows)
  const [lookupModelFilter, setLookupModelFilter] = useState("");
  const [lookupDescriptionFilter, setLookupDescriptionFilter] = useState("");
  const [lookupApplicationFilter, setLookupApplicationFilter] = useState("");

  // Cache of machine models per part for the Quantity Used row
  const [partModelsByPartId, setPartModelsByPartId] = useState<
    Record<string, { id: string; name: string; qtyUsed: number }[]>
  >({});

  // Cache of stock balances per part: { current_stock, reserved_stock, available_stock, avg_cost }
  const [partStockBalances, setPartStockBalances] = useState<
    Record<
      string,
      {
        current_stock: number;
        reserved_stock: number;
        available_stock: number;
        avg_cost?: number;
      }
    >
  >({});
  const [loadingStockBalances, setLoadingStockBalances] = useState<
    Record<string, boolean>
  >({});
  const [partExpectedArrivals, setPartExpectedArrivals] = useState<
    Record<
      string,
      { estTimeDate: string; forwarder: string | null; poNumber: string }
    >
  >({});
  const [partImagesByPartId, setPartImagesByPartId] = useState<
    Record<string, string[]>
  >({});
  const loadedPartImagesRef = useRef<Set<string>>(new Set());
  const [partImageModalOpen, setPartImageModalOpen] = useState(false);
  const [partImageModalImages, setPartImageModalImages] = useState<string[]>(
    [],
  );
  const [partImageModalIndex, setPartImageModalIndex] = useState(0);
  const [partImageModalTitle, setPartImageModalTitle] = useState("");
  const [partPriceLastUpdatedByPartId, setPartPriceLastUpdatedByPartId] =
    useState<Record<string, { priceA: string | null; priceB: string | null }>>(
      {},
    );
  const loadedPartPriceDatesRef = useRef<Set<string>>(new Set());
  const [loadingPartDetails, setLoadingPartDetails] = useState(false);
  const [purchaseOrderHistory, setPurchaseOrderHistory] = useState<any[]>([]);
  const [loadingPOHistory, setLoadingPOHistory] = useState(false);
  const [deletePODialogOpen, setDeletePODialogOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState<any | null>(null);
  const [salesInvoiceHistory, setSalesInvoiceHistory] = useState<any[]>([]);
  const [loadingSalesInvoiceHistory, setLoadingSalesInvoiceHistory] = useState(false);
  const [dpoHistory, setDpoHistory] = useState<any[]>([]);
  const [loadingDpoHistory, setLoadingDpoHistory] = useState(false);
  const [relatedKits, setRelatedKits] = useState<any[]>([]);
  const [loadingRelatedKits, setLoadingRelatedKits] = useState(false);
  const [partModels, setPartModels] = useState<any[]>([]);
  const [loadingPartModels, setLoadingPartModels] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState("");
  const [modelAssociations, setModelAssociations] = useState<ModelAssociationItem[]>([]);
  const [loadingModelAssociations, setLoadingModelAssociations] = useState(false);
  const [associationDescriptionFilter, setAssociationDescriptionFilter] =
    useState("");
  const [associationApplicationFilter, setAssociationApplicationFilter] =
    useState("");
  const [alternateItems, setAlternateItems] = useState<PartDetail[]>([]);
  const [loadingAlternateItems, setLoadingAlternateItems] = useState(false);
  const [lookupRowPriceBaselines, setLookupRowPriceBaselines] = useState<
    Record<string, { priceA: number | null; priceB: number | null }>
  >({});
  const [savingLookupRowPrice, setSavingLookupRowPrice] = useState<
    Record<string, boolean>
  >({});

  const itemDropdownRef = useRef<HTMLDivElement>(null);

  const [partsData, setPartsData] = useState<PartDetail[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [partIdMap, setPartIdMap] = useState<Record<string, string>>({});
  const [rackMap, setRackMap] = useState<Record<string, string>>({});
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [searchResults, setSearchResults] = useState<PartDetail[]>([]);
  // Stable cache for parts brought in from external panels (alternates,
  // associations) so they aren't wiped by the debounced item-search effect
  // that resets `searchResults`.
  const [lookupRowSearchResults, setLookupRowSearchResults] = useState<
    PartDetail[]
  >([]);
  const [lookupRowSearchLoading, setLookupRowSearchLoading] = useState(false);
  const [externalLookupParts, setExternalLookupParts] = useState<PartDetail[]>(
    [],
  );

  const openPartImageModal = useCallback(
    (images: string[], title = "Part Image", startIndex = 0) => {
      const valid = images.filter((img) => img && img.trim() !== "");
      if (valid.length === 0) return;
      setPartImageModalImages(valid);
      setPartImageModalIndex(
        Math.min(Math.max(startIndex, 0), valid.length - 1),
      );
      setPartImageModalTitle(title);
      setPartImageModalOpen(true);
    },
    [],
  );

  const fetchPartImages = useCallback(
    async (partId: string) => {
      if (!partId || loadedPartImagesRef.current.has(partId)) return;

      const cachedPart =
        partsData.find((p) => p.id === partId) ||
        searchResults.find((p) => p.id === partId);
      const cachedImages = getPartImageList(cachedPart);
      const siblingImages =
        cachedImages.length > 0
          ? cachedImages
          : getPartImageList(
              [...partsData, ...searchResults, ...alternateItems].find((p) => {
                if (!p || p.id === partId || !p.images?.length) return false;
                const partNo = String(p.partNo || "").trim().toLowerCase();
                const master = String(p.masterPart || "").trim().toLowerCase();
                const targetNo = String(cachedPart?.partNo || "").trim().toLowerCase();
                const targetMaster = String(cachedPart?.masterPart || "")
                  .trim()
                  .toLowerCase();
                return (
                  (targetNo && (partNo === targetNo || master === targetNo)) ||
                  (targetMaster &&
                    (partNo === targetMaster || master === targetMaster))
                );
              }),
            );
      if (siblingImages.length > 0) {
        loadedPartImagesRef.current.add(partId);
        setPartImagesByPartId((prev) =>
          prev[partId]?.length ? prev : { ...prev, [partId]: siblingImages },
        );
        return;
      }

      loadedPartImagesRef.current.add(partId);
      try {
        const response = (await apiClient.getPart(partId)) as any;
        const data = response?.data || response;
        const images = getPartImageList(data);
        if (images.length > 0) {
          setPartImagesByPartId((prev) => ({ ...prev, [partId]: images }));
          setPartsData((prev) =>
            prev.map((p) => (p.id === partId ? { ...p, images } : p)),
          );
        }
      } catch {
        // Images are optional.
      }
    },
    [partsData, searchResults, alternateItems],
  );

  const fetchPartPriceLastUpdated = useCallback(async (partId: string) => {
    if (!partId || loadedPartPriceDatesRef.current.has(partId)) return;
    loadedPartPriceDatesRef.current.add(partId);
    try {
      const response = (await apiClient.getPriceHistory({
        partId,
        page: 1,
        limit: 100,
      })) as any;
      const rows = Array.isArray(response?.data) ? response.data : [];
      const dates = extractLatestPriceDatesFromHistory(rows);
      setPartPriceLastUpdatedByPartId((prev) => ({
        ...prev,
        [partId]: dates,
      }));
    } catch {
      setPartPriceLastUpdatedByPartId((prev) => ({
        ...prev,
        [partId]: { priceA: null, priceB: null },
      }));
    }
  }, []);

  const renderPartImageThumbnail = (
    partId: string | undefined,
    part: PartDetail | null | undefined,
    className = "w-10 h-10",
    titleOverride?: string,
  ) => {
    const images = partId
      ? partImagesByPartId[partId] || getPartImageList(part)
      : [];
    const src = images[0];
    if (!src) {
      return (
        <div
          className={cn(
            "mx-auto rounded border border-dashed border-muted-foreground/30 bg-muted/30 flex items-center justify-center text-[9px] text-muted-foreground",
            className,
          )}
        >
          —
        </div>
      );
    }
    return (
      <button
        type="button"
        className="mx-auto block rounded border border-border overflow-hidden hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={(e) => {
          e.stopPropagation();
          openPartImageModal(
            images,
            titleOverride || part?.partNo || "Part Image",
          );
        }}
        title="View image"
      >
        <img
          src={src}
          alt={part?.partNo || "Part"}
          className={cn("object-cover", className)}
          onError={(e) => {
            (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      </button>
    );
  };

  useEffect(() => {
    lookupRows.forEach((row) => {
      if (row.partId) void fetchPartImages(row.partId);
    });
    lookupRows.forEach((row) => {
      if (row.partId) void fetchPartPriceLastUpdated(row.partId);
    });
    inquiryItems.forEach((item) => {
      if (item.partId) void fetchPartImages(item.partId);
    });
    fullInquiryData?.items?.forEach((item) => {
      if (item.partId) void fetchPartImages(item.partId);
    });
  }, [lookupRows, inquiryItems, fullInquiryData, fetchPartImages, fetchPartPriceLastUpdated]);

  const resolveSelectedPartId = useCallback(
    (part: PartDetail | null): string | null => {
      if (!part) return null;
      if (part.id) return part.id;
      return partIdMap[part.partNo] || null;
    },
    [partIdMap],
  );

  const getPartStockDisplay = useCallback(
    (part: PartDetail, balances: typeof partStockBalances) => {
      const live = part.id ? balances[part.id] : undefined;
      if (live) {
        return {
          current: live.current_stock,
          reserved: live.reserved_stock,
          available: live.available_stock,
        };
      }
      const current = Number(part.quantity || 0);
      const reserved = Number(part.reservedQty || 0);
      return {
        current,
        reserved,
        available: Math.max(0, current - reserved),
      };
    },
    [],
  );

  useEffect(() => {
    const fetchParts = async () => {
      setLoadingParts(true);
      try {
        const [partsResponse, balancesResponse] = await Promise.all([
          apiClient.getParts({
            status: 'active',
            limit: 'all',
            page: 1
          }).catch((err: any) => {
            return { error: err.message || 'Failed to fetch parts', data: [] };
          }),
          apiClient.getStockBalances({ limit: 5000 }).catch(() => ({ data: [], error: null }))
        ]);

        let partsDataArray: any[] = [];
        if (Array.isArray(partsResponse)) {
          partsDataArray = partsResponse;
        } else if ((partsResponse as any).data && Array.isArray((partsResponse as any).data)) {
          partsDataArray = (partsResponse as any).data;
        }

        let balancesData: any[] = [];
        if (Array.isArray(balancesResponse)) {
          balancesData = balancesResponse;
        } else if ((balancesResponse as any).data && Array.isArray((balancesResponse as any).data)) {
          balancesData = (balancesResponse as any).data;
        }

        const rackMapData: Record<string, string> = {};
        const stockMapData: Record<string, number> = {};
        if (Array.isArray(balancesData)) {
          balancesData.forEach((b: any) => {
            if (b.part_id) {
              const loc =
                b.location ||
                (b.rack && b.shelf
                  ? `${b.rack}/${b.shelf}`
                  : b.rack || b.shelf || b.rack_no || "");
              if (loc) rackMapData[b.part_id] = loc;
              if (b.current_stock !== undefined) stockMapData[b.part_id] = b.current_stock;
            }
          });
        }
        setRackMap(rackMapData);
        setStockMap(stockMapData);

        const idMap: Record<string, string> = {};
        const modelMapUpdates: Record<
          string,
          { id: string; name: string; qtyUsed: number }[]
        > = {};
        const transformedParts = partsDataArray
          .filter((p: any) => p.status === 'active' || !p.status)
          .map((p: any) => {
            const part = transformPart(p, rackMapData);
            if (part.partNo && part.id) idMap[part.partNo] = part.id;
            if (part.id) {
              modelMapUpdates[part.id] = extractPartModels(p);
            }
            return part;
          })
          .filter((p: PartDetail) => p.partNo && p.partNo !== 'N/A');

        setPartIdMap(idMap);
        const partsWithSharedImages = shareImagesAcrossFamilyItems(transformedParts);
        setPartsData(partsWithSharedImages);
        setPartModelsByPartId((prev) => ({ ...prev, ...modelMapUpdates }));
        const withImages = partsWithSharedImages.filter((p) => p.images?.length);
        if (withImages.length > 0) {
          setPartImagesByPartId((prev) => {
            const next = { ...prev };
            withImages.forEach((p) => {
              if (p.id && !next[p.id]?.length && p.images?.length) {
                next[p.id] = p.images;
                loadedPartImagesRef.current.add(p.id);
              }
            });
            return next;
          });
        }
      } catch (error: any) {
        toast({ title: "Error", description: "Failed to load parts", variant: "destructive" });
      } finally {
        setLoadingParts(false);
      }
    };

    fetchParts();
  }, []);

  // Debounced search for Item
  useEffect(() => {
    if (!itemSearch || itemSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingParts(true);
      try {
        const response: any = await apiClient.getParts({
          search: itemSearch,
          limit: 'all',
          status: 'active'
        });

        const data = Array.isArray(response) ? response : response?.data || [];
        const transformed = data.map((p: any) => transformPart(p, rackMap));
        setSearchResults(transformed);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoadingParts(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [itemSearch, rackMap, stockMap]);

  // Fetch inquiries from backend
  useEffect(() => {
    const fetchInquiries = async () => {
      setLoadingInquiries(true);
      try {
        const response = await apiClient.getSalesInquiries();
        if ((response as any).error) {
          toast({
            title: "Error",
            description: "Failed to load inquiries",
            variant: "destructive",
          });
          return;
        }
        const inquiriesData = Array.isArray(response) ? response : ((response as any).data || []);
        setInquiries(inquiriesData as any);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch inquiries",
          variant: "destructive",
        });
      } finally {
        setLoadingInquiries(false);
      }
    };

    fetchInquiries();
  }, []);

  // Fetch purchase order history when a part is selected
  useEffect(() => {
    const fetchPOHistory = async () => {
      const partId = resolveSelectedPartId(selectedPart);
      if (!partId) {
        setPurchaseOrderHistory([]);
        return;
      }

      setLoadingPOHistory(true);
      try {
        const response = await apiClient.getPurchaseOrdersByPart(partId, {
          page: 1,
          limit: 100,
        });

        if ((response as any).error) {
          setPurchaseOrderHistory([]);
          return;
        }

        const poData = Array.isArray(response) ? response : ((response as any).data || []);
        // Backend already returns data in the correct format, just ensure it's properly set
        setPurchaseOrderHistory(poData as any);
      } catch (error: any) {
        setPurchaseOrderHistory([]);
      } finally {
        setLoadingPOHistory(false);
      }
    };

    fetchPOHistory();
  }, [selectedPart, resolveSelectedPartId]);

  // Fetch sales invoice history when a part is selected
  useEffect(() => {
    const fetchSalesInvoiceHistory = async () => {
      const partId = resolveSelectedPartId(selectedPart);
      if (!partId) {
        setSalesInvoiceHistory([]);
        return;
      }

      setLoadingSalesInvoiceHistory(true);
      try {
        const response = await apiClient.getSalesInvoicesByPart(partId, {
          page: 1,
          limit: 100,
        });

        if ((response as any).error) {
          setSalesInvoiceHistory([]);
          return;
        }

        const invoiceData = Array.isArray(response) ? response : ((response as any).data || []);
        setSalesInvoiceHistory(invoiceData as any);
      } catch (error: any) {
        setSalesInvoiceHistory([]);
      } finally {
        setLoadingSalesInvoiceHistory(false);
      }
    };

    fetchSalesInvoiceHistory();
  }, [selectedPart, resolveSelectedPartId]);

  // Fetch direct purchase order history when a part is selected
  useEffect(() => {
    const fetchDpoHistory = async () => {
      const partId = resolveSelectedPartId(selectedPart);
      if (!partId) {
        setDpoHistory([]);
        return;
      }

      setLoadingDpoHistory(true);
      try {
        const response = await apiClient.getDirectPurchaseOrdersByPart(partId, {
          page: 1,
          limit: 50,
        });

        if ((response as any).error) {
          setDpoHistory([]);
          return;
        }

        const dpoListData = Array.isArray(response) ? response : ((response as any).data || []);

        // Fetch full details for the first 10 orders to get specific item data (prices, qty per part)
        // This is necessary because the list endpoint usually doesn't return line items
        const enrichedData = await Promise.all(
          dpoListData.slice(0, 10).map(async (dpo: any) => {
            try {
              const fullDpoResponse = await apiClient.getDirectPurchaseOrder(dpo.id) as any;
              const fullDpo = fullDpoResponse.data || fullDpoResponse;

              if (fullDpo && fullDpo.items) {
                const item = fullDpo.items.find((i: any) =>
                  String(i.part_id) === String(partId) || String(i.partId) === String(partId)
                );
                if (item) {
                  // Calculate DPO Cost Price including distributed expenses
                  const purchasePrice = item.purchase_price ?? item.purchasePrice ?? 0;
                  const itemQty = item.quantity ?? item.qty ?? 1;
                  const itemAmount = purchasePrice * itemQty;

                  // Calculate total expenses for this DPO
                  const dpoExpenses = fullDpo.expenses || [];
                  const totalExpenses = dpoExpenses.reduce((sum: number, exp: any) => {
                    const amount = exp.amount || exp.expense_amount || 0;
                    return sum + amount;
                  }, 0);

                  // Calculate distributed expense for this item (weighted by item amount)
                  const allItems = fullDpo.items || [];
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

                  return {
                    ...fullDpo,
                    item,
                    costPriceWithExpenses: costPerUnitWithExpenses
                  };
                }
              }
              return dpo;
            } catch (err) {
              return dpo;
            }
          })
        );

        // Map to ensure we have date and other required fields if they're named differently
        let finalData = enrichedData.map((dpo: any) => ({
          ...dpo,
          date: dpo.date || dpo.request_date || dpo.requestDate,
          dpo_no: dpo.dpo_no || dpo.dpo_number || dpo.dpoNo,
          supplier_name: dpo.supplier_name || dpo.supplier?.name || dpo.customer_name || dpo.customer,
          qty: dpo.item?.quantity || dpo.qty || 0,
          rate: dpo.item?.purchase_price || dpo.rate || 0,
          amount: dpo.item?.amount || dpo.amount || 0,
        }));

        // Filter out DPOs with zero quantity or zero amount (invalid/empty entries)
        finalData = finalData.filter((dpo: any) => {
          const qty = dpo.qty || dpo.item?.quantity || 0;
          const amount = dpo.amount || dpo.item?.amount || 0;
          // Only include DPOs with valid quantity and amount
          return qty > 0 && amount > 0;
        });

        // Sort by date descending (most recent first)
        finalData.sort((a: any, b: any) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA; // Descending order (newest first)
        });

        setDpoHistory(finalData as any);
      } catch (error: any) {
        setDpoHistory([]);
      } finally {
        setLoadingDpoHistory(false);
      }
    };

    fetchDpoHistory();
  }, [selectedPart, resolveSelectedPartId]);

  const combinedPurchaseHistory = useMemo(() => {
    const localRows = (dpoHistory || []).map((dpo: any) => {
      const qty = Number(dpo.item?.quantity ?? dpo.qty ?? 0) || 0;
      const rate = Number(dpo.item?.purchase_price ?? dpo.rate ?? 0) || 0;
      const costPrice =
        Number(dpo.costPriceWithExpenses ?? dpo.item?.purchase_price ?? dpo.rate ?? 0) || 0;
      return {
        id: `local-${dpo.id}`,
        source: "local" as const,
        poNo: String(dpo.dpo_no || dpo.dpo_number || dpo.dpoNo || "N/A"),
        date: dpo.date || dpo.request_date || dpo.requestDate || null,
        supplier: String(
          dpo.supplier_name || dpo.supplier?.name || dpo.customer || "N/A",
        ),
        qty,
        rate,
        costPrice,
      };
    });

    const importRows = (purchaseOrderHistory || []).map((po: any) => {
      const orderedQty = Number(po.item?.quantity || 0) || 0;
      const receivedQty = Number(po.item?.received_qty || 0) || 0;
      const qty = receivedQty > 0 ? receivedQty : orderedQty;
      const rate = Number(po.item?.unit_cost || 0) || 0;
      return {
        id: `po-${po.id}`,
        source: "import" as const,
        poNo: String(po.po_number || po.poNumber || "N/A"),
        date: po.date || null,
        supplier: String(po.supplier_name || po.supplier?.name || "N/A"),
        qty,
        rate,
        costPrice: rate,
      };
    });

    return [...localRows, ...importRows].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
  }, [dpoHistory, purchaseOrderHistory]);

  const loadingCombinedPurchaseHistory = loadingDpoHistory || loadingPOHistory;

  // Filter parts based on item search
  const filteredParts = useMemo(() => {
    const getAvailableQty = (part: PartDetail): number =>
      getPartStockDisplay(part, partStockBalances).available;

    const compareStockPriority = (a: PartDetail, b: PartDetail) => {
      const aHasStock = getAvailableQty(a) > 0;
      const bHasStock = getAvailableQty(b) > 0;
      if (aHasStock !== bHasStock) return aHasStock ? -1 : 1;
      return String(a.partNo || "").localeCompare(String(b.partNo || ""));
    };

    // Combine local data and search results
    const combined = [...partsData];
    searchResults.forEach(res => {
      if (!combined.find(p => p.id === res.id)) {
        combined.push(res);
      }
    });

    let filtered = combined;
    if (itemSearch) {
      const searchLower = itemSearch.toLowerCase();

      filtered = filtered.filter((item) => {
        const pNo = item.partNo.toLowerCase();
        const mNo = item.masterPart.toLowerCase();
        const description = item.description.toLowerCase();
        const category = item.category.toLowerCase();
        const subCategory = item.subCategory.toLowerCase();
        const application = (item.application || "").toLowerCase();
        const brand = item.brand.toLowerCase();

        return (
          pNo.includes(searchLower) ||
          mNo.includes(searchLower) ||
          description.includes(searchLower) ||
          category.includes(searchLower) ||
          subCategory.includes(searchLower) ||
          application.includes(searchLower) ||
          brand.includes(searchLower)
        );
      });

      // Prioritize exact partNo/master matches followed by startsWith
      filtered = [...filtered].sort((a, b) => {
        const stockCmp = compareStockPriority(a, b);
        if (stockCmp !== 0) return stockCmp;
        const aNo = a.partNo.toLowerCase();
        const bNo = b.partNo.toLowerCase();
        const aMaster = a.masterPart.toLowerCase();
        const bMaster = b.masterPart.toLowerCase();

        const aExact = aNo === searchLower || aMaster === searchLower;
        const bExact = bNo === searchLower || bMaster === searchLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = aNo.startsWith(searchLower) || aMaster.startsWith(searchLower);
        const bStarts = bNo.startsWith(searchLower) || bMaster.startsWith(searchLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return compareStockPriority(a, b);
      });
    } else {
      filtered = [...filtered].sort(compareStockPriority);
    }
    return filtered;
  }, [itemSearch, partsData, searchResults, partStockBalances, getPartStockDisplay]);

  // Pool of parts available to lookup rows (local + on-demand search results
  // + parts injected from alternate / association side panels).
  const lookupPartsPool = useMemo(() => {
    const pool = [...partsData];
    searchResults.forEach((res) => {
      if (!pool.find((p) => p.id === res.id)) pool.push(res);
    });
    externalLookupParts.forEach((res) => {
      if (!pool.find((p) => p.id === res.id)) pool.push(res);
    });
    lookupRowSearchResults.forEach((res) => {
      if (!pool.find((p) => p.id === res.id)) pool.push(res);
    });
    return pool;
  }, [partsData, searchResults, externalLookupParts, lookupRowSearchResults]);

  const activeLookupSearch = useMemo(() => {
    for (const row of lookupRows) {
      if (showLookupRowDropdown[row.id]) {
        return (row.search || "").trim();
      }
    }
    return "";
  }, [lookupRows, showLookupRowDropdown]);

  // Server search for lookup-row dropdown (parts beyond the in-memory catalog).
  useEffect(() => {
    if (activeLookupSearch.length < 2) {
      setLookupRowSearchResults([]);
      setLookupRowSearchLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLookupRowSearchLoading(true);
      try {
        const response: any = await apiClient.getParts({
          search: activeLookupSearch,
          limit: "all",
          status: "active",
        });
        const data = Array.isArray(response)
          ? response
          : response?.data || [];
        const transformed = data.map((p: any) => transformPart(p, rackMap));
        setLookupRowSearchResults(transformed);
      } catch {
        setLookupRowSearchResults([]);
      } finally {
        setLookupRowSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeLookupSearch, rackMap]);

  // Top-level filter option memos (each filter is computed against the others
  // so the dropdowns stay coherent).
  const lookupModelOptions = useMemo(() => {
    const desc = lookupDescriptionFilter.trim().toLowerCase();
    const app = lookupApplicationFilter.trim().toLowerCase();
    const set = new Set<string>();
    for (const p of lookupPartsPool) {
      const description = String(p.description || "").toLowerCase();
      const application = String(p.application || "").toLowerCase();
      if (desc && description !== desc) continue;
      if (app && application !== app) continue;
      const models =
        partModelsByPartId[p.id || ""] ?? (p.id ? null : []);
      if (Array.isArray(models)) {
        for (const m of models) {
          const name = String(m.name || "").trim();
          if (name) set.add(name);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [
    lookupPartsPool,
    lookupDescriptionFilter,
    lookupApplicationFilter,
    partModelsByPartId,
  ]);

  const lookupDescriptionOptions = useMemo(() => {
    const model = lookupModelFilter.trim().toLowerCase();
    const app = lookupApplicationFilter.trim().toLowerCase();
    const set = new Set<string>();
    for (const p of lookupPartsPool) {
      const application = String(p.application || "").toLowerCase();
      if (app && application !== app) continue;
      if (model) {
        const models = partModelsByPartId[p.id || ""];
        const hasModel = (models || []).some(
          (m) => String(m.name || "").toLowerCase() === model,
        );
        if (!hasModel) continue;
      }
      const desc = String(p.description || "").trim();
      if (desc) set.add(desc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [
    lookupPartsPool,
    lookupModelFilter,
    lookupApplicationFilter,
    partModelsByPartId,
  ]);

  const lookupApplicationOptions = useMemo(() => {
    const model = lookupModelFilter.trim().toLowerCase();
    const desc = lookupDescriptionFilter.trim().toLowerCase();
    const set = new Set<string>();
    for (const p of lookupPartsPool) {
      const description = String(p.description || "").toLowerCase();
      if (desc && description !== desc) continue;
      if (model) {
        const models = partModelsByPartId[p.id || ""];
        const hasModel = (models || []).some(
          (m) => String(m.name || "").toLowerCase() === model,
        );
        if (!hasModel) continue;
      }
      const app = String(p.application || "").trim();
      if (app) set.add(app);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [
    lookupPartsPool,
    lookupModelFilter,
    lookupDescriptionFilter,
    partModelsByPartId,
  ]);

  const lookupModelFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "__all__", label: "Models" },
      ...lookupModelOptions.map((name) => ({ value: name, label: name })),
    ],
    [lookupModelOptions],
  );

  const lookupDescriptionFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "__all__", label: "Description" },
      ...lookupDescriptionOptions.map((name) => ({ value: name, label: name })),
    ],
    [lookupDescriptionOptions],
  );

  const lookupApplicationFilterOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "__all__", label: "Application" },
      ...lookupApplicationOptions.map((name) => ({ value: name, label: name })),
    ],
    [lookupApplicationOptions],
  );

  // Build the filtered, sorted parts list shown in a row's dropdown.
  const getFilteredPartsForLookupRow = useCallback(
    (rowId: string) => {
      const getAvailableQty = (part: PartDetail): number =>
        getPartStockDisplay(part, partStockBalances).available;
      const compareStockPriority = (a: PartDetail, b: PartDetail) => {
        const aHasStock = getAvailableQty(a) > 0;
        const bHasStock = getAvailableQty(b) > 0;
        if (aHasStock !== bHasStock) return aHasStock ? -1 : 1;
        return String(a.partNo || "").localeCompare(String(b.partNo || ""));
      };

      const row = lookupRows.find((r) => r.id === rowId);
      const search = (row?.search || "").trim().toLowerCase();
      const model = lookupModelFilter.trim().toLowerCase();
      const description = lookupDescriptionFilter.trim().toLowerCase();
      const application = lookupApplicationFilter.trim().toLowerCase();

      let list = lookupPartsPool.filter((p) => {
        const pNo = (p.partNo || "").toLowerCase();
        const mNo = (p.masterPart || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        const cat = (p.category || "").toLowerCase();
        const sub = (p.subCategory || "").toLowerCase();
        const app = (p.application || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();

        if (
          search &&
          !(
            pNo.includes(search) ||
            mNo.includes(search) ||
            desc.includes(search) ||
            cat.includes(search) ||
            sub.includes(search) ||
            app.includes(search) ||
            brand.includes(search)
          )
        )
          return false;

        if (description && desc !== description) return false;
        if (application && app !== application) return false;
        if (model) {
          const models = partModelsByPartId[p.id || ""];
          const hasModel = (models || []).some(
            (mm) => String(mm.name || "").toLowerCase() === model,
          );
          if (!hasModel) return false;
        }
        return true;
      });

      if (search) {
        list = [...list].sort((a, b) => {
          const stockCmp = compareStockPriority(a, b);
          if (stockCmp !== 0) return stockCmp;
          const aNo = (a.partNo || "").toLowerCase();
          const bNo = (b.partNo || "").toLowerCase();
          const aMaster = (a.masterPart || "").toLowerCase();
          const bMaster = (b.masterPart || "").toLowerCase();
          const aExact = aNo === search || aMaster === search;
          const bExact = bNo === search || bMaster === search;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          const aStarts =
            aNo.startsWith(search) || aMaster.startsWith(search);
          const bStarts =
            bNo.startsWith(search) || bMaster.startsWith(search);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return compareStockPriority(a, b);
        });
      } else {
        list = [...list].sort(compareStockPriority);
      }

      return list;
    },
    [
      lookupRows,
      lookupPartsPool,
      lookupModelFilter,
      lookupDescriptionFilter,
      lookupApplicationFilter,
      partModelsByPartId,
      partStockBalances,
      getPartStockDisplay,
    ],
  );

  // Lazily fetch machine models for parts referenced by lookup rows so the
  // Quantity Used column has data to render.
  useEffect(() => {
    const targets = lookupRows
      .map((r) => r.partId)
      .filter((pid): pid is string => !!pid && !partModelsByPartId[pid]);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<
        string,
        { id: string; name: string; qtyUsed: number }[]
      > = {};
      await Promise.all(
        targets.map(async (pid) => {
          try {
            const resp: any = await apiClient.getPart(pid);
            const data = resp?.data || resp;
            const apiModels = data?.models || [];
            updates[pid] = apiModels.map((m: any) => ({
              id: String(m.id ?? `${pid}-${m.name}`),
              name: String(m.name ?? ""),
              qtyUsed: Number(m.qty_used ?? m.qtyUsed ?? 0) || 0,
            }));
          } catch {
            updates[pid] = [];
          }
        }),
      );
      if (!cancelled) {
        setPartModelsByPartId((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lookupRows, partModelsByPartId]);

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
        if (selectedPartNo) {
          requests.push(apiClient.getParts({ part_no: selectedPartNo, limit: 10000, page: 1 }));
          requests.push(apiClient.getParts({ master_part_no: selectedPartNo, limit: 10000, page: 1 }));
        }
        if (selectedMasterPart && selectedMasterPart.toLowerCase() !== selectedPartNo.toLowerCase()) {
          requests.push(apiClient.getParts({ part_no: selectedMasterPart, limit: 10000, page: 1 }));
          requests.push(apiClient.getParts({ master_part_no: selectedMasterPart, limit: 10000, page: 1 }));
        }

        const responses = await Promise.all(requests);
        const rawParts = responses.flatMap((res) => {
          if (Array.isArray(res)) return res;
          if (Array.isArray((res as any)?.data)) return (res as any).data;
          return [];
        });

        const dedup = new Map<string, PartDetail>();
        rawParts.forEach((row: any) => {
          const transformed = transformPart(row, rackMap);
          const key = String(transformed.id || `${transformed.partNo}|${transformed.masterPart}|${transformed.brand}|${transformed.description}`);
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
            (normalizedPartNo && (partNo === normalizedPartNo || masterPart === normalizedPartNo)) ||
            (normalizedMaster && (partNo === normalizedMaster || masterPart === normalizedMaster))
          );
        });

        setAlternateItems(
          shareImagesAcrossFamilyItems([selectedPart, ...matched]).filter(
            (item) => item.id !== selectedPart.id,
          ),
        );
      } catch {
        setAlternateItems([]);
      } finally {
        setLoadingAlternateItems(false);
      }
    };

    loadAlternateItems();
  }, [selectedPart, rackMap, stockMap]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
        setShowItemDropdown(false);
      }
      const target = event.target as Node;
      setShowLookupRowDropdown((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of Object.keys(prev)) {
          if (!prev[id]) continue;
          const wrapperEl = lookupRowDropdownRefs.current[id];
          const portalEl = lookupRowPortalRefs.current[id];
          const insideWrapper = wrapperEl ? wrapperEl.contains(target) : false;
          const insidePortal = portalEl ? portalEl.contains(target) : false;
          if (!insideWrapper && !insidePortal) {
            next[id] = false;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep keyboard-highlighted part row visible inside the fixed portal list
  useLayoutEffect(() => {
    for (const rowId of Object.keys(showLookupRowDropdown)) {
      if (!showLookupRowDropdown[rowId]) continue;
      const panel = lookupRowPortalRefs.current[rowId];
      if (!panel) continue;
      const idx = lookupRowHighlightIndex[rowId] ?? 0;
      const el = panel.querySelector<HTMLElement>(
        `[data-lookup-item-key="${rowId}"][data-lookup-item-idx="${idx}"]`,
      );
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [lookupRowHighlightIndex, showLookupRowDropdown]);

  const getItemLabel = (part: PartDetail) => {
    const leftPart = formatPartIdentityFromUi({
      partNo: part.partNo,
      masterPart: part.masterPart,
    });
    return part.description ? `${leftPart} - ${part.description}` : leftPart;
  };

  const normalizeAssociationApplication = (value: string) => {
    const rawApplication = String(value || "").trim();
    return ["n/a", "na", "none", "-", "--", ""].includes(
      rawApplication.toLowerCase(),
    )
      ? ""
      : rawApplication;
  };

  const loadModelAssociations = async (modelName: string) => {
    const cleanModel = String(modelName || "").trim();
    if (!cleanModel) return;

    setSelectedModelName(cleanModel);
    setLoadingModelAssociations(true);
    try {
      const response = await apiClient.getPartsByModelAssociation(cleanModel);
      const raw = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response)
          ? response
          : [];
      const mapped: ModelAssociationItem[] = raw.map((item: any) => ({
        partId: String(item.part_id || item.partId || ""),
        masterPart: String(item.master_part_no || item.masterPart || ""),
        partNo: String(item.part_no || item.partNo || ""),
        description: String(item.description || ""),
        brand: String(item.brand_name || item.brand || ""),
        application: String(item.application_name || item.application || ""),
        model: String(item.model_name || item.model || cleanModel),
        quantity: Number(item.quantity ?? item.qty_used ?? 0),
      }));
      setModelAssociations(mapped);
    } catch {
      setModelAssociations([]);
      toast({
        title: "Failed to load associations",
        description: "Could not fetch part associations for selected model.",
        variant: "destructive",
      });
    } finally {
      setLoadingModelAssociations(false);
    }
  };

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
      if (desc && String(item.description || "").toLowerCase() !== desc)
        return false;
      if (app && String(item.application || "").toLowerCase() !== app)
        return false;
      return true;
    });
  }, [
    modelAssociations,
    associationDescriptionFilter,
    associationApplicationFilter,
  ]);

  const handleSelectPart = async (
    part: PartDetail,
    opts?: { resetAssociationFilters?: boolean },
  ) => {
    const resetFilters = opts?.resetAssociationFilters !== false;
    const samePart =
      Boolean(selectedPart?.id) && selectedPart?.id === part.id;

    setSelectedPart(part);
    setItemSearch(getItemLabel(part));
    setShowItemDropdown(false);
    setSelectedModelName("");
    setModelAssociations([]);
    setLoadingModelAssociations(false);
    if (resetFilters && !samePart) {
      setAssociationDescriptionFilter("");
      setAssociationApplicationFilter(
        normalizeAssociationApplication(String(part.application || "")),
      );
    }

    // Fetch full part details if we have the ID
    if (part.id) {
      setLoadingPartDetails(true);
      try {
        const [partResponse, stockResponse] = await Promise.all([
          apiClient.getPart(part.id).catch(() => ({ data: {}, error: 'Failed to fetch' })),
          apiClient.getPartCostLookup(part.id).catch(() => ({ current_stock: 0, error: null }))
        ]);

        const p = (partResponse as any).data || partResponse;
        const stockData = (stockResponse as any).data || stockResponse;
        const fetchedQty = Math.max(
          0,
          Number(
            (stockData as any).current_stock ??
              (p as any).current_stock ??
              (p as any).currentStock ??
              part.quantity ??
              0,
          ),
        );
        const bestQty = fetchedQty;

        // Fetch and transform models as well
        const apiModels = p?.models || [];
        const transformedModels = apiModels.map((m: any) => ({
          id: m.id,
          name: m.name,
          qtyUsed: m.qty_used || m.qtyUsed || 1,
          partId: part.id,
        }));
        setPartModels(transformedModels);

        // Format numbers properly
        const formatNumber = (val: any): string => {
          if (val === null || val === undefined || val === '') return '0';
          const num = parseFloat(val);
          if (isNaN(num)) return '0';
          return num % 1 === 0 ? String(num) : num.toFixed(2);
        };

        // Update selected part with full details
        const fullPartDetails: PartDetail = {
          id: (p as any).id,
          partNo: String((p as any).master_part_no || (p as any).masterPart || part.partNo || '').trim() || 'N/A',
          masterPart: String((p as any).part_no || (p as any).partNo || part.masterPart || '').trim(),
          brand: String((p as any).brand_name || (p as any).brand || '').trim() || 'N/A',
          description: String((p as any).description || '').trim() || 'No description',
          category: String((p as any).category_name || (p as any).category || '').trim() || 'N/A',
          subCategory: String((p as any).subcategory_name || (p as any).subcategory || '').trim() || 'N/A',
          application:
            String(
              (p as any).application_name ||
              (p as any).application?.name ||
              (p as any).application ||
              "",
            ).trim() || "N/A",
          uom: String((p as any).uom || 'NOS').trim(),
          hsCode: String((p as any).hs_code || (p as any).hsCode || '').trim() || 'N/A',
          weight: formatNumber((p as any).weight),
          cost: formatNumber((p as any).cost),
          priceA: formatNumber((p as any).price_a || (p as any).priceA),
          priceB: formatNumber((p as any).price_b || (p as any).priceB),
          priceM: formatNumber((p as any).price_m || (p as any).priceM),
          origin: String((p as any).origin || '').trim() || 'N/A',
          grade: String((p as any).grade || 'A').trim(),
          status: ((p as any).status || 'active').toUpperCase() === 'ACTIVE' ? 'A' : 'I',
          rackNo: (rackMap[(p as any).id] && rackMap[(p as any).id] !== 'N/A') ? rackMap[(p as any).id] : 'N/A',
          reOrderLevel: formatNumber((p as any).reorder_level || (p as any).reorderLevel),
          quantity: bestQty,
          images: getPartImageList(p),
        };

        if (part.id) {
          const images = fullPartDetails.images || [];
          if (images.length > 0) {
            loadedPartImagesRef.current.add(part.id);
            setPartImagesByPartId((prev) => ({ ...prev, [part.id!]: images }));
          }
        }

        setSelectedPart(fullPartDetails);
        setItemSearch(getItemLabel(fullPartDetails));
        if (resetFilters && !samePart) {
          const nextApplication = normalizeAssociationApplication(
            fullPartDetails.application || "",
          );
          if (nextApplication) {
            setAssociationApplicationFilter(nextApplication);
          }
          if (transformedModels.length > 0) {
            await loadModelAssociations(transformedModels[0]?.name || "");
          }
        } else if (!selectedModelName && transformedModels.length > 0) {
          await loadModelAssociations(transformedModels[0]?.name || "");
        }
      } catch (error: any) {
        // Keep the selected part from list if API fails
      } finally {
        setLoadingPartDetails(false);
      }
    }
  };

  const handleClearSearch = () => {
    setItemSearch("");
    setSelectedPart(null);
    setPartModels([]);
    setSelectedModelName("");
    setModelAssociations([]);
    setLoadingModelAssociations(false);
    setAssociationDescriptionFilter("");
    setAssociationApplicationFilter("");
    setShowItemDropdown(false);
  };

  // Multi-row lookup table handlers ---------------------------------------
  const openLookupRowDropdown = useCallback((rowId: string) => {
    const el = lookupRowInputRefs.current[rowId];
    if (el) {
      const rect = el.getBoundingClientRect();
      setLookupDropdownRects((prev) => ({
        ...prev,
        [rowId]: {
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(rect.width, 360),
        },
      }));
    }
    setLookupRowHighlightIndex((prev) => ({ ...prev, [rowId]: 0 }));
    lookupRowHighlightIndexRef.current[rowId] = 0;
    setShowLookupRowDropdown((prev) => ({ ...prev, [rowId]: true }));
  }, []);

  const handleAddLookupRow = useCallback(() => {
    const row = makeLookupRow();
    setLookupRows((prev) => [...prev, row]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = lookupRowInputRefs.current[row.id];
        el?.focus({ preventScroll: true });
        openLookupRowDropdown(row.id);
        setActiveLookupRowId(row.id);
      });
    });
  }, [makeLookupRow, openLookupRowDropdown]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      handleAddLookupRow();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAddLookupRow]);

  const handleRemoveLookupRow = (rowId: string) => {
    setLookupRows((prev) => prev.filter((r) => r.id !== rowId));
    setLookupRowPriceBaselines((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setSavingLookupRowPrice((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setShowLookupRowDropdown((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setLookupRowHighlightIndex((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setLookupRowSelectedModel((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setActiveLookupRowId((curr) => (curr === rowId ? null : curr));
  };

  // Recompute dropdown rect on scroll/resize while a dropdown is open.
  useEffect(() => {
    const openIds = Object.keys(showLookupRowDropdown).filter(
      (id) => showLookupRowDropdown[id],
    );
    if (openIds.length === 0) return;
    const recompute = () => {
      setLookupDropdownRects((prev) => {
        const next = { ...prev };
        for (const id of openIds) {
          const el = lookupRowInputRefs.current[id];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          next[id] = {
            top: rect.bottom + 4,
            left: rect.left,
            width: Math.max(rect.width, 360),
          };
        }
        return next;
      });
    };
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [showLookupRowDropdown]);

  useEffect(() => {
    Object.assign(
      lookupRowHighlightIndexRef.current,
      lookupRowHighlightIndex,
    );
  }, [lookupRowHighlightIndex]);

  const handleLookupRowSearchChange = (rowId: string, value: string) => {
    setLookupRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        let partId = r.partId;
        if (partId) {
          const selected = lookupPartsPool.find((p) => p.id === partId);
          if (!selected || getItemLabel(selected) !== value) {
            partId = "";
          }
        }
        return { ...r, search: value, partId };
      }),
    );
    setLookupRowHighlightIndex((prev) => ({ ...prev, [rowId]: 0 }));
    lookupRowHighlightIndexRef.current[rowId] = 0;
    setShowLookupRowDropdown((prev) => ({ ...prev, [rowId]: true }));
  };

  const fetchPartStockForRow = useCallback(async (partId: string) => {
    if (!partId) return;
    setLoadingStockBalances((prev) => ({ ...prev, [partId]: true }));
    try {
      const resp: any = await apiClient.getPartCostLookup(partId);
      const data = resp?.data || resp || {};
      const current = Number(data.current_stock ?? 0);
      const reserved = Number(data.reserved_stock ?? 0);
      const available = Number.isFinite(Number(data.available_stock))
        ? Number(data.available_stock)
        : Math.max(0, current - reserved);
      const avgCost = Number(data.avg_cost ?? data.avgCost ?? 0);
      setPartStockBalances((prev) => ({
        ...prev,
        [partId]: {
          current_stock: current,
          reserved_stock: reserved,
          available_stock: available,
          avg_cost: Number.isFinite(avgCost) ? avgCost : undefined,
        },
      }));
    } catch {
      // leave whatever we had
    } finally {
      setLoadingStockBalances((prev) => ({ ...prev, [partId]: false }));
    }
  }, []);

  useEffect(() => {
    const partIds = Array.from(
      new Set(
        lookupRows
          .map((row) => String(row.partId || "").trim())
          .filter(Boolean),
      ),
    );
    if (partIds.length === 0) {
      setPartExpectedArrivals({});
      return;
    }

    let cancelled = false;
    const loadExpectedArrivals = async () => {
      try {
        const response: any = await apiClient.getPurchaseImportExpectedArrivals(partIds);
        if (cancelled) return;
        const data =
          response?.data && typeof response.data === "object" ? response.data : {};
        setPartExpectedArrivals(data);
      } catch {
        if (!cancelled) setPartExpectedArrivals({});
      }
    };

    void loadExpectedArrivals();
    return () => {
      cancelled = true;
    };
  }, [lookupRows]);

  // Refresh stock for visible dropdown options (same source as In Stock column).
  useEffect(() => {
    lookupRows.forEach((row) => {
      if (!showLookupRowDropdown[row.id]) return;
      getFilteredPartsForLookupRow(row.id)
        .slice(0, 30)
        .forEach((part) => {
          if (
            part.id &&
            partStockBalances[part.id] === undefined &&
            !loadingStockBalances[part.id]
          ) {
            void fetchPartStockForRow(part.id);
          }
        });
    });
  }, [
    showLookupRowDropdown,
    lookupRows,
    getFilteredPartsForLookupRow,
    partStockBalances,
    loadingStockBalances,
    fetchPartStockForRow,
  ]);

  const handleSelectPartForLookupRow = async (
    rowId: string,
    part: PartDetail,
  ) => {
    const priceA = parseFloat(part.priceA || "") || 0;
    const priceB = parseFloat(part.priceB || "") || 0;
    const priceM = parseFloat(part.priceM || "") || 0;
    const initialPriceType: "A" | "B" | "M" | undefined = priceA
      ? "A"
      : priceB
        ? "B"
        : priceM
          ? "M"
          : undefined;
    const initialUnit =
      initialPriceType === "A"
        ? priceA
        : initialPriceType === "B"
          ? priceB
          : initialPriceType === "M"
            ? priceM
            : 0;

    setLookupRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              partId: part.id || "",
              search: getItemLabel(part),
              priceA,
              priceB,
              priceM,
              selectedPriceType: initialPriceType,
              unitPrice: initialUnit,
            }
          : r,
      ),
    );
    setShowLookupRowDropdown((prev) => ({ ...prev, [rowId]: false }));
    setActiveLookupRowId(rowId);
    setLookupRowSelectedModel((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (part.id) {
      fetchPartStockForRow(part.id);
      void fetchPartImages(part.id);
      void fetchPartPriceLastUpdated(part.id);
    }
    setLookupRowPriceBaselines((prev) => ({
      ...prev,
      [rowId]: { priceA: priceA || null, priceB: priceB || null },
    }));
    await handleSelectPart(part);
  };

  const applyPartPricesToCaches = useCallback(
    (partId: string, priceA: number | null, priceB: number | null) => {
      const patchPart = (part: PartDetail): PartDetail =>
        part.id === partId
          ? {
              ...part,
              priceA: priceA === null ? "" : formatPartNumber(priceA),
              priceB: priceB === null ? "" : formatPartNumber(priceB),
            }
          : part;

      setPartsData((prev) => prev.map(patchPart));
      setSearchResults((prev) => prev.map(patchPart));
      setExternalLookupParts((prev) => prev.map(patchPart));
      setLookupRowSearchResults((prev) => prev.map(patchPart));
      setAlternateItems((prev) => prev.map(patchPart));
      setSelectedPart((prev) =>
        prev?.id === partId ? patchPart(prev) : prev,
      );
      setLookupRows((prev) =>
        prev.map((r) => {
          if (r.partId !== partId) return r;
          const next = {
            ...r,
            priceA: priceA ?? undefined,
            priceB: priceB ?? undefined,
          };
          if (r.selectedPriceType === "A") {
            next.unitPrice = priceA ?? undefined;
          } else if (r.selectedPriceType === "B") {
            next.unitPrice = priceB ?? undefined;
          }
          return next;
        }),
      );
    },
    [],
  );

  const handleLookupRowPriceChange = (
    rowId: string,
    field: "priceA" | "priceB",
    raw: string,
  ) => {
    const parsed = raw === "" ? undefined : Number.parseFloat(raw);
    const value =
      raw === "" || parsed === undefined || Number.isNaN(parsed)
        ? undefined
        : parsed;
    setLookupRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = { ...r, [field]: value };
        if (field === "priceA" && r.selectedPriceType === "A") {
          next.unitPrice = value;
        }
        if (field === "priceB" && r.selectedPriceType === "B") {
          next.unitPrice = value;
        }
        return next;
      }),
    );
  };

  const handleSaveLookupRowPrice = async (rowId: string) => {
    const row = lookupRows.find((r) => r.id === rowId);
    if (!row?.partId) return;

    const baseline = lookupRowPriceBaselines[rowId] || {
      priceA: null,
      priceB: null,
    };
    const currentA = row.priceA ?? null;
    const currentB = row.priceB ?? null;
    const aChanged = currentA !== (baseline.priceA ?? null);
    const bChanged = currentB !== (baseline.priceB ?? null);
    if (!aChanged && !bChanged) return;

    setSavingLookupRowPrice((prev) => ({ ...prev, [rowId]: true }));
    try {
      const payload: { priceA?: number; priceB?: number } = {};
      if (aChanged && currentA !== null) payload.priceA = currentA;
      if (bChanged && currentB !== null) payload.priceB = currentB;
      if (Object.keys(payload).length === 0) return;

      const response = (await apiClient.updatePartPrices(
        row.partId,
        payload,
      )) as { error?: string };
      if (response?.error) {
        toast({
          title: "Failed to update price",
          description: response.error,
          variant: "destructive",
        });
        return;
      }

      const nextA = aChanged ? currentA : baseline.priceA;
      const nextB = bChanged ? currentB : baseline.priceB;
      setLookupRowPriceBaselines((prev) => ({
        ...prev,
        [rowId]: { priceA: nextA, priceB: nextB },
      }));
      applyPartPricesToCaches(row.partId, nextA, nextB);
      const now = new Date().toISOString();
      setPartPriceLastUpdatedByPartId((prev) => ({
        ...prev,
        [row.partId]: {
          priceA: aChanged ? now : (prev[row.partId]?.priceA ?? null),
          priceB: bChanged ? now : (prev[row.partId]?.priceB ?? null),
        },
      }));
      toast({ title: "Price updated" });
    } catch (error: any) {
      toast({
        title: "Failed to update price",
        description: error?.message || String(error),
        variant: "destructive",
      });
    } finally {
      setSavingLookupRowPrice((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
  };

  const handleUpdateLookupRow = (
    rowId: string,
    patch: Partial<LookupRow>,
  ) => {
    setLookupRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    );
  };

  // Ensure a PartDetail is present in the lookup pool. We push into a
  // dedicated cache (`externalLookupParts`) instead of `searchResults` because
  // `searchResults` is reset by the debounced item-search effect whenever
  // `itemSearch` changes — which would wipe the freshly-added part roughly
  // 400ms later, leaving the row's display columns blank.
  const ensurePartInLookupPool = (part: PartDetail) => {
    if (!part?.id) return;
    setExternalLookupParts((prev) =>
      prev.some((p) => p.id === part.id) ? prev : [...prev, part],
    );
  };

  // Swap the currently-active lookup row's part with the chosen alternate part.
  // Falls back to the first empty row, otherwise creates a new row.
  const handleSwapWithAlternate = async (alternate: PartDetail) => {
    if (!alternate?.id) return;
    ensurePartInLookupPool(alternate);
    let targetRowId = activeLookupRowId;
    if (!targetRowId) {
      const empty = lookupRows.find((r) => !r.partId);
      if (empty) {
        targetRowId = empty.id;
      } else {
        const newRow = makeLookupRow();
        targetRowId = newRow.id;
        setLookupRows((prev) => [...prev, newRow]);
        // Allow React to flush the new row before populating it.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await handleSelectPartForLookupRow(targetRowId, alternate);
    toast({
      title: "Item swapped",
      description: `Switched to ${alternate.partNo || alternate.masterPart}.`,
    });
  };

  // Resolve a `ModelAssociationItem` to a full `PartDetail`. Tries the local
  // pool first; falls back to the part-detail API.
  const resolveAssociationToPartDetail = async (
    item: ModelAssociationItem,
  ): Promise<PartDetail | null> => {
    if (!item?.partId) return null;
    const cached = lookupPartsPool.find((p) => p.id === item.partId);
    if (cached) return cached;
    try {
      const resp: any = await apiClient.getPart(item.partId);
      const p = resp?.data || resp;
      if (!p?.id) return null;
      const formatNumber = (val: any): string => {
        if (val === null || val === undefined || val === "") return "0";
        const num = parseFloat(val);
        if (isNaN(num)) return "0";
        return num % 1 === 0 ? String(num) : num.toFixed(2);
      };
      return {
        id: String(p.id),
        partNo: String(p.master_part_no || p.masterPart || item.partNo || "")
          .trim() || "N/A",
        masterPart: String(p.part_no || p.partNo || item.masterPart || "")
          .trim() || "N/A",
        brand: String(p.brand_name || p.brand || item.brand || "").trim() ||
          "N/A",
        description: String(p.description || item.description || "").trim() ||
          "No description",
        category: String(p.category_name || p.category || "").trim() || "N/A",
        subCategory: String(p.subcategory_name || p.subcategory || "").trim() ||
          "N/A",
        application: String(
          p.application_name ||
            p.application?.name ||
            p.application ||
            item.application ||
            "",
        ).trim() || "N/A",
        uom: String(p.uom || "NOS").trim(),
        hsCode: String(p.hs_code || p.hsCode || "").trim() || "N/A",
        weight: formatNumber(p.weight),
        cost: formatNumber(p.cost),
        priceA: formatNumber(p.price_a || p.priceA),
        priceB: formatNumber(p.price_b || p.priceB),
        priceM: formatNumber(p.price_m || p.priceM),
        origin: String(p.origin || "").trim() || "N/A",
        grade: String(p.grade || "A").trim(),
        status: ((p.status || "active") as string).toUpperCase() === "ACTIVE"
          ? "A"
          : "I",
        rackNo: "N/A",
        reOrderLevel: formatNumber(p.reorder_level || p.reorderLevel),
        quantity: Number(item.quantity || 0),
      };
    } catch {
      return null;
    }
  };

  // Add a Part Association item as a new row in the lookup table.
  const handleAddAssociationToLookup = async (item: ModelAssociationItem) => {
    const part = await resolveAssociationToPartDetail(item);
    if (!part) {
      toast({
        title: "Could not add part",
        description: "Failed to resolve part details for this association.",
        variant: "destructive",
      });
      return;
    }
    ensurePartInLookupPool(part);
    // Reuse the first empty row if present; otherwise append a new row.
    const empty = lookupRows.find((r) => !r.partId);
    let targetRowId: string;
    if (empty) {
      targetRowId = empty.id;
    } else {
      const newRow = makeLookupRow();
      targetRowId = newRow.id;
      setLookupRows((prev) => [...prev, newRow]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await handleSelectPartForLookupRow(targetRowId, part);
    toast({
      title: "Item added",
      description: `Added ${part.partNo || part.masterPart} to the items table.`,
    });
  };

  const lookupModelChips = (partId: string) =>
    partModelsByPartId[partId] ||
    (activeLookupRowId &&
    lookupRows.find((r) => r.id === activeLookupRowId)?.partId === partId
      ? partModels.map((m) => ({
          id: String(m.id ?? ""),
          name: String(m.name ?? ""),
          qtyUsed: Number(m.qtyUsed ?? 0),
        }))
      : []);

  const handleModelAssociationClick = async (modelName: string) => {
    await loadModelAssociations(modelName);
  };

  const handleRefreshParts = async () => {
    setLoadingParts(true);
    try {
      const [partsResponse, balancesResponse] = await Promise.all([
        apiClient.getParts({
          status: 'active',
          limit: 'all',
          page: 1
        }),
        apiClient.getStockBalances({ limit: 10000 }).catch(() => ({ data: [], error: null }))
      ]);

      let partsDataArray: any[] = [];
      if (Array.isArray(partsResponse)) {
        partsDataArray = partsResponse;
      } else if ((partsResponse as any).data && Array.isArray((partsResponse as any).data)) {
        partsDataArray = (partsResponse as any).data;
      } else if ((partsResponse as any).pagination && (partsResponse as any).data) {
        partsDataArray = (partsResponse as any).data;
      }

      let balancesData: any[] = [];
      if (Array.isArray(balancesResponse)) {
        balancesData = balancesResponse;
      } else if ((balancesResponse as any).data && Array.isArray((balancesResponse as any).data)) {
        balancesData = (balancesResponse as any).data;
      }

      const rackMapData: Record<string, string> = {};
      const stockMapData: Record<string, number> = {};
      if (Array.isArray(balancesData)) {
        balancesData.forEach((b: any) => {
          if (b.part_id) {
            const loc =
              b.location ||
              (b.rack && b.shelf
                ? `${b.rack}/${b.shelf}`
                : b.rack || b.shelf || b.rack_no || "");
            if (loc) rackMapData[b.part_id] = loc;
            if (b.current_stock !== undefined && b.current_stock !== null) {
              stockMapData[b.part_id] = b.current_stock;
            }
          }
        });
      }
      setRackMap(rackMapData);
      setStockMap(stockMapData);

      // Create part ID map
      const idMap: Record<string, string> = {};
      const modelMapUpdates: Record<
        string,
        { id: string; name: string; qtyUsed: number }[]
      > = {};

      // Format numbers properly
      const formatNumber = (val: any): string => {
        if (val === null || val === undefined || val === '') return '0';
        const num = parseFloat(val);
        if (isNaN(num)) return '0';
        return num % 1 === 0 ? String(num) : num.toFixed(2);
      };

      const transformedParts: PartDetail[] = partsDataArray
        .filter((p: any) => p.status === 'active' || !p.status)
        .map((p: any) => {
          const partNo = String(p.part_no || p.partNo || '').trim();
          if (partNo && p.id) {
            idMap[partNo] = p.id;
            modelMapUpdates[p.id] = extractPartModels(p);
          }

          return {
            id: p.id,
            partNo: String(p.master_part_no || p.masterPart || p.master_part_no || '').trim() || 'N/A',
            masterPart: partNo,
            brand: String(p.brand_name || p.brand || '').trim() || 'N/A',
            description: String(p.description || p.part_no || '').trim() || 'No description',
            category: String(p.category_name || p.category || '').trim() || 'N/A',
            subCategory: String(p.subcategory_name || p.subcategory || '').trim() || 'N/A',
            application:
              String(p.application_name || p.application?.name || p.application || '').trim() ||
              'N/A',
            uom: String(p.uom || 'NOS').trim(),
            hsCode: String(p.hs_code || p.hsCode || '').trim() || 'N/A',
            weight: formatNumber(p.weight),
            cost: formatNumber(p.cost),
            priceA: formatNumber(p.price_a || p.priceA),
            priceB: formatNumber(p.price_b || p.priceB),
            priceM: formatNumber(p.price_m || p.priceM),
            origin: String(p.origin || '').trim() || 'N/A',
            grade: String(p.grade || 'A').trim(),
            status: (p.status || 'active').toUpperCase() === 'ACTIVE' ? 'A' : 'I',
            rackNo: rackMapData[p.id] || 'N/A',
            reOrderLevel: formatNumber(p.reorder_level || p.reorderLevel),
            quantity: resolvePartStockQty(p),
          };
        })
        .filter((p: PartDetail) => p.partNo && p.partNo.trim() !== '');

      setPartIdMap(idMap);

      setPartsData(shareImagesAcrossFamilyItems(transformedParts));
      setPartModelsByPartId((prev) => ({ ...prev, ...modelMapUpdates }));
      toast({
        title: "Parts Refreshed",
        description: `Loaded ${transformedParts.length} parts from database.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to refresh parts",
        variant: "destructive",
      });
    } finally {
      setLoadingParts(false);
    }
  };

  const handleView = async (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setViewDialogOpen(true);
    setLoadingInquiryDetails(true);

    try {
      // Fetch full inquiry details with items
      const response = await apiClient.getSalesInquiry(inquiry.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: "Failed to load inquiry details",
          variant: "destructive",
        });
        setFullInquiryData(inquiry);
      } else {
        const inquiryData = (response as any).data || response;
        setFullInquiryData(inquiryData);
      }
    } catch (error: any) {
      setFullInquiryData(inquiry);
    } finally {
      setLoadingInquiryDetails(false);
    }
  };

  const handleDeleteClick = (inquiry: Inquiry) => {
    setInquiryToDelete(inquiry);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!inquiryToDelete) return;

    try {
      const response = await apiClient.deleteSalesInquiry(inquiryToDelete.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to delete inquiry",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Inquiry ${inquiryToDelete.inquiryNo} has been deleted.`,
      });

      // Refresh inquiries list
      const inquiriesResponse = await apiClient.getSalesInquiries();
      const inquiriesData = Array.isArray(inquiriesResponse) ? inquiriesResponse : ((inquiriesResponse as any).data || []);
      setInquiries(inquiriesData as any);

      setDeleteDialogOpen(false);
      setInquiryToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete inquiry",
        variant: "destructive",
      });
    }
  };

  const handleDeletePO = (po: any) => {
    setPoToDelete(po);
    setDeletePODialogOpen(true);
  };

  const handleDeletePOConfirm = async () => {
    if (!poToDelete || !poToDelete.id) return;

    try {
      const response = await apiClient.deletePurchaseOrder(poToDelete.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to delete purchase order",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Purchase Order ${poToDelete.po_number || poToDelete.id} has been deleted.`,
      });

      // Refresh purchase order history
      const partId = resolveSelectedPartId(selectedPart);
      if (partId) {
        const response = await apiClient.getPurchaseOrdersByPart(partId, {
          page: 1,
          limit: 100,
        });

        if (!(response as any).error) {
          const poData = Array.isArray(response) ? response : ((response as any).data || []);
          setPurchaseOrderHistory(poData as any);
        }
      }

      setDeletePODialogOpen(false);
      setPoToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase order",
        variant: "destructive",
      });
    }
  };

  const handleConvertToQuote = async (inquiry: Inquiry) => {
    try {
      const response = await apiClient.convertInquiryToQuotation(inquiry.id, {
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });

      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to convert inquiry to quotation",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Quotation Created",
        description: `Inquiry ${inquiry.inquiryNo} has been converted to a quotation.`,
      });

      // Refresh inquiries
      const inquiriesResponse = await apiClient.getSalesInquiries();
      const inquiriesData = Array.isArray(inquiriesResponse) ? inquiriesResponse : ((inquiriesResponse as any).data || []);
      setInquiries(inquiriesData as any);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to convert inquiry",
        variant: "destructive",
      });
    }
  };

  // Handle print inquiry
  const handlePrintInquiry = async (inquiry: Inquiry) => {
    // Fetch full inquiry details with items for printing
    try {
      const response = await apiClient.getSalesInquiry(inquiry.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: "Failed to load inquiry details for printing",
          variant: "destructive",
        });
        return;
      }
      const inquiryData = (response as any).data || response;
      setPrintInquiry(inquiryData);
      setTimeout(() => {
        printDocument(printRef);
        toast({
          title: "Print Initiated",
          description: `Inquiry ${inquiry.inquiryNo} is being printed.`,
        });
      }, 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load inquiry details",
        variant: "destructive",
      });
    }
  };

  const filteredInquiries = inquiries.filter(
    (inquiry) =>
      inquiry.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inquiry.inquiryNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inquiry.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const generateInquiryNo = () => {
    const nextNum = inquiries.length + 1;
    return `INQ-${String(nextNum).padStart(3, "0")}`;
  };

  const handleAddItem = async (partOverride?: PartDetail | null) => {
    const partToAdd = partOverride || selectedPart;
    if (!partToAdd || !partToAdd.id) {
      toast({
        title: "Validation Error",
        description: "Please select a part first",
        variant: "destructive",
      });
      return;
    }

    // Check if part is already in the items list
    const existingItemIndex = inquiryItems.findIndex(item => item.partId === partToAdd.id);
    if (existingItemIndex >= 0) {
      toast({
        title: "Item Already Added",
        description: "This part is already in the inquiry items. You can update the quantity.",
        variant: "default",
      });
      return;
    }

    // Fetch stock and reserved quantity
    let stock = partToAdd.quantity || 0;
    let reservedQty = 0;

    try {
      const stockResponse = await apiClient.getAvailableStock(partToAdd.id);
      if (!(stockResponse as any).error && (stockResponse as any).data) {
        stock = (stockResponse as any).data.available || (stockResponse as any).data.stock || stock;
        reservedQty = (stockResponse as any).data.reserved || 0;
      }
    } catch (error) {
      // Use quantity from partToAdd if available
      stock = partToAdd.quantity || 0;
    }

    const newItem: InquiryItem = {
      partId: partToAdd.id,
      quantity: 1,
      purchasePrice: parseFloat(partToAdd.cost) || 0,
      priceA: parseFloat(partToAdd.priceA) || 0,
      priceB: parseFloat(partToAdd.priceB) || 0,
      priceM: parseFloat(partToAdd.priceM) || 0,
      location: partToAdd.rackNo || '',
      stock: stock,
      reservedQty: reservedQty,
    };

    setInquiryItems((prev) => [...prev, newItem]);
    if (!partOverride) {
      setSelectedPart(null);
      setItemSearch("");
    }

    toast({
      title: "Item Added",
      description: `${partToAdd.partNo} has been added to the inquiry.`,
    });
  };

  const handleRemoveItem = (index: number) => {
    setInquiryItems(inquiryItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.customerName || !formData.subject) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields (Customer Name and Subject).",
        variant: "destructive",
      });
      return;
    }

    if (inquiryItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item to the inquiry.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createSalesInquiry({
        inquiryDate: inquiryDate.toISOString().split('T')[0],
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        subject: formData.subject,
        description: formData.description,
        status: formData.status,
        items: inquiryItems.map(item => ({
          partId: item.partId,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          priceA: item.priceA,
          priceB: item.priceB,
          priceM: item.priceM,
          location: item.location,
        })),
      });

      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to create inquiry",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Inquiry Created",
        description: `Inquiry has been created successfully.`,
      });

      // Reset form
      setFormData({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        subject: "",
        description: "",
        status: "New",
      });
      setInquiryItems([]);
      setShowForm(false);

      // Refresh inquiries
      const inquiriesResponse = await apiClient.getSalesInquiries();
      const inquiriesData = Array.isArray(inquiriesResponse) ? inquiriesResponse : ((inquiriesResponse as any).data || []);
      setInquiries(inquiriesData as any);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create inquiry",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setFormData({
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      subject: "",
      description: "",
      status: "New",
    });
    setShowForm(false);
  };

  const getStatusColor = (status: Inquiry["status"]) => {
    switch (status) {
      case "New":
        return "bg-blue-100 text-blue-800";
      case "In Progress":
        return "bg-yellow-100 text-yellow-800";
      case "Quoted":
        return "bg-green-100 text-green-800";
      case "Closed":
        return "bg-gray-100 text-gray-800";
      case "Cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  type InquiryConvertTarget = "invoice" | "quotation" | "dpo";
  type InquiryConvertItem = {
    partId: string;
    quantity: number;
    purchasePrice?: number;
    priceA?: number;
    priceB?: number;
    priceM?: number;
    partNo?: string;
    description?: string;
    location?: string;
  };
  type InquirySelectionDraft = {
    formData: typeof formData;
    inquiryItems: InquiryItem[];
    lookupRows: LookupRow[];
  };

  useEffect(() => {
    const raw = sessionStorage.getItem("salesInquirySelectionDraft");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as InquirySelectionDraft;
      if (draft.formData) setFormData(draft.formData);
      if (Array.isArray(draft.inquiryItems)) setInquiryItems(draft.inquiryItems);

      if (Array.isArray(draft.lookupRows) && draft.lookupRows.length > 0) {
        const restoredRows = draft.lookupRows.map((row, idx) => ({
          id: row.id || `restored-${Date.now()}-${idx}`,
          partId: row.partId || "",
          search: row.search || "",
          qty: Number(row.qty) || 0,
          unitPrice: row.unitPrice,
          priceA: row.priceA,
          priceB: row.priceB,
          priceM: row.priceM,
          selectedPriceType: row.selectedPriceType,
        }));
        setLookupRows(restoredRows);
      }
    } catch {
      // ignore malformed restore payload
    } finally {
      sessionStorage.removeItem("salesInquirySelectionDraft");
    }
  }, []);

  const getSelectedItemsForConversion = (): InquiryConvertItem[] => {
    if (inquiryItems.length > 0) {
      return inquiryItems
        .filter((item) => item.partId)
        .map((item) => {
          const part = partsData.find((p) => p.id === item.partId);
          return {
            partId: item.partId,
            quantity: Math.max(1, Number(item.quantity) || 1),
            purchasePrice: Number(item.purchasePrice || 0),
            priceA: Number(item.priceA || 0),
            priceB: Number(item.priceB || 0),
            priceM: Number(item.priceM || 0),
            partNo: part?.partNo,
            description: part?.description,
            location: item.location,
          };
        });
    }

    return lookupRows
      .filter((row) => row.partId)
      .map((row) => {
        const part = lookupPartsPool.find((p) => p.id === row.partId);
        return {
          partId: row.partId,
          quantity: Math.max(1, Number(row.qty) || 1),
          purchasePrice: Number(row.unitPrice || 0),
          priceA: Number(row.priceA || 0),
          priceB: Number(row.priceB || 0),
          priceM: Number(row.priceM || 0),
          partNo: part?.partNo,
          description: part?.description,
          location: part?.rackNo,
        };
      });
  };

  const handleConvertFromInquiry = (target: InquiryConvertTarget) => {
    const items = getSelectedItemsForConversion();
    if (items.length === 0) {
      toast({
        title: "No Items Selected",
        description:
          "Please add inquiry items (or set item quantities) before converting.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      source: "sales-inquiry",
      target,
      createdAt: new Date().toISOString(),
      inquiryNo: generateInquiryNo(),
      customerName: formData.customerName || "",
      customerEmail: formData.customerEmail || "",
      customerPhone: formData.customerPhone || "",
      subject: formData.subject || "",
      description: formData.description || "",
      items,
    };
    const selectionDraft: InquirySelectionDraft = {
      formData,
      inquiryItems,
      lookupRows,
    };
    sessionStorage.setItem(
      "salesInquirySelectionDraft",
      JSON.stringify(selectionDraft),
    );
    sessionStorage.setItem("salesInquiryConversionDraft", JSON.stringify(payload));

    if (target === "invoice") {
      navigate("/sales/invoice");
      return;
    }
    if (target === "quotation") {
      navigate("/sales/quotation");
      return;
    }
    navigate("/inventory/direct-purchase-order");
  };

  return (
    <div className="space-y-4">
      {/* View Inquiry Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inquiry Details - {selectedInquiry?.inquiryNo}</DialogTitle>
          </DialogHeader>
          {loadingInquiryDetails ? (
            <div className="py-8 text-center text-muted-foreground">Loading inquiry details...</div>
          ) : fullInquiryData ? (
            <div className="space-y-6">
              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Name</Label>
                  <div className="text-sm font-medium">{fullInquiryData.customerName}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Email</Label>
                  <div className="text-sm font-medium">{fullInquiryData.customerEmail || 'N/A'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Phone</Label>
                  <div className="text-sm font-medium">{fullInquiryData.customerPhone || 'N/A'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Inquiry Date</Label>
                  <div className="text-sm font-medium">
                    {fullInquiryData.inquiryDate ? format(new Date(fullInquiryData.inquiryDate), 'PPP') : 'N/A'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="text-sm font-medium">
                    <Badge className={getStatusColor(fullInquiryData.status)}>
                      {fullInquiryData.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Subject and Description */}
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <div className="text-sm font-medium">{fullInquiryData.subject}</div>
              </div>
              {fullInquiryData.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <div className="text-sm">{fullInquiryData.description}</div>
                </div>
              )}

              {/* Items Table - Professional Read-Only Inquiry Display */}
              {fullInquiryData.items && fullInquiryData.items.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Inquiry Items</Label>
                    <Badge variant="outline" className="text-xs">
                      {fullInquiryData.items.length} {fullInquiryData.items.length === 1 ? 'Item' : 'Items'}
                    </Badge>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <ListNumberHeader className="font-semibold" />
                          <TableHead className="font-semibold">Part No | Master Part</TableHead>
                          <TableHead className="font-semibold">Description</TableHead>
                          <TableHead className="font-semibold text-center">Requested Qty</TableHead>
                          <TableHead className="font-semibold text-right">Purchase Price</TableHead>
                          <TableHead className="font-semibold text-right">Price A</TableHead>
                          <TableHead className="font-semibold text-right">Price B</TableHead>
                          <TableHead className="font-semibold text-right">Price M</TableHead>
                          <TableHead className="font-semibold">Location</TableHead>
                          <TableHead className="font-semibold text-center">Available Qty</TableHead>
                          <TableHead className="font-semibold text-center w-[70px]">
                            Image
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fullInquiryData.items.map((item, index) => {
                          const stock = item.stock || 0;
                          const reserved = item.reservedQty || 0;
                          const availableQty = Math.max(0, stock - reserved);
                          const viewPart = partsData.find(
                            (p) => p.id === item.partId,
                          );

                          return (
                            <TableRow key={item.id || index}>
                              <ListNumberCell index={index} total={fullInquiryData.items.length} />
                              <TableCell className="font-medium">
                                {viewPart
                                  ? formatPartIdentityFromUi({
                                      partNo: viewPart.partNo,
                                      masterPart: viewPart.masterPart,
                                    })
                                  : item.part?.partNo || "N/A"}
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <div>{item.part?.description || 'N/A'}</div>
                                {item.part?.brand?.name && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    Brand: {item.part.brand.name}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-medium">{item.quantity || 0}</TableCell>
                              <TableCell className="text-right">Rs {formatPurchasePrice(item.purchasePrice)}</TableCell>
                              <TableCell className="text-right text-green-600">Rs {item.priceA?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell className="text-right text-green-600">Rs {item.priceB?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell className="text-right text-green-600">Rs {item.priceM?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell>{item.location || 'N/A'}</TableCell>
                              <TableCell className={cn(
                                "text-center font-semibold",
                                availableQty > 0 ? "text-blue-600" : "text-red-600"
                              )}>
                                {availableQty.toLocaleString('en-US')}
                              </TableCell>
                              <TableCell className="text-center align-top">
                                {renderPartImageThumbnail(
                                  item.partId,
                                  viewPart ?? null,
                                  "w-9 h-9",
                                  item.part?.partNo || undefined,
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items in this inquiry</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No inquiry data available</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inquiry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete inquiry <strong>{inquiryToDelete?.inquiryNo}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Purchase Order Confirmation Dialog */}
      <AlertDialog open={deletePODialogOpen} onOpenChange={setDeletePODialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Purchase Order <strong>{poToDelete?.po_number || poToDelete?.id}</strong>?
              This action cannot be undone and will remove all items associated with this purchase order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePOConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inquiry Form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">New Sales Inquiry</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => {
                setShowForm(false);
                setFormData({
                  customerName: "",
                  customerEmail: "",
                  customerPhone: "",
                  subject: "",
                  description: "",
                  status: "New",
                });
                setInquiryItems([]);
              }}>
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Email</Label>
                <Input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  placeholder="customer@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Phone</Label>
                <Input
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Enter subject"
                />
              </div>
              <div className="space-y-2">
                <Label>Inquiry Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !inquiryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {inquiryDate ? format(inquiryDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={inquiryDate}
                      onSelect={(date) => date && setInquiryDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
                rows={3}
              />
            </div>

            {/* Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Items</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Scroll to part lookup section
                    document.getElementById('part-lookup-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item from Part Lookup
                </Button>
              </div>

              {inquiryItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part No | Master Part</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Price A</TableHead>
                        <TableHead>Price B</TableHead>
                        <TableHead>Price M</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-center w-[70px]">Image</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inquiryItems.map((item, index) => {
                        const part = partsData.find(p => p.id === item.partId);
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {part
                                ? formatPartIdentityFromUi({
                                    partNo: part.partNo,
                                    masterPart: part.masterPart,
                                  })
                                : "N/A"}
                            </TableCell>
                            <TableCell>{part?.description || 'N/A'}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => {
                                  const newItems = [...inquiryItems];
                                  newItems[index].quantity = parseInt(e.target.value) || 1;
                                  setInquiryItems(newItems);
                                }}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>Rs {formatPurchasePrice(item.purchasePrice)}</TableCell>
                            <TableCell>Rs {item.priceA?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>Rs {item.priceB?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>Rs {item.priceM?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>{item.location || 'N/A'}</TableCell>
                            <TableCell className="text-center align-top">
                              {renderPartImageThumbnail(item.partId, part, "w-9 h-9")}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRemoveItem(index)}
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
              )}

              {inquiryItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No items added. Use the part lookup below to add items.</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setShowForm(false);
                setFormData({
                  customerName: "",
                  customerEmail: "",
                  customerPhone: "",
                  subject: "",
                  description: "",
                  status: "New",
                });
                setInquiryItems([]);
                setSelectedPart(null);
                setItemSearch("");
              }}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={inquiryItems.length === 0}>
                Create Inquiry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Part Lookup Section */}
      <Card id="part-lookup-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-semibold">Part Inquiry Lookup</CardTitle>
              </div>
              {/* <p className="text-sm text-muted-foreground mt-1">Search for part details using Item filter</p> */}
            </div>
            <div className="flex items-center gap-2">
              {!hideShortcuts && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleConvertFromInquiry("invoice")}
                  >
                    <FileText className="w-4 h-4" />
                    To Invoice
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleConvertFromInquiry("quotation")}
                  >
                    <ArrowRight className="w-4 h-4" />
                    To Quotation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleConvertFromInquiry("dpo")}
                  >
                    <Truck className="w-4 h-4" />
                    To Local Purchase
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshParts}
                disabled={loadingParts}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loadingParts ? "animate-spin" : ""}`} />
                {loadingParts ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters + Add New Item */}
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
            <div className="flex items-center gap-2 shrink-0">
              <SearchableSelect
                options={lookupModelFilterOptions}
                value={lookupModelFilter || "__all__"}
                onValueChange={(value) =>
                  setLookupModelFilter(value === "__all__" ? "" : value)
                }
                placeholder="Model"
                className="w-[160px]"
              />
              <SearchableSelect
                options={lookupDescriptionFilterOptions}
                value={lookupDescriptionFilter || "__all__"}
                onValueChange={(value) =>
                  setLookupDescriptionFilter(value === "__all__" ? "" : value)
                }
                placeholder="Description"
                className="w-[170px]"
              />
              <SearchableSelect
                options={lookupApplicationFilterOptions}
                value={lookupApplicationFilter || "__all__"}
                onValueChange={(value) =>
                  setLookupApplicationFilter(value === "__all__" ? "" : value)
                }
                placeholder="Application"
                className="w-[170px]"
              />
            </div>
            <Button
              onClick={handleAddLookupRow}
              className="gap-2 bg-primary h-8 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add New Item (Alt + Z)
            </Button>
            {loadingPartDetails && (
              <Badge variant="outline" className="text-xs animate-pulse shrink-0">
                Enriching data...
              </Badge>
            )}
          </div>

          {/* Items Table (mirrors Sales Invoice item selection) — full width */}
          <div className="mt-4">
            <div className="border rounded-lg overflow-x-auto shadow-sm bg-card">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="border-b">
                    <ListNumberHeader className="font-bold text-foreground" />
                    <TableHead className="w-[300px] font-bold text-foreground">
                      Part Details
                    </TableHead>
                    <TableHead className="w-[90px] text-center font-bold text-foreground">
                      Brand
                    </TableHead>
                    <TableHead className="w-[170px] text-center font-bold text-foreground">
                      Application
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground">
                      Reserved
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground">
                      In Stock
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground">
                      Available Stock
                    </TableHead>
                    <TableHead className="w-[120px] text-center font-bold text-foreground">
                      New Stock Arrive
                    </TableHead>
                    {!hidePrices && (
                      <>
                        <TableHead className="w-[95px] text-center font-bold text-foreground">
                          Cost Price
                        </TableHead>
                        <TableHead className="w-[90px] text-center font-bold text-foreground">
                          Price A
                        </TableHead>
                        <TableHead className="w-[90px] text-center font-bold text-foreground">
                          Price B
                        </TableHead>
                      </>
                    )}
                    <TableHead className="w-[100px] text-center font-bold text-foreground">
                      Location
                    </TableHead>
                    <TableHead className="w-[70px] text-center font-bold text-foreground">
                      Image
                    </TableHead>
                    <TableHead className="w-[70px] text-center font-bold text-foreground">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lookupRows.map((row, index) => {
                    const rowPart =
                      lookupPartsPool.find((p) => p.id === row.partId) || null;
                    const rowFiltered = getFilteredPartsForLookupRow(row.id);
                    const rowHighlightIdx =
                      lookupRowHighlightIndex[row.id] ?? 0;
                    const rowDropdownOpen = !!showLookupRowDropdown[row.id];
                    const rowModels = lookupModelChips(row.partId || "");
                    const stockBalance = row.partId
                      ? partStockBalances[row.partId]
                      : undefined;
                    const stockLoading = row.partId
                      ? !!loadingStockBalances[row.partId]
                      : false;
                    const currentStock = stockBalance?.current_stock ??
                      (rowPart?.quantity || 0);
                    const reservedStock = stockBalance?.reserved_stock ?? 0;
                    const availableStock = stockBalance?.available_stock ??
                      Math.max(0, currentStock - reservedStock);
                    const balanceAvg = Number(stockBalance?.avg_cost ?? 0);
                    const partCost = parseFloat(rowPart?.cost || "") || 0;
                    const avgCost = balanceAvg > 0 ? balanceAvg : partCost;
                    const showQuantityUsed =
                      rowPart &&
                      rowModels.length > 0 &&
                      !lookupModelFilter.trim();
                    const priceDates = row.partId
                      ? partPriceLastUpdatedByPartId[row.partId]
                      : undefined;
                    const locationText =
                      (row.partId && rackMap[row.partId]) ||
                      rowPart?.rackNo ||
                      "—";
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={cn(
                            "border-b md:border-b-0 md:[&>td]:pb-1 align-top",
                            rowPart && "cursor-pointer hover:bg-muted/40",
                            activeLookupRowId === row.id && "bg-primary/5",
                          )}
                          onClick={(e) => {
                            if (!rowPart) return;
                            const target = e.target as HTMLElement;
                            if (
                              target.closest(
                                'input, textarea, button, a, [role="button"]',
                              )
                            ) {
                              return;
                            }
                            // Restore THIS row's own remembered model (if any)
                            // — not the globally-selected one, otherwise
                            // switching from item A (D9G) to item B (D9H)
                            // would force B onto D9G.
                            const rememberedModel =
                              lookupRowSelectedModel[row.id] || "";
                            setActiveLookupRowId(row.id);
                            handleSelectPart(rowPart).then(() => {
                              if (!rememberedModel) return;
                              const cached =
                                partModelsByPartId[rowPart.id || ""] ??
                                rowModels;
                              const stillHasModel = cached.some(
                                (m) =>
                                  String(m.name || "").toLowerCase() ===
                                  rememberedModel.toLowerCase(),
                              );
                              if (stillHasModel) {
                                loadModelAssociations(rememberedModel);
                              }
                            });
                          }}
                        >
                          <ListNumberCell index={index} total={lookupRows.length} className="align-top" />
                          <TableCell className="align-top">
                            <div
                              ref={(el) => {
                                lookupRowDropdownRefs.current[row.id] = el;
                              }}
                              className="relative space-y-2"
                            >
                              <div className="relative">
                                <Input
                                  ref={(el) => {
                                    lookupRowInputRefs.current[row.id] = el;
                                  }}
                                  placeholder="Select part..."
                                  value={row.search}
                                  onChange={(e) =>
                                    handleLookupRowSearchChange(
                                      row.id,
                                      e.target.value,
                                    )
                                  }
                                  onFocus={(e) => {
                                    openLookupRowDropdown(row.id);
                                    if (row.search || row.partId) {
                                      e.currentTarget.select();
                                    }
                                  }}
                                  onClick={(e) => {
                                    openLookupRowDropdown(row.id);
                                    if (row.search || row.partId) {
                                      e.currentTarget.select();
                                    }
                                  }}
                                  onKeyDownCapture={(e) => {
                                    const len = rowFiltered.length;
                                    const arrowDown =
                                      e.key === "ArrowDown" ||
                                      e.code === "ArrowDown";
                                    const arrowUp =
                                      e.key === "ArrowUp" ||
                                      e.code === "ArrowUp";

                                    const syncHi = (rowId: string, idx: number) => {
                                      lookupRowHighlightIndexRef.current[rowId] =
                                        idx;
                                    };

                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setShowLookupRowDropdown((prev) => ({
                                        ...prev,
                                        [row.id]: false,
                                      }));
                                      return;
                                    }

                                    if (arrowDown) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (len === 0) return;
                                      if (!rowDropdownOpen) {
                                        setShowLookupRowDropdown((prev) => ({
                                          ...prev,
                                          [row.id]: true,
                                        }));
                                        syncHi(row.id, 0);
                                        setLookupRowHighlightIndex((prev) => ({
                                          ...prev,
                                          [row.id]: 0,
                                        }));
                                        return;
                                      }
                                      setLookupRowHighlightIndex((prev) => {
                                        const cur = prev[row.id] ?? -1;
                                        const next = Math.min(cur + 1, len - 1);
                                        syncHi(row.id, next);
                                        return { ...prev, [row.id]: next };
                                      });
                                      return;
                                    }

                                    if (arrowUp) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (len === 0) return;
                                      if (!rowDropdownOpen) {
                                        setShowLookupRowDropdown((prev) => ({
                                          ...prev,
                                          [row.id]: true,
                                        }));
                                        const last = Math.max(len - 1, 0);
                                        syncHi(row.id, last);
                                        setLookupRowHighlightIndex((prev) => ({
                                          ...prev,
                                          [row.id]: last,
                                        }));
                                        return;
                                      }
                                      setLookupRowHighlightIndex((prev) => {
                                        const cur = prev[row.id] ?? 0;
                                        const next = Math.max(cur - 1, 0);
                                        syncHi(row.id, next);
                                        return { ...prev, [row.id]: next };
                                      });
                                      return;
                                    }

                                    if (e.key === "Enter") {
                                      if (len === 0) return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const hi = Math.min(
                                        Math.max(
                                          lookupRowHighlightIndexRef.current[
                                            row.id
                                          ] ?? 0,
                                          0,
                                        ),
                                        len - 1,
                                      );
                                      const picked = rowFiltered[hi];
                                      if (picked) {
                                        handleSelectPartForLookupRow(
                                          row.id,
                                          picked,
                                        );
                                      }
                                      return;
                                    }
                                  }}
                                  className={cn(
                                    "w-full h-10 text-sm",
                                    rowDropdownOpen &&
                                      "ring-2 ring-primary border-primary",
                                  )}
                                />
                              </div>
                              {rowDropdownOpen &&
                                typeof window !== "undefined" &&
                                lookupDropdownRects[row.id] &&
                                createPortal(
                                  <div
                                    ref={(el) => {
                                      lookupRowPortalRefs.current[row.id] = el;
                                    }}
                                    className="fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-[420px] overflow-auto"
                                    style={{
                                      top: `${lookupDropdownRects[row.id].top}px`,
                                      left: `${lookupDropdownRects[row.id].left}px`,
                                      width: `${Math.max(lookupDropdownRects[row.id].width, 460)}px`,
                                    }}
                                    onMouseDown={(e) => e.preventDefault()}
                                  >
                                    {loadingParts || lookupRowSearchLoading ? (
                                      <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                                        Loading items...
                                      </div>
                                    ) : rowFiltered.length > 0 ? (
                                      rowFiltered.map((part, idx) => {
                                        const stockDisplay = getPartStockDisplay(
                                          part,
                                          partStockBalances,
                                        );
                                        const availablePcs = stockDisplay.available;
                                        const brandLabel =
                                          part.brand && part.brand !== "N/A"
                                            ? part.brand
                                            : "";
                                        const partIdentifiers =
                                          formatPartIdentityFromUi({
                                            partNo: part.partNo,
                                            masterPart: part.masterPart,
                                          });
                                        const description =
                                          part.description ||
                                          "No description available";
                                        return (
                                          <button
                                            key={part.id}
                                            type="button"
                                            data-lookup-item-key={row.id}
                                            data-lookup-item-idx={idx}
                                            onMouseEnter={() =>
                                              setLookupRowHighlightIndex(
                                                (prev) => ({
                                                  ...prev,
                                                  [row.id]: idx,
                                                }),
                                              )
                                            }
                                            onClick={() =>
                                              handleSelectPartForLookupRow(
                                                row.id,
                                                part,
                                              )
                                            }
                                            className={cn(
                                              "w-full text-left px-3 py-2.5 hover:bg-accent hover:text-accent-foreground transition-colors border-b border-border last:border-b-0",
                                              idx === rowHighlightIdx &&
                                                "bg-accent text-accent-foreground",
                                              rowPart?.id === part.id &&
                                                idx !== rowHighlightIdx &&
                                                "bg-muted",
                                            )}
                                          >
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                              <div className="font-semibold text-sm">
                                                {partIdentifiers}
                                              </div>
                                              <div className="flex items-center gap-1 shrink-0">
                                                <span
                                                  className={cn(
                                                    "text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums",
                                                    availablePcs > 0
                                                      ? "bg-green-100 text-green-700"
                                                      : "bg-red-100 text-red-600",
                                                  )}
                                                >
                                                  {availablePcs} pcs
                                                </span>
                                              </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                              {description}
                                            </div>
                                            {brandLabel ? (
                                              <div className="text-[11px] text-muted-foreground/80 mt-1">
                                                {brandLabel}
                                              </div>
                                            ) : null}
                                          </button>
                                        );
                                      })
                                    ) : (
                                      <div className="px-4 py-3 text-sm text-muted-foreground">
                                        {row.search
                                          ? "No items found matching your search"
                                          : "No items available"}
                                      </div>
                                    )}
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-top">
                            <span className="text-xs font-medium text-foreground">
                              {rowPart?.brand && rowPart.brand !== "N/A"
                                ? rowPart.brand
                                : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center align-top px-2">
                            <span
                              className="text-xs font-medium text-foreground block break-words leading-snug"
                              title={rowPart?.application || ""}
                            >
                              {rowPart?.application &&
                              rowPart.application !== "N/A"
                                ? rowPart.application
                                : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center align-top">
                            <span className="text-sm font-semibold text-primary">
                              {!row.partId
                                ? "-"
                                : stockLoading
                                  ? "..."
                                  : reservedStock}
                            </span>
                          </TableCell>
                          <TableCell className="text-center align-top">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                className={cn(
                                  "text-sm font-bold",
                                  currentStock > 0
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {!row.partId
                                  ? "-"
                                  : stockLoading
                                    ? "..."
                                    : currentStock}
                              </span>
                              {row.partId && (
                                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-top">
                            {!row.partId ? (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            ) : stockLoading ? (
                              <span className="text-xs text-muted-foreground">
                                ...
                              </span>
                            ) : (
                              <Badge
                                variant={
                                  availableStock > 0 ? "default" : "destructive"
                                }
                                className="px-2 py-0.5 font-bold h-fit"
                              >
                                {availableStock}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center align-top">
                            {(() => {
                              const arrival = row.partId
                                ? partExpectedArrivals[row.partId]
                                : undefined;
                              if (!row.partId) {
                                return (
                                  <span className="text-xs text-muted-foreground">-</span>
                                );
                              }
                              if (!arrival?.estTimeDate) {
                                return (
                                  <span className="text-xs text-muted-foreground">-</span>
                                );
                              }
                              const arriveDate = new Date(arrival.estTimeDate);
                              const label = Number.isNaN(arriveDate.getTime())
                                ? "-"
                                : arriveDate.toLocaleDateString("en-GB");
                              return (
                                <span
                                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                                  title={
                                    arrival.poNumber
                                      ? `PO ${arrival.poNumber}${
                                          arrival.forwarder
                                            ? ` · ${arrival.forwarder}`
                                            : ""
                                        }`
                                      : undefined
                                  }
                                >
                                  {label}
                                </span>
                              );
                            })()}
                          </TableCell>
                          {!hidePrices && (
                          <TableCell className="text-center align-top">
                            {!row.partId ? (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            ) : avgCost > 0 ? (
                              <span className="text-sm font-semibold tabular-nums">
                                {avgCost.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            ) : stockLoading ? (
                              <span className="text-xs text-muted-foreground">
                                ...
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          )}
                          {!hidePrices && (
                          <TableCell className="text-center align-top p-1">
                            {!row.partId ? (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.priceA ?? ""}
                                  onChange={(e) =>
                                    handleLookupRowPriceChange(
                                      row.id,
                                      "priceA",
                                      e.target.value,
                                    )
                                  }
                                  onBlur={() => {
                                    void handleSaveLookupRowPrice(row.id);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateLookupRow(row.id, {
                                      selectedPriceType: "A",
                                      unitPrice: row.priceA,
                                    });
                                  }}
                                  disabled={!!savingLookupRowPrice[row.id]}
                                  className={cn(
                                    "h-8 w-full min-w-[76px] px-1.5 text-xs text-center tabular-nums",
                                    row.selectedPriceType === "A" &&
                                      "border-primary ring-1 ring-primary/30",
                                  )}
                                  placeholder="A"
                                />
                                <span className="block text-[9px] leading-tight text-muted-foreground font-bold">
                                  {formatPriceLastUpdatedLabel(priceDates?.priceA)}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          )}
                          {!hidePrices && (
                          <TableCell className="text-center align-top p-1">
                            {!row.partId ? (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.priceB ?? ""}
                                  onChange={(e) =>
                                    handleLookupRowPriceChange(
                                      row.id,
                                      "priceB",
                                      e.target.value,
                                    )
                                  }
                                  onBlur={() => {
                                    void handleSaveLookupRowPrice(row.id);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateLookupRow(row.id, {
                                      selectedPriceType: "B",
                                      unitPrice: row.priceB,
                                    });
                                  }}
                                  disabled={!!savingLookupRowPrice[row.id]}
                                  className={cn(
                                    "h-8 w-full min-w-[76px] px-1.5 text-xs text-center tabular-nums",
                                    row.selectedPriceType === "B" &&
                                      "border-primary ring-1 ring-primary/30",
                                  )}
                                  placeholder="B"
                                />
                                <span className="block text-[9px] leading-tight text-muted-foreground font-bold">
                                  {formatPriceLastUpdatedLabel(priceDates?.priceB)}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          )}
                          <TableCell className="text-center align-top">
                            {!row.partId ? (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            ) : (
                              <span
                                className="text-[11px] leading-tight text-foreground block max-w-[96px] mx-auto"
                                title={locationText}
                              >
                                {locationText !== "N/A" ? locationText : "—"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center align-top">
                            {renderPartImageThumbnail(row.partId, rowPart)}
                          </TableCell>
                          <TableCell className="text-center align-top">
                            <div className="flex items-center justify-center gap-1">
                              {showForm && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  onClick={async () => {
                                    if (!rowPart) return;
                                    setActiveLookupRowId(row.id);
                                    await handleAddItem(rowPart);
                                  }}
                                  title="Add to Inquiry"
                                  disabled={!rowPart}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveLookupRow(row.id)}
                                title="Remove row"
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {showQuantityUsed ? (
                          <TableRow
                            key={`${row.id}-qty-used`}
                            className="border-b bg-muted/20"
                          >
                            <TableCell
                              colSpan={hidePrices ? 10 : 13}
                              className="px-4 pt-0 pb-2"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                                  Quantity Used
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {rowModels.map((m, idx) => {
                                    const isActiveModel =
                                      activeLookupRowId === row.id &&
                                      selectedModelName &&
                                      String(m.name || "").toLowerCase() ===
                                        selectedModelName.toLowerCase();
                                    return (
                                      <button
                                        key={`${row.id}-qu-${idx}`}
                                        type="button"
                                        onClick={async () => {
                                          if (!rowPart) return;
                                          setActiveLookupRowId(row.id);
                                          setLookupRowSelectedModel((prev) => ({
                                            ...prev,
                                            [row.id]: m.name,
                                          }));
                                          const samePart =
                                            Boolean(selectedPart?.id) &&
                                            selectedPart?.id === rowPart.id;
                                          if (!samePart) {
                                            await handleSelectPart(rowPart);
                                          }
                                          await loadModelAssociations(m.name);
                                        }}
                                        className={cn(
                                          "inline-flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border transition-colors text-left min-w-[58px]",
                                          isActiveModel
                                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                            : "bg-background border-border/50 hover:bg-primary/10 hover:border-primary/40",
                                        )}
                                        title="Click to view part association"
                                      >
                                        <span
                                          className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider",
                                            isActiveModel
                                              ? "text-primary-foreground"
                                              : "text-foreground",
                                          )}
                                        >
                                          {m.name}
                                        </span>
                                        {m.qtyUsed ? (
                                          <span
                                            className={cn(
                                              "font-bold text-[11px] shrink-0",
                                              isActiveModel
                                                ? "text-primary-foreground"
                                                : "text-primary",
                                            )}
                                          >
                                            {m.qtyUsed}
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Alternate Items (full width) */}
          <div className="mt-6">
            <div className="rounded-md border bg-card p-3 flex flex-col min-h-[160px]">
              <div className="mb-2">
                <div className="text-sm font-semibold">Alternate Items</div>
                {/* <div className="text-xs text-muted-foreground">
                  Match by Part No / Master Part
                </div> */}
              </div>
              <div className="rounded-md border bg-card overflow-y-auto flex-1 min-h-0 min-w-0 max-h-[520px]">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <ListNumberHeader className="text-xs w-9 px-2" />
                      <TableHead className="text-xs w-[22%] px-2">Part</TableHead>
                      <TableHead className="text-xs w-[28%] px-2">Description</TableHead>
                      <TableHead className="text-xs w-14 px-2">Brand</TableHead>
                      <TableHead className="text-xs text-right w-[4.75rem] px-2 whitespace-nowrap">Stock</TableHead>
                      <TableHead className="text-xs text-center w-16 px-2">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedPart ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground italic">
                          Select a part to view alternate items.
                        </TableCell>
                      </TableRow>
                    ) : loadingAlternateItems ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                            Loading alternates...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : alternateItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground italic">
                          No alternate items found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      alternateItems.map((item, index) => (
                        <TableRow key={`${item.id || item.partNo}-${index}`} className="hover:bg-muted/20">
                          <ListNumberCell index={index} total={alternateItems.length} className="text-xs px-2 py-1.5 whitespace-nowrap" />
                          <TableCell
                            className="text-xs font-medium px-2 py-1.5 max-w-0 truncate"
                            title={formatPartIdentityFromUi({
                              partNo: item.partNo,
                              masterPart: item.masterPart,
                            })}
                          >
                            {formatPartIdentityFromUi({
                              partNo: item.partNo,
                              masterPart: item.masterPart,
                            })}
                          </TableCell>
                          <TableCell
                            className="text-xs px-2 py-1.5 max-w-0 truncate"
                            title={item.description || "N/A"}
                          >
                            {item.description || "N/A"}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1.5 whitespace-nowrap">{item.brand || "N/A"}</TableCell>
                          <TableCell className="text-xs text-right font-semibold px-2 py-1.5 whitespace-nowrap tabular-nums">
                            {Number(item.quantity || 0).toLocaleString("en-US")}
                          </TableCell>
                          <TableCell className="text-xs text-center px-2 py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              onClick={() => handleSwapWithAlternate(item)}
                              title="Switch active item to this alternate"
                              disabled={!item.id}
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* History + Part Association */}
          <div className="mt-6 grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3 space-y-4">
              {/* Last Sales Invoice — always visible */}
              <div className="rounded-md border bg-card p-3">
                <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Last Sales Invoice
                  {selectedPart && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      for {selectedPart.partNo}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <ListNumberHeader className="text-xs" />
                        <TableHead className="text-xs">Invoice No</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        {!hidePrices && (
                          <>
                            <TableHead className="text-xs">Unit Price</TableHead>
                            <TableHead className="text-xs">Line Total</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!selectedPart ? (
                        <TableRow>
                          <TableCell
                            colSpan={hidePrices ? 5 : 7}
                            className="text-center py-8 text-muted-foreground text-sm opacity-50"
                          >
                            Select a part to view sales history
                          </TableCell>
                        </TableRow>
                      ) : loadingSalesInvoiceHistory ? (
                        <TableRow>
                          <TableCell
                            colSpan={hidePrices ? 5 : 7}
                            className="text-center py-8 text-muted-foreground text-sm"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                              Loading sales invoice history...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : salesInvoiceHistory.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={hidePrices ? 5 : 7}
                            className="text-center py-8 text-muted-foreground text-sm italic"
                          >
                            No sales invoice history available for this part
                          </TableCell>
                        </TableRow>
                      ) : (
                        salesInvoiceHistory.map((invoice, index) => (
                          <TableRow key={invoice.id} className="hover:bg-muted/20">
                            <ListNumberCell
                              index={index}
                              total={salesInvoiceHistory.length}
                              className="text-xs"
                            />
                            <TableCell className="text-xs font-medium">
                              {invoice.invoice_no || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {invoice.invoice_date
                                ? format(new Date(invoice.invoice_date), "dd MMM yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {invoice.customer_name || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {invoice.item?.ordered_qty || 0}
                            </TableCell>
                            {!hidePrices && (
                              <>
                                <TableCell className="text-xs text-muted-foreground">
                                  Rs {invoice.item?.unit_price?.toFixed(2) || "0.00"}
                                </TableCell>
                                <TableCell className="text-xs font-medium">
                                  Rs {invoice.item?.line_total?.toFixed(2) || "0.00"}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Last Purchase — always visible */}
              <div className="rounded-md border bg-card p-3">
                <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Last Purchase
                  {selectedPart && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      for {selectedPart.partNo}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <ListNumberHeader className="text-xs" />
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">PO No</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        {!hidePrices && (
                          <>
                            <TableHead className="text-xs">Rate</TableHead>
                            <TableHead className="text-xs">Cost Price</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!selectedPart ? (
                        <TableRow>
                          <TableCell
                            colSpan={hidePrices ? 6 : 8}
                            className="text-center py-8 text-muted-foreground text-sm opacity-50"
                          >
                            Select a part to view purchase history
                          </TableCell>
                        </TableRow>
                      ) : loadingCombinedPurchaseHistory ? (
                        <TableRow>
                          <TableCell
                            colSpan={hidePrices ? 6 : 8}
                            className="text-center py-8 text-muted-foreground text-sm"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                              Loading purchase history...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : combinedPurchaseHistory.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={hidePrices ? 6 : 8}
                            className="text-center py-8 text-muted-foreground text-sm italic"
                          >
                            No local or import purchase history available for this part
                          </TableCell>
                        </TableRow>
                      ) : (
                        combinedPurchaseHistory.map((row, index) => (
                          <TableRow key={row.id} className="hover:bg-muted/20">
                            <ListNumberCell
                              index={index}
                              total={combinedPurchaseHistory.length}
                              className="text-xs"
                            />
                            <TableCell className="text-xs">
                              <Badge
                                variant={row.source === "local" ? "secondary" : "outline"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {row.source === "local" ? "Local" : "Import"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-medium">{row.poNo}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.date
                                ? format(new Date(row.date), "dd MMM yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.supplier}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.qty}
                            </TableCell>
                            {!hidePrices && (
                              <>
                                <TableCell className="text-xs text-muted-foreground">
                                  Rs {row.rate.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs font-medium">
                                  Rs {row.costPrice.toFixed(2)}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 rounded-md border bg-card p-3 flex flex-col min-h-[420px]">
              <div className="mb-2">
                <div className="text-sm font-semibold">Part Association</div>
                <div className="text-xs text-muted-foreground">
                  Model: <span className="font-medium text-foreground">{selectedModelName || "Click a model in Quantity Used"}</span>
                </div>
              </div>
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
              <div className="rounded-md border bg-card overflow-y-auto flex-1 min-h-0 min-w-0 max-h-[520px]">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <ListNumberHeader className="text-xs w-9 px-2" />
                      <TableHead className="text-xs w-[22%] px-2">Part</TableHead>
                      <TableHead className="text-xs w-[28%] px-2">Description</TableHead>
                      <TableHead className="text-xs w-14 px-2">Brand</TableHead>
                      <TableHead className="text-xs w-12 px-2">Model</TableHead>
                      <TableHead className="text-xs text-right w-[3.5rem] px-2 whitespace-nowrap">Qty</TableHead>
                      <TableHead className="text-xs text-center w-14 px-2">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingModelAssociations ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                            Loading associations...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : !selectedModelName ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground italic">
                          Select a model to view associated parts
                        </TableCell>
                      </TableRow>
                    ) : filteredModelAssociations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground italic">
                          {modelAssociations.length === 0
                            ? "No associated items found for this model."
                            : "No associated parts match the selected filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredModelAssociations.map((item, index) => (
                        <TableRow key={`${item.partId}-${index}`} className="hover:bg-muted/20">
                          <ListNumberCell index={index} total={filteredModelAssociations.length} className="text-xs px-2 py-1.5 whitespace-nowrap" />
                          <TableCell
                            className="text-xs font-medium px-2 py-1.5 max-w-0 truncate"
                            title={`${item.masterPart || "N/A"} | ${item.partNo || "N/A"}`}
                          >
                            {`${item.masterPart || "N/A"} | ${item.partNo || "N/A"}`}
                          </TableCell>
                          <TableCell
                            className="text-xs px-2 py-1.5 max-w-0 truncate"
                            title={item.description || "N/A"}
                          >
                            {item.description || "N/A"}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1.5 whitespace-nowrap">{item.brand || "N/A"}</TableCell>
                          <TableCell className="text-xs px-2 py-1.5 truncate max-w-0">{item.model || "N/A"}</TableCell>
                          <TableCell className="text-xs text-right font-semibold px-2 py-1.5 whitespace-nowrap tabular-nums">
                            {Number(item.quantity || 0).toLocaleString("en-US")}
                          </TableCell>
                          <TableCell className="text-xs text-center px-2 py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              onClick={() => handleAddAssociationToLookup(item)}
                              title="Add this part to the items table"
                              disabled={!item.partId}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Hidden Print Component */}
      {
        printInquiry && (
          <div className="hidden">
            <PrintableDocument
              ref={printRef}
              type="inquiry"
              data={{
                documentNo: printInquiry.inquiryNo,
                date: printInquiry.inquiryDate ? format(new Date(printInquiry.inquiryDate), 'PPP') : '',
                customerName: printInquiry.customerName,
                customerEmail: printInquiry.customerEmail || '',
                customerPhone: printInquiry.customerPhone || '',
                subject: printInquiry.subject,
                description: printInquiry.description || '',
                status: printInquiry.status,
                items: (printInquiry.items || []).map((item) => ({
                  partNo: item.part?.partNo || 'N/A',
                  description: item.part?.description || 'N/A',
                  quantity: item.quantity || 0,
                  unitPrice: item.priceA || item.purchasePrice || 0,
                  total: (item.quantity || 0) * (item.priceA || item.purchasePrice || 0),
                })),
              }}
            />
          </div>
        )
      }


      {/* Part image preview */}
      <Dialog open={partImageModalOpen} onOpenChange={setPartImageModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-background border-border">
          <DialogHeader className="sr-only">
            <DialogTitle>{partImageModalTitle || "Part Image"}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            {partImageModalImages.length > 0 &&
              partImageModalImages[partImageModalIndex] && (
                <img
                  src={partImageModalImages[partImageModalIndex]}
                  alt={partImageModalTitle || "Part"}
                  className="w-full h-auto max-h-[70vh] object-contain bg-muted/20"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage not available%3C/text%3E%3C/svg%3E';
                  }}
                />
              )}
            {partImageModalImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {partImageModalImages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPartImageModalIndex(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      partImageModalIndex === index
                        ? "bg-primary w-4"
                        : "bg-muted-foreground/50 hover:bg-muted-foreground",
                    )}
                    aria-label={`View image ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
          {partImageModalImages.length > 1 && (
            <div className="p-3 border-t border-border flex gap-2 overflow-x-auto">
              {partImageModalImages.map((img, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPartImageModalIndex(index)}
                  className={cn(
                    "flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all",
                    partImageModalIndex === index
                      ? "border-primary"
                      : "border-transparent hover:border-muted-foreground/50",
                  )}
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect fill="%23ddd" width="56" height="56"/%3E%3C/svg%3E';
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div >
  );
};