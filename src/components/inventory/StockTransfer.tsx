import { useState, useEffect } from "react";
import { ArrowLeftRight, Plus, Eye, Pencil, Trash, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
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

interface TransferItem {
  id: string;
  partId: string;
  partName: string;
  availableQty: number;
  transferQty: number;
  fromStore: string;
  fromRack: string;
  fromShelf: string;
  toStore: string;
  toRack: string;
  toShelf: string;
}

interface Transfer {
  id: string;
  transferNumber: string;
  date: string;
  status: "Draft" | "Pending" | "In Transit" | "Completed" | "Cancelled";
  notes: string;
  items: TransferItem[];
  total: number;
}

// Removed sample data - will fetch from API

const generateTransferNumber = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `STR-${year}${month}-${random}`;
};

export const StockTransfer = () => {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [viewingTransfer, setViewingTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalTransfers, setTotalTransfers] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transferToDelete, setTransferToDelete] = useState<string | null>(null);
  
  // Dropdown data
  const [stores, setStores] = useState<{ value: string; label: string }[]>([]);
  const [racks, setRacks] = useState<{ value: string; label: string; storeId: string }[]>([]);
  const [shelves, setShelves] = useState<{ value: string; label: string; rackId: string }[]>([]);
  const [parts, setParts] = useState<{ value: string; label: string; availableQty: number }[]>([]);

  // Form state
  const [formData, setFormData] = useState<{
    transferNumber: string;
    date: string;
    status: Transfer["status"];
    notes: string;
    items: TransferItem[];
  }>({
    transferNumber: "",
    date: "",
    status: "Draft",
    notes: "",
    items: [],
  });

  const totalPages = Math.ceil(totalTransfers / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;

  // Fetch transfers
  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getTransfers({
        page: currentPage,
        limit: itemsPerPage,
      });
      
      if (response.error) {
        toast.error(response.error);
        return;
      }

      const transfersData = (response.data as any[]) || [];
      const pagination = response.pagination;

      const formattedTransfers: Transfer[] = transfersData.map((t: any) => ({
        id: t.id,
        transferNumber: t.transfer_number || t.transferNumber,
        date: new Date(t.date).toLocaleDateString('en-GB'),
        status: t.status as Transfer["status"],
        notes: t.notes || '',
        items: [],
        total: t.total_qty || 0,
      }));

      setTransfers(formattedTransfers);
      setTotalTransfers(pagination?.total || 0);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch transfers');
    } finally {
      setLoading(false);
    }
  };

  // Fetch dropdown data
  const fetchDropdownData = async () => {
    try {
      // Fetch stores
      const storesResponse = await apiClient.getStores();
      const storesData = storesResponse.data || storesResponse;
      if (Array.isArray(storesData) && storesData.length > 0) {
        setStores(storesData.map((s: any) => ({
          value: s.id,
          label: `${s.code || ''} - ${s.name || ''}`,
        })));
      } else if (storesData && Array.isArray(storesData)) {
        setStores(storesData.map((s: any) => ({
          value: s.id,
          label: `${s.code || ''} - ${s.name || ''}`,
        })));
      }

      // Fetch racks
      const racksResponse = await apiClient.getRacks();
      const racksData = racksResponse.data || racksResponse;
      if (Array.isArray(racksData) && racksData.length > 0) {
        setRacks(racksData.map((r: any) => ({
          value: r.id,
          label: `${r.codeNo || r.code_no || ''} - ${r.description || ''}`,
          storeId: r.storeId || r.store_id || '',
        })));
      }

      // Fetch shelves
      const shelvesResponse = await apiClient.getShelves();
      const shelvesData = shelvesResponse.data || shelvesResponse;
      if (Array.isArray(shelvesData) && shelvesData.length > 0) {
        setShelves(shelvesData.map((s: any) => ({
          value: s.id,
          label: `${s.shelfNo || s.shelf_no || ''} - ${s.description || ''}`,
          rackId: s.rackId || s.rack_id || '',
        })));
      }

      // Fetch parts
      const partsResponse = await apiClient.getParts({ page: 1, limit: 1000, status: 'active' });
      const partsData = partsResponse.data || partsResponse;
      if (Array.isArray(partsData) && partsData.length > 0) {
        // Get stock balances for parts
        const balancesResponse = await apiClient.getStockBalances({ limit: 10000 });
        const balancesData = balancesResponse.data || balancesResponse;
        const balances = Array.isArray(balancesData) ? balancesData : [];
        const balanceMap: Record<string, number> = {};
        balances.forEach((b: any) => {
          const partId = b.part_id || b.partId;
          if (partId) {
            balanceMap[partId] = (balanceMap[partId] || 0) + (b.balance || b.current_stock || 0);
          }
        });

        setParts(partsData.map((p: any) => ({
          value: p.id,
          label: `${p.part_no || p.partNo || ''} - ${p.description || ''}`,
          availableQty: balanceMap[p.id] || 0,
        })));
      }
    } catch (error: any) {
      toast.error('Failed to load dropdown data: ' + (error.message || 'Unknown error'));
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [currentPage, itemsPerPage]);

  useEffect(() => {
    fetchDropdownData();
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(transfers.map((t) => t.id));
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

  const openCreateForm = () => {
    const today = new Date().toISOString().split("T")[0];
    setFormData({
      transferNumber: generateTransferNumber(),
      date: today,
      status: "Draft",
      notes: "",
      items: [],
    });
    setEditingTransfer(null);
    setShowForm(true);
  };

  const openEditForm = async (transfer: Transfer) => {
    try {
      setLoading(true);
      const response = await apiClient.getTransfer(transfer.id);
      
      if (response.error) {
        toast.error(response.error);
        return;
      }

      const transferData = (response.data as any) || response;
      
      setFormData({
        transferNumber: transferData.transfer_number || transfer.transferNumber,
        date: new Date(transferData.date).toISOString().split('T')[0],
        status: transferData.status || transfer.status,
        notes: transferData.notes || transfer.notes,
        items: (transferData.items || []).map((item: any) => ({
          id: item.id || Date.now().toString(),
          partId: item.part_id,
          partName: item.part_description || item.part_no || '',
          availableQty: 0, // Will be fetched if needed
          transferQty: item.quantity,
          fromStore: item.from_store_id || '',
          fromRack: item.from_rack_id || '',
          fromShelf: item.from_shelf_id || '',
          toStore: item.to_store_id || '',
          toRack: item.to_rack_id || '',
          toShelf: item.to_shelf_id || '',
        })),
      });
      setEditingTransfer(transfer);
      setShowForm(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load transfer details');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    const newItem: TransferItem = {
      id: Date.now().toString(),
      partId: "",
      partName: "",
      availableQty: 0,
      transferQty: 1,
      fromStore: "",
      fromRack: "",
      fromShelf: "",
      toStore: "",
      toRack: "",
      toShelf: "",
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  const handleRemoveItem = (itemId: string) => {
    setFormData({
      ...formData,
      items: formData.items.filter((item) => item.id !== itemId),
    });
  };

  const handleItemChange = (itemId: string, field: keyof TransferItem, value: string | number) => {
    setFormData({
      ...formData,
      items: formData.items.map((item) => {
        if (item.id === itemId) {
          if (field === "partId") {
            const part = parts.find((p) => p.value === value);
            return {
              ...item,
              partId: value as string,
              partName: part?.label || "",
              availableQty: part?.availableQty || 0,
            };
          }
          return { ...item, [field]: value };
        }
        return item;
      }),
    });
  };

  const handleSave = async () => {
    try {
      if (formData.items.length === 0) {
        toast.error('Please add at least one item to transfer');
        return;
      }

      // Validate items
      for (const item of formData.items) {
        if (!item.partId) {
          toast.error('Please select a part for all items');
          return;
        }
        if (!item.fromStore || !item.toStore) {
          toast.error('Please select from and to stores for all items');
          return;
        }
        if (item.transferQty <= 0) {
          toast.error('Transfer quantity must be greater than 0');
          return;
        }
        if (item.transferQty > item.availableQty) {
          toast.error(`Transfer quantity cannot exceed available quantity (${item.availableQty})`);
          return;
        }
      }

      setLoading(true);

      const transferData = {
        transfer_number: formData.transferNumber,
        date: formData.date,
        notes: formData.notes || undefined,
        items: formData.items.map(item => ({
          part_id: item.partId,
          from_store_id: item.fromStore || undefined,
          from_rack_id: item.fromRack || undefined,
          from_shelf_id: item.fromShelf || undefined,
          to_store_id: item.toStore || undefined,
          to_rack_id: item.toRack || undefined,
          to_shelf_id: item.toShelf || undefined,
          quantity: item.transferQty,
        })),
      };

      if (editingTransfer) {
        const response = await apiClient.updateTransfer(editingTransfer.id, {
          ...transferData,
          status: formData.status,
        });
        
        if (response.error) {
          toast.error(response.error);
          return;
        }
        
        toast.success('Transfer updated successfully');
      } else {
        const response = await apiClient.createTransfer(transferData);
        
        if (response.error) {
          toast.error(response.error);
          return;
        }
        
        toast.success('Transfer created successfully');
      }

      setShowForm(false);
      setEditingTransfer(null);
      fetchTransfers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTransfer(null);
  };

  const handleDeleteClick = (id: string) => {
    setTransferToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!transferToDelete) return;

    try {
      setLoading(true);
      const response = await apiClient.deleteTransfer(transferToDelete);
      
      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success('Transfer deleted successfully');
      setTransfers(transfers.filter((t) => t.id !== transferToDelete));
      setSelectedIds(selectedIds.filter((i) => i !== transferToDelete));
      fetchTransfers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete transfer');
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setTransferToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Stock Transfer Entry</h2>
            <p className="text-sm text-muted-foreground">Transfer stock between stores, racks, and shelves</p>
          </div>
        </div>
        <Button onClick={openCreateForm} className="gap-2">
          <Plus className="w-4 h-4" />
          Transfer
        </Button>
      </div>

      {/* Conditional: Show Form or Table */}
      {showForm ? (
        /* Create/Edit Form Section */
        <div className="bg-card border border-primary/30 rounded-lg overflow-hidden animate-fade-in">
          {/* Form Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                {editingTransfer ? "Edit Transfer" : "Create Stock Transfer"}
              </h3>
            </div>
            <Button variant="ghost" size="icon" onClick={handleCancel} className="h-8 w-8">
              <Trash className="w-4 h-4" />
            </Button>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-6">
            {/* Form Header Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Transfer Number</label>
                <Input
                  value={formData.transferNumber}
                  readOnly
                  className="bg-muted/50"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Transfer Date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Status</label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as Transfer["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Transit">In Transit</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Transfer notes..."
                />
              </div>
            </div>

            {/* Transfer Items Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">Transfer Items</h3>
                <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-1.5 border-primary text-primary hover:bg-primary/10">
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
              </div>

              {formData.items.length === 0 ? (
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 flex flex-col items-center justify-center text-center">
                  <ArrowLeftRight className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Click "Add Item" to add items for transfer</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {formData.items.map((item, index) => (
                    <div key={item.id} className="border border-border rounded-lg p-4 bg-muted/20 relative">
                      <div className="flex items-center justify-between mb-4">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                          Item #{index + 1}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Part Selection Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1.5 block">
                            Part <span className="text-destructive">*</span>
                          </label>
                          <SearchableSelect
                            options={parts.map((part) => ({ value: part.value, label: `${part.label} (Available: ${part.availableQty})` }))}
                            value={item.partId}
                            onValueChange={(v) => handleItemChange(item.id, "partId", v)}
                            placeholder="Select part"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1.5 block">Available Qty</label>
                          <Input value={item.availableQty} readOnly className="bg-muted/50" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1.5 block">
                            Transfer Qty <span className="text-destructive">*</span>
                          </label>
                          <Input
                            type="number"
                            min="1"
                            max={item.availableQty}
                            value={item.transferQty}
                            onChange={(e) => handleItemChange(item.id, "transferQty", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      {/* From Location */}
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">From Location</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">Store</label>
                            <SearchableSelect
                              options={stores}
                              value={item.fromStore}
                              onValueChange={(v) => handleItemChange(item.id, "fromStore", v)}
                              placeholder="Select store"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">Rack</label>
                            <SearchableSelect
                              options={racks.filter(r => !item.fromStore || r.storeId === item.fromStore).map(r => ({ value: r.value, label: r.label }))}
                              value={item.fromRack}
                              onValueChange={(v) => handleItemChange(item.id, "fromRack", v)}
                              placeholder="Select rack"
                              disabled={!item.fromStore}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">Shelf</label>
                            <SearchableSelect
                              options={shelves.filter(s => !item.fromRack || s.rackId === item.fromRack).map(s => ({ value: s.value, label: s.label }))}
                              value={item.fromShelf}
                              onValueChange={(v) => handleItemChange(item.id, "fromShelf", v)}
                              placeholder="Select shelf"
                              disabled={!item.fromRack}
                            />
                          </div>
                        </div>
                      </div>

                      {/* To Location */}
                      <div>
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">To Location</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">Store</label>
                            <SearchableSelect
                              options={stores.filter((s) => s.value !== item.fromStore)}
                              value={item.toStore}
                              onValueChange={(v) => handleItemChange(item.id, "toStore", v)}
                              placeholder="Select store"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">Rack</label>
                            <SearchableSelect
                              options={racks.filter(r => !item.toStore || r.storeId === item.toStore).map(r => ({ value: r.value, label: r.label }))}
                              value={item.toRack}
                              onValueChange={(v) => handleItemChange(item.id, "toRack", v)}
                              placeholder="Select rack"
                              disabled={!item.toStore}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">Shelf</label>
                            <SearchableSelect
                              options={shelves.filter(s => !item.toRack || s.rackId === item.toRack).map(s => ({ value: s.value, label: s.label }))}
                              value={item.toShelf}
                              onValueChange={(v) => handleItemChange(item.id, "toShelf", v)}
                              placeholder="Select shelf"
                              disabled={!item.toRack}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-muted/10">
            <Button onClick={handleSave} className="flex-1 gap-2">
              <Check className="w-4 h-4" />
              {editingTransfer ? "Update Transfer" : "Create Transfer"}
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* Main Table Card */
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <ListNumberHeader />
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.length === transfers.length && transfers.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-xs font-medium uppercase text-muted-foreground">ID</TableHead>
                <TableHead className="text-xs font-medium uppercase text-muted-foreground">Total</TableHead>
                <TableHead className="text-xs font-medium uppercase text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-medium uppercase text-muted-foreground text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    Loading transfers...
                  </TableCell>
                </TableRow>
              ) : transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No transfers found. Click "+ Transfer" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer, index) => (
                  <TableRow key={transfer.id} className="hover:bg-muted/20 transition-colors">
                    <ListNumberCell index={index} page={currentPage} pageSize={itemsPerPage} />
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(transfer.id)}
                        onCheckedChange={(checked) => handleSelectOne(transfer.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{transfer.transferNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{transfer.total.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{transfer.date}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-3">
                        <ActionButtonTooltip label="View" variant="view">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              setLoading(true);
                              try {
                                const response = await apiClient.getTransfer(transfer.id);
                                if (response.error) {
                                  if (response.error.includes('404') || response.error.includes('Not Found')) {
                                    toast.error('Transfer details endpoint not available. Please restart the backend server.');
                                    setViewingTransfer({ ...transfer, items: [] });
                                    return;
                                  }
                                  toast.error(response.error || 'Failed to load transfer details');
                                  return;
                                }

                                const transferData = (response.data as any) || response;
                                if (!transferData?.id) {
                                  toast.error('Invalid transfer data received');
                                  return;
                                }

                                setViewingTransfer({
                                  id: transferData.id,
                                  transferNumber: transferData.transfer_number || transfer.transferNumber,
                                  date: new Date(transferData.date).toLocaleDateString('en-GB'),
                                  status: transferData.status as Transfer["status"],
                                  notes: transferData.notes || '',
                                  items: (transferData.items || []).map((item: any) => ({
                                    id: item.id,
                                    partId: item.part_id,
                                    partName: item.part_description || item.part_no || '',
                                    availableQty: 0,
                                    transferQty: item.quantity,
                                    fromStore: item.from_store || '',
                                    fromRack: item.from_rack || '',
                                    fromShelf: item.from_shelf || '',
                                    toStore: item.to_store || '',
                                    toRack: item.to_rack || '',
                                    toShelf: item.to_shelf || '',
                                  })),
                                  total: transferData.total_qty || 0,
                                });
                              } catch (error: any) {
                                const errorMsg = error.message || 'Failed to load transfer details';
                                if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
                                  toast.error('Backend route not loaded. Please restart the backend server (Ctrl+C then npm run dev)');
                                } else {
                                  toast.error(errorMsg);
                                }
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="text-primary hover:text-primary/80 text-sm font-medium flex items-center gap-1 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Button>
                        </ActionButtonTooltip>
                        <ActionButtonTooltip label="Edit" variant="edit">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditForm(transfer)}
                            className="text-primary hover:text-primary/80 text-sm font-medium flex items-center gap-1 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Button>
                        </ActionButtonTooltip>
                        <ActionButtonTooltip label="Delete" variant="delete">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(transfer.id)}
                            className="text-destructive hover:text-destructive/80 text-sm font-medium flex items-center gap-1 transition-colors"
                          >
                            <Trash className="w-4 h-4" />
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

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border bg-muted/10">
            <p className="text-sm text-muted-foreground">
              Showing {totalTransfers > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, totalTransfers)} of {totalTransfers} Records
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 px-2"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-2"
              >
                Prev
              </Button>
              <div className="flex items-center gap-1">
                <span className="w-8 h-8 flex items-center justify-center rounded bg-primary text-primary-foreground text-sm font-medium">
                  {currentPage}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="h-8 px-2"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="h-8 px-2"
              >
                Last
              </Button>
              <Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(Number(v))}>
                <SelectTrigger className="h-8 w-16">
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
      )}

      {/* View Dialog */}
      <Dialog open={!!viewingTransfer} onOpenChange={() => setViewingTransfer(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-primary" />
              <DialogTitle>Transfer Details - {viewingTransfer?.transferNumber}</DialogTitle>
            </div>
          </DialogHeader>

          {viewingTransfer && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Transfer Number</p>
                  <p className="font-medium text-foreground">{viewingTransfer.transferNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium text-foreground">{viewingTransfer.date}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="secondary">{viewingTransfer.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Qty</p>
                  <p className="font-medium text-foreground">{viewingTransfer.total}</p>
                </div>
              </div>

              {viewingTransfer.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-foreground">{viewingTransfer.notes}</p>
                </div>
              )}

              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">Transfer Items</h3>
                <div className="space-y-3">
                  {viewingTransfer.items.map((item, index) => (
                    <div key={item.id} className="border border-border rounded-lg p-4 bg-muted/10">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                          Item #{index + 1}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">Qty: {item.transferQty}</span>
                      </div>
                      <p className="font-medium text-foreground mb-2">{item.partId} - {item.partName}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">From</p>
                          <p className="text-foreground">{item.fromStore} {item.fromRack && `/ ${item.fromRack}`} {item.fromShelf && `/ ${item.fromShelf}`}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">To</p>
                          <p className="text-foreground">{item.toStore} {item.toRack && `/ ${item.toRack}`} {item.toShelf && `/ ${item.toShelf}`}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transfer? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
