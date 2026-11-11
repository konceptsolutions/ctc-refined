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
import { cn } from "@/lib/utils";

interface ModelSummaryRow {
  name: string;
  partCount: number;
}

interface ModelPartRow {
  id: string;
  partNo: string;
  masterPartNo: string;
  description: string;
  brand: string;
  category: string;
  status: string;
  qtyUsed: number;
}

interface ModelsPageProps {
  /**
   * `page` — full Models page (HS-code style table).
   * `column` — Attributes grid column matching Categories/Brands cards.
   */
  variant?: "page" | "column";
  /** @deprecated use variant="column" */
  embedded?: boolean;
  className?: string;
}

export const ModelsPage = ({
  variant,
  embedded = false,
  className,
}: ModelsPageProps) => {
  const layout = variant ?? (embedded ? "column" : "page");
  const isColumn = layout === "column";
  const { canEdit } = usePageActions("partentry.models");

  const [rows, setRows] = useState<ModelSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ModelSummaryRow | null>(null);
  const [newModelName, setNewModelName] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<ModelSummaryRow | null>(null);
  const [viewParts, setViewParts] = useState<ModelPartRow[]>([]);
  const [loadingViewParts, setLoadingViewParts] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getModelsSummary({
        search: debouncedSearch || undefined,
        page: 1,
        limit: 500,
      });
      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to load models",
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
          name: String(row.name || row.modelName || row.model_name || "").trim(),
          partCount: Number(row.partCount ?? row.part_count ?? 0) || 0,
        })),
      );
      setTotal(Number(payload?.total ?? list.length) || list.length);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load models",
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

  const openEdit = (row: ModelSummaryRow) => {
    setEditing(row);
    setNewModelName(row.name);
    setDialogOpen(true);
  };

  const openView = async (row: ModelSummaryRow) => {
    setViewing(row);
    setViewOpen(true);
    setLoadingViewParts(true);
    setViewParts([]);
    try {
      const response = await apiClient.getPartsByModel(row.name, {
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
          id: String(part.id || part.partId || ""),
          partNo: String(part.partNo || part.part_no || "").trim(),
          masterPartNo: String(
            part.masterPartNo || part.master_part_no || "",
          ).trim(),
          description: String(part.description || "").trim(),
          brand: String(part.brand || part.brand_name || "").trim(),
          category: String(part.category || part.category_name || "").trim(),
          status: String(part.status || "active").trim(),
          qtyUsed: Number(part.qtyUsed ?? part.qty_used ?? 1) || 1,
        })),
      );
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load items for this model",
        variant: "destructive",
      });
      setViewParts([]);
    } finally {
      setLoadingViewParts(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const to = newModelName.trim();
    if (!to) {
      toast({
        title: "Validation",
        description: "Model name is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await apiClient.renameModel({
        from: editing.name,
        to,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      const payload = (response as any).data ?? response;
      const updatedCount = Number(payload?.updatedCount || 0);
      toast({
        title: "Model updated",
        description:
          updatedCount > 0
            ? `Renamed on ${updatedCount} item${updatedCount === 1 ? "" : "s"}`
            : "No items needed changing",
      });
      setDialogOpen(false);
      setEditing(null);
      setNewModelName("");
      await loadRows();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update model",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const dialogs = (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setNewModelName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Model</DialogTitle>
            <DialogDescription>
              This will rename the model on every item that currently uses{" "}
              <span className="font-medium text-foreground">
                {editing?.name}
              </span>
              {editing
                ? ` (${editing.partCount} item${editing.partCount === 1 ? "" : "s"})`
                : ""}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Current model</Label>
              <Input
                value={editing?.name || ""}
                disabled
                className="bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-model-name">New model name</Label>
              <Input
                id="new-model-name"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="Enter new model name"
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
            <DialogTitle>Items with Model</DialogTitle>
            <DialogDescription>
              All items currently using{" "}
              <span className="font-medium text-foreground">
                {viewing?.name}
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
                      Qty Used
                    </TableHead>
                    <TableHead className="font-semibold text-center w-28">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingViewParts ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center">
                        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading items…
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : viewParts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-12 text-center text-sm text-muted-foreground"
                      >
                        No items found for this model.
                      </TableCell>
                    </TableRow>
                  ) : (
                    viewParts.map((part, index) => (
                      <TableRow key={part.id || `${part.partNo}-${index}`}>
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
                        <TableCell className="text-center tabular-nums">
                          {part.qtyUsed}
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
    </>
  );

  if (isColumn) {
    return (
      <div
        className={cn(
          "bg-card rounded-xl border border-border flex flex-col",
          className,
        )}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between mb-3 min-h-[40px]">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Models List
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-8 text-xs shrink-0"
              onClick={() => loadRows()}
              disabled={loading}
              title="Refresh models"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs flex-1"
              data-preserve-case="true"
            />
          </div>
        </div>
        <div className="px-4 py-2 border-b border-border">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `All (${total})`}
          </p>
        </div>
        <div className="p-3 space-y-2 max-h-[min(70vh,720px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading models…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? `No models match "${debouncedSearch}".`
                : "No models found."}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.name}
                className="border border-border rounded-lg p-3 bg-background"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">
                      {row.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.partCount} item{row.partCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      title="View items"
                      onClick={() => void openView(row)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Rename model"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full min-h-0 flex flex-col overflow-hidden",
        className,
      )}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-8 bg-primary rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Models</h1>
            <p className="text-sm text-muted-foreground">
              All machine models in use — updating one renames it on every
              matching item
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
            placeholder="Search model…"
            className="pl-10 h-9"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {loading ? "Loading…" : `${total} model${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden [&>div]:h-full [&>div]:max-h-full [&>div]:overflow-y-auto [&>div]:overflow-x-auto [&>div]:[scrollbar-gutter:stable]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="font-semibold">Model</TableHead>
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
                      Loading models…
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
                      ? `No models match "${debouncedSearch}".`
                      : "No models found on any items."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.name}>
                    <ListNumberCell index={index} total={rows.length} />
                    <TableCell className="font-medium">{row.name}</TableCell>
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
                            title="Update model name"
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
      {dialogs}
    </div>
  );
};
