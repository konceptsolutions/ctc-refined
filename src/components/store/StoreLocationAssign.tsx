import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

interface DirectPurchaseOrderItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  amount: number;
  rackId?: string;
  shelfId?: string;
  rackCode?: string;
  shelfNo?: string;
  rackStoreId?: string | null;
  rackStoreName?: string | null;
}

interface DirectPurchaseOrder {
  id: string;
  dpo_no: string;
  po_number?: string;
  /** Store the DPO belongs to — used first for rack / shelf scoping */
  store_id?: string | null;
  storeId?: string | null;
  store_name?: string | null;
  storeName?: string | null;
  items?: DirectPurchaseOrderItem[];
}

interface Rack {
  id: string;
  codeNo: string;
  storeId: string;
  shelves: Shelf[];
}

interface Shelf {
  id: string;
  shelfNo: string;
  rackId: string;
}

interface StoreLocationAssignProps {
  order: DirectPurchaseOrder;
  orderKind?: "dpo" | "po";
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface StoreOption {
  id: string;
  name: string;
}

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeUuid(value: string): boolean {
  return UUID_LIKE.test(String(value).trim());
}

/** One physical stock bucket (store + rack + shelf) for display in Current assignment */
interface PartStockLocationDisplay {
  storeId: string;
  storeName: string;
  rackId: string;
  shelfId: string;
  rackCode: string;
  shelfNo: string;
  quantity: number;
}

export const StoreLocationAssign = ({
  order,
  orderKind = "dpo",
  storeId,
  open,
  onOpenChange,
  onSuccess,
}: StoreLocationAssignProps) => {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingRacks, setFetchingRacks] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [itemLocations, setItemLocations] = useState<
    Record<string, { storeId: string; rackId: string; shelfId: string }>
  >({});
  const [partLocationsByPartId, setPartLocationsByPartId] = useState<
    Record<
      string,
      {
        rackId: string;
        shelfId: string;
        rackCode: string;
        shelfNo: string;
      }
    >
  >({});
  /** All part stock buckets for "Current assignment" — any store, not PO-scoped */
  const [partLocationsDisplayListByPartId, setPartLocationsDisplayListByPartId] = useState<
    Record<string, PartStockLocationDisplay[]>
  >({});

  // Prefer the PO's store for racks/part locations; fall back to the Store panel filter when missing.
  const rackScopeStoreId = useMemo(() => {
    const fromOrder = order.store_id ?? order.storeId;
    const orderStr =
      fromOrder != null &&
      String(fromOrder).trim() !== "" &&
      String(fromOrder) !== "all"
        ? String(fromOrder).trim()
        : "";
    if (orderStr) return orderStr;
    if (storeId && storeId !== "all") return String(storeId).trim();
    return "";
  }, [order.id, order.store_id, order.storeId, storeId]);

  useEffect(() => {
    if (open && order.items && order.items.length > 0) {
      fetchStores();
      fetchRacks();
      // Initialize from saved rack/shelf IDs (either or both may be set)
      const initialLocations: Record<
        string,
        { storeId: string; rackId: string; shelfId: string }
      > = {};
      order.items.forEach((item) => {
        const itemStoreId =
          item.rackStoreId != null
            ? String(item.rackStoreId)
            : rackScopeStoreId || "";
        const rackId = item.rackId != null ? String(item.rackId) : "";
        const shelfId = item.shelfId != null ? String(item.shelfId) : "";
        initialLocations[item.id] = { storeId: itemStoreId, rackId, shelfId };
      });
      setItemLocations(initialLocations);
    }
  }, [open, rackScopeStoreId, order.id]);

