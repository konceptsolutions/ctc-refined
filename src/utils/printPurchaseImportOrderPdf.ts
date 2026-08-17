import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ACCOUNTING_COLORS,
  applyPdfFcLcColors,
} from "@/utils/accountingColors";

export type PurchaseImportOrderPrintDetail = {
  poNumber?: string | null;
  date?: string | Date | null;
  status?: string | null;
  supplierName?: string | null;
  quotationNo?: string | null;
  requestNo?: string | null;
  consignee?: string | null;
  currency?: string | null;
  conversionRate?: number | null;
  invoiceNo?: string | null;
  invoiceDate?: string | Date | null;
  blNo?: string | null;
  blDate?: string | Date | null;
  forwarder?: string | null;
  estTimeDate?: string | Date | null;
  isRevised?: boolean;
  notes?: string | null;
  fcTotal?: number | null;
  lcTotal?: number | null;
  totalExp?: number | null;
};

export type PurchaseImportOrderPrintItem = {
  masterPartNo?: string | null;
  partNo?: string | null;
  description?: string | null;
  brand?: string | null;
  orderQty?: number | null;
  receivedQty?: number | null;
  additionalQty?: number | null;
  backQty?: number | null;
  fcRate?: number | null;
  fcAmount?: number | null;
  lcRate?: number | null;
  lcAmount?: number | null;
  weight?: number | null;
  totalWeight?: number | null;
};

export type PurchaseImportOrderPrintTotals = {
  orderQty: number;
  receivedQty: number;
  fcAmount: number;
  lcAmount: number;
  totalWeight: number;
};

const MONTH_SHORT_UPPER = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const formatPrintDate = (value?: string | Date | null) => {
  if (!value) return "-";
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) return "-";
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = MONTH_SHORT_UPPER[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
};

const formatPrintDateTime = (value?: string | Date | null) => {
  const dateObj = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dateObj.getTime())) return "-";
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${formatPrintDate(dateObj)} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
};

const text = (value: unknown) => String(value ?? "");

const num = (value: unknown, digits = 2) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
};

const openPdfPrintDialog = (doc: jsPDF): boolean => {
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(url, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return false;
  }

  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  printWindow.addEventListener?.("load", triggerPrint);
  window.setTimeout(triggerPrint, 500);
  return true;
};

/**
 * Generates Import Purchase Order PDF and opens the browser print dialog.
 */
