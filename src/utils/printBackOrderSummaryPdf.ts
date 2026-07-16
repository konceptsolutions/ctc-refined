import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type BackOrderSummaryPrintLine = {
  partNo?: string | null;
  masterPartNo?: string | null;
  brand?: string | null;
  description?: string | null;
  orderQty?: number | null;
  receivedQty?: number | null;
  fromBackQty?: number | null;
  backQty?: number | null;
};

export type BackOrderSummaryPrintSection = {
  title: string;
  rows: BackOrderSummaryPrintLine[];
};

export type BackOrderSummaryPrintInput = {
  supplierName: string;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  sections: BackOrderSummaryPrintSection[];
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
  if (Number.isNaN(dateObj.getTime())) {
    // Accept YYYY-MM-DD without timezone shift issues
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-");
      const monthIdx = Number(m) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${d}-${MONTH_SHORT_UPPER[monthIdx]}-${y}`;
      }
    }
    return raw;
  }
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

const qty = (value: unknown) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return "-";
  return String(n);
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
 * Generates Back Order Summary Report PDF and opens the browser print dialog.
 * Layout: heading, date range, supplier, then ISB table followed by KHI table.
 */
export const printBackOrderSummary = (
  input: BackOrderSummaryPrintInput,
): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("Back Order Summary Report", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(printedOn, pageWidth - marginX, 14, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text(
    `Date Range: ${formatPrintDate(input.fromDate)}  to  ${formatPrintDate(input.toDate)}`,
    marginX,
    22,
  );
  doc.text(`Supplier: ${text(input.supplierName || "-")}`, marginX, 28);

  let cursorY = 34;

  const drawSection = (section: BackOrderSummaryPrintSection) => {
    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 14;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(22, 100, 218);
    doc.text(`${section.title} Report`, marginX, cursorY);
    cursorY += 4;

    const rows = section.rows || [];
    const totals = rows.reduce(
      (acc, row) => ({
        orderQty: acc.orderQty + (Number(row.orderQty) || 0),
        receivedQty: acc.receivedQty + (Number(row.receivedQty) || 0),
        fromBackQty: acc.fromBackQty + (Number(row.fromBackQty) || 0),
        backQty: acc.backQty + (Number(row.backQty) || 0),
      }),
      { orderQty: 0, receivedQty: 0, fromBackQty: 0, backQty: 0 },
    );

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          "#",
          "Item",
          "Brand",
          "Description",
          "Order Qty",
          "Received Qty",
          "From Back Qty",
          "Back Qty",
        ],
      ],
      body:
        rows.length === 0
          ? [["", "No back order items", "", "", "", "", "", ""]]
          : rows.map((row, index) => [
              String(index + 1),
              `${text(row.partNo || "-")}\n${text(row.masterPartNo || "-")}`,
              text(row.brand || "-"),
              text(row.description || "-"),
              String(Number(row.orderQty || 0)),
              String(Number(row.receivedQty || 0)),
              qty(row.fromBackQty),
              qty(row.backQty),
            ]),
      foot:
        rows.length === 0
          ? undefined
          : [
              [
                "",
                "Totals",
                "",
                "",
                String(totals.orderQty),
                String(totals.receivedQty),
                qty(totals.fromBackQty),
                qty(totals.backQty),
              ],
            ],
      showFoot: rows.length === 0 ? undefined : "lastPage",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.4,
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
        fontSize: 8,
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 38 },
        2: { cellWidth: 28 },
        3: { cellWidth: contentWidth - 10 - 38 - 28 - 22 - 24 - 26 - 22 },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 26, halign: "right" },
        7: { cellWidth: 22, halign: "right" },
      },
    });

    const lastY =
      (doc as any).lastAutoTable?.finalY ??
      (doc as any).previousAutoTable?.finalY ??
      cursorY + 20;
    cursorY = lastY + 10;
  };

  const sections =
    input.sections.length > 0
      ? input.sections
      : [
          { title: "ISB", rows: [] },
          { title: "KHI", rows: [] },
        ];

  sections.forEach((section) => drawSection(section));

  return openPdfPrintDialog(doc);
};
