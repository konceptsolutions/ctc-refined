import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { Download, Star, TrendingUp, TrendingDown, Minus, Clock, Package, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface SupplierData {
  id: string;
  supplier: string;
  totalOrders: number;
  totalValue: number;
  onTimeDelivery: number | null;
  qualityRating: number | null;
  avgDeliveryDays: number | null;
  defectRate: number | null;
  trend: "up" | "down" | "stable";
}

const unwrapList = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
};

const formatMoney = (n: number) =>
  `Rs ${Math.round(n).toLocaleString()}`;

const na = <span className="text-muted-foreground">N/A</span>;

const SupplierPerformanceTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<SearchableSelectOption[]>([]);

  const [supplierData, setSupplierData] = useState<SupplierData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.getSuppliers({ status: "active", limit: 5000 });
        setSupplierOptions(
          unwrapList(res)
            .map((s: any) => ({
              value: String(s.id),
              label: String(s.companyName || s.name || "").trim(),
            }))
            .filter((s: SearchableSelectOption) => s.value && s.label)
            .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
              a.label.localeCompare(b.label),
            ),
        );
      } catch {
        toast.error("Failed to load suppliers");
      }
    };
    load();
  }, []);

  const fetchData = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.getSupplierPerformance({
        from_date: fromDate,
        to_date: toDate,
        supplier_id: supplier || undefined,
      });

      if (response.data) {
        setSupplierData(response.data as SupplierData[]);
        toast.success("Supplier performance report generated");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summaryData = {
    totalSuppliers: supplierData.length,
    totalOrders: supplierData.reduce((sum, s) => sum + s.totalOrders, 0),
    totalPurchases: supplierData.reduce((sum, s) => sum + s.totalValue, 0),
    topSupplier:
      supplierData.length > 0
        ? supplierData.reduce((max, s) =>
            s.totalValue > max.totalValue ? s : max,
          ).supplier
        : "-",
  };

  const handleGenerateReport = fetchData;

  const handleExport = () => {
    if (supplierData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Supplier", "Total Orders", "Total Value", "Trend"];
    const rows = supplierData.map((s) => ({
      supplier: s.supplier,
      totalOrders: s.totalOrders,
      totalValue: s.totalValue,
      trend: s.trend,
    }));
    const success = exportToCSV(rows, headers, `supplier-performance-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="w-4 h-4 text-success" />;
      case "down": return <TrendingDown className="w-4 h-4 text-destructive" />;
      default: return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Supplier Performance</CardTitle>
              <p className="text-sm text-muted-foreground">Purchase volume by supplier (direct + import POs)</p>
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
              <Label>Supplier</Label>
              <SearchableSelect
                options={supplierOptions}
                value={supplier}
                onValueChange={setSupplier}
                placeholder="All Suppliers"
                maxDisplayedOptions={80}
                requireSearchAbove={5000}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerateReport} className="w-full" disabled={loading}>
                Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-primary">Suppliers</p>
            </div>
            <p className="text-2xl font-bold">{summaryData.totalSuppliers}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-success" />
              <p className="text-xs font-medium text-success">Total Orders</p>
            </div>
            <p className="text-2xl font-bold">{summaryData.totalOrders}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-info" />
              <p className="text-xs font-medium text-info">Total Purchases</p>
            </div>
            <p className="text-2xl font-bold">{formatMoney(summaryData.totalPurchases)}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-warning" />
              <p className="text-xs font-medium text-warning">Top Supplier</p>
            </div>
            <p className="text-lg font-bold truncate">{summaryData.topSupplier}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top suppliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {supplierData.slice(0, 3).map((s) => (
          <Card key={s.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{s.supplier}</h3>
                {getTrendIcon(s.trend)}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Orders</span>
                  <span className="font-medium">{s.totalOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchase value</span>
                  <span className="font-medium">{formatMoney(s.totalValue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Suppliers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>SUPPLIER</TableHead>
                <TableHead className="text-center">ORDERS</TableHead>
                <TableHead className="text-right">TOTAL VALUE</TableHead>
                <TableHead className="text-center">ON-TIME %</TableHead>
                <TableHead className="text-center">QUALITY</TableHead>
                <TableHead className="text-center">AVG DAYS</TableHead>
                <TableHead className="text-center">DEFECT %</TableHead>
                <TableHead className="text-center">TREND</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Select a date range and generate the report
                  </TableCell>
                </TableRow>
              ) : (
                supplierData.map((row, index) => (
                  <TableRow key={row.id}>
                    <ListNumberCell index={index} total={supplierData.length} />
                    <TableCell className="font-medium">{row.supplier}</TableCell>
                    <TableCell className="text-center">{row.totalOrders}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalValue)}</TableCell>
                    <TableCell className="text-center">
                      {row.onTimeDelivery == null ? na : `${row.onTimeDelivery}%`}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.qualityRating == null ? na : row.qualityRating}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.avgDeliveryDays == null ? na : row.avgDeliveryDays}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.defectRate == null ? na : `${row.defectRate}%`}
                    </TableCell>
                    <TableCell className="text-center">{getTrendIcon(row.trend)}</TableCell>
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

export default SupplierPerformanceTab;
