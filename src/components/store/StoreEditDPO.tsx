import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, PlusCircle, Check } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
}

interface DirectPurchaseOrder {
  id: string;
  dpo_no: string;
  date: string;
  store_id: string;
  store_name: string;
  supplier_id?: string;
  account?: string;
  description?: string;
  status: string;
  items?: DirectPurchaseOrderItem[];
}

interface StoreEditDPOProps {
  order: DirectPurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface LocationAssignment {
  id: string;
  quantity: string;
  rackId: string;
  shelfId: string;
}

interface OrderItemForm {
  id: string;
  partId: string;
  partNo: string;
  brand: string;
  totalQuantity: string;
  purchasePrice: string;
  salePrice: string;
  locations: LocationAssignment[];
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

// ─── Searchable Rack Combobox ───────────────────────────────────────────────
interface RackComboboxProps {
  racks: Rack[];
  value: string;
  storeId: string;
  onChange: (rackId: string) => void;
  onRackCreated: (rack: Rack) => void;
}

const RackCombobox = ({ racks, value, storeId, onChange, onRackCreated }: RackComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const selected = racks.find((r) => r.id === value);
  const filtered = racks.filter((r) =>
    r.codeNo.toLowerCase().includes(search.toLowerCase())
  );
  const showCreate = search.trim() && !filtered.some((r) => r.codeNo.toLowerCase() === search.toLowerCase());

  const updatePosition = () => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownWidth = 224;
      const expectedHeight = Math.min(filtered.length * 36 + (showCreate ? 40 : 0) + 12, 300);

      let top = rect.bottom + 4;
      let left = rect.left;

      if (top + expectedHeight > viewportHeight && rect.top > expectedHeight) {
        top = rect.top - expectedHeight - 4;
      }
      if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 10;
      }

