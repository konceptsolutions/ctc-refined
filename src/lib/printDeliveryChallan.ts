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

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const printDeliveryChallan = (payload: DeliveryChallanPayload) => {
  const printDateTime = payload.printDateTime || new Date().toLocaleString();
  const invoiceDateText = payload.invoiceDate
    ? new Date(payload.invoiceDate).toLocaleDateString()
    : "-";
  const totalQty = payload.items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0),
    0,
  );
  const totalDelivered = payload.items.reduce(
    (sum, item) => sum + (Number(item.deliveredQty) || 0),
    0,
  );
  const totalPending = payload.items.reduce(
    (sum, item) => sum + (Number(item.pendingQty) || 0),
    0,
  );
  const totalWeight = payload.items.reduce(
    (sum, item) => sum + (Number(item.weight) || 0),
    0,
  );
  const rows = payload.items
    .map(
      (item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(item.partNo || "-")}</td>
        <td>${esc(item.ssPartNo || item.partNo || "-")}</td>
        <td>${esc(item.description || "-")}</td>
        <td>${esc(item.brand || "-")}</td>
        <td class="c">${esc(item.uom || "NOS")}</td>
        <td class="c">${Number(item.qty) || 0}</td>
        <td class="c">${Number(item.deliveredQty) || 0}</td>
        <td class="c">${Number(item.pendingQty) || 0}</td>
        <td>${esc(item.location || "-")}</td>
        <td class="c">${Number(item.weight || 0).toFixed(3)}</td>
      </tr>
    `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Delivery Challan - ${esc(payload.challanNo || payload.invoiceNo)}</title>
        <style>
          @page { size: A5 landscape; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
          .company { text-align: center; font-weight: 700; font-size: 22px; letter-spacing: .5px; margin-bottom: 2px; }
          .title { text-align: center; font-weight: 700; font-size: 14px; margin-bottom: 6px; }
          .left p, .right p { margin: 1px 0; }
          .right { text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #555; padding: 3px 4px; font-size: 10px; }
          th { background: #f5f5f5; text-align: left; }
          .c { text-align: center; }
          .summary { margin-top: 6px; display: flex; justify-content: space-between; }
          .summary .left, .summary .right { width: 49%; }
          .right-box { margin-left: auto; width: 38%; }
          .right-box table td { border: none; border-bottom: 1px solid #777; padding: 3px 2px; }
          .right-box table tr:last-child td { border-bottom: 2px solid #000; font-weight: 700; }
          .signatures { margin-top: 20px; display: flex; justify-content: space-between; }
          .sign { width: 31%; text-align: center; }
          .line { margin: 18px auto 4px; width: 85%; border-top: 1px solid #333; }
        </style>
      </head>
      <body>
        <div class="company">DELIVERY CHALLAN</div>
        <div class="header">
          <div class="left">
            <p><strong>M/S.</strong> ${esc(payload.customerName)}</p>
            <p>${esc(payload.deliveredTo || "-")}</p>
          </div>
          <div class="right">
            <p>Print: ${esc(printDateTime)}</p>
            <p>Page 1 of 1</p>
            <p>No: ${esc(payload.invoiceNo)}</p>
            <p>Date: ${esc(invoiceDateText)}</p>
            <p>Challan: ${esc(payload.challanNo)}</p>
            <p>User: ${esc(payload.userName || "-")}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="c">Sr#</th>
              <th>Part #</th>
              <th>SS Part #</th>
              <th>Description</th>
              <th>Brand</th>
              <th class="c">UOM</th>
              <th class="c">Qty</th>
              <th class="c">Delivered Qty</th>
              <th class="c">Pending Qty</th>
              <th>Location</th>
              <th class="c">Weight</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="11" class="c">No items</td></tr>'}
            <tr>
              <td colspan="6" class="c"><strong>Total</strong></td>
              <td class="c"><strong>${totalQty}</strong></td>
              <td class="c"><strong>${totalDelivered}</strong></td>
              <td class="c"><strong>${totalPending}</strong></td>
              <td>-</td>
              <td class="c"><strong>${totalWeight.toFixed(3)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="summary">
          <div class="left">
            <p><strong>Delivered to :</strong> ${esc(payload.deliveredTo || "-")}</p>
            <p><strong>Note :-</strong> ${esc(payload.notes || "Received goods as per invoice in original packing and condition.")}</p>
          </div>
          <div class="right-box">
            <table>
              <tr><td>Status</td><td style="text-align:right">${esc(payload.status || "-")}</td></tr>
              <tr><td>Invoice No</td><td style="text-align:right">${esc(payload.invoiceNo)}</td></tr>
            </table>
          </div>
        </div>

        <div class="signatures">
          <div class="sign"><div class="line"></div>( Delivered By )</div>
          <div class="sign"><div class="line"></div>( Verified By )</div>
          <div class="sign"><div class="line"></div>( Received By )</div>
        </div>
      </body>
    </html>
  `;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => {
      if (document.body.contains(frame)) document.body.removeChild(frame);
      window.focus();
    }, 150);
  };

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.onafterprint = cleanup;
    setTimeout(() => {
      win.focus();
      win.print();
    }, 120);
    setTimeout(cleanup, 3000);
  };

  frame.srcdoc = html;
};
