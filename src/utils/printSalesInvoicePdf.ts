import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { openPdfPrintDialog, formatPdfMoney } from "@/utils/pdfPrint";
import type { Invoice } from "@/types/invoice";

export type SalesInvoicePdfInput = {
  invoice: Invoice;
  columns: string[];
  includeBalance: boolean;
  useLetterhead: boolean;
  orientation: "landscape" | "portrait";
  printedBy: string;
  customerAddressLines: string[];
  area?: string;
  contactNo?: string;
  balBf: number;
  totalReceivable: number;
  currentAmount: number;
  currentAmountWords: string;
  discountAmount: number;
  freightAmount: number;
  taxAmount: number;
  taxPercentage: number;
  deliveredTo?: string;
  remarks?: string;
};

type ColumnId =
  | "sr"
  | "partNo"
  | "altPartNo"
  | "description"
  | "brand"
  | "uom"
  | "qty"
  | "price"
  | "amount";

const COLUMN_META: Array<{
  id: ColumnId;
  header: string;
  width: number;
  align: "left" | "center" | "right";
}> = [
  { id: "sr", header: "Sr#", width: 10, align: "center" },
  { id: "partNo", header: "Part No.", width: 26, align: "left" },
  { id: "altPartNo", header: "Alt. Part No.", width: 22, align: "left" },
  { id: "description", header: "Description", width: 48, align: "left" },
  { id: "brand", header: "Brand", width: 16, align: "left" },
  { id: "uom", header: "UOM", width: 12, align: "center" },
  { id: "qty", header: "Qty", width: 12, align: "center" },
  { id: "price", header: "Price", width: 18, align: "right" },
  { id: "amount", header: "Amount", width: 20, align: "right" },
];

const PLAIN_TABLE = {
  theme: "plain" as const,
  styles: {
    font: "helvetica",
    fontSize: 8,
    cellPadding: 1.4,
    textColor: [0, 0, 0] as [number, number, number],
    fillColor: [255, 255, 255] as [number, number, number],
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.15,
    valign: "top" as const,
    overflow: "linebreak" as const,
  },
  headStyles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 8,
  },
  footStyles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 8,
  },
};

const loadImageDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "") || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const imageFormat = (dataUrl: string): "PNG" | "JPEG" =>
  dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";

