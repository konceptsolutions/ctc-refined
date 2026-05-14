import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Package, History, Tag, Settings, Plus, Check } from "lucide-react";
import { PartItem, InvoiceItem, ItemGrade } from "@/types/invoice";

interface InvoiceItemPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableParts: PartItem[];
  customerName: string;
  onAddItem: (item: InvoiceItem) => void;
}

export const InvoiceItemPicker = ({
  open,
  onOpenChange,
  availableParts,
  customerName,
  onAddItem,
}: InvoiceItemPickerProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPart, setSelectedPart] = useState<PartItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [machineModel, setMachineModel] = useState("");

  const filteredParts = availableParts.filter(
    (part) =>
      part.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectPart = (part: PartItem) => {
    setSelectedPart(part);
    setQuantity(1);
    setDiscount(0);
    setSelectedBrand(part.brands[0]?.name || "");
    setMachineModel("");
  };

  const calculateLineTotal = () => {
    if (!selectedPart) return 0;
    const baseTotal = selectedPart.price * quantity;
    if (discountType === "percent") {
      return baseTotal - (baseTotal * discount) / 100;
    }
    return baseTotal - discount;
  };

  const handleAddItem = () => {
    if (!selectedPart) return;

    const machineInfo = selectedPart.machineModels?.find(m => m.name === machineModel);

    const item: InvoiceItem = {
      id: `item-${Date.now()}`,
      partId: selectedPart.id,
      partNo: selectedPart.partNo,
      description: selectedPart.description,
      orderedQty: quantity,
      deliveredQty: 0,
      pendingQty: quantity,
      unitPrice: selectedPart.price,
      discount,
      discountType,
      lineTotal: calculateLineTotal(),
      grade: selectedPart.grade,
      brand: selectedBrand,
      machineModel: machineModel || undefined,
      machineRequiredQty: machineInfo?.requiredQty,
    };

    onAddItem(item);
    setSelectedPart(null);
    setQuantity(1);
    setDiscount(0);
    setSearchTerm("");
  };

  const getGradeColor = (grade: ItemGrade) => {
    switch (grade) {
      case "A": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "B": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "C": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "D": return "bg-red-500/10 text-red-600 border-red-500/20";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Select Item for Invoice
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel - Part Search & List */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by Part No or Description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="h-[400px] border rounded-lg">
              <div className="p-2 space-y-2">
                {filteredParts.map((part) => (
                  <div
                    key={part.id}
                    onClick={() => handleSelectPart(part)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                      selectedPart?.id === part.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{part.partNo}</span>
                          <Badge variant="outline" className={getGradeColor(part.grade)}>
                            {part.grade}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{part.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{part.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-primary">Rs {part.price.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Stock Info (available = in stock minus reserved; reserve not shown in picker) */}
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">In Stock</p>
                        <p className="text-sm font-medium text-foreground">{part.stockQty}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Available</p>
                        <p className="text-sm font-medium text-green-600">{part.availableQty}</p>
                      </div>
                    </div>

                    {/* Last Sale Info */}
                    {part.lastSaleQty && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-xs">
                        <History className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Last sold {part.lastSaleQty} pcs @ Rs {part.lastSalePrice?.toFixed(2)} to {customerName}
                        </span>
                      </div>
                    )}

                    {/* Brands */}
                    {part.brands.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <Tag className="w-3 h-3 text-muted-foreground" />
                        {part.brands.map((brand) => (
                          <Badge key={brand.id} variant="secondary" className="text-xs">
                            {brand.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {filteredParts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No parts found matching your search
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Item Details & Add */}
          <div className="space-y-4">
            {selectedPart ? (
              <>
                <div className="p-4 bg-muted/30 rounded-lg border border-border">
                  <h4 className="font-medium text-foreground mb-2">Selected Item</h4>
                  <p className="text-sm text-primary font-medium">{selectedPart.partNo}</p>
                  <p className="text-sm text-muted-foreground">{selectedPart.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={getGradeColor(selectedPart.grade)}>
                      Grade {selectedPart.grade}
                    </Badge>
                    <Badge variant="secondary">{selectedPart.category}</Badge>
                  </div>
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedPart.availableQty}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  {quantity > selectedPart.availableQty && (
                    <p className="text-xs text-destructive">
                      Warning: Quantity exceeds available stock ({selectedPart.availableQty})
                    </p>
                  )}
                </div>

                {/* Brand Selection */}
                {selectedPart.brands.length > 0 && (
                  <div className="space-y-2">
                    <Label>Brand</Label>
                    <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPart.brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.name}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Machine Model (Optional) */}
                {selectedPart.machineModels && selectedPart.machineModels.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Machine Model (Optional)
                    </Label>
                    <Select value={machineModel} onValueChange={setMachineModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select machine model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {selectedPart.machineModels.map((model) => (
                          <SelectItem key={model.id} value={model.name}>
                            {model.name} {model.requiredQty && `(Req: ${model.requiredQty} pcs)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {machineModel && selectedPart.machineModels.find(m => m.name === machineModel)?.requiredQty && (
                      <p className="text-xs text-muted-foreground">
                        Required quantity for this machine: {selectedPart.machineModels.find(m => m.name === machineModel)?.requiredQty} pcs
                      </p>
                    )}
                  </div>
                )}

                {/* Discount */}
                <div className="space-y-2">
                  <Label>Item Discount</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="flex-1"
                    />
                    <Select value={discountType} onValueChange={(v) => setDiscountType(v as "percent" | "fixed")}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="fixed">Rs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Line Total */}
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Unit Price:</span>
                    <span className="font-medium">Rs {selectedPart.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Quantity:</span>
                    <span className="font-medium">{quantity}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between items-center text-destructive">
                      <span className="text-sm">Discount:</span>
                      <span className="font-medium">
                        -{discountType === "percent" ? `${discount}%` : `Rs ${discount.toFixed(2)}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 mt-2 border-t border-border">
                    <span className="font-medium">Line Total:</span>
                    <span className="text-lg font-bold text-primary">
                      Rs {calculateLineTotal().toFixed(2)}
                    </span>
                  </div>
                </div>

                <Button onClick={handleAddItem} className="w-full" size="lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Invoice
                </Button>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select an item from the list to add to invoice</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
