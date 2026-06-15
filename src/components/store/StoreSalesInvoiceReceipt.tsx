import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Truck } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface InvoiceRackShelfEntry {
  storeId?: string | null;
  rackId?: string | null;
  shelfId?: string | null;
  quantity?: number;
}

interface SalesInvoiceItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  orderedQty: number;
  deliveredQty: number;
  unitPrice: number;
  avgCost?: number;
  lineTotal: number;
  invoiceRackShelf?: InvoiceRackShelfEntry[];
}

interface PartLocationOption {
  id: string;
  label: string;
  storeId?: string | null;
  rackId?: string | null;
  shelfId?: string | null;
  isUnlocated?: boolean;
  quantity?: number;
}

const pickDefaultLocationPrsId = (
  partId: string,
  locOptions: PartLocationOption[],
  invoiceAssignments?: InvoiceRackShelfEntry[],
  previousOut?: {
    storeId?: string | null;
    rackId?: string | null;
    shelfId?: string | null;
  },
): string => {
  if (!locOptions.length) return "";

  const matchTriplet = (
    storeId?: string | null,
    rackId?: string | null,
    shelfId?: string | null,
  ) =>
    locOptions.find(
      (option) =>
        String(option.storeId ?? "") === String(storeId ?? "") &&
        String(option.rackId ?? "") === String(rackId ?? "") &&
        String(option.shelfId ?? "") === String(shelfId ?? ""),
    )?.id;

  if (previousOut) {
    const previousMatch = matchTriplet(
      previousOut.storeId,
      previousOut.rackId,
      previousOut.shelfId,
    );
    if (previousMatch) return previousMatch;
    if (!previousOut.rackId && !previousOut.shelfId && !previousOut.storeId) {
      const unallocated = locOptions.find((option) =>
        String(option.id).startsWith(`unallocated-${partId}`),
      );
      if (unallocated) return unallocated.id;
    }
  }

  if (invoiceAssignments?.length) {
    const bestAssignment = [...invoiceAssignments].sort(
      (a, b) => Number(b.quantity || 0) - Number(a.quantity || 0),
    )[0];
    const assignmentMatch = matchTriplet(
      bestAssignment.storeId,
      bestAssignment.rackId,
      bestAssignment.shelfId,
    );
    if (assignmentMatch) return assignmentMatch;
  }

  const located = locOptions.filter(
    (option) =>
      !option.isUnlocated && !String(option.id).startsWith("unallocated-"),
  );
  if (located.length > 0) return located[0].id;

  return locOptions[0].id;
};

interface SalesInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  status: string;
  grandTotal: number;
  deliveredTo?: string;
  items?: SalesInvoiceItem[];
}

interface StoreSalesInvoiceReceiptProps {
  invoice: SalesInvoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliveryConfirmed?: () => void;
}

