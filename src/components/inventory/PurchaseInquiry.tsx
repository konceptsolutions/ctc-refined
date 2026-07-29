import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { RefreshCw, Search, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  LIST_NUMBER_HEAD_CLASS,
} from "@/components/ui/list-table-number";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PartResult {
  id: string;
  partNo: string;
  masterPart: string;
  brand: string;
  description: string;
  origin: string;
  stock: number;
  priceA: number;
  priceB: number;
  priceM: number;
  cost: number;
  reOrderLevel: number;
  grade: string;
  application?: string;
  models?: { id: string; name: string; qtyUsed: number }[];
}

interface LocationQty {
  po: number;
  co: number;
  bo: number;
}

interface InquiryData {
  isb: LocationQty;
  khi: LocationQty;
  poRecords: PoRecord[];
  quotationRecords: QuotationRecord[];
}

interface PoRecord {
  id: string;
  type: "Import" | "PO" | "DPO";
  poNo: string;
  date: string;
  status: string;
  currency?: string;
  consignee?: string;
  supplier?: string;
  qty: number;
  receivedQty?: number;
  backQty?: number;
  unitCost?: number;
  fcRate?: number;
}

interface QuotationRecord {
  id: string;
  quotationId: string;
  quotationNo: string;
  date: string;
  confirmationDate?: string;
  status: string;
  currency?: string;
  requestNo?: string;
  consignee?: string;
  supplier?: string;
  demandQty: number;
  quotationQty: number;
  fcRate?: number;
  lcRate?: number;
}

interface ModelAssociationItem {
  partId: string;
  masterPart: string;
  partNo: string;
  description: string;
  brand: string;
  application?: string;
  model: string;
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | undefined | null, digits = 2) =>
  Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";

const fmtQty = (n: number | undefined | null) =>
  Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "—";

