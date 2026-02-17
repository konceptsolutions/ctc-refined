import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Filter,
  X,
  Edit,
  Plus,
  Loader2,
  Trash2,
  Archive,
  Layers,
  RefreshCw,
  Package,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";

interface StockItem {
  part_id: string;
  part_no: string;
  master_part_no: string | null;
  description: string | null;
  brand: string | null;
  category: string | null;
  location: string | null;
  rack: string | null;
  shelf: string | null;
  store: string | null;
  current_stock: number;
}

type StockStatusFilter = "all" | "in_stock" | "out_of_stock" | "low_stock";

export const CurrentStock = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Edit & Bulk Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]); // For Bulk Entry item selection

  // Edit form state
  const [editPartNo, setEditPartNo] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStoreId, setEditStoreId] = useState("");
  const [editRackId, setEditRackId] = useState("");
  const [editShelfId, setEditShelfId] = useState("");
  const [editQuantity, setEditQuantity] = useState(""); // Quantity to move/assign
  const [isUpdating, setIsUpdating] = useState(false);
  const [unallocatedDerived, setUnallocatedDerived] = useState(0); // Store unallocated calc

  // Transfer Mode State
  const [editMode, setEditMode] = useState<"assign" | "transfer">("assign");
  const [editSourceLocation, setEditSourceLocation] = useState<any>(null);

  const [viewLocationDialogOpen, setViewLocationDialogOpen] = useState(false);
  const [selectedPartLocations, setSelectedPartLocations] = useState<any[]>([]);
  const [viewingItem, setViewingItem] = useState<StockItem | null>(null);

  // Bulk Entry state
  const [bulkRows, setBulkRows] = useState<Array<{
    partId: string;
    type: "in" | "out";
    quantity: string;
    storeId: string;
    rackId: string;
    shelfId: string;
    notes: string;
    currentStock: number;
    unassignedStock: number;
    availableRacks: any[];
    availableShelves: any[];
  }>>([{
    partId: "",
    type: "in",
    quantity: "",
    storeId: "",
    rackId: "",
    shelfId: "",
    notes: "",
    currentStock: 0,
    unassignedStock: 0,
    availableRacks: [],
    availableShelves: []
  }]);

  // Fetch initial data
  useEffect(() => {
    fetchCategories();
    fetchStores();
    fetchParts();
  }, []);

  // Fetch stock data when filters change
  useEffect(() => {
    fetchStockData();
  }, [selectedCategory, stockStatusFilter, currentPage, itemsPerPage]);

  // Debounce search query
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchStockData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchCategories = async () => {
    try {
      const response = await apiClient.getCategories();
      const data = Array.isArray(response) ? response : (response as any).data || [];
      const categoryNames = data
        .map((cat: any) => cat.name || cat.category_name)
        .filter((name: string) => name && name.trim() !== '');
      setCategories(['all', ...categoryNames]);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategories(['all']);
    }
  };

  const fetchStockData = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };

      if (selectedCategory !== "all") {
        // Find category by name
        const response = await apiClient.getCategories();
        const data = Array.isArray(response) ? response : (response as any).data || [];
        const category = data.find((cat: any) =>
          (cat.name || cat.category_name) === selectedCategory
        );
        if (category) {
          params.category_id = category.id;
        }
      }

      if (stockStatusFilter === "in_stock") {
        params.in_stock = true;
      } else if (stockStatusFilter === "out_of_stock") {
        params.out_of_stock = true;
      } else if (stockStatusFilter === "low_stock") {
        params.low_stock = true;
      }

      if (searchQuery) {
        params.search = searchQuery;
      }

      const response = await apiClient.getPartRackShelfSummary(params);
      let data = (response as any).data || [];
      const pagination = (response as any).pagination;

      // Client-side enforcement of stock status filter (in case backend doesn't apply it)
      if (stockStatusFilter === "in_stock") {
        data = data.filter((item: StockItem) => (item.current_stock ?? 0) > 0);
      } else if (stockStatusFilter === "out_of_stock") {
        data = data.filter((item: StockItem) => (item.current_stock ?? 0) <= 0);
      }

      setStockData(data);
      setTotalItems(pagination?.total || data.length);
      setTotalPages(pagination?.totalPages || 1);
    } catch (error: any) {
      toast.error(error.error || "Failed to fetch stock data");
      setStockData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await apiClient.getStores();
      setStores((response as any).data || response || []);
    } catch (error) { }
  };

  const fetchParts = async () => {
    try {
      const response = await apiClient.getParts({ page: 1, limit: 1000 });
      const partsData = (response as any).data || response;
      if (Array.isArray(partsData)) {
        setParts(partsData.map((part: any) => ({
          value: part.id,
          label: `${part.partNo} - ${part.description || ""}`
        })));
      }
    } catch (error) { }
  };

  const fetchRacks = async (storeId: string) => {
    try {
      const response = await apiClient.getRacks(storeId);
      setRacks((response as any).data || response || []);
    } catch (error) { }
  };

  const fetchShelves = async (rackId: string) => {
    try {
      const response = await apiClient.getShelves(rackId);
      setShelves((response as any).data || response || []);
    } catch (error) { }
  };

  const processLocationData = (rawData: any[]) => {
    // 1. Separate Allocated vs Unallocated
    const locationData = Array.isArray(rawData) ? rawData : [];

    // 2. Filter out zero quantities ONLY if they have no rack/shelf assignments
    const unassignedData = locationData.filter((l: any) => {
      const hasNoLocation = !l.rack && !l.shelf && (!l.store || l.store === "Unallocated");
      const hasZeroQuantity = l.quantity === 0;
      return hasNoLocation && hasZeroQuantity;
    });

    const allocatedData = locationData.filter((l: any) => !unassignedData.includes(l));

    // 3. Aggregate Allocated Rows
    const allocatedMap = new Map();
    allocatedData.forEach((l: any) => {
      const key = `${l.store}-${l.rack}-${l.shelf}`;
      if (!allocatedMap.has(key)) {
        allocatedMap.set(key, { ...l });
      } else {
        const existing = allocatedMap.get(key);
        if (existing) existing.quantity += l.quantity;
      }
    });
    const aggregatedAllocated = Array.from(allocatedMap.values());

    // 4. Calculate Net Unallocated (Sum of all unallocated, including negatives)
    const netUnallocated = unassignedData.reduce((sum: number, l: any) => sum + l.quantity, 0);

    // 5. Find "Primary" Store for unallocated (largest positive holder)
    const primaryUnallocatedEntry = unassignedData
      .filter((l: any) => l.quantity > 0 && l.store !== "No Store")
      .sort((a: any, b: any) => b.quantity - a.quantity)[0];

    const displayRows = [...aggregatedAllocated];

    // ONLY add the unallocated row IF there is actually unallocated stock
    if (netUnallocated !== 0) {
      displayRows.push({
        store: primaryUnallocatedEntry ? primaryUnallocatedEntry.store : "Unallocated",
        rack: "No Rack",
        shelf: "No Shelf",
        quantity: netUnallocated,
        isUnlocated: true
      });
    }

    // Sort: Allocated first, then Unallocated
    displayRows.sort((a: any, b: any) => {
      if (!!a.isUnlocated === !!b.isUnlocated) return 0;
      return a.isUnlocated ? 1 : -1;
    });

    return { displayRows, netUnallocated };
  };

  const handleViewLocations = async (item: StockItem) => {
    setViewingItem(item);
    setViewLocationDialogOpen(true);
    setSelectedPartLocations([]); // Reset while loading
    try {
      const response = await apiClient.getPartLocations(item.part_id);
      // Ensure data is an array
      let data = (response as any).data;
      if (!Array.isArray(data)) {
        // If response itself is an array use it, otherwise empty array
        data = Array.isArray(response) ? response : [];
      }

      const { displayRows } = processLocationData(data);
      setSelectedPartLocations(displayRows);
    } catch (error) {
      console.error("View Locations Error:", error);
      toast.error("Failed to load location details");
      setSelectedPartLocations([]);
    }
  };

  // Logic for Edit Dialog
  useEffect(() => {
    if (editStoreId) {
      fetchRacks(editStoreId);
    } else {
      setRacks([]);
      setEditRackId("");
      setEditShelfId("");
    }
  }, [editStoreId]);

  useEffect(() => {
    if (editRackId && editRackId !== "none") {
      fetchShelves(editRackId);
    } else {
      setShelves([]);
      setEditShelfId("");
    }
  }, [editRackId]);

  const handleEditClick = async (item: StockItem) => {
    setEditingItem(item);
    setEditPartNo(item.part_no);
    setEditDescription(item.description || "");

    // Reset form to "Assign Unallocated" mode by default
    setEditMode("assign");
    setEditSourceLocation(null);
    setEditStoreId("");
    setEditRackId("none");
    setEditShelfId("none");
    setEditQuantity("");

    // Load current locations to show in the dialog
    setSelectedPartLocations([]);
    try {
      const response = await apiClient.getPartLocations(item.part_id);
      let data = (response as any).data;
      if (!Array.isArray(data)) {
        data = Array.isArray(response) ? response : [];
      }
      const { displayRows, netUnallocated } = processLocationData(data);
      setSelectedPartLocations(displayRows);
      setUnallocatedDerived(netUnallocated);
      // Pre-fill quantity with unallocated amount if positive
      setEditQuantity(netUnallocated > 0 ? netUnallocated.toString() : "");

    } catch (error) {
      console.error("Failed to load locations for edit:", error);
    }

    setEditDialogOpen(true);
  };

  const handleTransferClick = async (location: any) => {
    // Switch to Transfer Mode
    setEditMode("transfer");
    setEditSourceLocation(location);

    // Pre-fill Target Fields with CURRENT location values
    // This allows user to easily "edit" by changing just one field
    // First, resolve IDs
    const storeId = location.storeId || stores.find(s => s.name === location.store)?.id || "";
    const rackId = location.rackId || "";
    const shelfId = location.shelfId || "";

    setEditStoreId(storeId);
    setEditQuantity(location.quantity.toString());

    // IMPORTANT: We must fetch racks and shelves for the selected store/rack
    // because the dropdowns rely on 'racks' and 'shelves' state which might be empty or for a different store
    if (storeId) {
      await fetchRacks(storeId);
      // If we have a rack, set it and fetch shelves
      // Note: fetchRacks is async, but state update might be batched. 
      // Ideally we should wait or chain, but since fetchRacks sets state, we can just call it.
      // However, to be safe, we set the ID. 
      // Check if rackId is valid in the fetched list? 
      // We can just set it. If it's not in the list (yet), select value might be hidden until list loads.
      setEditRackId(rackId || "none");

      if (rackId && rackId !== "none") {
        await fetchShelves(rackId);
        setEditShelfId(shelfId || "none");
      } else {
        setEditShelfId("none");
        setShelves([]);
      }
    } else {
      setEditRackId("none");
      setEditShelfId("none");
      setRacks([]);
      setShelves([]);
    }

    toast.info(`Editing location: ${location.store}`);
  };

  const handleUpdate = async () => {
    if (!editingItem) return;
    if (!editQuantity || parseFloat(editQuantity) <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    try {
      setIsUpdating(true);
      const qty = parseInt(editQuantity);

      // Validation: Cannot assign/transfer more than available
      const available = editMode === "assign" ? unallocatedDerived : (editSourceLocation?.quantity || 0);
      if (qty > available) {
        toast.error(`Cannot ${editMode === "assign" ? "assign" : "transfer"} more than available quantity (${available})`);
        setIsUpdating(false);
        return;
      }

      if (editMode === "assign") {
        // ASSIGN UNALLOCATED STOCK (Original Logic)
        if (editStoreId) {
          await apiClient.updateStockLocation({
            part_id: editingItem.part_id,
            type: "in",
            quantity: qty,
            store_id: editStoreId,
            rack_id: (!editRackId || editRackId === "none") ? null : editRackId,
            shelf_id: (!editShelfId || editShelfId === "none") ? null : editShelfId,
          });
          toast.success("Stock assigned to location successfully");
        } else {
          toast.error("Please select a target store");
          setIsUpdating(false);
          return;
        }
      } else if (editMode === "transfer" && editSourceLocation) {
        // TRANSFER STOCK (New Logic)
        if (!editStoreId) {
          toast.error("Please select a target store");
          setIsUpdating(false);
          return;
        }

        // Construct Source Object from location data
        // Construct Source Object from location data
        // Prioritize explicit IDs if available (even if null)
        const sourceData = {
          store_id: editSourceLocation.storeId !== undefined ? editSourceLocation.storeId : (stores.find(s => s.name === editSourceLocation.store)?.id || null),
          rack_id: editSourceLocation.rackId !== undefined ? editSourceLocation.rackId : (racks.find(r => r.codeNo === editSourceLocation.rack)?.id || null),
          shelf_id: editSourceLocation.shelfId !== undefined ? editSourceLocation.shelfId : (shelves.find(s => s.shelfNo === editSourceLocation.shelf)?.id || null),
        };

        // Handle "Unallocated" source row special case
        if (editSourceLocation.isUnlocated) {
          // If implicit unallocated, explicitly set ids to null if they are missing
          if (editSourceLocation.store === "Unallocated") sourceData.store_id = null;
        }

        await apiClient.transferStockLocation({
          part_id: editingItem.part_id,
          quantity: qty,
          source: sourceData,
          target: {
            store_id: editStoreId,
            rack_id: (!editRackId || editRackId === "none") ? null : editRackId,
            shelf_id: (!editShelfId || editShelfId === "none") ? null : editShelfId,
          }
        });
        toast.success("Stock transferred successfully");

        // Return to assign mode or close? Let's stay in dialog but refresh
        setEditMode("assign");
        setEditSourceLocation(null);
      }

      // Refresh data
      // fetchStockData(); // Main table

      // Refresh Dialog Data
      const response = await apiClient.getPartLocations(editingItem.part_id);
      let data = (response as any).data;
      if (!Array.isArray(data)) { data = Array.isArray(response) ? response : []; }
      const { displayRows, netUnallocated } = processLocationData(data);
      setSelectedPartLocations(displayRows);
      setUnallocatedDerived(netUnallocated);

      // Reset form fields
      setEditQuantity("");
      setEditStoreId("");
      setEditRackId("none");
      setEditShelfId("none");

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to update location");
    } finally {
      setIsUpdating(false);
    }
  };

  // Logic for Bulk Entry (copied from StockInOut)
  const handleAddBulkRow = () => {
    setBulkRows(prev => [...prev, {
      partId: "", type: "in", quantity: "", storeId: "", rackId: "", shelfId: "", notes: "",
      currentStock: 0, unassignedStock: 0, availableRacks: [], availableShelves: []
    }]);
  };

  const handleRemoveBulkRow = (index: number) => {
    if (bulkRows.length > 1) setBulkRows(prev => prev.filter((_, i) => i !== index));
  };

  const fetchLatestLocation = async (partId: string, rowIndex: number) => {
    if (!partId) return;
    try {
      const balanceRes: any = await apiClient.getStockBalance(partId);
      const balanceData = balanceRes?.data || balanceRes;
      const currentStock = balanceData?.current_stock ?? 0;
      const unassignedStock = balanceData?.unassigned_stock ?? 0;

      // Also get latest movement for default location
      const movementsRes: any = await apiClient.getStockMovements({ part_id: partId, limit: 1 });
      const movement = (movementsRes.data && Array.isArray(movementsRes.data)) ? movementsRes.data[0] : null;

      let storeId = "";
      let rackId = "";
      let shelfId = "";
      let racksForStore = [];
      let shelvesForRack = [];

      if (movement) {
        storeId = movement.store_id || "";
        rackId = movement.rack_id || "";
        shelfId = movement.shelf_id || "";
        if (storeId) {
          const r = await apiClient.getRacks(storeId);
          racksForStore = (r as any).data || r || [];
        }
        if (rackId) {
          const s = await apiClient.getShelves(rackId);
          shelvesForRack = (s as any).data || s || [];
        }
      }

      setBulkRows(prev => {
        const updated = [...prev];
        if (updated[rowIndex]) {
          updated[rowIndex] = {
            ...updated[rowIndex],
            storeId, rackId, shelfId, currentStock, unassignedStock,
            availableRacks: racksForStore, availableShelves: shelvesForRack
          };
        }
        return updated;
      });
    } catch (error) { }
  };

  const handleUpdateBulkRow = async (index: number, field: string, value: any) => {
    if (field === "partId" && value) fetchLatestLocation(value, index);

    if (field === "storeId" && value) {
      const r = await apiClient.getRacks(value);
      const newRacks = (r as any).data || r || [];
      setBulkRows(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], storeId: value, rackId: "", shelfId: "", availableRacks: newRacks, availableShelves: [] };
        return updated;
      });
      return;
    }

    if (field === "rackId" && value) {
      const s = await apiClient.getShelves(value);
      const newShelves = (s as any).data || s || [];
      setBulkRows(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], rackId: value, shelfId: "", availableShelves: newShelves };
        return updated;
      });
      return;
    }

    setBulkRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveBulk = async () => {
    const validRows = bulkRows.filter(r => r.partId && r.quantity && !isNaN(parseFloat(r.quantity)));
    if (validRows.length === 0) { toast.error("Please add valid data"); return; }

    try {
      setLoading(true);
      for (const row of validRows) {
        // Validation: Cannot move OUT more than current stock
        if (row.type === "out") {
          const qty = parseInt(row.quantity);
          if (qty > row.currentStock) {
            const partLabel = parts.find(p => p.value === row.partId)?.label || "Item";
            toast.error(`Cannot remove ${qty} units of ${partLabel}. Only ${row.currentStock} units in total stock.`);
            setLoading(false);
            return;
          }
        }
        await apiClient.createStockMovement({
          part_id: row.partId, type: row.type, quantity: parseInt(row.quantity),
          store_id: row.storeId || null, rack_id: row.rackId === "none" ? null : row.rackId || null,
          shelf_id: row.shelfId === "none" ? null : row.shelfId || null, notes: row.notes || null,
        });
      }
      toast.success("Stock updated successfully");
      setBulkDialogOpen(false);
      setBulkRows([{ partId: "", type: "in", quantity: "", storeId: "", rackId: "", shelfId: "", notes: "", currentStock: 0, unassignedStock: 0, availableRacks: [], availableShelves: [] }]);
      fetchStockData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save some items");
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'z' || e.key === 'Z') && bulkDialogOpen) { e.preventDefault(); handleAddBulkRow(); }
      if (e.altKey && (e.key === 's' || e.key === 'S') && bulkDialogOpen && !loading) { e.preventDefault(); handleSaveBulk(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkDialogOpen, loading, bulkRows]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    return `Rs ${value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    return value.toLocaleString('en-PK');
  };

  const handleExport = () => {
    // Create CSV content
    const headers = [
      "Part No",
      "Master Part No",
      "Brand",
      "Category",
      "Description",
      "Store",
      "Rack",
      "Shelf",
      "Stock"
    ];

    const csvRows = [
      headers.join(","),
      ...stockData.map(item => [
        `"${item.part_no || ''}"`,
        `"${item.master_part_no || ''}"`,
        `"${item.brand || ''}"`,
        `"${item.category || ''}"`,
        `"${item.description || ''}"`,
        `"${item.store || ''}"`,
        `"${item.rack || ''}"`,
        `"${item.shelf || ''}"`,
        item.current_stock || 0,
      ].join(","))
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `current-stock-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("Stock data exported as CSV");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Current Stock</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Temporarily hidden as per request
          <Button
            onClick={() => setBulkDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Bulk Stock Update
          </Button>
          */}
          <Button
            onClick={handleExport}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" />
            Filters
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by part no, description, or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat === "all" ? "All Categories" : cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={stockStatusFilter}
            onValueChange={(v) => { setStockStatusFilter(v as StockStatusFilter); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Stock status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stock</SelectItem>
              <SelectItem value="in_stock">In stock only</SelectItem>
              <SelectItem value="out_of_stock">Out of stock</SelectItem>
              <SelectItem value="low_stock">Low stock</SelectItem>
            </SelectContent>
          </Select>



          {(searchQuery || selectedCategory !== "all" || stockStatusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
                setStockStatusFilter("all");
                setCurrentPage(1);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Part No</TableHead>
                <TableHead className="w-[120px]">Master Part No</TableHead>
                <TableHead className="w-[100px]">Brand</TableHead>
                <TableHead className="w-[150px]">Category</TableHead>
                <TableHead className="w-[200px]">Description</TableHead>
                <TableHead className="w-[100px]">Store</TableHead>
                <TableHead className="w-[100px]">Rack</TableHead>
                <TableHead className="w-[100px]">Shelf</TableHead>
                <TableHead className="w-[100px] text-right">Stock</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <span className="ml-2">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : stockData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No stock data found
                  </TableCell>
                </TableRow>
              ) : (
                stockData.map((item) => (
                  <TableRow key={item.part_id}>
                    <TableCell className="font-medium">{item.part_no || "-"}</TableCell>
                    <TableCell>{item.master_part_no || "-"}</TableCell>
                    <TableCell>{item.brand || "-"}</TableCell>
                    <TableCell>{item.category || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {item.description || "-"}
                    </TableCell>
                    <TableCell>{item.store || "-"}</TableCell>
                    <TableCell>{item.rack || "-"}</TableCell>
                    <TableCell>{item.shelf || "-"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNumber(item.current_stock)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => handleViewLocations(item)}
                          title="View Location Breakdown"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => handleEditClick(item)}
                          title="Quick Edit Location"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* View Location Dialog */}
      <Dialog open={viewLocationDialogOpen} onOpenChange={setViewLocationDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Stock Location Breakdown</DialogTitle>
            <DialogDescription>
              Detailed location of {viewingItem?.part_no} - {viewingItem?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Rack</TableHead>
                  <TableHead>Shelf</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPartLocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      {viewingItem ? "Loading or No specific location data..." : "No data"}
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedPartLocations.map((loc, index) => (
                    <TableRow key={index} className={loc.isUnlocated ? "bg-orange-50/50" : ""}>
                      <TableCell className="font-medium">{loc.store}</TableCell>
                      <TableCell>{loc.rack}</TableCell>
                      <TableCell>{loc.shelf}</TableCell>
                      <TableCell className="text-right font-bold">
                        {loc.quantity} {loc.isUnlocated && <span className="text-xs text-orange-600 font-normal ml-1">(Unlocated)</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {/* Total Row */}
                {selectedPartLocations.length > 0 && (
                  <TableRow className="bg-muted font-bold">
                    <TableCell colSpan={3} className="text-right">Total Checked:</TableCell>
                    <TableCell className="text-right">
                      {selectedPartLocations.reduce((sum, loc) => sum + loc.quantity, 0)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button onClick={() => setViewLocationDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Assign Location Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Manage Stock Locations</DialogTitle>
            <DialogDescription>
              Assign locations for {editingItem?.part_no} - {editingItem?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">

            {/* Current Allocations List */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center justify-between">
                <span>Current Stock Distribution</span>
                <Badge variant={unallocatedDerived > 0 ? "destructive" : "secondary"}>
                  Unallocated: {unallocatedDerived}
                </Badge>
              </h4>
              <div className="border rounded-md max-h-[150px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-secondary/90 z-10">
                    <TableRow className="h-8">
                      <TableHead className="h-8 text-xs">Store</TableHead>
                      <TableHead className="h-8 text-xs">Rack</TableHead>
                      <TableHead className="h-8 text-xs">Shelf</TableHead>
                      <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPartLocations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs py-2 text-muted-foreground">
                          No active locations found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedPartLocations.map((loc, i) => (
                        <TableRow key={i} className="h-8">
                          <TableCell className="py-1 text-xs">{loc.store}</TableCell>
                          <TableCell className="py-1 text-xs">{loc.rack}</TableCell>
                          <TableCell className="py-1 text-xs">{loc.shelf}</TableCell>
                          <TableCell className="py-1 text-xs text-right font-medium">
                            {loc.quantity} {loc.isUnlocated && "(Un)"}
                          </TableCell>
                          <TableCell className="py-1 text-xs text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleTransferClick(loc)}
                              title="Transfer Stock"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              {editMode === 'transfer' && (
                <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <Edit className="w-4 h-4" />
                  Transfer Stock Location
                </h4>
              )}

              {editMode === 'transfer' && editSourceLocation && (
                <div className="bg-muted/50 p-2 rounded text-xs mb-2 border flex justify-between items-center">
                  <span>
                    Transferring from: <strong>{editSourceLocation.store}</strong>
                    {editSourceLocation.rack !== 'No Rack' && ` / ${editSourceLocation.rack}`}
                    {editSourceLocation.shelf !== 'No Shelf' && ` / ${editSourceLocation.shelf}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditMode("assign");
                      setEditSourceLocation(null);
                      setEditQuantity(unallocatedDerived > 0 ? unallocatedDerived.toString() : "");
                      setEditStoreId("");
                    }}
                    className="h-5 text-[10px]"
                  >
                    Cancel Transfer
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{editMode === 'transfer' ? 'To Store' : 'Store'}</Label>
                  <Select value={editStoreId} onValueChange={setEditStoreId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Store" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity to {editMode === 'transfer' ? 'Transfer' : 'Assign'}</Label>
                  <Input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    placeholder={editMode === 'assign' ? `Max: ${unallocatedDerived}` : `Max: ${editSourceLocation?.quantity || 0}`}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Available: {editMode === 'assign' ? unallocatedDerived : (editSourceLocation?.quantity || 0)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{editMode === 'transfer' ? 'To Rack' : 'Rack'}</Label>
                  <Select
                    value={editRackId}
                    onValueChange={setEditRackId}
                    disabled={!editStoreId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Rack" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {racks.map((rack) => (
                        <SelectItem key={rack.id} value={rack.id}>
                          {rack.codeNo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{editMode === 'transfer' ? 'To Shelf' : 'Shelf'}</Label>
                  <Select
                    value={editShelfId}
                    onValueChange={setEditShelfId}
                    disabled={!editRackId || editRackId === "none"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Shelf" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {shelves.map((shelf) => (
                        <SelectItem key={shelf.id} value={shelf.id}>
                          {shelf.shelfNo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isUpdating || !editStoreId || !editQuantity}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editMode === 'assign' ? 'Confirm Assignment' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Stock Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Stock Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Add multiple stock movements at once. Current locations are auto-filled.</p>
              <Button type="button" variant="outline" size="sm" onClick={handleAddBulkRow} className="h-8 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Row (Alt + Z)
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted font-bold">
                    <TableHead className="w-[300px] text-xs">Item *</TableHead>
                    <TableHead className="w-[120px] text-xs text-center">Stock (Tot / Un)</TableHead>
                    <TableHead className="w-[100px] text-xs">Type *</TableHead>
                    <TableHead className="w-[100px] text-xs">Qty *</TableHead>
                    <TableHead className="w-[180px] text-xs">Store</TableHead>
                    <TableHead className="w-[150px] text-xs">Rack</TableHead>
                    <TableHead className="w-[150px] text-xs">Shelf</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkRows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <SearchableSelect
                          options={parts}
                          value={row.partId}
                          onValueChange={(val) => handleUpdateBulkRow(index, "partId", val)}
                          placeholder="Select Part..."
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-center">
                          <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-full text-center" title="Total Stock">
                            Tot: {row.currentStock}
                          </div>
                          <div className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-full text-center" title="Unassigned Stock (No Rack/Shelf)">
                            Un: {row.unassignedStock}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={row.type} onValueChange={(val) => handleUpdateBulkRow(index, "type", val as "in" | "out")}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in">In</SelectItem>
                            <SelectItem value="out">Out</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.quantity}
                          onChange={(e) => handleUpdateBulkRow(index, "quantity", e.target.value)}
                          className="h-9 text-xs"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={row.storeId} onValueChange={(val) => handleUpdateBulkRow(index, "storeId", val)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Store" />
                          </SelectTrigger>
                          <SelectContent>
                            {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={row.rackId} onValueChange={(val) => handleUpdateBulkRow(index, "rackId", val)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Rack" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {row.availableRacks.map(r => <SelectItem key={r.id} value={r.id}>{r.codeNo}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={row.shelfId} onValueChange={(val) => handleUpdateBulkRow(index, "shelfId", val)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Shelf" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {row.availableShelves.map(s => <SelectItem key={s.id} value={s.id}>{s.shelfNo}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.notes}
                          onChange={(e) => handleUpdateBulkRow(index, "notes", e.target.value)}
                          className="h-9 text-xs"
                          placeholder="Ref/Note"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveBulkRow(index)}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          disabled={bulkRows.length <= 1}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSaveBulk}
              disabled={loading}
            >
              {loading ? "Saving..." : "Add Stock (Alt + S)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 mb-8">
        <div className="text-sm text-muted-foreground order-2 sm:order-1">
          Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
          {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} items
        </div>

        <div className="flex items-center gap-2 order-1 sm:order-2">
          <Select value={String(itemsPerPage)} onValueChange={(v) => {
            setItemsPerPage(Number(v));
            setCurrentPage(1);
          }}>
            <SelectTrigger className="w-[130px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
              <SelectItem value="100">100 per page</SelectItem>
              <SelectItem value="200">200 per page</SelectItem>
              <SelectItem value="500">500 per page</SelectItem>
              <SelectItem value="1000">1000 per page</SelectItem>
              <SelectItem value="2000">2000 per page</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <div className="text-sm font-medium px-2 min-w-[80px] text-center">
              Page {currentPage} of {Math.max(1, totalPages)}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
