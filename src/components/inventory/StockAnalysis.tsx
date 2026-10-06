import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Search, Loader2, Check, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  LIST_NUMBER_HEAD_CLASS,
  LIST_NUMBER_CELL_CLASS,
} from "@/components/ui/list-table-number";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import {
  performedByPayload,
  StoreOperatorAuthProvider,
  useStoreOperatorAuth,
} from "@/hooks/useStoreOperatorAuth";
import { usePageActions } from "@/permissions/pageActions";

interface VerificationRow {
  id: string;
  partNo: string;
  description: string;
  brand: string;
  categoryId: string | null;
  category: string;
  subcategoryId: string | null;
  subcategory: string;
  stockVerifiedAt: string | null;
}

interface NamedOption {
  id: string;
  name: string;
}

type PeriodFilter = "all" | "week" | "month" | "year" | "never";

const todayLocal = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toDateInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatDisplayDate = (iso: string | null) => {
  if (!iso) return "Never verified";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never verified";
  return d.toLocaleDateString();
};

const normalizeOptions = (result: any): NamedOption[] => {
  const list = Array.isArray(result)
    ? result
    : Array.isArray(result?.data)
      ? result.data
      : [];
  return list
    .map((c: any) => ({ id: c.id, name: c.name }))
    .filter((c: NamedOption) => c.id && c.name)
    .sort((a: NamedOption, b: NamedOption) => a.name.localeCompare(b.name));
};

export const StockAnalysis = () => (
  <StoreOperatorAuthProvider>
    <StockAnalysisInner />
  </StoreOperatorAuthProvider>
);

