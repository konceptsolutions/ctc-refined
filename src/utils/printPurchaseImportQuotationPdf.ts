import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PurchaseImportQuotationPrintDetail = {
  requestNo?: string | null;
  requestDate?: string | Date | null;
  quotationNo?: string | null;
  quotationDate?: string | Date | null;
  supplierName?: string | null;
  currency?: string | null;
  conversionRate?: number | null;
  status?: string | null;
  terms?: string | null;
};

export type PurchaseImportQuotationPrintItem = {
  masterPartNo?: string | null;
  partNo?: string | null;
  description?: string | null;
  brand?: string | null;
  currentStock?: number | null;
  requestQty?: number | null;
  quotationQty?: number | null;
  shipDays?: number | null;
  lastFcRate?: number | null;
  fcRate?: number | null;
  fcAmount?: number | null;
  lcRate?: number | null;
  lcAmount?: number | null;
  totalWeight?: number | null;
};

export type PurchaseImportQuotationPrintTotals = {
  requestQty: number;
  quotationQty: number;
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
  const dateObj = value instanceof Date ? value : new Date(value || Date.now());
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

const toInputDate = (value?: string | Date | null) => {
  if (!value) return "";
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) return "";
  return dateObj.toISOString().split("T")[0];
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
 * Generates the Purchase Quotation PDF and opens the browser print dialog
 * (new tab) — does not download the file.
 */
export const printPurchaseImportQuotation = ({
  detail,
  itemRows,
  totals,
}: {
  detail: PurchaseImportQuotationPrintDetail;
  itemRows: PurchaseImportQuotationPrintItem[];
  totals: PurchaseImportQuotationPrintTotals;
}): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text("Purchase Quotation", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(printedOn, pageWidth - marginX, 14, { align: "right" });

  const cards: Array<{ label: string; value: string }> = [
    { label: "Inquiry No", value: text(detail.requestNo || "-") },
    {
      label: "Inquiry Date",
      value: toInputDate(detail.requestDate) || "-",
    },
    { label: "Quotation No", value: text(detail.quotationNo || "-") },
    {
      label: "Quotation Date",
      value: toInputDate(detail.quotationDate) || "-",
    },
    { label: "Supplier", value: text(detail.supplierName || "-") },
    { label: "Currency", value: text(detail.currency || "-") },
    {
      label: "Exchange Rate",
      value: String(Number(detail.conversionRate || 0) || "-"),
    },
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

  if (detail.terms) {
    const notesBody = `Terms: ${text(detail.terms)}`;
    const notesLines = doc.splitTextToSize(notesBody, contentWidth - 5);
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

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "#",
        "Item",
        "Brand",
        "Stock",
        "Req Qty",
        "Quot Qty",
        "Ship Days",
        "Last FC",
        "FC Rate",
        "FC Amount",
        "LC Rate",
        "LC Amount",
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
            String(Number(item.currentStock || 0)),
            String(Number(item.requestQty || 0)),
            String(Number(item.quotationQty || 0)),
            String(Number(item.shipDays || 0)),
            num(item.lastFcRate, 4),
            num(item.fcRate, 4),
            num(item.fcAmount),
            num(item.lcRate, 4),
            num(item.lcAmount),
            num(item.totalWeight),
          ]),
    foot: [
      [
        "",
        "",
        "",
        "",
        String(totals.requestQty),
        String(totals.quotationQty),
        "",
        "",
        "Totals",
        num(totals.fcAmount),
        "",
        num(totals.lcAmount),
        num(totals.totalWeight),
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
      2: { cellWidth: 18 },
      3: { halign: "right", cellWidth: 12 },
      4: { halign: "right", cellWidth: 14 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 14 },
      7: { halign: "right", cellWidth: 16 },
      8: { halign: "right", cellWidth: 16 },
      9: { halign: "right", cellWidth: 18 },
      10: { halign: "right", cellWidth: 16 },
      11: { halign: "right", cellWidth: 18 },
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
      if (data.section === "foot" && data.column.index >= 4) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "body" && data.column.index === 5 && itemRows.length > 0) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const finalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text("Computer-generated document.", marginX, finalY);

  return openPdfPrintDialog(doc);
};
