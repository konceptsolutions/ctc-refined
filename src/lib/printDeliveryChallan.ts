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

const uniqueLabels = (labels: string[]) =>
  [...new Set(labels.map((label) => label.trim()).filter(Boolean))];

const getRackCode = (loc: any) =>
  String(
    loc?.Rack?.codeNo ||
      loc?.Rack?.code_no ||
      loc?.Rack?.code ||
      loc?.rack?.codeNo ||
      loc?.rack?.code_no ||
      loc?.rack?.code ||
      loc?.rackCode ||
      loc?.rack_code ||
      "",
  ).trim();

const getShelfNo = (loc: any) =>
  String(
    loc?.Shelf?.shelfNo ||
      loc?.Shelf?.shelf_no ||
      loc?.Shelf?.name ||
      loc?.shelf?.shelfNo ||
      loc?.shelf?.shelf_no ||
      loc?.shelf?.name ||
      loc?.shelfNo ||
      loc?.shelf_no ||
      "",
  ).trim();

const getStoreName = (loc: any) =>
  String(
    loc?.Store?.name ||
      loc?.Store?.storeName ||
      loc?.store?.name ||
      loc?.storeName ||
      loc?.store_name ||
      "",
  ).trim();

const formatLocationLabel = (loc: any): string => {
  const rack = getRackCode(loc);
  const shelf = getShelfNo(loc);
  const store = getStoreName(loc);

  if (!rack && !shelf && !store) return "";

  const rackShelf =
    rack || shelf ? `${rack || "-"}${shelf ? `-${shelf}` : ""}` : "";
  if (store && rackShelf) return `${store} · ${rackShelf}`;
  if (rackShelf) return rackShelf;
  return store;
};

const getInvoiceRackShelfEntries = (item: any) => {
  const entries =
    item?.InvoiceRackShelf ||
    item?.invoiceRackShelf ||
    item?.invoice_rack_shelf ||
    [];
  return Array.isArray(entries) ? entries : [];
};

const formatMappedRackShelf = (rackCode?: string, shelfNo?: string) => {
  const racks = String(rackCode || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const shelves = String(shelfNo || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!racks.length && !shelves.length) return "";

  if (!racks.length) return shelves.join(", ");

  return racks
    .map((rack, index) => {
      const shelf = shelves[index] || shelves[0] || "";
      return shelf ? `${rack}-${shelf}` : rack;
    })
    .join(", ");
};

const getStockMovements = (invoice: any) => {
  const rows = invoice?.stockMovements || invoice?.StockMovement || [];
  return Array.isArray(rows) ? rows : [];
};

const getStockReservations = (invoice: any) => {
  const rows = invoice?.StockReservation || invoice?.stockReservation || [];
  return Array.isArray(rows) ? rows : [];
};

const getPartRackShelfEntries = (item: any) => {
  const rows = item?.Part?.PartRackShelf || item?.part?.PartRackShelf || [];
  return Array.isArray(rows) ? rows : [];
};

/** Resolve rack/shelf for challan from invoice line, reservations, or delivery stock movements. */
export const getChallanItemLocation = (item: any, invoice: any): string => {
  const fromInvoiceRackShelf = uniqueLabels(
    getInvoiceRackShelfEntries(item).map((loc) => formatLocationLabel(loc)),
  );
  if (fromInvoiceRackShelf.length) {
    return fromInvoiceRackShelf.join(", ");
  }

  const movements = getStockMovements(invoice).filter(
    (movement: any) =>
      String(movement?.type || "").toLowerCase() === "out" &&
      String(movement?.partId || "") === String(item?.partId || ""),
  );

  const itemSpecificMovements = movements.filter(
    (movement: any) =>
      String(movement?.id || "").includes(`_${item?.id}_`) ||
      String(movement?.notes || "").includes(String(item?.id || "")),
  );
  const movementSource =
    itemSpecificMovements.length > 0 ? itemSpecificMovements : movements;
  const fromMovements = uniqueLabels(
    movementSource.map((movement) => formatLocationLabel(movement)),
  );
  if (fromMovements.length) {
    return fromMovements.join(", ");
  }

  const fromReservations = uniqueLabels(
    getStockReservations(invoice)
      .filter(
        (reservation: any) =>
          String(reservation?.partId || "") === String(item?.partId || "") &&
          (reservation?.rackId ||
            reservation?.shelfId ||
            reservation?.storeId ||
            reservation?.Rack ||
            reservation?.Shelf ||
            reservation?.Store),
      )
      .map((reservation) => formatLocationLabel(reservation)),
  );
  if (fromReservations.length) {
    return fromReservations.join(", ");
  }

  const fromPartRackShelf = uniqueLabels(
    getPartRackShelfEntries(item).map((loc) => formatLocationLabel(loc)),
  );
  if (fromPartRackShelf.length) {
    return fromPartRackShelf.join(", ");
  }

  const mappedLocation = formatMappedRackShelf(item?.rackCode, item?.shelfNo);
  if (mappedLocation) {
    return mappedLocation;
  }

  if (item?.rackCode || item?.shelfNo) {
    const fallback = formatLocationLabel({
      rackCode: item.rackCode,
      shelfNo: item.shelfNo,
    });
    if (fallback) return fallback;
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
