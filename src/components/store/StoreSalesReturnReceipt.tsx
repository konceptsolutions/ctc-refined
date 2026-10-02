import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { PackagePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import {
  performedByPayload,
  useStoreOperatorAuth,
} from "@/hooks/useStoreOperatorAuth";

export interface SalesReturnReceiveItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  returnQuantity: number;
}

export interface SalesReturnReceiveOrder {
  id: string;
  returnNumber: string;
  returnDate: string;
  customerName: string;
  invoiceLabel: string;
  isDirectReturn: boolean;
  status: string;
  items: SalesReturnReceiveItem[];
}

interface Rack {
  id: string;
  codeNo?: string;
  storeId?: string;
  shelves: Array<{ id: string; shelfNo?: string; rackId?: string }>;
}

interface ItemLocation {
  storeId: string;
  rackId: string;
  shelfId: string;
}

interface StoreSalesReturnReceiptProps {
  salesReturn: SalesReturnReceiveOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName?: string;
  onReceived?: () => void;
}

function pickBestPartLocation(
  locations: any[],
  preferredStoreId?: string,
): ItemLocation | null {
  const allocated = (locations || []).filter(
    (l: any) => !l.isUnlocated && (l.rackId || l.shelfId),
  );
  if (!allocated.length) return null;

  const preferred = preferredStoreId
    ? allocated.filter(
        (l: any) => String(l.storeId ?? "") === String(preferredStoreId),
      )
    : [];
  const pool = preferred.length > 0 ? preferred : allocated;
  const best = [...pool].sort(
    (a: any, b: any) => Number(b.quantity || 0) - Number(a.quantity || 0),
  )[0];
  if (!best) return null;

  return {
    storeId: best.storeId != null ? String(best.storeId) : "",
    rackId: best.rackId != null ? String(best.rackId) : "",
    shelfId: best.shelfId != null ? String(best.shelfId) : "",
  };
}

