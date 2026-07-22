import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Download, Star, TrendingUp, TrendingDown, Minus, Clock, Package, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface SupplierData {
  id: string;
  supplier: string;
  totalOrders: number;
  totalValue: number;
  onTimeDelivery: number; 
  qualityRating: number;
  avgDeliveryDays: number;
  defectRate: number;
  trend: "up" | "down" | "stable";
}

const SupplierPerformanceTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplier, setSupplier] = useState("all");

  const [supplierData, setSupplierData] = useState<SupplierData[]>([]);
  const [loading, setLoading] = useState(false);

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
        supplier_id: supplier !== "all" ? supplier : undefined,
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
    avgOnTime: supplierData.length > 0
      ? supplierData.reduce((sum, s) => sum + s.onTimeDelivery, 0) / supplierData.length
      : 0,
    avgQuality: supplierData.length > 0
      ? (supplierData.reduce((sum, s) => sum + s.qualityRating, 0) / supplierData.length).toFixed(1)
      : "0.0",
    totalPurchases: supplierData.reduce((sum, s) => sum + s.totalValue, 0),
  };

  const handleGenerateReport = fetchData;

  const handleExport = () => {
    if (supplierData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Supplier", "Total Orders", "Total Value", "On-Time Delivery", "Quality Rating", "Avg Delivery Days", "Defect Rate", "Trend"];
    const success = exportToCSV(supplierData, headers, `supplier-performance-${fromDate}-to-${toDate}.csv`);
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

  const getRatingStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star 
            key={i} 
            className={`w-3 h-3 ${i < fullStars ? "fill-warning text-warning" : "text-muted"}`} 
          />
        ))}
        <span className="text-sm ml-1">{rating}</span>
      </div>
    );
  };

  const getDeliveryBadge = (percentage: number) => {
    if (percentage >= 95) return <Badge className="bg-success/10 text-success border-0">{percentage}%</Badge>;
    if (percentage >= 85) return <Badge className="bg-info/10 text-info border-0">{percentage}%</Badge>;
    if (percentage >= 75) return <Badge className="bg-warning/10 text-warning border-0">{percentage}%</Badge>;
    return <Badge className="bg-destructive/10 text-destructive border-0">{percentage}%</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Supplier Performance</CardTitle>
              <p className="text-sm text-muted-foreground">Evaluate supplier quality, delivery, and reliability</p>
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
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {supplierData.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.supplier}</SelectItem>
                  ))}
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-primary">Total Suppliers</p>
            </div>
            <p className="text-2xl font-bold">{summaryData.totalSuppliers}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-success" />
              <p className="text-xs font-medium text-success">Avg On-Time</p>
            </div>
            <p className="text-2xl font-bold">{summaryData.avgOnTime}%</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-warning" />
              <p className="text-xs font-medium text-warning">Avg Quality</p>
            </div>
            <p className="text-2xl font-bold">{summaryData.avgQuality}/5</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-info" />
              <p className="text-xs font-medium text-info">Total Purchases</p>
            </div>
            <p className="text-2xl font-bold">Rs {(summaryData.totalPurchases / 1000000).toFixed(1)}M</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {supplierData.slice(0, 3).map((supplier) => (
          <Card key={supplier.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{supplier.supplier}</h3>
                {getTrendIcon(supplier.trend)}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">On-Time Delivery</span>
                    {getDeliveryBadge(supplier.onTimeDelivery)}
                  </div>
                  <Progress value={supplier.onTimeDelivery} className="h-2" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quality Rating</span>
                  {getRatingStars(supplier.qualityRating)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg Delivery</span>
                  <span className="font-medium">{supplier.avgDeliveryDays} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Orders</span>
                  <span className="font-medium">{supplier.totalOrders}</span>
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
              {supplierData.map((row, index) => (
                <TableRow key={row.id}>
                  <ListNumberCell index={index} total={supplierData.length} />
                  <TableCell className="font-medium">{row.supplier}</TableCell>
                  <TableCell className="text-center">{row.totalOrders}</TableCell>
                  <TableCell className="text-right">Rs {row.totalValue.toLocaleString()}</TableCell>
                  <TableCell className="text-center">{getDeliveryBadge(row.onTimeDelivery)}</TableCell>
                  <TableCell className="text-center">{getRatingStars(row.qualityRating)}</TableCell>
                  <TableCell className="text-center">{row.avgDeliveryDays}</TableCell>
                  <TableCell className={`text-center ${row.defectRate > 1 ? "text-destructive" : "text-success"}`}>
                    {row.defectRate}%
                  </TableCell>
                  <TableCell className="text-center">{getTrendIcon(row.trend)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SupplierPerformanceTab;
