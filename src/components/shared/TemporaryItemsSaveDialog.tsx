import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TemporaryItemDraft = {
  id: string;
  partNo: string;
  masterPartNo: string;
  brand: string;
  description: string;
  weight?: number;
  origin?: string;
  save: boolean;
};

type TemporaryItemsSaveDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  items: Array<{
    id: string;
    partNo?: string | null;
    masterPartNo?: string | null;
    description?: string | null;
    brand?: string | null;
    weight?: number | null;
    origin?: string | null;
  }>;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueWithoutSaving: () => void;
  onSaveSelectedAndContinue: (items: TemporaryItemDraft[]) => void | Promise<void>;
};

export function TemporaryItemsSaveDialog({
  open,
  title = "Temporary items not in item master",
  description = "Select items to save into the item master. Unselected items will be excluded from the next document.",
  items,
  busy = false,
  onOpenChange,
  onContinueWithoutSaving,
  onSaveSelectedAndContinue,
}: TemporaryItemsSaveDialogProps) {
  const [drafts, setDrafts] = useState<TemporaryItemDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setDrafts(
      items.map((item) => ({
        id: item.id,
        partNo: String(item.partNo || "").trim(),
        masterPartNo: String(item.masterPartNo || "").trim(),
        brand: String(item.brand || "").trim(),
        description: String(item.description || "").trim(),
        weight: Number(item.weight || 0) || undefined,
        origin: String(item.origin || "").trim() || undefined,
        save: true,
      })),
    );
  }, [open, items]);

  const selected = drafts.filter((d) => d.save);
  const missingPartNo = selected.some((d) => !String(d.partNo || "").trim());

  const updateDraft = (id: string, patch: Partial<TemporaryItemDraft>) => {
    setDrafts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="p-2 text-left w-14">Save</th>
                <th className="p-2 text-left">Part No</th>
                <th className="p-2 text-left">Master Part</th>
                <th className="p-2 text-left w-[140px]">Brand</th>
                <th className="p-2 text-left">Description</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="p-2">
                    <Checkbox
                      checked={row.save}
                      onCheckedChange={(checked) =>
                        updateDraft(row.id, { save: Boolean(checked) })
                      }
                      disabled={busy}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.partNo}
                      onChange={(e) =>
                        updateDraft(row.id, { partNo: e.target.value })
                      }
                      placeholder="Part no"
                      disabled={busy || !row.save}
                      className="h-9"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.masterPartNo}
                      onChange={(e) =>
                        updateDraft(row.id, { masterPartNo: e.target.value })
                      }
                      placeholder="Master part"
                      disabled={busy || !row.save}
                      className="h-9"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.brand}
                      onChange={(e) =>
                        updateDraft(row.id, { brand: e.target.value })
                      }
                      placeholder="Brand"
                      disabled={busy || !row.save}
                      className="h-9"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.description}
                      onChange={(e) =>
                        updateDraft(row.id, { description: e.target.value })
                      }
                      placeholder="Description"
                      disabled={busy || !row.save}
                      className="h-9"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missingPartNo ? (
          <p className="text-xs text-destructive">
            Selected items need a part number before they can be saved.
          </p>
        ) : (
          <Label className="text-xs text-muted-foreground">
            {selected.length} of {drafts.length} selected to save.
          </Label>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onContinueWithoutSaving}
          >
            Continue without saving
          </Button>
          <Button
            type="button"
            disabled={busy || selected.length === 0 || missingPartNo}
            onClick={() => void onSaveSelectedAndContinue(selected)}
          >
            {busy ? "Saving..." : `Save selected (${selected.length}) & continue`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
