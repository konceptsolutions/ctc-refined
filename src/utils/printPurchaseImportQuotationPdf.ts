import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfFcLcColors } from "@/utils/accountingColors";

export type PurchaseImportQuotationPrintDetail = {
  requestNo?: string | null;
  requestDate?: string | Date | null;
  quotationNo?: string | null;
  quotationDate?: string | Date | null;
  revisedQuotationDate?: string | Date | null;
  confirmationDate?: string | Date | null;
  supplierName?: string | null;
  currency?: string | null;
  conversionRate?: number | null;
  status?: string | null;
  terms?: string | null;
  poNumber?: string | null;
  consignee?: string | null;
};

export type PurchaseImportQuotationPrintItem = {
  masterPartNo?: string | null;
  partNo?: string | null;
  description?: string | null;
  brand?: string | null;
  currentStock?: number | null;
  requestQty?: number | null;
  quotationQty?: number | null;
  confirmQty?: number | null;
  shipDays?: string | null;
  lastFcRate?: number | null;
  fcRate?: number | null;
  fcAmount?: number | null;
  lcRate?: number | null;
  lcAmount?: number | null;
  revisedFcRate?: number | null;
  revisedFcAmount?: number | null;
  revisedLcRate?: number | null;
  revisedLcAmount?: number | null;
  totalWeight?: number | null;
  weight?: number | null;
};

