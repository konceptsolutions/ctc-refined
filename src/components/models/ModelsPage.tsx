import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { PartIdentityBadges } from "@/components/parts/PartIdentityBadges";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface ModelRow {
  id: string;
  name: string;
  qtyUsed: number;
  partId: string;
  partNo: string;
  masterPartNo: string;
  description: string;
  brand: string;
  application: string;
}

const emptyForm = {
  partId: "",
  name: "",
  qtyUsed: "1",
};

export const ModelsPage = () => {
  const { canCreate, canEdit, canDelete } = usePageActions("partentry.models");

  const [models, setModels] = useState<ModelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [partOptions, setPartOptions] = useState<SearchableSelectOption[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<ModelRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getModels({
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
        setModels([]);
        setTotal(0);
        return;
      }

      const payload = (response as any).data ?? response;
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      setModels(
        rows.map((row: any) => ({
          id: String(row.id),
          name: String(row.name || ""),
          qtyUsed: Number(row.qtyUsed ?? row.qty_used ?? 1) || 1,
          partId: String(row.partId || row.part_id || ""),
          partNo: String(row.partNo || row.part_no || ""),
          masterPartNo: String(row.masterPartNo || row.master_part_no || ""),
          description: String(row.description || ""),
          brand: String(row.brand || ""),
          application: String(row.application || ""),
        })),
      );
      setTotal(Number(payload?.total ?? rows.length) || rows.length);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load models",
        variant: "destructive",
      });
      setModels([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const loadPartOptions = useCallback(async (query?: string) => {
    setLoadingParts(true);
    try {
      const response = await apiClient.getParts({
        search: query?.trim() || undefined,
        limit: 80,
        page: 1,
      });
      if (response.error) {
        setPartOptions([]);
        return;
      }

      const payload = (response as any).data ?? response;
      const partsData = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

      setPartOptions(
        partsData.map((p: any) => {
          const uiPartNo = String(p.master_part_no || p.partNo || "").trim();
          const uiMasterPart = String(p.part_no || p.masterPartNo || "").trim();
          const brand = String(p.brand_name || p.brand || "").trim();
          const description = String(p.description || "").trim();
          return {
            value: String(p.id),
            label: uiPartNo || uiMasterPart || String(p.id),
            description: [brand, description].filter(Boolean).join(" · ") || undefined,
            uiPartNo,
            uiMasterPart,
            familyKey: uiMasterPart || undefined,
          } satisfies SearchableSelectOption;
        }),
      );
    } catch {
      setPartOptions([]);
    } finally {
      setLoadingParts(false);
    }
  }, []);

  const openAdd = async () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
    await loadPartOptions();
  };

  const openEdit = (row: ModelRow) => {
    setEditing(row);
    setForm({
      partId: row.partId,
      name: row.name,
      qtyUsed: String(row.qtyUsed || 1),
    });
    setPartOptions([
      {
        value: row.partId,
        label: row.partNo || row.masterPartNo || row.partId,
        description: [row.brand, row.description].filter(Boolean).join(" · ") || undefined,
        uiPartNo: row.partNo,
        uiMasterPart: row.masterPartNo,
      },
    ]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const qtyUsed = Math.max(1, parseInt(form.qtyUsed, 10) || 1);

    if (!name) {
      toast({
        title: "Validation",
        description: "Model name is required",
        variant: "destructive",
      });
      return;
    }

    if (!editing && !form.partId) {
      toast({
        title: "Validation",
        description: "Select a part for the model",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const response = await apiClient.updateModel(editing.id, {
          name,
          qtyUsed,
        });
        if (response.error) {
          throw new Error(response.error);
        }
        const payload = (response as any).data ?? response;
        const renamedCount = Number(payload?.renamedCount || 0);
        const nameChanged = Boolean(payload?.nameChanged);
        toast({
          title: "Model updated",
          description: nameChanged
            ? `Renamed on ${renamedCount} part${renamedCount === 1 ? "" : "s"}`
            : undefined,
        });
      } else {
        const response = await apiClient.createModel({
          partId: form.partId,
          name,
          qtyUsed,
        });
        if (response.error) {
          throw new Error(response.error);
        }
        toast({ title: "Model added" });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadModels();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save model",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!modelToDelete) return;
    setDeleting(true);
    try {
      const response = await apiClient.deleteModel(modelToDelete.id);
      if (response.error) {
        throw new Error(response.error);
      }
      toast({ title: "Model deleted" });
      setDeleteOpen(false);
      setModelToDelete(null);
      await loadModels();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete model",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const selectedPartLabel = useMemo(() => {
    if (!editing) return undefined;
    return editing.partNo || editing.masterPartNo || undefined;
  }, [editing]);

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-8 bg-primary rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Models</h1>
            <p className="text-sm text-muted-foreground">
              All machine models linked to parts — add or update anytime
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => loadModels()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canCreate && (
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              Add Model
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model, part no, master part, brand…"
            className="pl-10 h-9"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {loading ? "Loading…" : `${total} model${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden flex-1 min-h-0">
        <div className="overflow-auto max-h-[calc(100vh-260px)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="font-semibold">Model</TableHead>
                <TableHead className="font-semibold text-center w-28">
                  Qty Used
                </TableHead>
                <TableHead className="font-semibold">Part No | Master Part</TableHead>
                <TableHead className="font-semibold">Description</TableHead>
                <TableHead className="font-semibold">Brand</TableHead>
                <TableHead className="font-semibold text-center w-28">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading models…
                    </div>
                  </TableCell>
                </TableRow>
              ) : models.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {debouncedSearch
                      ? `No models match "${debouncedSearch}".`
                      : 'No models yet. Click "Add Model" to create one.'}
                  </TableCell>
                </TableRow>
              ) : (
                models.map((row, index) => (
                  <TableRow key={row.id}>
                    <ListNumberCell index={index} total={models.length} />
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">{row.qtyUsed}</TableCell>
                    <TableCell>
                      <PartIdentityBadges
                        partNo={row.partNo}
                        masterPart={row.masterPartNo}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                      {row.description || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row.brand || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(row)}
                            title="Edit model"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              setModelToDelete(row);
                              setDeleteOpen(true);
                            }}
                            title="Delete model"
                          >
                            <Trash className="w-4 h-4" />
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
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Update Model" : "Add Model"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changing the model name renames it on every part that uses this model. Qty used updates only this part."
                : "Link a machine model to a part with quantity used."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Part</Label>
              {editing ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <PartIdentityBadges
                    partNo={editing.partNo}
                    masterPart={editing.masterPartNo}
                  />
                  {editing.description ? (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {editing.description}
                    </p>
                  ) : null}
                </div>
              ) : (
                <SearchableSelect
                  options={partOptions}
                  value={form.partId || undefined}
                  selectedLabel={selectedPartLabel}
                  placeholder={loadingParts ? "Loading parts…" : "Select part"}
                  onSearchChange={(q) => {
                    void loadPartOptions(q);
                  }}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, partId: v }))
                  }
                  requireSearchAbove={Number.MAX_SAFE_INTEGER}
                  maxDisplayedOptions={80}
                  selectedDisplayLabelOnly
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model-name">Model name</Label>
              <Input
                id="model-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. 140G"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model-qty">Qty used</Label>
              <Input
                id="model-qty"
                type="number"
                min={1}
                value={form.qtyUsed}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, qtyUsed: e.target.value }))
                }
                className="w-32"
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
                  Saving…
                </>
              ) : editing ? (
                "Update"
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Delete model "{modelToDelete?.name}" from part{" "}
              {modelToDelete?.partNo || modelToDelete?.masterPartNo || ""}?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