  // Fallback: if the DPO item doesn't have rack/shelf ids, use the part's current stock locations.
  // This helps when rack/shelf are associated via stock movements / PartRackShelf rather than DPO items.
  useEffect(() => {
    const fetchPartLocationsFallback = async () => {
      if (!open || !order.items?.length) return;
      try {
        const partIds = Array.from(
          new Set(order.items.map((i) => String(i.partId || ""))),
        ).filter(Boolean);
        if (partIds.length === 0) return;

        const responses = await Promise.all(
          partIds.map((pid) => apiClient.getPartLocations(pid).catch(() => ({ data: [] }))),
        );

        const storeIdStr = rackScopeStoreId;
        const byPartId: Record<
          string,
          { rackId: string; shelfId: string; rackCode: string; shelfNo: string }
        > = {};
        const byPartDisplayList: Record<string, PartStockLocationDisplay[]> = {};

        for (let idx = 0; idx < partIds.length; idx++) {
          const pid = partIds[idx];
          const resp = responses[idx] as any;
          const locations = Array.isArray(resp?.data) ? resp.data : [];

          const allocated = locations.filter((l: any) => !l.isUnlocated);
          const withRackOrShelf = allocated.filter((l: any) => l.rackId || l.shelfId);

          const displayList: PartStockLocationDisplay[] = [...withRackOrShelf]
            .sort((a: any, b: any) => Number(b.quantity || 0) - Number(a.quantity || 0))
            .map((l: any) => ({
              storeId: l.storeId != null ? String(l.storeId) : "",
              storeName: l.store != null ? String(l.store) : "",
              rackId: l.rackId != null ? String(l.rackId) : "",
              shelfId: l.shelfId != null ? String(l.shelfId) : "",
              rackCode:
                l.rack != null
                  ? String(l.rack)
                  : l.rack_code != null
                    ? String(l.rack_code)
                    : "",
              shelfNo:
                l.shelf != null
                  ? String(l.shelf)
                  : l.shelf_no != null
                    ? String(l.shelf_no)
                    : "",
              quantity: Number(l.quantity) || 0,
            }));

          if (displayList.length > 0) {
            byPartDisplayList[pid] = displayList;
          }

          // Dropdown / draft fallback: still scoped to PO store when known
          const storeMatches =
            storeIdStr !== ""
              ? allocated.filter((l: any) => String(l.storeId ?? "") === storeIdStr)
              : [];

          const bestPool = storeIdStr !== "" ? storeMatches : allocated;
          const best =
            bestPool.length > 0
              ? bestPool.sort(
                  (a: any, b: any) => Number(b.quantity || 0) - Number(a.quantity || 0),
                )[0]
              : undefined;

          if (best?.rackId || best?.shelfId) {
            byPartId[pid] = {
              rackId: best.rackId != null ? String(best.rackId) : "",
              shelfId: best.shelfId != null ? String(best.shelfId) : "",
              rackCode:
                best.rack != null
                  ? String(best.rack)
                  : best.rack_code != null
                    ? String(best.rack_code)
                    : "",
              shelfNo:
                best.shelf != null
                  ? String(best.shelf)
                  : best.shelf_no != null
                    ? String(best.shelf_no)
                    : "",
            };
          }
        }

        setPartLocationsByPartId(byPartId);
        setPartLocationsDisplayListByPartId(byPartDisplayList);

        // Fill empty itemLocations (rackId+ shelfId) using the fallback.
        setItemLocations((prev) => {
          const next = { ...prev };
          order.items.forEach((item) => {
            const current = next[item.id];
            const hasRackOrShelf =
              (current?.rackId && current.rackId !== "") || (current?.shelfId && current.shelfId !== "");
            if (hasRackOrShelf) return;

            const fallback = byPartId[String(item.partId || "")];
            if (!fallback) return;

            next[item.id] = {
              storeId: next[item.id]?.storeId || rackScopeStoreId || "",
              rackId: fallback.rackId || "",
              shelfId: fallback.shelfId || "",
            };
          });
          return next;
        });
      } catch (e) {
        // Non-critical: keep DPO item values if fallback fails.
      }
    };

    fetchPartLocationsFallback();
  }, [open, rackScopeStoreId, order.id]);

