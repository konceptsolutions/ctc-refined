import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Calendar,
  Edit,
  Eye,
  GitCompare,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import apiClient from "@/lib/api";
import { formatPartIdentityFromDb } from "@/lib/part-identity";
import { usePageActions } from "@/permissions/pageActions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ListNumberCell,
  ListNumberHeader,
} from "@/components/ui/list-table-number";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { SupplierFormDialog } from "@/components/manage/SupplierFormDialog";
import { cn } from "@/lib/utils";

type DocumentView = "form" | "list";

interface PartOption {
  id: string;
  value: string;
  label: string;
  partNo: string;
  masterPartNo: string;
  description: string;
  brand: string;
  cost: number;
}

interface InquiryItemForm {
  id: string;
  partId: string;
  quantity: number | "";
  price: number | "";
  remarks: string;
}

interface InquiryLineItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  quantity: number;
  price: number;
  remarks: string;
  amount: number;
}

interface LocalInquiryRow {
  id: string;
  inquiryNo: string;
  inquiryDate: string;
  supplierId?: string | null;
  supplierName: string;
  supplierContactNo?: string;
  remarks: string;
  status: string;
  itemCount: number;
  totalAmount: number;
  items: InquiryLineItem[];
}

interface ComparisonRow {
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  itemsByInquiryId: Record<string, InquiryLineItem>;
}

/** High-contrast palette for older readers: strong fills, dark text, thick borders. */
const PRICE_COLOR_PALETTE = [
  "bg-green-500 text-black border-green-900 border-2 font-bold",
  "bg-yellow-400 text-black border-yellow-900 border-2 font-bold",
  "bg-orange-500 text-black border-orange-950 border-2 font-bold",
  "bg-red-500 text-black border-red-950 border-2 font-bold",
];

/** Unique color per distinct price in a row (lowest → green, highest → red). */
const getPriceColorClass = (price: number, prices: number[]) => {
  const uniqueSorted = [...new Set(prices.map((p) => Number(p) || 0))].sort(
    (a, b) => a - b,
  );
  if (uniqueSorted.length <= 1) {
    return PRICE_COLOR_PALETTE[0];
  }
  const index = uniqueSorted.indexOf(Number(price) || 0);
  if (index <= 0) return PRICE_COLOR_PALETTE[0];
  if (index >= uniqueSorted.length - 1) {
    return PRICE_COLOR_PALETTE[PRICE_COLOR_PALETTE.length - 1];
  }
  const midPalette = PRICE_COLOR_PALETTE.slice(1, -1);
  const midIndex = Math.min(
    midPalette.length - 1,
    Math.floor(
      ((index - 1) / Math.max(1, uniqueSorted.length - 2)) * (midPalette.length - 1),
    ),
  );
  return midPalette[midIndex] || PRICE_COLOR_PALETTE[1];
};

