/** Normalize a location field that may be a placeholder like "No Rack". */
function cleanLocPart(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^no\s+(store|rack|shelf)$/i.test(raw)) return "";
  if (raw === "-" || raw === "—") return "";
  return raw;
}

export type StockLocationLike = {
  id?: string;
  storeId?: string | null;
  storeName?: string | null;
  store?: string | null;
  rackId?: string | null;
  rackCode?: string | null;
  rack?: string | null;
  shelfId?: string | null;
  shelfNo?: string | null;
  shelf?: string | null;
  quantity?: number | null;
  isVirtualUnallocated?: boolean;
  isUnlocated?: boolean;
};

/** Format one stock location as "Store / Rack-Shelf" (store always preferred). */
export function formatStockLocationLabel(loc: StockLocationLike): string {
  if (!loc) return "";
  if (loc.isVirtualUnallocated) return "";
  if (typeof loc.id === "string" && loc.id.startsWith("unallocated-")) return "";

  const store = cleanLocPart(loc.storeName || loc.store);
  if (store.toLowerCase() === "unallocated") return "";

  const rack = cleanLocPart(loc.rackCode || loc.rack);
  const shelf = cleanLocPart(loc.shelfNo || loc.shelf);
  const rackShelf = rack && shelf ? `${rack}-${shelf}` : rack || shelf;

  if (store && rackShelf) return `${store} / ${rackShelf}`;
  if (store) return store;
  if (rackShelf) return rackShelf;
  return "";
}

/** Join all real locations for a part (skips empty / virtual unallocated). */
export function formatStockLocationsDisplay(
  locations: StockLocationLike[] | null | undefined,
): string {
  if (!Array.isArray(locations) || locations.length === 0) return "";

  const labels = [
    ...new Set(
      locations
        .filter((loc) => {
          const qty = Number(loc?.quantity);
          if (Number.isFinite(qty) && qty <= 0) return false;
          return true;
        })
        .map((loc) => formatStockLocationLabel(loc))
        .filter(Boolean),
    ),
  ];

  return labels.join(", ");
}

/**
 * Build a display string from aggregated balance fields
 * (store / rack / shelf may already be comma-joined).
 */
export function formatBalanceLocationDisplay(balance: {
  location?: string | null;
  store?: string | null;
  rack?: string | null;
  shelf?: string | null;
}): string {
  const fromApi = String(balance?.location || "").trim();
  if (fromApi) return fromApi;

  const store = cleanLocPart(balance?.store);
  const rack = cleanLocPart(balance?.rack);
  const shelf = cleanLocPart(balance?.shelf);
  const rackShelf = rack && shelf ? `${rack}-${shelf}` : rack || shelf;

  if (store && rackShelf) return `${store} / ${rackShelf}`;
  if (store) return store;
  if (rackShelf) return rackShelf;
  return "";
}
