import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatPartIdentityFromDb } from "@/lib/part-identity";
import { toast } from "sonner";
import { formatUiDate } from "@/utils/dateUtils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface PurchaseOrderItem {
  id: string;
  part_no: string;
  part_description?: string;
  brand: string;
  quantity: number;
  received_qty?: number;
  unit_cost: number;
  total_cost: number;
  notes?: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  date: string;
  supplier_name?: string;
  supplier_id?: string;
  status: string;
  expected_date?: string;
  notes?: string;
  total_amount: number;
  items?: PurchaseOrderItem[];
}

interface StoreEditPOProps {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface OrderItemForm {
  id: string;
  partId: string;
  quantity: string;
  unitCost: string;
  notes: string;
}

export const StoreEditPO = ({ order, open, onOpenChange, onSuccess }: StoreEditPOProps) => {
  const [loading, setLoading] = useState(false);
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formExpectedDate, setFormExpectedDate] = useState<Date | undefined>(undefined);
  const [formSupplier, setFormSupplier] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [formItems, setFormItems] = useState<OrderItemForm[]>([]);
  
  // Dropdown data
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [parts, setParts] = useState<{ id: string; partNo: string; masterPartNo: string; description: string; brand: string; cost: number }[]>([]);

  useEffect(() => {
    if (open && order) {
      // Load order data
      setFormDate(new Date(order.date));
      setFormExpectedDate(order.expected_date ? new Date(order.expected_date) : undefined);
      setFormSupplier(order.supplier_id || "");
      setFormNotes(order.notes || "");
      setFormStatus(order.status || "");
      
      // Load items
      if (order.items && order.items.length > 0) {
        // We need to map items to form format, but we don't have partId in the item
        // So we'll need to fetch the full order details
        loadOrderItems();
      } else {
        setFormItems([{ id: "1", partId: "", quantity: "", unitCost: "", notes: "" }]);
      }
    }
    
    if (open) {
      fetchDropdownData();
    }
  }, [open, order]);

  const loadOrderItems = async () => {
    if (!order) return;
    
    try {
      const response = await apiClient.getPurchaseOrder(order.id);
      const poData: any = response.data || response;
      
      if (poData && poData.items) {
        setFormItems(poData.items.map((item: any, idx: number) => ({
          id: String(idx + 1),
          partId: item.part_id || item.partId || "",
          quantity: String(item.quantity || item.orderedQty || ""),
          unitCost: String(item.unit_cost || item.unitCost || ""),
          notes: item.notes || "",
        })));
      }
    } catch (error: any) {
    }
  };

  const fetchDropdownData = async () => {
    try {
      // Fetch suppliers
      const suppliersResponse = await apiClient.getSuppliers();
      const suppliersData = suppliersResponse.data || suppliersResponse;
      if (Array.isArray(suppliersData)) {
        setSuppliers(suppliersData.map((s: any) => ({ 
          id: s.id, 
          name: s.companyName || s.name || "N/A" 
        })));
      }

      // Fetch parts
      const partsResponse = await apiClient.getParts({ page: 1, limit: 1000, status: "active" });
      const partsData = partsResponse.data || partsResponse;
      if (Array.isArray(partsData)) {
        setParts(partsData.map((p: any) => ({
          id: p.id,
          partNo: p.part_no || p.partNo,
          masterPartNo: p.master_part_no || p.masterPartNo || "",
          description: p.description || "",
          brand: p.brand_name || p.brand?.name || "N/A",
          cost: p.cost || 0,
        })));
      }
    } catch (error: any) {
    }
  };

  const handleAddItem = () => {
    setFormItems([...formItems, { 
      id: String(Date.now()), 
      partId: "", 
      quantity: "", 
      unitCost: "",
      notes: ""
    }]);
  };

  const handleRemoveItem = (id: string) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter((item) => item.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItemForm, value: string) => {
    setFormItems(formItems.map((item) => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // If part changed, update unit cost from part data
        if (field === "partId" && value) {
          const part = parts.find(p => p.id === value);
          if (part && part.cost > 0) {
            updated.unitCost = String(part.cost);
          }
        }
        return updated;
      }
      return item;
    }));
  };

  const handleSubmit = async () => {
    if (!order) return;

    // Validation
    if (!formSupplier) {
      toast.error("Please select a supplier");
      return;
    }

    if (formItems.length === 0 || formItems.some(item => !item.partId || !item.quantity || !item.unitCost)) {
      toast.error("Please fill in all item fields");
      return;
    }

    try {
      setLoading(true);

      // Prepare items for API
      const itemsForUpdate = formItems
        .filter(item => item.partId && item.quantity && item.unitCost)
        .map(item => ({
          part_id: item.partId,
          quantity: Number(item.quantity),
          unit_cost: Number(item.unitCost),
          total_cost: Number(item.quantity) * Number(item.unitCost),
          received_qty: 0, // Reset received quantity when editing
          notes: item.notes || undefined,
        }));

      // Update PO
      await apiClient.updatePurchaseOrder(order.id, {
        date: formDate.toISOString(),
        expected_date: formExpectedDate ? formExpectedDate.toISOString() : undefined,
        supplier_id: formSupplier,
        notes: formNotes || undefined,
        status: formStatus,
        items: itemsForUpdate,
      });

      toast.success("Purchase Order updated successfully");
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.error || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Purchase Order - {order.po_number}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="space-y-4">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formDate && "text-muted-foreground"
                      )}
                    >
                      {formDate ? formatUiDate(formDate) : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formDate}
                      onSelect={(date) => date && setFormDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Expected Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formExpectedDate && "text-muted-foreground"
                      )}
                    >
                      {formExpectedDate ? formatUiDate(formExpectedDate) : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formExpectedDate}
                      onSelect={setFormExpectedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={formSupplier || undefined} onValueChange={setFormSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id || "unknown"}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Enter notes"
                  rows={3}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items *</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Part</TableHead>
                      <TableHead className="w-[100px]">Quantity</TableHead>
                      <TableHead className="w-[120px]">Unit Cost</TableHead>
                      <TableHead className="w-[120px]">Total Cost</TableHead>
                      <TableHead className="w-[200px]">Notes</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.map((item) => {
                      const totalCost = item.quantity && item.unitCost
                        ? (Number(item.quantity) * Number(item.unitCost)).toFixed(2)
                        : "0.00";
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Select
                              value={item.partId}
                              onValueChange={(value) => handleItemChange(item.id, "partId", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select part" />
                              </SelectTrigger>
                                  <SelectContent>
                                    {parts.map((part) => (
                                      <SelectItem key={part.id} value={part.id || "unknown"}>
                                        {formatPartIdentityFromDb(part)} - {part.brand}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                              placeholder="Qty"
                              min="1"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.unitCost}
                              onChange={(e) => handleItemChange(item.id, "unitCost", e.target.value)}
                              placeholder="Cost"
                              min="0"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">Rs {totalCost}</div>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.notes}
                              onChange={(e) => handleItemChange(item.id, "notes", e.target.value)}
                              placeholder="Notes"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={formItems.length === 1}
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
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

