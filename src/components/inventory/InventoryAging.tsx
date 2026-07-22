import { useState } from "react";
import { Clock, Search, Download, Filter, AlertTriangle, TrendingUp } from "lucide-react";
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

interface AgingItem {
  id: string;
  partNo: string;
  description: string;
  category: string;
  quantity: number;
  value: number;
  receivedDate: string;
  lastMovement: string;
  ageDays: number;
  ageCategory: "0-30" | "31-60" | "61-90" | "90+";
}

const sampleData: AgingItem[] = [
  { id: "1", partNo: "ENG-001", description: "Engine oil filter", category: "Engine", quantity: 150, value: 3750, receivedDate: "2024-01-10", lastMovement: "2024-01-15", ageDays: 5, ageCategory: "0-30" },
  { id: "2", partNo: "BRK-002", description: "Front brake pads", category: "Brakes", quantity: 75, value: 6375, receivedDate: "2023-12-15", lastMovement: "2024-01-10", ageDays: 32, ageCategory: "31-60" },
  { id: "3", partNo: "SUS-003", description: "Shock absorber", category: "Suspension", quantity: 30, value: 3600, receivedDate: "2023-11-01", lastMovement: "2023-12-05", ageDays: 75, ageCategory: "61-90" },
  { id: "4", partNo: "ELC-004", description: "Alternator assembly", category: "Electrical", quantity: 12, value: 3000, receivedDate: "2023-09-15", lastMovement: "2023-10-20", ageDays: 122, ageCategory: "90+" },
  { id: "5", partNo: "FLT-005", description: "Air filter element", category: "Filters", quantity: 200, value: 3000, receivedDate: "2024-01-12", lastMovement: "2024-01-16", ageDays: 2, ageCategory: "0-30" },
  { id: "6", partNo: "OLD-001", description: "Obsolete part", category: "Misc", quantity: 50, value: 1500, receivedDate: "2023-06-01", lastMovement: "2023-06-15", ageDays: 228, ageCategory: "90+" },
];

export const InventoryAging = () => {
  const [items, setItems] = useState<AgingItem[]>(sampleData);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAge, setFilterAge] = useState<string>("all");

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAge = filterAge === "all" || item.ageCategory === filterAge;
    return matchesSearch && matchesAge;
  });

  const ageGroups = {
    "0-30": items.filter((i) => i.ageCategory === "0-30"),
    "31-60": items.filter((i) => i.ageCategory === "31-60"),
    "61-90": items.filter((i) => i.ageCategory === "61-90"),
    "90+": items.filter((i) => i.ageCategory === "90+"),
  };

  const getAgeValue = (category: keyof typeof ageGroups) =>
    ageGroups[category].reduce((sum, i) => sum + i.value, 0);

  const totalValue = items.reduce((sum, i) => sum + i.value, 0);

  const ageCategoryColors = {
    "0-30": "bg-chart-green/10 text-chart-green border-chart-green/30",
    "31-60": "bg-chart-blue/10 text-chart-blue border-chart-blue/30",
    "61-90": "bg-chart-orange/10 text-chart-orange border-chart-orange/30",
    "90+": "bg-destructive/10 text-destructive border-destructive/30",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Inventory Aging & Movement Tracking</h2>
          <p className="text-sm text-muted-foreground">Track inventory age and movement patterns</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="w-4 h-4" />
          Export Report
        </Button>
      </div>

      {/* Age Distribution Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">0-30 Days</span>
            <Badge variant="outline" className="text-xs bg-chart-green/10 text-chart-green border-chart-green/30">
              Fresh
            </Badge>
          </div>
          <p className="text-2xl font-semibold text-chart-green">Rs {getAgeValue("0-30").toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{ageGroups["0-30"].length} items</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-chart-green rounded-full"
              style={{ width: `${(getAgeValue("0-30") / totalValue) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">31-60 Days</span>
            <Badge variant="outline" className="text-xs bg-chart-blue/10 text-chart-blue border-chart-blue/30">
              Normal
            </Badge>
          </div>
          <p className="text-2xl font-semibold text-chart-blue">Rs {getAgeValue("31-60").toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{ageGroups["31-60"].length} items</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-chart-blue rounded-full"
              style={{ width: `${(getAgeValue("31-60") / totalValue) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">61-90 Days</span>
            <Badge variant="outline" className="text-xs bg-chart-orange/10 text-chart-orange border-chart-orange/30">
              Aging
            </Badge>
          </div>
          <p className="text-2xl font-semibold text-chart-orange">Rs {getAgeValue("61-90").toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{ageGroups["61-90"].length} items</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-chart-orange rounded-full"
              style={{ width: `${(getAgeValue("61-90") / totalValue) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">90+ Days</span>
            <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
              Critical
            </Badge>
          </div>
          <p className="text-2xl font-semibold text-destructive">Rs {getAgeValue("90+").toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{ageGroups["90+"].length} items</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-destructive rounded-full"
              style={{ width: `${(getAgeValue("90+") / totalValue) * 100}%` }}
            />
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
        <Select value={filterAge} onValueChange={setFilterAge}>
          <SelectTrigger className="w-40 h-9">
            <Clock className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Age Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ages</SelectItem>
            <SelectItem value="0-30">0-30 Days</SelectItem>
            <SelectItem value="31-60">31-60 Days</SelectItem>
            <SelectItem value="61-90">61-90 Days</SelectItem>
            <SelectItem value="90+">90+ Days</SelectItem>
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
              <TableHead className="text-xs font-medium text-right">Qty</TableHead>
              <TableHead className="text-xs font-medium text-right">Value</TableHead>
              <TableHead className="text-xs font-medium">Received Date</TableHead>
              <TableHead className="text-xs font-medium">Last Movement</TableHead>
              <TableHead className="text-xs font-medium text-right">Age (Days)</TableHead>
              <TableHead className="text-xs font-medium">Age Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item, index) => (
              <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                <ListNumberCell index={index} total={filteredItems.length} />
                <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-sm font-medium text-foreground text-right">{item.quantity}</TableCell>
                <TableCell className="text-sm font-medium text-foreground text-right">Rs {item.value.toLocaleString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.receivedDate}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.lastMovement}</TableCell>
                <TableCell className={cn(
                  "text-sm font-medium text-right",
                  item.ageDays > 90 ? "text-destructive" : item.ageDays > 60 ? "text-chart-orange" : "text-foreground"
                )}>
                  {item.ageDays}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs", ageCategoryColors[item.ageCategory])}>
                    {item.ageCategory} days
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {filteredItems.length} of {items.length} items</span>
        <div className="flex items-center gap-4">
          <span>Total Value: Rs {totalValue.toLocaleString()}</span>
          <span className="text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Critical (90+): Rs {getAgeValue("90+").toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
