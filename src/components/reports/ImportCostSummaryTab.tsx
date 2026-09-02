import { useState } from "react";
import { formatUiDate } from "@/utils/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Download, Truck, DollarSign, Percent, Package } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface ImportRecord {
  id: string;
  date: string;
  lcNumber: string;
  supplier: string;
  country: string; 
  fobValue: number;
  freight: number;
  insurance: number;
  duties: number;
  totalCost: number;
  items: number;
}

const ImportCostSummaryTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [country, setCountry] = useState("all");
  const [importData, setImportData] = useState<ImportRecord[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  const mockImportData: ImportRecord[] = [
    { id: "1", date: "2024-12-20", lcNumber: "LC-2024-0089", supplier: "Toyota Japan", country: "Japan", fobValue: 850000, freight: 45000, insurance: 8500, duties: 125000, totalCost: 1028500, items: 125 },
    { id: "2", date: "2024-12-15", lcNumber: "LC-2024-0088", supplier: "Denso Thailand", country: "Thailand", fobValue: 520000, freight: 28000, insurance: 5200, duties: 78000, totalCost: 631200, items: 85 },
    { id: "3", date: "2024-12-10", lcNumber: "LC-2024-0087", supplier: "Bosch Germany", country: "Germany", fobValue: 680000, freight: 52000, insurance: 6800, duties: 102000, totalCost: 840800, items: 95 },
    { id: "4", date: "2024-12-05", lcNumber: "LC-2024-0086", supplier: "NGK Japan", country: "Japan", fobValue: 320000, freight: 22000, insurance: 3200, duties: 48000, totalCost: 393200, items: 200 },
  ];

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      const response = await apiClient.getImportCostSummary({
        from_date: fromDate,
        to_date: toDate,
        country: country !== "all" ? country : undefined,
      });

      if (response.data && response.data.records) {
        setImportData(response.data.records);
        setIsGenerated(true);
        toast.success("Import cost report generated");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handleExport = () => {
    if (importData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Date", "LC Number", "Supplier", "Country", "FOB Value", "Freight", "Insurance", "Duties", "Total Cost", "Items"];
    const success = exportToCSV(importData, headers, `import-cost-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const totalFOB = importData.reduce((sum, r) => sum + r.fobValue, 0);
  const totalFreight = importData.reduce((sum, r) => sum + r.freight, 0);
  const totalDuties = importData.reduce((sum, r) => sum + r.duties, 0);
  const totalLandedCost = importData.reduce((sum, r) => sum + r.totalCost, 0);
  const avgLandingCost = totalLandedCost > 0 ? ((totalLandedCost - totalFOB) / totalFOB * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Import Cost Summary</CardTitle>
              <p className="text-sm text-muted-foreground">Analyze landed costs and import expenses</p>
            </div>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input 
                type="date" 
                value={fromDate} 
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input 
                type="date" 
                value={toDate} 
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  <SelectItem value="japan">Japan</SelectItem>
                  <SelectItem value="thailand">Thailand</SelectItem>
                  <SelectItem value="germany">Germany</SelectItem>
                  <SelectItem value="china">China</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerateReport} className="w-full">
                Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-primary">Total FOB Value</p>
            </div>
            <p className="text-xl font-bold">Rs {totalFOB.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4 text-info" />
              <p className="text-xs font-medium text-info">Total Freight</p>
            </div>
            <p className="text-xl font-bold">Rs {totalFreight.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-warning" />
              <p className="text-xs font-medium text-warning">Total Duties</p>
            </div>
            <p className="text-xl font-bold">Rs {totalDuties.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-success" />
              <p className="text-xs font-medium text-success">Total Landed Cost</p>
            </div>
            <p className="text-xl font-bold">Rs {totalLandedCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-chart-purple/5 border-chart-purple/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="w-4 h-4 text-chart-purple" />
              <p className="text-xs font-medium text-chart-purple">Avg Landing %</p>
            </div>
            <p className="text-xl font-bold">{avgLandingCost}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>DATE</TableHead>
                <TableHead>LC NUMBER</TableHead>
                <TableHead>SUPPLIER</TableHead>
                <TableHead>COUNTRY</TableHead>
                <TableHead className="text-right">FOB VALUE</TableHead>
                <TableHead className="text-right">FREIGHT</TableHead>
                <TableHead className="text-right">DUTIES</TableHead>
                <TableHead className="text-right">TOTAL COST</TableHead>
                <TableHead className="text-center">ITEMS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Truck className="w-10 h-10 opacity-50" />
                      <p>No import records found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                importData.map((record, index) => (
                  <TableRow key={record.id}>
                    <ListNumberCell index={index} total={importData.length} />
                    <TableCell>{formatUiDate(record.date) || record.date}</TableCell>
                    <TableCell className="font-medium text-primary">{record.lcNumber}</TableCell>
                    <TableCell>{record.supplier}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.country}</Badge>
                    </TableCell>
                    <TableCell className="text-right">Rs {record.fobValue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">Rs {record.freight.toLocaleString()}</TableCell>
                    <TableCell className="text-right">Rs {record.duties.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">Rs {record.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{record.items}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportCostSummaryTab;