export const StoreSalesInvoiceReceipt = ({
  invoice,
  open,
  onOpenChange,
  onDeliveryConfirmed,
}: StoreSalesInvoiceReceiptProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [deliveryQuantities, setDeliveryQuantities] = useState<{
    [itemId: string]: number;
  }>({});
  const [partLocationsByPartId, setPartLocationsByPartId] = useState<
    Record<string, PartLocationOption[]>
  >({});
  const [priorOutLocationByItemId, setPriorOutLocationByItemId] = useState<
    Record<
      string,
      { storeId?: string | null; rackId?: string | null; shelfId?: string | null }
    >
  >({});
  const [priorLocationsReady, setPriorLocationsReady] = useState(false);
  const [selectedPrsByItemId, setSelectedPrsByItemId] = useState<
    Record<string, string>
  >({});
  const [partStockInfo, setPartStockInfo] = useState<
    Record<string, { current_stock: number } | null>
  >({});
  const [loadingPartStock, setLoadingPartStock] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (open && invoice.items) {
      const initial: { [itemId: string]: number } = {};
      invoice.items.forEach((item) => {
        const pending = item.orderedQty - item.deliveredQty;
        initial[item.id] = pending > 0 ? pending : 0;
      });
      setDeliveryQuantities(initial);
      setSelectedPrsByItemId({});
      setPriorOutLocationByItemId({});
      setPriorLocationsReady(false);
      setPartStockInfo({});
      setLoadingPartStock({});
    }
  }, [open, invoice.items]);

  useEffect(() => {
    if (!open || !invoice.items?.length) return;
    let cancelled = false;
    (async () => {
      const partIds = Array.from(
        new Set(invoice.items!.map((i) => String(i.partId || "")).filter(Boolean)),
      );
      const entries: [string, PartLocationOption[]][] = await Promise.all(
        partIds.map(async (pid) => {
          try {
            const res = await apiClient.getPartLocations(pid);
            const data = Array.isArray((res as any).data)
              ? (res as any).data
              : [];
            const locs: PartLocationOption[] = data
              .filter((l: any) => {
                if (!l.id) return false;
                // Located rows, real unlocated PartRackShelf (null rack/shelf), or synthetic "unallocated-*" bucket
                return Boolean(l.isUnlocated || l.rackId || l.shelfId);
              })
              .map((l: any) => {
                const idStr = String(l.id);
                let label: string;
                if (idStr.startsWith("unallocated-")) {
                  label = `${l.store || "—"} · Not on shelf`;
                } else if (l.isUnlocated) {
                  label = `${l.store || "—"} · Unlocated (no rack/shelf)`;
                } else {
                  label = `${l.store || "—"} · ${l.rack || l.rack_code || "—"} / ${l.shelf || l.shelf_no || "—"}`;
                }
                return {
                  id: idStr,
                  label,
                  storeId: l.storeId ?? null,
                  rackId: l.rackId ?? null,
                  shelfId: l.shelfId ?? null,
                  isUnlocated: Boolean(l.isUnlocated),
                  quantity: Number(l.quantity || 0),
                };
              });
            return [pid, locs] as [string, PartLocationOption[]];
          } catch {
            return [pid, []] as [string, PartLocationOption[]];
          }
        }),
      );
      if (!cancelled) {
        setPartLocationsByPartId(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoice.id, invoice.items]);

  useEffect(() => {
    if (!open || !invoice.items?.length) return;
    if (!invoice.items.some((item) => item.deliveredQty > 0)) {
      setPriorOutLocationByItemId({});
      setPriorLocationsReady(true);
      return;
    }

    let cancelled = false;
    setPriorLocationsReady(false);
    void (async () => {
      try {
        const res = await apiClient.getStockMovements({
          type: "out",
          limit: 500,
        });
        if (cancelled) return;
        const movements = Array.isArray((res as any)?.data) ? (res as any).data : [];
        const next: Record<
          string,
          { storeId?: string | null; rackId?: string | null; shelfId?: string | null }
        > = {};

        for (const item of invoice.items!) {
          if (item.deliveredQty <= 0) continue;
          const priorMovement = movements.find(
            (movement: any) =>
              String(movement.reference_id || "") === String(invoice.id) &&
              String(movement.reference_type || "") === "sales_invoice" &&
              String(movement.part_id || "") === String(item.partId),
          );
          if (!priorMovement) continue;
          next[item.id] = {
            storeId: priorMovement.store_id ?? null,
            rackId: priorMovement.rack_id ?? null,
            shelfId: priorMovement.shelf_id ?? null,
          };
        }

        setPriorOutLocationByItemId(next);
      } catch {
        if (!cancelled) {
          setPriorOutLocationByItemId({});
        }
      } finally {
        if (!cancelled) {
          setPriorLocationsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, invoice.id, invoice.items]);

  useEffect(() => {
    if (!open || !invoice.items?.length || !priorLocationsReady) return;
    if (Object.keys(partLocationsByPartId).length === 0) return;

    const defaults: Record<string, string> = {};
    for (const item of invoice.items!) {
      const pendingQty = item.orderedQty - item.deliveredQty;
      if (pendingQty <= 0) continue;

      const locOptions = partLocationsByPartId[String(item.partId)] || [];
      const defaultId = pickDefaultLocationPrsId(
        String(item.partId),
        locOptions,
        item.invoiceRackShelf,
        priorOutLocationByItemId[item.id],
      );
      if (defaultId) {
        defaults[item.id] = defaultId;
      }
    }

    setSelectedPrsByItemId(defaults);
  }, [open, invoice.items, partLocationsByPartId, priorOutLocationByItemId, priorLocationsReady]);

  useEffect(() => {
    if (!open || !invoice.items?.length) return;
    let cancelled = false;
    const partIds = Array.from(
      new Set(invoice.items.map((i) => String(i.partId || "")).filter(Boolean)),
    );
    partIds.forEach((pid) => {
      setLoadingPartStock((p) => ({ ...p, [pid]: true }));
    });
    void (async () => {
      await Promise.all(
        partIds.map(async (pid) => {
          try {
            const res = (await apiClient.getPartCostLookup(pid)) as {
              data?: { current_stock?: number };
              current_stock?: number;
              error?: string;
            };
            if (cancelled) return;
            if (res.error) {
              setPartStockInfo((p) => ({ ...p, [pid]: null }));
              return;
            }
            const raw = res.data ?? res;
            const current = Number(
              (raw as { current_stock?: number })?.current_stock,
            );
            setPartStockInfo((p) => ({
              ...p,
              [pid]:
                Number.isFinite(current) && current >= 0
                  ? { current_stock: current }
                  : null,
            }));
          } catch {
            if (!cancelled) {
              setPartStockInfo((p) => ({ ...p, [pid]: null }));
            }
          } finally {
            if (!cancelled) {
              setLoadingPartStock((p) => ({ ...p, [pid]: false }));
            }
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoice.id, invoice.items]);

  const getAllocatedForPart = useCallback(
    (partId: string, excludeItemId?: string): number => {
      return (invoice.items || []).reduce((sum, row) => {
        if (excludeItemId && row.id === excludeItemId) return sum;
        if (String(row.partId) !== String(partId)) return sum;
        return sum + (deliveryQuantities[row.id] ?? 0);
      }, 0);
    },
    [invoice.items, deliveryQuantities],
  );

  const getRemainingPartStock = useCallback(
    (partId: string, excludeItemId?: string): number | null => {
      const stock = partStockInfo[String(partId)];
      if (!stock || typeof stock.current_stock !== "number") return null;
      const allocatedElsewhere = getAllocatedForPart(partId, excludeItemId);
      return Math.max(0, stock.current_stock - allocatedElsewhere);
    },
    [partStockInfo, getAllocatedForPart],
  );

  const getMaxStockOutQtyForItem = useCallback(
    (item: SalesInvoiceItem): number => {
      const pendingQty = Math.max(0, item.orderedQty - item.deliveredQty);
      const remainingStock = getRemainingPartStock(String(item.partId), item.id);
      let max = pendingQty;
      if (remainingStock !== null) {
        max = Math.min(max, remainingStock);
      }
      return Math.max(0, max);
    },
    [getRemainingPartStock],
  );

  useEffect(() => {
    if (!open || !invoice.items?.length) return;
    setDeliveryQuantities((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of invoice.items!) {
        const max = getMaxStockOutQtyForItem(item);
        const cur = next[item.id] ?? 0;
        if (cur > max) {
          next[item.id] = max;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, invoice.items, getMaxStockOutQtyForItem]);

  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = parseInt(value, 10) || 0;
    const item = invoice.items?.find((i) => i.id === itemId);
    if (item) {
      const maxQty = getMaxStockOutQtyForItem(item);
      setDeliveryQuantities((prev) => ({
        ...prev,
        [itemId]: Math.max(0, Math.min(qty, maxQty)),
      }));
    }
  };

  const getDeliveryQty = (itemId: string) => deliveryQuantities[itemId] ?? 0;

  const hasAnyDelivery = () =>
    Object.values(deliveryQuantities).some((qty) => qty > 0);

  const handleConfirmDelivery = async () => {
    try {
      setIsConfirming(true);

      const itemsWithQty = (invoice.items || []).filter(
        (item) => getDeliveryQty(item.id) > 0,
      );

      if (itemsWithQty.length === 0) {
        toast.error("Please enter a delivery quantity for at least one item.");
        return;
      }

      for (const item of itemsWithQty) {
        const prsId = selectedPrsByItemId[item.id];
        if (!prsId) {
          toast.error(
            `Select rack/shelf location for ${item.partNo || "line item"}.`,
          );
          return;
        }
        const qty = getDeliveryQty(item.id);
        const allowed = getMaxStockOutQtyForItem(item);
        if (qty > allowed) {
          toast.error(
            `Stock out qty for ${item.partNo} cannot exceed in-stock quantity or pending amount.`,
          );
          return;
        }
      }

      const deliveryItems = itemsWithQty.map((item) => ({
        invoiceItemId: item.id,
        quantity: getDeliveryQty(item.id),
        partRackShelfId: selectedPrsByItemId[item.id],
      }));

      const response = await apiClient.recordDelivery(invoice.id, {
        challanNo: `CH-${invoice.invoiceNo}-${Date.now()}`,
        deliveryDate: new Date().toISOString().split("T")[0],
        deliveredBy: "Store Manager",
        items: deliveryItems,
      });

      if (response.error) {
        toast.error(response.error || "Failed to confirm delivery");
        return;
      }

      const totalPending = (invoice.items || []).reduce(
        (sum, item) => sum + (item.orderedQty - item.deliveredQty),
        0,
      );
      const totalDelivering = deliveryItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

      if (totalDelivering < totalPending) {
        toast.success(
          `Partial stock out confirmed for Order ${invoice.invoiceNo}.`,
        );
      } else {
        toast.success(
          `Full stock out confirmed for Order ${invoice.invoiceNo}.`,
        );
      }

      onDeliveryConfirmed?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to confirm delivery");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-primary" />
            Record Stock Out — {invoice.invoiceNo}
          </DialogTitle>
          <DialogDescription>
            Enter stock out quantity and choose where to deduct from — located
            stock (rack/shelf) or unlocated stock for that store when applicable.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold min-w-[140px]">Item</TableHead>
                <TableHead className="text-center w-[72px] font-semibold">
                  Ordered
                </TableHead>
                <TableHead className="text-center w-[88px] font-semibold">
                  In stock
                </TableHead>
                <TableHead className="min-w-[220px] font-semibold">
                  Location
                </TableHead>
                <TableHead className="text-center w-[100px] font-semibold">
                  Stock out qty
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item) => {
                  const pendingQty = item.orderedQty - item.deliveredQty;
                  const isFullyDelivered = pendingQty <= 0;
                  const locOptions =
                    partLocationsByPartId[String(item.partId)] || [];
                  const partIdStr = String(item.partId);
                  const stockLoading = loadingPartStock[partIdStr];
                  const remainingStock = getRemainingPartStock(partIdStr, item.id);
                  const maxOutQty = getMaxStockOutQtyForItem(item);
                  return (
                    <TableRow
                      key={item.id}
                      className={isFullyDelivered ? "opacity-50" : ""}
                    >
                      <TableCell className="align-middle">
                        <p className="font-medium text-sm">{item.partNo}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="text-center align-middle font-medium">
                        {item.orderedQty}
                      </TableCell>

                      <TableCell className="text-center align-middle">
                        {isFullyDelivered ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : stockLoading ? (
                          <span className="text-xs text-muted-foreground">
                            …
                          </span>
                        ) : remainingStock !== null ? (
                          <span className="text-sm font-semibold tabular-nums">
                            {remainingStock}
                          </span>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Could not load stock balance"
                          >
                            —
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="align-middle">
                        {isFullyDelivered ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : locOptions.length === 0 ? (
                          <span className="text-xs text-amber-700">
                            No stock buckets for this part (including unlocated).
                            Assign stock to a store/location in inventory if totals
                            show stock but nothing appears here.
                          </span>
                        ) : (
                          <Select
                            value={selectedPrsByItemId[item.id] || ""}
                            onValueChange={(v) =>
                              setSelectedPrsByItemId((prev) => ({
                                ...prev,
                                [item.id]: v,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full max-w-[320px]">
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                            <SelectContent>
                              {locOptions.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>

                      <TableCell className="text-center align-middle">
                        {isFullyDelivered ? (
                          <span className="text-green-600 text-sm font-medium">
                            Done
                          </span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={maxOutQty}
                            value={getDeliveryQty(item.id)}
                            onChange={(e) =>
                              handleQuantityChange(item.id, e.target.value)
                            }
                            className="w-20 text-center mx-auto h-8"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No items found for this invoice.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelivery}
            disabled={isConfirming || !hasAnyDelivery()}
            className="gap-2"
          >
            <Truck className="w-4 h-4" />
            {isConfirming
              ? "Confirming..."
              : hasAnyDelivery()
                ? "Confirm Stock Out"
                : "Enter quantities for stock out"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
