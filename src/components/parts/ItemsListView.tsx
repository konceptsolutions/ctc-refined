import { useState, useRef, useEffect, useMemo } from "react";
import {
  Search,
  Download,
  Printer,
  Plus,
  Upload,
  CheckCircle,
  Edit,
  Trash,
  ChevronDown,
  Image,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileJson,
  Clock,
  History,
  Package,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { ReservedQuantityManager } from "@/utils/reservedQuantityManager";
import { handleReserveStockFixed } from "@/utils/reserveStockHandler";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogFooter,
  DialogDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { openPrintHtml } from "@/utils/printUtils";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { CompactPartForm } from "./CompactPartForm";
import { usePageActions } from "@/permissions/pageActions";

export interface Item {
  id: string;
  masterPartNo: string;
  partNo: string;
  brand: string;
  type?: string;
  description: string;
  category: string;
  subCategory: string;
  application: string;
  origin?: string;
  status: "Active" | "Inactive";
  images: string[];
  priceUpdated?: boolean; // Track if price was recently updated
  createdAt?: string; // Creation date and time
  reservedQuantity?: number; // Reserved stock quantity
  stock?: number; // Current / total stock quantity
  reservedStock?: number; // Reserved from movements & reservations (API)
  canDelete?: boolean;
  deleteBlockReason?: string | null;
  cost?: number | null;
  purchasePrice?: number | null;
  avgCost?: number | null;
  weight?: string | number | null;
  duplicateGroupKey?: string;
  duplicateGroupSize?: number;
}

export function getItemDuplicateKey(
  item: Pick<Item, "partNo" | "masterPartNo" | "brand">,
): string {
  const partNo = String(item.partNo || "").trim().toLowerCase();
  const masterPartNo = String(item.masterPartNo || "").trim().toLowerCase();
  const brand = String(item.brand || "").trim().toLowerCase();
  return `part|${partNo}|${masterPartNo}|${brand}`;
}

const DUPLICATE_GROUP_BORDER = [
  "border-l-amber-500",
  "border-l-orange-500",
  "border-l-yellow-600",
  "border-l-rose-500",
  "border-l-violet-500",
] as const;

function getItemStockBreakdown(item: Item) {
  const total = Number(item.stock) || 0;
  const reserved = Number(item.reservedStock ?? 0) || 0;
  const available = Math.max(0, total - reserved);
  return { total, reserved, available };
}

interface KitDetailRow {
  itemPartId: string;
  masterPartNo: string;
  itemPartNo: string;
  itemDescription: string;
  brand: string;
  qtyPerKit: number;
  stock: number;
}

interface SearchFilters {
  search: string;
  master_part_no: string;
  part_no: string;
  brand_name: string;
  description: string;
  part_type: string;
  category_name: string;
  subcategory_name: string;
  application_name: string;
  duplicates_only: string;
  created_from_date: string;
  created_to_date: string;
  created_from_time: string;
  created_to_time: string;
}

interface ItemsListViewProps {
  items: Item[];
  loading?: boolean;
  currentPage?: number;
  itemsPerPage?: number;
  totalItems?: number;
  searchFilters?: SearchFilters;
  onFiltersChange?: (filters: SearchFilters) => void;
  onPageChange?: (page: number) => void;
  onItemsPerPageChange?: (limit: number) => void;
  onEdit?: (item: Item) => void;
  onItemSelect?: (item: Item) => void;
  onDelete?: (item: Item) => void;
  onBulkDelete?: (
    itemIds: string[],
  ) => Promise<{ success: string[]; failed: string[] }>;
  onBulkPartTypeChange?: (
    itemIds: string[],
    nextType: "single" | "kit",
    quantity: number,
  ) => Promise<void>;
  onItemsUpdate?: (updatedItems: Item[]) => void;
  onAddNew?: () => void;
  onStatusChange?: (item: Item, newStatus: "Active" | "Inactive") => void;
  showForm?: boolean;
  onCancelForm?: () => void;
  onSavePart?: (partData: any, isEdit: boolean, editItemId?: string) => void;
  editItem?: Item | null;
  forcedEditType?: "single" | "kit" | null;
  categoryOptions?: { value: string; label: string }[];
  subcategoryOptions?: {
    value: string;
    label: string;
    categoryName?: string;
  }[];
  applicationOptions?: { value: string; label: string }[];
  brandOptions?: { value: string; label: string }[];
  descriptionOptions?: { value: string; label: string }[];
  masterPartOptions?: { value: string; label: string }[];
  partNoOptions?: { value: string; label: string }[];
}

export const ItemsListView = ({
  items,
  loading = false,
  currentPage = 1,
  itemsPerPage = 25,
  totalItems = 0,
  searchFilters: externalFilters,
  onFiltersChange,
  onPageChange,
  onItemsPerPageChange,
  onEdit,
  onItemSelect,
  onDelete,
  onBulkDelete,
  onBulkPartTypeChange,
  onItemsUpdate,
  onAddNew,
  onStatusChange,
  showForm = false,
  onCancelForm,
  onSavePart,
  editItem,
  forcedEditType = null,
  categoryOptions = [],
  subcategoryOptions = [],
  applicationOptions = [],
  brandOptions = [],
  descriptionOptions = [],
  masterPartOptions = [],
  partNoOptions: partNoOptionsProp = [],
}: ItemsListViewProps) => {
  const { toast } = useToast();
  const {
    canEdit,
    canDelete,
    canStatus,
    canExport,
    canMenuMore,
  } = usePageActions("partentry.itemslist");
  const canShowExport = canExport || canMenuMore;
  const [pageJumpValue, setPageJumpValue] = useState<string>("");
  const [reserveStockDialogOpen, setReserveStockDialogOpen] = useState(false);
  const [selectedItemForReserve, setSelectedItemForReserve] =
    useState<Item | null>(null);
  const [reserveQuantity, setReserveQuantity] = useState<string>("");

  // Use external filters if provided, otherwise use local state
  const [localFilters, setLocalFilters] = useState<SearchFilters>({
    search: "",
    master_part_no: "",
    part_no: "",
    brand_name: "",
    description: "",
    part_type: "all",
    category_name: "all",
    subcategory_name: "all",
    application_name: "all",
    duplicates_only: "all",
    created_from_date: "",
    created_to_date: new Date().toISOString().split("T")[0], // Set to current date
    created_from_time: "",
    created_to_time: "",
  });

  // Local state for input values (for immediate UI updates)
  const [localInputValues, setLocalInputValues] = useState<SearchFilters>(
    externalFilters || localFilters,
  );

  // Sync local input values when external filters change
  useEffect(() => {
    if (externalFilters) {
      setLocalInputValues(externalFilters);
    }
  }, [externalFilters]);

  // Clear page jump value when page changes externally
  useEffect(() => {
    setPageJumpValue("");
  }, [currentPage]);

  const searchFilters = externalFilters || localFilters;
  const setSearchFilters = onFiltersChange || setLocalFilters;

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPriceUpdateHistory, setShowPriceUpdateHistory] = useState(false);
  const [selectedPriceUpdateItem, setSelectedPriceUpdateItem] =
    useState<Item | null>(null);
  const [currentItemPrices, setCurrentItemPrices] = useState<any>(null);
  const [loadingPriceData, setLoadingPriceData] = useState(false);
  const [makeKitDialogOpen, setMakeKitDialogOpen] = useState(false);
  const [breakKitDialogOpen, setBreakKitDialogOpen] = useState(false);
  const [selectedMakeKitItemId, setSelectedMakeKitItemId] = useState("");
  const [selectedBreakKitItemId, setSelectedBreakKitItemId] = useState("");
  const [kitDetailsLoading, setKitDetailsLoading] = useState(false);
  const [makeKitQuantity, setMakeKitQuantity] = useState<number | "">(1);
  const [breakKitQuantity, setBreakKitQuantity] = useState<number | "">(1);
  const [makeKitRows, setMakeKitRows] = useState<KitDetailRow[]>([]);
  const [breakKitRows, setBreakKitRows] = useState<KitDetailRow[]>([]);
  const [makeKitCurrentStock, setMakeKitCurrentStock] = useState(0);
  const [breakKitCurrentStock, setBreakKitCurrentStock] = useState(0);

  // Debounce timer ref for search
  const searchDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Format currency helper
  const formatCurrency = (value: number) => {
    return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Fetch current item prices when popup opens
  useEffect(() => {
    if (showPriceUpdateHistory && selectedPriceUpdateItem) {
      const fetchCurrentPrices = async () => {
        setLoadingPriceData(true);
        try {
          const response = await apiClient.getPart(selectedPriceUpdateItem.id);
          const partData = (response as any).data || response;
          if (partData) {
            setCurrentItemPrices({
              cost: partData.cost || 0,
              priceA: partData.price_a || partData.priceA || 0,
              priceB: partData.price_b || partData.priceB || 0,
              priceM: partData.price_m || partData.priceM || 0,
            });
          }
        } catch (error) {
        } finally {
          setLoadingPriceData(false);
        }
      };
      fetchCurrentPrices();
    } else {
      setCurrentItemPrices(null);
    }
  }, [showPriceUpdateHistory, selectedPriceUpdateItem]);

  // Use provided dropdown options if available, otherwise derive from current items
  // Ensure uniqueness using Set
  const useFilteredOptions = searchFilters.part_type !== "all";
  const categories =
    !useFilteredOptions && categoryOptions.length > 0
      ? [...new Set(categoryOptions.map((opt) => opt.value))]
      : [...new Set(items.map((item) => item.category).filter(Boolean))];

  // Filter subcategories based on selected category
  const selectedCategory = searchFilters.category_name;
  let subCategories: string[];
  if (!useFilteredOptions && subcategoryOptions.length > 0) {
    if (selectedCategory && selectedCategory !== "all") {
      // Filter subcategories to show ALL subcategories that belong to the selected category
      // Use categoryName from the API response, case-insensitive matching with normalization
      const selectedCatNormalized = (selectedCategory || "")
        .trim()
        .toLowerCase();
      const matchingSubs = subcategoryOptions.filter((opt) => {
        const optCategoryName = (opt.categoryName || "").trim().toLowerCase();
        return optCategoryName === selectedCatNormalized;
      });

      // Get unique subcategory names (deduplicate for display)
      subCategories = Array.from(new Set(matchingSubs.map((opt) => opt.value)));

      // Debug logging
    } else {
      // Show all subcategories when no category is selected, ensure uniqueness
      subCategories = Array.from(
        new Set(subcategoryOptions.map((opt) => opt.value)),
      );
    }
  } else {
    if (selectedCategory && selectedCategory !== "all") {
      // Fallback: Filter subcategories from items based on selected category
      subCategories = [
        ...new Set(
          items
            .filter(
              (item) => item.category === selectedCategory && item.subCategory,
            )
            .map((item) => item.subCategory)
            .filter(Boolean),
        ),
      ];
    } else {
      // Show all subcategories when no category is selected
      subCategories = [
        ...new Set(items.map((item) => item.subCategory).filter(Boolean)),
      ];
    }
  }

  const applications =
    !useFilteredOptions && applicationOptions.length > 0
      ? applicationOptions.map((opt) => opt.value)
      : [
        ...new Set(
          items
            .map((item) => (item.application || "").trim())
            .filter(
              (app: string) =>
                app &&
                app !== "null" &&
                app !== "undefined" &&
                app !== "." &&
                app.length > 0,
            ),
        ),
      ];

  // Since filtering is now server-side, we just use the items as-is
  const showDuplicateView = searchFilters.duplicates_only === "yes";

  const sortedItems = useMemo(() => {
    if (!showDuplicateView) return items;
    return [...items].sort((a, b) => {
      const keyA = a.duplicateGroupKey || getItemDuplicateKey(a);
      const keyB = b.duplicateGroupKey || getItemDuplicateKey(b);
      const byKey = keyA.localeCompare(keyB);
      if (byKey !== 0) return byKey;
      const byPart = a.partNo.localeCompare(b.partNo);
      if (byPart !== 0) return byPart;
      return a.id.localeCompare(b.id);
    });
  }, [items, showDuplicateView]);

  const filteredItems = sortedItems;

  const duplicateGroupedRows = useMemo(() => {
    if (!showDuplicateView) {
      return filteredItems.map((item) => ({
        item,
        groupNum: 0,
        isFirstInGroup: false,
        groupSize: 0,
      }));
    }

    let lastKey = "";
    let groupNum = 0;
    return filteredItems.map((item) => {
      const key = (item.duplicateGroupKey || getItemDuplicateKey(item)).trim();
      const isFirstInGroup = key !== lastKey;
      if (isFirstInGroup) {
        groupNum += 1;
        lastKey = key;
      }
      return {
        item,
        groupNum,
        isFirstInGroup,
        groupSize: item.duplicateGroupSize || 2,
      };
    });
  }, [filteredItems, showDuplicateView]);

  // Options for search filters
  // Use passed options if available (for full list), otherwise derive from current items (fallback)
  const finalMasterPartOptions = useMemo(() => {
    if (!useFilteredOptions && masterPartOptions.length > 0) return masterPartOptions;
    return Array.from(
      new Set(items.map((item) => item.masterPartNo).filter(Boolean)),
    ).map((val) => ({ value: val, label: val }));
  }, [items, masterPartOptions, useFilteredOptions]);

  const partNoOptions = useMemo(() => {
    if (!useFilteredOptions && partNoOptionsProp.length > 0) return partNoOptionsProp;
    return Array.from(
      new Set(items.map((item) => item.partNo).filter(Boolean)),
    ).map((val) => ({ value: val, label: val }));
  }, [items, partNoOptionsProp, useFilteredOptions]);

  const finalBrandOptions = useMemo(() => {
    if (!useFilteredOptions && brandOptions.length > 0) return brandOptions;
    return Array.from(
      new Set(items.map((item) => item.brand).filter(Boolean)),
    ).map((val) => ({ value: val, label: val }));
  }, [items, brandOptions, useFilteredOptions]);

  const finalDescriptionOptions = useMemo(() => {
    if (!useFilteredOptions && descriptionOptions.length > 0)
      return descriptionOptions;
    return Array.from(
      new Set(items.map((item) => item.description).filter(Boolean)),
    ).map((val) => ({ value: val, label: val }));
  }, [items, descriptionOptions, useFilteredOptions]);

  const makeKitItemOptions = useMemo(
    () =>
      items
        .filter((item) => (item.type || "single") === "kit")
        .map((item) => ({
          value: item.id,
          label: item.partNo || item.masterPartNo || item.id,
          description: `${item.partNo || "-"} | ${item.masterPartNo || "-"} | ${item.description || "-"} | ${item.brand || "-"}`,
        })),
    [items],
  );

  const breakKitItemOptions = useMemo(
    () =>
      items
        .filter((item) => (item.type || "single") === "kit")
        .map((item) => ({
          value: item.id,
          label: item.partNo || item.masterPartNo || item.id,
          description: `${item.partNo || "-"} | ${item.masterPartNo || "-"} | ${item.description || "-"} | ${item.brand || "-"}`,
        })),
    [items],
  );

  const makeRequiredRows = useMemo(() => {
    const qty =
      makeKitQuantity === "" ? 0 : Math.max(1, Number(makeKitQuantity || 1));
    return makeKitRows.map((row) => ({
      ...row,
      requiredQty: row.qtyPerKit * qty,
      enoughStock: row.stock >= row.qtyPerKit * qty,
    }));
  }, [makeKitRows, makeKitQuantity]);

  const makeKitHasInsufficientStock = useMemo(
    () => makeRequiredRows.some((row) => !row.enoughStock),
    [makeRequiredRows],
  );

  const makeKitValidationMessage = useMemo(() => {
    if (!selectedMakeKitItemId) return "Please select a kit item.";
    if (makeKitQuantity === "" || Number(makeKitQuantity) < 1)
      return "Please enter a valid quantity to make.";
    if (kitDetailsLoading) return "Loading associated items...";
    if (makeRequiredRows.length === 0) return "No associated kit items found.";
    if (makeKitHasInsufficientStock)
      return "Cannot make kit: stock is less than required quantity for one or more items.";
    return "";
  }, [
    selectedMakeKitItemId,
    makeKitQuantity,
    kitDetailsLoading,
    makeRequiredRows,
    makeKitHasInsufficientStock,
  ]);

  const breakReceiveRows = useMemo(() => {
    const qty =
      breakKitQuantity === "" ? 0 : Math.max(1, Number(breakKitQuantity || 1));
    return breakKitRows.map((row) => ({
      ...row,
      receiveQty: row.qtyPerKit * qty,
    }));
  }, [breakKitRows, breakKitQuantity]);

  const breakKitHasInsufficientStock = useMemo(() => {
    const qty =
      breakKitQuantity === "" ? 0 : Math.max(1, Number(breakKitQuantity || 1));
    return selectedBreakKitItemId !== "" && qty > breakKitCurrentStock;
  }, [selectedBreakKitItemId, breakKitQuantity, breakKitCurrentStock]);

  const breakKitValidationMessage = useMemo(() => {
    if (!selectedBreakKitItemId) return "Please select a kit item.";
    if (breakKitQuantity === "" || Number(breakKitQuantity) < 1)
      return "Please enter a valid quantity to break.";
    if (kitDetailsLoading) return "Loading associated items...";
    if (breakReceiveRows.length === 0) return "No associated kit items found.";
    if (breakKitHasInsufficientStock)
      return "Cannot break kit: quantity to break is greater than current kit stock.";
    return "";
  }, [
    selectedBreakKitItemId,
    breakKitQuantity,
    kitDetailsLoading,
    breakReceiveRows,
    breakKitHasInsufficientStock,
  ]);

  const loadKitDetails = async (
    kitPartId: string,
    mode: "make" | "break",
  ) => {
    if (!kitPartId) return;
    setKitDetailsLoading(true);
    try {
      const response = await apiClient.getKitOperationDetails(kitPartId);
      const data = ((response as any)?.data || response) as {
        kit_stock?: number;
        kit_items?: Array<{
          item_part_id?: string;
          master_part_no?: string;
          item_part_no?: string;
          item_description?: string;
          brand_name?: string;
          quantity?: number;
          stock?: number;
        }>;
        error?: string;
      };

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      const currentStock = Number(data.kit_stock || 0);
      const rows: KitDetailRow[] = Array.isArray(data.kit_items)
        ? data.kit_items
            .map((row) => ({
              itemPartId: String(row.item_part_id || "").trim(),
              masterPartNo: String(row.master_part_no || "").trim(),
              itemPartNo: String(row.item_part_no || "").trim(),
              itemDescription: String(row.item_description || "").trim(),
              brand: String(row.brand_name || "").trim(),
              qtyPerKit: Math.max(1, Number(row.quantity || 1)),
              stock: Number(row.stock || 0),
            }))
            .filter((row: KitDetailRow) => row.itemPartId)
        : [];

      if (mode === "make") {
        setMakeKitRows(rows);
        setMakeKitCurrentStock(currentStock);
      } else {
        setBreakKitRows(rows);
        setBreakKitCurrentStock(currentStock);
      }
    } catch (error: any) {
      toast({
        title: "Failed to load kit details",
        description: error?.message || "Could not fetch associated items",
        variant: "destructive",
      });
      if (mode === "make") {
        setMakeKitRows([]);
        setMakeKitCurrentStock(0);
      } else {
        setBreakKitRows([]);
        setBreakKitCurrentStock(0);
      }
    } finally {
      setKitDetailsLoading(false);
    }
  };

  // Debounced filter update function
  const updateFilter = (key: keyof SearchFilters, value: string) => {
    // Clear existing timer
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    // Update local input values first, then debounce using the latest merged filters
    setLocalInputValues((prev) => {
      const newFilters = { ...prev, [key]: value };
      searchDebounceTimerRef.current = setTimeout(() => {
        setSearchFilters(newFilters);
      }, 300);
      return newFilters;
    });
  };

  // Immediate update for dropdowns (no debounce needed)
  const updateFilterImmediate = (key: keyof SearchFilters, value: string) => {
    setLocalInputValues((prev) => {
      const newFilters = { ...prev, [key]: value };
      setSearchFilters(newFilters);
      return newFilters;
    });
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, []);

  const handleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map((item) => item.id));
    }
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const handleDownloadCSV = () => {
    const headers = [
      "Master Part No",
      "Part No",
      "Brand",
      "Description",
      "Category",
      "Sub Category",
      "Application",
      "Stock",
      "Status",
    ];
    const csvData = filteredItems.map((item) => {
      const { total, reserved, available } = getItemStockBreakdown(item);
      const stockLabel =
        reserved > 0
          ? `${total} (avail ${available}, rsv ${reserved})`
          : String(total);
      return [
      item.masterPartNo,
      item.partNo,
      item.brand,
      item.description,
      item.category,
      item.subCategory,
      item.application,
      stockLabel,
      item.status,
    ];
    });
    const csvContent = [
      headers.join(","),
      ...csvData.map((row) => row.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parts-list.csv";
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDeleteConfirm = () => {
    if (itemToDelete) {
      if (itemToDelete.canDelete === false) {
        toast({
          title: "Cannot Delete Item",
          description:
            itemToDelete.deleteBlockReason ||
            "This item cannot be deleted because it has stock or transaction history.",
          variant: "destructive",
        });
        setItemToDelete(null);
        setDeleteConfirmOpen(false);
        return;
      }

      onDelete?.(itemToDelete);
      toast({
        title: "Part Deleted",
        description: `${itemToDelete.partNo} has been deleted successfully`,
      });
      setItemToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  // Handle Reserve Stock - FIXED with localStorage
  const handleReserveStock = async () => {
    if (
      !selectedItemForReserve ||
      reserveQuantity === "" ||
      parseInt(reserveQuantity) < 0
    ) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid quantity (0 or greater)",
        variant: "destructive",
      });
      return;
    }

    const result = await handleReserveStockFixed({
      selectedItem: selectedItemForReserve,
      quantity: parseInt(reserveQuantity),
      items,
      onItemsUpdate,
      toast,
    });

    if (result.success) {
      setReserveStockDialogOpen(false);
      setReserveQuantity("");
      setSelectedItemForReserve(null);
    }
  };

  // Get data to export (selected items or all items)
  const getExportData = () => {
    return selectedItems.length > 0
      ? items.filter((item) => selectedItems.includes(item.id))
      : items;
  };

  const formatExportDate = (dateValue: any) => {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const fetchAllFilteredExportData = async (): Promise<Item[]> => {
    // If user selected rows, export only selected rows from current grid.
    if (selectedItems.length > 0) {
      return getExportData();
    }

    const params: any = {
      page: 1,
      limit: "all",
      include_locations: "false",
    };

    if (searchFilters.search) params.search = searchFilters.search;
    // SWAPPED: UI Master Part No → DB part_no, UI Part No → DB master_part_no
    if (searchFilters.master_part_no)
      params.part_no = searchFilters.master_part_no;
    if (searchFilters.part_no)
      params.master_part_no = searchFilters.part_no;
    if (searchFilters.brand_name) params.brand_name = searchFilters.brand_name;
    if (searchFilters.description) params.description = searchFilters.description;
    if (searchFilters.part_type && searchFilters.part_type !== "all")
      params.part_type = searchFilters.part_type;
    if (searchFilters.category_name && searchFilters.category_name !== "all")
      params.category_name = searchFilters.category_name;
    if (
      searchFilters.subcategory_name &&
      searchFilters.subcategory_name !== "all"
    )
      params.subcategory_name = searchFilters.subcategory_name;
    if (
      searchFilters.application_name &&
      searchFilters.application_name !== "all"
    )
      params.application_name = searchFilters.application_name;
    if (searchFilters.duplicates_only === "yes")
      params.duplicates_only = "true";

    const response = await apiClient.getParts(params);
    const responseAny = response as any;
    const responseData = responseAny?.data;
    const partsData = Array.isArray(responseData)
      ? responseData
      : Array.isArray(responseData?.data)
        ? responseData.data
        : [];

    return partsData.map((part: any) => {
      const createdRaw = part.createdAt || part.created_at;
      return {
        id: part.id,
        // SWAPPED to match Items List UI convention
        masterPartNo: part.part_no || part.partNo || "",
        partNo: part.master_part_no || part.masterPartNo || "",
        brand: part.brand_name || part.brand || "",
        type: part.type || "single",
        description: part.description || "",
        category: part.category_name || part.category?.name || "",
        subCategory: part.subcategory_name || part.subcategory?.name || "",
        application: part.application_name || part.application?.name || "",
        status: part.status === "inactive" ? "Inactive" : "Active",
        images: [part.image_p1, part.image_p2, part.imageP1, part.imageP2].filter(
          (img) => !!img,
        ),
        createdAt: formatExportDate(createdRaw),
      } as Item;
    });
  };

  // Escape CSV values
  const escapeCSV = (value: any) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Export to CSV
  const handleExportCSV = () => {
    const exportData = getExportData();
    const headers = [
      "ID",
      "Master Part No",
      "Part No",
      "Brand",
      "Description",
      "Category",
      "Sub Category",
      "Application",
      "Status",
      "Images",
    ];
    const csvData = exportData.map((item) => [
      item.id,
      escapeCSV(item.masterPartNo),
      escapeCSV(item.partNo),
      escapeCSV(item.brand),
      escapeCSV(item.description),
      escapeCSV(item.category),
      escapeCSV(item.subCategory),
      escapeCSV(item.application),
      escapeCSV(item.status),
      escapeCSV(item.images.join(";")),
    ]);
    const csvContent = [
      headers.join(","),
      ...csvData.map((row) => row.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parts-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "CSV Exported",
      description: `${exportData.length} parts exported successfully`,
    });
  };

  // Download CSV for selected items
  const handleDownloadSelectedCSV = () => {
    if (selectedItems.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select items to download",
        variant: "destructive",
      });
      return;
    }
    const selectedData = items.filter((item) =>
      selectedItems.includes(item.id),
    );
    const headers = [
      "Master Part No",
      "Part No",
      "Brand",
      "Description",
      "Category",
      "Sub Category",
      "Application",
      "Status",
    ];
    const csvData = selectedData.map((item) => [
      escapeCSV(item.masterPartNo),
      escapeCSV(item.partNo),
      escapeCSV(item.brand),
      escapeCSV(item.description),
      escapeCSV(item.category),
      escapeCSV(item.subCategory),
      escapeCSV(item.application),
      escapeCSV(item.status),
    ]);
    const csvContent = [
      headers.join(","),
      ...csvData.map((row) => row.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selected-parts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "CSV Downloaded",
      description: `${selectedData.length} selected parts downloaded successfully`,
    });
  };

  // Export to Excel (XLSX format using CSV with .xlsx extension)
  const handleExportExcel = async () => {
    let exportData: Item[] = [];
    try {
      exportData = await fetchAllFilteredExportData();
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error?.error || "Failed to fetch all records for Excel export",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "ID",
      "Master Part No",
      "Part No",
      "Brand",
      "Description",
      "Category",
      "Sub Category",
      "Application",
      "Status",
      "Created At",
      "Images",
    ];
    const excelData = exportData.map((item) => ({
      ID: item.id,
      "Master Part No": item.masterPartNo || "",
      "Part No": item.partNo || "",
      Brand: item.brand || "",
      Description: item.description || "",
      Category: item.category || "",
      "Sub Category": item.subCategory || "",
      Application: item.application || "",
      Status: item.status || "",
      "Created At": item.createdAt || "",
      Images: item.images.join(";") || "",
    }));

    // Create CSV content (Excel can open CSV)
    const csvContent = [
      headers.join(","),
      ...excelData.map((row) =>
        headers
          .map((h) => escapeCSV(row[h as keyof typeof row] || ""))
          .join(","),
      ),
    ].join("\n");

    // Add BOM for Excel UTF-8 support
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parts-export-${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Excel Exported",
      description: `${exportData.length} parts exported successfully`,
    });
  };

  // Export to JSON
  const handleExportJSON = () => {
    const exportData = getExportData();
    const jsonData = exportData.map((item) => ({
      id: item.id,
      masterPartNo: item.masterPartNo || "",
      partNo: item.partNo || "",
      brand: item.brand || "",
      description: item.description || "",
      category: item.category || "",
      subCategory: item.subCategory || "",
      application: item.application || "",
      status: item.status || "",
      images: item.images || [],
    }));
    const jsonContent = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parts-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "JSON Exported",
      description: `${exportData.length} parts exported successfully`,
    });
  };

  // Export to TXT
  const handleExportTXT = () => {
    const exportData = getExportData();
    const txtLines = [
      "PARTS EXPORT",
      `Generated: ${new Date().toLocaleString()}`,
      `Total Items: ${exportData.length}`,
      "=".repeat(80),
      "",
    ];

    exportData.forEach((item, index) => {
      txtLines.push(`Item ${index + 1}:`);
      txtLines.push(`  ID: ${item.id}`);
      txtLines.push(`  Master Part No: ${item.masterPartNo || "-"}`);
      txtLines.push(`  Part No: ${item.partNo || "-"}`);
      txtLines.push(`  Brand: ${item.brand || "-"}`);
      txtLines.push(`  Description: ${item.description || "-"}`);
      txtLines.push(`  Category: ${item.category || "-"}`);
      txtLines.push(`  Sub Category: ${item.subCategory || "-"}`);
      txtLines.push(`  Application: ${item.application || "-"}`);
      txtLines.push(`  Status: ${item.status || "-"}`);
      txtLines.push(
        `  Images: ${item.images.length > 0 ? item.images.join(", ") : "None"}`,
      );
      txtLines.push("");
    });

    const txtContent = txtLines.join("\n");
    const blob = new Blob([txtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parts-export-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "TXT Exported",
      description: `${exportData.length} parts exported successfully`,
    });
  };

  // Export to PDF
  const handleExportPDF = () => {
    const exportData = getExportData();
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Parts Export</title>
          <style>
            @media print {
              @page { margin: 1cm; }
            }
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 10px; }
            h1 { color: #333; margin-bottom: 10px; font-size: 16px; }
            .meta { color: #666; margin-bottom: 20px; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f4f4f4; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
          </style>
        </head>
        <body>
          <h1>Parts Export</h1>
          <div class="meta">Generated: ${new Date().toLocaleString()} | Total Items: ${exportData.length}</div>
          <table>
            <thead>
              <tr>
                <th>Master Part No</th>
                <th>Part No</th>
                <th>Brand</th>
                <th>Description</th>
                <th>Category</th>
                <th>Sub Category</th>
                <th>Application</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${exportData
        .map(
          (item) => `
                <tr>
                  <td>${item.masterPartNo || "-"}</td>
                  <td>${item.partNo || "-"}</td>
                  <td>${item.brand || "-"}</td>
                  <td>${item.description || "-"}</td>
                  <td>${item.category || "-"}</td>
                  <td>${item.subCategory || "-"}</td>
                  <td>${item.application || "-"}</td>
                  <td>${item.status || "-"}</td>
                </tr>
              `,
        )
        .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const started = openPrintHtml(printContent);
    if (!started) return;
    toast({
      title: "PDF Export Ready",
      description: `${exportData.length} parts ready for printing/PDF`,
    });
  };

  // Handle Import
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls,.json,.txt";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const fileType = file.name.split(".").pop()?.toLowerCase();
        const text = await file.text();

        let importedData: any[] = [];

        if (fileType === "json") {
          importedData = JSON.parse(text);
        } else if (
          fileType === "csv" ||
          fileType === "xlsx" ||
          fileType === "xls"
        ) {
          const lines = text.split("\n").filter((line) => line.trim());
          if (lines.length < 2) {
            throw new Error("Invalid CSV file");
          }
          const headers = lines[0]
            .split(",")
            .map((h) => h.trim().replace(/^"|"$/g, ""));
          importedData = lines.slice(1).map((line) => {
            const values = line
              .split(",")
              .map((v) => v.trim().replace(/^"|"$/g, ""));
            const obj: any = {};
            headers.forEach((header, index) => {
              obj[header] = values[index] || "";
            });
            return obj;
          });
        } else if (fileType === "txt") {
          // Simple TXT parsing (basic implementation)
          toast({
            title: "Import Notice",
            description:
              "TXT import is limited. Please use CSV, Excel, or JSON format for better results.",
            variant: "default",
          });
          return;
        }

        if (importedData.length === 0) {
          throw new Error("No data found in file");
        }

        // Transform imported data to match Item format
        const transformedItems: Item[] = importedData.map(
          (row: any, index: number) => ({
            id: row.id || row.ID || `imported-${Date.now()}-${index}`,
            masterPartNo:
              row.masterPartNo ||
              row["Master Part No"] ||
              row.master_part_no ||
              "",
            partNo: row.partNo || row["Part No"] || row.part_no || "",
            brand: row.brand || row.Brand || "",
            description: row.description || row.Description || "",
            category: row.category || row.Category || "",
            subCategory:
              row.subCategory || row["Sub Category"] || row.subcategory || "",
            application: row.application || row.Application || "",
            status: (row.status || row.Status || "Active") as
              | "Active"
              | "Inactive",
            images: row.images
              ? Array.isArray(row.images)
                ? row.images
                : row.images.split(";").filter((img: string) => img.trim())
              : [],
          }),
        );

        // Call import handler if provided, otherwise show success
        toast({
          title: "Import Successful",
          description: `${transformedItems.length} items imported. Please review and save.`,
        });

        // You can add an onImport callback here to handle the imported data
      } catch (error: any) {
        toast({
          title: "Import Failed",
          description: error.message || "Failed to import file",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedItems.length === 0) return;

    setIsDeleting(true);
    const itemsToDelete = items.filter((item) =>
      selectedItems.includes(item.id),
    );
    const itemIdsToDelete = [...selectedItems];
    const failedDeletes: string[] = [];
    let successCount = 0;

    // Optimistically remove items from UI immediately (smooth UX - no table reload)
    const remainingItems = items.filter(
      (item) => !selectedItems.includes(item.id),
    );
    if (onItemsUpdate) {
      onItemsUpdate(remainingItems);
    }

    // Clear selection immediately for better UX
    setSelectedItems([]);
    setBulkDeleteConfirmOpen(false);

    try {
      // If bulk delete handler is provided, use it (parallel deletion - professional)
      if (onBulkDelete) {
        const result = await onBulkDelete(itemIdsToDelete);
        successCount = result.success.length;
        failedDeletes.push(
          ...result.failed.map((id) => {
            const item = items.find((i) => i.id === id);
            return item?.partNo || id;
          }),
        );
      } else if (onDelete) {
        // Fallback to individual deletes (parallel, no UI blocking)
        const deletePromises = itemsToDelete.map(async (item) => {
          try {
            if (item.canDelete === false) {
              failedDeletes.push(item.partNo);
              return { success: false, partNo: item.partNo };
            }

            await onDelete(item);
            return { success: true, partNo: item.partNo };
          } catch (error) {
            failedDeletes.push(item.partNo);
            return { success: false, partNo: item.partNo };
          }
        });

        const results = await Promise.all(deletePromises);
        successCount = results.filter((r) => r.success).length;
      }

      // Show results
      if (successCount > 0) {
        toast({
          title: "Bulk Delete Complete",
          description: `Successfully deleted ${successCount} item(s)${failedDeletes.length > 0 ? `. ${failedDeletes.length} item(s) could not be deleted.` : ""}`,
        });
      }

      if (failedDeletes.length > 0) {
        // If some failed, restore them to the list
        if (onItemsUpdate) {
          const failedItems = itemsToDelete.filter((item) =>
            failedDeletes.includes(item.partNo),
          );
          onItemsUpdate([...remainingItems, ...failedItems]);
        }
        toast({
          title: "Some Items Could Not Be Deleted",
          description: `The following items could not be deleted: ${failedDeletes.slice(0, 5).join(", ")}${failedDeletes.length > 5 ? ` and ${failedDeletes.length - 5} more` : ""}. They may be in use.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      // If error occurs, restore items
      if (onItemsUpdate) {
        onItemsUpdate(items); // Restore original items
      }
      toast({
        title: "Error",
        description:
          "An error occurred during bulk delete. Items have been restored.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePrintSelected = () => {
    const selectedData = items.filter((item) =>
      selectedItems.includes(item.id),
    );
    const printContent = `
      <html>
        <head>
          <title>Selected Parts List</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f4f4f4; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
          </style>
        </head>
        <body>
          <h1>Parts List (${selectedData.length} items)</h1>
          <table>
            <thead>
              <tr>
                <th>Master Part No</th>
                <th>Part No</th>
                <th>Brand</th>
                <th>Description</th>
                <th>Category</th>
                <th>Sub Category</th>
                <th>Application</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${selectedData
        .map(
          (item) => `
                <tr>
                  <td>${item.masterPartNo}</td>
                  <td>${item.partNo}</td>
                  <td>${item.brand}</td>
                  <td>${item.description}</td>
                  <td>${item.category || "-"}</td>
                  <td>${item.subCategory || "-"}</td>
                  <td>${item.application || "-"}</td>
                  <td>${item.status}</td>
                </tr>
              `,
        )
        .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
    toast({
      title: "Print Ready",
      description: `Printing ${selectedData.length} parts`,
    });
  };

  const handleBulkPartTypeChange = async (
    itemId: string,
    nextType: "single" | "kit",
    quantity: number,
  ): Promise<boolean> => {
    if (!itemId) return false;
    if (!onBulkPartTypeChange) {
      toast({
        title: "Action unavailable",
        description: "Bulk part type update is not configured",
        variant: "destructive",
      });
      return false;
    }

    try {
      await onBulkPartTypeChange([itemId], nextType, quantity);
      toast({
        title: nextType === "kit" ? "Kit created" : "Kit broken",
        description:
          nextType === "kit"
            ? "Make kit saved successfully"
            : "Break kit saved successfully",
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Failed to update selected items",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleOpenMakeKitDialog = () => {
    if (makeKitItemOptions.length === 0) {
      toast({
        title: "No kit items available",
        description: "No kit item available to make",
        variant: "destructive",
      });
      return;
    }
    setSelectedMakeKitItemId("");
    setMakeKitQuantity(1);
    setMakeKitRows([]);
    setMakeKitCurrentStock(0);
    setMakeKitDialogOpen(true);
  };

  const handleOpenBreakKitDialog = () => {
    if (breakKitItemOptions.length === 0) {
      toast({
        title: "No kit items available",
        description: "No kit item available to break",
        variant: "destructive",
      });
      return;
    }
    setSelectedBreakKitItemId("");
    setBreakKitQuantity(1);
    setBreakKitRows([]);
    setBreakKitCurrentStock(0);
    setBreakKitDialogOpen(true);
  };

  const handleConfirmMakeKit = async () => {
    if (!selectedMakeKitItemId) {
      toast({
        title: "Select item",
        description: "Please select the item you want to make kit",
        variant: "destructive",
      });
      return;
    }
    if (makeRequiredRows.some((row) => !row.enoughStock)) {
      toast({
        title: "Insufficient stock",
        description: "Some associated items do not have enough stock",
        variant: "destructive",
      });
      return;
    }
    const qty =
      makeKitQuantity === "" ? 1 : Math.max(1, Number(makeKitQuantity || 1));
    const success = await handleBulkPartTypeChange(
      selectedMakeKitItemId,
      "kit",
      qty,
    );
    if (success) {
      setMakeKitDialogOpen(false);
    }
  };

  const handleConfirmBreakKit = async () => {
    if (!selectedBreakKitItemId) {
      toast({
        title: "Select item",
        description: "Please select the kit item you want to break",
        variant: "destructive",
      });
      return;
    }
    const qty =
      breakKitQuantity === "" ? 0 : Math.max(1, Number(breakKitQuantity || 1));
    if (breakKitCurrentStock < qty) {
      toast({
        title: "Insufficient kit stock",
        description: "Kit stock is less than break quantity",
        variant: "destructive",
      });
      return;
    }
    const success = await handleBulkPartTypeChange(
      selectedBreakKitItemId,
      "single",
      qty,
    );
    if (success) {
      setBreakKitDialogOpen(false);
    }
  };

  const handleSelectMakeKitItem = async (itemId: string) => {
    setSelectedMakeKitItemId(itemId);
    if (!itemId) return;
    await loadKitDetails(itemId, "make");
  };

  const handleSelectBreakKitItem = async (itemId: string) => {
    setSelectedBreakKitItemId(itemId);
    if (!itemId) return;
    await loadKitDetails(itemId, "break");
  };

  // Show compact form when showForm is true
  if (showForm) {
    return (
      <CompactPartForm
        onSave={(partData, isEdit, editItemId) => {
          onSavePart?.(partData, isEdit, editItemId || editItem?.id);
          onCancelForm?.();
        }}
        onCancel={() => onCancelForm?.()}
        editItem={editItem}
        forcedType={forcedEditType}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <div className="w-1 h-12 bg-primary rounded-full" />
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Parts & Kits List
            </h1>
            {/* <p className="text-xs text-muted-foreground">
              Search, filter, and manage all inventory parts and kits
            </p> */}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canShowExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={handleExportPDF}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                {/* <DropdownMenuItem
                  onClick={handleExportCSV}
                  className="cursor-pointer"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem> */}
                <DropdownMenuItem
                  onClick={handleExportExcel}
                  className="cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
                {/* <DropdownMenuItem
                  onClick={handleExportTXT}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export as TXT
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportJSON}
                  className="cursor-pointer"
                >
                  <FileJson className="w-4 h-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleImport}
                  className="cursor-pointer"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Data
                </DropdownMenuItem> */}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="border-b border-border" />

      <>
          {/* Search & Filters Card */}
          <Card className="border-border">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-2">
                  {selectedItems.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-7"
                        onClick={handleDownloadSelectedCSV}
                      >
                        <Download className="w-3 h-3" />
                        Download CSV ({selectedItems.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-7"
                        onClick={handlePrintSelected}
                      >
                        <Printer className="w-3 h-3" />
                        Print ({selectedItems.length})
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* Filter Fields */}
              <div className="grid grid-cols-8 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Part Type
                  </label>
                  <SearchableSelect
                    options={[
                      { value: "all", label: "All Types" },
                      { value: "single", label: "Single" },
                      { value: "kit", label: "Kit" },
                    ]}
                    value={localInputValues.part_type}
                    onValueChange={(value) =>
                      updateFilterImmediate("part_type", value)
                    }
                    placeholder="All Types"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Part No
                  </label>
                  <SearchableSelect
                    options={partNoOptions}
                    placeholder="Type to search"
                    value={localInputValues.part_no}
                    onValueChange={(value) => updateFilter("part_no", value)}
                    className="h-8 text-xs"
                    aria-label="Part No"
                    data-preserve-case="true"
                    maxDisplayedOptions={500}
                    requireSearchAbove={500}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Master Part No
                  </label>
                  <SearchableSelect
                    options={finalMasterPartOptions}
                    placeholder="Type to search"
                    value={localInputValues.master_part_no}
                    onValueChange={(value) =>
                      updateFilter("master_part_no", value)
                    }
                    className="h-8 text-xs"
                    aria-label="Master Part No"
                    data-preserve-case="true"
                    maxDisplayedOptions={500}
                    requireSearchAbove={500}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Brand
                  </label>
                  <SearchableSelect
                    options={finalBrandOptions}
                    placeholder="Type to search"
                    value={localInputValues.brand_name}
                    onValueChange={(value) => updateFilter("brand_name", value)}
                    className="h-8 text-xs"
                    data-preserve-case="true"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Description
                  </label>
                  <SearchableSelect
                    options={finalDescriptionOptions}
                    placeholder="Filter by Description..."
                    value={localInputValues.description}
                    onValueChange={(value) =>
                      updateFilter("description", value)
                    }
                    className="h-8 text-xs"
                    allowCustom={true}
                    data-preserve-case="true"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Category
                  </label>
                  <SearchableSelect
                    options={[
                      { value: "all", label: "All Categories" },
                      ...Array.from(new Set(categories)).map((cat) => ({
                        value: cat,
                        label: cat,
                      })),
                    ]}
                    value={localInputValues.category_name}
                    onValueChange={(value) =>
                      updateFilterImmediate("category_name", value)
                    }
                    placeholder="All Categories"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Sub Category
                  </label>
                  <SearchableSelect
                    options={[
                      { value: "all", label: "All Sub Categories" },
                      ...Array.from(new Set(subCategories)).map((sub) => ({
                        value: sub,
                        label: sub,
                      })),
                    ]}
                    value={localInputValues.subcategory_name}
                    onValueChange={(value) =>
                      updateFilterImmediate("subcategory_name", value)
                    }
                    placeholder="All Sub Categories"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Application
                  </label>
                  <SearchableSelect
                    options={[
                      { value: "all", label: "All Applications" },
                      ...applications.map((app) => ({
                        value: app,
                        label: app,
                      })),
                    ]}
                    value={localInputValues.application_name}
                    onValueChange={(value) =>
                      updateFilterImmediate("application_name", value)
                    }
                    placeholder="All Applications"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="duplicates-only-filter"
                  checked={searchFilters.duplicates_only === "yes"}
                  onCheckedChange={(checked) => {
                    updateFilterImmediate(
                      "duplicates_only",
                      checked === true ? "yes" : "all",
                    );
                    if (checked === true && onPageChange) {
                      onPageChange(1);
                    }
                  }}
                />
                <label
                  htmlFor="duplicates-only-filter"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Duplicate items only
                </label>
                {/* {showDuplicateView && (
                  <span className="text-[10px] text-muted-foreground">
                    Matching records are grouped together. Each group shares the
                    same part number or master part number, even if description
                    or application differs. Each row is a separate database item.
                  </span>
                )} */}
              </div>

              {/* Clear Filters Button */}
              {(searchFilters.search ||
                searchFilters.master_part_no ||
                searchFilters.part_no ||
                searchFilters.brand_name ||
                searchFilters.description ||
                searchFilters.part_type !== "all" ||
                searchFilters.category_name !== "all" ||
                searchFilters.subcategory_name !== "all" ||
                searchFilters.application_name !== "all" ||
                searchFilters.duplicates_only === "yes") && (
                  <div className="flex justify-end pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const clearedFilters = {
                          search: "",
                          master_part_no: "",
                          part_no: "",
                          brand_name: "",
                          description: "",
                          part_type: "all",
                          category_name: "all",
                          subcategory_name: "all",
                          application_name: "all",
                          duplicates_only: "all",
                          created_from_date: "",
                          created_to_date: new Date().toISOString().split("T")[0], // Set to current date
                          created_from_time: "",
                          created_to_time: "",
                        };
                        setLocalInputValues(clearedFilters);
                        setSearchFilters(clearedFilters);
                      }}
                    >
                      <Trash className="w-3 h-3 mr-1" />
                      Clear All Filters
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-12 min-w-[140px] px-6 gap-2 text-base font-semibold border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-900 transition-colors"
              onClick={handleOpenMakeKitDialog}
            >
              Make Kit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-12 min-w-[140px] px-6 gap-2 text-base font-semibold border-red-200 bg-red-50 text-red-700 hover:bg-red-200 hover:text-red-900 transition-colors"
              onClick={handleOpenBreakKitDialog}
            >
              Break Kit
            </Button>
          </div>

          {/* Parts List Card */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Parts List
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {loading
                      ? "Loading..."
                      : `${totalItems || filteredItems.length} parts found`}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Loading parts...
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <ListNumberHeader className="pl-4" />
                        <TableHead className="w-10 pl-4">
                          <Checkbox
                            checked={
                              selectedItems.length === filteredItems.length &&
                              filteredItems.length > 0
                            }
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        {showDuplicateView && (
                          <TableHead className="text-xs font-medium min-w-[7rem]">
                            Dup. Group
                          </TableHead>
                        )}
                        <TableHead className="text-xs font-medium">
                          Part No
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Master Part No
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Brand
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Description
                        </TableHead>
                        <TableHead className="text-xs font-medium text-[#F28123]">
                          Category
                        </TableHead>
                        <TableHead className="text-xs font-medium text-[#D34E24]">
                          Sub Category
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Application
                        </TableHead>
                        <TableHead className="text-xs font-medium text-right min-w-[4.5rem]">
                          Stock
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Status
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Weight
                        </TableHead>
                        <TableHead className="text-xs font-medium">
                          Images
                        </TableHead>
                        <TableHead className="text-xs font-medium pr-4">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {duplicateGroupedRows.map(
                        ({ item, groupNum, isFirstInGroup, groupSize }, index) => (
                        <TableRow
                          key={item.id}
                          className={cn(
                            "hover:bg-muted/20 cursor-pointer",
                            showDuplicateView &&
                              "border-l-4 bg-amber-50/40",
                            showDuplicateView &&
                              DUPLICATE_GROUP_BORDER[
                                (groupNum - 1) % DUPLICATE_GROUP_BORDER.length
                              ],
                            showDuplicateView &&
                              isFirstInGroup &&
                              groupNum > 1 &&
                              "border-t-2 border-amber-300",
                          )}
                          onClick={(e) => {
                            // Don't trigger if clicking on interactive elements
                            const target = e.target as HTMLElement;
                            if (
                              target.closest("button") ||
                              target.closest("input") ||
                              target.closest('[role="button"]') ||
                              target.closest('[role="checkbox"]')
                            ) {
                              return;
                            }
                            onItemSelect?.(item);
                          }}
                        >
                          <ListNumberCell
                            index={index}
                            page={currentPage}
                            pageSize={itemsPerPage}
                            total={totalItems || filteredItems.length}
                            className="pl-4"
                          />
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onCheckedChange={() => handleSelectItem(item.id)}
                            />
                          </TableCell>
                          {showDuplicateView && (
                            <TableCell className="text-xs align-top">
                              {isFirstInGroup ? (
                                <div className="space-y-1">
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-100 text-amber-900 border-amber-300 whitespace-nowrap"
                                  >
                                    Group {groupNum}
                                  </Badge>
                                  <p className="text-[10px] leading-tight text-amber-800 font-medium">
                                    {groupSize} matching records
                                  </p>
                                </div>
                              ) : (
                                <span className="text-[10px] font-medium text-amber-700">
                                  ↳ Same group
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-xs font-semibold part-code-font font-mono">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="text-primary hover:underline cursor-pointer transition-colors part-code-font font-mono"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const clearedFilters = {
                                    ...searchFilters,
                                    search: "",
                                    master_part_no: "",
                                    part_no: item.partNo,
                                    description: "",
                                    part_type: "all",
                                    category_name: "all",
                                    subcategory_name: "all",
                                    application_name: "all",
                                  };
                                  setSearchFilters(clearedFilters);
                                  setLocalInputValues(clearedFilters);
                                  if (onPageChange) onPageChange(1);
                                }}
                                title={`Click to see all items with Part No: ${item.partNo}`}
                              >
                                {item.partNo}
                              </span>
                              {item.priceUpdated && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-success/10 text-success border-success/30 cursor-pointer hover:bg-success/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPriceUpdateItem(item);
                                    setShowPriceUpdateHistory(true);
                                  }}
                                >
                                  Price Updated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-medium part-code-font font-mono">
                            <span
                              className="hover:text-primary hover:underline cursor-pointer transition-colors part-code-font font-mono"
                              onClick={(e) => {
                                e.stopPropagation();
                                const clearedFilters = {
                                  ...searchFilters,
                                  search: "",
                                  master_part_no: item.masterPartNo,
                                  part_no: "",
                                  description: "",
                                  part_type: "all",
                                  category_name: "all",
                                  subcategory_name: "all",
                                  application_name: "all",
                                };
                                setSearchFilters(clearedFilters);
                                setLocalInputValues(clearedFilters);
                                if (onPageChange) onPageChange(1);
                              }}
                              title={`Click to see all items with Master Part No: ${item.masterPartNo}`}
                            >
                              {item.masterPartNo || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.brand}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {item.description}
                          </TableCell>
                          <TableCell className="text-xs text-[#F28123]">
                            {item.category && item.category.trim()
                              ? item.category
                              : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-[#D34E24]">
                            {item.subCategory && item.subCategory.trim()
                              ? item.subCategory
                              : "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.application && item.application.trim()
                              ? item.application
                              : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-right align-top tabular-nums">
                            {(() => {
                              const { total, reserved, available } =
                                getItemStockBreakdown(item);
                              return (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-semibold text-foreground">
                                    {total}
                                  </span>
                                  {reserved > 0 ? (
                                    <span className="text-[10px] leading-tight text-muted-foreground">
                                      Avail {available} · Rsv {reserved}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {canStatus ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="flex items-center gap-1 cursor-pointer focus:outline-none">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] px-1.5 py-0 cursor-pointer",
                                        item.status === "Active"
                                          ? "border-success text-success bg-success/10"
                                          : "border-destructive text-destructive bg-destructive/10",
                                      )}
                                    >
                                      {item.status}
                                      <ChevronDown className="w-2.5 h-2.5 ml-0.5" />
                                    </Badge>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="start"
                                  className="bg-popover border border-border shadow-lg z-50"
                                >
                                  {item.status === "Active" ? (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        onStatusChange?.(item, "Inactive");
                                        toast({
                                          title: "Status Updated",
                                          description: `${item.partNo} has been set to Inactive`,
                                        });
                                      }}
                                      className="text-xs cursor-pointer"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-destructive mr-2" />
                                      Set Inactive
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        onStatusChange?.(item, "Active");
                                        toast({
                                          title: "Status Updated",
                                          description: `${item.partNo} has been set to Active`,
                                        });
                                      }}
                                      className="text-xs cursor-pointer"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-success mr-2" />
                                      Set Active
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  item.status === "Active"
                                    ? "border-success text-success bg-success/10"
                                    : "border-destructive text-destructive bg-destructive/10",
                                )}
                              >
                                {item.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.weight || "-"}
                          </TableCell>
                          <TableCell>
                            {item.images &&
                              item.images.length > 0 &&
                              item.images.some(
                                (img) => img && img.trim() !== "",
                              ) ? (
                              <button
                                onClick={() => {
                                  const validImages = item.images.filter(
                                    (img) => img && img.trim() !== "",
                                  );
                                  setSelectedImages(validImages);
                                  setCurrentImageIndex(0);
                                  setImageModalOpen(true);
                                }}
                                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                <div className="relative">
                                  {(() => {
                                    const firstValidImage = item.images.find(
                                      (img) => img && img.trim() !== "",
                                    );
                                    if (!firstValidImage) return null;

                                    // Ensure image has proper data URL format
                                    const imageSrc = firstValidImage.startsWith("data:") || firstValidImage.startsWith("/") || firstValidImage.startsWith("http")
                                      ? firstValidImage
                                      : `data:image/jpeg;base64,${firstValidImage}`;

                                    return (
                                      <img
                                        src={imageSrc}
                                        alt="Product"
                                        className="w-8 h-8 rounded object-cover border border-border"
                                        onError={(e) => {
                                          const target =
                                            e.target as HTMLImageElement;
                                          target.style.display = "none";
                                          console.error(
                                            "Image failed to load:",
                                            firstValidImage?.substring(0, 50),
                                          );
                                        }}
                                        onLoad={() => {
                                          // Image loaded successfully
                                        }}
                                      />
                                    );
                                  })()}
                                  {item.images.filter(
                                    (img) => img && img.trim() !== "",
                                  ).length > 1 && (
                                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-medium">
                                        +
                                        {item.images.filter(
                                          (img) => img && img.trim() !== "",
                                        ).length - 1}
                                      </span>
                                    )}
                                </div>
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="pr-4">
                            <div className="flex items-center gap-1">
                              <ActionButtonTooltip
                                label={
                                  item.reservedQuantity &&
                                    item.reservedQuantity > 0
                                    ? `Reserved: ${item.reservedQuantity} units - Click to edit`
                                    : "Reserve Stock"
                                }
                                variant="default"
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    "h-6 w-6 transition-colors",
                                    item.reservedQuantity &&
                                      item.reservedQuantity > 0
                                      ? "text-green-600 hover:text-green-700 hover:bg-green-50/50"
                                      : "text-primary hover:text-primary/80",
                                  )}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setSelectedItemForReserve(item);
                                    // Fetch current reserved quantity
                                    try {
                                      const response =
                                        await apiClient.getReservedQuantity(
                                          item.id,
                                        );
                                      // Backend returns { partId, reservedQty }
                                      const reservedQty =
                                        (response as any).reservedQty ||
                                        (response as any).reserved ||
                                        0;
                                      setReserveQuantity(
                                        reservedQty > 0
                                          ? reservedQty.toString()
                                          : "",
                                      );
                                    } catch (error) {
                                      setReserveQuantity(
                                        item.reservedQuantity?.toString() || "",
                                      );
                                    }
                                    setReserveStockDialogOpen(true);
                                  }}
                                >
                                  <Package
                                    className={cn(
                                      "w-3 h-3",
                                      item.reservedQuantity &&
                                        item.reservedQuantity > 0
                                        ? "text-green-600"
                                        : "text-primary",
                                    )}
                                  />
                                </Button>
                              </ActionButtonTooltip>
                              {canEdit && (
                                <ActionButtonTooltip label="Edit" variant="edit">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => onEdit?.(item)}
                                  >
                                    <Edit className="w-3 h-3 text-primary" />
                                  </Button>
                                </ActionButtonTooltip>
                              )}
                              {canDelete &&
                                (item.canDelete ? (
                                  <ActionButtonTooltip
                                    label="Delete"
                                    variant="delete"
                                  >
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setItemToDelete(item);
                                        setDeleteConfirmOpen(true);
                                      }}
                                    >
                                      <Trash className="w-3 h-3 text-destructive" />
                                    </Button>
                                  </ActionButtonTooltip>
                                ) : (
                                  <ActionButtonTooltip
                                    label={
                                      item.deleteBlockReason ||
                                      "Cannot delete: stock must be zero with no adjustment, direct purchase, or sales history"
                                    }
                                    variant="default"
                                  >
                                    <span className="inline-flex h-6 w-6 items-center justify-center opacity-35">
                                      <Trash className="w-3 h-3 text-muted-foreground" />
                                    </span>
                                  </ActionButtonTooltip>
                                ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredItems.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={showDuplicateView ? 15 : 14}
                            className="h-24 text-center text-xs text-muted-foreground"
                          >
                            No parts found matching your filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  {totalItems > 0 &&
                    onPageChange &&
                    !showDuplicateView &&
                    (() => {
                      const totalPages = Math.ceil(totalItems / itemsPerPage);
                      const handlePageJump = () => {
                        const pageNum = parseInt(pageJumpValue);
                        if (pageNum >= 1 && pageNum <= totalPages) {
                          onPageChange(pageNum);
                          setPageJumpValue("");
                        } else {
                          toast({
                            title: "Invalid page",
                            description: `Please enter a page number between 1 and ${totalPages}`,
                            variant: "destructive",
                          });
                        }
                      };

                      return (
                        <div className="border-t border-border px-4 py-3 flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => onPageChange(currentPage - 1)}
                              disabled={currentPage <= 1}
                            >
                              <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                              Previous
                            </Button>

                            <div className="flex items-center gap-1">
                              {Array.from(
                                { length: Math.min(5, totalPages) },
                                (_, i) => {
                                  let pageNum;

                                  if (totalPages <= 5) {
                                    pageNum = i + 1;
                                  } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                  } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                  } else {
                                    pageNum = currentPage - 2 + i;
                                  }

                                  return (
                                    <Button
                                      key={pageNum}
                                      variant={
                                        currentPage === pageNum
                                          ? "default"
                                          : "outline"
                                      }
                                      size="sm"
                                      className="h-7 w-7 text-xs p-0"
                                      onClick={() => onPageChange(pageNum)}
                                    >
                                      {pageNum}
                                    </Button>
                                  );
                                },
                              )}
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => onPageChange(currentPage + 1)}
                              disabled={currentPage >= totalPages}
                            >
                              Next
                              <ChevronRight className="w-3.5 h-3.5 ml-1" />
                            </Button>

                            <div className="flex items-center gap-1.5 ml-3">
                              <span className="text-xs text-muted-foreground">
                                Go to:
                              </span>
                              <Input
                                type="number"
                                min="1"
                                max={totalPages}
                                value={pageJumpValue}
                                onChange={(e) =>
                                  setPageJumpValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handlePageJump();
                                  }
                                }}
                                placeholder="Page"
                                className="h-7 w-16 text-xs text-center"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={handlePageJump}
                              >
                                Go
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">
                              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                              {Math.min(currentPage * itemsPerPage, totalItems)}{" "}
                              of {totalItems} parts
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Items per page:
                            </span>
                            <Select
                              value={String(itemsPerPage)}
                              onValueChange={(value) =>
                                onItemsPerPageChange?.(Number(value))
                              }
                            >
                              <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                                <SelectItem value="200">200</SelectItem>
                                <SelectItem value="500">500</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })()}
                </>
              )}
            </CardContent>
          </Card>
      </>

      {/* Image Modal */}
      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-background border-border">
          <VisuallyHidden>
            <DialogTitle>Product Image</DialogTitle>
          </VisuallyHidden>
          <div className="relative">
            {selectedImages.length > 0 && selectedImages[currentImageIndex] && (
              <img
                src={
                  selectedImages[currentImageIndex].startsWith("data:") ||
                    selectedImages[currentImageIndex].startsWith("/") ||
                    selectedImages[currentImageIndex].startsWith("http")
                    ? selectedImages[currentImageIndex]
                    : `data:image/jpeg;base64,${selectedImages[currentImageIndex]}`
                }
                alt="Product"
                className="w-full h-auto max-h-[70vh] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage not available%3C/text%3E%3C/svg%3E';
                }}
              />
            )}
            {selectedImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {selectedImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      currentImageIndex === index
                        ? "bg-primary w-4"
                        : "bg-muted-foreground/50 hover:bg-muted-foreground",
                    )}
                  />
                ))}
              </div>
            )}
          </div>
          {selectedImages.length > 1 && (
            <div className="p-3 border-t border-border flex gap-2 overflow-x-auto">
              {selectedImages.map(
                (img, index) =>
                  img &&
                  img.trim() !== "" && (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={cn(
                        "flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all",
                        currentImageIndex === index
                          ? "border-primary"
                          : "border-transparent hover:border-muted-foreground/50",
                      )}
                    >
                      <img
                        src={
                          img.startsWith("data:") || img.startsWith("/") || img.startsWith("http")
                            ? img
                            : `data:image/jpeg;base64,${img}`
                        }
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect fill="%23ddd" width="56" height="56"/%3E%3C/svg%3E';
                        }}
                      />
                    </button>
                  ),
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete Multiple Items
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {selectedItems.length}
              </span>{" "}
              selected item(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8" disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-8"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete All"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete Part
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {itemToDelete?.partNo}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-8"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Price Update History Dialog */}
      <Dialog
        open={showPriceUpdateHistory}
        onOpenChange={setShowPriceUpdateHistory}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Price Update History
            </DialogTitle>
          </DialogHeader>
          {selectedPriceUpdateItem &&
            (() => {
              // Get price update info from localStorage
              let priceUpdateInfo: any = null;
              try {
                const priceUpdatedItems = JSON.parse(
                  localStorage.getItem("priceUpdatedItems") || "{}",
                );
                if (priceUpdatedItems[selectedPriceUpdateItem.id]) {
                  priceUpdateInfo =
                    priceUpdatedItems[selectedPriceUpdateItem.id];
                }
              } catch (error) { }

              if (!priceUpdateInfo) {
                return (
                  <div className="p-4 text-center text-muted-foreground">
                    No price update history found for this item.
                  </div>
                );
              }

              const updateDate =
                priceUpdateInfo.date ||
                new Date(priceUpdateInfo.timestamp).toLocaleDateString();
              const updateTime =
                priceUpdateInfo.time ||
                new Date(priceUpdateInfo.timestamp).toLocaleTimeString();
              let amount = priceUpdateInfo.amount || {};
              let previousPrice = priceUpdateInfo.previousPrice || {};

              // If localStorage doesn't have new prices, use current prices from API
              if (
                (!amount || Object.keys(amount).length === 0) &&
                currentItemPrices
              ) {
                amount = {
                  cost: currentItemPrices.cost,
                  priceA: currentItemPrices.priceA,
                  priceB: currentItemPrices.priceB,
                  priceM: currentItemPrices.priceM,
                };
              }

              // If we have new prices but no previous prices, try to calculate previous prices
              // Previous = New - (difference stored in update, but we don't have that)
              // So we'll just show what we have

              // Debug logging

              const hasPreviousPrice =
                previousPrice && Object.keys(previousPrice).length > 0;
              const hasNewPrice =
                amount &&
                Object.keys(amount).length > 0 &&
                Object.values(amount).some(
                  (v: any) => v !== undefined && v !== null,
                );

              return (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Part Number
                        </p>
                        <p className="font-medium">
                          {selectedPriceUpdateItem.partNo}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Description
                        </p>
                        <p className="font-medium text-sm">
                          {selectedPriceUpdateItem.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Updated Date
                        </span>
                      </div>
                      <span className="font-medium">{updateDate}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Updated Time
                        </span>
                      </div>
                      <span className="font-medium">{updateTime}</span>
                    </div>

                    {hasPreviousPrice ? (
                      <div className="p-3 border rounded-lg bg-muted/50">
                        <p className="text-sm font-medium text-muted-foreground mb-3">
                          Previous Price (Before Update):
                        </p>
                        <div className="space-y-2">
                          {previousPrice.cost !== undefined &&
                            previousPrice.cost !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Cost:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.cost)}
                                </span>
                              </div>
                            )}
                          {previousPrice.priceA !== undefined &&
                            previousPrice.priceA !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price A:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.priceA)}
                                </span>
                              </div>
                            )}
                          {previousPrice.priceB !== undefined &&
                            previousPrice.priceB !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price B:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.priceB)}
                                </span>
                              </div>
                            )}
                          {previousPrice.priceM !== undefined &&
                            previousPrice.priceM !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price M:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.priceM)}
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border rounded-lg bg-muted/50">
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          Previous Price (Before Update):
                        </p>
                        <p className="text-xs text-muted-foreground">
                          No previous price data available
                        </p>
                      </div>
                    )}

                    {loadingPriceData ? (
                      <div className="p-3 border rounded-lg bg-primary/5">
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          New Price (After Update):
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Loading current prices...
                        </p>
                      </div>
                    ) : hasNewPrice ? (
                      <div className="p-3 border rounded-lg bg-primary/5">
                        <p className="text-sm font-medium text-muted-foreground mb-3">
                          New Price (After Update):
                        </p>
                        <div className="space-y-2">
                          {amount.cost !== undefined &&
                            amount.cost !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Cost:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.cost)}
                                </span>
                              </div>
                            )}
                          {amount.priceA !== undefined &&
                            amount.priceA !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price A:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.priceA)}
                                </span>
                              </div>
                            )}
                          {amount.priceB !== undefined &&
                            amount.priceB !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price B:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.priceB)}
                                </span>
                              </div>
                            )}
                          {amount.priceM !== undefined &&
                            amount.priceM !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price M:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.priceM)}
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border rounded-lg bg-primary/5">
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          New Price (After Update):
                        </p>
                        <p className="text-xs text-muted-foreground">
                          No new price data available
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPriceUpdateHistory(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reserve Stock Dialog */}
      <Dialog
        open={reserveStockDialogOpen}
        onOpenChange={setReserveStockDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedItemForReserve?.reservedQuantity &&
                selectedItemForReserve.reservedQuantity > 0
                ? "Update Reserved Stock"
                : "Reserve Stock"}
            </DialogTitle>
            <DialogDescription>
              {selectedItemForReserve?.reservedQuantity &&
                selectedItemForReserve.reservedQuantity > 0
                ? `Current reserved: ${selectedItemForReserve.reservedQuantity} units. Update the quantity below.`
                : `Enter the quantity to reserve for ${selectedItemForReserve?.partNo || selectedItemForReserve?.masterPartNo || "this item"}.`}
              <br />
              Reserved stock will not affect stock in/out calculations.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Item</label>
              <div className="p-2 border rounded-md bg-muted/50">
                <p className="text-sm font-medium">
                  {selectedItemForReserve?.partNo || "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedItemForReserve?.description || "-"}
                </p>
              </div>
            </div>
            {selectedItemForReserve?.reservedQuantity &&
              selectedItemForReserve.reservedQuantity > 0 && (
                <div className="p-3 border rounded-md bg-green-50 border-green-200">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-xs font-medium text-green-900">
                        Currently Reserved
                      </p>
                      <p className="text-sm font-semibold text-green-700">
                        {selectedItemForReserve.reservedQuantity} units
                      </p>
                    </div>
                  </div>
                </div>
              )}
            <div className="space-y-2">
              <label htmlFor="reserveQuantity" className="text-sm font-medium">
                {selectedItemForReserve?.reservedQuantity &&
                  selectedItemForReserve.reservedQuantity > 0
                  ? "New Reserve Quantity"
                  : "Reserve Quantity"}{" "}
                <span className="text-destructive">*</span>
              </label>
              <Input
                id="reserveQuantity"
                type="number"
                min="0"
                placeholder={
                  selectedItemForReserve?.reservedQuantity &&
                    selectedItemForReserve.reservedQuantity > 0
                    ? "Enter new quantity (0 to remove reservation)"
                    : "Enter quantity to reserve"
                }
                value={reserveQuantity}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || parseInt(value) >= 0) {
                    setReserveQuantity(value);
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    reserveQuantity !== "" &&
                    parseInt(reserveQuantity) >= 0
                  ) {
                    handleReserveStock();
                  }
                }}
                className="w-full"
                autoFocus
              />
              {selectedItemForReserve?.reservedQuantity &&
                selectedItemForReserve.reservedQuantity > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Enter 0 to remove all reservations, or enter a new quantity
                    to update.
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReserveStockDialogOpen(false);
                setReserveQuantity("");
                setSelectedItemForReserve(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReserveStock}
              disabled={reserveQuantity === "" || parseInt(reserveQuantity) < 0}
            >
              {selectedItemForReserve?.reservedQuantity &&
                selectedItemForReserve.reservedQuantity > 0
                ? "Update"
                : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={makeKitDialogOpen} onOpenChange={setMakeKitDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Make Kit</DialogTitle>
            <DialogDescription>
              Select the kit item you want to make.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Select Item</label>
            <SearchableSelect
              options={makeKitItemOptions}
              value={selectedMakeKitItemId}
              onValueChange={handleSelectMakeKitItem}
              placeholder="Choose kit item to make"
            />
            <label className="text-sm font-medium pt-1 block">Quantity to Make</label>
            <Input
              type="number"
              min={1}
              value={makeKitQuantity}
              onChange={(e) =>
                setMakeKitQuantity(
                  e.target.value === "" ? "" : Math.max(1, Number(e.target.value)),
                )
              }
              onBlur={() =>
                setMakeKitQuantity(
                  makeKitQuantity === "" ? 1 : Math.max(1, Number(makeKitQuantity)),
                )
              }
            />
            {selectedMakeKitItemId && (
              <p className="text-xs text-muted-foreground">
                Current kit stock: <span className="font-semibold">{makeKitCurrentStock}</span>
              </p>
            )}
            {kitDetailsLoading ? (
              <div className="text-xs text-muted-foreground border rounded p-2">
                Loading associated items...
              </div>
            ) : makeRequiredRows.length > 0 ? (
              <div className="border rounded">
                <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-semibold border-b bg-muted/40">
                  <div className="col-span-3">Item</div>
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1">Brand</div>
                  <div className="col-span-2 text-right">Stock</div>
                  <div className="col-span-1 text-right">Qty/Kit</div>
                  <div className="col-span-2 text-right">Required</div>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {makeRequiredRows.map((row) => (
                    <div
                      key={row.itemPartId}
                      className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] border-b last:border-b-0"
                    >
                      <div className="col-span-3 font-medium">
                        {`${row.masterPartNo || "-"} | ${row.itemPartNo || "-"}`}
                      </div>
                      <div className="col-span-3 truncate" title={row.itemDescription}>
                        {row.itemDescription || "-"}
                      </div>
                      <div className="col-span-1 truncate" title={row.brand}>
                        {row.brand || "-"}
                      </div>
                      <div className="col-span-2 text-right">{row.stock}</div>
                      <div className="col-span-1 text-right">{row.qtyPerKit}</div>
                      <div
                        className={`col-span-2 text-right font-semibold ${row.enoughStock ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {row.requiredQty}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedMakeKitItemId ? (
              <div className="text-xs text-muted-foreground border rounded p-2">
                No associated kit items found.
              </div>
            ) : null}
            {makeKitValidationMessage && (
              <div
                className={`text-xs rounded px-2 py-1 border ${
                  makeKitHasInsufficientStock || makeRequiredRows.length === 0
                    ? "text-red-700 border-red-200 bg-red-50"
                    : "text-amber-700 border-amber-200 bg-amber-50"
                }`}
              >
                {makeKitValidationMessage}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMakeKitDialogOpen(false);
                setSelectedMakeKitItemId("");
                setMakeKitRows([]);
                setMakeKitCurrentStock(0);
                setMakeKitQuantity(1);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMakeKit}
              disabled={
                !selectedMakeKitItemId ||
                makeKitQuantity === "" ||
                Number(makeKitQuantity) < 1 ||
                kitDetailsLoading ||
                makeRequiredRows.length === 0 ||
                makeKitHasInsufficientStock
              }
            >
              Make Kit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={breakKitDialogOpen} onOpenChange={setBreakKitDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Break Kit</DialogTitle>
            <DialogDescription>
              Select the kit item you want to break into single type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Select Kit Item</label>
            <SearchableSelect
              options={breakKitItemOptions}
              value={selectedBreakKitItemId}
              onValueChange={handleSelectBreakKitItem}
              placeholder="Choose kit item to break"
            />
            <label className="text-sm font-medium pt-1 block">Quantity to Break</label>
            <Input
              type="number"
              min={1}
              value={breakKitQuantity}
              onChange={(e) =>
                setBreakKitQuantity(
                  e.target.value === "" ? "" : Math.max(1, Number(e.target.value)),
                )
              }
              onBlur={() =>
                setBreakKitQuantity(
                  breakKitQuantity === "" ? 1 : Math.max(1, Number(breakKitQuantity)),
                )
              }
            />
            {selectedBreakKitItemId && (
              <p className="text-xs text-muted-foreground">
                Current kit stock: <span className="font-semibold">{breakKitCurrentStock}</span>
              </p>
            )}
            {kitDetailsLoading ? (
              <div className="text-xs text-muted-foreground border rounded p-2">
                Loading associated items...
              </div>
            ) : breakReceiveRows.length > 0 ? (
              <div className="border rounded">
                <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-semibold border-b bg-muted/40">
                  <div className="col-span-3">Item</div>
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1">Brand</div>
                  <div className="col-span-2 text-right">Stock</div>
                  <div className="col-span-1 text-right">Qty/Kit</div>
                  <div className="col-span-2 text-right">Receive</div>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {breakReceiveRows.map((row) => (
                    <div
                      key={row.itemPartId}
                      className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] border-b last:border-b-0"
                    >
                      <div className="col-span-3 font-medium">
                        {`${row.masterPartNo || "-"} | ${row.itemPartNo || "-"}`}
                      </div>
                      <div className="col-span-3 truncate" title={row.itemDescription}>
                        {row.itemDescription || "-"}
                      </div>
                      <div className="col-span-1 truncate" title={row.brand}>
                        {row.brand || "-"}
                      </div>
                      <div className="col-span-2 text-right">{row.stock}</div>
                      <div className="col-span-1 text-right">{row.qtyPerKit}</div>
                      <div className="col-span-2 text-right font-semibold text-emerald-700">
                        {row.receiveQty}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedBreakKitItemId ? (
              <div className="text-xs text-muted-foreground border rounded p-2">
                No associated kit items found.
              </div>
            ) : null}
            {breakKitValidationMessage && (
              <div
                className={`text-xs rounded px-2 py-1 border ${
                  breakKitHasInsufficientStock || breakReceiveRows.length === 0
                    ? "text-red-700 border-red-200 bg-red-50"
                    : "text-amber-700 border-amber-200 bg-amber-50"
                }`}
              >
                {breakKitValidationMessage}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBreakKitDialogOpen(false);
                setSelectedBreakKitItemId("");
                setBreakKitRows([]);
                setBreakKitCurrentStock(0);
                setBreakKitQuantity(1);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBreakKit}
              disabled={
                !selectedBreakKitItemId ||
                breakKitQuantity === "" ||
                Number(breakKitQuantity) < 1 ||
                kitDetailsLoading ||
                breakReceiveRows.length === 0 ||
                breakKitHasInsufficientStock
              }
            >
              Break Kit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
