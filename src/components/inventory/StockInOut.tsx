import { useState, useEffect } from "react";
import {
  Search,
  Calendar,
  FileText,
  FileSpreadsheet,
  Package,
  Edit,
  Plus,
  X,
  Trash,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { BrandOriginCell } from "@/components/ui/brand-origin-cell";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api";
import { formatUiDate } from "@/utils/dateUtils";
import { toast } from "sonner";

interface StockItem {
  id: string;
  srNo: number;
  oemPartNo: string;
  name: string;
  brand: string;
  origin?: string;
  model: string;
  uom: string;
  qty: number;
  type: "in" | "out";
  transaction: string;
  store: string;
  rack: string;
  shelf: string;
  date?: string;
  reserved?: number;
  partId: string;
  totalQty?: number; // Total quantity for this part
  availableQty?: number; // Available quantity (Total - Reserve)
  storeId?: string;
  rackId?: string;
  shelfId?: string;
}

export const StockInOut = () => {
  const [items, setItems] = useState<StockItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [item, setItem] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [loading, setLoading] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [categories, setCategories] = useState<
    { value: string; label: string }[]
  >([]);
  const [subCategories, setSubCategories] = useState<
    { value: string; label: string }[]
  >([]);
  const [parts, setParts] = useState<{ value: string; label: string }[]>([]);

  // Edit Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [editStoreId, setEditStoreId] = useState("");
  const [editRackId, setEditRackId] = useState("");
  const [editShelfId, setEditShelfId] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
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

  // Fetch initial data for dialogs
  useEffect(() => {
    if (editDialogOpen || bulkDialogOpen) {
      fetchStores();
    }
  }, [editDialogOpen, bulkDialogOpen]);

  // Fetch racks when store changes
  useEffect(() => {
    if (editStoreId) {
      fetchRacks(editStoreId);
      // Only reset rack/shelf if the user manually changes the store (different from original)
      if (editDialogOpen && editingItem && editingItem.storeId !== editStoreId) {
        setEditRackId("none");
        setEditShelfId("none");
      }
    } else {
      setRacks([]);
      if (editDialogOpen) {
        setEditRackId("none");
        setEditShelfId("none");
      }
    }
  }, [editStoreId, editDialogOpen, editingItem]);

  // Fetch shelves when rack changes
  useEffect(() => {
    if (editRackId && editRackId !== "none") {
      fetchShelves(editRackId);
      // Reset shelf if the user manually changes the rack (different from original)
      if (editDialogOpen && editingItem && editingItem.rackId !== editRackId) {
        setEditShelfId("none");
      }
    } else {
      setShelves([]);
      if (editDialogOpen && editingItem && editingItem.rackId !== editRackId) {
        setEditShelfId("none");
      }
    }
  }, [editRackId, editDialogOpen, editingItem]);

  const fetchStores = async () => {
    try {
      const response = await apiClient.getStores();
      setStores((response as any).data || response || []);
    } catch (error) {
      toast.error("Failed to fetch stores");
    }
  };

  const fetchRacks = async (storeId: string) => {
    try {
      const response = await apiClient.getRacks(storeId);
      setRacks((response as any).data || response || []);
    } catch (error) {
      toast.error("Failed to fetch racks");
    }
  };

  const fetchShelves = async (rackId: string) => {
    try {
      const response = await apiClient.getShelves(rackId);
      setShelves((response as any).data || response || []);
    } catch (error) {
      toast.error("Failed to fetch shelves");
    }
  };

  const handleEditClick = (item: StockItem) => {
    setEditingItem(item);
    setEditStoreId(item.storeId || "");
    setEditRackId(item.rackId || "none");
    setEditShelfId(item.shelfId || "none");
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingItem) return;

    try {
      setIsUpdating(true);
      await apiClient.updateStockMovement(editingItem.id, {
        store_id: editStoreId || null,
        rack_id: editRackId === "none" ? null : editRackId || null,
        shelf_id: editShelfId === "none" ? null : editShelfId || null,
      });
      toast.success("Stock movement updated successfully");
      setEditDialogOpen(false);
      fetchStockMovements(); // Refresh the list
    } catch (error: any) {
      toast.error(error.message || "Failed to update stock movement");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddBulkRow = () => {
    setBulkRows(prev => [...prev, {
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
  };

  const handleRemoveBulkRow = (index: number) => {
    if (bulkRows.length > 1) {
      setBulkRows(prev => prev.filter((_, i) => i !== index));
    }
  };

  const fetchLatestLocation = async (partId: string, rowIndex: number) => {
    if (!partId) return;

    try {
      // Get latest movement for location
      const movementsRes: any = await apiClient.getStockMovements({
        part_id: partId,
        limit: 1
      });

      // Get current stock balance - Try both endpoints just in case
      let currentStock = 0;
      let unassignedStock = 0;

      try {
        const balanceRes: any = await apiClient.getStockBalance(partId);
        // Handle result at root or inside data property
        const balanceData = balanceRes?.data || balanceRes;
        currentStock = balanceData?.current_stock ?? balanceData?.currentStock ?? 0;
        unassignedStock = balanceData?.unassigned_stock ?? balanceData?.unassignedStock ?? 0;
      } catch (err) {
        console.error("Balance API failed", err);
      }

      const movement = (movementsRes.data && Array.isArray(movementsRes.data))
        ? movementsRes.data[0]
        : (Array.isArray(movementsRes) ? movementsRes[0] : null);

      // Try to get stock from movement API first as fallback
      if (movement) {
        if (movement.current_stock !== undefined) currentStock = movement.current_stock;
        if (movement.unassigned_stock !== undefined) unassignedStock = movement.unassigned_stock;
      }

      if (movement) {
        const storeId = movement.store_id || "";
        const rackId = movement.rack_id || "";
        const shelfId = movement.shelf_id || "";

        // Fetch racks for this store
        let racksForStore = [];
        if (storeId) {
          const racksRes = await apiClient.getRacks(storeId);
          racksForStore = (racksRes as any).data || racksRes || [];
        }

        // Fetch shelves for this rack
        let shelvesForRack = [];
        if (rackId) {
          const shelvesRes = await apiClient.getShelves(rackId);
          shelvesForRack = (shelvesRes as any).data || shelvesRes || [];
        }

        setBulkRows(prev => {
          const updated = [...prev];
          if (updated[rowIndex]) {
            updated[rowIndex] = {
              ...updated[rowIndex],
              storeId,
              rackId,
              shelfId,
              currentStock,
              unassignedStock,
              availableRacks: racksForStore,
              availableShelves: shelvesForRack
            };
          }
          return updated;
        });
      } else {
        // Just update stock if no movement history
        setBulkRows(prev => {
          const updated = [...prev];
          if (updated[rowIndex]) {
            updated[rowIndex] = {
              ...updated[rowIndex],
              currentStock,
              unassignedStock,
              storeId: "",
              rackId: "",
              shelfId: "",
              availableRacks: [],
              availableShelves: []
            };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error("Failed to fetch latest location or stock", error);
    }
  };

  const handleUpdateBulkRow = async (index: number, field: string, value: any) => {
    if (field === "partId" && value) {
      // Fetch latest location when part changes
      fetchLatestLocation(value, index);
    }

    if (field === "storeId") {
      // Fetch racks for new store
      if (value) {
        const racksRes = await apiClient.getRacks(value);
        const newRacks = (racksRes as any).data || racksRes || [];
        setBulkRows(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], storeId: value, rackId: "", shelfId: "", availableRacks: newRacks, availableShelves: [] };
          return updated;
        });
      } else {
        setBulkRows(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], storeId: "", rackId: "", shelfId: "", availableRacks: [], availableShelves: [] };
          return updated;
        });
      }
      return;
    }

    if (field === "rackId") {
      // Fetch shelves for new rack
      if (value) {
        const shelvesRes = await apiClient.getShelves(value);
        const newShelves = (shelvesRes as any).data || shelvesRes || [];
        setBulkRows(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], rackId: value, shelfId: "", availableShelves: newShelves };
          return updated;
        });
      } else {
        setBulkRows(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], rackId: "", shelfId: "", availableShelves: [] };
          return updated;
        });
      }
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

    if (validRows.length === 0) {
      toast.error("Please add at least one valid row (Item and Quantity required)");
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;

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
          part_id: row.partId,
          type: row.type,
          quantity: parseInt(row.quantity),
          store_id: row.storeId || null,
          rack_id: (row.rackId && row.rackId !== "none") ? row.rackId : null,
          shelf_id: (row.shelfId && row.shelfId !== "none") ? row.shelfId : null,
          notes: row.notes || null,
        });
        successCount++;
      }

      toast.success(`Successfully recorded ${successCount} stock movement${successCount !== 1 ? 's' : ''}`);
      setBulkRows([{
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
      setBulkDialogOpen(false);
      fetchStockMovements();
    } catch (error: any) {
      toast.error(error.message || "Failed to record some stock movements");
    } finally {
      setLoading(false);
    }
  };

  // Shortcut keys Alt + Z (Add Row) and Alt + S (Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
        if (bulkDialogOpen) {
          e.preventDefault();
          handleAddBulkRow();
        }
      }
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        if (bulkDialogOpen && !loading) {
          e.preventDefault();
          handleSaveBulk();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkDialogOpen, loading, bulkRows]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = items;

  // Fetch categories and parts on mount
  useEffect(() => {
    fetchCategories();
    fetchSubCategories();
    fetchParts();
    fetchStockMovements();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await apiClient.getCategories();
      const categoriesData = (response as any).data || response;
      if (Array.isArray(categoriesData)) {
        setCategories([
          { value: "", label: "All Categories" },
          ...categoriesData.map((cat: any) => ({
            value: cat.id,
            label: cat.name,
          })),
        ]);
      }
    } catch (error) { }
  };

  const fetchSubCategories = async () => {
    try {
      const response = await apiClient.getAllSubcategories();
      const subCategoriesData = (response as any).data || response;
      if (Array.isArray(subCategoriesData)) {
        setSubCategories([
          { value: "", label: "All Sub Categories" },
          ...subCategoriesData.map((subCat: any) => ({
            value: subCat.id,
            label: subCat.name,
          })),
        ]);
      }
    } catch (error) { }
  };

  const fetchParts = async () => {
    try {
      const response = await apiClient.getParts({ page: 1, limit: 1000 });
      const partsData = (response as any).data || response;
      if (Array.isArray(partsData)) {
        setParts(
          partsData.map((part: any) => {
            // Remove grade information from description (e.g., "(Grade: O)", "(Grade: B)")
            const cleanDescription = (part.description || "")
              .replace(/\(Grade:\s*[^)]+\)/gi, "")
              .trim();
            const applicationText =
              part.application_name ||
              part.application?.name ||
              part.application ||
              "";

            return {
              value: part.id,
              label: [part.master_part_no, part.part_no && part.part_no !== part.master_part_no ? part.part_no : null, cleanDescription, applicationText]
                .filter(Boolean)
                .join(" | "),
            };
          }),
        );
      }
    } catch (error) { }
  };

  const fetchStockMovements = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };

      if (item) {
        params.part_id = item;
      }

      if (fromDate) {
        params.from_date = fromDate;
      }

      if (toDate) {
        params.to_date = toDate;
      }

      const response: any = await apiClient.getStockMovements(params);

      // Handle both response formats: { data: [...], pagination: {...} } or direct array
      let movementsData: any[] = [];
      let paginationData: any = null;
      let reservedByPartMap: Record<string, number> = {};

      if (response && Array.isArray(response.data)) {
        movementsData = response.data;
        paginationData = response.pagination;
        reservedByPartMap = response.reservedByPart || {};
      } else if (Array.isArray(response)) {
        movementsData = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        movementsData = response.data;
        paginationData = response.pagination;
        reservedByPartMap = response.reservedByPart || {};
      }

      if (movementsData && Array.isArray(movementsData)) {
        const startIdx = (currentPage - 1) * itemsPerPage;
        // Filter out stock_reservation type - they don't affect stock in/out calculations
        const filteredMovements = movementsData.filter((movement: any) => {
          const referenceType = (movement.reference_type || "").toLowerCase();
          return referenceType !== "stock_reservation";
        });

        // Calculate stock balances per part (group by part_id)
        const partStockMap = new Map<string, number>();

        filteredMovements.forEach((movement: any) => {
          const partId = movement.part_id;
          if (!partId) return;

          if (!partStockMap.has(partId)) {
            partStockMap.set(partId, 0);
          }

          if (movement.type === "in") {
            partStockMap.set(
              partId,
              (partStockMap.get(partId) || 0) + (movement.quantity || 0),
            );
          } else if (movement.type === "out") {
            partStockMap.set(
              partId,
              (partStockMap.get(partId) || 0) - (movement.quantity || 0),
            );
          }
        });

        // Final pass: format items
        const formattedItems: StockItem[] = filteredMovements.map(
          (movement: any, index: number) => {
            let transaction = "";
            const referenceType = (movement.reference_type || "").toLowerCase();
            const type = movement.type === "in" ? "in" : "out";
            const isReserved = movement.is_reserved || false;
            const partId = movement.part_id;

            // Get values
            const reservedQty =
              reservedByPartMap[partId] || movement.reserved_quantity || 0;
            const apiCurrentStock =
              movement.current_stock ?? movement.currentStock ?? movement.stock;
            const currentStock =
              apiCurrentStock !== undefined && apiCurrentStock !== null
                ? apiCurrentStock
                : partStockMap.get(partId) || 0;

            const availableQty =
              movement.available_quantity ?? currentStock - reservedQty;
            const actualQty = isReserved ? 0 : movement.quantity || 0;

            if (
              referenceType.includes("dpo") ||
              referenceType.includes("direct_purchase") ||
              referenceType.includes("direct purchase")
            ) {
              transaction = isReserved
                ? "Reserved for DPO"
                : type === "in"
                  ? "Stock In by DPO"
                  : "Stock Out by DPO Return";
            } else if (
              referenceType.includes("invoice") ||
              referenceType.includes("sale")
            ) {
              transaction = isReserved
                ? "Reserved for Invoice"
                : type === "in"
                  ? "Stock In by Sales Return"
                  : "Stock Out by Invoice";
            } else if (referenceType.includes("adjustment")) {
              transaction =
                type === "in"
                  ? "Stock In by Adjustment"
                  : "Stock Out by Adjustment";
            } else if (referenceType.includes("transfer")) {
              transaction =
                type === "in"
                  ? "Stock In by Transfer"
                  : "Stock Out by Transfer";
            } else if (
              referenceType.includes("purchase_order") ||
              referenceType.includes("purchase order")
            ) {
              transaction = isReserved
                ? "Reserved for Purchase Order"
                : type === "in"
                  ? "Stock In by Purchase Order"
                  : "Stock Out by PO Return";
            } else {
              transaction = type === "in" ? "Stock In" : "Stock Out";
            }

            return {
              id: movement.id,
              partId: movement.part_id, // Store partId for summary row usage
              srNo: startIdx + index + 1,
              oemPartNo: movement.part_no || "",
              name: movement.part_description || "",
              brand: movement.brand || "",
              origin: movement.origin || "",
              model: "",
              uom: "pcs",
              qty: actualQty,
              type: type,
              transaction: transaction,
              store: movement.store_name || movement.store || "",
              rack: movement.rack_code || movement.rack || "",
              shelf: movement.shelf_no || movement.shelf || "",
              date: movement.created_at || movement.date || "",
              reserved: reservedQty,
              totalQty: currentStock,
              availableQty: availableQty,
              storeId: movement.store_id,
              rackId: movement.rack_id,
              shelfId: movement.shelf_id,
            };
          },
        );

        setItems(formattedItems);
        const allMovements = movementsData || [];
        const totalMovements = paginationData?.total || allMovements.length;
        const stockReservationCount = allMovements.filter(
          (m: any) =>
            (m.reference_type || "").toLowerCase() === "stock_reservation",
        ).length;
        setTotalItems(totalMovements - stockReservationCount);
      } else {
        setItems([]);
        setTotalItems(0);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch stock movements");
    } finally {
      setLoading(false);
    }
  };

  // Refetch when pagination changes (skip initial render to avoid double fetch)
  useEffect(() => {
    const hasInitialized = items.length > 0;
    if (hasInitialized) {
      fetchStockMovements();
    }
  }, [currentPage, itemsPerPage]);

  const handleSearch = () => {
    setCurrentPage(1);
    // Reset to page 1 and fetch with current filters
    fetchStockMovements();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(currentItems.map((item) => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, id]);
    } else {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    }
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Fetch all movements for report (without pagination)
  const fetchAllMovements = async () => {
    try {
      const params: any = {
        page: 1,
        limit: 10000, // Large limit to get all records
      };

      if (item) {
        params.part_id = item;
      }

      if (fromDate) {
        params.from_date = fromDate;
      }

      if (toDate) {
        params.to_date = toDate;
      }

      const response: any = await apiClient.getStockMovements(params);
      const movementsData = (response as any).data || response;

      if (movementsData && Array.isArray(movementsData.data)) {
        return movementsData.data.map((movement: any) => {
          const isReserved = movement.is_reserved || false;
          const hasReference = movement.reference_id && movement.reference_type;
          const reservedQty =
            hasReference && isReserved ? movement.reserved_quantity || 0 : 0;
          const actualQty = isReserved ? 0 : movement.quantity || 0;

          return {
            id: movement.id,
            srNo: 0, // Will be set when generating report
            oemPartNo: movement.part_no || "",
            name: movement.part_description || "",
            brand: movement.brand || "",
            origin: movement.origin || "",
            model: "",
            uom: "pcs",
            qty: actualQty,
            type: movement.type === "in" ? "in" : "out",
            store: movement.store_name || movement.store || "",
            rack: movement.rack_code || movement.rack || "",
            shelf: movement.shelf_no || movement.shelf || "",
            date: movement.created_at || movement.date || "",
            reserved: reservedQty,
          };
        });
      } else if (Array.isArray(movementsData)) {
        return movementsData.map((movement: any) => {
          const isReserved = movement.is_reserved || false;
          const hasReference = movement.reference_id && movement.reference_type;
          const reservedQty =
            hasReference && isReserved ? movement.reserved_quantity || 0 : 0;
          const actualQty = isReserved ? 0 : movement.quantity || 0;

          return {
            id: movement.id,
            srNo: 0,
            oemPartNo: movement.part_no || "",
            name: movement.part_description || "",
            brand: movement.brand || "",
            origin: movement.origin || "",
            model: "",
            uom: "pcs",
            qty: actualQty,
            type: movement.type === "in" ? "in" : "out",
            store: movement.store_name || movement.store || "",
            rack: movement.rack_code || movement.rack || "",
            shelf: movement.shelf_no || movement.shelf || "",
            date: movement.created_at || movement.date || "",
            reserved: reservedQty,
          };
        });
      }
      return [];
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch movements for report");
      return [];
    }
  };

  const handlePrintReport = async () => {
    try {
      toast.loading("Generating report...");
      const allMovements = await fetchAllMovements();

      if (allMovements.length === 0) {
        toast.dismiss();
        toast.error("No data available to generate report");
        return;
      }

      // Format date for display
      const formatDate = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return dateStr;
        const time = date.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${formatUiDate(date)} ${time}`;
      };

      // Create print window
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.dismiss();
        toast.error("Please allow popups to generate report");
        return;
      }

      const filterInfo = [];
      if (fromDate)
        filterInfo.push(`From: ${formatUiDate(fromDate) || fromDate}`);
      if (toDate)
        filterInfo.push(`To: ${formatUiDate(toDate) || toDate}`);
      if (item) {
        const selectedPart = parts.find((p) => p.value === item);
        if (selectedPart) filterInfo.push(`Part: ${selectedPart.label}`);
      }

      const totalIn = allMovements
        .filter((m) => m.type === "in")
        .reduce((sum, m) => sum + m.qty, 0);
      const totalOut = allMovements
        .filter((m) => m.type === "out")
        .reduce((sum, m) => sum + m.qty, 0);

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Stock Movement Report</title>
          <style>
            @media print {
              @page { margin: 1cm; }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              color: #333;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #333;
              padding-bottom: 15px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              color: #1a1a1a;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .filters {
              margin-bottom: 20px;
              padding: 10px;
              background: #f5f5f5;
              border-radius: 5px;
            }
            .filters p {
              margin: 5px 0;
              font-size: 14px;
            }
            .summary {
              display: flex;
              justify-content: space-around;
              margin-bottom: 20px;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 5px;
            }
            .summary-item {
              text-align: center;
            }
            .summary-item strong {
              display: block;
              font-size: 18px;
              color: #1a1a1a;
            }
            .summary-item span {
              font-size: 14px;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              background: #1a1a1a;
              color: white;
              padding: 12px;
              text-align: left;
              font-weight: bold;
              border: 1px solid #333;
            }
            td {
              padding: 10px;
              border: 1px solid #ddd;
            }
            tr:nth-child(even) {
              background: #f9f9f9;
            }
            .type-in {
              color: #059669;
              font-weight: bold;
            }
            .type-out {
              color: #dc2626;
              font-weight: bold;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Stock Movement Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
          
          ${filterInfo.length > 0
          ? `
          <div class="filters">
            <p><strong>Filters Applied:</strong></p>
            ${filterInfo.map((f) => `<p>${f}</p>`).join("")}
          </div>
          `
          : ""
        }
          
          <div class="summary">
            <div class="summary-item">
              <strong>${allMovements.length}</strong>
              <span>Total Records</span>
            </div>
            <div class="summary-item">
              <strong class="type-in">${totalIn}</strong>
              <span>Total Stock In</span>
            </div>
            <div class="summary-item">
              <strong class="type-out">${totalOut}</strong>
              <span>Total Stock Out</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>SR</th>
                <th>Part No</th>
                <th>Description</th>
                <th>Brand</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Store</th>
                <th>Rack</th>
                <th>Shelf</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${allMovements
          .map(
            (movement, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${movement.oemPartNo}</td>
                  <td>${movement.name}</td>
                  <td>${movement.brand}</td>
                  <td class="type-${movement.type}">${movement.type.toUpperCase()}</td>
                  <td>${movement.qty}</td>
                  <td>${movement.store || "-"}</td>
                  <td>${movement.rack || "-"}</td>
                  <td>${movement.shelf || "-"}</td>
                  <td>${formatDate(movement.date || "")}</td>
                </tr>
              `,
          )
          .join("")}
            </tbody>
          </table>
          
          <div class="footer">
            <p>This report was generated from the Inventory ERP System</p>
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      toast.dismiss();
      toast.success("Report generated successfully");

      setTimeout(() => {
        printWindow.print();
      }, 250);
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handlePrintExcel = async () => {
    try {
      toast.loading("Generating Excel file...");
      const allMovements = await fetchAllMovements();

      if (allMovements.length === 0) {
        toast.dismiss();
        toast.error("No data available to export");
        return;
      }

      // Format date for CSV
      const formatDate = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return dateStr;
        const time = date.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${formatUiDate(date)} ${time}`;
      };

      // CSV Headers
      const headers = [
        "SR No",
        "Part No",
        "Description",
        "Brand",
        "Type",
        "Quantity",
        "UOM",
        "Store",
        "Rack",
        "Shelf",
        "Date",
      ];

      // CSV Data rows
      const csvRows = [
        headers.join(","),
        ...allMovements.map((movement, index) =>
          [
            index + 1,
            `"${movement.oemPartNo}"`,
            `"${movement.name.replace(/"/g, '""')}"`,
            `"${movement.brand}"`,
            movement.type.toUpperCase(),
            movement.qty,
            movement.uom,
            `"${movement.store || ""}"`,
            `"${movement.rack || ""}"`,
            `"${movement.shelf || ""}"`,
            formatDate(movement.date || ""),
          ].join(","),
        ),
      ];

      // Create CSV content
      const csvContent = csvRows.join("\n");

      // Add BOM for Excel UTF-8 support
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Generate filename with date and filters
      const dateStr = new Date().toISOString().split("T")[0];
      let filename = `stock-in-out-report-${dateStr}`;
      if (fromDate || toDate) {
        filename += `-filtered`;
      }
      filename += ".csv";

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success("Excel file downloaded successfully");
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message || "Failed to generate Excel file");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Package className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Inventory Stock
          </h2>
          <p className="text-sm text-muted-foreground">
            View and manage stock in/out movements
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 space-y-4">
        {/* Filter Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Category
            </label>
            <SearchableSelect
              options={categories}
              value={category}
              onValueChange={setCategory}
              placeholder="Select..."
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Sub Category
            </label>
            <SearchableSelect
              options={subCategories}
              value={subCategory}
              onValueChange={setSubCategory}
              placeholder="Select..."
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Item</label>
            <SearchableSelect
              options={[{ value: "", label: "All Items" }, ...parts]}
              value={item}
              onValueChange={setItem}
              placeholder="Select..."
            />
          </div>
        </div>

        {/* Filter Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              From Date
            </label>
            <div className="relative">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 bg-background pr-10"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              To Date
            </label>
            <div className="relative">
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 bg-background pr-10"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSearch}
            disabled={loading}
          >
            <Search className="w-4 h-4" />
            {loading ? "Searching..." : "Search"}
          </Button>



          {/* <Button
            variant="outline"
            className="gap-2 border-primary text-primary hover:bg-primary/10 hover:text-primary"
            onClick={handlePrintReport}
            disabled={loading}
          >
            <FileText className="w-4 h-4" />
            Print Report
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-chart-green text-chart-green hover:bg-chart-green/10 hover:text-chart-green"
            onClick={handlePrintExcel}
            disabled={loading}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Print Excel
          </Button> */}
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-card border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <ListNumberHeader />
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    selectedItems.length === currentItems.length &&
                    currentItems.length > 0
                  }
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                OEM/ Part No
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Transaction
              </TableHead>

              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Brand
              </TableHead>

              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Uom
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap text-center">
                Qty
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap text-center">
                Reserve
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap text-center">
                Available
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Store
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Racks
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Shelf
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground whitespace-nowrap">
                Date
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={14}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading stock movements...
                </TableCell>
              </TableRow>
            ) : currentItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={14}
                  className="text-center py-8 text-muted-foreground"
                >
                  No stock movements found
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((stockItem, index) => (
                <TableRow
                  key={stockItem.id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    selectedItems.includes(stockItem.id) && "bg-primary/5",
                  )}
                >
                  <ListNumberCell
                    index={index}
                    page={currentPage}
                    pageSize={itemsPerPage}
                    total={totalItems}
                  />
                  <TableCell>
                    <Checkbox
                      checked={selectedItems.includes(stockItem.id)}
                      onCheckedChange={(checked) =>
                        handleSelectItem(stockItem.id, !!checked)
                      }
                    />
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
                    {stockItem.oemPartNo}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {stockItem.transaction}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    <BrandOriginCell brand={stockItem.brand} origin={stockItem.origin} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {stockItem.uom}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-sm font-semibold text-center",
                      stockItem.type === "in"
                        ? "text-green-600"
                        : "text-red-600",
                    )}
                  >
                    {stockItem.type === "in"
                      ? stockItem.qty
                      : `-${stockItem.qty}`}
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-center text-blue-600">
                    {stockItem.reserved ?? 0}
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-center text-green-600">
                    {stockItem.availableQty ?? stockItem.totalQty ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {stockItem.store}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stockItem.rack}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stockItem.shelf}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatUiDate(stockItem.date) || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
            {/* Summary Row */}
            {currentItems.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell
                  colSpan={10}
                  className="text-right text-sm font-semibold"
                >
                  Totals:
                </TableCell>
                <TableCell
                  className={cn(
                    "text-sm font-bold text-center",
                    (() => {
                      const totalIn = currentItems
                        .filter((item) => item.type === "in")
                        .reduce((sum, item) => sum + item.qty, 0);
                      const totalOut = currentItems
                        .filter((item) => item.type === "out")
                        .reduce((sum, item) => sum + item.qty, 0);
                      return totalIn - totalOut >= 0
                        ? "text-green-600"
                        : "text-red-600";
                    })(),
                  )}
                >
                  {(() => {
                    const totalIn = currentItems
                      .filter((item) => item.type === "in")
                      .reduce((sum, item) => sum + item.qty, 0);
                    const totalOut = currentItems
                      .filter((item) => item.type === "out")
                      .reduce((sum, item) => sum + item.qty, 0);
                    const net = totalIn - totalOut;
                    return net;
                  })()}
                </TableCell>
                <TableCell className="text-sm font-bold text-center text-blue-600">
                  {(() => {
                    const partReserveMap = new Map<string, number>();
                    currentItems.forEach(item => {
                      if (item.partId) {
                        partReserveMap.set(item.partId, item.reserved || 0);
                      }
                    });
                    return Array.from(partReserveMap.values()).reduce((sum, res) => sum + res, 0);
                  })()}
                </TableCell>
                <TableCell className="text-sm font-bold text-center text-green-600">
                  {(() => {
                    const partAvailableMap = new Map<string, number>();
                    currentItems.forEach(item => {
                      if (item.partId) {
                        partAvailableMap.set(item.partId, item.availableQty || 0);
                      }
                    });
                    return Array.from(partAvailableMap.values()).reduce((sum, avail) => sum + avail, 0);
                  })()}
                </TableCell>
                <TableCell colSpan={5} className="text-xs text-muted-foreground whitespace-nowrap">
                  <span className="text-green-600">In: {currentItems
                    .filter(item => item.type === "in")
                    .reduce((sum, item) => sum + item.qty, 0)}</span>
                  {' | '}
                  <span className="text-red-600">Out: {currentItems
                    .filter(item => item.type === "out")
                    .reduce((sum, item) => sum + item.qty, 0)}</span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border bg-muted/20">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {endIndex} of {totalItems} Records
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="h-8 px-3"
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 px-3"
            >
              Prev
            </Button>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-12 h-8 text-center text-sm"
                min={1}
                max={totalPages}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-8 px-3"
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 px-3"
            >
              Last
            </Button>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(v) => {
                setItemsPerPage(Number(v));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-16 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Item Location</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Part No</Label>
              <Input value={editingItem?.oemPartNo || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editingItem?.name || ""} disabled />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Store</Label>
                <Select value={editStoreId} onValueChange={setEditStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rack</Label>
                <Select value={editRackId || "none"} onValueChange={setEditRackId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Rack" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Rack</SelectItem>
                    {racks.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.codeNo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Shelf</Label>
                <Select value={editShelfId || "none"} onValueChange={setEditShelfId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Shelf" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Shelf</SelectItem>
                    {shelves.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.shelfNo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? "Updating..." : "Save Changes"}
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
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="w-[300px] text-xs">Item *</TableHead>
                    <TableHead className="w-[120px] text-xs">Stock (Tot / Un)</TableHead>
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
                          <div className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded w-full text-center" title="Unassigned Stock (No Rack/Shelf)">
                            Un: {row.unassignedStock}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={row.type} onValueChange={(val) => handleUpdateBulkRow(index, "type", val)}>
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
                          <Trash className="w-4 h-4" />
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
    </div>
  );
};
