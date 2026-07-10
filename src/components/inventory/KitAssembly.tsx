import { useState } from "react";
import { Boxes, Package, Plus, Minus, Search, ArrowRight, Trash } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface KitItem {
  partNo: string;
  description: string;
  quantity: number;
}

interface KitOperation {
  id: string;
  date: string;
  kitNo: string;
  kitName: string;
  type: "assembly" | "disassembly";
  quantity: number;
  items: KitItem[];
  status: "Completed" | "Pending";
}

const sampleOperations: KitOperation[] = [
  {
    id: "1",
    date: "2024-01-15",
    kitNo: "KIT-001",
    kitName: "Brake Service Kit",
    type: "assembly",
    quantity: 5,
    items: [
      { partNo: "BRK-001", description: "Brake pads", quantity: 2 },
      { partNo: "BRK-002", description: "Brake fluid", quantity: 1 },
    ],
    status: "Completed",
  },
  {
    id: "2",
    date: "2024-01-16",
    kitNo: "KIT-002",
    kitName: "Oil Change Kit",
    type: "disassembly",
    quantity: 3,
    items: [
      { partNo: "OIL-001", description: "Engine oil", quantity: 4 },
      { partNo: "FLT-001", description: "Oil filter", quantity: 1 },
    ],
    status: "Completed",
  },
];

const availableParts = [
  { partNo: "BRK-001", description: "Brake pads", stock: 50 },
  { partNo: "BRK-002", description: "Brake fluid", stock: 30 },
  { partNo: "OIL-001", description: "Engine oil", stock: 100 },
  { partNo: "FLT-001", description: "Oil filter", stock: 75 },
  { partNo: "ENG-001", description: "Spark plug", stock: 120 },
];

export const KitAssembly = () => {
  const [operations, setOperations] = useState<KitOperation[]>(sampleOperations);
  const [activeTab, setActiveTab] = useState<"assembly" | "disassembly" | "history">("assembly");
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    kitNo: "",
    kitName: "",
    quantity: "1",
  });

  const addPartToKit = (part: typeof availableParts[0]) => {
    const existing = kitItems.find((i) => i.partNo === part.partNo);
    if (existing) {
      setKitItems((prev) =>
        prev.map((i) => (i.partNo === part.partNo ? { ...i, quantity: i.quantity + 1 } : i))
      );
    } else {
      setKitItems([...kitItems, { partNo: part.partNo, description: part.description, quantity: 1 }]);
    }
  };

  const removePartFromKit = (partNo: string) => {
    setKitItems((prev) => prev.filter((i) => i.partNo !== partNo));
  };

  const updateQuantity = (partNo: string, delta: number) => {
    setKitItems((prev) =>
      prev.map((i) =>
        i.partNo === partNo ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
      )
    );
  };

  const handleSave = () => {
    if (!formData.kitNo || kitItems.length === 0) return;

    const newOperation: KitOperation = {
      id: Date.now().toString(),
      date: new Date().toISOString().split("T")[0],
      kitNo: formData.kitNo,
      kitName: formData.kitName,
      type: activeTab === "assembly" ? "assembly" : "disassembly",
      quantity: parseInt(formData.quantity) || 1,
      items: kitItems,
      status: "Completed",
    };
    setOperations([newOperation, ...operations]);
    setFormData({ kitNo: "", kitName: "", quantity: "1" });
    setKitItems([]);
  };

  const filteredParts = availableParts.filter(
    (p) =>
      p.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Kit Making / Breaking</h2>
          <p className="text-sm text-muted-foreground">Assembly and disassembly of inventory kits</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="h-9">
          <TabsTrigger value="assembly" className="text-xs gap-1.5">
            <Boxes className="w-3.5 h-3.5" />
            Assembly
          </TabsTrigger>
          <TabsTrigger value="disassembly" className="text-xs gap-1.5">
            <Package className="w-3.5 h-3.5" />
            Disassembly
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
        </TabsList>

        {/* Assembly / Disassembly Content */}
        <TabsContent value="assembly" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Kit Details */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-4">Kit Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Kit Number *</label>
                  <Input
                    value={formData.kitNo}
                    onChange={(e) => setFormData({ ...formData, kitNo: e.target.value })}
                    placeholder="Enter kit number"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Kit Name</label>
                  <Input
                    value={formData.kitName}
                    onChange={(e) => setFormData({ ...formData, kitName: e.target.value })}
                    placeholder="Enter kit name"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Quantity to Assemble</label>
                  <Input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="1"
                    className="h-9"
                  />
                </div>
              </div>

              {/* Kit Items */}
              <div className="mt-4">
                <h4 className="text-xs font-medium text-foreground mb-2">Kit Components</h4>
                {kitItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No parts added</p>
                ) : (
                  <div className="space-y-2">
                    {kitItems.map((item) => (
                      <div
                        key={item.partNo}
                        className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.partNo}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateQuantity(item.partNo, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateQuantity(item.partNo, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removePartFromKit(item.partNo)}
                          >
                            <Trash className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button className="w-full mt-4" size="sm" onClick={handleSave} disabled={!formData.kitNo || kitItems.length === 0}>
                <Boxes className="w-4 h-4 mr-2" />
                Assemble Kit
              </Button>
            </div>

            {/* Available Parts */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-4">Available Parts</h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search parts..."
                  className="pl-9 h-9"
                />
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {filteredParts.map((part) => (
                  <div
                    key={part.partNo}
                    className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => addPartToKit(part)}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{part.partNo}</p>
                      <p className="text-xs text-muted-foreground">{part.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Stock: {part.stock}
                      </Badge>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="disassembly" className="space-y-4 mt-4">
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-sm font-medium text-foreground mb-1">Kit Disassembly</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Select a kit to break down into individual components
            </p>
            <Select>
              <SelectTrigger className="w-64 mx-auto h-9">
                <SelectValue placeholder="Select kit to disassemble" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KIT-001">KIT-001 - Brake Service Kit</SelectItem>
                <SelectItem value="KIT-002">KIT-002 - Oil Change Kit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <ListNumberHeader />
                  <TableHead className="text-xs font-medium">Date</TableHead>
                  <TableHead className="text-xs font-medium">Kit No</TableHead>
                  <TableHead className="text-xs font-medium">Kit Name</TableHead>
                  <TableHead className="text-xs font-medium">Type</TableHead>
                  <TableHead className="text-xs font-medium text-right">Qty</TableHead>
                  <TableHead className="text-xs font-medium">Components</TableHead>
                  <TableHead className="text-xs font-medium">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((op, index) => (
                  <TableRow key={op.id} className="hover:bg-muted/20 transition-colors">
                    <ListNumberCell index={index} />
                    <TableCell className="text-sm text-muted-foreground">{op.date}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{op.kitNo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{op.kitName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          op.type === "assembly"
                            ? "bg-chart-green/10 text-chart-green border-chart-green/30"
                            : "bg-chart-orange/10 text-chart-orange border-chart-orange/30"
                        )}
                      >
                        {op.type === "assembly" ? "Assembly" : "Disassembly"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground text-right">{op.quantity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{op.items.length} parts</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs bg-chart-green/10 text-chart-green border-chart-green/30">
                        {op.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
