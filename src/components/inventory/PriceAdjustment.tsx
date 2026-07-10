import { useState } from "react";
import { DollarSign, Search, Download, Edit2, Check, Trash, TrendingUp, TrendingDown, History } from "lucide-react";
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
import { cn } from "@/lib/utils";

interface PriceItem {
  id: string;
  partNo: string;
  description: string;
  category: string;
  currentCost: number;
  currentPrice: number;
  margin: number;
  lastUpdated: string;
  priceHistory: { date: string; price: number }[];
}

const sampleData: PriceItem[] = [
  { id: "1", partNo: "ENG-001", description: "Engine oil filter", category: "Engine", currentCost: 25.00, currentPrice: 38.00, margin: 34.2, lastUpdated: "2024-01-10", priceHistory: [{ date: "2024-01-10", price: 38.00 }, { date: "2023-12-01", price: 35.00 }] },
  { id: "2", partNo: "BRK-002", description: "Front brake pads", category: "Brakes", currentCost: 85.00, currentPrice: 125.00, margin: 32.0, lastUpdated: "2024-01-08", priceHistory: [{ date: "2024-01-08", price: 125.00 }] },
  { id: "3", partNo: "SUS-003", description: "Shock absorber", category: "Suspension", currentCost: 120.00, currentPrice: 175.00, margin: 31.4, lastUpdated: "2024-01-05", priceHistory: [{ date: "2024-01-05", price: 175.00 }, { date: "2023-11-15", price: 165.00 }] },
  { id: "4", partNo: "ELC-004", description: "Alternator assembly", category: "Electrical", currentCost: 250.00, currentPrice: 350.00, margin: 28.6, lastUpdated: "2024-01-01", priceHistory: [{ date: "2024-01-01", price: 350.00 }] },
  { id: "5", partNo: "FLT-005", description: "Air filter element", category: "Filters", currentCost: 15.00, currentPrice: 24.00, margin: 37.5, lastUpdated: "2024-01-12", priceHistory: [{ date: "2024-01-12", price: 24.00 }, { date: "2023-12-20", price: 22.00 }] },
];

export const PriceAdjustment = () => {
  const [items, setItems] = useState<PriceItem[]>(sampleData);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCost, setNewCost] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const categories = [...new Set(items.map((i) => i.category))];

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSave = (id: string) => {
    const cost = parseFloat(newCost);
    const price = parseFloat(newPrice);
    if (isNaN(cost) || isNaN(price)) return;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const margin = ((price - cost) / price) * 100;
          return {
            ...item,
            currentCost: cost,
            currentPrice: price,
            margin,
            lastUpdated: new Date().toISOString().split("T")[0],
            priceHistory: [{ date: new Date().toISOString().split("T")[0], price }, ...item.priceHistory],
          };
        }
        return item;
      })
    );
    setEditingId(null);
    setNewCost("");
    setNewPrice("");
  };

  const startEdit = (item: PriceItem) => {
    setEditingId(item.id);
    setNewCost(item.currentCost.toString());
    setNewPrice(item.currentPrice.toString());
  };

  const avgMargin = items.reduce((sum, i) => sum + i.margin, 0) / items.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Price Readjustment & Update Controls</h2>
          <p className="text-sm text-muted-foreground">Manage pricing and margin controls</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="w-4 h-4" />
          Export Prices
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Items</p>
              <p className="text-xl font-semibold text-foreground">{items.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-chart-green/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-chart-green" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg. Margin</p>
              <p className="text-xl font-semibold text-chart-green">{avgMargin.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-chart-blue/10 flex items-center justify-center">
              <History className="w-5 h-5 text-chart-blue" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Updated Today</p>
              <p className="text-xl font-semibold text-chart-blue">
                {items.filter((i) => i.lastUpdated === new Date().toISOString().split("T")[0]).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-chart-orange/10 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-chart-orange" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Low Margin (&lt;30%)</p>
              <p className="text-xl font-semibold text-chart-orange">
                {items.filter((i) => i.margin < 30).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search parts..."
            className="pl-9 h-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <ListNumberHeader />
              <TableHead className="text-xs font-medium">Part No</TableHead>
              <TableHead className="text-xs font-medium">Description</TableHead>
              <TableHead className="text-xs font-medium">Category</TableHead>
              <TableHead className="text-xs font-medium text-right">Cost</TableHead>
              <TableHead className="text-xs font-medium text-right">Price</TableHead>
              <TableHead className="text-xs font-medium text-right">Margin</TableHead>
              <TableHead className="text-xs font-medium">Last Updated</TableHead>
              <TableHead className="text-xs font-medium text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item, index) => (
              <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                <ListNumberCell index={index} />
                <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-sm text-right">
                  {editingId === item.id ? (
                    <Input
                      type="number"
                      value={newCost}
                      onChange={(e) => setNewCost(e.target.value)}
                      className="w-24 h-7 text-right"
                    />
                  ) : (
                    <span className="text-muted-foreground">Rs {item.currentCost.toFixed(2)}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {editingId === item.id ? (
                    <Input
                      type="number"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-24 h-7 text-right"
                    />
                  ) : (
                    <span className="font-medium text-foreground">Rs {item.currentPrice.toFixed(2)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      item.margin >= 35 ? "bg-chart-green/10 text-chart-green border-chart-green/30" :
                        item.margin >= 30 ? "bg-chart-blue/10 text-chart-blue border-chart-blue/30" :
                          "bg-chart-orange/10 text-chart-orange border-chart-orange/30"
                    )}
                  >
                    {item.margin.toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.lastUpdated}</TableCell>
                <TableCell className="text-right">
                  {editingId === item.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSave(item.id)}>
                        <Check className="w-3.5 h-3.5 text-chart-green" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <Trash className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
