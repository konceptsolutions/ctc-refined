import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type InquiryViewSupplierRow = {
  name: string;
  country: string;
  area: string;
  type: string;
  currencyName: string;
};

export type InquiryViewItemRow = {
  id?: string;
  partId: string;
  masterPartNo: string;
  partNo: string;
  description: string;
  brand: string;
  khiQuantity: number;
  isbQuantity: number;
  otherQuantity: number;
  totalDemand: number;
  weight: number;
  totalWeight: number;
  currentStock?: number;
};

export type PurchaseImportInquiryPrintDetail = {
  id?: string;
  requestNo?: string | null;
  requestDate?: string | Date | null;
  status?: string | null;
  partReference?: string | null;
  notes?: string | null;
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

/** e.g. 28-JUN-2026 */
const formatPrintDate = (value?: string | Date | null) => {
  const dateObj = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dateObj.getTime())) return "-";
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = MONTH_SHORT_UPPER[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
};

/** e.g. 28-JUN-2026 03:12 PM */
const formatPrintDateTime = (value?: string | Date | null) => {
  const dateObj = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dateObj.getTime())) return "-";
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${formatPrintDate(dateObj)} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
};

const toInputDate = (value?: string | Date | null) => {
  if (!value) return "";
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) return "";
  return dateObj.toISOString().split("T")[0];
};

const text = (value: unknown) => String(value ?? "");

/**
 * Generates the Purchase Import Inquiry PDF with the same content/layout
 * as the previous HTML print view (A4, header cards, suppliers, items).
 */
export const printPurchaseImportInquiry = ({
  detail,
  supplierRows,
  itemRows,
  totals,
}: {
  detail: PurchaseImportInquiryPrintDetail;
  supplierRows: InquiryViewSupplierRow[];
  itemRows: InquiryViewItemRow[];
  totals: { qty: number; weight: number };
}): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());
  const uptoDate = formatPrintDate(new Date());
  const inquiryNo = text(detail.requestNo || "-");

  // Header: title left, printed datetime top-right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("Purchase Import Inquiry", marginX, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(printedOn, pageWidth - marginX, 16, { align: "right" });

  // Header cards (same fields as before)
  const cards: Array<{ label: string; value: string }> = [
    { label: "Inquiry No", value: inquiryNo },
    { label: "Inquiry Date", value: toInputDate(detail.requestDate) || "-" },
    { label: "Status", value: text(detail.status || "pending") },
    { label: "Part Reference", value: text(detail.partReference || "-") },
    { label: "Upto Date", value: uptoDate },
  ];

  const gap = 3;
  const cols = 4;
  const cardW = (contentWidth - gap * (cols - 1)) / cols;
  const cardH = 14;
  let cardY = 22;

  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = marginX + col * (cardW + gap);
    const y = cardY + row * (cardH + gap);

    doc.setDrawColor(221, 221, 221);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(102, 102, 102);
    doc.text(card.label, x + 2.5, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(17, 17, 17);
    const valueLines = doc.splitTextToSize(card.value, cardW - 5);
    doc.text(valueLines, x + 2.5, y + 9);
  });

  let cursorY = cardY + Math.ceil(cards.length / cols) * (cardH + gap) + 2;

  // Notes
  if (detail.notes) {
    const notesBody = `Notes: ${text(detail.notes)}`;
    const notesLines = doc.splitTextToSize(notesBody, contentWidth - 6);
    const notesH = Math.max(12, notesLines.length * 4.2 + 6);

    doc.setDrawColor(221, 221, 221);
    doc.roundedRect(marginX, cursorY, contentWidth, notesH, 1.5, 1.5, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(notesLines, marginX + 3, cursorY + 5);
    cursorY += notesH + 6;
  }

  // Suppliers section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 17, 17);
  doc.text("Suppliers", marginX, cursorY + 4);
  cursorY += 6;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [["Supplier", "Country", "Area", "Currency"]],
    body:
      supplierRows.length === 0
        ? [["No suppliers", "", "", ""]]
        : supplierRows.map((supplier) => [
            text(supplier.name),
            text(supplier.country),
            text(supplier.area),
            text(supplier.currencyName),
          ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
      valign: "top",
    },
    headStyles: {
      fillColor: [22, 100, 218],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    didParseCell: (data) => {
      if (
        supplierRows.length === 0 &&
        data.section === "body" &&
        data.column.index === 0
      ) {
        data.cell.styles.halign = "center";
        data.cell.styles.textColor = [102, 102, 102];
        data.cell.colSpan = 4;
      }
    },
  });

  cursorY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 8;

  // Items section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 17, 17);
  doc.text("Items", marginX, cursorY + 4);
  cursorY += 6;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "#",
        "Item",
        "Brand",
        "Stock",
        "ISB",
        "KHI",
        "Total Qty",
        "Weight",
        "Total Weight",
      ],
    ],
    body:
      itemRows.length === 0
        ? [["", "No items", "", "", "", "", "", "", ""]]
        : itemRows.map((item, index) => [
            String(index + 1),
            `${text(item.masterPartNo)} | ${text(item.partNo)}\n${text(item.description)}`,
            text(item.brand),
            String(Number(item.currentStock || 0)),
            String(item.isbQuantity),
            String(item.khiQuantity),
            String(item.totalDemand),
            item.weight.toFixed(2),
            item.totalWeight.toFixed(2),
          ]),
    foot: [
      [
        "",
        "",
        "",
        "",
        "",
        "Totals",
        String(totals.qty),
        "",
        totals.weight.toFixed(2),
      ],
    ],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.8,
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
      fontSize: 7.5,
      halign: "left",
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 52 },
      2: { cellWidth: 20 },
      3: { halign: "right", cellWidth: 14 },
      4: { halign: "right", cellWidth: 14 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 18 },
      7: { halign: "right", cellWidth: 16 },
      8: { halign: "right", cellWidth: 18 },
    },
    didParseCell: (data) => {
      if (itemRows.length === 0 && data.section === "body") {
        if (data.column.index === 1) {
          data.cell.styles.halign = "center";
          data.cell.styles.textColor = [102, 102, 102];
        }
      }
      if (data.section === "head" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "foot") {
        if (data.column.index === 5) data.cell.styles.halign = "right";
        if (data.column.index >= 6) data.cell.styles.halign = "right";
      }
      if (data.section === "body" && data.column.index === 1 && itemRows.length > 0) {
        // First line (part nos) bold feel via darker text; description stays same cell
        data.cell.styles.fontStyle = "normal";
      }
      if (data.section === "body" && data.column.index === 6 && itemRows.length > 0) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const finalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text("Computer-generated document.", marginX, finalY);

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
      // Keep the blob URL available while the print dialog is open.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  // Some browsers need a short delay for the PDF viewer to load before print().
  printWindow.addEventListener?.("load", triggerPrint);
  window.setTimeout(triggerPrint, 500);
  return true;
};
