export interface StockMovementLike {
  type: string;
  quantity: number;
  referenceType?: string | null;
  rackId?: string | null;
  shelfId?: string | null;
}

const DEFAULT_EXCLUDED_REFS = ["stock_reservation"];

/** Net stock from movements — matches cost-lookup / Stock In-Out. */
export function netStockFromMovements(
  movements: StockMovementLike[],
  options?: { excludeReferenceTypes?: string[] },
): number {
  const exclude = options?.excludeReferenceTypes ?? DEFAULT_EXCLUDED_REFS;
  let sum = 0;
  for (const m of movements) {
    const ref = m.referenceType ?? null;
    if (ref && exclude.includes(ref)) continue;
    sum += m.type === "in" ? m.quantity : -m.quantity;
  }
  return sum;
}

export function unassignedStockFromMovements(
  movements: StockMovementLike[],
  options?: { excludeReferenceTypes?: string[] },
): number {
  const exclude = options?.excludeReferenceTypes ?? DEFAULT_EXCLUDED_REFS;
  let sum = 0;
  for (const m of movements) {
    const ref = m.referenceType ?? null;
    if (ref && exclude.includes(ref)) continue;
    if (m.rackId || m.shelfId) continue;
    sum += m.type === "in" ? m.quantity : -m.quantity;
  }
  return sum;
}

export function stockInOutTotals(movements: StockMovementLike[]): {
  stockIn: number;
  stockOut: number;
} {
  let stockIn = 0;
  let stockOut = 0;
  for (const m of movements) {
    if (m.referenceType === "stock_reservation") continue;
    if (m.type === "in") stockIn += m.quantity;
    else stockOut += m.quantity;
  }
  return { stockIn, stockOut };
}
