import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Plus, Loader2, Package, Edit, Trash, RefreshCw, ChevronDown, ChevronRight, Archive, Layers, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Types
interface Rack {
  id: string;
  codeNo: string;
  store: string;
  storeId?: string;
  description: string;
  status: "Active" | "Inactive";
  shelfCount: number;
  itemsCount?: number;
  remainingQuantity?: number;
  items?: Array<{ partNo: string; description: string; quantity: number }>;
}

interface Shelf {
  id: string;
  shelfNo: string;
  rackId: string;
  rackCode: string;
  store: string;
  description: string;
  status: "Active" | "Inactive";
  itemsCount?: number;
  remainingQuantity?: number;
  items?: Array<{ partNo: string; description: string; quantity: number }>;
}

interface Store {
  id: string;
  name: string;
}

type FormMode = "list" | "create-rack" | "edit-rack" | "create-shelf" | "edit-shelf";

export const RackAndShelf = () => {
  // Data state
  const [racks, setRacks] = useState<Rack[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [rackStoreId, setRackStoreId] = useState("");
  const [stockData, setStockData] = useState<Record<string, {
    itemsCount: number;
    remainingQuantity: number;
    items: Array<{ partNo: string; description: string; quantity: number }>;
  }>>({});

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>("all");

  // Form mode
  const [formMode, setFormMode] = useState<FormMode>("list");
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);

  // Dialog states
  const [rackDialogOpen, setRackDialogOpen] = useState(false);
  const [shelfDialogOpen, setShelfDialogOpen] = useState(false);
  const [combinedDialogOpen, setCombinedDialogOpen] = useState(false);
  const [bulkShelfDialogOpen, setBulkShelfDialogOpen] = useState(false);

  // Combined form state (rack + shelves)
  const [combinedStoreId, setCombinedStoreId] = useState("");
  const [combinedRackName, setCombinedRackName] = useState("");
  const [combinedShelfNames, setCombinedShelfNames] = useState<string[]>([""]);

  // Bulk Shelf form state - each row has rack + shelf
  const [bulkShelfRows, setBulkShelfRows] = useState<Array<{ rackId: string; shelfName: string }>>([{ rackId: "", shelfName: "" }]);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});




  const [rackCodeNo, setRackCodeNo] = useState("");
  const [rackStore, setRackStore] = useState("");
  const [rackDescription, setRackDescription] = useState("");
  const [rackStatus, setRackStatus] = useState<"Active" | "Inactive">("Active");

  // Real-time validation for bulk shelf rows
  useEffect(() => {
    if (!bulkShelfDialogOpen) return;

    const newErrors: Record<number, string> = {};
    const formDuplicates = new Map<string, number[]>();

    bulkShelfRows.forEach((row, index) => {
      if (!row.rackId || !row.shelfName.trim()) return;

      const key = `${row.rackId}_${row.shelfName.trim().toLowerCase()}`;
      if (!formDuplicates.has(key)) {
        formDuplicates.set(key, []);
      }
      formDuplicates.get(key)?.push(index);
    });

    for (const [key, indices] of formDuplicates.entries()) {
      if (indices.length > 1) {
        indices.forEach(idx => {
          newErrors[idx] = "You have entered this shelf name before against this rack";
        });
      }
    }

    // Check against existing database shelves
    bulkShelfRows.forEach((row, index) => {
      if (newErrors[index]) return; // Skip if already has form-level error
      if (!row.rackId || !row.shelfName.trim()) return;

      const isDuplicateInDb = shelves.some(s =>
        s.rackId === row.rackId &&
        s.shelfNo.toLowerCase() === row.shelfName.trim().toLowerCase()
      );

      if (isDuplicateInDb) {
        newErrors[index] = "Shelf with this name already exists in this rack";
      }
    });

    setRowErrors(newErrors);
  }, [bulkShelfRows, shelves, bulkShelfDialogOpen]);

  // Load data on mount
  useEffect(() => {
    loadStores();
    loadRacks();
    loadShelves();
  }, []);

  // Load stock data when racks/shelves change
  useEffect(() => {
    if (racks.length > 0 || shelves.length > 0) {
      const timer = setTimeout(() => {
        loadStockData();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [racks, shelves]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (racks.length > 0 || shelves.length > 0) {
        loadStockData();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const loadStores = async () => {
    try {
      const response = await apiClient.getStores("active");
      const storesData = response.data || response;
      if (Array.isArray(storesData)) {
        setStores(storesData.map((s: any) => ({ id: s.id, name: s.name })));
      }
    } catch (error: any) { }
  };

  const loadRacks = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getRacks();
      const racksData = response.data || response;
      if (Array.isArray(racksData)) {
        setRacks(racksData.map((r: any) => ({
          id: String(r.id),
          codeNo: r.codeNo || r.code_no,
          store: r.store_name || 'No Store',
          storeId: r.store_id || r.storeId,
          description: r.description || '',
          status: r.status === 'Active' ? 'Active' : 'Inactive',
          shelfCount: r.shelves_count || 0,
        })));
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to load racks');
    } finally {
      setLoading(false);
    }
  };

  const loadShelves = async () => {
    try {
      const response = await apiClient.getShelves();
      const shelvesData = response.data || response;
      if (Array.isArray(shelvesData)) {
        setShelves(shelvesData.map((s: any) => ({
          id: String(s.id),
          shelfNo: s.shelfNo || s.shelf_no,
          rackId: String(s.rackId || s.rack_id),
          rackCode: s.rack_code || '',
          store: s.store_name || 'No Store',
          description: s.description || '',
          status: s.status === 'Active' ? 'Active' : 'Inactive',
        })));
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to load shelves');
    }
  };

  const loadStockData = async () => {
    try {
      const response: any = await apiClient.getRackShelfBalances();
      setStockData(response.data || response || {});
    } catch (error: any) {
      console.error("Failed to load stock data:", error);
    }
  };

  // Shelf form state
  const [shelfNo, setShelfNo] = useState("");
  const [shelfRackId, setShelfRackId] = useState("");
  const [shelfDescription, setShelfDescription] = useState("");
  const [shelfStatus, setShelfStatus] = useState<"Active" | "Inactive">("Active");

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "rack" | "shelf"; item: Rack | Shelf } | null>(null);

  // Expanded racks state for hierarchical view
  const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());

  // Toggle rack expansion
  const toggleRackExpansion = (rackId: string) => {
    setExpandedRacks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rackId)) {
        newSet.delete(rackId);
      } else {
        newSet.add(rackId);
      }
      return newSet;
    });
  };

  // Natural sort function
  const naturalSort = (a: string, b: string): number => {
    const aParts = a.match(/(\d+|\D+)/g) || [];
    const bParts = b.match(/(\d+|\D+)/g) || [];
    const minLength = Math.min(aParts.length, bParts.length);

    for (let i = 0; i < minLength; i++) {
      const aPart = aParts[i];
      const bPart = bParts[i];
      const aNum = parseInt(aPart, 10);
      const bNum = parseInt(bPart, 10);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        if (aNum !== bNum) return aNum - bNum;
      } else {
        if (aPart !== bPart) return aPart.localeCompare(bPart);
      }
    }
    return aParts.length - bParts.length;
  };

  // Get shelves for a specific rack
  const getShelvesForRack = (rackId: string): Shelf[] => {
    const rackShelves = shelves
      .filter(shelf => shelf.rackId === rackId)
      .map(shelf => {
        const normalizedShelfId = String(shelf.id).trim();
        const stockKey = `shelf_${normalizedShelfId}`;
        const stock = stockData[stockKey] || { itemsCount: 0, remainingQuantity: 0, items: [] };
        return {
          ...shelf,
          itemsCount: stock.itemsCount,
          remainingQuantity: stock.remainingQuantity,
          items: stock.items || [],
        };
      })
      .sort((a, b) => naturalSort(a.shelfNo, b.shelfNo));

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      return rackShelves.filter(shelf => {
        const matchesShelfName = shelf.shelfNo.toLowerCase().includes(searchLower);
        const matchesShelfItems = shelf.items && shelf.items.some(item =>
          item.partNo.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower))
        );
        return matchesShelfName || matchesShelfItems;
      });
    }
    return rackShelves;
  };

  // Reset forms
  const resetRackForm = () => {
    setRackCodeNo("");
    setRackStore("");
    setRackStoreId("");
    setRackDescription("");
    setRackStatus("Active");
    setSelectedRack(null);
  };

  const resetShelfForm = () => {
    setShelfNo("");
    setShelfRackId("");
    setShelfDescription("");
    setShelfStatus("Active");
    setSelectedShelf(null);
  };

  const resetCombinedForm = () => {
    setCombinedStoreId("");
    setCombinedRackName("");
    setCombinedShelfNames([""]);
  };

  const resetBulkShelfForm = () => {
    setBulkShelfRows([{ rackId: "", shelfName: "" }]);
    setRowErrors({});
  };

  // Handlers
  const handleCreateRack = () => {
    resetCombinedForm();
    setCombinedDialogOpen(true);
  };

  const handleBulkAddShelf = () => {
    resetBulkShelfForm();
    setBulkShelfDialogOpen(true);
  };

  const handleAddBulkShelfField = () => {
    setBulkShelfRows(prev => [...prev, { rackId: "", shelfName: "" }]);
  };

  const handleRemoveBulkShelfField = (index: number) => {
    if (bulkShelfRows.length > 1) {
      setBulkShelfRows(bulkShelfRows.filter((_, i) => i !== index));
      // Reset errors when removing a row because indices will shift
      setRowErrors({});
    }
  };

  const handleUpdateBulkShelfRow = (index: number, field: 'rackId' | 'shelfName', value: string) => {
    setBulkShelfRows(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  const handleSaveBulkShelves = async () => {
    const validRows = bulkShelfRows.map((row, index) => ({ ...row, originalIndex: index }))
      .filter(row => row.rackId && row.shelfName.trim());

    if (validRows.length === 0) {
      toast.error("Please add at least one rack and shelf name");
      return;
    }

    if (Object.keys(rowErrors).length > 0) {
      toast.error("Please fix duplicate entries before saving");
      return;
    }

    try {
      setLoading(true);
      setRowErrors({}); // Clear errors before attempting to save

      let successCount = 0;
      const finalErrors: Record<number, string> = {};

      for (const row of validRows) {
        try {
          const result = await apiClient.createShelf({
            shelfNo: row.shelfName.trim(),
            rackId: row.rackId,
            status: "Active",
          });

          if (result.error) {
            throw result;
          }

          successCount++;
        } catch (error: any) {
          const msg = error.error || error.message || "Unknown error";
          toast.error(`Failed to add '${row.shelfName}': ${msg}`);
          finalErrors[row.originalIndex] = msg;
        }
      }

      if (Object.keys(finalErrors).length > 0) {
        setRowErrors(finalErrors);
      }

      if (successCount > 0) {
        await loadShelves();
        await loadRacks();
        await loadStockData();
        toast.success(`Successfully added ${successCount} shelf${successCount !== 1 ? 'ves' : ''}`);

        if (Object.keys(finalErrors).length === 0) {
          resetBulkShelfForm();
          setBulkShelfDialogOpen(false);
        }
      }

    } catch (error: any) {
      console.error("Bulk save error:", error);
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcuts for Bulk Add form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + Z: Add Row
      if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
        if (bulkShelfDialogOpen) {
          e.preventDefault();
          handleAddBulkShelfField();
        }
      }
      // Alt + S: Save Shelves
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        if (bulkShelfDialogOpen && !loading) {
          e.preventDefault();
          handleSaveBulkShelves();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkShelfDialogOpen, loading, handleAddBulkShelfField, handleSaveBulkShelves]);

  const handleAddShelfField = () => {
    setCombinedShelfNames([...combinedShelfNames, ""]);
  };

  const handleRemoveShelfField = (index: number) => {
    if (combinedShelfNames.length > 1) {
      setCombinedShelfNames(combinedShelfNames.filter((_, i) => i !== index));
    }
  };

  const handleUpdateShelfName = (index: number, value: string) => {
    const updated = [...combinedShelfNames];
    updated[index] = value;
    setCombinedShelfNames(updated);
  };

  const handleSaveCombined = async () => {
    if (!combinedRackName.trim()) {
      toast.error("Please enter rack name");
      return;
    }
    if (!combinedStoreId) {
      toast.error("Please select a store");
      return;
    }
    const validShelfNames = combinedShelfNames.filter(name => name.trim() !== "");
    if (validShelfNames.length === 0) {
      toast.error("Please add at least one shelf name");
      return;
    }

    try {
      const rackResponse = await apiClient.createRack({
        codeNo: combinedRackName.trim(),
        storeId: combinedStoreId,
        status: "Active",
      });

      let createdRackId = (rackResponse as any)?.data?.id || (rackResponse as any)?.id;

      if (!createdRackId) {
        await loadRacks();
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadRacks();
        const selectedStoreName = stores.find(s => s.id === combinedStoreId)?.name;
        const createdRack = racks.find(r =>
          r.codeNo === combinedRackName.trim() &&
          (r.storeId === combinedStoreId || r.store === selectedStoreName)
        );
        if (createdRack) createdRackId = createdRack.id;
      }

      if (!createdRackId) {
        throw new Error("Failed to get created rack ID. Please try again.");
      }

      const shelfPromises = validShelfNames.map(shelfName =>
        apiClient.createShelf({
          shelfNo: shelfName.trim(),
          rackId: createdRackId,
          status: "Active",
        })
      );
      await Promise.all(shelfPromises);
      await loadRacks();
      await loadShelves();
      await loadStockData();
      toast.success(`Rack "${combinedRackName.trim()}" with ${validShelfNames.length} shelves created successfully`);
      resetCombinedForm();
      setCombinedDialogOpen(false);
    } catch (error: any) {
      toast.error(error.error || 'Failed to create rack and shelves');
    }
  };

  const handleEditRack = (rack: Rack) => {
    setSelectedRack(rack);
    setRackCodeNo(rack.codeNo);
    const store = stores.find(s => s.name === rack.store || s.id === rack.storeId);
    setRackStoreId(store?.id || '');
    setRackStore(rack.store);
    setRackDescription(rack.description);
    setRackStatus(rack.status);
    setFormMode("edit-rack");
    setRackDialogOpen(true);
  };

  const handleDeleteRack = (rack: Rack) => {
    setItemToDelete({ type: "rack", item: rack });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteRack = async (rack: Rack) => {
    try {
      await apiClient.deleteRack(rack.id);
      await loadRacks();
      await loadShelves();
      await loadStockData();
      toast.success(`Rack "${rack.codeNo}" deleted`);
    } catch (error: any) {
      toast.error(error.error || 'Failed to delete rack');
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleSaveRack = async () => {
    if (!rackCodeNo.trim()) {
      toast.error("Please enter rack code");
      return;
    }
    if (!rackStoreId) {
      toast.error("Please select a store");
      return;
    }

    try {
      if (formMode === "create-rack") {
        await apiClient.createRack({
          codeNo: rackCodeNo.trim(),
          storeId: rackStoreId,
          description: rackDescription.trim() || undefined,
          status: rackStatus,
        });
        await loadRacks();
        await loadStockData();
        toast.success("Rack created successfully");
        setRackDialogOpen(false);
      } else if (formMode === "edit-rack" && selectedRack) {
        await apiClient.updateRack(selectedRack.id, {
          codeNo: rackCodeNo.trim(),
          storeId: rackStoreId,
          description: rackDescription.trim() || undefined,
          status: rackStatus,
        });
        await loadRacks();
        await loadShelves();
        await loadStockData();
        toast.success("Rack updated successfully");
        setRackDialogOpen(false);
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to save rack');
    }
  };

  const handleCreateShelf = () => {
    resetShelfForm();
    setFormMode("create-shelf");
    setShelfDialogOpen(true);
  };

  const handleAddShelfToRack = (rack: Rack) => {
    resetShelfForm();
    setShelfRackId(String(rack.id));
    setFormMode("create-shelf");
    setShelfDialogOpen(true);
  };

  const handleEditShelf = (shelf: Shelf) => {
    setSelectedShelf(shelf);
    setShelfNo(shelf.shelfNo);
    setShelfRackId(shelf.rackId);
    setShelfDescription(shelf.description);
    setShelfStatus(shelf.status);
    setFormMode("edit-shelf");
    setShelfDialogOpen(true);
  };

  const handleDeleteShelf = (shelf: Shelf) => {
    setItemToDelete({ type: "shelf", item: shelf });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteShelf = async (shelf: Shelf) => {
    try {
      await apiClient.deleteShelf(shelf.id);
      await loadShelves();
      await loadRacks();
      await loadStockData();
      toast.success(`Shelf "${shelf.shelfNo}" deleted`);
    } catch (error: any) {
      toast.error(error.error || 'Failed to delete shelf');
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === "rack") {
      confirmDeleteRack(itemToDelete.item as Rack);
    } else {
      confirmDeleteShelf(itemToDelete.item as Shelf);
    }
  };

  const handleSaveShelf = async () => {
    if (!shelfNo.trim()) {
      toast.error("Please enter shelf number");
      return;
    }
    if (!shelfRackId) {
      toast.error("Please select a rack");
      return;
    }
    try {
      if (formMode === "create-shelf") {
        await apiClient.createShelf({
          shelfNo: shelfNo.trim(),
          rackId: shelfRackId,
          description: shelfDescription.trim() || undefined,
          status: shelfStatus,
        });
        await loadShelves();
        await loadRacks();
        await loadStockData();
        toast.success("Shelf created successfully");
        setShelfDialogOpen(false);
      } else if (formMode === "edit-shelf" && selectedShelf) {
        await apiClient.updateShelf(selectedShelf.id, {
          shelfNo: shelfNo.trim(),
          description: shelfDescription.trim() || undefined,
          status: shelfStatus,
        });
        await loadShelves();
        await loadRacks();
        await loadStockData();
        toast.success("Shelf updated successfully");
        setShelfDialogOpen(false);
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to save shelf');
    }
  };

  const handleCancel = () => {
    resetRackForm();
    resetShelfForm();
    resetCombinedForm();
    setFormMode("list");
    setRackDialogOpen(false);
    setShelfDialogOpen(false);
    setCombinedDialogOpen(false);
  };

  // Render Dialogs
  const renderRackDialog = () => (
    <Dialog open={rackDialogOpen} onOpenChange={setRackDialogOpen}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{formMode === "create-rack" ? "Create New Rack" : "Edit Rack"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Code No *</Label>
              <Input value={rackCodeNo} onChange={(e) => setRackCodeNo(e.target.value)} placeholder="Rack number" className="text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Store *</Label>
              <SearchableSelect
                options={stores.map(s => ({ value: s.id, label: s.name }))}
                value={rackStoreId}
                onValueChange={(val) => {
                  setRackStoreId(val);
                  const s = stores.find(st => st.id === val);
                  setRackStore(s?.name || '');
                }}
                placeholder="Select Store..."
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Description</Label>
            <Textarea value={rackDescription} onChange={(e) => setRackDescription(e.target.value)} placeholder="Rack description" className="text-sm resize-none" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Status</Label>
            <Select value={rackStatus} onValueChange={(val: "Active" | "Inactive") => setRackStatus(val)}>
              <SelectTrigger className="w-32 text-sm h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSaveRack} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {formMode === "create-rack" ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderShelfDialog = () => (
    <Dialog open={shelfDialogOpen} onOpenChange={setShelfDialogOpen}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{formMode === "create-shelf" ? "Create New Shelf" : "Edit Shelf"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Shelf No *</Label>
              <Input value={shelfNo} onChange={(e) => setShelfNo(e.target.value)} placeholder="Shelf number" className="text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Rack *</Label>
              <SearchableSelect
                options={racks.map(r => ({ value: r.id, label: r.codeNo, description: r.store }))}
                value={shelfRackId}
                onValueChange={setShelfRackId}
                placeholder="Select Rack..."
                disabled={formMode === "edit-shelf"}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Description</Label>
            <Textarea value={shelfDescription} onChange={(e) => setShelfDescription(e.target.value)} placeholder="Shelf description" className="text-sm resize-none" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Status</Label>
            <Select value={shelfStatus} onValueChange={(val: "Active" | "Inactive") => setShelfStatus(val)}>
              <SelectTrigger className="w-32 text-sm h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSaveShelf} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {formMode === "create-shelf" ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderCombinedDialog = () => (
    <Dialog open={combinedDialogOpen} onOpenChange={setCombinedDialogOpen}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create Rack with Shelves</DialogTitle>
          <DialogDescription>Create a new rack and add shelves to it in one step</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Store *</Label>
            <SearchableSelect
              options={stores.map(s => ({ value: s.id, label: s.name }))}
              value={combinedStoreId}
              onValueChange={setCombinedStoreId}
              placeholder="Select Store..."
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Rack Name *</Label>
            <Input value={combinedRackName} onChange={(e) => setCombinedRackName(e.target.value)} placeholder="Enter rack name" className="text-sm h-9" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Shelf Names *</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddShelfField} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Shelf
              </Button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {combinedShelfNames.map((n, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={n} onChange={(e) => handleUpdateShelfName(i, e.target.value)} placeholder={`Shelf name ${i + 1}`} className="text-sm h-9 flex-1" />
                  {combinedShelfNames.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveShelfField(i)} className="h-9 w-9 p-0 text-destructive"><Trash className="w-4 h-4" /></Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetCombinedForm(); setCombinedDialogOpen(false); }}>Cancel</Button>
          <Button onClick={handleSaveCombined} disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {loading ? "Creating..." : "Create Rack & Shelves"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderBulkShelfDialog = () => (
    <Dialog open={bulkShelfDialogOpen} onOpenChange={setBulkShelfDialogOpen}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.searchable-select-portal')) e.preventDefault();
        }}
      >
        <DialogHeader><DialogTitle>Bulk Add Shelves</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Add multiple shelves to racks. Each row can have a different rack.</p>
            <Button type="button" variant="outline" size="sm" onClick={handleAddBulkShelfField} className="h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Row (Alt + Z)
            </Button>
          </div>

          {/* Header Row */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center pb-2 border-b">
            <Label className="text-sm font-semibold">Select Rack *</Label>
            <Label className="text-sm font-semibold">Shelf Name *</Label>
            <div className="w-9"></div>
          </div>

          {/* Data Rows */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {bulkShelfRows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                {/* Rack Selector */}
                <SearchableSelect
                  options={racks.map(r => ({ value: r.id, label: r.codeNo, description: r.store }))}
                  value={row.rackId}
                  onValueChange={(value) => handleUpdateBulkShelfRow(index, 'rackId', value)}
                  placeholder="Select Rack..."
                  className="h-9 text-sm"
                />

                <div className="flex flex-col gap-1">
                  <Input
                    value={row.shelfName}
                    onChange={(e) => handleUpdateBulkShelfRow(index, 'shelfName', e.target.value)}
                    placeholder={`Shelf name ${index + 1}`}
                    className={`text-sm h-9 ${rowErrors[index] ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  />
                  {rowErrors[index] && (
                    <span className="text-[10px] text-destructive font-medium leading-none">
                      {rowErrors[index]}
                    </span>
                  )}
                </div>

                {/* Remove Button */}
                {bulkShelfRows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveBulkShelfField(index)}
                    className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                ) : (
                  <div className="w-9"></div>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetBulkShelfForm(); setBulkShelfDialogOpen(false); }}>Cancel</Button>
          <Button onClick={handleSaveBulkShelves} disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {loading ? "Adding..." : "Add Shelves (Alt + S)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderListView = () => {
    const filteredRacks = racks
      .map(rack => {
        const normalizedRackId = String(rack.id).trim();
        const stockKey = `rack_${normalizedRackId}`;
        const stock = stockData[stockKey] || { itemsCount: 0, remainingQuantity: 0, items: [] };
        return {
          ...rack,
          itemsCount: stock.itemsCount,
          remainingQuantity: stock.remainingQuantity,
          items: stock.items || [],
        };
      })
      .filter(rack => {
        // Filter by store
        if (selectedStoreFilter !== "all") {
          const rackStoreId = rack.storeId || stores.find(s => s.name === rack.store)?.id;
          if (rackStoreId !== selectedStoreFilter) {
            return false;
          }
        }

        // If no search term, include all racks (after store filter)
        if (!searchTerm.trim()) {
          return true;
        }

        // Filter by search - check rack name, store, and items
        const searchLower = searchTerm.toLowerCase();

        // Check rack code/name and store
        const matchesRackName = rack.codeNo.toLowerCase().includes(searchLower) ||
          rack.store.toLowerCase().includes(searchLower);

        // Check items in rack
        const matchesRackItems = rack.items && rack.items.some(item =>
          item.partNo.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower))
        );

        // Check shelves and their items
        const rackShelves = shelves.filter(s => {
          const normalizedRackId = String(rack.id).trim();
          const normalizedShelfRackId = String(s.rackId).trim();
          return normalizedRackId === normalizedShelfRackId;
        });

        const matchesShelfNames = rackShelves.some(shelf =>
          shelf.shelfNo.toLowerCase().includes(searchLower)
        );

        const matchesShelfItems = rackShelves.some(shelf => {
          const normalizedShelfId = String(shelf.id).trim();
          const stockKey = `shelf_${normalizedShelfId}`;
          const shelfStock = stockData[stockKey] || { items: [] };
          return shelfStock.items && shelfStock.items.some((item: any) =>
            item.partNo.toLowerCase().includes(searchLower) ||
            (item.description && item.description.toLowerCase().includes(searchLower))
          );
        });

        return matchesRackName || matchesRackItems || matchesShelfNames || matchesShelfItems;
      })
      .sort((a, b) => naturalSort(a.codeNo, b.codeNo));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold">Racks & Shelves Management</h2>
            <p className="text-sm text-muted-foreground mt-1">Organize and track inventory locations</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleCreateRack}><Plus className="w-4 h-4 mr-2" />Create Rack</Button>
            <Button onClick={handleBulkAddShelf} variant="outline"><Layers className="w-4 h-4 mr-2" />Bulk Add Shelves</Button>
            <Button onClick={loadStockData} variant="ghost"><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
          </div>
        </div>

        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm mb-2 block">Store</Label>
              <Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}>
                <SelectTrigger><SelectValue placeholder="All Stores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[250px]">
              <Label className="text-sm mb-2 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-9" />
              </div>
            </div>
          </div>
        </CardContent></Card>

        <div className="space-y-4">
          {filteredRacks.map(rack => {
            const rackShelves = getShelvesForRack(rack.id);
            const isExpanded = expandedRacks.has(rack.id);
            return (
              <Card key={rack.id} className="overflow-hidden border-2 hover:shadow-lg transition-shadow">
                <div className="bg-muted/30 p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleRackExpansion(rack.id)}>
                      {isExpanded ? <ChevronDown /> : <ChevronRight />}
                      <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center"><Archive className="text-primary" /></div>
                      <div>
                        <h3 className="font-bold">{rack.codeNo}</h3>
                        <p className="text-xs text-muted-foreground">{rack.store}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleAddShelfToRack(rack)}><Plus className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteRack(rack)} className="text-destructive"><Trash className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 pl-12 space-y-3">
                      {rackShelves.length === 0 ? <p className="text-sm text-muted-foreground">No shelves</p> :
                        rackShelves.map(shelf => (
                          <div key={shelf.id} className="p-3 bg-background rounded border">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-medium flex items-center gap-2">
                                  {shelf.shelfNo}
                                  {shelf.itemsCount && shelf.itemsCount > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                      {shelf.itemsCount} items
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">{shelf.description}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteShelf(shelf)} className="text-destructive"><Trash className="w-4 h-4" /></Button>
                              </div>
                            </div>

                            {/* Display Items in Shelf */}
                            {shelf.items && shelf.items.length > 0 ? (
                              <div className="mt-2 space-y-1 pl-2 border-l-2 border-primary/20">
                                {shelf.items.map((item, idx) => (
                                  <div key={idx} className="text-xs flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                                    <div className="flex flex-col">
                                      <span className="font-medium text-foreground">{item.partNo}</span>
                                      <span className="text-muted-foreground truncate max-w-[200px]" title={item.description}>{item.description}</span>
                                    </div>
                                    <Badge variant="outline" className="ml-2 font-mono">
                                      {item.quantity} Qty
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic pl-2">No items assigned</p>
                            )}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderListView()}
      {renderCombinedDialog()}
      {renderBulkShelfDialog()}
      {formMode.includes("rack") && renderRackDialog()}
      {formMode.includes("shelf") && renderShelfDialog()}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