export const printPurchaseImportOrder = ({
  detail,
  itemRows,
  totals,
}: {
  detail: PurchaseImportOrderPrintDetail;
  itemRows: PurchaseImportOrderPrintItem[];
  totals: PurchaseImportOrderPrintTotals;
}): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text("Import Purchase Order", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(printedOn, pageWidth - marginX, 14, { align: "right" });

  const cards: Array<{ label: string; value: string }> = [
    { label: "PO No", value: text(detail.poNumber || "-") },
    { label: "PO Date", value: formatPrintDate(detail.date) },
    { label: "Status", value: text(detail.status || "-") },
    { label: "Supplier", value: text(detail.supplierName || "-") },
    { label: "Quotation No", value: text(detail.quotationNo || "-") },
    { label: "Inquiry No", value: text(detail.requestNo || "-") },
    {
      label: "Consignee",
      value: text(detail.consignee || "-").toUpperCase(),
    },
    { label: "Currency", value: text(detail.currency || "-") },
    {
      label: "Exchange Rate",
      value: String(Number(detail.conversionRate || 0) || "-"),
    },
    { label: "Invoice No", value: text(detail.invoiceNo || "-") },
    { label: "Invoice Date", value: formatPrintDate(detail.invoiceDate) },
    { label: "BL No", value: text(detail.blNo || "-") },
    { label: "BL Date", value: formatPrintDate(detail.blDate) },
    { label: "Forwarder", value: text(detail.forwarder || "-") },
    { label: "Est Time Date", value: formatPrintDate(detail.estTimeDate) },
    { label: "Upto Date", value: formatPrintDate(new Date()) },
  ];

  const gap = 2.5;
  const cols = 4;
  const cardW = (contentWidth - gap * (cols - 1)) / cols;
  const cardH = 12;
  const cardY = 18;

  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = marginX + col * (cardW + gap);
    const y = cardY + row * (cardH + gap);

    doc.setDrawColor(221, 221, 221);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(102, 102, 102);
    doc.text(card.label, x + 2, y + 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(17, 17, 17);
    const valueLines = doc.splitTextToSize(card.value, cardW - 4);
    doc.text(valueLines, x + 2, y + 8);
  });

  let cursorY = cardY + Math.ceil(cards.length / cols) * (cardH + gap) + 1;

  if (detail.notes) {
    const notesLines = doc.splitTextToSize(
      `Notes: ${text(detail.notes)}`,
      contentWidth - 5,
    );
    const notesH = Math.max(10, notesLines.length * 3.8 + 5);
    doc.setDrawColor(221, 221, 221);
    doc.roundedRect(marginX, cursorY, contentWidth, notesH, 1.2, 1.2, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    doc.text(notesLines, marginX + 2.5, cursorY + 4.5);
    cursorY += notesH + 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text("Items", marginX, cursorY + 3);
  cursorY += 5;

  const fcRateLabel = "FC Rate";
  const fcAmtLabel = "FC Amount";
  const lcRateLabel = "LC Rate";
  const lcAmtLabel = "LC Amount";

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "#",
        "Item",
        "Brand",
        "Order Qty",
        "Received",
        "From Back",
        "Back",
        fcRateLabel,
        fcAmtLabel,
        lcRateLabel,
        lcAmtLabel,
        "Weight",
        "Total Wt",
      ],
    ],
    body:
      itemRows.length === 0
        ? [["", "No items", "", "", "", "", "", "", "", "", "", "", ""]]
        : itemRows.map((item, index) => [
            String(index + 1),
            `${text(item.masterPartNo || "-")} | ${text(item.partNo || "-")}\n${text(item.description || "-")}`,
            text(item.brand || "-"),
            String(Number(item.orderQty || 0)),
            String(Number(item.receivedQty || 0)),
            Number(item.additionalQty || 0) > 0
              ? String(Number(item.additionalQty || 0))
              : "-",
            Number(item.backQty || 0) > 0
              ? String(Number(item.backQty || 0))
              : "-",
            num(item.fcRate, 4),
            num(item.fcAmount, 4),
            num(item.lcRate, 0),
            num(item.lcAmount, 0),
            Number(item.weight || 0) > 0 ? num(item.weight, 4) : "-",
            Number(item.totalWeight || 0) > 0
              ? num(item.totalWeight, 4)
              : "-",
          ]),
    foot: [
      [
        "",
        "Totals",
        "",
        String(totals.orderQty),
        String(totals.receivedQty),
        "",
        "",
        "",
        num(totals.fcAmount, 2),
        "",
        num(totals.lcAmount, 0),
        "",
        num(totals.totalWeight, 4),
      ],
    ],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: 6.5,
      cellPadding: 1.2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [22, 100, 218],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 48 },
      2: { cellWidth: 16 },
      3: { halign: "right", cellWidth: 14 },
      4: { halign: "right", cellWidth: 14 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 12 },
      7: { halign: "right", cellWidth: 16 },
      8: { halign: "right", cellWidth: 18 },
      9: { halign: "right", cellWidth: 16 },
      10: { halign: "right", cellWidth: 18 },
      11: { halign: "right", cellWidth: 14 },
      12: { halign: "right", cellWidth: 16 },
    },
    didParseCell: (data) => {
      if (itemRows.length === 0 && data.section === "body" && data.column.index === 1) {
        data.cell.styles.halign = "center";
        data.cell.styles.textColor = [102, 102, 102];
      }
      if (data.section === "head" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "foot" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      applyPdfFcLcColors(data, [7, 8], [9, 10]);
    },
  });

  let finalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 8;

  const summaryBits = [
    Number(detail.fcTotal || 0) > 0 ? `FC Total: ${num(detail.fcTotal)}` : "",
    Number(detail.lcTotal || 0) > 0 ? `LC Total: ${num(detail.lcTotal)}` : "",
    Number(detail.totalExp || 0) > 0 ? `Total Exp.: ${num(detail.totalExp)}` : "",
  ].filter(Boolean);

  if (summaryBits.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = marginX;
    if (Number(detail.fcTotal || 0) > 0) {
      doc.setTextColor(...ACCOUNTING_COLORS.fc.rgb);
      doc.text(`FC Total: ${num(detail.fcTotal)}`, x, finalY);
      x += doc.getTextWidth(`FC Total: ${num(detail.fcTotal)}   |   `);
    }
    if (Number(detail.lcTotal || 0) > 0) {
      doc.setTextColor(...ACCOUNTING_COLORS.lc.rgb);
      doc.text(`LC Total: ${num(detail.lcTotal)}`, x, finalY);
      x += doc.getTextWidth(`LC Total: ${num(detail.lcTotal)}   |   `);
    }
    if (Number(detail.totalExp || 0) > 0) {
      doc.setTextColor(17, 17, 17);
      doc.text(`Total Exp.: ${num(detail.totalExp)}`, x, finalY);
    }
    finalY += 6;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text("Computer-generated document.", marginX, finalY);

  return openPdfPrintDialog(doc);
};
