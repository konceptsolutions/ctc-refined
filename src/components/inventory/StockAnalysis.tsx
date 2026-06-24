import { useState, useMemo, useEffect } from "react";
import { TrendingUp, BarChart2, Clock, Ban, Search, Download, Printer, Settings } from "lucide-react";
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
import {
  ListNumberHeader,
  ListNumberCell,
  getListRowNumber,
  LIST_NUMBER_HEAD_CLASS,
  LIST_NUMBER_CELL_CLASS,
} from "@/components/ui/list-table-number";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/api";
import { toast } from "sonner";

interface StockItem {
  id: string;
  partNo: string;
  description: string;
  category: string; 
  quantity: number;
  value: number;
  daysIdle: number;
  turnover: number;
  classification: "Fast" | "Normal" | "Slow" | "Dead";
}

type Classification = "Fast" | "Normal" | "Slow" | "Dead";

export const StockAnalysis = () => {
  // Configuration state
  const [fastMovingDays, setFastMovingDays] = useState(30);
  const [slowMovingDays, setSlowMovingDays] = useState(90);
  const [deadStockDays, setDeadStockDays] = useState(180);
  const [analysisPeriod, setAnalysisPeriod] = useState(6);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"All" | Classification>("All");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Data state
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch stock analysis data
  const fetchStockAnalysis = async () => {
    try {
      setLoading(true);
      const params: any = {
        fast_moving_days: fastMovingDays,
        slow_moving_days: slowMovingDays,
        dead_stock_days: deadStockDays,
        analysis_period: analysisPeriod,
      };

      if (searchTerm) {
        params.search = searchTerm;
      }

      if (categoryFilter && categoryFilter !== "all") {
        params.category = categoryFilter;
      }

      if (activeTab && activeTab !== "All") {
        params.classification = activeTab;
      }

      const result = await apiClient.getStockAnalysis(params);

      if (result.error) {
        toast.error(result.error);
        setStockData([]);
        return;
      }

      const data = result.data || [];
      setStockData(data);

      // Extract unique categories
      const uniqueCategories = [...new Set(data.map((item: StockItem) => item.category))].sort();
      setCategories(uniqueCategories);
    } catch (error: any) {
      toast.error('Failed to fetch stock analysis data');
      setStockData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when configuration or filters change
  useEffect(() => {
    fetchStockAnalysis();
  }, [fastMovingDays, slowMovingDays, deadStockDays, analysisPeriod, searchTerm, categoryFilter, activeTab]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalValue = stockData.reduce((sum, item) => sum + item.value, 0);
    const fastItems = stockData.filter(i => i.classification === "Fast");
    const normalItems = stockData.filter(i => i.classification === "Normal");
    const slowItems = stockData.filter(i => i.classification === "Slow");
    const deadItems = stockData.filter(i => i.classification === "Dead");

    return {
      fast: {
        count: fastItems.length,
        value: fastItems.reduce((sum, i) => sum + i.value, 0),
        percentage: totalValue > 0 ? ((fastItems.reduce((sum, i) => sum + i.value, 0) / totalValue) * 100).toFixed(1) : "0",
      },
      normal: {
        count: normalItems.length,
        value: normalItems.reduce((sum, i) => sum + i.value, 0),
        percentage: totalValue > 0 ? ((normalItems.reduce((sum, i) => sum + i.value, 0) / totalValue) * 100).toFixed(1) : "0",
      },
      slow: {
        count: slowItems.length,
        value: slowItems.reduce((sum, i) => sum + i.value, 0),
        percentage: totalValue > 0 ? ((slowItems.reduce((sum, i) => sum + i.value, 0) / totalValue) * 100).toFixed(1) : "0",
      },
      dead: {
        count: deadItems.length,
        value: deadItems.reduce((sum, i) => sum + i.value, 0),
        percentage: totalValue > 0 ? ((deadItems.reduce((sum, i) => sum + i.value, 0) / totalValue) * 100).toFixed(1) : "0",
      },
    };
  }, [stockData]);

  // Filter items (already filtered by API, but keep for client-side if needed)
  const filteredItems = useMemo(() => {
    return stockData;
  }, [stockData]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  // Reset page when filters change
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleCategoryChange = (category: string) => {
    setCategoryFilter(category);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Export functions
  const handleExportCSV = () => {
    const headers = ["SR", "Part No", "Description", "Category", "Quantity", "Value (Rs)", "Days Idle", "Turnover", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredItems.map((item, index) => 
        [
          index + 1,
          item.partNo,
          `"${item.description}"`,
          `"${item.category}"`,
          item.quantity,
          item.value,
          item.daysIdle,
          `${item.turnover}/mo`,
          item.classification
        ].join(",")
      ),
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-analysis-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const handlePrintPDF = () => {
    // Create a print-friendly version
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stock Movement Analysis Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
            .card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .fast { background-color: #d1fae5; }
            .normal { background-color: #dbeafe; }
            .slow { background-color: #fed7aa; }
            .dead { background-color: #fee2e2; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Stock Movement Analysis Report</h1>
          <p>Generated on: ${new Date().toLocaleString()}</p>
          <p><strong>Configuration:</strong> Fast Moving: ≤${fastMovingDays} days, Slow Moving: ≥${slowMovingDays} days, Dead Stock: ≥${deadStockDays} days, Analysis Period: ${analysisPeriod} months</p>
          
          <div class="summary">
            <div class="card">
              <h3>Fast Moving</h3>
              <p>Count: ${stats.fast.count}</p>
              <p>Value: ${formatCurrency(stats.fast.value)}</p>
              <p>${stats.fast.percentage}% of total</p>
            </div>
            <div class="card">
              <h3>Normal Moving</h3>
              <p>Count: ${stats.normal.count}</p>
              <p>Value: ${formatCurrency(stats.normal.value)}</p>
              <p>${stats.normal.percentage}% of total</p>
            </div>
            <div class="card">
              <h3>Slow Moving</h3>
              <p>Count: ${stats.slow.count}</p>
              <p>Value: ${formatCurrency(stats.slow.value)}</p>
              <p>${stats.slow.percentage}% of total</p>
            </div>
            <div class="card">
              <h3>Dead Stock</h3>
              <p>Count: ${stats.dead.count}</p>
              <p>Value: ${formatCurrency(stats.dead.value)}</p>
              <p>${stats.dead.percentage}% of total</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="w-12 min-w-[3rem] text-center text-xs font-medium whitespace-nowrap">#</th>
                <th>Part No</th>
                <th>Description</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Value (Rs)</th>
                <th>Days Idle</th>
                <th>Turnover</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map((item, index) => `
                <tr class="${item.classification.toLowerCase()}">
                  <td>${index + 1}</td>
                  <td>${item.partNo}</td>
                  <td>${item.description}</td>
                  <td>${item.category}</td>
                  <td>${item.quantity}</td>
                  <td>${formatCurrency(item.value)}</td>
                  <td>${item.daysIdle}</td>
                  <td>${item.turnover}/mo</td>
                  <td>${item.classification}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
    toast.success("Print dialog opened");
  };

  const classificationColors: Record<Classification, string> = {
    Fast: "bg-emerald-50 text-emerald-600 border-emerald-200",
    Normal: "bg-blue-50 text-blue-600 border-blue-200",
    Slow: "bg-amber-50 text-amber-600 border-amber-200",
    Dead: "bg-red-50 text-red-600 border-red-200",
  };

  const formatCurrency = (value: number) => {
    return `Rs ${value.toLocaleString("en-PK")}.00`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Stock Movement Analysis</h2>
            <p className="text-sm text-muted-foreground">Fast, Slow, and Dead Stock Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV} disabled={loading || filteredItems.length === 0}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-primary border-primary hover:bg-primary/10" onClick={handlePrintPDF} disabled={loading || filteredItems.length === 0}>
            <Printer className="w-4 h-4" />
            Print PDF
          </Button>
        </div>
      </div>

      {/* Analysis Configuration */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-primary">Analysis Configuration</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-primary block mb-1.5">Fast Moving (≤ days)</label>
            <Input
              type="number"
              value={fastMovingDays}
              onChange={(e) => setFastMovingDays(Number(e.target.value))}
              className="h-9 bg-background"
              min="1"
            />
            <p className="text-xs text-muted-foreground mt-1">Items with activity within these days</p>
          </div>
          <div>
            <label className="text-xs font-medium text-primary block mb-1.5">Slow Moving (≥ days)</label>
            <Input
              type="number"
              value={slowMovingDays}
              onChange={(e) => setSlowMovingDays(Number(e.target.value))}
              className="h-9 bg-background"
              min="1"
            />
            <p className="text-xs text-muted-foreground mt-1">Items idle for these many days</p>
          </div>
          <div>
            <label className="text-xs font-medium text-primary block mb-1.5">Dead Stock (≥ days)</label>
            <Input
              type="number"
              value={deadStockDays}
              onChange={(e) => setDeadStockDays(Number(e.target.value))}
              className="h-9 bg-background"
              min="1"
            />
            <p className="text-xs text-muted-foreground mt-1">Items with no movement</p>
          </div>
          <div>
            <label className="text-xs font-medium text-primary block mb-1.5">Analysis Period (months)</label>
            <Input
              type="number"
              value={analysisPeriod}
              onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
              className="h-9 bg-background"
              min="1"
            />
            <p className="text-xs text-muted-foreground mt-1">Period for turnover calculation</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Fast Moving */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-green-600 mb-1">Fast Moving</p>
              <p className="text-2xl font-bold text-foreground">{stats.fast.count}</p>
              <p className="text-sm text-green-600 font-medium">{formatCurrency(stats.fast.value)}</p>
              <p className="text-xs text-green-600">{stats.fast.percentage}% of value</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        {/* Normal Moving */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-yellow-600 mb-1">Normal Moving</p>
              <p className="text-2xl font-bold text-foreground">{stats.normal.count}</p>
              <p className="text-sm text-yellow-600 font-medium">{formatCurrency(stats.normal.value)}</p>
              <p className="text-xs text-yellow-600">{stats.normal.percentage}% of value</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </div>

        {/* Slow Moving */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-primary mb-1">Slow Moving</p>
              <p className="text-2xl font-bold text-foreground">{stats.slow.count}</p>
              <p className="text-sm text-primary font-medium">{formatCurrency(stats.slow.value)}</p>
              <p className="text-xs text-primary">{stats.slow.percentage}% of value</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Dead Stock */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-red-600 mb-1">Dead Stock</p>
              <p className="text-2xl font-bold text-foreground">{stats.dead.count}</p>
              <p className="text-sm text-red-600 font-medium">{formatCurrency(stats.dead.value)}</p>
              <p className="text-xs text-red-600">{stats.dead.percentage}% of value</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Ban className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Stock Details Section */}
      <div className="bg-card border border-border rounded-lg">
        {/* Filters Row */}
        <div className="p-4 border-b border-border">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Stock Details</span>
              <div className="flex items-center gap-1 ml-2">
                {(["All", "Fast", "Normal", "Slow", "Dead"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                      activeTab === tab
                        ? tab === "All"
                          ? "bg-primary text-primary-foreground"
                          : tab === "Fast"
                          ? "bg-green-500 text-white"
                          : tab === "Normal"
                          ? "bg-blue-500 text-white"
                          : tab === "Slow"
                          ? "bg-amber-500 text-white"
                          : "bg-red-500 text-white"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Search and Category Filter */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search..."
                  className="pl-9 h-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full lg:w-40 h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <ListNumberHeader />
                <TableHead className="text-xs font-medium">PART NO</TableHead>
                <TableHead className="text-xs font-medium">DESCRIPTION</TableHead>
                <TableHead className="text-xs font-medium">CATEGORY</TableHead>
                <TableHead className="text-xs font-medium text-right">QUANTITY</TableHead>
                <TableHead className="text-xs font-medium text-right">VALUE</TableHead>
                <TableHead className="text-xs font-medium text-right">DAYS IDLE</TableHead>
                <TableHead className="text-xs font-medium text-right">TURNOVER</TableHead>
                <TableHead className="text-xs font-medium text-center">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : paginatedItems.length > 0 ? (
                paginatedItems.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                    <ListNumberCell
                      index={index}
                      page={currentPage}
                      pageSize={itemsPerPage}
                    />
                    <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground text-right">{item.quantity}</TableCell>
                    <TableCell className="text-sm font-medium text-green-600 text-right">{formatCurrency(item.value)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">{item.daysIdle}</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">{item.turnover}/mo</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn("text-xs", classificationColors[item.classification])}>
                        {item.classification === "Fast" ? "Fast Moving" : item.classification === "Slow" ? "Slow Moving" : item.classification}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No items found matching your criteria
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {filteredItems.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} items
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || filteredItems.length === 0}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || filteredItems.length === 0}
            >
              Prev
            </Button>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded">
              {currentPage} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || filteredItems.length === 0}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || filteredItems.length === 0}
            >
              Last
            </Button>
            <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};