      setDropdownStyle({
        position: "fixed",
        top,
        left: Math.max(10, left),
        width: dropdownWidth,
        zIndex: 9999,
        pointerEvents: "auto"
      });
    }
  };

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, filtered.length, showCreate, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById("rack-combobox-portal");
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) && (!portal || !portal.contains(e.target as Node))) {
        setOpen(false);
        setSearch("");
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && filtered[highlighted]) {
        onChange(filtered[highlighted].id);
        setOpen(false);
        setSearch("");
      } else if (showCreate) {
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  useEffect(() => {
    if (highlighted >= 0 && itemRefs.current[highlighted]) {
      itemRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  const handleCreate = async () => {
    if (!search.trim() || !storeId) return;
    setCreating(true);
    try {
      const res = await apiClient.createRack({ codeNo: search.trim(), storeId });
      const data: any = res.data || res;
      onRackCreated({ id: data.id, codeNo: data.codeNo || search.trim(), storeId, shelves: [] });
      onChange(data.id);
      setOpen(false);
      setSearch("");
      toast.success("Rack created");
    } catch (e: any) {
      toast.error(e.error || "Failed");
    } finally {
      setCreating(false);
    }
  };

  const dropdown = open ? ReactDOM.createPortal(
    <div
      id="rack-combobox-portal"
      style={dropdownStyle}
      className="rounded-md border bg-popover shadow-xl flex flex-col overflow-hidden"
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="overflow-y-auto overflow-x-hidden p-1 bg-popover"
        style={{ maxHeight: "250px", pointerEvents: "auto" }}
      >
        {filtered.length === 0 && !search && <div className="px-3 py-4 text-center text-xs text-muted-foreground">No racks</div>}
        {filtered.map((rack, idx) => (
          <button
            key={rack.id}
            ref={(el) => { itemRefs.current[idx] = el; }}
            type="button"
            onMouseEnter={(e) => {
              if (e.clientX !== lastMousePos.current.x || e.clientY !== lastMousePos.current.y) {
                setHighlighted(idx);
                lastMousePos.current = { x: e.clientX, y: e.clientY };
              }
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(rack.id); setOpen(false); setSearch(""); }}
            className={cn(
              "flex items-center w-full px-2 py-2 text-sm rounded-sm text-left mb-0.5 last:mb-0 transition-colors",
              highlighted === idx ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {rack.id === value && <Check className="w-3 h-3 shrink-0 mr-2" />}
            <span className="truncate">{rack.codeNo}</span>
          </button>
        ))}
      </div>
      {showCreate && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCreate}
          disabled={creating}
          className="m-1 flex items-center gap-2 px-2 py-2 text-xs font-medium text-primary hover:bg-accent rounded-sm border-t"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          {creating ? "Creating..." : `Create "${search.trim()}"`}
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative w-[160px]">
      {open ? (
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setHighlighted(-1); }}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-full h-8 rounded-md border border-primary bg-background px-2.5 py-1 text-xs focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-between w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs hover:bg-accent text-left"
        >
          <span className="truncate">{selected ? selected.codeNo : "Select Rack"}</span>
        </button>
      )}
      {dropdown}
    </div>
  );
};

// ─── Searchable Shelf Combobox ──────────────────────────────────────────────
interface ShelfComboboxProps {
  shelves: Shelf[];
  value: string;
  rackId: string;
  disabled: boolean;
  onChange: (shelfId: string) => void;
  onShelfCreated: (shelf: Shelf) => void;
}

const ShelfCombobox = ({ shelves, value, rackId, disabled, onChange, onShelfCreated }: ShelfComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const selected = shelves.find((s) => s.id === value);
  const filtered = shelves.filter((s) =>
    s.shelfNo.toLowerCase().includes(search.toLowerCase())
  );
  const showCreate = search.trim() && !filtered.some((s) => s.shelfNo.toLowerCase() === search.toLowerCase());

  const updatePosition = () => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownWidth = 224;
      const expectedHeight = Math.min(filtered.length * 36 + (showCreate ? 40 : 0) + 12, 300);

      let top = rect.bottom + 4;
      let left = rect.left;

      if (top + expectedHeight > viewportHeight && rect.top > expectedHeight) {
        top = rect.top - expectedHeight - 4;
      }
      if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 10;
      }

      setDropdownStyle({
        position: "fixed",
        top,
        left: Math.max(10, left),
        width: dropdownWidth,
        zIndex: 9999,
        pointerEvents: "auto"
      });
    }
  };

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, filtered.length, showCreate, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById("shelf-combobox-portal");
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) && (!portal || !portal.contains(e.target as Node))) {
        setOpen(false);
        setSearch("");
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && filtered[highlighted]) {
        onChange(filtered[highlighted].id);
        setOpen(false);
        setSearch("");
      } else if (showCreate) {
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  useEffect(() => {
    if (highlighted >= 0 && itemRefs.current[highlighted]) {
      itemRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  const handleCreate = async () => {
    if (!search.trim() || !rackId) return;
    setCreating(true);
    try {
      const res = await apiClient.createShelf({ shelfNo: search.trim(), rackId });
      const data: any = res.data || res;
      onShelfCreated({ id: data.id, shelfNo: data.shelfNo || search.trim(), rackId });
      onChange(data.id);
      setOpen(false);
      setSearch("");
      toast.success("Shelf created");
    } catch (e: any) {
      toast.error(e.error || "Failed");
    } finally {
      setCreating(false);
    }
  };

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center w-[160px] h-8 rounded-md border border-input bg-muted px-2.5 py-1 text-xs text-muted-foreground cursor-not-allowed text-left"
      >
        Select Rack first
      </button>
    );
  }

  const dropdown = open ? ReactDOM.createPortal(
    <div
      id="shelf-combobox-portal"
      style={dropdownStyle}
      className="rounded-md border bg-popover shadow-xl flex flex-col overflow-hidden"
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="overflow-y-auto overflow-x-hidden p-1 bg-popover"
        style={{ maxHeight: "250px", pointerEvents: "auto" }}
      >
        {filtered.length === 0 && !search && <div className="px-3 py-4 text-center text-xs text-muted-foreground">No shelves</div>}
        {filtered.map((shelf, idx) => (
          <button
            key={shelf.id}
            ref={(el) => { itemRefs.current[idx] = el; }}
            type="button"
            onMouseEnter={(e) => {
              if (e.clientX !== lastMousePos.current.x || e.clientY !== lastMousePos.current.y) {
                setHighlighted(idx);
                lastMousePos.current = { x: e.clientX, y: e.clientY };
              }
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(shelf.id); setOpen(false); setSearch(""); }}
            className={cn(
              "flex items-center w-full px-2 py-2 text-sm rounded-sm text-left mb-0.5 last:mb-0 transition-colors",
              highlighted === idx ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {shelf.id === value && <Check className="w-3 h-3 shrink-0 mr-2" />}
            <span className="truncate">{shelf.shelfNo}</span>
          </button>
        ))}
      </div>
      {showCreate && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCreate}
          disabled={creating}
          className="m-1 flex items-center gap-2 px-2 py-2 text-xs font-medium text-primary hover:bg-accent rounded-sm border-t"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          {creating ? "Creating..." : `Create "${search.trim()}"`}
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative w-[160px]">
      {open ? (
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setHighlighted(-1); }}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-full h-8 rounded-md border border-primary bg-background px-2.5 py-1 text-xs focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-between w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs hover:bg-accent text-left"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.shelfNo : "Select Shelf"}
          </span>
        </button>
      )}
      {dropdown}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────
export const StoreEditDPO = ({ order, open, onOpenChange, onSuccess }: StoreEditDPOProps) => {
  const [loading, setLoading] = useState(false);
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formStore, setFormStore] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formItems, setFormItems] = useState<OrderItemForm[]>([]);

  // Dropdown data
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);

  useEffect(() => {
    if (open && order) {
      loadOrderData();
    }
    if (open) {
      fetchDropdownData();
    }
  }, [open, order]);

  useEffect(() => {
    if (open && formStore) {
      fetchRacks();
    } else if (open && !formStore) {
      fetchRacks();
    }
  }, [open, formStore]);

  const loadOrderData = async () => {
    if (!order) return;
    try {
      const response = await apiClient.getDirectPurchaseOrder(order.id);
      const orderData: any = response.data || response;

      if (orderData) {
        const storeId = orderData.store_id || order.store_id || "";
        setFormDate(new Date(orderData.date || order.date));
        setFormStore(storeId);
        setFormDescription(orderData.description || order.description || "");

        if (orderData.items && orderData.items.length > 0) {
          const itemsMap = new Map<string, OrderItemForm>();
          orderData.items.forEach((item: any, idx: number) => {
            const partId = item.part_id || item.partId || "";
            if (!partId) return;
            if (!itemsMap.has(partId)) {
              itemsMap.set(partId, {
                id: String(idx + 1),
                partId,
                partNo: item.part_no || item.partNo || "",
                brand: item.brand || item.brand_name || "N/A",
                totalQuantity: "0",
                purchasePrice: String(item.purchase_price || item.purchasePrice || ""),
                salePrice: String(item.sale_price || item.salePrice || 0),
                locations: [{
                  id: `${idx + 1}_1`,
                  quantity: String(item.quantity || ""),
                  rackId: item.rack_id || item.rackId || "",
                  shelfId: item.shelf_id || item.shelfId || ""
                }],
              });
            }
            const existingItem = itemsMap.get(partId)!;
            const currentQty = Number(existingItem.totalQuantity) || 0;
            const itemQty = Number(item.quantity) || 0;
            existingItem.totalQuantity = String(currentQty + itemQty);
          });
          setFormItems(Array.from(itemsMap.values()));
        } else if (order.items && order.items.length > 0) {
          const itemsMap = new Map<string, OrderItemForm>();
          order.items.forEach((item, idx) => {
            if (!item.partId) return;
            if (!itemsMap.has(item.partId)) {
              itemsMap.set(item.partId, {
                id: String(idx + 1),
                partId: item.partId,
                partNo: item.partNo || "",
                brand: item.brand || "N/A",
                totalQuantity: "0",
                purchasePrice: String(item.purchasePrice),
                salePrice: String(item.salePrice || 0),
                locations: [{
                  id: `${idx + 1}_1`,
                  quantity: String(item.quantity || ""),
                  rackId: item.rackId || "",
                  shelfId: item.shelfId || ""
                }],
              });
            }
            const existingItem = itemsMap.get(item.partId)!;
            const currentQty = Number(existingItem.totalQuantity) || 0;
            existingItem.totalQuantity = String(currentQty + Number(item.quantity));
          });
          setFormItems(Array.from(itemsMap.values()));
        } else {
          setFormItems([{ id: "1", partId: "", partNo: "", brand: "", totalQuantity: "", purchasePrice: "", salePrice: "", locations: [{ id: "1_1", quantity: "", rackId: "", shelfId: "" }] }]);
        }

        await fetchRacks(storeId);
      }
    } catch {
      toast.error("Failed to load order details");
    }
  };

  const fetchDropdownData = async () => {
    try {
      const storesResponse = await apiClient.getStores("active");
      const storesData = storesResponse.data || storesResponse;
      if (Array.isArray(storesData)) {
        setStores(storesData.map((s: any) => ({ id: s.id, name: s.name })));
      }
    } catch { }
  };

  const fetchRacks = async (storeId?: string) => {
    try {
      const effectiveStoreId = (storeId || formStore) && (storeId || formStore) !== "all" ? (storeId || formStore) : undefined;
      const response = await apiClient.getRacks(effectiveStoreId);
      const racksData = response.data || response;

      let resolvedRacksData: any = racksData;
      if (effectiveStoreId && Array.isArray(racksData) && racksData.length === 0) {
        const fallbackResponse = await apiClient.getRacks(undefined);
        resolvedRacksData = fallbackResponse.data || fallbackResponse;
      }

      if (Array.isArray(resolvedRacksData)) {
        setRacks(
          resolvedRacksData.map((r: any) => ({
            id: r.id,
            codeNo: r.codeNo || r.code_no,
            storeId: r.storeId || r.store_id,
            shelves: (r.shelves || r.Shelf || []).map((s: any) => ({
              id: s.id,
              shelfNo: s.shelfNo || s.shelf_no,
              rackId: s.rackId || s.rack_id,
            })),
          }))
        );
      }
    } catch { }
  };

  const getShelvesForRack = (rackId: string): Shelf[] => {
    const rack = racks.find((r) => r.id === rackId);
    return rack?.shelves || [];
  };

  // ─── Rack/Shelf creation callbacks ────────────────────────────────────────
  const handleRackCreated = (newRack: Rack) => {
    setRacks((prev) => [...prev, newRack]);
  };

  const handleShelfCreated = (rackId: string, newShelf: Shelf) => {
    setRacks((prev) =>
      prev.map((r) =>
        r.id === rackId ? { ...r, shelves: [...r.shelves, newShelf] } : r
      )
    );
  };

  // ─── Item handlers ─────────────────────────────────────────────────────────
  const handleRemoveItem = (itemId: string) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter((item) => item.id !== itemId));
    }
  };

  const handleItemChange = (itemId: string, field: keyof OrderItemForm, value: string) => {
    setFormItems(formItems.map((item) => item.id === itemId ? { ...item, [field]: value } : item));
  };

  const handleAddLocation = (itemId: string) => {
    setFormItems(formItems.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          locations: [...item.locations, { id: `${itemId}_${item.locations.length + 1}`, quantity: "", rackId: "", shelfId: "" }],
        };
      }
      return item;
    }));
  };

  const handleRemoveLocation = (itemId: string, locationId: string) => {
    setFormItems(formItems.map((item) => {
      if (item.id === itemId) {
        const newLocations = item.locations.filter((loc) => loc.id !== locationId);
        if (newLocations.length === 0) {
          return { ...item, locations: [{ id: `${itemId}_1`, quantity: "", rackId: "", shelfId: "" }] };
        }
        return { ...item, locations: newLocations };
      }
      return item;
    }));
  };

  const handleLocationChange = (itemId: string, locationId: string, field: keyof LocationAssignment, value: string) => {
    setFormItems(formItems.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          locations: item.locations.map((loc) => {
            if (loc.id === locationId) {
              const updated = { ...loc, [field]: value };
              if (field === "rackId") updated.shelfId = "";
              return updated;
            }
            return loc;
          }),
        };
      }
      return item;
    }));
  };

  const calculateRemainingQuantity = (item: OrderItemForm): number => {
    const total = Number(item.totalQuantity) || 0;
    const assigned = item.locations.reduce((sum, loc) => sum + (Number(loc.quantity) || 0), 0);
    return total - assigned;
  };

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!order) return;
    if (!formStore) { toast.error("Please select a store"); return; }

    for (const item of formItems) {
      if (!item.partId || !item.totalQuantity) {
        toast.error("Please fill in all item fields");
        return;
      }
    }

    try {
      setLoading(true);

      // Build items — if locations have rack/shelf, use first location's rack/shelf
      const itemsForUpdate: any[] = [];
      formItems.forEach((item) => {
        if (!item.partId || !item.totalQuantity) return;
        const purchasePrice = Number(item.purchasePrice) || 0;
        const quantity = Number(item.totalQuantity) || 0;
        const amount = purchasePrice * quantity;
        const firstLoc = item.locations[0];

        itemsForUpdate.push({
          part_id: item.partId,
          quantity,
          purchase_price: purchasePrice,
          sale_price: Number(item.salePrice) || 0,
          amount,
          rack_id: firstLoc?.rackId || null,
          shelf_id: firstLoc?.shelfId || null,
        });
      });

      await apiClient.updateDirectPurchaseOrder(order.id, {
        date: formDate.toISOString(),
        store_id: formStore,
        description: formDescription || undefined,
        items: itemsForUpdate,
      });

      toast.success("Local Purchase Order updated successfully");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error.error || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 border-b bg-muted/30">
          <DialogTitle>Edit Local Purchase Order - {order.dpo_no}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Header Info - Fixed */}
          <div className="p-6 pb-2 border-b">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}
                    >
                      {formDate ? format(formDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={formDate} onSelect={(date) => date && setFormDate(date)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Store *</Label>
                <Select value={formStore || undefined} onValueChange={setFormStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id || "unknown"}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={1}
                />
              </div>
            </div>
          </div>

          {/* Items - Scrollable Area */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-bold">Items *</Label>
              </div>
              <div className="space-y-6">
                {formItems.map((item) => {
                  const partDisplay = item.partNo && item.brand
                    ? `${item.partNo} - ${item.brand}`
                    : item.partNo || item.brand || "N/A";
                  const remaining = calculateRemainingQuantity(item);

                  return (
                    <div key={item.id} className="rounded-lg border-2 p-4 space-y-4 bg-muted/10 shadow-sm transition-all hover:border-primary/30">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-base font-bold text-primary">{partDisplay}</div>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">Total Quantity</Label>
                              <Input
                                type="number"
                                value={item.totalQuantity}
                                onChange={(e) => handleItemChange(item.id, "totalQuantity", e.target.value)}
                                placeholder="Total Qty"
                                min="1"
                                className="w-32 h-9 font-bold"
                              />
                            </div>
                            {remaining > 0 && item.locations.some((l) => l.rackId) && (
                              <div className="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-full border border-amber-200 mt-4">
                                {remaining} qty unassigned
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={formItems.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Location Assignments */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Location Assignments</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddLocation(item.id)}
                            className="text-xs h-7 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Location
                          </Button>
                        </div>
                        <div className="rounded-md border bg-card">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="w-[100px] text-xs font-bold">Quantity</TableHead>
                                <TableHead className="w-[180px] text-xs font-bold">
                                  Rack
                                </TableHead>
                                <TableHead className="w-[180px] text-xs font-bold">
                                  Shelf
                                </TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {item.locations.map((location) => {
                                const shelves = location.rackId ? getShelvesForRack(location.rackId) : [];
                                return (
                                  <TableRow key={location.id}>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        value={location.quantity}
                                        onChange={(e) => handleLocationChange(item.id, location.id, "quantity", e.target.value)}
                                        placeholder="Qty"
                                        min="1"
                                        className="w-20 h-8"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <RackCombobox
                                        racks={racks}
                                        value={location.rackId}
                                        storeId={formStore}
                                        onChange={(rackId) => handleLocationChange(item.id, location.id, "rackId", rackId)}
                                        onRackCreated={handleRackCreated}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <ShelfCombobox
                                        shelves={shelves}
                                        value={location.shelfId}
                                        rackId={location.rackId}
                                        disabled={!location.rackId}
                                        onChange={(shelfId) => handleLocationChange(item.id, location.id, "shelfId", shelfId)}
                                        onShelfCreated={(shelf) => handleShelfCreated(location.rackId, shelf)}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                        onClick={() => handleRemoveLocation(item.id, location.id)}
                                        disabled={item.locations.length === 1}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