const statusBadge = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "received" || s === "confirm" || s === "confirmed")
    return <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">{status}</Badge>;
  if (s === "draft" || s === "pending")
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{status}</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const PurchaseInquiry = () => {
  // Part search
  const [partSearch, setPartSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PartResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPart, setSelectedPart] = useState<PartResult | null>(null);

  // Inquiry data (PO/CO/BO + records)
  const [inquiryData, setInquiryData] = useState<InquiryData | null>(null);
  const [loadingInquiry, setLoadingInquiry] = useState(false);

  // Part association
  const [selectedModelName, setSelectedModelName] = useState("");
  const [modelAssociations, setModelAssociations] = useState<ModelAssociationItem[]>([]);
  const [loadingModelAssociations, setLoadingModelAssociations] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Part search ──────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setLoadingSearch(true);
    try {
      const resp = await (apiClient as any).getParts({ search: query, limit: 30, page: 1, status: "active" });
      const raw: any[] = Array.isArray(resp) ? resp : (resp?.data || []);
      const results: PartResult[] = raw.map((p: any) => ({
        id: p.id,
        partNo: String(p.master_part_no || p.masterPart || p.partNo || "").trim() || "N/A",
        masterPart: String(p.part_no || p.masterPartNo || p.partNo || "").trim() || "N/A",
        brand: String(p.brand_name || p.brand?.name || p.brand || "").trim() || "N/A",
        description: String(p.description || "").trim() || "—",
        origin: String(p.origin || "").trim() || "—",
        stock: Number(p.current_stock ?? p.currentStock ?? 0),
        priceA: Number(p.price_a ?? p.priceA ?? 0),
        priceB: Number(p.price_b ?? p.priceB ?? 0),
        priceM: Number(p.price_m ?? p.priceM ?? 0),
        cost: Number(p.cost ?? 0),
        reOrderLevel: Number(p.reorder_level ?? p.reOrderLevel ?? 0),
        grade: String(p.grade || "A"),
        application: String(p.application_name || p.application?.name || p.application || ""),
        models: Array.isArray(p.models)
          ? p.models.map((m: any) => ({
              id: String(m.id ?? ""),
              name: String(m.name ?? ""),
              qtyUsed: Number(m.qty_used ?? m.qtyUsed ?? 0),
            }))
          : [],
      }));
      setSearchResults(results);
      setShowDropdown(results.length > 0);
    } catch {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(partSearch), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [partSearch, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectPart = useCallback(async (part: PartResult) => {
    setSelectedPart(part);
    setPartSearch(`${part.partNo} – ${part.description}`);
    setShowDropdown(false);
    setModelAssociations([]);
    setSelectedModelName("");

    // Fetch full part details including models
    try {
      const resp = await (apiClient as any).getPart(part.id);
      const data = resp?.data || resp;
      if (data?.models) {
        setSelectedPart((prev) =>
          prev
            ? {
                ...prev,
                models: Array.isArray(data.models)
                  ? data.models.map((m: any) => ({
                      id: String(m.id ?? ""),
                      name: String(m.name ?? ""),
                      qtyUsed: Number(m.qty_used ?? m.qtyUsed ?? 0),
                    }))
                  : [],
              }
            : prev,
        );
      }
    } catch {
      // non-critical
    }
  }, []);

  // Load inquiry data (PO/CO/BO) when part selected
  useEffect(() => {
    if (!selectedPart?.id) {
      setInquiryData(null);
      return;
    }
    setLoadingInquiry(true);
    (apiClient as any)
      .getPurchaseInquiryByPart(selectedPart.id)
      .then((resp: any) => {
        const d = resp?.data || resp;
        setInquiryData({
          isb: {
            po: Number(d?.isb?.po ?? 0),
            co: Number(d?.isb?.co ?? 0),
            bo: Number(d?.isb?.bo ?? 0),
          },
          khi: {
            po: Number(d?.khi?.po ?? 0),
            co: Number(d?.khi?.co ?? 0),
            bo: Number(d?.khi?.bo ?? 0),
          },
          poRecords: Array.isArray(d?.poRecords) ? d.poRecords : [],
          quotationRecords: Array.isArray(d?.quotationRecords) ? d.quotationRecords : [],
        });
      })
      .catch(() => setInquiryData(null))
      .finally(() => setLoadingInquiry(false));
  }, [selectedPart?.id]);

  // ── Part association ─────────────────────────────────────────────────────────

  const handleModelClick = useCallback(async (modelName: string) => {
    if (!modelName) return;
    setSelectedModelName(modelName);
    setLoadingModelAssociations(true);
    try {
      const resp = await (apiClient as any).getPartsByModelAssociation(
        modelName,
        String(selectedPart?.application || ""),
      );
      const raw: any[] = Array.isArray(resp) ? resp : (resp?.data || []);
      setModelAssociations(
        raw.map((item: any) => ({
          partId: String(item.part_id || item.partId || ""),
          masterPart: String(item.master_part_no || item.masterPart || ""),
          partNo: String(item.part_no || item.partNo || ""),
          description: String(item.description || ""),
          brand: String(item.brand_name || item.brand || ""),
          application: String(item.application_name || item.application || ""),
          model: String(item.model_name || item.model || modelName),
          quantity: Number(item.quantity ?? item.qty_used ?? 0),
        })),
      );
    } catch {
      setModelAssociations([]);
    } finally {
      setLoadingModelAssociations(false);
    }
  }, [selectedPart?.application]);

  const handleAddAssociationToSearch = useCallback((item: ModelAssociationItem) => {
    // Pre-fill the search with this part so user can select it
    setPartSearch(item.partNo || item.masterPart);
    setShowDropdown(false);
    doSearch(item.partNo || item.masterPart);
  }, [doSearch]);

  const renderQtyCell = (value: number | undefined) =>
    loadingInquiry ? (
      <RefreshCw className="w-3 h-3 animate-spin mx-auto text-primary" />
    ) : (
      fmtQty(value)
    );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Purchase Inquiry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Part Search */}
          <div ref={searchRef} className="relative max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search part by Part No, Description, Brand…"
                className="pl-9 h-10"
                value={partSearch}
                onChange={(e) => {
                  setPartSearch(e.target.value);
                  if (!e.target.value.trim()) {
                    setSelectedPart(null);
                    setInquiryData(null);
                    setModelAssociations([]);
                  }
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
              />
              {loadingSearch && (
                <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
              )}
            </div>

            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto bg-background border rounded-md shadow-lg">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b last:border-0"
                    onMouseDown={() => handleSelectPart(p)}
                  >
                    <div className="text-xs font-semibold">{p.partNo}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.description} &bull; <span className="font-medium">{p.brand}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Parts Family Group Table */}
          {selectedPart && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Parts Family Group</div>
              <div className="rounded-md border overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className={LIST_NUMBER_HEAD_CLASS} rowSpan={2}>#</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Part No</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Brand</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Origin</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Qty</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Price A</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Stock</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Rev</TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>Cost</TableHead>
                      <TableHead
                        colSpan={3}
                        className="text-xs text-center whitespace-nowrap bg-blue-50 dark:bg-blue-950 border-x"
                      >
                        ISB
                      </TableHead>
                      <TableHead
                        colSpan={3}
                        className="text-xs text-center whitespace-nowrap bg-amber-50 dark:bg-amber-950 border-x"
                      >
                        KHI
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap" rowSpan={2}>O.Lvl</TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70 border-x">PO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70">CO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-blue-50/70 dark:bg-blue-950/70 border-r">BO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70 border-x">PO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70">CO</TableHead>
                      <TableHead className="text-xs text-center whitespace-nowrap bg-amber-50/70 dark:bg-amber-950/70 border-r">BO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-muted/20">
                      <ListNumberCell index={0} total={1} className="text-xs" />
                      <TableCell className="text-xs font-medium whitespace-nowrap">
                        {selectedPart.partNo}
                        {selectedPart.masterPart && selectedPart.masterPart !== selectedPart.partNo && (
                          <span className="text-muted-foreground ml-1">| {selectedPart.masterPart}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{selectedPart.brand}</TableCell>
                      <TableCell className="text-xs">{selectedPart.origin}</TableCell>
                      <TableCell className="text-xs tabular-nums">{fmtQty(selectedPart.stock)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{fmt(selectedPart.priceA)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{fmtQty(selectedPart.stock)}</TableCell>
                      <TableCell className="text-xs">{selectedPart.grade}</TableCell>
                      <TableCell className="text-xs tabular-nums">{fmt(selectedPart.cost)}</TableCell>
                      <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30 border-x">
                        {renderQtyCell(inquiryData?.isb.po)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30">
                        {renderQtyCell(inquiryData?.isb.co)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-center font-semibold bg-blue-50/50 dark:bg-blue-950/30 border-r">
                        {renderQtyCell(inquiryData?.isb.bo)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30 border-x">
                        {renderQtyCell(inquiryData?.khi.po)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30">
                        {renderQtyCell(inquiryData?.khi.co)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-center font-semibold bg-amber-50/50 dark:bg-amber-950/30 border-r">
                        {renderQtyCell(inquiryData?.khi.bo)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{fmtQty(selectedPart.reOrderLevel)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* PO / CO / BO Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                <span><span className="font-semibold text-foreground">PO</span> = Purchase order / inquiry qty</span>
                <span><span className="font-semibold text-foreground">CO</span> = Confirmed quotation qty</span>
                <span><span className="font-semibold text-foreground">BO</span> = Back order qty</span>
                <span className="text-foreground/70">Split by ISB and KHI consignee</span>
              </div>
            </div>
          )}

          {/* Bottom Section: Part Association + Purchase + Quotation */}
          {selectedPart && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mt-2">

              {/* Part Association – col-span-2 */}
              <div className="xl:col-span-2 rounded-md border bg-card p-3 flex flex-col min-h-[340px]">
                <div className="mb-2">
                  <div className="text-sm font-semibold">Part Association</div>
                  <div className="text-xs text-muted-foreground">
                    Model:{" "}
                    <span className="font-medium text-foreground">
                      {selectedModelName || "Click a model below"}
                    </span>
                  </div>
                </div>

                {/* Models chips */}
                {selectedPart.models && selectedPart.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedPart.models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleModelClick(m.name)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                          selectedModelName === m.name
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 hover:bg-muted border-border text-foreground"
                        }`}
                      >
                        {m.name}
                        {m.qtyUsed > 0 && (
                          <span className="ml-1 opacity-70">×{m.qtyUsed}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rounded-md border overflow-y-auto flex-1 min-h-0">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <ListNumberHeader className="text-xs w-9 px-2" />
                        <TableHead className="text-xs w-[22%] px-2">Part</TableHead>
                        <TableHead className="text-xs w-[28%] px-2">Description</TableHead>
                        <TableHead className="text-xs w-14 px-2">Brand</TableHead>
                        <TableHead className="text-xs w-12 px-2">Model</TableHead>
                        <TableHead className="text-xs text-right w-12 px-2">Qty</TableHead>
                        <TableHead className="text-xs text-center w-10 px-2" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingModelAssociations ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : !selectedModelName ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground italic">
                            Select a model to view associated parts
                          </TableCell>
                        </TableRow>
                      ) : modelAssociations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground italic">
                            No associated parts found for this model.
                          </TableCell>
                        </TableRow>
                      ) : (
                        modelAssociations.map((item, index) => (
                          <TableRow key={`${item.partId}-${index}`} className="hover:bg-muted/20">
                            <ListNumberCell index={index} total={modelAssociations.length} className="text-xs px-2 py-1.5" />
                            <TableCell
                              className="text-xs font-medium px-2 py-1.5 max-w-0 truncate"
                              title={`${item.masterPart} | ${item.partNo}`}
                            >
                              {item.masterPart || item.partNo || "N/A"}
                            </TableCell>
                            <TableCell
                              className="text-xs px-2 py-1.5 max-w-0 truncate"
                              title={item.description}
                            >
                              {item.description || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1.5">{item.brand || "N/A"}</TableCell>
                            <TableCell className="text-xs px-2 py-1.5 truncate max-w-0">{item.model || "N/A"}</TableCell>
                            <TableCell className="text-xs text-right font-semibold px-2 py-1.5 tabular-nums">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="text-xs text-center px-2 py-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-primary hover:bg-primary/10"
                                onClick={() => handleAddAssociationToSearch(item)}
                                title="Search this part"
                                disabled={!item.partId}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Purchase + Quotation – col-span-3 */}
              <div className="xl:col-span-3 space-y-4">

                {/* Purchase Section (PO + DPO) */}
                <div className="rounded-md border bg-card p-3">
                  <div className="text-sm font-semibold mb-2">Purchase</div>
                  <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <ListNumberHeader className="text-xs" />
                          <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">V.No</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Qty</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Rcvd</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">BO</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Currency</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">FC Rate</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Unit Cost</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Supplier</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingInquiry ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-6 text-sm text-muted-foreground">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : !inquiryData || inquiryData.poRecords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-6 text-xs text-muted-foreground italic">
                              No purchase records found
                            </TableCell>
                          </TableRow>
                        ) : (
                          inquiryData.poRecords.map((row, index) => (
                            <TableRow key={row.id || index} className="hover:bg-muted/20">
                              <ListNumberCell index={index} total={inquiryData.poRecords.length} className="text-xs" />
                              <TableCell className="text-xs">
                                <Badge
                                  variant={row.type === "DPO" ? "secondary" : "outline"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {row.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-medium whitespace-nowrap">{row.poNo || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.date ? format(new Date(row.date), "dd MMM yy") : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.qty)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.receivedQty)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.backQty)}</TableCell>
                              <TableCell className="text-xs">{row.currency || "—"}</TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {row.fcRate ? fmt(row.fcRate) : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {row.unitCost ? fmt(row.unitCost) : "—"}
                              </TableCell>
                              <TableCell className="text-xs max-w-[120px] truncate" title={row.supplier}>
                                {row.supplier || "—"}
                              </TableCell>
                              <TableCell className="text-xs">{statusBadge(row.status || "")}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Import Quotation Section */}
                <div className="rounded-md border bg-card p-3">
                  <div className="text-sm font-semibold mb-2">Imp. Quotation</div>
                  <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <ListNumberHeader className="text-xs" />
                          <TableHead className="text-xs whitespace-nowrap">V.No</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Ref. Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Cnf. Date</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Qty</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Currency</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">FC Rate</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">LC Rate</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Supplier</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingInquiry ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-6 text-sm text-muted-foreground">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : !inquiryData || inquiryData.quotationRecords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-6 text-xs text-muted-foreground italic">
                              No quotation records found
                            </TableCell>
                          </TableRow>
                        ) : (
                          inquiryData.quotationRecords.map((row, index) => (
                            <TableRow key={row.id || index} className="hover:bg-muted/20">
                              <ListNumberCell index={index} total={inquiryData.quotationRecords.length} className="text-xs" />
                              <TableCell className="text-xs font-medium whitespace-nowrap">{row.quotationNo || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.date ? format(new Date(row.date), "dd MMM yy") : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.confirmationDate
                                  ? format(new Date(row.confirmationDate), "dd MMM yy")
                                  : row.status?.toLowerCase() === "confirm" ||
                                      row.status?.toLowerCase() === "confirmed"
                                    ? "Confirmed"
                                    : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{fmtQty(row.quotationQty)}</TableCell>
                              <TableCell className="text-xs">{row.currency || "—"}</TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {row.fcRate ? fmt(row.fcRate) : "—"}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {row.lcRate ? fmt(row.lcRate) : "—"}
                              </TableCell>
                              <TableCell className="text-xs max-w-[120px] truncate" title={row.supplier}>
                                {row.supplier || "—"}
                              </TableCell>
                              <TableCell className="text-xs">{statusBadge(row.status || "")}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!selectedPart && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Search for a part to view purchase inquiry details</p>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};
