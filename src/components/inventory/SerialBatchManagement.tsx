import { useState } from "react";
import { QrCode, Search, Plus, Eye, Edit2, Trash, Package } from "lucide-react";
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

interface SerialItem {
  id: string;
  partNo: string;
  serialNo: string;
  description: string;
  location: string;
  status: "Available" | "Sold" | "Reserved";
  receivedDate: string;
  expiryDate?: string;
}

interface BatchItem {
  id: string;
  partNo: string;
  batchNo: string;
  description: string;
  quantity: number;
  location: string;
  manufactureDate: string;
  expiryDate: string;
  status: "Active" | "Expired" | "Low";
}

const serialData: SerialItem[] = [
  { id: "1", partNo: "ENG-001", serialNo: "SN-2024-001", description: "Engine ECU", location: "Main Warehouse", status: "Available", receivedDate: "2024-01-10" },
  { id: "2", partNo: "ENG-001", serialNo: "SN-2024-002", description: "Engine ECU", location: "Main Warehouse", status: "Sold", receivedDate: "2024-01-10" },
  { id: "3", partNo: "TRM-001", serialNo: "SN-2024-003", description: "Transmission Unit", location: "Branch A", status: "Reserved", receivedDate: "2024-01-08" },
];

const batchData: BatchItem[] = [
  { id: "1", partNo: "OIL-001", batchNo: "BTH-2024-001", description: "Engine Oil 5W-30", quantity: 100, location: "Main Warehouse", manufactureDate: "2023-12-01", expiryDate: "2025-12-01", status: "Active" },
  { id: "2", partNo: "FLT-001", batchNo: "BTH-2024-002", description: "Oil Filter Set", quantity: 5, location: "Branch A", manufactureDate: "2023-11-15", expiryDate: "2025-11-15", status: "Low" },
  { id: "3", partNo: "BRK-001", batchNo: "BTH-2023-050", description: "Brake Fluid DOT4", quantity: 20, location: "Main Warehouse", manufactureDate: "2022-06-01", expiryDate: "2024-01-01", status: "Expired" },
];

export const SerialBatchManagement = () => {
  const [serials, setSerials] = useState<SerialItem[]>(serialData);
  const [batches, setBatches] = useState<BatchItem[]>(batchData);
  const [activeTab, setActiveTab] = useState<"serial" | "batch">("serial");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSerials = serials.filter((s) =>
    s.serialNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBatches = batches.filter((b) =>
    b.batchNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const serialStatusColors = {
    Available: "bg-chart-green/10 text-chart-green border-chart-green/30",
    Sold: "bg-muted text-muted-foreground border-border",
    Reserved: "bg-chart-blue/10 text-chart-blue border-chart-blue/30",
  };

  const batchStatusColors = {
    Active: "bg-chart-green/10 text-chart-green border-chart-green/30",
    Expired: "bg-destructive/10 text-destructive border-destructive/30",
    Low: "bg-chart-orange/10 text-chart-orange border-chart-orange/30",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Serial / Batch Management</h2>
          <p className="text-sm text-muted-foreground">Track serialized items and batch inventory</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add {activeTab === "serial" ? "Serial" : "Batch"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Serials</p>
              <p className="text-xl font-semibold text-foreground">{serials.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-chart-green/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-chart-green" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Available Serials</p>
              <p className="text-xl font-semibold text-chart-green">
                {serials.filter((s) => s.status === "Available").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-chart-blue/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-chart-blue" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Batches</p>
              <p className="text-xl font-semibold text-chart-blue">
                {batches.filter((b) => b.status === "Active").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Expired Batches</p>
              <p className="text-xl font-semibold text-destructive">
                {batches.filter((b) => b.status === "Expired").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="serial" className="text-xs gap-1.5">
              <QrCode className="w-3.5 h-3.5" />
              Serial Numbers
            </TabsTrigger>
            <TabsTrigger value="batch" className="text-xs gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Batch Numbers
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Serial Numbers Table */}
      {activeTab === "serial" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <ListNumberHeader />
                <TableHead className="text-xs font-medium">Serial No</TableHead>
                <TableHead className="text-xs font-medium">Part No</TableHead>
                <TableHead className="text-xs font-medium">Description</TableHead>
                <TableHead className="text-xs font-medium">Location</TableHead>
                <TableHead className="text-xs font-medium">Received Date</TableHead>
                <TableHead className="text-xs font-medium">Status</TableHead>
                <TableHead className="text-xs font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSerials.map((item, index) => (
                <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                  <ListNumberCell index={index} total={filteredSerials.length} />
                  <TableCell className="text-sm font-medium text-primary">{item.serialNo}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.location}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.receivedDate}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", serialStatusColors[item.status])}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Batch Numbers Table */}
      {activeTab === "batch" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <ListNumberHeader />
                <TableHead className="text-xs font-medium">Batch No</TableHead>
                <TableHead className="text-xs font-medium">Part No</TableHead>
                <TableHead className="text-xs font-medium">Description</TableHead>
                <TableHead className="text-xs font-medium text-right">Qty</TableHead>
                <TableHead className="text-xs font-medium">Location</TableHead>
                <TableHead className="text-xs font-medium">Mfg Date</TableHead>
                <TableHead className="text-xs font-medium">Expiry Date</TableHead>
                <TableHead className="text-xs font-medium">Status</TableHead>
                <TableHead className="text-xs font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.map((item, index) => (
                <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                  <ListNumberCell index={index} total={filteredBatches.length} />
                  <TableCell className="text-sm font-medium text-primary">{item.batchNo}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground text-right">{item.quantity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.location}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.manufactureDate}</TableCell>
                  <TableCell className={cn(
                    "text-sm",
                    item.status === "Expired" ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {item.expiryDate}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", batchStatusColors[item.status])}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