const newItemRow = (): InquiryItemForm => ({
  id: crypto.randomUUID(),
  partId: "",
  quantity: 1,
  price: "",
  remarks: "",
});

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const LocalInquiry = () => {
  const { canCreate, canEdit, canDelete } = usePageActions(
    "inventory.local-inquiry",
  );
  const [documentView, setDocumentView] = useState<DocumentView>("form");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const [inquiryDate, setInquiryDate] = useState<Date>(new Date());
  const [supplierId, setSupplierId] = useState("");
  const [headerRemarks, setHeaderRemarks] = useState("");
  const [items, setItems] = useState<InquiryItemForm[]>([newItemRow()]);
  const [inquiryNoPreview, setInquiryNoPreview] = useState("LI-NEW");

  const [suppliers, setSuppliers] = useState<
    { id: string; value: string; label: string }[]
  >([]);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [parts, setParts] = useState<PartOption[]>([]);

  const [listRows, setListRows] = useState<LocalInquiryRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFromDate, setFilterFromDate] = useState<Date | undefined>();
  const [filterToDate, setFilterToDate] = useState<Date | undefined>();
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [filterPartId, setFilterPartId] = useState("all");
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareInquiries, setCompareInquiries] = useState<LocalInquiryRow[]>(
    [],
  );
  const [compareRows, setCompareRows] = useState<ComparisonRow[]>([]);

  const [viewRow, setViewRow] = useState<LocalInquiryRow | null>(null);

  const partMap = useMemo(() => {
    const map = new Map<string, PartOption>();
    parts.forEach((p) => map.set(p.id, p));
    return map;
  }, [parts]);

  const formatLinePartLabel = (partId?: string, fallbackPartNo?: string) => {
    const part = partId ? partMap.get(partId) : undefined;
    if (part) return formatPartIdentityFromDb(part);
    return fallbackPartNo || "-";
  };

  const formTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        return sum + qty * price;
      }, 0),
    [items],
  );

  const loadLookups = useCallback(async () => {
    try {
      const [suppliersRes, partsRes] = await Promise.all([
        apiClient.getSuppliers({ status: "active", limit: 1000 }),
        apiClient.getParts({ page: 1, limit: "all", status: "active" } as any),
      ]);

      const supplierData = Array.isArray(suppliersRes.data)
        ? suppliersRes.data
        : Array.isArray(suppliersRes)
          ? suppliersRes
          : [];
      setSuppliers(
        supplierData
          .filter((s: any) => (s.name || s.companyName || "").trim())
          .map((s: any) => ({
            id: s.id,
            value: s.id,
            label: s.name || s.companyName || "",
          })),
      );

      const partsData = Array.isArray(partsRes.data)
        ? partsRes.data
        : Array.isArray(partsRes)
          ? partsRes
          : [];
      setParts(
        partsData.map((p: any) => {
          const partNo = p.part_no || p.partNo || "";
          const masterPartNo = p.master_part_no || p.masterPartNo || "";
          const description = p.description || "";
          const brand = p.brand_name || p.Brand?.name || p.brand || "";
          const partLabel = [masterPartNo, partNo]
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(" | ");
          return {
            id: p.id,
            value: p.id,
            label: [partLabel || "—", description, brand]
              .filter(Boolean)
              .join(" — "),
            partNo,
            masterPartNo,
            description,
            brand,
            cost: Number(p.cost || p.purchase_price || 0),
          };
        }),
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to load suppliers/parts");
    }
  }, []);

  const refreshSuppliers = useCallback(async () => {
    try {
      const suppliersRes = await apiClient.getSuppliers({
        status: "active",
        limit: 1000,
      });
      const supplierData = Array.isArray(suppliersRes.data)
        ? suppliersRes.data
        : Array.isArray(suppliersRes)
          ? suppliersRes
          : [];
      setSuppliers(
        supplierData
          .filter((s: any) => (s.name || s.companyName || "").trim())
          .map((s: any) => ({
            id: s.id,
            value: s.id,
            label: s.name || s.companyName || "",
          })),
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to refresh suppliers");
    }
  }, []);

  const handleSupplierSaved = async (created: {
    id: string;
    name?: string | null;
    companyName?: string | null;
  }) => {
    await refreshSuppliers();
    if (created?.id) {
      setSupplierId(created.id);
    }
  };

  const fetchList = useCallback(async () => {
    try {
      setLoadingList(true);
      const response = await apiClient.getLocalInquiries({
        page,
        limit: 25,
        search: searchQuery || undefined,
        supplier_id:
          filterSupplierId !== "all" ? filterSupplierId : undefined,
        part_id: filterPartId !== "all" ? filterPartId : undefined,
        from_date: filterFromDate
          ? format(filterFromDate, "yyyy-MM-dd")
          : undefined,
        to_date: filterToDate ? format(filterToDate, "yyyy-MM-dd") : undefined,
      });
      if (response.error) {
        toast.error(response.error);
        return;
      }
      setListRows(response.data || []);
      if (response.pagination) {
        setTotal(response.pagination.total || 0);
        setTotalPages(response.pagination.totalPages || 1);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load local inquiries");
    } finally {
      setLoadingList(false);
    }
  }, [
    page,
    searchQuery,
    filterSupplierId,
    filterPartId,
    filterFromDate,
    filterToDate,
  ]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (documentView === "list") fetchList();
  }, [documentView, fetchList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (documentView === "list") {
        if (page !== 1) setPage(1);
        else fetchList();
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const resetForm = () => {
    setEditingId(null);
    setInquiryDate(new Date());
    setSupplierId("");
    setHeaderRemarks("");
    setItems([newItemRow()]);
    setInquiryNoPreview("LI-NEW");
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, newItemRow()]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) =>
      prev.length <= 1 ? [newItemRow()] : prev.filter((item) => item.id !== id),
    );
  };

  const handleItemChange = (
    id: string,
    field: keyof InquiryItemForm,
    value: string | number,
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "partId") {
          const part = partMap.get(String(value));
          return {
            ...item,
            partId: String(value),
            price:
              item.price === "" || item.price === 0
                ? part?.cost ?? ""
                : item.price,
          };
        }
        return { ...item, [field]: value };
      }),
    );
  };

  const handleSave = async () => {
    if (!inquiryDate) {
      toast.error("Please select a date");
      return;
    }
    if (!supplierId) {
      toast.error("Please select a supplier");
      return;
    }

    const validItems = items.filter((item) => item.partId);
    if (validItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    const payload = {
      inquiryDate: format(inquiryDate, "yyyy-MM-dd"),
      supplierId,
      remarks: headerRemarks || undefined,
      items: validItems.map((item) => ({
        partId: item.partId,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        remarks: item.remarks || undefined,
      })),
    };

    try {
      setSaving(true);
      const response = editingId
        ? await apiClient.updateLocalInquiry(editingId, payload)
        : await apiClient.createLocalInquiry(payload);

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success(
        editingId
          ? "Local inquiry updated successfully"
          : "Local inquiry created successfully",
      );
      resetForm();
      setDocumentView("list");
      fetchList();
    } catch (error: any) {
      toast.error(error.message || "Failed to save local inquiry");
    } finally {
      setSaving(false);
    }
  };

  const loadInquiryIntoForm = async (id: string) => {
    try {
      const response = await apiClient.getLocalInquiry(id);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      const data = response.data as LocalInquiryRow;
      setEditingId(data.id);
      setInquiryNoPreview(data.inquiryNo);
      setInquiryDate(new Date(data.inquiryDate));
      setSupplierId(data.supplierId || "");
      setHeaderRemarks(data.remarks || "");
      setItems(
        (data.items || []).length > 0
          ? data.items.map((item) => ({
              id: crypto.randomUUID(),
              partId: item.partId,
              quantity: item.quantity,
              price: item.price,
              remarks: item.remarks || "",
            }))
          : [newItemRow()],
      );
      setDocumentView("form");
    } catch (error: any) {
      toast.error(error.message || "Failed to load inquiry");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this local inquiry?")) return;
    try {
      const response = await apiClient.deleteLocalInquiry(id);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success("Local inquiry deleted");
      fetchList();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete inquiry");
    }
  };

  const clearFilters = () => {
    setFilterFromDate(undefined);
    setFilterToDate(undefined);
    setFilterSupplierId("all");
    setFilterPartId("all");
    setSearchQuery("");
    setPage(1);
  };

  const toggleCompareSelection = (id: string) => {
    setSelectedCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const buildComparison = (inquiries: LocalInquiryRow[]): ComparisonRow[] => {
    if (inquiries.length < 2) return [];

    const partMaps = inquiries.map((inquiry) => {
      const map = new Map<string, InquiryLineItem>();
      (inquiry.items || []).forEach((item) => {
        if (!item.partId) return;
        if (!map.has(item.partId)) map.set(item.partId, item);
      });
      return map;
    });

    const commonPartIds = [...partMaps[0].keys()].filter((partId) =>
      partMaps.every((map) => map.has(partId)),
    );

    return commonPartIds.map((partId) => {
      const itemsByInquiryId: Record<string, InquiryLineItem> = {};
      inquiries.forEach((inquiry, index) => {
        const item = partMaps[index].get(partId)!;
        itemsByInquiryId[inquiry.id] = item;
      });
      const first = Object.values(itemsByInquiryId)[0];
      return {
        partId,
        partNo: first.partNo,
        description: first.description,
        brand: first.brand,
        itemsByInquiryId,
      };
    });
  };

  const handleCompare = async () => {
    if (selectedCompareIds.length < 2) {
      toast.error("Select at least two inquiries to compare");
      return;
    }

    try {
      setComparing(true);
      const responses = await Promise.all(
        selectedCompareIds.map((id) => apiClient.getLocalInquiry(id)),
      );

      const failed = responses.find((r) => r.error);
      if (failed?.error) {
        toast.error(failed.error);
        return;
      }

      const inquiries = responses.map((r) => r.data as LocalInquiryRow);
      const rows = buildComparison(inquiries);

      if (rows.length === 0) {
        toast.error("No common items found among the selected inquiries");
        return;
      }

      setCompareInquiries(inquiries);
      setCompareRows(rows);
    } catch (error: any) {
      toast.error(error.message || "Failed to compare inquiries");
    } finally {
      setComparing(false);
    }
  };

  const closeCompare = () => {
    setCompareInquiries([]);
    setCompareRows([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Tabs
          value={documentView}
          onValueChange={(v) => setDocumentView(v as DocumentView)}
        >
          <TabsList>
            <TabsTrigger value="form">Inquiry Form</TabsTrigger>
            <TabsTrigger value="list">Inquiry List</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {documentView === "form" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {editingId ? "Edit Local Inquiry" : "New Local Inquiry"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Inquiry No</Label>
                  <Input value={inquiryNoPreview} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !inquiryDate && "text-muted-foreground",
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {inquiryDate
                          ? format(inquiryDate, "MM/dd/yyyy")
                          : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={inquiryDate}
                        onSelect={(date) => date && setInquiryDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Supplier *</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2"
                      onClick={() => setIsSupplierDialogOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Supplier
                    </Button>
                  </div>
                  <SearchableSelect
                    options={suppliers}
                    value={supplierId}
                    onValueChange={setSupplierId}
                    placeholder="Select supplier..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Input
                    value={headerRemarks}
                    onChange={(e) => setHeaderRemarks(e.target.value)}
                    placeholder="Header remarks..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Items</CardTitle>
              <Button type="button" size="sm" className="gap-1" onClick={handleAddItem}>
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, index) => {
                const part = partMap.get(item.partId);
                const lineTotal =
                  (Number(item.quantity) || 0) * (Number(item.price) || 0);
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border p-3 space-y-3 bg-muted/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Item {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-5 space-y-2">
                        <Label>Item *</Label>
                        <SearchableSelect
                          options={parts}
                          value={item.partId}
                          onValueChange={(v) =>
                            handleItemChange(item.id, "partId", v)
                          }
                          placeholder="Select item..."
                        />
                        {part && (
                          <p className="text-xs text-muted-foreground">
                            {[
                              [part.masterPartNo, part.partNo]
                                .filter(Boolean)
                                .filter((v, i, arr) => arr.indexOf(v) === i)
                                .join(" | "),
                              part.description,
                              part.brand,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "quantity",
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label>Price</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.price}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "price",
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                            )
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="md:col-span-3 space-y-2">
                        <Label>Line Total</Label>
                        <Input
                          value={formatMoney(lineTotal)}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="md:col-span-12 space-y-2">
                        <Label>Item Remarks</Label>
                        <Input
                          value={item.remarks}
                          onChange={(e) =>
                            handleItemChange(item.id, "remarks", e.target.value)
                          }
                          placeholder="Remarks for this item..."
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
                <p className="text-sm font-medium">
                  Total: <span className="text-primary">{formatMoney(formTotal)}</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Clear
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingId ? "Update Inquiry" : "Save Inquiry"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Local Inquiry List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 w-52"
                  placeholder="Search inquiry no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-40 justify-start">
                      <Calendar className="mr-2 h-4 w-4" />
                      {filterFromDate
                        ? format(filterFromDate, "MM/dd/yyyy")
                        : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={filterFromDate}
                      onSelect={setFilterFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-40 justify-start">
                      <Calendar className="mr-2 h-4 w-4" />
                      {filterToDate
                        ? format(filterToDate, "MM/dd/yyyy")
                        : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={filterToDate}
                      onSelect={setFilterToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1 min-w-[200px]">
                <Label className="text-xs">Supplier</Label>
                <SearchableSelect
                  options={[
                    { id: "all", value: "all", label: "All Suppliers" },
                    ...suppliers,
                  ]}
                  value={filterSupplierId}
                  onValueChange={(v) => {
                    setFilterSupplierId(v);
                    setPage(1);
                  }}
                  placeholder="All suppliers..."
                />
              </div>
              <div className="space-y-1 min-w-[260px]">
                <Label className="text-xs">Item</Label>
                <SearchableSelect
                  options={[
                    { id: "all", value: "all", label: "All Items" },
                    ...parts,
                  ]}
                  value={filterPartId}
                  onValueChange={(v) => {
                    setFilterPartId(v);
                    setPage(1);
                  }}
                  placeholder="All items..."
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setPage(1);
                  fetchList();
                }}
              >
                Apply
              </Button>
              <Button variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
              <Button
                variant="outline"
                className="gap-1"
                disabled={selectedCompareIds.length < 2 || comparing}
                onClick={handleCompare}
              >
                {comparing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitCompare className="w-4 h-4" />
                )}
                Compare
                {selectedCompareIds.length > 0
                  ? ` (${selectedCompareIds.length})`
                  : ""}
              </Button>
              {canCreate && (
                <Button
                  className="ml-auto gap-1"
                  onClick={() => {
                    resetForm();
                    setDocumentView("form");
                  }}
                >
                  <Plus className="w-4 h-4" />
                  New Inquiry
                </Button>
              )}
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <ListNumberHeader />
                    <TableHead>Inquiry No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Contact No</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingList ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : listRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No local inquiries found
                      </TableCell>
                    </TableRow>
                  ) : (
                    listRows.map((row, index) => {
                      const checked = selectedCompareIds.includes(row.id);
                      return (
                        <TableRow
                          key={row.id}
                          className={cn(checked && "bg-primary/5")}
                        >
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                toggleCompareSelection(row.id)
                              }
                              aria-label={`Select ${row.inquiryNo} for compare`}
                            />
                          </TableCell>
                          <ListNumberCell
                            index={index}
                            page={page}
                            pageSize={25}
                            total={total}
                          />
                          <TableCell className="font-medium">
                            {row.inquiryNo}
                          </TableCell>
                          <TableCell>
                            {row.inquiryDate
                              ? format(new Date(row.inquiryDate), "MM/dd/yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>{row.supplierName || "-"}</TableCell>
                          <TableCell>{row.supplierContactNo || "-"}</TableCell>
                          <TableCell>{row.itemCount}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(row.totalAmount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <ActionButtonTooltip label="View" variant="edit">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setViewRow(row)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </ActionButtonTooltip>
                              {canEdit && (
                                <ActionButtonTooltip label="Edit" variant="edit">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => loadInquiryIntoForm(row.id)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </ActionButtonTooltip>
                              )}
                              {canDelete && (
                                <ActionButtonTooltip
                                  label="Delete"
                                  variant="delete"
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive"
                                    onClick={() => handleDelete(row.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </ActionButtonTooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {listRows.length === 0 ? 0 : (page - 1) * 25 + 1} to{" "}
                {Math.min(page * 25, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loadingList}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loadingList}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Local Inquiry {viewRow?.inquiryNo}
            </DialogTitle>
          </DialogHeader>
          {viewRow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(viewRow.inquiryDate), "MM/dd/yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Supplier</p>
                  <p className="font-medium">{viewRow.supplierName || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Remarks</p>
                  <p className="font-medium">{viewRow.remarks || "-"}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewRow.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">
                          {formatLinePartLabel(item.partId, item.partNo)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[item.description, item.brand]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(item.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(item.amount)}
                      </TableCell>
                      <TableCell>{item.remarks || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm font-medium text-right">
                Total: {formatMoney(viewRow.totalAmount)}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={compareInquiries.length >= 2}
        onOpenChange={(open) => !open && closeCompare()}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inquiry Comparison (Common Items)</DialogTitle>
          </DialogHeader>
          {compareInquiries.length >= 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                {compareInquiries.map((inquiry) => (
                  <div
                    key={inquiry.id}
                    className="rounded-md border p-3 space-y-1"
                  >
                    <p className="font-semibold">{inquiry.inquiryNo}</p>
                    <p className="text-muted-foreground">
                      {inquiry.inquiryDate
                        ? format(new Date(inquiry.inquiryDate), "MM/dd/yyyy")
                        : "-"}{" "}
                      · {inquiry.supplierName || "-"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-foreground">
                <span className="text-muted-foreground font-medium text-xs">
                  Showing {compareRows.length} common item
                  {compareRows.length === 1 ? "" : "s"} across{" "}
                  {compareInquiries.length} inquiries.
                </span>
                <span className="inline-flex items-center gap-2 ml-1">
                  <span className="px-2.5 py-1 rounded border-2 bg-green-500 text-black border-green-900 font-bold text-sm">
                    LOWEST
                  </span>
                  <span className="text-lg" aria-hidden>
                    →
                  </span>
                  <span className="px-2.5 py-1 rounded border-2 bg-yellow-400 text-black border-yellow-900 font-bold text-sm">
                    MID
                  </span>
                  <span className="text-lg" aria-hidden>
                    →
                  </span>
                  <span className="px-2.5 py-1 rounded border-2 bg-orange-500 text-black border-orange-950 font-bold text-sm">
                    HIGH
                  </span>
                  <span className="text-lg" aria-hidden>
                    →
                  </span>
                  <span className="px-2.5 py-1 rounded border-2 bg-red-500 text-black border-red-950 font-bold text-sm">
                    HIGHEST
                  </span>
                </span>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Item</TableHead>
                      {compareInquiries.map((inquiry) => (
                        <TableHead
                          key={inquiry.id}
                          className="text-center min-w-[140px]"
                          colSpan={2}
                        >
                          <div>{inquiry.inquiryNo}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {inquiry.supplierName || "-"}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableHead />
                      {compareInquiries.map((inquiry) => (
                        <Fragment key={`${inquiry.id}-sub`}>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </Fragment>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compareRows.map((row) => {
                      const prices = compareInquiries.map(
                        (inquiry) =>
                          Number(row.itemsByInquiryId[inquiry.id]?.price || 0),
                      );
                      return (
                        <TableRow key={row.partId}>
                          <TableCell>
                            <div className="font-medium">
                              {formatLinePartLabel(row.partId, row.partNo)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[row.description, row.brand]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </TableCell>
                          {compareInquiries.map((inquiry) => {
                            const item = row.itemsByInquiryId[inquiry.id];
                            const price = Number(item?.price || 0);
                            return (
                              <Fragment key={`${row.partId}-${inquiry.id}`}>
                                <TableCell className="text-right">
                                  {item?.quantity ?? "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={cn(
                                      "inline-flex min-w-[5rem] justify-end px-2.5 py-1 rounded text-base",
                                      getPriceColorClass(price, prices),
                                    )}
                                  >
                                    {formatMoney(price)}
                                  </span>
                                </TableCell>
                              </Fragment>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SupplierFormDialog
        open={isSupplierDialogOpen}
        onOpenChange={setIsSupplierDialogOpen}
        onSaved={handleSupplierSaved}
      />
    </div>
  );
};

export default LocalInquiry;
