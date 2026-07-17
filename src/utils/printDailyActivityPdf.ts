import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type DailyActivityPrintItem = {
  partNo?: string | null;
  description?: string | null;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type DailyActivityPrintDocument = {
  /** e.g. "SI-0001" or "SR-0001" */
  number: string;
  /** Pre-formatted header line shown next to the document number. */
  headerText: string;
  /** Pre-formatted meta line (date, subtotal, tax, paid, ...). */
  metaText: string;
  amountLabel: string;
  amount: number;
  items: DailyActivityPrintItem[];
};

export type DailyActivityPrintInput = {
  /** Pre-formatted activity date, e.g. "17/07/2026". */
  dateLabel: string;
  summary: {
    salesInvoices: { count: number; totalAmount: number };
    salesReturns: { count: number; totalAmount: number };
  };
  salesInvoices: DailyActivityPrintDocument[];
  salesReturns: DailyActivityPrintDocument[];
};

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
 * Generates the Daily Activity report PDF (jsPDF) and opens the browser
 * print dialog. Layout: heading, date, summary, then sales invoices and
 * sales returns with their line items.
 */
export const printDailyActivity = (input: DailyActivityPrintInput): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("Daily Activity", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Printed ${new Date().toLocaleString()}`, pageWidth - marginX, 14, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text(`Date: ${input.dateLabel}`, marginX, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Sales Invoices: ${input.summary.salesInvoices.count}  ·  Rs ${formatMoney(
      input.summary.salesInvoices.totalAmount,
    )}        Sales Returns: ${input.summary.salesReturns.count}  ·  Rs ${formatMoney(
      input.summary.salesReturns.totalAmount,
    )}`,
    marginX,
    27,
  );

  let cursorY = 34;

  const ensureSpace = (needed = 30) => {
    if (cursorY > pageHeight - needed) {
      doc.addPage();
      cursorY = 14;
    }
  };

  const drawDocument = (docItem: DailyActivityPrintDocument) => {
    ensureSpace(38);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(
      `${docItem.number}  ${docItem.headerText}`,
      marginX,
      cursorY,
      { maxWidth: contentWidth - 45 },
    );
    doc.text(
      `${docItem.amountLabel}: Rs ${formatMoney(docItem.amount)}`,
      pageWidth - marginX,
      cursorY,
      { align: "right" },
    );
    cursorY += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(102, 102, 102);
    doc.text(docItem.metaText, marginX, cursorY, { maxWidth: contentWidth });
    cursorY += 2.5;

    const rows = docItem.items || [];
    const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const totalAmount = rows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [["#", "Part No", "Description", "Qty", "Rate", "Amount"]],
      body:
        rows.length === 0
          ? [["", "No line items", "", "", "", ""]]
          : rows.map((row, index) => [
              String(index + 1),
              String(row.partNo || "-"),
              row.brand
                ? `${String(row.description || "-")}\n${String(row.brand)}`
                : String(row.description || "-"),
              String(Number(row.quantity) || 0),
              formatMoney(row.unitPrice),
              formatMoney(row.lineTotal),
            ]),
      foot:
        rows.length === 0
          ? undefined
          : [["", "Total", "", String(totalQty), "", formatMoney(totalAmount)]],
      showFoot: rows.length === 0 ? undefined : "lastPage",
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.2,
        textColor: [17, 17, 17],
        lineColor: [221, 221, 221],
        lineWidth: 0.2,
        valign: "top",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7,
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 30 },
        2: { cellWidth: contentWidth - 8 - 30 - 16 - 24 - 28 },
        3: { cellWidth: 16, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 28, halign: "right" },
      },
    });

    const lastY =
      (doc as any).lastAutoTable?.finalY ??
      (doc as any).previousAutoTable?.finalY ??
      cursorY + 20;
    cursorY = lastY + 7;
  };

  const drawSection = (
    title: string,
    documents: DailyActivityPrintDocument[],
  ) => {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text(`${title} (${documents.length})`, marginX, cursorY);
    cursorY += 6;

    if (documents.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      doc.text(`No ${title.toLowerCase()} on this date.`, marginX, cursorY);
      cursorY += 10;
      return;
    }

    documents.forEach((d) => drawDocument(d));
    cursorY += 2;
  };

  drawSection("Sales Invoices", input.salesInvoices);
  drawSection("Sales Returns", input.salesReturns);

  return openPdfPrintDialog(doc);
};
