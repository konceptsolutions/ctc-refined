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
  invoiceTotal?: number | null;
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
  unitExp?: number | null;
  exp?: number | null;
  unitCost?: number | null;
  cost?: number | null;
  weight?: number | null;
  totalWeight?: number | null;
};

export type PurchaseImportOrderPrintTotals = {
  orderQty: number;
  receivedQty: number;
  fcAmount: number;
  lcAmount: number;
  totalExp?: number;
  totalCost?: number;
  totalWeight: number;
};

export type PurchaseImportOrderPrintExpenses = {
  pkgExpPercent?: number;
  pkgExpFcAmt?: number;
  pkgExpAmt?: number;
  invDiscPercent?: number;
  invDiscFcAmt?: number;
  invDiscAmt?: number;
  frtExp?: number;
  frtExpLc?: number;
  customsDuty?: number;
  additionalCustomsDuty?: number;
  regulatoryDuty?: number;
  ed?: number;
  salesTax?: number;
  additionalSalesTax?: number;
  incomeTax?: number;
  doAmount?: number;
  crnExp?: number;
  miscExp?: number;
  agencyExp?: number;
  locFrt?: number;
  cmExp?: number;
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

const CLEARING_EXPENSE_FIELDS: Array<{
  key: keyof PurchaseImportOrderPrintExpenses;
  label: string;
}> = [
  { key: "customsDuty", label: "C.D." },
  { key: "additionalCustomsDuty", label: "A.C.D." },
  { key: "regulatoryDuty", label: "R.D." },
  { key: "ed", label: "E.D." },
  { key: "salesTax", label: "S.T." },
  { key: "additionalSalesTax", label: "A.S.T." },
  { key: "incomeTax", label: "I.T." },
  { key: "doAmount", label: "D.O." },
];

const LOCAL_EXPENSE_FIELDS: Array<{
  key: keyof PurchaseImportOrderPrintExpenses;
  label: string;
}> = [
  { key: "crnExp", label: "Dmg.Exp." },
  { key: "miscExp", label: "Misc.Exp." },
  { key: "agencyExp", label: "Agency.Exp." },
  { key: "locFrt", label: "Loc.Frt." },
  { key: "cmExp", label: "CRN.Exp." },
];

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

const moneyOrDash = (value: unknown, digits = 2) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return num(n, digits);
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

const hasExpenseDetails = (expenses?: PurchaseImportOrderPrintExpenses | null) => {
  if (!expenses) return false;
  return Object.values(expenses).some((value) => Number(value || 0) > 0);
};

/**
 * Generates Import Purchase Order / Invoice PDF and opens the browser print dialog.
 */
export const printPurchaseImportOrder = ({
  detail,
  itemRows,
  totals,
  expenses,
  showInvoiceCosts = false,
}: {
  detail: PurchaseImportOrderPrintDetail;
  itemRows: PurchaseImportOrderPrintItem[];
  totals: PurchaseImportOrderPrintTotals;
  expenses?: PurchaseImportOrderPrintExpenses | null;
  showInvoiceCosts?: boolean;
}): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 6;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());
  const title = showInvoiceCosts
    ? "Import Purchase Invoice"
    : "Import Purchase Order";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text(title, marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
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
    doc.setFontSize(8);
    doc.setTextColor(102, 102, 102);
    doc.text(card.label, x + 2, y + 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
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
  doc.setFontSize(11);
  doc.setTextColor(17, 17, 17);
  doc.text("Items", marginX, cursorY + 3);
  cursorY += 5;

  const fcRateLabel = "FC Rate";
  const fcAmtLabel = "FC Amount";
  const lcRateLabel = "LC Rate";
  const lcAmtLabel = "LC Amount";

  const rightHead = (label: string) => ({
    content: label,
    styles: { halign: "right" as const },
  });
  const leftHead = (label: string) => ({
    content: label,
    styles: { halign: "left" as const },
  });
  const centerHead = (label: string) => ({
    content: label,
    styles: { halign: "center" as const },
  });

  const headRow = showInvoiceCosts
    ? [
        centerHead("#"),
        leftHead("Item"),
        leftHead("Brand"),
        rightHead("Qty"),
        rightHead(fcRateLabel),
        rightHead(fcAmtLabel),
        rightHead(lcRateLabel),
        rightHead(lcAmtLabel),
        rightHead("Unit Exp"),
        rightHead("Exp"),
        rightHead("Unit Cost"),
        rightHead("Cost"),
        rightHead("Weight"),
        rightHead("Total Wt"),
      ]
    : [
        centerHead("#"),
        leftHead("Item"),
        leftHead("Brand"),
        rightHead("Order Qty"),
        rightHead("Received"),
        rightHead("From Back"),
        rightHead("Back"),
        rightHead(fcRateLabel),
        rightHead(fcAmtLabel),
        rightHead(lcRateLabel),
        rightHead(lcAmtLabel),
        rightHead("Weight"),
        rightHead("Total Wt"),
      ];

  const emptyBodyRow = showInvoiceCosts
    ? Array.from({ length: headRow.length }, () => "")
    : Array.from({ length: headRow.length }, () => "");
  if (emptyBodyRow.length > 1) emptyBodyRow[1] = "No items";

  const bodyRows =
    itemRows.length === 0
      ? [emptyBodyRow]
      : itemRows.map((item, index) => {
          if (showInvoiceCosts) {
            const qty =
              Number(item.receivedQty || 0) > 0
                ? Number(item.receivedQty || 0)
                : Number(item.orderQty || 0);
            return [
              String(index + 1),
              `${text(item.masterPartNo || "-")} | ${text(item.partNo || "-")}\n${text(item.description || "-")}`,
              text(item.brand || "-"),
              String(qty),
              num(item.fcRate, 4),
              num(item.fcAmount, 4),
              num(item.lcRate, 0),
              num(item.lcAmount, 0),
              moneyOrDash(item.unitExp),
              moneyOrDash(item.exp),
              num(item.unitCost, 2),
              num(item.cost, 2),
              Number(item.weight || 0) > 0 ? num(item.weight, 4) : "-",
              Number(item.totalWeight || 0) > 0
                ? num(item.totalWeight, 4)
                : "-",
            ];
          }

          return [
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
          ];
        });

  const rightFoot = (value: string) => ({
    content: value,
    styles: { halign: "right" as const, fontStyle: "bold" as const },
  });
  const leftFoot = (value: string) => ({
    content: value,
    styles: { halign: "left" as const, fontStyle: "bold" as const },
  });

  // Use "-" (not blank) for empty total cells so jspdf-autotable does not
  // collapse them and shift later values into the wrong columns.
  const footRow = showInvoiceCosts
    ? [
        leftFoot(" "),
        leftFoot("Totals"),
        leftFoot(" "),
        rightFoot(String(totals.receivedQty || totals.orderQty)),
        rightFoot("-"),
        rightFoot(num(totals.fcAmount, 4)),
        rightFoot("-"),
        rightFoot(num(totals.lcAmount, 0)),
        rightFoot("-"),
        rightFoot(
          Number(totals.totalExp || 0) > 0 ? num(totals.totalExp, 2) : "-",
        ),
        rightFoot("-"),
        rightFoot(
          Number(totals.totalCost || 0) > 0 ? num(totals.totalCost, 2) : "-",
        ),
        rightFoot("-"),
        rightFoot(num(totals.totalWeight, 4)),
      ]
    : [
        leftFoot(" "),
        leftFoot("Totals"),
        leftFoot(" "),
        rightFoot(String(totals.orderQty)),
        rightFoot(String(totals.receivedQty)),
        rightFoot("-"),
        rightFoot("-"),
        rightFoot("-"),
        rightFoot(num(totals.fcAmount, 4)),
        rightFoot("-"),
        rightFoot(num(totals.lcAmount, 0)),
        rightFoot("-"),
        rightFoot(num(totals.totalWeight, 4)),
      ];

  // Exact widths so head / body / foot stay on the same grid.
  const columnStyles = showInvoiceCosts
    ? {
        0: { halign: "center" as const, cellWidth: 8 },
        1: { halign: "left" as const, cellWidth: 52 },
        2: { halign: "left" as const, cellWidth: 18 },
        3: { halign: "right" as const, cellWidth: 14 },
        4: { halign: "right" as const, cellWidth: 20 },
        5: { halign: "right" as const, cellWidth: 22 },
        6: { halign: "right" as const, cellWidth: 18 },
        7: { halign: "right" as const, cellWidth: 20 },
        8: { halign: "right" as const, cellWidth: 18 },
        9: { halign: "right" as const, cellWidth: 18 },
        10: { halign: "right" as const, cellWidth: 20 },
        11: { halign: "right" as const, cellWidth: 20 },
        12: { halign: "right" as const, cellWidth: 18 },
        13: { halign: "right" as const, cellWidth: 19 },
      }
    : {
        0: { halign: "center" as const, cellWidth: 8 },
        1: { halign: "left" as const, cellWidth: 48 },
        2: { halign: "left" as const, cellWidth: 16 },
        3: { halign: "right" as const, cellWidth: 14 },
        4: { halign: "right" as const, cellWidth: 14 },
        5: { halign: "right" as const, cellWidth: 14 },
        6: { halign: "right" as const, cellWidth: 12 },
        7: { halign: "right" as const, cellWidth: 16 },
        8: { halign: "right" as const, cellWidth: 18 },
        9: { halign: "right" as const, cellWidth: 16 },
        10: { halign: "right" as const, cellWidth: 18 },
        11: { halign: "right" as const, cellWidth: 14 },
        12: { halign: "right" as const, cellWidth: 16 },
      };

  const fcCols = showInvoiceCosts ? [4, 5] : [7, 8];
  const lcCols = showInvoiceCosts ? [6, 7] : [9, 10];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [headRow],
    body: bodyRows,
    foot: [footRow],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: showInvoiceCosts ? 7.5 : 7.5,
      cellPadding: showInvoiceCosts ? 1.2 : 1.2,
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
      fontSize: showInvoiceCosts ? 7.5 : 7.5,
      overflow: "linebreak",
      valign: "middle",
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: "bold",
      fontSize: showInvoiceCosts ? 7.5 : 7.5,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles,
    didParseCell: (data) => {
      if (itemRows.length === 0 && data.section === "body" && data.column.index === 1) {
        data.cell.styles.halign = "center";
        data.cell.styles.textColor = [102, 102, 102];
      }
      if (data.section === "head" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "body" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "foot" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      applyPdfFcLcColors(data, fcCols, lcCols);
    },
  });

  let finalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 6;

  const ensureSpace = (needed: number) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (finalY + needed > pageHeight - 10) {
      doc.addPage();
      finalY = 14;
    }
  };

  const summaryBits = [
    Number(detail.fcTotal || 0) > 0 ? `FC Total: ${num(detail.fcTotal)}` : "",
    Number(detail.lcTotal || 0) > 0 ? `LC Total: ${num(detail.lcTotal)}` : "",
    Number(detail.totalExp || 0) > 0 ? `Total Exp.: ${num(detail.totalExp)}` : "",
    Number(detail.invoiceTotal || 0) > 0
      ? `Invoice Total: ${num(detail.invoiceTotal)}`
      : "",
  ].filter(Boolean);

  if (summaryBits.length > 0) {
    ensureSpace(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
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
      x += doc.getTextWidth(`Total Exp.: ${num(detail.totalExp)}   |   `);
    }
    if (Number(detail.invoiceTotal || 0) > 0) {
      doc.setTextColor(17, 17, 17);
      doc.text(`Invoice Total: ${num(detail.invoiceTotal)}`, x, finalY);
    }
    finalY += 7;
  }

  if (showInvoiceCosts && hasExpenseDetails(expenses)) {
    ensureSpace(70);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    doc.text("Expenses", marginX, finalY);

    // Match invoice view: Total Exp / Invoice Total on the right of the heading.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const expenseSummary = [
      Number(detail.totalExp || 0) > 0
        ? `Total Exp.: ${num(detail.totalExp)}`
        : "",
      Number(detail.invoiceTotal || 0) > 0
        ? `Invoice Total: ${num(detail.invoiceTotal)}`
        : "",
    ]
      .filter(Boolean)
      .join("   |   ");
    if (expenseSummary) {
      doc.setFont("helvetica", "bold");
      doc.text(expenseSummary, pageWidth - marginX, finalY, { align: "right" });
    }
    finalY += 4;

    const colGap = 4;
    const colWidth = (contentWidth - colGap * 2) / 3;
    const packagingX = marginX;
    const clearingX = marginX + colWidth + colGap;
    const localX = marginX + (colWidth + colGap) * 2;
    const tableStartY = finalY;

    // Packaging / Discount / Freight — same row layout as view: Label | % | FC | LC
    autoTable(doc, {
      startY: tableStartY,
      margin: { left: packagingX, right: pageWidth - packagingX - colWidth },
      tableWidth: colWidth,
      head: [
        [
          { content: "Packaging / Discount / Freight", colSpan: 4 },
        ],
        ["", "%", "FC", "LC"],
      ],
      body: [
        [
          "Pkg.Exp.",
          num(expenses?.pkgExpPercent || 0),
          num(expenses?.pkgExpFcAmt || 0),
          num(expenses?.pkgExpAmt || 0),
        ],
        [
          "Inv.Disc.",
          num(expenses?.invDiscPercent || 0),
          num(expenses?.invDiscFcAmt || 0),
          num(expenses?.invDiscAmt || 0),
        ],
        [
          "Frt.Exp.",
          "-",
          num(expenses?.frtExp || 0),
          num(expenses?.frtExpLc || 0),
        ],
      ],
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.4,
        textColor: [17, 17, 17],
        lineColor: [221, 221, 221],
        lineWidth: 0.2,
        valign: "middle",
      },
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: colWidth * 0.28, halign: "left" },
        1: { cellWidth: colWidth * 0.2, halign: "right" as const },
        2: { cellWidth: colWidth * 0.26, halign: "right" as const },
        3: { cellWidth: colWidth * 0.26, halign: "right" as const },
      },
      didParseCell: (data) => {
        if (data.section === "head" && data.row.index === 1 && data.column.index > 0) {
          data.cell.styles.halign = "right";
        }
        if (data.section === "body" && data.column.index > 0) {
          data.cell.styles.halign = "right";
        }
        if (data.section === "body" && data.column.index === 2) {
          data.cell.styles.textColor = [...ACCOUNTING_COLORS.fc.rgb];
        }
        if (data.section === "body" && data.column.index === 3) {
          data.cell.styles.textColor = [...ACCOUNTING_COLORS.lc.rgb];
        }
      },
    });
    const packagingEndY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || tableStartY;

    // Clearing Cost (International)
    autoTable(doc, {
      startY: tableStartY,
      margin: { left: clearingX, right: pageWidth - clearingX - colWidth },
      tableWidth: colWidth,
      head: [["Clearing Cost (International)", "Amount"]],
      body: CLEARING_EXPENSE_FIELDS.map((field) => [
        field.label,
        num(expenses?.[field.key] || 0),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.4,
        textColor: [17, 17, 17],
        lineColor: [221, 221, 221],
        lineWidth: 0.2,
        valign: "middle",
      },
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: colWidth * 0.45, halign: "left" as const },
        1: { cellWidth: colWidth * 0.55, halign: "right" as const },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.halign = "right";
        }
      },
    });
    const clearingEndY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || tableStartY;

    // Local Expenses
    autoTable(doc, {
      startY: tableStartY,
      margin: { left: localX, right: marginX },
      tableWidth: colWidth,
      head: [["Local Expenses", "Amount"]],
      body: LOCAL_EXPENSE_FIELDS.map((field) => [
        field.label,
        num(expenses?.[field.key] || 0),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.4,
        textColor: [17, 17, 17],
        lineColor: [221, 221, 221],
        lineWidth: 0.2,
        valign: "middle",
      },
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: colWidth * 0.45, halign: "left" as const },
        1: { cellWidth: colWidth * 0.55, halign: "right" as const },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.halign = "right";
        }
      },
    });
    const localEndY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || tableStartY;

    finalY = Math.max(packagingEndY, clearingEndY, localEndY) + 6;
  }

  ensureSpace(8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text("Computer-generated document.", marginX, finalY);

  return openPdfPrintDialog(doc);
};
