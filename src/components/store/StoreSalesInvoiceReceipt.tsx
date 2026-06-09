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
}

interface PartLocationOption {
  id: string;
  label: string;
  quantity: number;
}

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
                if (!l.id || Number(l.quantity) <= 0) return false;
                // Located rows, real unlocated PartRackShelf (null rack/shelf), or synthetic "unallocated-*" bucket
                return Boolean(l.isUnlocated || l.rackId || l.shelfId);
              })
              .map((l: any) => {
                const qty = Number(l.quantity) || 0;
                const idStr = String(l.id);
                let label: string;
                if (idStr.startsWith("unallocated-")) {
                  label = `${l.store || "—"} · Not on shelf (movement vs locations) (${qty})`;
                } else if (l.isUnlocated) {
                  label = `${l.store || "—"} · Unlocated (no rack/shelf) (${qty})`;
                } else {
                  label = `${l.store || "—"} · ${l.rack || l.rack_code || "—"} / ${l.shelf || l.shelf_no || "—"} (${qty})`;
                }
                return { id: idStr, quantity: qty, label };
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

  const getAllocatedFromLocation = useCallback(
    (prsId: string, excludeItemId?: string): number => {
      return (invoice.items || []).reduce((sum, row) => {
        if (excludeItemId && row.id === excludeItemId) return sum;
        if (selectedPrsByItemId[row.id] !== prsId) return sum;
        return sum + (deliveryQuantities[row.id] ?? 0);
      }, 0);
    },
    [invoice.items, selectedPrsByItemId, deliveryQuantities],
  );

  const getRemainingAtLocation = useCallback(
    (prsId: string, excludeItemId?: string): number => {
      for (const opts of Object.values(partLocationsByPartId)) {
        const opt = opts.find((o) => o.id === prsId);
        if (opt) {
          const allocatedElsewhere = getAllocatedFromLocation(prsId, excludeItemId);
          return Math.max(0, opt.quantity - allocatedElsewhere);
        }
      }
      return 0;
    },
    [partLocationsByPartId, getAllocatedFromLocation],
  );

  const getMaxStockOutQtyForItem = useCallback(
    (item: SalesInvoiceItem): number => {
      const pendingQty = Math.max(0, item.orderedQty - item.deliveredQty);
      const remainingStock = getRemainingPartStock(String(item.partId), item.id);
      const prsId = selectedPrsByItemId[item.id];
      const opts = partLocationsByPartId[String(item.partId)] || [];
      const opt = prsId ? opts.find((o) => o.id === prsId) : undefined;
      let max = pendingQty;
      if (remainingStock !== null) {
        max = Math.min(max, remainingStock);
      }
      if (opt) {
        max = Math.min(max, getRemainingAtLocation(prsId, item.id));
      }
      return Math.max(0, max);
    },
    [
      getRemainingPartStock,
      selectedPrsByItemId,
      partLocationsByPartId,
      getRemainingAtLocation,
    ],
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

      const usageByLocation = new Map<string, number>();
      for (const item of itemsWithQty) {
        const prsId = selectedPrsByItemId[item.id];
        if (!prsId) {
          toast.error(
            `Select rack/shelf location for ${item.partNo || "line item"}.`,
          );
          return;
        }
        const qty = getDeliveryQty(item.id);
        usageByLocation.set(prsId, (usageByLocation.get(prsId) || 0) + qty);

        const allowed = getMaxStockOutQtyForItem(item);
        if (qty > allowed) {
          const remaining = getRemainingAtLocation(prsId, item.id);
          toast.error(
            remaining < qty
              ? `Stock out qty for ${item.partNo} exceeds quantity left at the selected location (${remaining} available after other lines).`
              : `Stock out qty for ${item.partNo} cannot exceed in-stock quantity or pending amount.`,
          );
          return;
        }
      }

      for (const [prsId, totalQty] of usageByLocation) {
        const remaining = getRemainingAtLocation(prsId);
        const capacity = remaining + totalQty;
        if (totalQty > capacity) {
          toast.error(
            `Total stock out (${totalQty}) exceeds quantity at one selected location (${capacity} available). Split lines across different locations.`,
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
                  Location (stock)
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
                              {locOptions.map((opt) => {
                                const remaining = getRemainingAtLocation(
                                  opt.id,
                                  item.id,
                                );
                                const label =
                                  remaining === opt.quantity
                                    ? opt.label
                                    : opt.label.replace(
                                        /\(\d+\)$/,
                                        `(${remaining} left)`,
                                      );
                                return (
                                  <SelectItem
                                    key={opt.id}
                                    value={opt.id}
                                    disabled={remaining <= 0}
                                  >
                                    {label}
                                  </SelectItem>
                                );
                              })}
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
