import { useState, useEffect, useMemo, useTransition, memo, useCallback } from "react";
import { formatUiDate } from "@/utils/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  AlertTriangle,
  RefreshCw,
  Bell,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV, printReport } from "@/utils/exportUtils";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";

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
  daysSinceSale?: number | null;
  stockValue: number;
  turnover: number;
  status: "fast" | "slow" | "dead";
  recommendation: string;
}

const PAGE_SIZE = 50;

const formatDaysAgo = (item: StockItem) => {
  if (item.lastSale === "Never" || item.daysSinceSale == null) {
    return "No sales in period";
  }
  if (item.daysSinceSale === 0) return "Today";
  if (item.daysSinceSale === 1) return "1 day ago";
  return `${item.daysSinceSale} days ago`;
};

const StatusBadge = memo(function StatusBadge({
  status,
}: {
  status: StockItem["status"];
}) {
  switch (status) {
    case "fast":
      return (
        <Badge className="bg-success/10 text-success border-0">
          <TrendingUp className="w-3 h-3 mr-1" />
          Fast Moving
        </Badge>
      );
    case "slow":
      return (
        <Badge className="bg-warning/10 text-warning border-0">
          <Minus className="w-3 h-3 mr-1" />
          Slow Moving
        </Badge>
      );
    case "dead":
      return (
        <Badge className="bg-destructive/10 text-destructive border-0">
          <TrendingDown className="w-3 h-3 mr-1" />
          Dead Stock
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
});

const StockRow = memo(function StockRow({
  item,
  index,
  total,
  page,
  pageSize,
}: {
  item: StockItem;
  index: number;
  total: number;
  page: number;
  pageSize: number;
}) {
  return (
    <TableRow>
      <ListNumberCell
        index={index}
        total={total}
        page={page}
        pageSize={pageSize}
      />
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
          <p>
            {item.lastSale === "Never"
              ? "Never"
              : formatUiDate(item.lastSale) || item.lastSale}
          </p>
          <p className="text-xs text-muted-foreground">{formatDaysAgo(item)}</p>
        </div>
      </TableCell>
      <TableCell className="text-right">
        Rs {Math.round(item.stockValue).toLocaleString()}
      </TableCell>
      <TableCell className="text-center text-info font-medium">
        {Number(item.turnover).toFixed(2)}x
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.recommendation}
      </TableCell>
    </TableRow>
  );
});

const StockMovementTab = () => {
  const [filter, setFilter] = useState<MovementFilter>("all");
  const [period, setPeriod] = useState("30");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [appliedPeriod, setAppliedPeriod] = useState("30");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [appliedBrand, setAppliedBrand] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<SearchableSelectOption[]>(
    [],
  );
  const [brandOptions, setBrandOptions] = useState<SearchableSelectOption[]>([]);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [catsRes, brandsRes] = await Promise.all([
          apiClient.getCategories(),
          apiClient.getBrands(undefined, 10000),
        ]);

        const unwrap = (res: any): any[] => {
          if (Array.isArray(res)) return res;
          if (Array.isArray(res?.data)) return res.data;
          if (Array.isArray(res?.data?.data)) return res.data.data;
          return [];
        };

        const catRows = unwrap(catsRes);
        const brandRows = unwrap(brandsRes);

        setCategoryOptions(
          catRows
            .map((c: any) => ({
              value: String(c.id ?? c.value ?? ""),
              label: String(c.name ?? c.label ?? "").trim(),
            }))
            .filter((c: SearchableSelectOption) => c.value && c.label)
            .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
              a.label.localeCompare(b.label),
            ),
        );
        setBrandOptions(
          brandRows
            .map((b: any) => ({
              value: String(b.id ?? b.value ?? ""),
              label: String(b.name ?? b.label ?? "").trim(),
            }))
            .filter((b: SearchableSelectOption) => b.value && b.label)
            .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
              a.label.localeCompare(b.label),
            ),
        );
      } catch {
        toast.error("Failed to load category/brand filters");
      }
    };
    loadFilters();
  }, []);

  const fetchData = useCallback(async (opts: {
    period: string;
    category: string;
    brand: string;
  }) => {
    try {
      setLoading(true);
      const response = await apiClient.getStockMovement({
        period: opts.period,
        category: opts.category || undefined,
        brand: opts.brand || undefined,
      });

      if (response.data) {
        setStockData(response.data);
        setPage(1);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData({
      period: appliedPeriod,
      category: appliedCategory,
      brand: appliedBrand,
    });
  }, [appliedPeriod, appliedCategory, appliedBrand, fetchData]);

  const statusBuckets = useMemo(() => {
    const fast: StockItem[] = [];
    const slow: StockItem[] = [];
    const dead: StockItem[] = [];
    for (const item of stockData) {
      if (item.status === "fast") fast.push(item);
      else if (item.status === "slow") slow.push(item);
      else dead.push(item);
    }
    return { all: stockData, fast, slow, dead };
  }, [stockData]);

  const statusCounts = useMemo(
    () => ({
      all: statusBuckets.all.length,
      fast: statusBuckets.fast.length,
      slow: statusBuckets.slow.length,
      dead: statusBuckets.dead.length,
    }),
    [statusBuckets],
  );

  const summaryData = useMemo(() => {
    let totalValue = 0;
    let deadStock = 0;
    let turnoverSum = 0;
    for (const item of stockData) {
      totalValue += item.stockValue || 0;
      turnoverSum += item.turnover || 0;
      if (item.status === "dead") deadStock += item.stockValue || 0;
    }
    return {
      totalValue,
      deadStock,
      deadPercentage: totalValue > 0 ? (deadStock / totalValue) * 100 : 0,
      turnoverRatio: stockData.length > 0 ? turnoverSum / stockData.length : 0,
      needingAction: statusCounts.slow + statusCounts.dead,
    };
  }, [stockData, statusCounts]);

  const pieData = useMemo(
    () => [
      {
        name: "Fast Moving",
        value: statusCounts.fast,
        color: "hsl(var(--success))",
      },
      {
        name: "Slow Moving",
        value: statusCounts.slow,
        color: "hsl(var(--warning))",
      },
      {
        name: "Dead Stock",
        value: statusCounts.dead,
        color: "hsl(var(--destructive))",
      },
    ],
    [statusCounts],
  );

  const filteredData = statusBuckets[filter];

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, safePage]);

  const handleStatusFilter = (next: MovementFilter) => {
    startTransition(() => {
      setFilter(next);
      setPage(1);
    });
  };

  const handleApplyFilters = () => {
    setAppliedPeriod(period);
    setAppliedCategory(category);
    setAppliedBrand(brand);
    setFilter("all");
    setPage(1);
    toast.success("Filters applied");
  };

  const handleExport = () => {
    if (filteredData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const rows = filteredData.map((item) => ({
      part_number: item.partNumber,
      name: item.name,
      brand: item.brand,
      category: item.category,
      stock: item.stock,
      avg_monthly: item.avgMonthly,
      last_sale: item.lastSale,
      stock_value: item.stockValue,
      turnover: item.turnover,
      status: item.status,
      recommendation: item.recommendation,
    }));
    const headers = [
      "Part Number",
      "Name",
      "Brand",
      "Category",
      "Stock",
      "Avg Monthly",
      "Last Sale",
      "Stock Value",
      "Turnover",
      "Status",
      "Recommendation",
    ];
    const success = exportToCSV(
      rows,
      headers,
      `stock-movement-${filter}-${appliedPeriod}days.csv`,
    );
    if (success) toast.success("Report exported successfully");
    else toast.error("Failed to export report");
  };

  const handlePrint = () => {
    printReport("Stock Movement Report");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Stock Movement Report</CardTitle>
              <p className="text-sm text-muted-foreground">
                Identify fast, slow, and dead stock items
              </p>
            </div>
            <div className="flex gap-2">
              <PrintPdfButton onPrint={handlePrint} label="Print" />
              <Button
                onClick={handleExport}
                className="bg-primary hover:bg-primary/90"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilter("all")}
            >
              All Items ({statusCounts.all})
            </Button>
            <Button
              variant={filter === "fast" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilter("fast")}
              className={
                filter === "fast"
                  ? "bg-success hover:bg-success/90"
                  : "text-success border-success/30"
              }
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              Fast Moving ({statusCounts.fast})
            </Button>
            <Button
              variant={filter === "slow" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilter("slow")}
              className={
                filter === "slow"
                  ? "bg-warning hover:bg-warning/90"
                  : "text-warning border-warning/30"
              }
            >
              <Minus className="w-3 h-3 mr-1" />
              Slow Moving ({statusCounts.slow})
            </Button>
            <Button
              variant={filter === "dead" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilter("dead")}
              className={
                filter === "dead"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "text-destructive border-destructive/30"
              }
            >
              <TrendingDown className="w-3 h-3 mr-1" />
              Dead Stock ({statusCounts.dead})
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Analysis Period
              </Label>
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
              <Label className="text-sm text-muted-foreground">Category</Label>
              <SearchableSelect
                options={categoryOptions}
                value={category}
                onValueChange={setCategory}
                placeholder="All Categories"
                maxDisplayedOptions={80}
                requireSearchAbove={5000}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Brand</Label>
              <SearchableSelect
                options={brandOptions}
                value={brand}
                onValueChange={setBrand}
                placeholder="All Brands"
                maxDisplayedOptions={80}
                requireSearchAbove={5000}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleApplyFilters}
                className="w-full"
                disabled={loading}
              >
                {loading ? "Loading..." : "Apply Filters"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Stock Value</p>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">
              Rs {Math.round(summaryData.totalValue).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Dead Stock Value</p>
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <p className="text-2xl font-bold mt-1 text-destructive">
              Rs {Math.round(summaryData.deadStock).toLocaleString()}
            </p>
            <p className="text-xs text-destructive">
              {summaryData.deadPercentage.toFixed(1)}% of total value
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Avg Turnover Ratio</p>
              <RefreshCw className="w-4 h-4 text-info" />
            </div>
            <p className="text-2xl font-bold mt-1 text-info">
              {summaryData.turnoverRatio.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground">per year</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Items Needing Action</p>
              <Bell className="w-4 h-4 text-warning" />
            </div>
            <p className="text-2xl font-bold mt-1 text-warning">
              {summaryData.needingAction}
            </p>
            <p className="text-xs text-muted-foreground">slow + dead stock</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Stock Distribution by Movement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-48 h-48 relative">
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
                    isAnimationActive={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-2xl font-bold">{statusCounts.all}</p>
                <p className="text-xs text-muted-foreground">Items</p>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {pieData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{item.value} items</p>
                    <p className="text-xs text-muted-foreground">
                      {statusCounts.all > 0
                        ? `${((item.value / statusCounts.all) * 100).toFixed(0)}%`
                        : "0%"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            {filteredData.length === 0
              ? 0
              : (safePage - 1) * PAGE_SIZE + 1}
            –
            {Math.min(safePage * PAGE_SIZE, filteredData.length)} of{" "}
            {filteredData.length}
            {isPending ? " (updating…)" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm tabular-nums">
              Page {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          <Table id="stock-movement-table">
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
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
                  <TableCell colSpan={10} className="text-center py-8">
                    <p className="text-muted-foreground">Loading data...</p>
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <p className="text-muted-foreground">No data available</p>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((item, index) => (
                  <StockRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={filteredData.length}
                    page={safePage}
                    pageSize={PAGE_SIZE}
                  />
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
