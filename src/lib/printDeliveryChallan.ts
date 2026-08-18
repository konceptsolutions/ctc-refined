import { printDeliveryChallanPdf } from "@/utils/printDeliveryChallanPdf";

type DeliveryChallanItem = {
  partNo: string;
  ssPartNo?: string;
  description?: string;
  brand?: string;
  uom?: string;
  qty?: number;
  deliveredQty: number;
  pendingQty: number;
  location?: string;
  weight?: number;
};

type DeliveryChallanPayload = {
  challanNo: string;
  invoiceNo: string;
  invoiceDate?: string;
  printDateTime?: string;
  customerName: string;
  deliveredTo?: string;
  status?: string;
  userName?: string;
  notes?: string;
  items: DeliveryChallanItem[];
};

const formatRackShelfLabel = (loc: {
  Rack?: { codeNo?: string; code?: string; rackCode?: string } | null;
  Shelf?: { shelfNo?: string; name?: string } | null;
  rackCode?: string;
  shelfNo?: string;
}) => {
  const rack =
    loc?.Rack?.codeNo ||
    loc?.Rack?.code ||
    loc?.Rack?.rackCode ||
    loc?.rackCode ||
    "";
  const shelf = loc?.Shelf?.shelfNo || loc?.Shelf?.name || loc?.shelfNo || "";
  if (!rack && !shelf) return "";
  return `${rack || "-"}-${shelf || "-"}`;
};

/** Resolve rack/shelf for challan from invoice line, reservations, or delivery stock movements. */
export const getChallanItemLocation = (item: any, invoice: any): string => {
  const fromInvoiceRackShelf = (item.InvoiceRackShelf || [])
    .map((loc: any) => formatRackShelfLabel(loc))
    .filter(Boolean);
  if (fromInvoiceRackShelf.length) {
    return [...new Set(fromInvoiceRackShelf)].join(", ");
  }

  const movements = (
    invoice?.stockMovements ||
    invoice?.StockMovement ||
    []
  ).filter((m: any) => m.type === "out" && m.partId === item.partId);

  const itemSpecificMovements = movements.filter(
    (m: any) =>
      String(m.id || "").includes(`_${item.id}_`) ||
      String(m.notes || "").includes(item.id),
  );
  const movementSource =
    itemSpecificMovements.length > 0 ? itemSpecificMovements : movements;
  const fromMovements = movementSource
    .map((m: any) => formatRackShelfLabel(m))
    .filter(Boolean);
  if (fromMovements.length) {
    return [...new Set(fromMovements)].join(", ");
  }

  const fromReservations = (invoice?.StockReservation || [])
    .filter(
      (r: any) =>
        r.partId === item.partId && (r.rackId || r.shelfId || r.storeId),
    )
    .map((r: any) => formatRackShelfLabel(r))
    .filter(Boolean);
  if (fromReservations.length) {
    return [...new Set(fromReservations)].join(", ");
  }

  if (item.rackCode || item.shelfNo) {
    return formatRackShelfLabel({
      rackCode: item.rackCode,
      shelfNo: item.shelfNo,
    });
  }

  return "-";
};

export const printDeliveryChallan = (payload: DeliveryChallanPayload) => {
  printDeliveryChallanPdf({
    challanNo: payload.challanNo,
    invoiceNo: payload.invoiceNo,
    invoiceDate: payload.invoiceDate,
    printDateTime: payload.printDateTime,
    customerName: payload.customerName,
    deliveredTo: payload.deliveredTo,
    status: payload.status,
    userName: payload.userName,
    notes: payload.notes,
    items: payload.items,
  });
};