const StockAnalysisInner = () => {
  const { canEdit } = usePageActions("inventory.stock-analysis");
  const { requiresOperatorAuth, requestOperatorAuth } = useStoreOperatorAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [categories, setCategories] = useState<NamedOption[]>([]);
  const [filterSubcategories, setFilterSubcategories] = useState<NamedOption[]>([]);
  const [bulkSubcategories, setBulkSubcategories] = useState<NamedOption[]>([]);
  const [items, setItems] = useState<VerificationRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState("");
  const [bulkDate, setBulkDate] = useState(todayLocal());
  const [selectedBulkDate, setSelectedBulkDate] = useState(todayLocal());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedSaving, setSelectedSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const result = await apiClient.getCategories();
        setCategories(normalizeOptions(result));
      } catch {
        setCategories([]);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const loadFilterSubcategories = async () => {
      if (categoryFilter === "all") {
        setFilterSubcategories([]);
        setSubcategoryFilter("all");
        return;
      }
      try {
        const result = await apiClient.getSubcategories(categoryFilter);
        setFilterSubcategories(normalizeOptions(result));
        setSubcategoryFilter("all");
      } catch {
        setFilterSubcategories([]);
        setSubcategoryFilter("all");
      }
    };
    loadFilterSubcategories();
  }, [categoryFilter]);

  useEffect(() => {
    const loadBulkSubcategories = async () => {
      if (!bulkCategoryId) {
        setBulkSubcategories([]);
        setBulkSubcategoryId("");
        return;
      }
      try {
        const result = await apiClient.getSubcategories(bulkCategoryId);
        setBulkSubcategories(normalizeOptions(result));
        setBulkSubcategoryId("");
      } catch {
        setBulkSubcategories([]);
        setBulkSubcategoryId("");
      }
    };
    loadBulkSubcategories();
  }, [bulkCategoryId]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params: any = {
        period,
        page: currentPage,
        limit: itemsPerPage,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter !== "all") params.category_id = categoryFilter;
      if (subcategoryFilter !== "all") params.subcategory_id = subcategoryFilter;

      const result = await apiClient.getStockVerificationDates(params);
      if (result.error) {
        toast.error(result.error);
        setItems([]);
        setTotal(0);
        setTotalPages(1);
        setSelectedIds(new Set());
        return;
      }

      const rows: VerificationRow[] = result.data || [];
      setItems(rows);
      setSelectedIds(new Set());
      setTotal(result.pagination?.total ?? rows.length);
      setTotalPages(result.pagination?.totalPages ?? 1);
      setDateDrafts(() => {
        const next: Record<string, string> = {};
        for (const row of rows) {
          next[row.id] = toDateInput(row.stockVerifiedAt) || todayLocal();
        }
        return next;
      });
    } catch {
      toast.error("Failed to load stock verification items");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, period, categoryFilter, subcategoryFilter, itemsPerPage]);

  useEffect(() => {
    fetchItems();
  }, [
    debouncedSearch,
    period,
    categoryFilter,
    subcategoryFilter,
    currentPage,
    itemsPerPage,
  ]);

  const allPageSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const somePageSelected =
    items.some((item) => selectedIds.has(item.id)) && !allPageSelected;

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const item of items) next.add(item.id);
      } else {
        for (const item of items) next.delete(item.id);
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleUpdateItem = async (item: VerificationRow, dateValue?: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to update verification dates");
      return;
    }
    const verifiedAt = dateValue ?? dateDrafts[item.id] ?? todayLocal();
    if (!verifiedAt) {
      toast.error("Select a verification date");
      return;
    }

    try {
      setSavingIds((prev) => ({ ...prev, [item.id]: true }));
      const operator = await requestOperatorAuth();
      if (requiresOperatorAuth && !operator) {
        return;
      }
      const by = performedByPayload(operator);
      const result = await apiClient.updateStockVerificationDate(item.id, {
        verified_at: verifiedAt,
        ...by,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const updated = result.data as VerificationRow;
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, ...updated } : row)),
      );
      setDateDrafts((prev) => ({
        ...prev,
        [item.id]: toDateInput(updated.stockVerifiedAt) || verifiedAt,
      }));
      toast.success(
        operator?.name
          ? `Verified ${item.partNo} as ${operator.name}`
          : `Verified ${item.partNo}`,
      );
    } catch {
      toast.error("Failed to update verification date");
    } finally {
      setSavingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleBulkUpdate = async () => {
    if (!canEdit) {
      toast.error("You do not have permission to update verification dates");
      return;
    }
    if (!bulkCategoryId) {
      toast.error("Select a category for bulk update");
      return;
    }
    if (!bulkDate) {
      toast.error("Select a verification date");
      return;
    }

    const categoryName =
      categories.find((c) => c.id === bulkCategoryId)?.name || "selected category";
    const subcategoryName = bulkSubcategories.find(
      (s) => s.id === bulkSubcategoryId,
    )?.name;

    try {
      setBulkSaving(true);
      const operator = await requestOperatorAuth();
      if (requiresOperatorAuth && !operator) {
        return;
      }
      const by = performedByPayload(operator);
      const result = await apiClient.bulkUpdateStockVerificationDates({
        category_id: bulkCategoryId,
        subcategory_id: bulkSubcategoryId || undefined,
        verified_at: bulkDate,
        ...by,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.data?.updatedCount ?? 0;
      const scope = subcategoryName
        ? `${categoryName} / ${subcategoryName}`
        : categoryName;
      toast.success(
        operator?.name
          ? `Updated ${count} item(s) in ${scope} as ${operator.name}`
          : `Updated ${count} item(s) in ${scope}`,
      );
      await fetchItems();
    } catch {
      toast.error("Failed to bulk update verification dates");
    } finally {
      setBulkSaving(false);
    }
  };

  const handleSelectedBulkUpdate = async (dateValue?: string) => {
    if (!canEdit) {
      toast.error("You do not have permission to update verification dates");
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("Select at least one item");
      return;
    }
    const verifiedAt = dateValue ?? selectedBulkDate;
    if (!verifiedAt) {
      toast.error("Select a verification date");
      return;
    }

    try {
      setSelectedSaving(true);
      const operator = await requestOperatorAuth();
      if (requiresOperatorAuth && !operator) {
        return;
      }
      const by = performedByPayload(operator);
      const result = await apiClient.bulkUpdateStockVerificationDates({
        part_ids: ids,
        verified_at: verifiedAt,
        ...by,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.data?.updatedCount ?? 0;
      toast.success(
        operator?.name
          ? `Updated ${count} selected item(s) as ${operator.name}`
          : `Updated ${count} selected item(s)`,
      );
      setSelectedIds(new Set());
      await fetchItems();
    } catch {
      toast.error("Failed to update selected items");
    } finally {
      setSelectedSaving(false);
    }
  };

  const periodLabel = useMemo(() => {
    switch (period) {
      case "week":
        return "This week";
      case "month":
        return "This month";
      case "year":
        return "This year";
      case "never":
        return "Never verified";
      default:
        return "All items";
    }
  }, [period]);

  const colSpan = canEdit ? 9 : 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Stock Verification</h2>
            <p className="text-sm text-muted-foreground">
              Update verification dates per item, selected items, or category
            </p>
          </div>
        </div>
        <Badge variant="outline">{periodLabel}</Badge>
      </div>

      {canEdit && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium text-primary">
              Bulk update by category / subcategory
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Category</Label>
              <Select
                value={bulkCategoryId || undefined}
                onValueChange={setBulkCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Subcategory (optional)</Label>
              <Select
                value={bulkSubcategoryId || "all"}
                onValueChange={(v) => setBulkSubcategoryId(v === "all" ? "" : v)}
                disabled={!bulkCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All subcategories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subcategories</SelectItem>
                  {bulkSubcategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Verification date</Label>
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={handleBulkUpdate}
                disabled={bulkSaving || !bulkCategoryId}
              >
                {bulkSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {bulkSubcategoryId ? "Apply to subcategory" : "Apply to category"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search part no / description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subcategoryFilter}
          onValueChange={setSubcategoryFilter}
          disabled={categoryFilter === "all"}
        >
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subcategories</SelectItem>
            {filterSubcategories.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="year">This year</SelectItem>
            <SelectItem value="never">Never verified</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(itemsPerPage)}
          onValueChange={(v) => setItemsPerPage(Number(v))}
        >
          <SelectTrigger className="w-full lg:w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canEdit && selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-lg border border-primary/30 bg-card p-3">
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          <Input
            type="date"
            className="sm:w-[160px]"
            value={selectedBulkDate}
            onChange={(e) => setSelectedBulkDate(e.target.value)}
          />
          <Button
            onClick={() => handleSelectedBulkUpdate()}
            disabled={selectedSaving}
          >
            {selectedSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Update selected
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSelectedBulkUpdate(todayLocal())}
            disabled={selectedSaving}
          >
            Mark selected as today
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedSaving}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                    aria-label="Select all on page"
                  />
                </TableHead>
              )}
              <ListNumberHeader className={LIST_NUMBER_HEAD_CLASS} />
              <TableHead>Part No</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Last verified</TableHead>
              {canEdit && <TableHead className="w-[280px]">Set date</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-24 text-center">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                  Loading...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="h-24 text-center text-muted-foreground"
                >
                  No items found for the selected filters
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow
                  key={item.id}
                  data-state={selectedIds.has(item.id) ? "selected" : undefined}
                >
                  {canEdit && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(v) =>
                          toggleSelectOne(item.id, v === true)
                        }
                        aria-label={`Select ${item.partNo}`}
                      />
                    </TableCell>
                  )}
                  <ListNumberCell
                    className={LIST_NUMBER_CELL_CLASS}
                    index={index}
                    page={currentPage}
                    pageSize={itemsPerPage}
                    total={total}
                  />
                  <TableCell className="font-medium">{item.partNo}</TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {item.description || "—"}
                  </TableCell>
                  <TableCell>{item.brand || "—"}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.subcategory || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={item.stockVerifiedAt ? "secondary" : "outline"}>
                      {formatDisplayDate(item.stockVerifiedAt)}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          className="h-8 w-[150px]"
                          value={dateDrafts[item.id] || todayLocal()}
                          onChange={(e) =>
                            setDateDrafts((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!savingIds[item.id]}
                          onClick={() => handleUpdateItem(item)}
                        >
                          {savingIds[item.id] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          disabled={!!savingIds[item.id]}
                          onClick={() => handleUpdateItem(item, todayLocal())}
                        >
                          Today
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total} item{total === 1 ? "" : "s"}
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1 || loading}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages || loading}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