export const StoreSalesReturnReceipt = ({
  salesReturn,
  open,
  onOpenChange,
  storeId,
  storeName,
  onReceived,
}: StoreSalesReturnReceiptProps) => {
  const { requiresOperatorAuth, requestOperatorAuth } = useStoreOperatorAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [itemLocations, setItemLocations] = useState<
    Record<string, ItemLocation>
  >({});

  const effectiveStoreId =
    storeId && storeId !== "all" ? storeId : "";

  useEffect(() => {
    if (!open || !salesReturn) return;
    const initial: Record<string, ItemLocation> = {};
    salesReturn.items.forEach((item) => {
      initial[item.id] = { storeId: effectiveStoreId, rackId: "", shelfId: "" };
    });
    setItemLocations(initial);
  }, [open, salesReturn?.id, effectiveStoreId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingRacks(true);
        // Load all racks so associated locations from any store can auto-select
        const response = await apiClient.getRacks(undefined);
        const rows = (response as any)?.data || response;
        if (cancelled) return;
        if (Array.isArray(rows)) {
          setRacks(
            rows.map((r: any) => ({
              id: String(r.id),
              codeNo: r.codeNo || r.code_no,
              storeId: r.storeId || r.store_id,
              shelves: (r.shelves || r.Shelf || []).map((s: any) => ({
                id: String(s.id),
                shelfNo: s.shelfNo || s.shelf_no,
                rackId: String(s.rackId || s.rack_id || r.id),
              })),
            })),
          );
        } else {
          setRacks([]);
        }
      } catch {
        if (!cancelled) {
          setRacks([]);
          toast.error("Failed to load racks/shelves");
        }
      } finally {
        if (!cancelled) setLoadingRacks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Auto-select each part's associated rack/shelf (prefer selected store, else highest qty)
  useEffect(() => {
    if (!open || !salesReturn?.items?.length) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingLocations(true);
        const partIds = Array.from(
          new Set(
            salesReturn.items
              .map((i) => String(i.partId || ""))
              .filter(Boolean),
          ),
        );
        const responses = await Promise.all(
          partIds.map((pid) =>
            apiClient.getPartLocations(pid).catch(() => ({ data: [] })),
          ),
        );
        if (cancelled) return;

        const bestByPart: Record<string, ItemLocation> = {};
        partIds.forEach((pid, idx) => {
          const resp = responses[idx] as any;
          const locations = Array.isArray(resp?.data)
            ? resp.data
            : Array.isArray(resp)
              ? resp
              : [];
          const best = pickBestPartLocation(locations, effectiveStoreId || undefined);
          if (best?.rackId) bestByPart[pid] = best;
        });

        setItemLocations((prev) => {
          const next = { ...prev };
          for (const item of salesReturn.items) {
            const best = bestByPart[String(item.partId)];
            if (!best) continue;
            const current = next[item.id];
            // Only auto-fill empty selections so manual edits are kept
            if (current?.rackId && current?.shelfId) continue;
            next[item.id] = {
              storeId: best.storeId || effectiveStoreId || current?.storeId || "",
              rackId: best.rackId,
              shelfId: best.shelfId,
            };
          }
          return next;
        });
      } catch {
        // Non-blocking — user can still pick manually
      } finally {
        if (!cancelled) setLoadingLocations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, salesReturn?.id, effectiveStoreId]);

  const racksForStore = useMemo(() => {
    if (!effectiveStoreId) return racks;
    return racks.filter(
      (r) => !r.storeId || String(r.storeId) === String(effectiveStoreId),
    );
  }, [racks, effectiveStoreId]);

  const getShelvesForRack = (rackId: string) => {
    const rack =
      racksForStore.find((r) => r.id === rackId) ||
      racks.find((r) => r.id === rackId);
    return rack?.shelves || [];
  };

  const handleConfirm = async () => {
    if (!salesReturn) return;

    for (const item of salesReturn.items) {
      const loc = itemLocations[item.id];
      if (!loc?.rackId || !loc?.shelfId) {
        toast.error(
          `Select rack and shelf for ${item.partNo || "return item"}.`,
        );
        return;
      }
      const itemStore = loc.storeId || effectiveStoreId;
      if (!itemStore) {
        toast.error(
          `Select a store (or associated location) for ${item.partNo || "return item"}.`,
        );
        return;
      }
    }

    try {
      setIsConfirming(true);
      const operator = await requestOperatorAuth();
      if (requiresOperatorAuth && !operator) return;
      const by = performedByPayload(operator);

      const defaultStore =
        effectiveStoreId ||
        salesReturn.items
          .map((i) => itemLocations[i.id]?.storeId)
          .find(Boolean) ||
        "";

      const locations = salesReturn.items.map((item) => ({
        item_id: item.id,
        part_id: item.partId,
        store_id:
          itemLocations[item.id]?.storeId || effectiveStoreId || defaultStore,
        rack_id: itemLocations[item.id]?.rackId || null,
        shelf_id: itemLocations[item.id]?.shelfId || null,
        quantity: item.returnQuantity,
      }));

      const response = await apiClient.receiveSalesReturn(salesReturn.id, {
        store_id: defaultStore || null,
        received_by: operator?.name || by.performedBy || "Store Operator",
        locations,
        ...by,
      });

      if ((response as any)?.error) {
        toast.error((response as any).error || "Failed to receive return");
        return;
      }

      toast.success(
        (response as any)?.message ||
          `Return ${salesReturn.returnNumber} stocked in`,
      );
      onOpenChange(false);
      onReceived?.();
    } catch (error: any) {
      toast.error(error?.message || "Failed to receive return stock");
    } finally {
      setIsConfirming(false);
    }
  };

  if (!salesReturn) return null;

  const busy = loadingRacks || loadingLocations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5" />
            Invoice Return Receive
          </DialogTitle>
          <DialogDescription>
            Stock in returned items for{" "}
            <span className="font-medium text-foreground">
              {salesReturn.returnNumber}
            </span>
            {salesReturn.isDirectReturn ? " (Direct Sale Return)" : " (Sale Return)"}
            {storeName ? ` → ${storeName}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
          <div>
            <div className="text-muted-foreground text-xs">Return No</div>
            <div className="font-medium">{salesReturn.returnNumber}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Date</div>
            <div className="font-medium">{salesReturn.returnDate}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Customer</div>
            <div className="font-medium">{salesReturn.customerName || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Invoice</div>
            <div className="font-medium">{salesReturn.invoiceLabel || "—"}</div>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>Part No</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead>Shelf</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesReturn.items.map((item, index) => {
                const loc = itemLocations[item.id] || {
                  storeId: "",
                  rackId: "",
                  shelfId: "",
                };
                const shelves = getShelvesForRack(loc.rackId);
                // Ensure selected rack appears even if from another store when All Stores
                const rackOptions = (() => {
                  if (
                    loc.rackId &&
                    !racksForStore.some((r) => r.id === loc.rackId)
                  ) {
                    const extra = racks.find((r) => r.id === loc.rackId);
                    return extra ? [...racksForStore, extra] : racksForStore;
                  }
                  return racksForStore;
                })();
                return (
                  <TableRow key={item.id}>
                    <ListNumberCell
                      index={index}
                      total={salesReturn.items.length}
                    />
                    <TableCell className="font-medium">{item.partNo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.returnQuantity}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={loc.rackId || undefined}
                        disabled={busy || isConfirming}
                        onValueChange={(rackId) => {
                          const rack =
                            racks.find((r) => r.id === rackId) ||
                            racksForStore.find((r) => r.id === rackId);
                          setItemLocations((prev) => ({
                            ...prev,
                            [item.id]: {
                              storeId:
                                (rack?.storeId
                                  ? String(rack.storeId)
                                  : "") ||
                                prev[item.id]?.storeId ||
                                effectiveStoreId,
                              rackId,
                              shelfId: "",
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue placeholder={busy ? "Loading…" : "Rack"} />
                        </SelectTrigger>
                        <SelectContent>
                          {rackOptions.map((rack) => (
                            <SelectItem key={rack.id} value={rack.id}>
                              {rack.codeNo || rack.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={loc.shelfId || undefined}
                        disabled={!loc.rackId || isConfirming}
                        onValueChange={(shelfId) =>
                          setItemLocations((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], shelfId },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue placeholder="Shelf" />
                        </SelectTrigger>
                        <SelectContent>
                          {shelves.map((shelf) => (
                            <SelectItem key={shelf.id} value={shelf.id}>
                              {shelf.shelfNo || shelf.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirming || busy}>
            {isConfirming ? "Receiving…" : "Confirm Stock In"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
