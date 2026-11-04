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
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { PackagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import {
  performedByPayload,
  useStoreOperatorAuth,
} from "@/hooks/useStoreOperatorAuth";
import { formatPartIdentityFromUi } from "@/lib/part-identity";

export interface SalesReturnReceiveItem {
  id: string;
  partId: string;
  partNo: string;
  masterPartNo?: string;
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

interface LocationOption {
  id: string;
  label: string;
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

const locationKey = (storeId: string, rackId: string, shelfId: string) =>
  `${storeId || ""}:${rackId}:${shelfId}`;

const formatLocationLabel = (
  store: string,
  rack: string,
  shelf: string,
) => `${store || "—"} · ${rack || "—"} / ${shelf || "—"}`;

function pickBestPartLocation(
  locations: any[],
  preferredStoreId?: string,
): LocationOption | null {
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

  const storeId = best.storeId != null ? String(best.storeId) : "";
  const rackId = best.rackId != null ? String(best.rackId) : "";
  const shelfId = best.shelfId != null ? String(best.shelfId) : "";
  if (!rackId || !shelfId) return null;

  return {
    id: locationKey(storeId, rackId, shelfId),
    label: formatLocationLabel(
      String(best.store || ""),
      String(best.rack || best.rack_code || ""),
      String(best.shelf || best.shelf_no || ""),
    ),
    storeId,
    rackId,
    shelfId,
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
  const [storeLocationOptions, setStoreLocationOptions] = useState<
    LocationOption[]
  >([]);
  const [partLocationOptionsByPartId, setPartLocationOptionsByPartId] =
    useState<Record<string, LocationOption[]>>({});
  const [selectedLocationByItemId, setSelectedLocationByItemId] = useState<
    Record<string, string>
  >({});
  const [loadingLocations, setLoadingLocations] = useState(false);

  const effectiveStoreId =
    storeId && storeId !== "all" ? storeId : "";

  useEffect(() => {
    if (!open || !salesReturn) return;
    const initial: Record<string, string> = {};
    salesReturn.items.forEach((item) => {
      initial[item.id] = "";
    });
    setSelectedLocationByItemId(initial);
  }, [open, salesReturn?.id]);

  // Build store rack/shelf location list (same label style as sale stock out)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingLocations(true);
        const [racksRes, storesRes] = await Promise.all([
          apiClient.getRacks(undefined),
          apiClient.getStores().catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;

        const racksRaw = (racksRes as any)?.data || racksRes;
        const storesRaw = (storesRes as any)?.data || storesRes || [];
        const storeNameById = new Map<string, string>();
        if (Array.isArray(storesRaw)) {
          for (const s of storesRaw) {
            storeNameById.set(String(s.id), String(s.name || s.code || ""));
          }
        }
        if (effectiveStoreId && storeName) {
          storeNameById.set(effectiveStoreId, storeName);
        }

        const options: LocationOption[] = [];
        if (Array.isArray(racksRaw)) {
          for (const r of racksRaw) {
            const rackId = String(r.id);
            const rackStoreId = String(r.storeId || r.store_id || "");
            if (
              effectiveStoreId &&
              rackStoreId &&
              rackStoreId !== effectiveStoreId
            ) {
              continue;
            }
            const rackCode = String(r.codeNo || r.code_no || rackId.slice(0, 8));
            const storeLabel =
              storeNameById.get(rackStoreId) ||
              (rackStoreId === effectiveStoreId ? storeName : "") ||
              "—";
            const shelves = r.shelves || r.Shelf || [];
            for (const s of shelves) {
              const shelfId = String(s.id);
              const shelfNo = String(
                s.shelfNo || s.shelf_no || shelfId.slice(0, 8),
              );
              const sid = rackStoreId || effectiveStoreId || "";
              options.push({
                id: locationKey(sid, rackId, shelfId),
                label: formatLocationLabel(storeLabel, rackCode, shelfNo),
                storeId: sid,
                rackId,
                shelfId,
              });
            }
          }
        }
        setStoreLocationOptions(options);
      } catch {
        if (!cancelled) {
          setStoreLocationOptions([]);
          toast.error("Failed to load locations");
        }
      } finally {
        if (!cancelled) setLoadingLocations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, effectiveStoreId, storeName]);

  // Part-associated locations (auto-select + ensure options appear)
  useEffect(() => {
    if (!open || !salesReturn?.items?.length) return;
    let cancelled = false;
    (async () => {
      try {
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

        const byPart: Record<string, LocationOption[]> = {};
        const bestByPart: Record<string, LocationOption> = {};

        partIds.forEach((pid, idx) => {
          const resp = responses[idx] as any;
          const locations = Array.isArray(resp?.data)
            ? resp.data
            : Array.isArray(resp)
              ? resp
              : [];
          const opts: LocationOption[] = [];
          for (const l of locations) {
            if (l.isUnlocated || !(l.rackId || l.shelfId)) continue;
            const sid = l.storeId != null ? String(l.storeId) : "";
            const rackId = l.rackId != null ? String(l.rackId) : "";
            const shelfId = l.shelfId != null ? String(l.shelfId) : "";
            if (!rackId || !shelfId) continue;
            opts.push({
              id: locationKey(sid, rackId, shelfId),
              label: formatLocationLabel(
                String(l.store || ""),
                String(l.rack || l.rack_code || ""),
                String(l.shelf || l.shelf_no || ""),
              ),
              storeId: sid,
              rackId,
              shelfId,
            });
          }
          byPart[pid] = opts;
          const best = pickBestPartLocation(
            locations,
            effectiveStoreId || undefined,
          );
          if (best) bestByPart[pid] = best;
        });

        setPartLocationOptionsByPartId(byPart);

        setSelectedLocationByItemId((prev) => {
          const next = { ...prev };
          for (const item of salesReturn.items) {
            if (next[item.id]) continue;
            const best = bestByPart[String(item.partId)];
            if (best) next[item.id] = best.id;
          }
          return next;
        });
      } catch {
        // Non-blocking — user can still pick manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, salesReturn?.id, effectiveStoreId]);

  const locationOptionsForPart = (partId: string): LocationOption[] => {
    const map = new Map<string, LocationOption>();
    for (const opt of storeLocationOptions) map.set(opt.id, opt);
    for (const opt of partLocationOptionsByPartId[partId] || []) {
      map.set(opt.id, opt);
    }
    return Array.from(map.values());
  };

  const resolveSelectedLocation = (
    itemId: string,
    partId: string,
  ): LocationOption | undefined => {
    const selectedId = selectedLocationByItemId[itemId];
    if (!selectedId) return undefined;
    return locationOptionsForPart(partId).find((o) => o.id === selectedId);
  };

  const handleConfirm = async () => {
    if (!salesReturn) return;

    for (const item of salesReturn.items) {
      const loc = resolveSelectedLocation(item.id, String(item.partId));
      if (!loc?.rackId || !loc?.shelfId) {
        toast.error(
          `Select location for ${formatPartIdentityFromUi(item) || "return item"}.`,
        );
        return;
      }
      const itemStore = loc.storeId || effectiveStoreId;
      if (!itemStore) {
        toast.error(
          `Select a store location for ${formatPartIdentityFromUi(item) || "return item"}.`,
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
          .map((i) => resolveSelectedLocation(i.id, String(i.partId))?.storeId)
          .find(Boolean) ||
        "";

      const locations = salesReturn.items.map((item) => {
        const loc = resolveSelectedLocation(item.id, String(item.partId));
        return {
          item_id: item.id,
          part_id: item.partId,
          store_id: loc?.storeId || effectiveStoreId || defaultStore,
          rack_id: loc?.rackId || null,
          shelf_id: loc?.shelfId || null,
          quantity: item.returnQuantity,
        };
      });

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

  const busy = loadingLocations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
      >
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
            {storeName ? ` → ${storeName}` : ""}. Choose a location (store ·
            rack / shelf) for each line.
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

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>Part No | Master Part</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="min-w-[240px]">Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesReturn.items.map((item, index) => {
                const locOptions = locationOptionsForPart(String(item.partId));
                const selectedId = selectedLocationByItemId[item.id] || "";
                return (
                  <TableRow key={item.id}>
                    <ListNumberCell
                      index={index}
                      total={salesReturn.items.length}
                    />
                    <TableCell className="font-medium">
                      {formatPartIdentityFromUi(item)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.returnQuantity}
                    </TableCell>
                    <TableCell>
                      {locOptions.length === 0 ? (
                        <span className="text-xs text-amber-700">
                          {busy
                            ? "Loading locations…"
                            : "No rack/shelf locations available. Add racks and shelves for this store first."}
                        </span>
                      ) : (
                        <SearchableSelect
                          options={locOptions.map(
                            (opt): SearchableSelectOption => ({
                              value: opt.id,
                              label: opt.label,
                            }),
                          )}
                          value={selectedId || undefined}
                          disabled={busy || isConfirming}
                          placeholder={busy ? "Loading…" : "Select location"}
                          className="h-8 w-full max-w-[320px]"
                          selectedDisplayLabelOnly
                          requireSearchAbove={Number.MAX_SAFE_INTEGER}
                          maxDisplayedOptions={300}
                          onValueChange={(v) =>
                            setSelectedLocationByItemId((prev) => ({
                              ...prev,
                              [item.id]: v,
                            }))
                          }
                        />
                      )}
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
