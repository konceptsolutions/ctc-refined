import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import {
  Plus,
  Eye,
  Edit,
  Trash2,
  X,
  Check,
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface AdjustmentItem {
  id: string;
  itemId: string;
  itemName: string;
  qtyInStock: number;
  quantity: number;
  lastPurchaseRate: number;
  rate: number;
  priceA?: number;
  priceB?: number;
  priceM?: number;
  total: number;
  rackId?: string;
  shelfId?: string;
  rack_code?: string;
  shelf_no?: string;
}

interface AdjustmentRecord {
  id: string;
  date: string;
  subject: string;
  store: string;
  store_id?: string;
  addInventory: boolean;
  items: AdjustmentItem[];
  notes: string;
  totalAmount: number;
  status: string;
  adjustment_no?: number;
  createdAt?: string;
}

const ADJUST_ITEM_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];

export const AdjustItem = () => {
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [selectedRecord, setSelectedRecord] = useState<AdjustmentRecord | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  const [recordToView, setRecordToView] = useState<AdjustmentRecord | null>(
    null,
  );
  const [recordToApprove, setRecordToApprove] =
    useState<AdjustmentRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [racks, setRacks] = useState<any[]>([]);
  const [shelves, setShelves] = useState<Record<string, any[]>>({});
  const [itemLocations, setItemLocations] = useState<
    Array<{ id: string; partId: string; rack_id: string; shelf_id: string }>
  >([]);
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  // Form state
  const [addInventory, setAddInventory] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [subject, setSubject] = useState("");
  const [store, setStore] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentItem[]>([
    {
      id: "1",
      itemId: "",
      itemName: "",
      qtyInStock: 0,
      quantity: 0,
      lastPurchaseRate: 0,
      rate: 0,
      priceA: 0,
      priceB: 0,
      priceM: 0,
      total: 0,
    },
  ]);

  // API data
  const [records, setRecords] = useState<AdjustmentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterPartId, setFilterPartId] = useState<string>("");
  const [filterAdjustType, setFilterAdjustType] = useState<
    "all" | "add" | "remove"
  >("all");
  const [stores, setStores] = useState<{ value: string; label: string }[]>([]);
  const [parts, setParts] = useState<
    {
      id: string;
      partNo: string;
      masterPartNo: string | null;
      brand: string;
      description: string;
      qtyInStock: number;
      lastPurchaseRate: number;
      purchasePrice: number;
      avgCost: number;
      priceA: number;
      priceB: number;
      priceM: number;
    }[]
  >([]);
  const [stockBalances, setStockBalances] = useState<
    Record<string, { qty: number; rate: number }>
  >({});

  // Fetch adjustments
  const fetchAdjustments = useCallback(async () => {
    console.log("fetchAdjustments called", { currentPage, itemsPerPage, filterPartId, debouncedSearch });
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
        search: debouncedSearch,
      };
      if (filterPartId) {
        params.part_id = filterPartId;
      }
      if (filterAdjustType === "add") {
        params.adjust_type = "add";
      } else if (filterAdjustType === "remove") {
        params.adjust_type = "remove";
      }
      console.log("API call params:", params);
      const response: any = await apiClient.getAdjustments(params);
      console.log("fetchAdjustments response", response);

      if (response.error) {
        toast.error(response.error);
        return;
      }

      const data = response.data || [];
      const pagination = response.pagination || { total: 0 };

      setRecords(
        data.map((a: any) => ({
          id: a.id,
          adjustment_no: a.adjustment_no,
          date: new Date(a.date).toLocaleDateString("en-GB"),
          subject: a.subject || "",
          store: a.store_name || "N/A",
          store_id: a.store_id,
          addInventory:
            a.add_inventory === true || a.add_inventory === "true",
          items: [],
          notes: a.notes || "",
          totalAmount: parseFloat(a.total_amount) || 0,
          status: a.status || "pending",
          createdAt: a.created_at,
        })),
      );
      setTotalRecords(pagination.total || 0);
    } catch (error: any) {
      toast.error(`Error fetching adjustments: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearch,
    filterPartId,
    filterAdjustType,
  ]);

  const handleApproveClick = async (record: AdjustmentRecord) => {
    try {
      setLoading(true);
      // Fetch full details for the adjustment to get its items
      const response: any = await apiClient.getAdjustment(record.id);
      if (response.error) {
        toast.error(response.error);
        return;
      }

      console.log('Adjustment API Response:', response);
      console.log('First item:', response.items?.[0]);

      const fullRecord = {
        ...record,
        items: (response.items || []).map((item: any) => {
          console.log('Mapping item:', { id: item.id, brand: item.brand, rack: item.rack_id, shelf: item.shelf_id });
          return {
            id: item.id,
            partId: item.part_id,
            partNo: item.part_no,
            brand: item.brand || "",
            itemName: item.part_description || item.part_no,
            quantity: item.quantity,
            rate: item.cost || 0,
            total: (item.quantity || 0) * (item.cost || 0),
            rack_id: item.rack_id || "",
            shelf_id: item.shelf_id || "",
          };
        }),
      };

      console.log('Full record with brands and locations:', fullRecord);

      setRecordToApprove(fullRecord);

      // Initialize item locations
      setItemLocations(
        fullRecord.items.map((item: any) => {
          // If we have a rack_id, fetch its shelves
          if (item.rack_id) {
            fetchShelves(item.rack_id);
          }
          return {
            id: item.id,
            partId: item.partId,
            rack_id: item.rack_id || "",
            shelf_id: item.shelf_id || "",
          };
        }),
      );

      // Fetch racks for the store
      const racksRes: any = await apiClient.getRacks(record.store_id);
      setRacks(racksRes.data || racksRes || []);

      setApproveDialogOpen(true);
    } catch (error: any) {
      toast.error(`Error initiating approval: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!recordToApprove) return;

    try {
      setLoading(true);
      const response: any = await apiClient.approveAdjustment(
        recordToApprove.id,
        {
          items: itemLocations.map((loc) => ({
            id: loc.id,
            rack_id: loc.rack_id || undefined,
            shelf_id: loc.shelf_id || undefined,
          })),
        },
      );

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success("Adjustment approved successfully");
      setApproveDialogOpen(false);
      setRecordToApprove(null);
      fetchAdjustments();
    } catch (error: any) {
      toast.error(`Error approving adjustment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchShelves = async (rackId: string) => {
    if (shelves[rackId]) return;
    try {
      const resp: any = await apiClient.getShelves(rackId);
      setShelves((prev) => ({
        ...prev,
        [rackId]: resp.data || resp || [],
      }));
    } catch (error) {
      console.error("Error fetching shelves:", error);
    }
  };

  const handleLocationChange = (
    itemId: string,
    field: "rack_id" | "shelf_id",
    value: string,
  ) => {
    setItemLocations((prev) =>
      prev.map((loc) =>
        loc.id === itemId
          ? {
            ...loc,
            [field]: value,
            // Reset shelf if rack changes
            ...(field === "rack_id" ? { shelf_id: "" } : {}),
          }
          : loc,
      ),
    );

    if (field === "rack_id" && value) {
      fetchShelves(value);
    }
  };

  // Fetch stores
  const fetchStores = async () => {
    try {
      const response: any = await apiClient.getStores();
      if (response.error) {
        toast.error(`Error fetching stores: ${response.error}`);
        return;
      }
      // Handle both response formats: { data: [...] } or direct array
      const storesData = response.data || response;
      if (Array.isArray(storesData) && storesData.length > 0) {
        setStores(
          storesData.map((s: any) => ({
            value: s.id,
            label:
              s.name ||
              `${s.code || ""} - ${s.name || ""}`.trim() ||
              "Unnamed Store",
          })),
        );
      } else {
        setStores([]);
      }
    } catch (error: any) {
      toast.error(`Error fetching stores: ${error.message || error}`);
    }
  };

  // Fetch all active parts for the dropdown selection
  const fetchParts = async () => {
    try {
      console.log("Fetching all active parts for dropdown...");
      const response: any = await apiClient.getPartsDropdown();

      if (response.error) {
        toast.error(`Error fetching adjustment parts: ${response.error}`);
        return;
      }

      const partsData = response.data || response || [];
      console.log(`Found ${partsData.length} active parts for selection`);

      setStockBalances({});

      setParts(
        partsData.map((p: any) => {
          // Remove grade information from description if present
          const cleanDescription = (p.description || "")
            .replace(/\(Grade:\s*[^)]+\)/gi, "")
            .trim();

          return {
            id: p.id,
            partNo: p.partNo || "",
            masterPartNo: p.masterPartNo ?? null,
            brand: p.brand || "",
            description: cleanDescription,
            qtyInStock: 0,
            lastPurchaseRate: 0,
            purchasePrice: 0,
            avgCost: 0,
            priceA: 0,
            priceB: 0,
            priceM: 0,
          };
        }),
      );
    } catch (error: any) {
      console.error("Error fetching adjustment parts:", error);
      toast.error("Failed to load parts list");
    }
  };

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    fetchParts();
  }, []);

  const applyPartDetailsToRow = useCallback(
    async (rowId: string, partId: string, isAddMode: boolean) => {
      try {
        const [stockRes, detailRes] = await Promise.all([
          apiClient.getPartCostLookup(partId),
          apiClient.getStockDetails(partId),
        ]);

        if ((stockRes as any)?.error) {
          console.error("Error fetching part stock:", (stockRes as any).error);
          return;
        }
        if ((detailRes as any)?.error) {
          console.error("Error fetching part details:", (detailRes as any).error);
          return;
        }

        const stock = stockRes as any;
        const part = detailRes as any;
        const qtyInStock = isAddMode
          ? (stock.current_stock ?? 0)
          : (stock.available_stock ?? stock.current_stock ?? 0);
        const newRate = parseFloat(part.cost || 0);

        setAdjustmentItems((items) =>
          items.map((it) => {
            if (it.id !== rowId) return it;
            const newQty = !isAddMode ? qtyInStock : it.quantity || 0;
            return {
              ...it,
              itemName: part.description || part.part_no,
              qtyInStock,
              lastPurchaseRate: parseFloat((part.avg_cost || stock.avg_cost || 0).toFixed(3)),
              rate: newRate,
              priceA: part.priceA || 0,
              priceB: part.priceB || 0,
              priceM: part.priceM || 0,
              quantity: newQty,
              total: newQty * newRate,
            };
          }),
        );
      } catch (err) {
        console.error("Error loading part details for adjustment:", err);
      }
    },
    [],
  );

  useEffect(() => {
    if (view !== "create" && view !== "edit") return;
    adjustmentItems.forEach((item) => {
      if (item.itemId) {
        applyPartDetailsToRow(item.id, item.itemId, !!addInventory);
      }
    });
    // Intentionally omit adjustmentItems — only refresh when add/remove mode or view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, addInventory, applyPartDetailsToRow]);

  useEffect(() => {
    if (store && (view === "create" || view === "edit")) {
      apiClient.getRacks(store).then((res: any) => {
        setRacks(res.data || res || []);
      }).catch(err => {
        console.error("Error fetching racks:", err);
      });
    } else {
      setRacks([]);
    }
  }, [store, view]);


  // Filter + sort records for list display
  const sortedRecords = useMemo(() => {
    const filtered = records.filter((record) => {
      if (filterAdjustType === "add") return record.addInventory === true;
      if (filterAdjustType === "remove") return record.addInventory === false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const noA = Number(a.adjustment_no || 0);
      const noB = Number(b.adjustment_no || 0);
      return noB - noA;
    });
  }, [records, filterAdjustType]);

  // Pagination logic
  const totalPages = Math.ceil(totalRecords / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;

  // Total amount calculation
  const totalAmount = useMemo(() => {
    return adjustmentItems.reduce((sum, item) => sum + item.total, 0);
  }, [adjustmentItems]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(sortedRecords.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  const handleAddItem = useCallback(() => {
    const newItem: AdjustmentItem = {
      id: Date.now().toString(),
      itemId: "",
      itemName: "",
      qtyInStock: 0,
      quantity: 0,
      lastPurchaseRate: 0,
      rate: 0,
      priceA: 0,
      priceB: 0,
      priceM: 0,
      total: 0,
      rackId: "",
      shelfId: "",
    };
    setAdjustmentItems((prev) => [...prev, newItem]);
  }, []);

  // Shortcut key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + Z
      if (e.altKey && e.key.toLowerCase() === "z") {
        if (view === "create" || view === "edit") {
          e.preventDefault();
          handleAddItem();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, handleAddItem]);

  const handleRemoveItem = (id: string) => {
    if (adjustmentItems.length > 1) {
      setAdjustmentItems(adjustmentItems.filter((item) => item.id !== id));
    }
  };

  const handleItemChange = (
    id: string,
    field: keyof AdjustmentItem,
    value: string | number,
  ) => {
    setAdjustmentItems(
      adjustmentItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };

          // Auto-calculate total using Rate
          if (field === "quantity" || field === "rate") {
            updated.total = updated.quantity * updated.rate;
          }

          // Fetch shelves if rack changes
          if (field === "rackId") {
            updated.shelfId = ""; // Reset shelf
            if (value) {
              fetchShelves(value as string);
            }
          }

          // When item is selected, use the same stock source as Sales Invoice / Stock In-Out
          if (field === "itemId" && value) {
            applyPartDetailsToRow(id, value as string, !!addInventory);
          }

          return updated;
        }
        return item;
      }),
    );
  };

  const onCreateRack = async (id: string, codeNo: string) => {
    if (!store) {
      toast.error("Please select a store first");
      return;
    }

    try {
      const response: any = await apiClient.createRack({
        codeNo,
        storeId: store,
        status: "Active",
      });

      if (response.error) {
        toast.error(response.error);
        return;
      }

      // Update racks list
      const newRack = {
        id: response.id,
        codeNo: response.codeNo,
        storeId: response.storeId,
      };
      setRacks((prev) => [...prev, newRack]);

      // Update the item that triggered the creation
      handleItemChange(id, "rackId", response.id);
      toast.success(`Rack "${codeNo}" created successfully`);
    } catch (error: any) {
      toast.error(`Error creating rack: ${error.message}`);
    }
  };

  const onCreateShelf = async (id: string, rackId: string, shelfNo: string) => {
    if (!rackId) {
      toast.error("Please select a rack first");
      return;
    }

    try {
      const response: any = await apiClient.createShelf({
        shelfNo,
        rackId,
        status: "Active",
      });

      if (response.error) {
        toast.error(response.error);
        return;
      }

      // Update shelves list
      const newShelf = {
        id: response.id,
        shelfNo: response.shelfNo,
        rackId: response.rackId,
      };
      setShelves((prev) => ({
        ...prev,
        [rackId]: [...(prev[rackId] || []), newShelf],
      }));

      // Update the item that triggered the creation
      handleItemChange(id, "shelfId", response.id);
      toast.success(`Shelf "${shelfNo}" created successfully`);
    } catch (error: any) {
      toast.error(`Error creating shelf: ${error.message}`);
    }
  };

  const handleReset = () => {
    setAddInventory(true);
    setDate(new Date().toISOString().split("T")[0]);
    setSubject("");
    setStore("");
    setCategory("");
    setSubCategory("");
    setNotes("");
    setAdjustmentItems([
      {
        id: "1",
        itemId: "",
        itemName: "",
        qtyInStock: 0,
        quantity: 0,
        lastPurchaseRate: 0,
        rate: 0,
        priceA: 0,
        priceB: 0,
        priceM: 0,
        total: 0,
        rackId: "",
        shelfId: "",
      },
    ]);
  };

  const handleSave = async () => {
    if (addInventory && !store) {
      toast.error("Please select a store");
      return;
    }

    const validItems = adjustmentItems.filter(
      (item) => item.itemId && item.quantity > 0,
    );
    if (validItems.length === 0) {
      toast.error("Please add at least one item with quantity");
      return;
    }

    // New validation: If removing inventory, check if quantity <= qtyInStock
    if (!addInventory) {
      const insufficientStockItem = validItems.find(
        (item) => item.quantity > item.qtyInStock,
      );
      if (insufficientStockItem) {
        toast.error(
          `Insufficient stock for ${insufficientStockItem.itemName || insufficientStockItem.itemId}. Available: ${insufficientStockItem.qtyInStock}, adjusting: ${insufficientStockItem.quantity}`,
        );
        return;
      }
    }

    try {
      setLoading(true);
      const adjustmentData = {
        date: date,
        subject: subject || undefined,
        store_id: addInventory ? store : undefined,
        add_inventory: addInventory,
        notes: notes || undefined,
        items: validItems.map((item) => ({
          part_id: item.itemId,
          quantity: item.quantity,
          cost: item.rate,
          priceA: item.priceA,
          priceB: item.priceB,
          priceM: item.priceM,
          rack_id: item.rackId || undefined,
          shelf_id: item.shelfId || undefined,
        })),
      };

      let response: any;
      if (view === "edit" && selectedRecord) {
        response = await apiClient.updateAdjustment(
          selectedRecord.id,
          adjustmentData,
        );
      } else {
        response = await apiClient.createAdjustment(adjustmentData);
      }

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success(
        view === "edit"
          ? "Adjustment updated successfully"
          : "Adjustment created successfully",
      );
      handleReset();
      setView("list");
      fetchAdjustments();
    } catch (error: any) {
      toast.error(`Error saving adjustment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (record: AdjustmentRecord) => {
    try {
      setLoading(true);
      const response: any = await apiClient.getAdjustment(record.id);

      if (response.error) {
        toast.error(response.error);
        return;
      }

      const adjustment = response;
      const viewRecord: AdjustmentRecord = {
        id: adjustment.id,
        date: new Date(adjustment.date).toLocaleDateString("en-GB"),
        subject: adjustment.subject || "",
        store: adjustment.store_name || "N/A",
        store_id: adjustment.store_id,
        addInventory: adjustment.add_inventory,
        items: (adjustment.items || []).map((item: any) => {
          // Build display name: PartNo (Brand) - Description
          const partNo = item.part_no || "";
          const brand = item.brand || "";
          const description = item.part_description || "";

          let displayName = partNo;
          if (brand) {
            displayName += ` (${brand})`;
          }
          if (description) {
            displayName += ` - ${description}`;
          }

          return {
            id: item.id,
            itemId: item.part_id,
            itemName: displayName,
            qtyInStock: 0,
            quantity: item.quantity,
            lastPurchaseRate: item.cost || 0,
            rate: item.cost || 0,
            priceA: item.priceA || 0,
            priceB: item.priceB || 0,
            priceM: item.priceM || 0,
            rackId: item.rack_id,
            rack_code: item.rack_code,
            shelfId: item.shelf_id,
            shelf_no: item.shelf_no,
            total: item.quantity * (item.cost || 0),
          };
        }),
        notes: adjustment.notes || "",
        totalAmount: adjustment.total_amount || 0,
        status: adjustment.status || "pending",
      };

      setRecordToView(viewRecord);
      setViewDialogOpen(true);
    } catch (error: any) {
      toast.error(`Error fetching adjustment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (record: AdjustmentRecord) => {
    try {
      setLoading(true);
      const response: any = await apiClient.getAdjustment(record.id);

      if (response.error) {
        toast.error(response.error);
        return;
      }

      const adjustment = response;
      const items = (adjustment.items || []).map(
        (item: any, index: number) => {
          // Pre-fetch shelves if rack exists
          if (item.rack_id) {
            fetchShelves(item.rack_id);
          }

          return {
            id: item.id, // Use database ID (UUID)
            itemId: item.part_id,
            itemName: `${item.part_no}${item.brand ? ` (${item.brand})` : ''} - ${item.part_description || ''}`,
            qtyInStock: stockBalances[item.part_id]?.qty || 0,
            quantity: item.quantity,
            lastPurchaseRate: item.cost || 0,
            rate: item.cost || 0,
            priceA: item.priceA || 0,
            priceB: item.priceB || 0,
            priceM: item.priceM || 0,
            rackId: item.rack_id,
            shelfId: item.shelf_id,
            total: item.quantity * (item.cost || 0),
          };
        },
      );

      setSelectedRecord({
        ...record,
        status: adjustment.status,
        addInventory: adjustment.add_inventory,
        items: items,
      });
      setAddInventory(!!adjustment.add_inventory);
      setDate(new Date(adjustment.date).toISOString().split("T")[0]);
      setSubject(adjustment.subject || "");
      setStore(adjustment.store_id || "");
      setNotes(adjustment.notes || "");

      setAdjustmentItems(
        items.length > 0
          ? items
          : [
            {
              id: "1",
              itemId: "",
              itemName: "",
              qtyInStock: 0,
              quantity: 0,
              lastPurchaseRate: 0,
              rate: 0,
              total: 0,
            },
          ],
      );
      setView("edit");
    } catch (error: any) {
      toast.error(`Error fetching adjustment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setRecordToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;

    try {
      setLoading(true);
      const response: any = await apiClient.deleteAdjustment(recordToDelete);

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success("Adjustment deleted successfully");
      setRecordToDelete(null);
      fetchAdjustments();
    } catch (error: any) {
      toast.error(`Error deleting adjustment: ${error.message}`);
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleCancel = () => {
    handleReset();
    setSelectedRecord(null);
    setView("list");
  };

  // List View
  if (view === "list") {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-8 bg-primary rounded-full" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Adjust Inventory
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage inventory adjustments and stock corrections
              </p>
            </div>
          </div>
          <div className="flex flex-1 max-w-sm relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search adjustments..."
              className="pl-9 h-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 max-w-[250px]">
            <SearchableSelect
              options={parts.map((p) => {
                const master = p.masterPartNo || "";
                const partNo = p.partNo || "";
                const both = master && partNo ? `${master} | ${partNo}` : master || partNo;
                const brand = p.brand ? ` (${p.brand})` : "";
                return {
                  value: p.id,
                  label: `${both}${brand}`,
                };
              })}
              value={filterPartId}
              onValueChange={(value) => {
                console.log("SearchableSelect onValueChange:", value);
                setFilterPartId(value);
                setCurrentPage(1); // Reset to first page when filter changes
              }}
              placeholder="Filter by Item"
              className="h-9"
            />
          </div>
          <div className="w-[180px]">
            <Select
              value={filterAdjustType}
              onValueChange={(value: "all" | "add" | "remove") => {
                setFilterAdjustType(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Adjust Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="add">Add Inventory</SelectItem>
                <SelectItem value="remove">Remove Inventory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={fetchAdjustments}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => setView("create")}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Adjust
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        selectedIds.length === sortedRecords.length &&
                        sortedRecords.length > 0
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold w-16">
                    S.No
                  </TableHead>
                  <TableHead className="text-xs font-semibold">STORE</TableHead>
                  <TableHead className="text-xs font-semibold">SUBJECT</TableHead>
                  <TableHead className="text-xs font-semibold">TOTAL</TableHead>
                  <TableHead className="text-xs font-semibold">DATE</TableHead>
                  <TableHead className="text-xs font-semibold">
                    STATUS
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-center">
                    ACTIONS
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && records.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : sortedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      No adjustments found
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRecords.map((record, index) => (
                    <TableRow key={record.id} className="hover:bg-muted/20">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(record.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(record.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell
                        className="text-xs font-bold text-primary hover:underline cursor-pointer"
                        onClick={() => setSearch(String(record.adjustment_no || ""))}
                      >
                        {record.adjustment_no || (currentPage - 1) * itemsPerPage + index + 1}
                      </TableCell>
                      <TableCell className="text-xs">
                        {record.store}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[200px]">
                        {record.subject || "No Subject"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(record.totalAmount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs">{record.date}</TableCell>
                      <TableCell className="text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${record.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : record.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : record.status === "deleted"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                        >
                          {(record.status || "PENDING").toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <ActionButtonTooltip label="View" variant="view">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleView(record)}
                              className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </Button>
                          </ActionButtonTooltip>

                          {record.status === "pending" && (
                            <ActionButtonTooltip label="Approve" variant="edit">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleApproveClick(record)}
                                className="text-green-600 hover:text-green-700 flex items-center gap-1 text-xs font-medium"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Approve
                              </Button>
                            </ActionButtonTooltip>
                          )}

                          {record.status !== "deleted" && (
                            <ActionButtonTooltip label="Edit" variant="edit">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(record)}
                                className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Edit
                              </Button>
                            </ActionButtonTooltip>
                          )}

                          <ActionButtonTooltip label="Delete" variant="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(record.id)}
                              className="text-destructive hover:text-destructive/80 flex items-center gap-1 text-xs font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </Button>
                          </ActionButtonTooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              {totalRecords === 0 ? 0 : startIndex + 1} to{" "}
              {Math.min(startIndex + itemsPerPage, totalRecords)} of{" "}
              {totalRecords} records
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Rows per page:</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(v) => {
                  setItemsPerPage(parseInt(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-24 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUST_ITEM_PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)} className="text-xs">
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </Button>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  className="w-10 h-7 text-xs text-center"
                  min={1}
                  max={totalPages}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Last
              </Button>
            </div>
          </div>
        </div>

        {/* View Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-5 h-5 bg-primary rounded flex items-center justify-center">
                  <Eye className="w-3 h-3 text-primary-foreground" />
                </div>
                View Adjustment Details
              </DialogTitle>
            </DialogHeader>
            {recordToView && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">ID</Label>
                    <p className="text-xs font-medium">
                      {recordToView.id.substring(0, 8)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Date
                    </Label>
                    <p className="text-xs font-medium">{recordToView.date}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Store
                    </Label>
                    <p className="text-xs font-medium">{recordToView.store}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Total Amount
                    </Label>
                    <p className="text-xs font-medium text-primary">
                      {recordToView.totalAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">
                    Add Inventory
                  </Label>
                  <p className="text-xs font-medium">
                    {recordToView.addInventory ? "Yes" : "No"}
                  </p>
                </div>
                {recordToView.subject && (
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Subject
                    </Label>
                    <p className="text-xs font-medium">
                      {recordToView.subject}
                    </p>
                  </div>
                )}
                {recordToView.notes && (
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Notes
                    </Label>
                    <p className="text-xs font-medium">{recordToView.notes}</p>
                  </div>
                )}
                {recordToView.items.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground text-xs mb-2 block">
                      Items
                    </Label>
                    <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Item</TableHead>
                            <TableHead className="text-xs">Quantity</TableHead>
                            <TableHead className="text-xs">Rate</TableHead>
                            <TableHead className="text-xs">Rack</TableHead>
                            <TableHead className="text-xs">Shelf</TableHead>
                            <TableHead className="text-xs">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recordToView.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-xs">
                                {item.itemName}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item.rate.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item.rack_code || "-"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item.shelf_no || "-"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item.total.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewDialogOpen(false)}
              >
                Close
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
                Are you sure you want to delete this adjustment? This action
                cannot be undone.
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

        {/* Approve Dialog */}
        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-green-700">
                <div className="w-5 h-5 bg-green-100 rounded flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-700" />
                </div>
                Approve Adjustment & Assign Locations
              </DialogTitle>
              <DialogDescription className="text-xs">
                As a Store Manager, assign the Rack and Shelf for each item to
                complete the stock adjustment.
              </DialogDescription>
            </DialogHeader>
            {recordToApprove && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border">
                  <div className="text-xs">
                    <span className="text-muted-foreground">ID:</span>{" "}
                    <span className="font-medium">
                      {recordToApprove.id.substring(0, 8)}
                    </span>
                  </div>
                  <div className="text-xs text-right">
                    <span className="text-muted-foreground">Subject:</span>{" "}
                    <span className="font-medium">
                      {recordToApprove.subject}
                    </span>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">
                          Part No
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Brand
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Description
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Qty
                        </TableHead>
                        <TableHead className="text-xs font-semibold min-w-[150px]">
                          Rack
                        </TableHead>
                        <TableHead className="text-xs font-semibold min-w-[150px]">
                          Shelf
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recordToApprove.items.map((item: any) => {
                        const loc = itemLocations.find((l) => l.id === item.id);
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/20">
                            <TableCell className="text-xs font-medium">
                              {item.partNo || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.brand || "-"}
                            </TableCell>
                            <TableCell className="text-xs truncate max-w-[200px]">
                              {item.itemName}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-primary">
                              {item.quantity}
                            </TableCell>
                            <TableCell>
                              <SearchableSelect
                                options={racks.map((rack) => ({
                                  value: rack.id,
                                  label: rack.codeNo,
                                  description: rack.description || `Rack ${rack.codeNo}`
                                }))}
                                value={loc?.rack_id || ""}
                                onValueChange={(val) =>
                                  handleLocationChange(
                                    item.id,
                                    "rack_id",
                                    val === "none" ? "" : val,
                                  )
                                }
                                placeholder="Search or select rack..."
                                allowCustom={true}
                                onCreate={async (newRackCode) => {
                                  if (!recordToApprove?.store_id) {
                                    toast.error("Store ID is required to create a new rack");
                                    return;
                                  }

                                  try {
                                    const response: any = await apiClient.createRack({
                                      codeNo: newRackCode,
                                      storeId: recordToApprove.store_id,
                                      description: `Auto-created rack ${newRackCode}`,
                                      status: "Active"
                                    });

                                    if (response.error) {
                                      toast.error(`Failed to create rack: ${response.error}`);
                                      return;
                                    }

                                    // Refresh racks list
                                    const racksRes: any = await apiClient.getRacks(recordToApprove.store_id);
                                    setRacks(racksRes.data || racksRes || []);

                                    // Auto-select the newly created rack
                                    if (response.data?.id || response.id) {
                                      handleLocationChange(item.id, "rack_id", response.data?.id || response.id);
                                    }

                                    toast.success(`Rack "${newRackCode}" created successfully`);
                                  } catch (error: any) {
                                    toast.error(`Failed to create rack: ${error.message}`);
                                  }
                                }}
                                createLabel="rack"
                                className="h-8 text-[11px]"
                              />
                            </TableCell>
                            <TableCell>
                              <SearchableSelect
                                options={(shelves[loc?.rack_id] || []).map((shelf) => ({
                                  value: shelf.id,
                                  label: shelf.shelfNo,
                                  description: shelf.description || `Shelf ${shelf.shelfNo}`
                                }))}
                                value={loc?.shelf_id || ""}
                                onValueChange={(val) =>
                                  handleLocationChange(
                                    item.id,
                                    "shelf_id",
                                    val === "none" ? "" : val,
                                  )
                                }
                                placeholder={loc?.rack_id ? "Search or select shelf..." : "Select rack first"}
                                allowCustom={!!loc?.rack_id}
                                onCreate={async (newShelfNo) => {
                                  if (!loc?.rack_id) {
                                    toast.error("Please select a rack first");
                                    return;
                                  }

                                  try {
                                    const response: any = await apiClient.createShelf({
                                      shelfNo: newShelfNo,
                                      rackId: loc.rack_id,
                                      description: `Auto-created shelf ${newShelfNo}`,
                                      status: "Active"
                                    });

                                    if (response.error) {
                                      toast.error(`Failed to create shelf: ${response.error}`);
                                      return;
                                    }

                                    // Refresh shelves for this rack
                                    fetchShelves(loc.rack_id);

                                    // Auto-select the newly created shelf
                                    if (response.data?.id || response.id) {
                                      handleLocationChange(item.id, "shelf_id", response.data?.id || response.id);
                                    }

                                    toast.success(`Shelf "${newShelfNo}" created successfully`);
                                  } catch (error: any) {
                                    toast.error(`Failed to create shelf: ${error.message}`);
                                  }
                                }}
                                createLabel="shelf"
                                className="h-8 text-[11px]"
                                disabled={!loc?.rack_id}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setApproveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={handleConfirmApprove}
                disabled={loading}
              >
                {loading ? "Approving..." : "Confirm & Approve"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Create/Edit Form
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 border-b border-border px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-primary rounded flex items-center justify-center">
              <Plus className="w-3 h-3 text-primary-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {view === "edit" ? "Edit Adjustment" : "Adjust Item Stock"}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCancel}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Form Content */}
        <div className="p-3 space-y-4">
          {/* Add/Remove Inventory Toggle */}
          <div className="flex items-center gap-2 py-2 border-b border-border/50 mb-4">
            <Switch
              id="inventory-toggle"
              checked={!!addInventory}
              disabled={view === "edit"}
              onCheckedChange={(checked) => {
                setAddInventory(checked);
                if (!checked) {
                  // Remove mode should not use a selected store.
                  setStore("");
                }
              }}
            />
            <Label
              htmlFor="inventory-toggle"
              className={`text-xs font-semibold select-none ${view === "edit" ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {addInventory ? "Add Inventory" : "Remove Inventory"}
            </Label>
          </div>

          {/* Top Row - Date, Subject, Store */}
          <div
            className={`grid grid-cols-1 gap-3 ${
              addInventory ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            <div className="space-y-1">
              <Label className="text-xs">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subject</Label>
              <Input
                placeholder="Enter subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            {addInventory && (
              <div className="space-y-1">
                <Label className="text-xs">
                  Store <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  options={stores}
                  value={store}
                  onValueChange={setStore}
                  placeholder="Select store..."
                />
                {!store && (
                  <p className="text-[10px] text-destructive">Required</p>
                )}
              </div>
            )}
          </div>

          {/* Items Section */}
          <div className="space-y-3">
            {/* Add Button and Filters Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddItem}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add (Alt + Z)
              </Button>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto border border-border rounded-lg max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="min-w-[300px] text-xs">
                      Item
                    </TableHead>
                    <TableHead className="min-w-[80px] text-xs">
                      Qty in Stock
                    </TableHead>
                    <TableHead className="min-w-[100px] text-xs">
                      Quantity
                    </TableHead>
                    <TableHead className="min-w-[100px] text-xs">
                      Last AVG
                    </TableHead>
                    <TableHead className="min-w-[100px] text-xs">
                      Rate
                    </TableHead>
                    <TableHead className="min-w-[100px] text-xs">
                      Price A
                    </TableHead>
                    <TableHead className="min-w-[100px] text-xs">
                      Price B
                    </TableHead>
                    <TableHead className="min-w-[100px] text-xs">
                      Price M
                    </TableHead>
                    <TableHead className="min-w-[150px] text-xs">
                      Rack
                    </TableHead>
                    <TableHead className="min-w-[150px] text-xs">
                      Shelf
                    </TableHead>
                    <TableHead className="min-w-[80px] text-xs">
                      Total
                    </TableHead>
                    <TableHead className="w-12 text-xs text-center">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustmentItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <SearchableSelect
                          options={parts.map((p) => {
                            const master = p.masterPartNo || "";
                            const partNo = p.partNo || "";
                            const both = master && partNo ? `${master} | ${partNo}` : master || partNo;
                            const brand = p.brand ? ` (${p.brand})` : "";
                            return {
                              value: p.id,
                              label: `${both}${brand} - ${p.description}`,
                            };
                          })}
                          value={item.itemId}
                          onValueChange={(v) =>
                            handleItemChange(item.id, "itemId", v)
                          }
                          placeholder="Select item"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.qtyInStock}
                          disabled
                          className="h-8 text-xs bg-muted"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Input
                            type="number"
                            placeholder="Enter quantity"
                            value={item.quantity || ""}
                            onChange={(e) =>
                              handleItemChange(
                                item.id,
                                "quantity",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className={`h-8 text-xs border-primary/50 focus:border-primary ${!addInventory && item.quantity > item.qtyInStock
                              ? "border-destructive text-destructive focus-visible:ring-destructive"
                              : ""
                              }`}
                          />
                          {!item.quantity && (
                            <p className="text-[10px] text-destructive">
                              Required
                            </p>
                          )}
                          {!addInventory && item.quantity > item.qtyInStock && (
                            <p className="text-[10px] text-destructive font-semibold">
                              Max available: {item.qtyInStock}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.lastPurchaseRate}
                          disabled
                          className="h-8 text-xs bg-muted"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          placeholder="Rate"
                          value={item.rate ?? ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "rate",
                              e.target.value === ""
                                ? 0
                                : Number.isNaN(parseFloat(e.target.value))
                                  ? 0
                                  : parseFloat(e.target.value),
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          placeholder="Price A"
                          value={item.priceA || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "priceA",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-8 text-xs border-dashed border-muted-foreground/30 focus:border-solid focus:border-primary bg-primary/5"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          placeholder="Price B"
                          value={item.priceB || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "priceB",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-8 text-xs border-dashed border-muted-foreground/30 focus:border-solid focus:border-primary bg-primary/5"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          placeholder="Price M"
                          value={item.priceM || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "priceM",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-8 text-xs border-dashed border-muted-foreground/30 focus:border-solid focus:border-primary bg-primary/5"
                        />
                      </TableCell>

                      <TableCell>
                        <SearchableSelect
                          options={racks.map((rack) => ({
                            value: rack.id,
                            label: rack.codeNo,
                          }))}
                          value={item.rackId}
                          onValueChange={(val) =>
                            handleItemChange(item.id, "rackId", val)
                          }
                          onCreate={(val) => onCreateRack(item.id, val)}
                          createLabel="Rack"
                          placeholder="Rack"
                          disabled={!store}
                        />
                      </TableCell>
                      <TableCell>
                        <SearchableSelect
                          options={(shelves[item.rackId || ""] || []).map(
                            (shelf) => ({
                              value: shelf.id,
                              label: shelf.shelfNo,
                            }),
                          )}
                          value={item.shelfId}
                          onValueChange={(val) =>
                            handleItemChange(item.id, "shelfId", val)
                          }
                          onCreate={(val) =>
                            onCreateShelf(item.id, item.rackId || "", val)
                          }
                          createLabel="Shelf"
                          placeholder="Shelf"
                          disabled={!item.rackId}
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          type="number"
                          value={item.total}
                          disabled
                          className="h-8 text-xs bg-muted"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Total Amount - below items table */}
            <div className="flex justify-end">
              <div className="bg-muted/30 border border-border rounded-lg px-4 py-2 text-right">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-lg font-bold text-primary">
                  {totalAmount.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-xs max-w-md min-h-[50px]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={loading}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div >
  );
};