export const printSalesInvoicePdf = async (input: SalesInvoicePdfInput) => {
  const enabled = new Set(input.columns);
  const visibleCols = COLUMN_META.filter((col) => enabled.has(col.id));
  if (visibleCols.length === 0) visibleCols.push(COLUMN_META[0]);

  const orientation = input.orientation === "portrait" ? "portrait" : "landscape";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a5" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const gstLetterhead = input.taxAmount > 0 || input.taxPercentage > 0;
  const useLetterhead = input.useLetterhead && gstLetterhead;
  const marginL = useLetterhead ? 22 : 8;
  const marginR = useLetterhead ? 10 : 8;
  const marginT = useLetterhead ? 26 : 8;
  const marginB = useLetterhead ? 36 : 12;
  const contentW = pageW - marginL - marginR;
  const headerHeight = 28;

  const [stampUrl, signatureUrl] = await Promise.all([
    loadImageDataUrl(`${window.location.origin}/invoice-sales-tax-stamp.png`),
    gstLetterhead
      ? loadImageDataUrl(
          `${window.location.origin}/invoice-authorised-signature.png`,
        )
      : Promise.resolve(null),
  ]);

  const invoiceDate = input.invoice.invoiceDate
    ? new Date(input.invoice.invoiceDate).toLocaleDateString()
    : "-";
  const printDateTime = new Date().toLocaleString();
  const termText = String(input.invoice.term || "").trim();
  const items = input.invoice.items || [];
  const totalQty = items.reduce(
    (sum, item) => sum + Number(item.orderedQty || 0),
    0,
  );
  const baseTotal = Number(
    input.invoice.subtotal ??
      items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
  );

  const drawHeader = () => {
    const y = marginT;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(String(input.invoice.customerName || "Walk-in Customer"), marginL, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let leftY = y + 4.2;
    if (input.invoice.customerType === "registered") {
      for (const line of input.customerAddressLines.slice(0, 3)) {
        doc.text(line, marginL, leftY);
        leftY += 3.5;
      }
      if (input.area) {
        doc.text(input.area, marginL, leftY);
        leftY += 3.5;
      }
      if (input.contactNo) {
        doc.text(`Contact No: ${input.contactNo}`, marginL, leftY);
      }
    }

    if (stampUrl) {
      try {
        doc.addImage(stampUrl, imageFormat(stampUrl), pageW / 2 - 16, y - 4, 32, 16);
      } catch {
        /* optional */
      }
    }

    const rightX = pageW - marginR;
    const rightLines = [
      `Print: ${printDateTime}`,
      "Page 1 of 1",
      String(input.invoice.invoiceNo || ""),
      `Date: ${invoiceDate}`,
      termText
        ? input.invoice.customerType === "registered"
          ? `Term: credit for ${termText} days`
          : `Term: ${termText}`
        : "",
      `User: ${input.printedBy}`,
    ].filter(Boolean);
    rightLines.forEach((line, idx) => {
      doc.text(line, rightX, y + idx * 3.5, { align: "right" });
    });
  };

  const body = items.map((item, idx) =>
    visibleCols.map((col) => {
      switch (col.id) {
        case "sr":
          return String(idx + 1);
        case "partNo":
        case "altPartNo":
          return String(item.partNo || "");
        case "description":
          return String(item.description || "");
        case "brand":
          return String(item.brand || "");
        case "uom":
          return "NOS";
        case "qty":
          return String(item.orderedQty || 0);
        case "price":
          return formatPdfMoney(Number(item.unitPrice || 0));
        case "amount":
          return formatPdfMoney(Number(item.lineTotal || 0));
        default:
          return "";
      }
    }),
  );

  const qtyIndex = visibleCols.findIndex((col) => col.id === "qty");
  const foot = visibleCols.map((col, idx) => {
    if (qtyIndex >= 0 && idx === Math.max(0, qtyIndex - 1)) return "Total";
    if (qtyIndex < 0 && idx === 0) return "Total";
    if (col.id === "qty") return String(totalQty);
    if (col.id === "amount") return formatPdfMoney(baseTotal);
    return "";
  });

  const totalWidth = visibleCols.reduce((sum, col) => sum + col.width, 0);
  const scale = contentW / totalWidth;
  const columnStyles = Object.fromEntries(
    visibleCols.map((col, idx) => [
      idx,
      { cellWidth: col.width * scale, halign: col.align },
    ]),
  );

  drawHeader();
  autoTable(doc, {
    ...PLAIN_TABLE,
    startY: marginT + headerHeight,
    margin: {
      left: marginL,
      right: marginR,
      top: marginT + headerHeight,
      bottom: 10,
    },
    head: [visibleCols.map((col) => col.header)],
    body: body.length
      ? body
      : [visibleCols.map((_, idx) => (idx === 0 ? "No items" : ""))],
    foot: [foot],
    showFoot: "lastPage",
    columnStyles,
    didDrawPage: (data) => {
      // Header is drawn once above for page 1. Only repeat it when the
      // item table actually continues onto another page.
      if (data.pageNumber > 1) drawHeader();
    },
    didParseCell: (data: any) => {
      data.cell.styles.fillColor = [255, 255, 255];
      data.cell.styles.textColor = [0, 0, 0];
      if (data.section === "head") {
        data.cell.styles.halign = visibleCols[data.column.index]?.align || "left";
      }
    },
  });

  let y =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || marginT + headerHeight) + 6;

  const totals: Array<[string, string]> = [];
  if (input.discountAmount > 0) {
    totals.push(["Discount", `- ${formatPdfMoney(input.discountAmount)}`]);
  }
  if (input.freightAmount > 0) {
    totals.push(["Freight", formatPdfMoney(input.freightAmount)]);
  }
  if (input.taxAmount > 0) {
    totals.push([
      input.taxPercentage > 0 ? `GST @ ${input.taxPercentage}%` : "GST",
      formatPdfMoney(input.taxAmount),
    ]);
  }
  totals.push(["Current Amount", formatPdfMoney(input.currentAmount)]);
  if (input.includeBalance) {
    totals.push(["Bal. B/F", formatPdfMoney(input.balBf)]);
    totals.push(["Total Receivable", formatPdfMoney(input.totalReceivable)]);
  }

  const totalsW = Math.min(62, contentW * 0.38);
  const totalsH = totals.length * 5 + 2;
  if (y + Math.max(totalsH, 12) > pageH - marginB - 28) {
    doc.addPage();
    drawHeader();
    y = marginT + headerHeight;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const words = doc.splitTextToSize(
    `Rupees:- (${input.currentAmountWords} Only.)`,
    contentW - totalsW - 6,
  );
  doc.text(words, marginL, y + 3);

  let ty = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  totals.forEach(([label, value], idx) => {
    const isLast = idx === totals.length - 1;
    if (isLast) doc.setFont("helvetica", "bold");
    doc.text(label, pageW - marginR - totalsW, ty + 3.5);
    doc.text(value, pageW - marginR, ty + 3.5, { align: "right" });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(isLast ? 0.4 : 0.15);
    doc.line(pageW - marginR - totalsW, ty + 4.4, pageW - marginR, ty + 4.4);
    ty += 5;
    doc.setFont("helvetica", "normal");
  });

  y = Math.max(y + words.length * 4, ty) + 5;
  const notes = [
    `Delivered to: ${input.deliveredTo || "-"}`,
    `Remarks: ${input.remarks || "-"}`,
    "Note:- All manufacturer's Names, Numbers, Symbols and Descriptions are used for reference only. Document invalid without authorised signature and stamp.",
    "Parts sold may be Exchanged/returned same day only.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const notesW = gstLetterhead ? contentW - 48 : contentW;
  for (const note of notes) {
    const lines = doc.splitTextToSize(note, notesW);
    if (y + lines.length * 3.4 > pageH - marginB) {
      doc.addPage();
      drawHeader();
      y = marginT + headerHeight;
    }
    doc.text(lines, marginL, y);
    y += lines.length * 3.4 + 1.2;
  }

  if (gstLetterhead) {
    const sigX = pageW - marginR - 42;
    const sigY = Math.min(y, pageH - marginB - 18);
    if (signatureUrl) {
      try {
        doc.addImage(
          signatureUrl,
          imageFormat(signatureUrl),
          sigX + 4,
          sigY - 14,
          34,
          12,
        );
      } catch {
        /* optional */
      }
    }
    doc.setLineWidth(0.2);
    doc.line(sigX, sigY + 1, sigX + 42, sigY + 1);
    doc.setFontSize(7);
    doc.text("(Authorised Signature)", sigX + 21, sigY + 5, { align: "center" });
  }

  if (!openPdfPrintDialog(doc)) {
    doc.save(`invoice-${input.invoice.invoiceNo || "print"}.pdf`);
  }
};