export type PurchaseImportQuotationPrintTotals = {
  requestQty: number;
  quotationQty: number;
  fcAmount: number;
  lcAmount: number;
  revisedFcAmount?: number;
  revisedLcAmount?: number;
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
  showRevisedFields = false,
}: {
  detail: PurchaseImportQuotationPrintDetail;
  itemRows: PurchaseImportQuotationPrintItem[];
  totals: PurchaseImportQuotationPrintTotals;
  showRevisedFields?: boolean;
}): boolean => {
  const statusLower = String(detail.status || "")
    .trim()
    .toLowerCase();
  const isConfirmed = statusLower === "confirm";
  const hasRevisedRates =
    showRevisedFields ||
    statusLower === "revise" ||
    itemRows.some(
      (item) =>
        Number(item.revisedFcRate || 0) > 0 ||
        Number(item.revisedFcAmount || 0) > 0,
    );
  // Confirmed / order confirmation print never shows revised layout or labels.
  const isRevised = !isConfirmed && hasRevisedRates;

  const doc = new jsPDF({
    orientation: isConfirmed ? "portrait" : "landscape",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());

  const title = isConfirmed
    ? "Order Confirmation"
    : isRevised
      ? "Purchase Quotation (Revised)"
      : "Purchase Quotation";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text(title, marginX, 14);

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
  ];

  if (!isConfirmed) {
    cards.push({
      label: "Quotation Date",
      value: toInputDate(detail.quotationDate) || "-",
    });
  }

  if (isRevised) {
    cards.push({
      label: "Revised Quotation Date",
      value: toInputDate(detail.revisedQuotationDate) || "-",
    });
  }

  if (isConfirmed) {
    cards.push({
      label: "Confirmation Date",
      value: toInputDate(detail.confirmationDate) || "-",
    });
  }

  cards.push(
    { label: "Supplier", value: text(detail.supplierName || "-") },
    { label: "Currency", value: text(detail.currency || "-") },
  );

  if (!isConfirmed) {
    cards.push(
      {
        label: "Exchange Rate",
        value: String(Number(detail.conversionRate || 0) || "-"),
      },
      { label: "Status", value: text(detail.status || "-") },
    );
  }

  cards.push({ label: "Upto Date", value: formatPrintDate(new Date()) });

  const gap = 2.5;
  const cols = isConfirmed ? 2 : 4;
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

  const standardHead = [
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
  ];

  const revisedHead = [
    "#",
    "Item",
    "Brand",
    "Stock",
    "Req Qty",
    "Quot Qty",
    "Ship Days",
    "FC Rate",
    "FC Amt",
    "LC Rate",
    "LC Amt",
    "Rev FC",
    "Rev FC Amt",
    "Rev LC",
    "Rev LC Amt",
    "Total Wt",
  ];

  const confirmedHead = [
    "#",
    "Item",
    "Brand",
    "Qty",
    "Rate",
    "Amount",
    "Total Wt",
  ];

  const tableHead = isConfirmed
    ? confirmedHead
    : isRevised
      ? revisedHead
      : standardHead;

  const resolveConfirmedLine = (item: PurchaseImportQuotationPrintItem) => {
    const quotationQty = Number(item.quotationQty || 0);
    const confirmQty =
      item.confirmQty != null && Number.isFinite(Number(item.confirmQty))
        ? Math.max(0, Number(item.confirmQty))
        : quotationQty;
    const qty = confirmQty > 0 ? confirmQty : quotationQty;
    const revisedFcRate = Number(item.revisedFcRate || 0);
    const baseFcRate = Number(item.fcRate || 0);
    const fcRate = revisedFcRate > 0 ? revisedFcRate : baseFcRate;
    const weight =
      Number(item.weight || 0) > 0
        ? Number(item.weight || 0)
        : qty > 0
          ? Number(item.totalWeight || 0) / qty
          : 0;
    const fcAmount = Math.round(fcRate * qty * 10000) / 10000;
    const totalWeight = Math.round(weight * qty * 100) / 100;
    return { qty, fcRate, fcAmount, totalWeight };
  };

  const confirmedLines = isConfirmed
    ? itemRows.map((item) => resolveConfirmedLine(item))
    : [];
  const confirmedQtyTotal = confirmedLines.reduce((sum, row) => sum + row.qty, 0);
  const confirmedFcTotal = confirmedLines.reduce(
    (sum, row) => sum + row.fcAmount,
    0,
  );
  const confirmedWeightTotal = confirmedLines.reduce(
    (sum, row) => sum + row.totalWeight,
    0,
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [tableHead],
    body:
      itemRows.length === 0
        ? [
            Array(tableHead.length)
              .fill("")
              .map((_, i) => (i === 1 ? "No items" : "")),
          ]
        : itemRows.map((item, index) => {
            if (isConfirmed) {
              const line = confirmedLines[index] || resolveConfirmedLine(item);
              return [
                String(index + 1),
                `${text(item.masterPartNo || "-")} | ${text(item.partNo || "-")}\n${text(item.description || "-")}`,
                text(item.brand || "-"),
                String(line.qty),
                num(line.fcRate, 4),
                num(line.fcAmount, 4),
                num(line.totalWeight),
              ];
            }

            const base = [
              String(index + 1),
              `${text(item.masterPartNo || "-")} | ${text(item.partNo || "-")}\n${text(item.description || "-")}`,
              text(item.brand || "-"),
              String(Number(item.currentStock || 0)),
              String(Number(item.requestQty || 0)),
              String(Number(item.quotationQty || 0)),
              text(item.shipDays || "-"),
            ];

            if (isRevised) {
              return [
                ...base,
                num(item.fcRate, 4),
                num(item.fcAmount, 4),
                num(item.lcRate, 0),
                num(item.lcAmount, 0),
                num(item.revisedFcRate, 4),
                num(item.revisedFcAmount, 4),
                num(item.revisedLcRate, 0),
                num(item.revisedLcAmount, 0),
                num(item.totalWeight),
              ];
            }

            return [
              ...base,
              num(item.lastFcRate, 4),
              num(item.fcRate, 4),
              num(item.fcAmount, 4),
              num(item.lcRate, 0),
              num(item.lcAmount, 0),
              num(item.totalWeight),
            ];
          }),
    foot: [
      isConfirmed
        ? [
            "",
            "",
            "",
            String(confirmedQtyTotal),
            "Totals",
            num(confirmedFcTotal, 2),
            num(confirmedWeightTotal),
          ]
        : isRevised
          ? [
              "",
              "",
              "",
              "",
              String(totals.requestQty),
              String(totals.quotationQty),
              "",
              "",
              num(totals.fcAmount, 2),
              "",
              num(totals.lcAmount, 0),
              "",
              num(totals.revisedFcAmount || 0, 2),
              "",
              num(totals.revisedLcAmount || 0),
              num(totals.totalWeight),
            ]
          : [
              "",
              "",
              "",
              "",
              String(totals.requestQty),
              String(totals.quotationQty),
              "",
              "",
              "Totals",
              num(totals.fcAmount, 2),
              "",
              num(totals.lcAmount, 0),
              num(totals.totalWeight),
            ],
    ],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: isRevised ? 5.5 : 6.5,
      cellPadding: isRevised ? 1 : 1.2,
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
      fontSize: isRevised ? 5.5 : 6.5,
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: "bold",
      fontSize: isRevised ? 5.5 : 6.5,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: isConfirmed
      ? {
          0: { cellWidth: 9 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 22 },
          3: { cellWidth: 18, halign: "right" },
          4: { cellWidth: 22, halign: "right" },
          5: { cellWidth: 26, halign: "right" },
          6: { cellWidth: 20, halign: "right" },
        }
      : isRevised
        ? {
          0: { cellWidth: 7 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 14 },
          3: { cellWidth: 10, halign: "right" },
          4: { cellWidth: 11, halign: "right" },
          5: { cellWidth: 11, halign: "right" },
          6: { cellWidth: 11, halign: "right" },
          7: { cellWidth: 13, halign: "right" },
          8: { cellWidth: 14, halign: "right" },
          9: { cellWidth: 13, halign: "right" },
          10: { cellWidth: 14, halign: "right" },
          11: { cellWidth: 13, halign: "right" },
          12: { cellWidth: 15, halign: "right" },
          13: { cellWidth: 13, halign: "right" },
          14: { cellWidth: 15, halign: "right" },
          15: { cellWidth: 13, halign: "right" },
          }
        : {
          0: { cellWidth: 8 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 18 },
          3: { cellWidth: 12, halign: "right" },
          4: { cellWidth: 14, halign: "right" },
          5: { cellWidth: 14, halign: "right" },
          6: { cellWidth: 14, halign: "right" },
          7: { cellWidth: 16, halign: "right" },
          8: { cellWidth: 16, halign: "right" },
          9: { cellWidth: 18, halign: "right" },
          10: { cellWidth: 16, halign: "right" },
          11: { cellWidth: 18, halign: "right" },
          12: { cellWidth: 16, halign: "right" },
          },
    didParseCell: (data) => {
      if (itemRows.length === 0 && data.section === "body" && data.column.index === 1) {
        data.cell.styles.halign = "center";
        data.cell.styles.textColor = [102, 102, 102];
      }
      if (data.section === "head" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "foot" && data.column.index >= (isConfirmed ? 3 : 4)) {
        data.cell.styles.halign = "right";
      }
      if (
        data.section === "body" &&
        itemRows.length > 0 &&
        data.column.index === (isConfirmed ? 3 : 5)
      ) {
        data.cell.styles.fontStyle = "bold";
      }
      if (isConfirmed) {
        applyPdfFcLcColors(data, [4, 5], []);
      } else if (isRevised) {
        applyPdfFcLcColors(data, [7, 8, 11, 12], [9, 10, 13, 14]);
      } else {
        applyPdfFcLcColors(data, [7, 8, 9], [10, 11]);
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

export type PurchaseImportUnquotedPrintItem = {
  masterPartNo?: string | null;
  partNo?: string | null;
  description?: string | null;
  brand?: string | null;
  requestQty?: number | null;
  quotationQty?: number | null;
  lastFcRate?: number | null;
};

export const printPurchaseImportUnquotedItems = ({
  detail,
  itemRows,
}: {
  detail: PurchaseImportQuotationPrintDetail;
  itemRows: PurchaseImportUnquotedPrintItem[];
}): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text("Unquoted Items", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(printedOn, pageWidth - marginX, 14, { align: "right" });

  const cards: Array<{ label: string; value: string }> = [
    { label: "Inquiry No", value: text(detail.requestNo || "-") },
    { label: "Inquiry Date", value: toInputDate(detail.requestDate) || "-" },
    { label: "Quotation No", value: text(detail.quotationNo || "-") },
    { label: "Quotation Date", value: toInputDate(detail.quotationDate) || "-" },
    { label: "Supplier", value: text(detail.supplierName || "-") },
    { label: "Currency", value: text(detail.currency || "-") },
    { label: "Items without FC Rate", value: String(itemRows.length) },
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
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, cardW, cardH, 1, 1, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(102, 102, 102);
    doc.text(card.label, x + 2.5, y + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    doc.text(card.value, x + 2.5, y + 9);
  });

  const cursorY = cardY + Math.ceil(cards.length / cols) * (cardH + gap) + 2;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [["#", "Item", "Brand", "Req Qty", "Quot Qty", "Last FC Rate", "FC Rate"]],
    body:
      itemRows.length === 0
        ? [["", "No unquoted items", "", "", "", "", ""]]
        : itemRows.map((item, index) => [
            String(index + 1),
            `${text(item.masterPartNo || "-")} | ${text(item.partNo || "-")}\n${text(item.description || "-")}`,
            text(item.brand || "-"),
            String(Number(item.requestQty || 0)),
            String(Number(item.quotationQty || 0)),
            Number(item.lastFcRate || 0) > 0 ? num(item.lastFcRate, 4) : "-",
            "-",
          ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.6,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [17, 17, 17],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 28 },
      6: { halign: "right", cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (itemRows.length === 0 && data.section === "body" && data.column.index === 1) {
        data.cell.styles.halign = "center";
        data.cell.styles.textColor = [102, 102, 102];
      }
      if (data.section === "head" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "body" && data.column.index >= 5) {
        applyPdfFcLcColors(data, [5, 6], []);
      }
    },
  });

  const finalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text("Items listed have no FC rate entered.", marginX, finalY);

  return openPdfPrintDialog(doc);
};
