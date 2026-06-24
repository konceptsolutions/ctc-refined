import { useState, useMemo, useEffect } from "react";
import { DollarSign, Download, RotateCcw, History, Edit3, Search, RefreshCw } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";

interface PriceItem {
  id: string;
  partNo: string;
  description: string;
  category: string;
  qty: number;
  cost: number;
  newCost: number;
  priceA: number;
  newPriceA: number;
  priceB: number;
  newPriceB: number;
  isModified: boolean;
}

interface UpdateHistoryItem {
  id: string;
  date: string;
  itemsUpdated: number;
  priceField: string;
  updateType: string;
  value: number;
  reason: string;
  updatedBy: string;
}

type TabType = "editor" | "history";

export const StockPriceManagement = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("editor");

  // Items state
  const [items, setItems] = useState<PriceItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [partsLoading, setPartsLoading] = useState(false);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [history, setHistory] = useState<UpdateHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Bulk update state
  const [priceField, setPriceField] = useState("cost");
  const [updateType, setUpdateType] = useState("percentage");
  const [updateValue, setUpdateValue] = useState("");
  const [updateReason, setUpdateReason] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch parts for price management
  useEffect(() => {
    fetchParts();
  }, [searchTerm, categoryFilter]);

  // Fetch history when history tab is active
  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchParts = async () => {
    try {
      setPartsLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };

      if (searchTerm) {
        params.search = searchTerm;
      }

      if (categoryFilter !== "all") {
        params.category = categoryFilter;
      }

      const response = await apiClient.getPartsForPriceManagement(params);
      const data = response.data || [];
      
      if (Array.isArray(data)) {
        const priceItems: PriceItem[] = data.map((item: any) => ({
          id: item.id,
          partNo: item.partNo,
          description: item.description,
          category: item.category,
          qty: item.qty,
          cost: item.cost,
          newCost: item.cost,
          priceA: item.priceA,
          newPriceA: item.priceA,
          priceB: item.priceB,
          newPriceB: item.priceB,
          isModified: false,
        }));
        setItems(priceItems);
      } else {
        setItems([]);
      }
    } catch (error) {
      toast.error('Failed to fetch parts');
      setItems([]);
    } finally {
      setPartsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await apiClient.getPriceHistory({ page: 1, limit: 100 });
      const data = response.data || [];
      
      if (Array.isArray(data)) {
        const historyItems: UpdateHistoryItem[] = data.map((item: any) => ({
          id: item.id,
          date: new Date(item.date).toLocaleString(),
          itemsUpdated: item.itemsUpdated,
          priceField: item.priceField,
          updateType: item.updateType,
          value: item.value,
          reason: item.reason,
          updatedBy: item.updatedBy,
        }));
        setHistory(historyItems);
      } else {
        setHistory([]);
      }
    } catch (error) {
      toast.error('Failed to fetch price history');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(items.map((item) => item.category).filter(Boolean))];
    return cats.sort();
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, categoryFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  // Stats
  const stats = useMemo(() => {
    const modifiedItems = items.filter((i) => i.isModified);
    const currentValue = items.reduce((sum, i) => sum + i.cost * i.qty, 0);
    const newValue = items.reduce((sum, i) => sum + i.newCost * i.qty, 0);

    return {
      totalItems: items.length,
      selected: selectedIds.size,
      modified: modifiedItems.length,
      currentValue,
      newValue,
      valueChange: newValue - currentValue,
    };
  }, [items, selectedIds]);

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  // Handle single select
  const handleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  // Handle individual price change
  const handlePriceChange = (id: string, field: "newCost" | "newPriceA" | "newPriceB", value: string) => {
    const numValue = parseFloat(value) || 0;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: numValue };
          updated.isModified =
            updated.newCost !== updated.cost ||
            updated.newPriceA !== updated.priceA ||
            updated.newPriceB !== updated.priceB;
          return updated;
        }
        return item;
      })
    );
  };

  // Apply bulk update
  const handleApplyToSelected = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select items to update");
      return;
    }
    if (!updateValue) {
      toast.error("Please enter a value");
      return;
    }
    if (!updateReason.trim()) {
      toast.error("Please enter a reason for update");
      return;
    }

    const value = parseFloat(updateValue);
    if (isNaN(value)) {
      toast.error("Please enter a valid number");
      return;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (!selectedIds.has(item.id)) return item;

        const updated = { ...item };
        const applyUpdate = (currentPrice: number) => {
          if (updateType === "percentage") {
            return currentPrice * (1 + value / 100);
          } else {
            return currentPrice + value;
          }
        };

        if (priceField === "cost" || priceField === "all") {
          updated.newCost = Math.round(applyUpdate(updated.cost) * 100) / 100;
        }
        if (priceField === "priceA" || priceField === "all") {
          updated.newPriceA = Math.round(applyUpdate(updated.priceA) * 100) / 100;
        }
        if (priceField === "priceB" || priceField === "all") {
          updated.newPriceB = Math.round(applyUpdate(updated.priceB) * 100) / 100;
        }

        updated.isModified =
          updated.newCost !== updated.cost ||
          updated.newPriceA !== updated.priceA ||
          updated.newPriceB !== updated.priceB;

        return updated;
      })
    );

    toast.success(`Updated ${selectedIds.size} items`);
  };

  // Reset all changes
  const handleResetAll = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        newCost: item.cost,
        newPriceA: item.priceA,
        newPriceB: item.priceB,
        isModified: false,
      }))
    );
    setSelectedIds(new Set());
    toast.success("All changes reset");
  };

  // Apply all changes
  const handleApplyChanges = async () => {
    const modifiedItems = items.filter((i) => i.isModified);
    if (modifiedItems.length === 0) {
      toast.error("No changes to apply");
      return;
    }

    try {
      setApplyingChanges(true);
      
      // Update each modified item individually
      const updatePromises = modifiedItems.map(async (item) => {
        const updates: any = {};
        if (item.newCost !== item.cost) updates.cost = item.newCost;
        if (item.newPriceA !== item.priceA) updates.priceA = item.newPriceA;
        if (item.newPriceB !== item.priceB) updates.priceB = item.newPriceB;

        if (Object.keys(updates).length > 0) {
          return apiClient.updatePartPrices(item.id, {
            ...updates,
            reason: 'Bulk price update from Price Management',
            updated_by: 'User',
          });
        }
        return null;
      });

      await Promise.all(updatePromises.filter(p => p !== null));

      // Refresh the data
      await fetchParts();
      toast.success(`Applied changes to ${modifiedItems.length} items`);
    } catch (error) {
      toast.error('Failed to apply changes');
    } finally {
      setApplyingChanges(false);
    }
  };

  // Export function
  const handleExport = () => {
    const headers = ["Part No", "Description", "Category", "Qty", "Cost", "New Cost", "Price A", "New A", "Price B", "New B", "Change %"];
    const csvContent = [
      headers.join(","),
      ...filteredItems.map((item) => {
        const changePercent = item.cost > 0 ? (((item.newCost - item.cost) / item.cost) * 100).toFixed(1) : "-";
        return [
          item.partNo,
          `"${item.description}"`,
          `"${item.category}"`,
          item.qty,
          item.cost.toFixed(2),
          item.newCost.toFixed(2),
          item.priceA.toFixed(2),
          item.newPriceA.toFixed(2),
          item.priceB.toFixed(2),
          item.newPriceB.toFixed(2),
          changePercent,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "price-management-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format currency
  const formatCurrency = (value: number) => `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Calculate change percentage
  const getChangePercent = (oldValue: number, newValue: number) => {
    if (oldValue === 0) return "-";
    const change = ((newValue - oldValue) / oldValue) * 100;
    if (change === 0) return "-";
    return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const isAllSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));
  const modifiedCount = items.filter((i) => i.isModified).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Stock Price Management</h2>
            <p className="text-sm text-muted-foreground">Readjust and update inventory prices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "editor" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setActiveTab("editor")}
          >
            <Edit3 className="w-4 h-4" />
            Price Editor
          </Button>
          <Button
            variant={activeTab === "history" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setActiveTab("history")}
          >
            <History className="w-4 h-4" />
            Update History
          </Button>
        </div>
      </div>

      {activeTab === "editor" && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-xl font-semibold text-foreground">{stats.totalItems}</p>
            </div>
            <div className="bg-card border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600">Selected</p>
              <p className="text-xl font-semibold text-blue-600">{stats.selected}</p>
            </div>
            <div className="bg-card border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600">Modified</p>
              <p className="text-xl font-semibold text-green-600">{stats.modified}</p>
            </div>
            <div className="bg-card border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-600">Current Value</p>
              <p className="text-lg font-semibold text-amber-600">{formatCurrency(stats.currentValue)}</p>
            </div>
            <div className="bg-card border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600">New Value</p>
              <p className="text-lg font-semibold text-green-600">{formatCurrency(stats.newValue)}</p>
            </div>
            <div className={cn("bg-card border rounded-lg p-3", stats.valueChange >= 0 ? "border-green-200" : "border-red-200")}>
              <p className={cn("text-xs", stats.valueChange >= 0 ? "text-green-600" : "text-red-600")}>Value Change</p>
              <p className={cn("text-lg font-semibold", stats.valueChange >= 0 ? "text-green-600" : "text-red-600")}>
                {stats.valueChange >= 0 ? "+" : ""}{formatCurrency(stats.valueChange)}
              </p>
            </div>
          </div>

          {/* Bulk Price Update */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium text-primary">Bulk Price Update</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-medium text-primary block mb-1.5">Price Field</label>
                <Select value={priceField} onValueChange={setPriceField}>
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cost">Cost</SelectItem>
                    <SelectItem value="priceA">Price A</SelectItem>
                    <SelectItem value="priceB">Price B</SelectItem>
                    <SelectItem value="all">All Prices</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-primary block mb-1.5">Update Type</label>
                <Select value={updateType} onValueChange={setUpdateType}>
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-primary block mb-1.5">Value ({updateType === "percentage" ? "%" : "Rs"})</label>
                <Input
                  type="number"
                  value={updateValue}
                  onChange={(e) => setUpdateValue(e.target.value)}
                  placeholder="0"
                  className="h-9 bg-background"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-primary block mb-1.5">Reason for Update *</label>
                <Input
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                  placeholder="e.g. Market price adjustment..."
                  className="h-9 bg-background"
                />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full h-9 bg-primary hover:bg-primary/90"
                  onClick={handleApplyToSelected}
                >
                  Apply to Selected
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-primary/20">
              <p className="text-sm text-muted-foreground">
                {selectedIds.size} items selected | {modifiedCount} items modified
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
                  <Download className="w-4 h-4" />
                  Export
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50" onClick={handleResetAll}>
                  <RotateCcw className="w-4 h-4" />
                  Reset All
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-primary hover:bg-primary/90"
                  onClick={handleApplyChanges}
                  disabled={modifiedCount === 0 || applyingChanges}
                >
                  {applyingChanges
                    ? "Applying..."
                    : `Apply ${modifiedCount} Changes`}
                </Button>
              </div>
            </div>
          </div>

          {/* Price List Table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Filters Row */}
            <div className="p-4 border-b border-border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <h3 className="text-sm font-medium text-foreground">Price List</h3>
              <div className="flex items-center gap-3 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    placeholder="Search..."
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
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

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <ListNumberHeader />
                    <TableHead className="w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-medium">PART NO</TableHead>
                    <TableHead className="text-xs font-medium">DESCRIPTION</TableHead>
                    <TableHead className="text-xs font-medium text-right w-16">QTY</TableHead>
                    <TableHead className="text-xs font-medium text-right w-24">COST</TableHead>
                    <TableHead className="text-xs font-medium text-center w-28">NEW COST</TableHead>
                    <TableHead className="text-xs font-medium text-right w-24">PRICE A</TableHead>
                    <TableHead className="text-xs font-medium text-center w-28">NEW A</TableHead>
                    <TableHead className="text-xs font-medium text-right w-24">PRICE B</TableHead>
                    <TableHead className="text-xs font-medium text-center w-28">NEW B</TableHead>
                    <TableHead className="text-xs font-medium text-center w-20">CHANGE %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partsLoading ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        Loading parts...
                      </TableCell>
                    </TableRow>
                  ) : paginatedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        No items found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map((item, index) => (
                    <TableRow
                      key={item.id}
                      className={cn(
                        "hover:bg-muted/20 transition-colors",
                        item.isModified && "bg-green-50/50"
                      )}
                    >
                      <ListNumberCell index={index} page={currentPage} pageSize={itemsPerPage} />
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={(checked) => handleSelect(item.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{item.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground text-right">{item.qty}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground text-right">{formatCurrency(item.cost)}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={item.newCost}
                          onChange={(e) => handlePriceChange(item.id, "newCost", e.target.value)}
                          className={cn("h-8 w-24 text-center mx-auto", item.newCost !== item.cost && "border-green-400 bg-green-50")}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground text-right">{formatCurrency(item.priceA)}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={item.newPriceA}
                          onChange={(e) => handlePriceChange(item.id, "newPriceA", e.target.value)}
                          className={cn("h-8 w-24 text-center mx-auto", item.newPriceA !== item.priceA && "border-green-400 bg-green-50")}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground text-right">{formatCurrency(item.priceB)}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={item.newPriceB}
                          onChange={(e) => handlePriceChange(item.id, "newPriceB", e.target.value)}
                          className={cn("h-8 w-24 text-center mx-auto", item.newPriceB !== item.priceB && "border-green-400 bg-green-50")}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-center text-muted-foreground">
                        {getChangePercent(item.cost, item.newCost)}
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} items
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  First
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  Prev
                </Button>
                <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded">
                  {currentPage} / {totalPages || 1}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                  Next
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0}>
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
        </>
      )}

      {activeTab === "history" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Update History</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <ListNumberHeader />
                <TableHead className="text-xs font-medium">DATE & TIME</TableHead>
                <TableHead className="text-xs font-medium text-center">ITEMS UPDATED</TableHead>
                <TableHead className="text-xs font-medium">PRICE FIELD</TableHead>
                <TableHead className="text-xs font-medium">UPDATE TYPE</TableHead>
                <TableHead className="text-xs font-medium text-right">VALUE</TableHead>
                <TableHead className="text-xs font-medium">REASON</TableHead>
                <TableHead className="text-xs font-medium">UPDATED BY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Loading history...
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No price update history found
                  </TableCell>
                </TableRow>
              ) : (
                history.map((item, index) => (
                <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                  <ListNumberCell index={index} />
                  <TableCell className="text-sm text-foreground">{item.date}</TableCell>
                  <TableCell className="text-sm font-medium text-center text-primary">{item.itemsUpdated}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.priceField}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.updateType}</TableCell>
                  <TableCell className="text-sm text-muted-foreground text-right">
                    {item.updateType === "Percentage" ? `${item.value}%` : `Rs ${item.value}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.reason}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.updatedBy}</TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
