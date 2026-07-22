import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  Package,
  Hash,
  DollarSign,
  Calculator,
  FileText,
  Download,
  Search,
  MapPin
} from "lucide-react";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printCurrentPage } from "@/utils/printUtils";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface StockItem {
  id: number;
  partNo: string;
  description: string;
  category: string;
  uom: string;
  quantity: number;
  cost: number;
  value: number;
  store: string;
  location: string;
  rack: string;
  shelf: string;
}

const valuationMethods = ["Average Cost", "FIFO", "LIFO", "Standard Cost"];

export const StockBalance = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedStore, setSelectedStore] = useState("All Stores");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<string[]>(["All Categories"]);
  const [stores, setStores] = useState<string[]>(["All Stores"]);

  // Fetch categories and stores on mount
  useEffect(() => {
    fetchCategories();
    fetchStores();
  }, []);

  // Fetch stock data when filters change (excluding search query)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params: any = {
          page: currentPage,
          limit: itemsPerPage,
        };

        if (selectedCategory !== "All Categories") {
          params.category = selectedCategory;
        }

        if (selectedStore !== "All Stores") {
          params.store = selectedStore;
        }

        if (searchQuery) {
          params.search = searchQuery;
        }

        const response = await apiClient.getStockBalanceValuation(params);
        const data = response.data || [];

        if (Array.isArray(data)) {
          setStockData(data);
        } else {
          setStockData([]);
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch stock balance data",
          variant: "destructive",
        });
        setStockData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCategory, selectedStore, currentPage, itemsPerPage]);

  // Debounce search query
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1); // Reset to first page when searching
      const fetchData = async () => {
        try {
          setLoading(true);
          const params: any = {
            page: 1,
            limit: itemsPerPage,
          };

          if (selectedCategory !== "All Categories") {
            params.category = selectedCategory;
          }

          if (selectedStore !== "All Stores") {
            params.store = selectedStore;
          }

          if (searchQuery) {
            params.search = searchQuery;
          }

          const response = await apiClient.getStockBalanceValuation(params);
          const data = response.data || [];

          if (Array.isArray(data)) {
            setStockData(data);
          } else {
            setStockData([]);
          }
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to fetch stock balance data",
            variant: "destructive",
          });
          setStockData([]);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchCategories = async () => {
    try {
      const response = await apiClient.getCategories();
      const categoriesData = response.data || response;
      if (Array.isArray(categoriesData)) {
        setCategories([
          "All Categories",
          ...categoriesData.map((cat: any) => cat.name),
        ]);
      }
    } catch (error) {
    }
  };

  const fetchStores = async () => {
    try {
      const response = await apiClient.getStores();
      const storesData = response.data || response;
      if (Array.isArray(storesData)) {
        setStores([
          "All Stores",
          ...storesData.map((store: any) => store.name),
        ]);
      }
    } catch (error) {
    }
  };

  // Use stockData directly since filtering is done server-side
  const filteredData = useMemo(() => {
    return stockData;
  }, [stockData]);

  // Stats calculations - count unique parts and sum quantities/values correctly
  const stats = useMemo(() => {
    // Count unique parts (by partNo) to avoid double-counting parts in multiple locations
    const uniqueParts = new Set(filteredData.map(item => item.partNo));
    const totalItems = uniqueParts.size;

    // Sum all quantities (including negative for data integrity checks)
    const totalQuantity = filteredData.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);

    // Sum all values (value should already be calculated correctly in backend)
    const totalValue = filteredData.reduce((sum, item) => sum + item.value, 0);

    // Average unit cost = total value / total quantity
    const avgUnitCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

    return { totalItems, totalQuantity, totalValue, avgUnitCost };
  }, [filteredData]);

  // Store stock data for chart
  const storeStock = useMemo(() => {
    const storeMap: Record<string, number> = {};
    filteredData.forEach(item => {
      // Only count positive quantities for store totals
      const qty = Math.max(0, item.quantity);
      storeMap[item.store] = (storeMap[item.store] || 0) + qty;
    });
    return Object.entries(storeMap)
      .filter(([_, qty]) => qty > 0) // Only show stores with positive stock
      .sort((a, b) => b[1] - a[1]);
  }, [filteredData]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // Get max values for bar chart scaling
  const maxStoreStock = Math.max(...storeStock.map(s => s[1]), 1);

  const handleExportCSV = () => {
    // Create CSV content
    const headers = ['SR.', 'PART NO', 'DESCRIPTION', 'CATEGORY', 'UOM', 'QUANTITY', 'STORE', 'RACK', 'SHELF'];
    const rows = filteredData.map((item, index) => [
      index + 1,
      item.partNo,
      item.description,
      item.category,
      item.uom,
      item.quantity,
      item.store,
      item.rack,
      item.shelf,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-balance-valuation-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: "Export Complete", description: "CSV file has been downloaded" });
  };

  const handlePrintPDF = () => {
    printCurrentPage();
    toast({ title: "Print Started", description: "PDF is being generated..." });
  };


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-8 bg-primary rounded-full" />
          <div>
            <h2 className="text-base font-semibold text-foreground">Stock Balance & Valuation</h2>
            <p className="text-xs text-muted-foreground">View inventory valuation and stock levels</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportCSV}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
          <PrintPdfButton
            onPrint={handlePrintPDF}
            size="sm"
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Items</p>
              <p className="text-lg font-bold text-foreground">{stats.totalItems}</p>
            </div>
            <Package className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Quantity</p>
              <p className="text-lg font-bold text-foreground">{stats.totalQuantity}</p>
            </div>
            <Hash className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Stores</p>
              <p className="text-lg font-bold text-foreground">{stores.filter(s => s !== "All Stores").length}</p>
            </div>
            <MapPin className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Balance</p>
              <p className="text-lg font-bold text-foreground">{stats.totalQuantity} Units</p>
            </div>
            <Calculator className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by part number or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <SearchableSelect
              options={categories.map(cat => ({ value: cat, label: cat }))}
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              placeholder="Select Category..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Store</label>
            <SearchableSelect
              options={stores.map(store => ({ value: store, label: store }))}
              value={selectedStore}
              onValueChange={setSelectedStore}
              placeholder="Select Store..."
            />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-4">
        {/* Stock by Store */}
        <div className="bg-card rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold text-foreground mb-3">Stock Distribution by Store</h3>
          <div className="space-y-2">
            {storeStock.map(([store, quantity]) => (
              <div key={store} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-32 truncate">{store}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${(quantity / maxStoreStock) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground min-w-[80px] text-right">
                  {quantity} pcs
                </span>
              </div>
            ))}
            {storeStock.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Stock Inventory Details Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 py-2 border-b border-border gap-2">
          <h3 className="text-sm font-semibold text-foreground">Stock Inventory Details</h3>
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading..." : `Showing ${filteredData.length} items`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <ListNumberHeader />
                <TableHead className="min-w-[150px] text-xs font-semibold">PART NO</TableHead>
                <TableHead className="min-w-[180px] text-xs font-semibold">DESCRIPTION</TableHead>
                <TableHead className="min-w-[120px] text-xs font-semibold">CATEGORY</TableHead>
                <TableHead className="w-16 text-xs font-semibold">UOM</TableHead>
                <TableHead className="w-20 text-xs font-semibold text-right">QUANTITY</TableHead>
                <TableHead className="min-w-[120px] text-xs font-semibold">STORE</TableHead>
                <TableHead className="w-[100px] text-xs font-semibold">RACK</TableHead>
                <TableHead className="w-[100px] text-xs font-semibold">SHELF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Loading stock data...
                  </TableCell>
                </TableRow>
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No stock data available
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <ListNumberCell
                      index={index}
                      page={currentPage}
                      pageSize={itemsPerPage}
                      total={filteredData.length}
                    />
                    <TableCell className="text-xs font-medium">{item.partNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.uom}</TableCell>
                    <TableCell className={`text-xs text-right font-medium ${item.quantity === 0 ? 'text-destructive' : ''}`}>
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.store}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.rack || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.shelf || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 py-2 bg-muted/20 border-t border-border gap-2">
          <span className="text-xs font-semibold text-foreground">TOTAL QUANTITY</span>
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="text-xs font-bold text-primary">{stats.totalQuantity} Units</span>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredData.length)} of {filteredData.length} items
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </Button>
            <div className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
              <span>{currentPage}</span>
              <span>/</span>
              <span>{totalPages || 1}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Last
            </Button>
            <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(parseInt(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-14 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10" className="text-xs">10</SelectItem>
                <SelectItem value="25" className="text-xs">25</SelectItem>
                <SelectItem value="50" className="text-xs">50</SelectItem>
                <SelectItem value="100" className="text-xs">100</SelectItem>
                <SelectItem value="500" className="text-xs">500</SelectItem>
                <SelectItem value="1000" className="text-xs">1000</SelectItem>
                <SelectItem value="2000" className="text-xs">2000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};
