import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package, Trash, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Kit } from "./KitsList";
import { apiClient } from "@/lib/api";

interface KitItem {
  id: string;
  partNo: string;
  partName: string;
  quantity: number;
  cost: number;
}

interface KitFormData {
  kitNumber: string;
  kitName: string;
  sellingPrice: string;
  status: string;
  description: string;
} 

interface Part {
  id: string;
  partNo: string;
  description: string;
  cost: number;
}

interface EditKitFormProps {
  kit: Kit;
  onSave: (kit: Kit) => void;
  onDelete: (kit: Kit) => void;
  onCancel: () => void;
}

export const EditKitForm = ({ kit, onSave, onDelete, onCancel }: EditKitFormProps) => {
  const [formData, setFormData] = useState<KitFormData>({
    kitNumber: kit.badge || "",
    kitName: kit.name,
    sellingPrice: kit.price.toString(),
    status: "Active",
    description: "",
  });
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  const [availableParts, setAvailableParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [partsLoading, setPartsLoading] = useState(false);
  const [kitLoading, setKitLoading] = useState(false);

  // Fetch parts and kit details from API
  useEffect(() => {
    fetchParts();
    fetchKitDetails();
  }, [kit.id]);

  const fetchParts = async () => {
    try {
      setPartsLoading(true);
      const response = await apiClient.getParts({ status: 'active', limit: 1000 });
      if (response.data && Array.isArray(response.data)) {
        const parts: Part[] = response.data.map((p: any) => ({
          id: p.id,
          partNo: p.part_no || p.partNo,
          description: p.description,
          cost: p.cost || 0,
        }));
        setAvailableParts(parts);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch parts",
        variant: "destructive",
      });
    } finally {
      setPartsLoading(false);
    }
  };

  const fetchKitDetails = async () => {
    try {
      setKitLoading(true);
      const response = await apiClient.getKit(kit.id);
      if (response.data) {
        const kitData = response.data;
        setFormData({
          kitNumber: kitData.badge || "",
          kitName: kitData.name,
          sellingPrice: kitData.sellingPrice?.toString() || "0",
          status: kitData.status || "Active",
          description: kitData.description || "",
        });
        
        // Set kit items
        if (kitData.items && Array.isArray(kitData.items)) {
          const items: KitItem[] = kitData.items.map((item: any) => ({
            id: item.id || Date.now().toString() + Math.random(),
            partNo: item.partNo,
            partName: item.partName,
            quantity: item.quantity,
            cost: item.costPerUnit || item.cost,
          }));
          setKitItems(items);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch kit details",
        variant: "destructive",
      });
    } finally {
      setKitLoading(false);
    }
  };

  const handleInputChange = (field: keyof KitFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddNewItem = () => {
    const newItem: KitItem = {
      id: Date.now().toString(),
      partNo: "",
      partName: "",
      quantity: 1,
      cost: 0,
    };
    // Add new item at the beginning
    setKitItems((prev) => [newItem, ...prev]);
  };

  const handlePartSelect = (itemId: string, partId: string) => {
    const selectedPart = availableParts.find((p) => p.id === partId);
    if (selectedPart) {
      setKitItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, partNo: selectedPart.partNo, partName: selectedPart.description, cost: selectedPart.cost }
            : item
        )
      );
    }
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setKitItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setKitItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    if (!formData.kitNumber.trim() || !formData.kitName.trim()) {
      toast({
        title: "Validation Error",
        description: "Kit Number and Kit Name are required",
        variant: "destructive",
      });
      return;
    }

    const validItems = kitItems.filter(item => item.partNo && item.partName && item.quantity > 0);
    if (validItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one valid item is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      // Find part IDs for items
      const itemsWithPartIds = validItems.map(item => {
        const part = availableParts.find(p => p.partNo === item.partNo);
        if (!part) {
          throw new Error(`Part ${item.partNo} not found`);
        }
        return {
          partId: part.id,
          partNo: item.partNo,
          partName: item.partName,
          quantity: item.quantity,
          costPerUnit: item.cost,
        };
      });

      const response = await apiClient.updateKit(kit.id, {
        badge: formData.kitNumber,
        name: formData.kitName,
        description: formData.description,
        sellingPrice: parseFloat(formData.sellingPrice) || 0,
        status: formData.status,
        items: itemsWithPartIds,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const updatedKit: Kit = {
        id: response.data.id,
        name: response.data.name,
        badge: response.data.badge,
        price: response.data.sellingPrice,
        itemsCount: response.data.itemsCount,
        totalCost: response.data.totalCost,
        items: response.data.items?.map((item: any) => ({
          id: item.id,
          partNo: item.partNo,
          partName: item.partName,
          quantity: item.quantity,
          cost: item.costPerUnit || item.cost,
        })),
      };
      
      onSave(updatedKit);
      toast({
        title: "Success",
        description: "Kit updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update kit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (kitLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 md:p-6 h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading kit details...</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 md:p-6 h-full flex flex-col">
      <h2 className="text-lg font-semibold text-foreground mb-4">Edit Kit</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Kit Number <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="KIT-001"
            value={formData.kitNumber}
            onChange={(e) => handleInputChange("kitNumber", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Kit Name <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="Enter kit name"
            value={formData.kitName}
            onChange={(e) => handleInputChange("kitName", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Selling Price</label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.sellingPrice}
            onChange={(e) => handleInputChange("sellingPrice", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Status</label>
          <Select value={formData.status} onValueChange={(v) => handleInputChange("status", v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-muted-foreground mb-1.5">Description</label>
        <Textarea
          placeholder="Enter description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          rows={2}
          className="text-sm resize-none"
        />
      </div>

      {/* Kit Items Section */}
      <div className="border-t border-border pt-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">Kit Items ({kitItems.filter(item => item.partNo).length})</span>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-1 text-primary border-primary h-8 text-xs" 
            onClick={handleAddNewItem}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </Button>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {kitItems.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center h-full min-h-[150px]">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <p className="font-medium text-foreground text-sm">No items added yet</p>
              <p className="text-xs text-muted-foreground">Click "Add Item" to start building your kit</p>
            </div>
          ) : (
            <div className="space-y-3">
              {kitItems.map((item, index) => (
                <div key={item.id} className="border border-border rounded-lg p-4 bg-background">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-primary-foreground text-xs font-medium">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">Item {index + 1}</p>
                        <p className="text-xs text-muted-foreground">Select part and quantity</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs gap-1"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      <Trash className="w-3.5 h-3.5" />
                      Remove
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">
                        Part <span className="text-destructive">*</span>
                      </label>
                      <Select 
                        value={availableParts.find(p => p.partNo === item.partNo)?.id || ""} 
                        onValueChange={(v) => handlePartSelect(item.id, v)}
                        disabled={partsLoading}
                      >
                        <SelectTrigger className="h-9 text-sm w-full">
                          <SelectValue placeholder={partsLoading ? "Loading parts..." : "Select part"} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          {availableParts.map((part) => (
                            <SelectItem key={part.id} value={part.id}>
                              {part.partNo} - {part.description} (Rs {part.cost.toFixed(2)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-32">
                      <label className="block text-xs text-muted-foreground mb-1.5">
                        Quantity <span className="text-destructive">*</span>
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-4 border-t border-border">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            "Update Kit"
          )}
        </Button>
        <Button 
          variant="outline" 
          className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => onDelete(kit)}
        >
          Delete
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
