import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, X, Trash2, Pencil, ShoppingCart, Printer,
  RefreshCw, FileText, User, Package, ChevronDown, Check,
  ArrowLeft, Save, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { PrintableDocument, printDocument } from "./PrintableDocument";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────── */
interface QuotationItem {
  id: string; partNo: string; description: string;
  quantity: number; unitPrice: number; avgCost?: number; total: number;
  available?: number;
}
interface Quotation {
  id: string; quotationNo: string; customerName: string;
  customerEmail: string; customerPhone: string; customerAddress: string;
  date: string; validUntil: string; totalAmount: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  items: QuotationItem[]; notes: string;
}
type FormData = {
  quotationNo: string; quotationDate: string; validUntil: string;
  status: Quotation["status"]; customerName: string; customerEmail: string;
  customerPhone: string; customerAddress: string; notes: string;
};

const emptyForm = (): FormData => ({
  quotationNo: "",
  quotationDate: new Date().toISOString().split("T")[0],
  validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  status: "draft",
  customerName: "", customerEmail: "", customerPhone: "", customerAddress: "",
  notes: "",
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  expired: "bg-orange-100 text-orange-700 border-orange-200",
};

/* ─── Component ───────────────────────────────────────────────── */
export const SalesQuotation = () => {
  // ── list state
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── dialog state
  const [deleteDialog, setDeleteDialog] = useState<Quotation | null>(null);
  const [convertDialog, setConvertDialog] = useState<Quotation | null>(null);

  // ── print
  const [printQuotation, setPrintQuotation] = useState<Quotation | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // ── form state
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [selectedItems, setSelectedItems] = useState<QuotationItem[]>([]);

  // ── customer search
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCustomerDd, setShowCustomerDd] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);

  // ── part search
  const [partSearch, setPartSearch] = useState("");
  const [availableParts, setAvailableParts] = useState<any[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [showPartDd, setShowPartDd] = useState(false);
  const partSearchRef = useRef<HTMLDivElement>(null);

  /* ── fetch quotations ──────────────────────────────────────── */
  const fetchQuotations = useCallback(async () => {
    try {
      const res = await apiClient.getSalesQuotations();
      const data = Array.isArray(res) ? res : (res as any)?.data || [];
      setQuotations(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  /* ── outside-click handler ─────────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setShowCustomerDd(false);
      if (partSearchRef.current && !partSearchRef.current.contains(e.target as Node))
        setShowPartDd(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── customer search ───────────────────────────────────────── */
  useEffect(() => {
    if (!isFormOpen || !showCustomerDd) return;
    const t = setTimeout(async () => {
      setLoadingCustomers(true);
      try {
        const res: any = await apiClient.getCustomers({ search: formData.customerName, limit: 10, status: "active" });
        setCustomers(Array.isArray(res) ? res : res?.data || []);
      } catch { setCustomers([]); }
      finally { setLoadingCustomers(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [isFormOpen, formData.customerName, showCustomerDd]);

  const handleSelectCustomer = useCallback((c: any) => {
    setFormData(prev => ({
      ...prev,
      customerName: c.name || prev.customerName,
      customerEmail: c.email || "",
      customerPhone: c.contactNo || c.cellNumber || "",
      customerAddress: c.address || "",
    }));
    setCustomers([]);
    setShowCustomerDd(false);
  }, []);

  /* ── part search ───────────────────────────────────────────── */
  useEffect(() => {
    if (!isFormOpen || !partSearch.trim()) { setAvailableParts([]); return; }
    const t = setTimeout(async () => {
      setLoadingParts(true);
      try {
        const res: any = await apiClient.getParts({ status: "active", search: partSearch.trim(), limit: 30 });
        let data: any[] = Array.isArray(res) ? res : res?.data || [];
        const searchL = partSearch.toLowerCase();
        data = data.map((p: any) => {
          // API returns: stock/qty/current_stock (all are the same field with different names)
          const rawStock = p.stock ?? p.qty ?? p.current_stock ?? p.currentstock ?? 0;
          const rawReserved = p.reserved_stock ?? p.reservedstock ?? p.reserved ?? 0;
          const stock = Math.max(0, parseInt(String(rawStock)) || 0);
          const reserved = Math.max(0, parseInt(String(rawReserved)) || 0);
          return {
            id: String(p.id),
            partNo: String(p.master_part_no || p.part_no || p.masterPartNo || p.partno || "").trim(),
            description: String(p.description || "").trim(),
            price: parseFloat(p.price_a || p.priceA || p.priceB || p.cost || 0) || 0,
            avgCost: parseFloat(p.avgCost || p.avgcost || p.avg_cost || 0) || 0,
            stock,
            reserved,
            available: Math.max(0, stock - reserved),
          };
        }).filter(p => p.partNo && p.partNo.toLowerCase().includes(searchL));
        setAvailableParts(data);
      } catch { setAvailableParts([]); }
      finally { setLoadingParts(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [isFormOpen, partSearch]);

  const handleAddPart = useCallback((part: any) => {
    setSelectedItems(prev => {
      if (prev.some(i => i.id === part.id)) return prev;
      return [...prev, { id: part.id, partNo: part.partNo, description: part.description, quantity: 1, unitPrice: part.price, avgCost: part.avgCost || 0, total: part.price, available: part.available ?? part.stock ?? 0 }];
    });
    setPartSearch("");
    setAvailableParts([]);
    setShowPartDd(false);
  }, []);

  /* ── item editing ──────────────────────────────────────────── */
  const updateQty = (id: string, qty: number) =>
    setSelectedItems(p => p.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty), total: Math.round(i.unitPrice * Math.max(1, qty) * 100) / 100 } : i));
  const updatePrice = (id: string, price: number) =>
    setSelectedItems(p => p.map(i => i.id === id ? { ...i, unitPrice: Math.max(0, price), total: Math.round(Math.max(0, price) * i.quantity * 100) / 100 } : i));
  const removeItem = (id: string) => setSelectedItems(p => p.filter(i => i.id !== id));

  const grandTotal = useMemo(() => selectedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [selectedItems]);

  /* ── quotation number ──────────────────────────────────────── */
  const generateNo = () => {
    const n = quotations.length + 1;
    return `SQ-${String(n).padStart(3, "0")}`;
  };

  /* ── open/close form ───────────────────────────────────────── */
  const openNew = () => {
    setEditingId(null);
    setFormData({ ...emptyForm(), quotationNo: generateNo() });
    setSelectedItems([]);
    setPartSearch("");
    setCustomers([]);
    setIsFormOpen(true);
  };

  const openEdit = (q: Quotation) => {
    setEditingId(q.id);
    setFormData({
      quotationNo: q.quotationNo, quotationDate: q.date, validUntil: q.validUntil,
      status: q.status, customerName: q.customerName, customerEmail: q.customerEmail,
      customerPhone: q.customerPhone, customerAddress: q.customerAddress, notes: q.notes,
    });
    setSelectedItems(q.items);
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditingId(null); setSelectedItems([]); setPartSearch(""); };

  /* ── submit ────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!formData.customerName.trim()) {
      toast({ title: "Customer name required", variant: "destructive" }); return;
    }
    if (selectedItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        quotationDate: formData.quotationDate, validUntil: formData.validUntil,
        customerName: formData.customerName, customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone, customerAddress: formData.customerAddress,
        status: formData.status, notes: formData.notes,
        items: selectedItems.map(i => ({ partId: i.id, partNo: i.partNo, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
      };
      const res: any = editingId
        ? await apiClient.updateSalesQuotation(editingId, payload)
        : await apiClient.createSalesQuotation(payload);

      if (res?.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }

      toast({ title: editingId ? "Quotation Updated" : "Quotation Created", description: `${formData.quotationNo} saved successfully.` });
      await fetchQuotations();
      closeForm();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  /* ── delete ────────────────────────────────────────────────── */
  const confirmDelete = async () => {
    if (!deleteDialog) return;
    try {
      await apiClient.deleteSalesQuotation(deleteDialog.id);
      toast({ title: "Deleted", description: `${deleteDialog.quotationNo} deleted.` });
      await fetchQuotations();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setDeleteDialog(null);
  };

  /* ── convert ───────────────────────────────────────────────── */
  const confirmConvert = async () => {
    if (!convertDialog) return;
    try {
      const res: any = await apiClient.convertQuotationToInvoice(convertDialog.id, { invoiceDate: new Date().toISOString().split("T")[0], customerType: "registered" });
      if (res?.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: "Converted to Invoice", description: `${convertDialog.quotationNo} converted.` });
      await fetchQuotations();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setConvertDialog(null);
  };

  /* ── print ─────────────────────────────────────────────────── */
  const handlePrint = (q: Quotation) => {
    setPrintQuotation(q);
    setTimeout(() => printDocument(printRef), 100);
  };

  /* ── filtered list ─────────────────────────────────────────── */
  const filtered = quotations.filter(q =>
    q.quotationNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ══════════════════════════════════════════════════════════════
   * FORM VIEW
   * ══════════════════════════════════════════════════════════════ */
  if (isFormOpen) {
    return (
      <div className="space-y-0">
        {/* ── Header Bar ── */}
        <div className="flex items-center justify-between py-3 px-1 mb-4">
          <div className="flex items-center gap-3">
            <button onClick={closeForm} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-lg font-semibold">{editingId ? "Edit Quotation" : "New Quotation"}</h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 font-mono">{formData.quotationNo}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={closeForm}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving} className="gap-2 min-w-[130px]">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : editingId ? "Update" : "Create Quotation"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          {/* ── LEFT COLUMN ── */}
          <div className="space-y-4">

            {/* Customer Card */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" /> Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Customer Name with dropdown */}
                  <div className="relative" ref={customerRef}>
                    <Label className="text-xs text-muted-foreground mb-1 block">Customer Name *</Label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={formData.customerName}
                        onChange={e => { setFormData(p => ({ ...p, customerName: e.target.value })); setShowCustomerDd(true); }}
                        onFocus={() => setShowCustomerDd(true)}
                        placeholder="Search customer..."
                        className="pl-8 h-9"
                      />
                      {loadingCustomers && <RefreshCw className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                    </div>
                    {/* Dropdown */}
                    {showCustomerDd && (customers.length > 0 || loadingCustomers) && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-56 overflow-y-auto">
                        {loadingCustomers
                          ? <div className="px-4 py-3 text-sm text-muted-foreground text-center">Searching...</div>
                          : customers.map(c => {
                            const sub = [c.email, c.contactNo || c.cellNumber, c.address].filter(Boolean).join(" · ");
                            return (
                              <button key={c.id} type="button"
                                onMouseDown={e => { e.preventDefault(); handleSelectCustomer(c); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0">
                                <p className="text-sm font-medium text-foreground">{c.name}</p>
                                {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
                                {!sub && <p className="text-xs text-muted-foreground/50 mt-0.5 italic">No contact info</p>}
                              </button>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Customer Email</Label>
                    <Input value={formData.customerEmail} onChange={e => setFormData(p => ({ ...p, customerEmail: e.target.value }))} placeholder="email@example.com" className="h-9" type="email" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Phone</Label>
                    <Input value={formData.customerPhone} onChange={e => setFormData(p => ({ ...p, customerPhone: e.target.value }))} placeholder="+92 300 0000000" className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Address</Label>
                    <Input value={formData.customerAddress} onChange={e => setFormData(p => ({ ...p, customerAddress: e.target.value }))} placeholder="Customer address" className="h-9" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items Card */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" /> Line Items
                    {selectedItems.length > 0 && <Badge variant="secondary" className="text-xs">{selectedItems.length}</Badge>}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                {/* Part Search */}
                <div className="relative" ref={partSearchRef}>
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={partSearch}
                    onChange={e => { setPartSearch(e.target.value); setShowPartDd(true); }}
                    onFocus={() => partSearch.trim() && setShowPartDd(true)}
                    placeholder="Search parts by part number..."
                    className="pl-8 h-9 pr-8"
                  />
                  {loadingParts && <RefreshCw className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  {partSearch && !loadingParts && <button onClick={() => { setPartSearch(""); setAvailableParts([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>}

                  {/* Parts Dropdown */}
                  {showPartDd && partSearch.trim() && (availableParts.length > 0 || loadingParts) && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                      {loadingParts
                        ? <div className="px-4 py-3 text-sm text-muted-foreground text-center">Searching parts...</div>
                        : availableParts.map(p => {
                          const alreadyAdded = selectedItems.some(i => i.id === p.id);
                          return (
                            <button key={p.id} type="button"
                              onMouseDown={e => { e.preventDefault(); if (!alreadyAdded) handleAddPart(p); }}
                              className={cn(
                                "w-full text-left px-4 py-2.5 transition-colors border-b border-border/50 last:border-0",
                                alreadyAdded ? "bg-primary/5 cursor-default" : "hover:bg-muted"
                              )}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    {alreadyAdded && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                                    <span className="text-sm font-semibold text-foreground">{p.partNo}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                                </div>
                                <div className="text-right flex-shrink-0 space-y-0.5">
                                  <p className="text-sm font-bold text-primary">Rs {p.price.toFixed(2)}</p>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className={cn(
                                      "text-xs font-semibold px-1.5 py-0.5 rounded",
                                      (p.available ?? p.stock) > 0
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-700"
                                    )}>
                                      {(p.available ?? p.stock)} pcs
                                    </span>
                                    <span className="text-xs text-muted-foreground">{alreadyAdded ? "Added" : ""}</span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      }
                    </div>
                  )}
                </div>

                {/* Items table */}
                {selectedItems.length === 0
                  ? (
                    <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Search and add parts above</p>
                    </div>
                  )
                  : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-xs py-2 pl-4">Part No</TableHead>
                            <TableHead className="text-xs py-2">Description</TableHead>
                            <TableHead className="text-xs py-2 text-center w-24">Avail. Qty</TableHead>
                            <TableHead className="text-xs py-2 text-center w-20">Qty</TableHead>
                            <TableHead className="text-xs py-2 text-right w-28">Unit Price</TableHead>
                            <TableHead className="text-xs py-2 text-right w-28">Total</TableHead>
                            <TableHead className="w-10 py-2" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedItems.map((item, idx) => (
                            <TableRow key={item.id} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                              <TableCell className="py-2 pl-4">
                                <span className="font-mono text-xs font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{item.partNo}</span>
                              </TableCell>
                              <TableCell className="py-2 text-sm text-muted-foreground max-w-[160px]">
                                <p className="truncate" title={item.description}>{item.description || "—"}</p>
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                {(() => {
                                  const avail = (item as any).available ?? 0;
                                  return (
                                    <span className={cn(
                                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                                      avail > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                                    )}>
                                      {avail} pcs
                                    </span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Input type="number" min="1" value={item.quantity}
                                  onChange={e => updateQty(item.id, parseInt(e.target.value) || 1)}
                                  className="w-16 h-7 text-center text-sm mx-auto" />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xs text-muted-foreground">Rs</span>
                                  <Input type="number" min="0" step="0.01" value={item.unitPrice}
                                    onChange={e => updatePrice(item.id, parseFloat(e.target.value) || 0)}
                                    className="w-24 h-7 text-right text-sm" />
                                </div>
                              </TableCell>
                              <TableCell className="py-2 text-right font-semibold text-sm">
                                Rs {(item.quantity * item.unitPrice).toFixed(2)}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                }
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardContent className="px-5 py-4">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Notes / Terms</Label>
                <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes, payment terms, delivery details..." rows={3} className="resize-none text-sm" />
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="space-y-4">
            {/* Quotation Details */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Quotation Details
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Quotation No</Label>
                  <Input value={formData.quotationNo} readOnly className="h-9 bg-muted/50 font-mono text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                  <Input type="date" value={formData.quotationDate} onChange={e => setFormData(p => ({ ...p, quotationDate: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Valid Until</Label>
                  <Input type="date" value={formData.validUntil} onChange={e => setFormData(p => ({ ...p, validUntil: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v as Quotation["status"] }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["draft", "sent", "accepted", "rejected", "expired"].map(s => (
                        <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="px-5 py-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-medium">Summary</p>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Items</span>
                    <span className="font-medium">{selectedItems.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Qty</span>
                    <span className="font-medium">{selectedItems.reduce((s, i) => s + i.quantity, 0)}</span>
                  </div>
                  <div className="border-t border-border/60 my-2" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold">Grand Total</span>
                    <span className="text-xl font-bold text-primary">Rs {grandTotal.toFixed(2)}</span>
                  </div>
                </div>
                <Button onClick={handleSubmit} disabled={saving || selectedItems.length === 0 || !formData.customerName.trim()} className="w-full gap-2">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? "Saving..." : editingId ? "Update Quotation" : "Create Quotation"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
   * LIST VIEW
   * ══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search quotations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchQuotations} className="gap-1.5 h-9">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5 h-9">
            <Plus className="w-3.5 h-3.5" /> New Quotation
          </Button>
        </div>
      </div>

      {/* ── Quotations Table ── */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">
            Sales Quotations <span className="text-muted-foreground font-normal">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {filtered.length === 0
            ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No quotations found</p>
                <p className="text-xs mt-1">Create your first quotation to get started</p>
                <Button size="sm" onClick={openNew} className="mt-4 gap-1.5"><Plus className="w-3.5 h-3.5" />New Quotation</Button>
              </div>
            )
            : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-5 text-xs">Quotation #</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Valid Until</TableHead>
                      <TableHead className="text-xs text-center">Items</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((q, idx) => (
                      <TableRow key={q.id} className={cn("group cursor-pointer", idx % 2 === 0 ? "" : "bg-muted/20")} onClick={() => openEdit(q)}>
                        <TableCell className="pl-5 py-3">
                          <span className="font-mono text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">{q.quotationNo}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="font-medium text-sm text-foreground">{q.customerName}</p>
                          {q.customerEmail && <p className="text-xs text-muted-foreground">{q.customerEmail}</p>}
                        </TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground">{q.date}</TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground">{q.validUntil}</TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-semibold">{q.items?.length ?? 0}</span>
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold text-sm">Rs {Number(q.totalAmount || 0).toFixed(2)}</TableCell>
                        <TableCell className="py-3">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium capitalize", STATUS_COLORS[q.status] || STATUS_COLORS.draft)}>
                            {q.status}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 pr-5 text-right" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(q)}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConvertDialog(q)}>
                                <ShoppingCart className="w-4 h-4 mr-2" /> Convert to Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePrint(q)}>
                                <Printer className="w-4 h-4 mr-2" /> Print / PDF
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleteDialog(q)} className="text-destructive focus:text-destructive">
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          }
        </CardContent>
      </Card>

      {/* ── Delete Dialog ── */}
      <AlertDialog open={!!deleteDialog} onOpenChange={v => !v && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-semibold">{deleteDialog?.quotationNo}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Convert Dialog ── */}
      <AlertDialog open={!!convertDialog} onOpenChange={v => !v && setConvertDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Convert <span className="font-semibold">{convertDialog?.quotationNo}</span> for{" "}
              <span className="font-semibold">{convertDialog?.customerName}</span> to a sales invoice?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvert}>Convert</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Hidden Print ── */}
      {printQuotation && (
        <div className="hidden">
          <PrintableDocument ref={printRef} type="quotation" data={{
            documentNo: printQuotation.quotationNo, date: printQuotation.date,
            validUntil: printQuotation.validUntil, customerName: printQuotation.customerName,
            customerEmail: printQuotation.customerEmail, customerPhone: printQuotation.customerPhone,
            customerAddress: printQuotation.customerAddress, status: printQuotation.status,
            items: printQuotation.items, totalAmount: printQuotation.totalAmount, notes: printQuotation.notes,
          }} />
        </div>
      )}
    </div>
  );
};
