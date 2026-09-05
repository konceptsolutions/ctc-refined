import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Download, TrendingUp, TrendingDown, Minus, BarChart3, Table as TableIcon } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface BrandData {
  brand: string;
  avgSale: number;
  products: number;
  totalSales: number;
  purchases: number;
  profit: number;
  margin: number;
  trend: "rising" | "falling" | "stable";
}

const BrandWiseTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [brandOptions, setBrandOptions] = useState<SearchableSelectOption[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");

  const [brandData, setBrandData] = useState<BrandData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const response = await apiClient.getBrands(undefined, 10000);
        const rows = Array.isArray(response)
          ? response
          : (response as any).data || [];
        setBrandOptions(
          (Array.isArray(rows) ? rows : [])
            .map((b: any) => ({
              value: String(b.id),
              label: String(b.name || "").trim(),
            }))
            .filter((b: SearchableSelectOption) => b.value && b.label)
            .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
              a.label.localeCompare(b.label),
            ),
        );
      } catch {
        // keep empty; user can still run All Brands
      }
    };
    loadBrands();
  }, []);

  const fetchData = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.getBrandWise({
        from_date: fromDate,
        to_date: toDate,
        brand: brandFilter || undefined,
      });

      if (response.data) {
        setBrandData(response.data);
        toast.success("Brand report generated successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summaryData = {
    totalBrands: brandData.length,
    totalSales: brandData.reduce((sum, b) => sum + b.totalSales, 0),
    totalProfit: brandData.reduce((sum, b) => sum + b.profit, 0),
    avgMargin: brandData.length > 0 
      ? brandData.reduce((sum, b) => sum + b.margin, 0) / brandData.length
      : 0,
    stockValue: 0,
  };

  const handleGenerateReport = fetchData;

  const handleExport = () => {
    if (brandData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Brand", "Avg Sale", "Products", "Total Sales", "Purchases", "Profit", "Margin", "Trend"];
    const success = exportToCSV(brandData, headers, `brand-wise-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case "rising":
        return <span className="flex items-center gap-1 text-success"><TrendingUp className="w-3 h-3" /> Rising</span>;
      case "falling":
        return <span className="flex items-center gap-1 text-destructive"><TrendingDown className="w-3 h-3" /> Falling</span>;
      case "stable":
        return <span className="flex items-center gap-1 text-muted-foreground"><Minus className="w-3 h-3" /> Stable</span>;
      default:
        return <span>{trend}</span>;
    }
  };

  const getBrandInitial = (brand: string) => {
    return brand.charAt(0).toUpperCase();
  };

  const getBrandColor = (index: number) => {
    const colors = [
      "bg-primary text-primary-foreground",
      "bg-info text-info-foreground",
      "bg-success text-success-foreground",
      "bg-warning text-warning-foreground",
      "bg-chart-purple text-white",
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Brand Wise Report</CardTitle>
              <p className="text-sm text-muted-foreground">Analyze sales, purchases, and performance by brand</p>
            </div>
            <div className="flex gap-2">
              <div className="flex border rounded-md">
                <Button 
                  variant={viewMode === "table" ? "default" : "ghost"} 
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="rounded-r-none"
                >
                  <TableIcon className="w-4 h-4" />
                </Button>
                <Button 
                  variant={viewMode === "chart" ? "default" : "ghost"} 
                  size="sm"
                  onClick={() => setViewMode("chart")}
                  className="rounded-l-none"
                >
                  <BarChart3 className="w-4 h-4" />
                </Button>
              </div>
              <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
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
              <Label>Brand</Label>
              <SearchableSelect
                options={brandOptions}
                value={brandFilter}
                onValueChange={setBrandFilter}
                placeholder="All Brands"
                maxDisplayedOptions={80}
                requireSearchAbove={5000}
              />
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
            <p className="text-xs font-medium text-primary">Total Brands</p>
            <p className="text-2xl font-bold mt-1">{summaryData.totalBrands}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">Total Sales</p>
            <p className="text-2xl font-bold mt-1">Rs {(summaryData.totalSales / 1000000).toFixed(2)}M</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Total Profit</p>
            <p className="text-2xl font-bold mt-1">Rs {summaryData.totalProfit.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-warning">Avg Margin</p>
            <p className="text-2xl font-bold mt-1">{summaryData.avgMargin}%</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive">Stock Value</p>
            <p className="text-2xl font-bold mt-1">Rs {(summaryData.stockValue / 1000000).toFixed(2)}M</p>
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
                <TableHead>BRAND</TableHead>
                <TableHead className="text-center">PRODUCTS</TableHead>
                <TableHead className="text-right">TOTAL SALES</TableHead>
                <TableHead className="text-right">PURCHASES</TableHead>
                <TableHead className="text-right">PROFIT</TableHead>
                <TableHead className="text-center">MARGIN</TableHead>
                <TableHead className="text-center">TREND</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandData.map((brand, index) => (
                <TableRow key={brand.brand}>
                  <ListNumberCell index={index} total={brandData.length} />
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getBrandColor(index)}`}>
                        {getBrandInitial(brand.brand)}
                      </div>
                      <div>
                        <p className="font-medium">{brand.brand}</p>
                        <p className="text-xs text-muted-foreground">Avg: Rs {brand.avgSale.toLocaleString()}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{brand.products}</TableCell>
                  <TableCell className="text-right font-medium">Rs {brand.totalSales.toLocaleString()}</TableCell>
                  <TableCell className="text-right">Rs {brand.purchases.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-success font-medium">Rs {brand.profit.toLocaleString()}</TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-success/10 text-success border-0">{brand.margin}%</Badge>
                  </TableCell>
                  <TableCell className="text-center">{getTrendBadge(brand.trend)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BrandWiseTab;