  const fetchRacks = async () => {
    try {
      setFetchingRacks(true);
      // Load all racks so each item can choose its own store.
      const response = await apiClient.getRacks(undefined);
      const racksData = response.data || response;
      const resolvedRacksData: any = racksData;

      if (Array.isArray(resolvedRacksData)) {
        const rows = resolvedRacksData;
        const mapped = rows.map((r: any) => ({
          id: r.id != null ? String(r.id) : "",
          codeNo: r.codeNo || r.code_no,
          storeId: r.storeId || r.store_id,
          shelves: (r.shelves || r.Shelf || []).map((s: any) => ({
            id: s.id != null ? String(s.id) : "",
            shelfNo: s.shelfNo || s.shelf_no,
            rackId: s.rackId || s.rack_id ? String(s.rackId || s.rack_id) : "",
          })),
        }));
        setRacks(mapped);

      }
    } catch (error: any) {
      toast.error("Failed to fetch racks and shelves");
    } finally {
      setFetchingRacks(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await apiClient.getStores();
      const rows = (response as any)?.data || response;
      if (Array.isArray(rows)) {
        setStores(
          rows.map((s: any) => ({
            id: String(s.id),
            name: String(s.name || s.store_name || "Store"),
          })),
        );
      } else {
        setStores([]);
      }
    } catch {
      setStores([]);
    }
  };

  // Merge extra shelves onto racks already returned for this store. When the PO store is fixed,
  // never invent racks from line/part data that are not in this store's API list.
  const racksEffective = useMemo(() => {
    const byId = new Map<string, Rack>(
      racks.map((r) => [String(r.id), { ...r, shelves: r.shelves.map((s) => ({ ...s })) }]),
    );
    const strictStore = Boolean(rackScopeStoreId);
    order.items?.forEach((item) => {
      const loc = itemLocations[item.id];
      const rid =
        (loc?.rackId && String(loc.rackId).trim()) ||
        (item.rackId != null ? String(item.rackId) : "") ||
        "";
      const sid =
        (loc?.shelfId && String(loc.shelfId).trim()) ||
        (item.shelfId != null ? String(item.shelfId) : "") ||
        "";
      if (!rid) return;
      const pl = partLocationsByPartId[String(item.partId || "")];
      const label = (item.rackCode && String(item.rackCode).trim()) || `Rack`;
      const shelfLabel =
        (item.shelfNo && String(item.shelfNo).trim()) ||
        (sid &&
          pl?.shelfId &&
          String(pl.shelfId) === sid &&
          pl.shelfNo &&
          String(pl.shelfNo).trim()) ||
        (sid ? "Shelf" : "");
      const existing = byId.get(rid);
      if (strictStore && !existing) {
        return;
      }
      if (!existing) {
        byId.set(rid, {
          id: rid,
          codeNo: label,
          storeId: "",
          shelves: sid
            ? [{ id: sid, shelfNo: shelfLabel || "Shelf", rackId: rid }]
            : [],
        });
        return;
      }
      if (sid && !existing.shelves.some((s) => String(s.id) === sid)) {
        existing.shelves.push({
          id: sid,
          shelfNo: shelfLabel || "Shelf",
          rackId: rid,
        });
      }
    });
    for (const rack of byId.values()) {
      for (const s of rack.shelves) {
        const no = s.shelfNo != null ? String(s.shelfNo).trim() : "";
        if (!no) s.shelfNo = "Shelf";
      }
    }
    return Array.from(byId.values());
  }, [racks, order.items, itemLocations, partLocationsByPartId, rackScopeStoreId]);

  const getShelvesForRack = (rackId: string | number): Shelf[] => {
    const rack = racksEffective.find((r) => String(r.id) === String(rackId));
    return rack?.shelves || [];
  };

  const shelfDisplayLabel = (
    item: DirectPurchaseOrderItem,
    location: { rackId: string; shelfId: string } | undefined,
  ): string => {
    const fromItem = item.shelfNo && String(item.shelfNo).trim();
    if (fromItem) return fromItem;

    const sid = location?.shelfId && String(location.shelfId).trim();
    const rid = location?.rackId && String(location.rackId).trim();
    if (sid && rid) {
      const inRack = getShelvesForRack(rid).find((s) => String(s.id) === String(sid));
      const sn = inRack?.shelfNo && String(inRack.shelfNo).trim();
      if (sn) return sn;
    }
    if (sid) {
      for (const r of racksEffective) {
        const hit = r.shelves.find((s) => String(s.id) === String(sid));
        const sn = hit?.shelfNo && String(hit.shelfNo).trim();
        if (sn) return sn;
      }
    }
    const pl = partLocationsByPartId[String(item.partId || "")];
    if (
      sid &&
      pl?.shelfId &&
      String(pl.shelfId) === String(sid) &&
      pl.shelfNo &&
      String(pl.shelfNo).trim()
    ) {
      return String(pl.shelfNo).trim();
    }
    if (sid && looksLikeUuid(sid)) return "Shelf";
    return sid || "";
  };

  const handleRackChange = (itemId: string, rackId: string) => {
    const selectedRack = racksEffective.find((r) => String(r.id) === String(rackId));
    setItemLocations((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        storeId: selectedRack?.storeId ? String(selectedRack.storeId) : (prev[itemId]?.storeId || ""),
        rackId,
        shelfId: "", // Reset shelf when rack changes
      },
    }));
  };

  const handleStoreChange = (itemId: string, storeIdValue: string) => {
    setItemLocations((prev) => ({
      ...prev,
      [itemId]: {
        storeId: storeIdValue,
        rackId: "",
        shelfId: "",
      },
    }));
  };

  const handleShelfChange = (itemId: string, shelfId: string) => {
    setItemLocations((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        shelfId,
      },
    }));
  };

  const handleSave = async () => {
    if (!order.items || order.items.length === 0) {
      toast.error("No items to update");
      return;
    }

    try {
      setLoading(true);
      
      // Update each item with location - we need to send all items with updated locations
      const updatedItems = order.items.map((item) => {
        const location = itemLocations[item.id];
        const purchasePrice = item.purchasePrice !== undefined && item.purchasePrice !== null ? item.purchasePrice : 0;
        const quantity = item.quantity || 0;
        const amount = item.amount || (purchasePrice * quantity);
        return {
          part_id: item.partId,
          quantity: quantity,
          purchase_price: purchasePrice,
          sale_price: item.salePrice || 0,
          amount: amount,
          store_id: location?.storeId || null,
          rack_id: location?.rackId || null,
          shelf_id: location?.shelfId || null,
        };
      });

      if (orderKind === "po") {
        const response = await apiClient.assignPurchaseOrderLocations(order.id, {
          store_id: rackScopeStoreId || undefined,
          items: updatedItems.map((item) => ({
            part_id: item.part_id,
            store_id: item.store_id,
            rack_id: item.rack_id,
            shelf_id: item.shelf_id,
          })),
        });
        if (response.error) {
          toast.error(response.error);
          return;
        }
      } else {
        // Update the DPO with new locations
        const response = await apiClient.updateDirectPurchaseOrder(order.id, {
          items: updatedItems,
        });

        if (response.error) {
          toast.error(response.error);
          return;
        }
      }

      toast.success("Locations assigned successfully");
      onSuccess();
    } catch (error: any) {
      toast.error(error.error || "Failed to assign locations");
    } finally {
      setLoading(false);
    }
  };

  const orderLabel = order.po_number || order.dpo_no;
  const poStoreName =
    String(order.store_name ?? order.storeName ?? "").trim() || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1200px,calc(100vw-2rem))] max-w-7xl max-h-[90vh] flex flex-col overflow-hidden p-6 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Assign Locations - {orderLabel}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">
              Assign rack and shelf locations for each item in this order.
            </span>
            {poStoreName ? (
              <span className="block text-foreground font-medium">
                Purchase order store: {poStoreName}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 max-h-[min(70vh,calc(90vh-13rem))] w-full overflow-y-auto overflow-x-auto pr-1 [scrollbar-gutter:stable]">
          {fetchingRacks ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading racks and shelves...
            </div>
          ) : !order.items || order.items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items found in this order.
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-md border -mx-1 sm:mx-0">
                  <div className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <ListNumberHeader />
                        <TableHead className="w-[120px]">Part No</TableHead>
                        <TableHead className="w-[170px]">Description</TableHead>
                        <TableHead className="w-[90px] px-2">Brand</TableHead>
                        <TableHead className="w-[50px] text-right px-2">Qty</TableHead>
                        <TableHead className="w-[150px]">Current assignment</TableHead>
                        <TableHead className="w-[110px]">Store</TableHead>
                        <TableHead className="w-[110px]">Rack</TableHead>
                        <TableHead className="w-[110px]">Shelf</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items.map((item, index) => {
                        const location = itemLocations[item.id];
                        const racksForStore = location?.storeId
                          ? racksEffective.filter(
                              (r) => String(r.storeId ?? "") === String(location.storeId),
                            )
                          : racksEffective;
                        const shelves = location?.rackId
                          ? getShelvesForRack(location.rackId)
                          : [];

                        const row = item as DirectPurchaseOrderItem & {
                          rack_id?: string | null;
                          shelf_id?: string | null;
                          rack_name?: string | null;
                          shelf_name?: string | null;
                          rack_store_id?: string | null;
                          rack_store_name?: string | null;
                        };
                        // Persisted assignment from the order (DB) — never use draft `itemLocations` here
                        const savedRackId = String(row.rackId ?? row.rack_id ?? "").trim();
                        const savedShelfId = String(row.shelfId ?? row.shelf_id ?? "").trim();
                        const savedRackCode =
                          (row.rackCode && String(row.rackCode).trim()) ||
                          (row.rack_name && String(row.rack_name).trim()) ||
                          "";
                        const savedShelfNo =
                          (row.shelfNo && String(row.shelfNo).trim()) ||
                          (row.shelf_name && String(row.shelf_name).trim()) ||
                          "";
                        const savedLocationSnapshot = { rackId: savedRackId, shelfId: savedShelfId };
                        const displayItem: DirectPurchaseOrderItem = {
                          ...item,
                          rackCode: savedRackCode || item.rackCode,
                          shelfNo: savedShelfNo || item.shelfNo,
                        };
                        const currentStoreId =
                          location?.storeId ||
                          (item.rackStoreId != null ? String(item.rackStoreId) : "") ||
                          rackScopeStoreId ||
                          "";
                        const storeOptions = stores.map((store) => ({
                          value: store.id,
                          label: store.name,
                        }));
                        const rackOptions = racksForStore.map((rack) => ({
                          value: rack.id,
                          label: rack.codeNo,
                        }));
                        const shelfOptions = shelves.map((shelf) => ({
                          value: shelf.id,
                          label: shelf.shelfNo,
                        }));
                        const orderRackDisplay =
                          savedRackCode ||
                          (savedRackId
                            ? racksEffective.find((r) => String(r.id) === savedRackId)?.codeNo || ""
                            : "") ||
                          (savedRackId ? savedRackId : "");
                        const orderShelfDisplay = shelfDisplayLabel(displayItem, savedLocationSnapshot);
                        const hasOrderRack = !!(savedRackId || savedRackCode);
                        const hasOrderShelf = !!(savedShelfId || savedShelfNo);
                        const hasOrderAssignment = hasOrderRack || hasOrderShelf;

                        const plList =
                          partLocationsDisplayListByPartId[String(item.partId || "")] ||
                          [];

                        const rackStoreFromOrder =
                          (
                            item.rackStoreName ||
                            row.rack_store_name ||
                            ""
                          ).toString().trim() || "";
                        let displayStoreOrder = "";
                        if (hasOrderAssignment) {
                          displayStoreOrder = rackStoreFromOrder;
                          if (
                            !displayStoreOrder &&
                            savedRackId &&
                            plList.some((p) => String(p.rackId) === savedRackId)
                          ) {
                            displayStoreOrder =
                              plList.find((p) => String(p.rackId) === savedRackId)?.storeName?.trim() ||
                              "";
                          }
                        }

                        const hasPartStockList = plList.length > 0;
                        const hasSavedAssignment = hasOrderAssignment || hasPartStockList;

                        return (
                          <TableRow key={item.id} className="align-top">
                            <ListNumberCell index={index} total={order.items.length} className="align-top py-3" />
                            <TableCell className="font-medium align-top py-3">{item.partNo}</TableCell>
                            <TableCell className="align-top py-3 max-w-[170px] truncate">{item.description || "-"}</TableCell>
                            <TableCell className="align-top py-3 px-2">{item.brand}</TableCell>
                            <TableCell className="text-right align-top py-3 px-2">{item.quantity}</TableCell>
                            <TableCell className="align-top py-3 text-xs text-muted-foreground leading-snug max-w-[150px]">
                              {hasSavedAssignment ? (
                                <div className="flex flex-col gap-3">
                                  {hasOrderAssignment && (
                                    <div className="space-y-1">
                                      {hasPartStockList && (
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
                                          Saved on order
                                        </div>
                                      )}
                                      <div>
                                        <span className="font-medium text-foreground">Store:</span>{" "}
                                        {displayStoreOrder || "—"}
                                      </div>
                                      <div>
                                        <span className="font-medium text-foreground">Rack:</span>{" "}
                                        {orderRackDisplay || "—"}
                                      </div>
                                      <div>
                                        <span className="font-medium text-foreground">Shelf:</span>{" "}
                                        {orderShelfDisplay || "—"}
                                      </div>
                                    </div>
                                  )}
                                  {hasPartStockList && (
                                    <div className="space-y-1.5">
                                      <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
                                        {hasOrderAssignment
                                          ? "Part stock (all locations)"
                                          : "Part stock"}
                                      </div>
                                      <ul className="m-0 list-none space-y-2 p-0">
                                        {plList.map((loc, idx) => (
                                          <li
                                            key={`${loc.storeId}-${loc.rackId}-${loc.shelfId}-${idx}`}
                                            className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5"
                                          >
                                            <div>
                                              <span className="font-medium text-foreground">Store:</span>{" "}
                                              {loc.storeName?.trim() || "—"}
                                            </div>
                                            <div>
                                              <span className="font-medium text-foreground">Rack:</span>{" "}
                                              {loc.rackCode?.trim() || "—"}
                                            </div>
                                            <div>
                                              <span className="font-medium text-foreground">Shelf:</span>{" "}
                                              {loc.shelfNo?.trim() || "—"}
                                            </div>
                                            <div className="mt-0.5 text-[10px] opacity-80">
                                              Qty: {loc.quantity}
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="italic text-muted-foreground">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell className="align-middle">
                              <SearchableSelect
                                options={storeOptions}
                                value={currentStoreId}
                                onValueChange={(value) => handleStoreChange(item.id, value)}
                                placeholder="Select Store"
                                className="w-full max-w-[130px]"
                                disabled={stores.length === 0}
                              />
                            </TableCell>
                            <TableCell className="align-middle">
                              <SearchableSelect
                                options={rackOptions}
                                value={location?.rackId || ""}
                                onValueChange={(value) => handleRackChange(item.id, value)}
                                placeholder="Select Rack"
                                className="w-full max-w-[130px]"
                                disabled={racksForStore.length === 0}
                              />
                            </TableCell>
                            <TableCell className="align-middle">
                              <SearchableSelect
                                options={shelfOptions}
                                value={location?.shelfId || ""}
                                onValueChange={(value) => handleShelfChange(item.id, value)}
                                disabled={!location?.rackId}
                                placeholder={location?.rackId ? "Select Shelf" : "Select Rack first"}
                                className="w-full max-w-[130px]"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Locations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

