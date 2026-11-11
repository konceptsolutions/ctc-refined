import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Pencil, RefreshCw, Search } from "lucide-react";
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
import { usePageActions } from "@/permissions/pageActions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PartIdentityBadges } from "@/components/parts/PartIdentityBadges";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface HsCodeRow {
  hsCode: string;
  partCount: number;
}

interface HsCodePartRow {
  id: string;
  partNo: string;
  masterPartNo: string;
  description: string;
  brand: string;
  category: string;
  status: string;
  uom: string;
}

export const HsCodesPage = () => {
  const { canEdit } = usePageActions("partentry.hs-codes");

  const [rows, setRows] = useState<HsCodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<HsCodeRow | null>(null);
  const [newHsCode, setNewHsCode] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<HsCodeRow | null>(null);
  const [viewParts, setViewParts] = useState<HsCodePartRow[]>([]);
  const [loadingViewParts, setLoadingViewParts] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getHsCodes({
        search: debouncedSearch || undefined,
        page: 1,
        limit: 500,
      });
      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to load HS codes",
          variant: "destructive",
        });
        setRows([]);
        setTotal(0);
        return;
      }

      const payload = (response as any).data ?? response;
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      setRows(
        list.map((row: any) => ({
          hsCode: String(row.hsCode || row.hs_code || "").trim(),
          partCount: Number(row.partCount ?? row.part_count ?? 0) || 0,
        })),
      );
      setTotal(Number(payload?.total ?? list.length) || list.length);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load HS codes",
        variant: "destructive",
      });
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const openEdit = (row: HsCodeRow) => {
    setEditing(row);
    setNewHsCode(row.hsCode);
    setDialogOpen(true);
  };

  const openView = async (row: HsCodeRow) => {
    setViewing(row);
    setViewOpen(true);
    setLoadingViewParts(true);
    setViewParts([]);
    try {
      const response = await apiClient.getPartsByHsCode(row.hsCode, {
        limit: 2000,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      const payload = (response as any).data ?? response;
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];
      setViewParts(
        list.map((part: any) => ({
          id: String(part.id),
          partNo: String(part.partNo || part.part_no || "").trim(),
          masterPartNo: String(
            part.masterPartNo || part.master_part_no || "",
          ).trim(),
          description: String(part.description || "").trim(),
          brand: String(part.brand || part.brand_name || "").trim(),
          category: String(part.category || part.category_name || "").trim(),
          status: String(part.status || "active").trim(),
          uom: String(part.uom || "").trim(),
        })),
      );
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load items for this HS code",
        variant: "destructive",
      });
      setViewParts([]);
    } finally {
      setLoadingViewParts(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const to = newHsCode.trim();
    if (!to) {
      toast({
        title: "Validation",
        description: "HS code is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await apiClient.updateHsCode({
        from: editing.hsCode,
        to,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      const payload = (response as any).data ?? response;
      const updatedCount = Number(payload?.updatedCount || 0);
      toast({
        title: "HS code updated",
        description:
          updatedCount > 0
            ? `Updated on ${updatedCount} item${updatedCount === 1 ? "" : "s"}`
            : "No items needed changing",
      });
      setDialogOpen(false);
      setEditing(null);
      setNewHsCode("");
      await loadRows();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update HS code",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-8 bg-primary rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">HS Codes</h1>
            <p className="text-sm text-muted-foreground">
              All HS codes in use — updating one renames it on every matching item
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => loadRows()}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 mb-4 shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search HS code…"
            className="pl-10 h-9"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {loading ? "Loading…" : `${total} HS code${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
        {/*
          Table wraps itself in overflow-auto; force that wrapper to fill this
          panel so the list scrolls inside the page instead of growing forever.
        */}
        <div className="flex-1 min-h-0 overflow-hidden [&>div]:h-full [&>div]:max-h-full [&>div]:overflow-y-auto [&>div]:overflow-x-auto [&>div]:[scrollbar-gutter:stable]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="font-semibold">HS Code</TableHead>
                <TableHead className="font-semibold text-center w-40">
                  Items
                </TableHead>
                <TableHead className="font-semibold text-center w-36">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center">
                    <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading HS codes…
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {debouncedSearch
                      ? `No HS codes match "${debouncedSearch}".`
                      : "No HS codes found on any items."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.hsCode}>
                    <ListNumberCell index={index} total={rows.length} />
                    <TableCell className="font-medium part-code-font font-mono">
                      {row.hsCode}
                    </TableCell>
                    <TableCell className="text-center">{row.partCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void openView(row)}
                          title="View items"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(row)}
                            title="Update HS code"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setNewHsCode("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update HS Code</DialogTitle>
            <DialogDescription>
              This will update the HS code on every item that currently uses{" "}
              <span className="font-medium text-foreground part-code-font font-mono">
                {editing?.hsCode}
              </span>
              {editing ? ` (${editing.partCount} item${editing.partCount === 1 ? "" : "s"})` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Current HS code</Label>
              <Input
                value={editing?.hsCode || ""}
                disabled
                className="part-code-font font-mono bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-hs-code">New HS code</Label>
              <Input
                id="new-hs-code"
                value={newHsCode}
                onChange={(e) => setNewHsCode(e.target.value)}
                placeholder="Enter new HS code"
                className="part-code-font font-mono"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating…
                </>
              ) : (
                "Update"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewOpen}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) {
            setViewing(null);
            setViewParts([]);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Items with HS Code</DialogTitle>
            <DialogDescription>
              All items currently using{" "}
              <span className="font-medium text-foreground part-code-font font-mono">
                {viewing?.hsCode}
              </span>
              {!loadingViewParts
                ? ` (${viewParts.length} item${viewParts.length === 1 ? "" : "s"})`
                : ""}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
            <div className="h-full max-h-[min(60vh,520px)] overflow-auto [scrollbar-gutter:stable]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/50">
                    <ListNumberHeader />
                    <TableHead className="font-semibold">
                      Part No | Master Part
                    </TableHead>
                    <TableHead className="font-semibold">Description</TableHead>
                    <TableHead className="font-semibold">Brand</TableHead>
                    <TableHead className="font-semibold text-center w-28">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingViewParts ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center">
                        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading items…
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : viewParts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-12 text-center text-sm text-muted-foreground"
                      >
                        No items found for this HS code.
                      </TableCell>
                    </TableRow>
                  ) : (
                    viewParts.map((part, index) => (
                      <TableRow key={part.id}>
                        <ListNumberCell
                          index={index}
                          total={viewParts.length}
                        />
                        <TableCell>
                          <PartIdentityBadges
                            partNo={part.partNo}
                            masterPart={part.masterPartNo}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                          {part.description || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {part.brand || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              String(part.status).toLowerCase() === "active"
                                ? "default"
                                : "secondary"
                            }
                            className="capitalize"
                          >
                            {part.status || "active"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
