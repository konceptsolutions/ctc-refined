import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Download, Printer, TrendingUp, TrendingDown, Minus, Info, AlertTriangle, RefreshCw, Bell } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportTableToCSV, printReport } from "@/utils/exportUtils";
import { useEffect } from "react";

type MovementFilter = "all" | "fast" | "slow" | "dead";

interface StockItem {
  id: string; 
  partNumber: string;
  name: string;
  brand: string;
  category: string;
  stock: number;
  avgMonthly: number;
  lastSale: string;
  stockValue: number;
  turnover: number;
  status: "fast" | "slow" | "dead";
  recommendation: string;
}

const StockMovementTab = () => {
  const [filter, setFilter] = useState<MovementFilter>("all");
  const [period, setPeriod] = useState("30");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getStockMovement({
        period,
        category: category !== "all" ? category : undefined,
        brand: brand !== "all" ? brand : undefined,
      });

      if (response.data) {
        setStockData(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, category, brand]);

  const summaryData = {
    totalValue: stockData.reduce((sum, item) => sum + item.stockValue, 0),
    deadStock: stockData.filter(item => item.status === "dead").reduce((sum, item) => sum + item.stockValue, 0),
    deadPercentage: stockData.length > 0 
      ? (stockData.filter(item => item.status === "dead").length / stockData.length * 100)
      : 0,
    turnoverRatio: stockData.length > 0
      ? stockData.reduce((sum, item) => sum + item.turnover, 0) / stockData.length
      : 0,
    needingAction: stockData.filter(item => item.status === "slow" || item.status === "dead").length,
  };

  const pieData = [
    { name: "Fast Moving", value: 0, color: "hsl(var(--success))" },
    { name: "Slow Moving", value: 0, color: "hsl(var(--warning))" },
    { name: "Dead Stock", value: 0, color: "hsl(var(--destructive))" },
  ];

  const filteredData = filter === "all" 
    ? stockData 
    : stockData.filter(item => item.status === filter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "fast":
        return <Badge className="bg-success/10 text-success border-0"><TrendingUp className="w-3 h-3 mr-1" />Fast Moving</Badge>;
      case "slow":
        return <Badge className="bg-warning/10 text-warning border-0"><Minus className="w-3 h-3 mr-1" />Slow Moving</Badge>;
      case "dead":
        return <Badge className="bg-destructive/10 text-destructive border-0"><TrendingDown className="w-3 h-3 mr-1" />Dead Stock</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleExport = () => {
    if (stockData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const success = exportTableToCSV("stock-movement-table", `stock-movement-${period}days.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const handlePrint = () => {
    printReport("Stock Movement Report");
  };

  const handleApplyFilters = () => {
    fetchData();
    toast.success("Filters applied");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Stock Movement Report</CardTitle>
              <p className="text-sm text-muted-foreground">Identify fast, slow, and dead stock items</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button 
              variant={filter === "all" ? "default" : "outline"} 
              size="sm"
              onClick={() => setFilter("all")}
            >
              All Items ({stockData.length})
            </Button>
            <Button 
              variant={filter === "fast" ? "default" : "outline"} 
              size="sm"
              onClick={() => setFilter("fast")}
              className={filter === "fast" ? "bg-success hover:bg-success/90" : "text-success border-success/30"}
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              Fast Moving ({stockData.filter(item => item.status === "fast").length})
            </Button>
            <Button 
              variant={filter === "slow" ? "default" : "outline"} 
              size="sm"
              onClick={() => setFilter("slow")}
              className={filter === "slow" ? "bg-warning hover:bg-warning/90" : "text-warning border-warning/30"}
            >
              <Minus className="w-3 h-3 mr-1" />
              Slow Moving ({stockData.filter(item => item.status === "slow").length})
            </Button>
            <Button 
              variant={filter === "dead" ? "default" : "outline"} 
              size="sm"
              onClick={() => setFilter("dead")}
              className={filter === "dead" ? "bg-destructive hover:bg-destructive/90" : "text-destructive border-destructive/30"}
            >
              <TrendingDown className="w-3 h-3 mr-1" />
              Dead Stock ({stockData.filter(item => item.status === "dead").length})
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Analysis Period</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="60">Last 60 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="brakes">Brakes</SelectItem>
                  <SelectItem value="filters">Filters</SelectItem>
                  <SelectItem value="ignition">Ignition</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Brand</label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger>
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  <SelectItem value="toyota">Toyota</SelectItem>
                  <SelectItem value="honda">Honda</SelectItem>
                  <SelectItem value="suzuki">Suzuki</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleApplyFilters} className="w-full">
                Apply Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Stock Value</p>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">Rs {summaryData.totalValue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Dead Stock Value</p>
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <p className="text-2xl font-bold mt-1 text-destructive">Rs {summaryData.deadStock.toLocaleString()}</p>
            <p className="text-xs text-destructive">{summaryData.deadPercentage}% of total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Avg Turnover Ratio</p>
              <RefreshCw className="w-4 h-4 text-info" />
            </div>
            <p className="text-2xl font-bold mt-1 text-info">{summaryData.turnoverRatio}x</p>
            <p className="text-xs text-muted-foreground">per year</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Items Needing Action</p>
              <Bell className="w-4 h-4 text-warning" />
            </div>
            <p className="text-2xl font-bold mt-1 text-warning">{summaryData.needingAction}</p>
            <p className="text-xs text-muted-foreground">slow + dead stock</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart & Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stock Distribution by Movement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center -mt-24">
                <p className="text-2xl font-bold">10</p>
                <p className="text-xs text-muted-foreground">Items</p>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{item.value} items</p>
                    <p className="text-xs text-muted-foreground">{(item.value / 10 * 100).toFixed(0)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table id="stock-movement-table">
            <TableHeader>
              <TableRow>
                <TableHead>PART DETAILS</TableHead>
                <TableHead>CATEGORY</TableHead>
                <TableHead className="text-center">STOCK</TableHead>
                <TableHead className="text-center">AVG MONTHLY</TableHead>
                <TableHead>LAST SALE</TableHead>
                <TableHead className="text-right">STOCK VALUE</TableHead>
                <TableHead className="text-center">TURNOVER</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead>RECOMMENDATION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <p className="text-muted-foreground">Loading data...</p>
                  </TableCell>
                </TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <p className="text-muted-foreground">No data available</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-primary">{item.partNumber}</p>
                      <p className="text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.brand}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.category}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">{item.stock}</TableCell>
                  <TableCell className="text-center">{item.avgMonthly}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{item.lastSale}</p>
                      <p className="text-xs text-muted-foreground">2 days ago</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">Rs {item.stockValue.toLocaleString()}</TableCell>
                  <TableCell className="text-center text-info font-medium">{item.turnover}x</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.recommendation}</TableCell>
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

export default StockMovementTab;
