import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Store,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Archive,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface RackData {
  id: string;
  codeNo: string;
  storeId: string;
  description: string;
  status: "active" | "inactive";
  shelves: ShelfData[];
}

interface ShelfData {
  id: string;
  shelfNo: string;
  rackId: string;
  description: string;
  status: "active" | "inactive";
}

interface StoreData {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  description?: string;
}

const storeTypes = ["Main Store", "Warehouse", "Branch", "Outlet"];

const initialStores: StoreData[] = [];

const initialRacks: RackData[] = [];

const initialShelves: ShelfData[] = [];

export const StoreManagementTab = () => {
  const [stores, setStores] = useState<StoreData[]>(initialStores);
  const [racks, setRacks] = useState<RackData[]>(initialRacks);
  const [shelves, setShelves] = useState<ShelfData[]>(initialShelves);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isStoreDialogOpen, setIsStoreDialogOpen] = useState(false);
  const [isRackDialogOpen, setIsRackDialogOpen] = useState(false);
  const [isShelfDialogOpen, setIsShelfDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [editingRack, setEditingRack] = useState<RackData | null>(null);
  const [editingShelf, setEditingShelf] = useState<ShelfData | null>(null);
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [selectedRackId, setSelectedRackId] = useState<string>("");
  const [deleteStoreDialogOpen, setDeleteStoreDialogOpen] = useState(false);
  const [deleteRackDialogOpen, setDeleteRackDialogOpen] = useState(false);
  const [deleteShelfDialogOpen, setDeleteShelfDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<string | null>(null);
  const [rackToDelete, setRackToDelete] = useState<string | null>(null);
  const [shelfToDelete, setShelfToDelete] = useState<string | null>(null);

  const [storeFormData, setStoreFormData] = useState({
    name: "",
    type: "Main Store",
    status: "active" as "active" | "inactive",
    description: "",
  });

  const [rackFormData, setRackFormData] = useState({
    codeNo: "",
    description: "",
    status: "active" as "active" | "inactive",
  });

  const [shelfFormData, setShelfFormData] = useState({
    shelfNo: "",
    description: "",
    status: "active" as "active" | "inactive",
  });

  const [loading, setLoading] = useState(false);

  // Fetch stores, racks, and shelves on mount
  useEffect(() => {
    fetchStores();
    fetchRacks();
    fetchShelves();
  }, []);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getStores(statusFilter);
      const storesData = response.data || response;
      if (Array.isArray(storesData)) {
        setStores(storesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          type: s.type || s.code || '',
          status: (s.status || '').toLowerCase(),
          description: s.description || '',
        })));
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to fetch stores');
    } finally {
      setLoading(false);
    }
  };

  const fetchRacks = async () => {
    try {
      const response = await apiClient.getRacks();
      const racksData = response.data || response;
      if (Array.isArray(racksData)) {
        setRacks(racksData.map((r: any) => ({
          id: r.id,
          codeNo: r.codeNo || r.code_no,
          storeId: r.storeId || r.store_id,
          description: r.description || '',
          status: (r.status || 'Active').toLowerCase(),
          shelves: r.shelves || [],
        })));
      }
    } catch (error: any) {
    }
  };

  const fetchShelves = async () => {
    try {
      const response = await apiClient.getShelves();
      const shelvesData = response.data || response;
      if (Array.isArray(shelvesData)) {
        setShelves(shelvesData.map((s: any) => ({
          id: s.id,
          shelfNo: s.shelfNo || s.shelf_no,
          rackId: s.rackId || s.rack_id,
          description: s.description || '',
          status: (s.status || 'Active').toLowerCase(),
        })));
      }
    } catch (error: any) {
    }
  };

  // Refetch when status filter changes
  useEffect(() => {
    fetchStores();
  }, [statusFilter]);

  const filteredStores = stores.filter(store => {
    const matchesSearch = store.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || store.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getRacksForStore = (storeId: string) => racks.filter(r => r.storeId === storeId);
  const getShelvesForRack = (rackId: string) => shelves.filter(s => s.rackId === rackId);

  const toggleStoreExpanded = (storeId: string) => {
    const newExpanded = new Set(expandedStores);
    if (newExpanded.has(storeId)) {
      newExpanded.delete(storeId);
    } else {
      newExpanded.add(storeId);
    }
    setExpandedStores(newExpanded);
  };

  const toggleRackExpanded = (rackId: string) => {
    const newExpanded = new Set(expandedRacks);
    if (newExpanded.has(rackId)) {
      newExpanded.delete(rackId);
    } else {
      newExpanded.add(rackId);
    }
    setExpandedRacks(newExpanded);
  };

  // Store handlers
  const handleStoreSubmit = async () => {
    if (!storeFormData.name) {
      toast.error("Please fill required fields");
      return;
    }

    try {
      if (editingStore) {
        const response = await apiClient.updateStore(editingStore.id, storeFormData);
        if (response.error) {
          toast.error(response.error);
          return;
        }
        toast.success("Store updated successfully");
        await fetchStores();
      } else {
        const response = await apiClient.createStore(storeFormData);
        if (response.error) {
          toast.error(response.error);
          return;
        }
        toast.success("Store created successfully");
        await fetchStores();
      }
      setIsStoreDialogOpen(false);
      setEditingStore(null);
      setStoreFormData({ name: "", type: "", status: "active", description: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to save store");
    }
  };

  const handleEditStore = (store: StoreData) => {
    setEditingStore(store);
    setStoreFormData({
      name: store.name,
      type: store.type,
      status: store.status,
      description: store.description || "",
    });
    setIsStoreDialogOpen(true);
  };

  const handleDeleteStore = (id: string) => {
    setStoreToDelete(id);
    setDeleteStoreDialogOpen(true);
  };

  const confirmDeleteStore = async () => {
    if (!storeToDelete) return;

    try {
      const response = await apiClient.deleteStore(storeToDelete);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success("Store and associated racks/shelves deleted");
      await fetchStores();
      await fetchRacks();
      await fetchShelves();
      setDeleteStoreDialogOpen(false);
      setStoreToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete store");
    }
  };

  const openNewStoreDialog = () => {
    setEditingStore(null);
    setStoreFormData({ name: "", type: "Main Store", status: "active", description: "" });
    setIsStoreDialogOpen(true);
  };

  // Rack handlers
  const handleRackSubmit = async () => {
    if (!rackFormData.codeNo) {
      toast.error("Please enter rack code");
      return;
    }

    if (!selectedStoreId && !editingRack) {
      toast.error("Please select a store");
      return;
    }

    try {
      if (editingRack) {
        const response = await apiClient.updateRack(editingRack.id, {
          codeNo: rackFormData.codeNo,
          description: rackFormData.description,
          status: rackFormData.status === 'active' ? 'Active' : 'Inactive',
        });
        if (response.error) {
          toast.error(response.error);
          return;
        }
        toast.success("Rack updated successfully");
        await fetchRacks();
        await fetchShelves();
      } else {
        const response = await apiClient.createRack({
          codeNo: rackFormData.codeNo,
          storeId: selectedStoreId,
          description: rackFormData.description,
          status: rackFormData.status === 'active' ? 'Active' : 'Inactive',
        });
        if (response.error) {
          toast.error(response.error);
          return;
        }
        toast.success("Rack created successfully");
        await fetchRacks();
      }
      setIsRackDialogOpen(false);
      setEditingRack(null);
      setRackFormData({ codeNo: "", description: "", status: "active" });
    } catch (error: any) {
      toast.error(error.message || "Failed to save rack");
    }
  };

  const handleEditRack = (rack: RackData) => {
    setEditingRack(rack);
    setRackFormData({
      codeNo: rack.codeNo,
      description: rack.description,
      status: rack.status,
    });
    setIsRackDialogOpen(true);
  };

  const handleDeleteRack = (rackId: string) => {
    setRackToDelete(rackId);
    setDeleteRackDialogOpen(true);
  };

  const confirmDeleteRack = async () => {
    if (!rackToDelete) return;

    try {
      const response = await apiClient.deleteRack(rackToDelete);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success("Rack and associated shelves deleted");
      await fetchRacks();
      await fetchShelves();
      setDeleteRackDialogOpen(false);
      setRackToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete rack");
    }
  };

  const openNewRackDialog = (storeId: string) => {
    setSelectedStoreId(storeId);
    setEditingRack(null);
    setRackFormData({ codeNo: "", description: "", status: "active" });
    setIsRackDialogOpen(true);
  };

  // Shelf handlers
  const handleShelfSubmit = async () => {
    if (!shelfFormData.shelfNo) {
      toast.error("Please enter shelf number");
      return;
    }

    if (!selectedRackId && !editingShelf) {
      toast.error("Please select a rack");
      return;
    }

    try {
      if (editingShelf) {
        const response = await apiClient.updateShelf(editingShelf.id, {
          shelfNo: shelfFormData.shelfNo,
          description: shelfFormData.description,
          status: shelfFormData.status === 'active' ? 'Active' : 'Inactive',
        });
        if (response.error) {
          toast.error(response.error);
          return;
        }
        toast.success("Shelf updated successfully");
        await fetchShelves();
        await fetchRacks();
      } else {
        const response = await apiClient.createShelf({
          shelfNo: shelfFormData.shelfNo,
          rackId: selectedRackId,
          description: shelfFormData.description,
          status: shelfFormData.status === 'active' ? 'Active' : 'Inactive',
        });
        if (response.error) {
          toast.error(response.error);
          return;
        }
        toast.success("Shelf created successfully");
        await fetchShelves();
        await fetchRacks();
      }
      setIsShelfDialogOpen(false);
      setEditingShelf(null);
      setShelfFormData({ shelfNo: "", description: "", status: "active" });
    } catch (error: any) {
      toast.error(error.message || "Failed to save shelf");
    }
  };

  const handleEditShelf = (shelf: ShelfData) => {
    setEditingShelf(shelf);
    setShelfFormData({
      shelfNo: shelf.shelfNo,
      description: shelf.description,
      status: shelf.status,
    });
    setIsShelfDialogOpen(true);
  };

  const handleDeleteShelf = (shelfId: string) => {
    setShelfToDelete(shelfId);
    setDeleteShelfDialogOpen(true);
  };

  const confirmDeleteShelf = async () => {
    if (!shelfToDelete) return;

    try {
      const response = await apiClient.deleteShelf(shelfToDelete);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success("Shelf deleted");
      await fetchShelves();
      await fetchRacks();
      setDeleteShelfDialogOpen(false);
      setShelfToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete shelf");
    }
  };

  const openNewShelfDialog = (rackId: string) => {
    setSelectedRackId(rackId);
    setEditingShelf(null);
    setShelfFormData({ shelfNo: "", description: "", status: "active" });
    setIsShelfDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Store Management</h2>
          <p className="text-sm text-muted-foreground">Create stores and manage racks & shelves for each store</p>
        </div>
        <Button className="gap-2" onClick={openNewStoreDialog}>
          <Plus className="w-4 h-4" />
          Add New Store
        </Button>
      </div>

      {/* Store Dialog */}
      <Dialog open={isStoreDialogOpen} onOpenChange={setIsStoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {editingStore ? "Edit Store" : "Create New Store"}
              <Button variant="ghost" size="icon" onClick={() => setIsStoreDialogOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Store Name *</Label>
                <Input
                  value={storeFormData.name}
                  onChange={(e) => setStoreFormData({ ...storeFormData, name: e.target.value })}
                  placeholder="e.g. Main Store"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={storeFormData.description}
                onChange={(e) => setStoreFormData({ ...storeFormData, description: e.target.value })}
                placeholder="Enter store description (optional)"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsStoreDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleStoreSubmit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rack Dialog */}
      <Dialog open={isRackDialogOpen} onOpenChange={setIsRackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRack ? "Edit Rack" : "Add New Rack"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Rack Code *</Label>
              <Input
                value={rackFormData.codeNo}
                onChange={(e) => setRackFormData({ ...rackFormData, codeNo: e.target.value })}
                placeholder="e.g. RACK-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={rackFormData.description}
                onChange={(e) => setRackFormData({ ...rackFormData, description: e.target.value })}
                placeholder="Enter rack description (optional)"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={rackFormData.status} onValueChange={(v) => setRackFormData({ ...rackFormData, status: v as "active" | "inactive" })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsRackDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleRackSubmit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shelf Dialog */}
      <Dialog open={isShelfDialogOpen} onOpenChange={setIsShelfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingShelf ? "Edit Shelf" : "Add New Shelf"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Shelf Number *</Label>
              <Input
                value={shelfFormData.shelfNo}
                onChange={(e) => setShelfFormData({ ...shelfFormData, shelfNo: e.target.value })}
                placeholder="e.g. SHELF-A1"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={shelfFormData.description}
                onChange={(e) => setShelfFormData({ ...shelfFormData, description: e.target.value })}
                placeholder="Enter shelf description (optional)"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={shelfFormData.status} onValueChange={(v) => setShelfFormData({ ...shelfFormData, status: v as "active" | "inactive" })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsShelfDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleShelfSubmit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stores List */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <h3 className="font-semibold">Stores List ({filteredStores.length})</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredStores.map((store) => {
              const storeRacks = getRacksForStore(store.id);
              const isExpanded = expandedStores.has(store.id);
              const totalShelves = storeRacks.reduce((acc, r) => acc + getShelvesForRack(r.id).length, 0);

              return (
                <Collapsible key={store.id} open={isExpanded} onOpenChange={() => toggleStoreExpanded(store.id)}>
                  <div className="border rounded-lg">
                    {/* Store Row */}
                    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                      <CollapsibleTrigger className="flex items-center gap-3 flex-1 text-left">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Store className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{store.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {store.type} • {storeRacks.length} racks • {totalShelves} shelves
                          </p>
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2">
                        <Badge variant={store.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                          {store.status}
                        </Badge>
                        <ActionButtonTooltip label="Edit" variant="edit">
                          <Button variant="outline" size="sm" onClick={() => handleEditStore(store)}>
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </ActionButtonTooltip>
                        <ActionButtonTooltip label="Delete" variant="delete">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/50 hover:bg-destructive/10"
                            onClick={() => handleDeleteStore(store.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </ActionButtonTooltip>
                      </div>
                    </div>

                    {/* Expanded Content - Racks */}
                    <CollapsibleContent>
                      <div className="border-t bg-muted/20 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <Archive className="w-4 h-4" />
                            Racks in {store.name}
                          </h4>
                          <Button size="sm" variant="outline" onClick={() => openNewRackDialog(store.id)}>
                            <Plus className="w-3 h-3 mr-1" />
                            Add Rack
                          </Button>
                        </div>

                        {storeRacks.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No racks yet. Add your first rack to this store.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {storeRacks.map((rack) => {
                              const rackShelves = getShelvesForRack(rack.id);
                              const isRackExpanded = expandedRacks.has(rack.id);

                              return (
                                <Collapsible key={rack.id} open={isRackExpanded} onOpenChange={() => toggleRackExpanded(rack.id)}>
                                  <div className="border rounded-lg bg-background">
                                    {/* Rack Row */}
                                    <div className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                                      <CollapsibleTrigger className="flex items-center gap-3 flex-1 text-left">
                                        {isRackExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                        )}
                                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                                          <Archive className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                          <p className="font-medium text-sm">{rack.codeNo}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {rackShelves.length} shelves
                                          </p>
                                        </div>
                                      </CollapsibleTrigger>
                                      <div className="flex items-center gap-2">
                                        <Badge variant={rack.status === 'active' ? 'outline' : 'secondary'} className="capitalize text-xs">
                                          {rack.status}
                                        </Badge>
                                        <ActionButtonTooltip label="Edit" variant="edit">
                                          <Button variant="ghost" size="sm" onClick={() => handleEditRack(rack)}>
                                            <Edit className="w-3 h-3" />
                                          </Button>
                                        </ActionButtonTooltip>
                                        <ActionButtonTooltip label="Delete" variant="delete">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDeleteRack(rack.id)}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </ActionButtonTooltip>
                                      </div>
                                    </div>

                                    {/* Expanded Content - Shelves */}
                                    <CollapsibleContent>
                                      <div className="border-t bg-muted/10 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <h5 className="text-xs font-medium flex items-center gap-2">
                                            <Layers className="w-3 h-3" />
                                            Shelves in {rack.codeNo}
                                          </h5>
                                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openNewShelfDialog(rack.id)}>
                                            <Plus className="w-3 h-3 mr-1" />
                                            Add Shelf
                                          </Button>
                                        </div>

                                        {rackShelves.length === 0 ? (
                                          <p className="text-xs text-muted-foreground text-center py-2">
                                            No shelves yet.
                                          </p>
                                        ) : (
                                          <div className="space-y-1">
                                            {rackShelves.map((shelf) => (
                                              <div key={shelf.id} className="flex items-center justify-between p-2 rounded bg-background border">
                                                <div className="flex items-center gap-2">
                                                  <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                                                    <Layers className="w-3 h-3 text-blue-600" />
                                                  </div>
                                                  <span className="text-sm font-medium">{shelf.shelfNo}</span>
                                                  <Badge variant={shelf.status === 'active' ? 'outline' : 'secondary'} className="capitalize text-[10px] px-1.5">
                                                    {shelf.status}
                                                  </Badge>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <ActionButtonTooltip label="Edit" variant="edit">
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleEditShelf(shelf)}>
                                                      <Edit className="w-3 h-3" />
                                                    </Button>
                                                  </ActionButtonTooltip>
                                                  <ActionButtonTooltip label="Delete" variant="delete">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                                      onClick={() => handleDeleteShelf(shelf.id)}
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                  </ActionButtonTooltip>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </CollapsibleContent>
                                  </div>
                                </Collapsible>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            {filteredStores.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Store className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No stores found
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Store Confirmation Dialog */}
      <AlertDialog open={deleteStoreDialogOpen} onOpenChange={setDeleteStoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this store? This will also delete all associated racks and shelves.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStoreToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteStore}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Rack Confirmation Dialog */}
      <AlertDialog open={deleteRackDialogOpen} onOpenChange={setDeleteRackDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rack</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rack? This will also delete all associated shelves.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRackToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRack}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Shelf Confirmation Dialog */}
      <AlertDialog open={deleteShelfDialogOpen} onOpenChange={setDeleteShelfDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shelf</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this shelf? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShelfToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteShelf}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
