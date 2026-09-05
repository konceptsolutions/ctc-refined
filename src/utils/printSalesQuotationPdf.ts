import { jsPDF } from "jspdf";
import { buildSalesQuotationTermsForPrint } from "@/constants/salesQuotationTerms";
import autoTable from "jspdf-autotable";
import { openPdfPrintDialog, formatPdfMoney, formatPdfDate } from "@/utils/pdfPrint";
import type { Invoice, InvoiceItem } from "@/types/invoice";

export type SalesQuotationPdfInput = {
  invoice: Invoice;
  columns: string[];
  printedBy: string;
  customerAddressLines: string[];
  area?: string;
  contactNo?: string;
  validUntil?: string;
  remarks?: string;
  quotationTerms?: string;
  deliveryDays?: number | null;
  signedBy?: string;
};

type QuotationColumnId =
  | "sr"
  | "partNo"
  | "altPartNo"
  | "description"
  | "brand"
  | "uom"
  | "qtyReq"
  | "deliveryQty"
  | "divOn"
  | "price"
  | "amount";

const COLUMN_META: Array<{
  id: QuotationColumnId;
  header: string;
  width: number;
  align: "left" | "center" | "right";
}> = [
  { id: "sr", header: "Sr#", width: 8, align: "center" },
  { id: "partNo", header: "Part No.", width: 22, align: "left" },
  { id: "altPartNo", header: "Alt. Part No.", width: 20, align: "left" },
  { id: "description", header: "Description", width: 38, align: "left" },
  { id: "brand", header: "Brand", width: 16, align: "left" },
  { id: "uom", header: "UOM", width: 10, align: "center" },
  { id: "qtyReq", header: "Qty Req.", width: 14, align: "center" },
  { id: "deliveryQty", header: "Qty", width: 12, align: "center" },
  { id: "divOn", header: "Delivery", width: 14, align: "center" },
  { id: "price", header: "Price", width: 16, align: "right" },
  { id: "amount", header: "Amount", width: 18, align: "right" },
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

function numberToWords(num: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  if (!Number.isFinite(num) || num <= 0) return "Zero";

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      return (
        tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ` ${ones[n % 10]}` : "")
      );
    }
    return (
      `${ones[Math.floor(n / 100)]} Hundred` +
      (n % 100 !== 0 ? ` ${convertLessThanThousand(n % 100)}` : "")
    );
  };

  const whole = Math.floor(num);
  if (whole >= 10000000) {
    const crore = Math.floor(whole / 10000000);
    const rem = whole % 10000000;
    return (
      `${convertLessThanThousand(crore)} Crore` +
      (rem > 0 ? ` ${numberToWords(rem)}` : "")
    );
  }
  if (whole >= 100000) {
    const lakh = Math.floor(whole / 100000);
    const rem = whole % 100000;
    return (
      `${convertLessThanThousand(lakh)} Lakh` +
      (rem > 0 ? ` ${numberToWords(rem)}` : "")
    );
  }
  if (whole >= 1000) {
    const thousand = Math.floor(whole / 1000);
    const rem = whole % 1000;
    return (
      `${convertLessThanThousand(thousand)} Thousand` +
      (rem > 0 ? ` ${convertLessThanThousand(rem)}` : "")
    );
  }
  return convertLessThanThousand(whole);
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  marginT: number,
  marginB: number,
  pageH: number,
  onNewPage: () => void,
): number {
  if (y + needed <= pageH - marginB) return y;
  doc.addPage();
  onNewPage();
  return marginT;
}

export const printSalesQuotationPdf = async (input: SalesQuotationPdfInput) => {
  const enabled = new Set(input.columns);
  const visibleCols = COLUMN_META.filter((col) => enabled.has(col.id));
  if (visibleCols.length === 0) visibleCols.push(COLUMN_META[0]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 12;
  const marginR = 12;
  const marginT = 12;
  const marginB = 14;
  const contentW = pageW - marginL - marginR;

  const items: InvoiceItem[] = input.invoice.items || [];
  const quotationDate = formatPdfDate(input.invoice.invoiceDate);
  const validUntil = formatPdfDate(input.validUntil);
  const printDateTime = new Date().toLocaleString();
  const grandTotal = Number(input.invoice.grandTotal || 0);
  const subtotal = Number(
    input.invoice.subtotal ??
      items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
  );
  const discountAmount = Number(input.invoice.overallDiscount || 0);
  const freightAmount = Number(input.invoice.freightCharges || 0);
  const taxAmount = Number(input.invoice.tax || 0);
  const totalQtyReq = items.reduce(
    (sum, item) => sum + Number(item.orderedQty || 0),
    0,
  );
  const totalDeliveryQty = items.reduce(
    (sum, item) => sum + Number(item.qtyDiv || 0),
    0,
  );
  const amountWords = numberToWords(grandTotal);

  const drawHeader = () => {
    let y = marginT;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("QUOTATION", pageW / 2, y + 2, { align: "center" });
    y += 10;

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

    const rightX = pageW - marginR;
    const rightLines = [
      `Print: ${printDateTime}`,
      String(input.invoice.invoiceNo || ""),
      `Date: ${quotationDate}`,
      validUntil !== "-" ? `Valid Until: ${validUntil}` : "",
      `User: ${input.printedBy}`,
    ].filter(Boolean);
    rightLines.forEach((line, idx) => {
      doc.text(line, rightX, y + idx * 3.5, { align: "right" });
    });
  };

  drawHeader();

  const getCellValue = (item: InvoiceItem, col: (typeof COLUMN_META)[number], idx: number) => {
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
      case "qtyReq":
        return String(item.orderedQty || 0);
      case "deliveryQty":
        return String(item.qtyDiv ?? 0);
      case "divOn":
        return String(item.divOn?.trim() || "STK");
      case "price":
        return formatPdfMoney(Number(item.unitPrice || 0));
      case "amount":
        return formatPdfMoney(Number(item.lineTotal || 0));
      default:
        return "";
    }
  };

  const body = items.map((item, idx) =>
    visibleCols.map((col) => getCellValue(item, col, idx)),
  );

  const qtyReqIndex = visibleCols.findIndex((col) => col.id === "qtyReq");
  const deliveryQtyIndex = visibleCols.findIndex((col) => col.id === "deliveryQty");
  const amountIndex = visibleCols.findIndex((col) => col.id === "amount");
  const totalLabelIndex = Math.max(
    0,
    qtyReqIndex >= 0
      ? qtyReqIndex - 1
      : deliveryQtyIndex >= 0
        ? deliveryQtyIndex - 1
        : amountIndex >= 0
          ? amountIndex - 1
          : 0,
  );

  const foot = visibleCols.map((col, idx) => {
    if (idx === totalLabelIndex) return "Total";
    if (col.id === "qtyReq") return String(totalQtyReq);
    if (col.id === "deliveryQty") return String(totalDeliveryQty);
    if (col.id === "amount") return formatPdfMoney(subtotal);
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

  autoTable(doc, {
    ...PLAIN_TABLE,
    startY: marginT + 34,
    margin: {
      left: marginL,
      right: marginR,
      top: marginT + 34,
      bottom: marginB,
    },
    head: [visibleCols.map((col) => col.header)],
    body: body.length
      ? body
      : [visibleCols.map((_, idx) => (idx === 0 ? "No items" : ""))],
    foot: [foot],
    showFoot: "lastPage",
    showHead: "everyPage",
    columnStyles,
    didDrawPage: (data) => {
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
      ?.finalY || marginT + 34) + 6;

  const totals: Array<[string, string]> = [];
  if (discountAmount > 0) {
    totals.push(["Discount", `- ${formatPdfMoney(discountAmount)}`]);
  }
  if (freightAmount > 0) {
    totals.push(["Freight", formatPdfMoney(freightAmount)]);
  }
  if (taxAmount > 0) {
    totals.push(["GST", formatPdfMoney(taxAmount)]);
  }

  if (totals.length > 0) {
    y = ensureSpace(doc, y, totals.length * 5 + 4, marginT, marginB, pageH, drawHeader);
    const totalsW = 62;
    let ty = y;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    totals.forEach(([label, value]) => {
      doc.text(label, pageW - marginR - totalsW, ty + 3.5);
      doc.text(value, pageW - marginR, ty + 3.5, { align: "right" });
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.line(pageW - marginR - totalsW, ty + 4.4, pageW - marginR, ty + 4.4);
      ty += 5;
    });
    y = ty + 2;
  }

  y = ensureSpace(doc, y, 28, marginT, marginB, pageH, drawHeader);

  const totalsBoxW = 52;
  const totalsBoxH = 8;
  const totalsBoxX = pageW - marginR - totalsBoxW;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Total Amount Rs.", totalsBoxX, y + 3);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(totalsBoxX + 28, y - 1, totalsBoxW - 28, totalsBoxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(formatPdfMoney(grandTotal), pageW - marginR - 2, y + 4.5, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const wordsLine = `PKR : ${amountWords} Only.`;
  const words = doc.splitTextToSize(wordsLine, contentW - totalsBoxW - 4);
  doc.text(words, marginL, y + 3);

  y += Math.max(words.length * 4.2, totalsBoxH) + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const disclaimer =
    "All Manufacturer's Names, Numbers, Symbols and Descriptions are used for reference purposes only.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentW);
  y = ensureSpace(
    doc,
    y,
    disclaimerLines.length * 3.6 + 8,
    marginT,
    marginB,
    pageH,
    drawHeader,
  );
  doc.text(disclaimerLines, marginL, y);
  y += disclaimerLines.length * 3.6 + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  y = ensureSpace(doc, y, 6, marginT, marginB, pageH, drawHeader);
  doc.text("Terms of the Quotation", marginL, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const termsForPrint = buildSalesQuotationTermsForPrint(
    input.quotationTerms,
    input.deliveryDays,
  );
  for (const term of termsForPrint) {
    const lines = doc.splitTextToSize(term, contentW);
    y = ensureSpace(
      doc,
      y,
      lines.length * 3.6 + 1,
      marginT,
      marginB,
      pageH,
      drawHeader,
    );
    doc.text(lines, marginL, y);
    y += lines.length * 3.6 + 1.2;
  }

  y += 2;
  const closingLine =
    "If you have any questions, please do not hesitate to reach out. We appreciate the opportunity to earn your business.";

  doc.setFont("helvetica", "bold");
  let closingFontSize = 8;
  doc.setFontSize(closingFontSize);
  while (
    closingFontSize > 5 &&
    doc.getTextWidth(closingLine) > contentW
  ) {
    closingFontSize -= 0.5;
    doc.setFontSize(closingFontSize);
  }

  y = ensureSpace(doc, y, 8, marginT, marginB, pageH, drawHeader);
  doc.text(closingLine, marginL, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  y = ensureSpace(doc, y, 6, marginT, marginB, pageH, drawHeader);
  doc.text("Yours Truly.", marginL, y);
  y += 8;

  if (input.remarks?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const remarkLines = doc.splitTextToSize(
      `Remarks: ${input.remarks.trim()}`,
      contentW,
    );
    y = ensureSpace(doc, y, remarkLines.length * 3.6 + 2, marginT, marginB, pageH, drawHeader);
    doc.text(remarkLines, marginL, y);
    y += remarkLines.length * 3.6 + 3;
  }

  y = ensureSpace(doc, y, 14, marginT, marginB, pageH, drawHeader);
  y += 4;
  const sigX = pageW - marginR - 42;
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.2);
  doc.line(sigX, y, sigX + 42, y);
  doc.setFontSize(8);
  const signer = String(input.signedBy || input.printedBy || "").trim();
  const signatureLabel = signer
    ? `(${signer.toUpperCase()})`
    : "";
  if (signatureLabel) {
    doc.text(signatureLabel, sigX + 21, y + 4.5, { align: "center" });
  }

  if (!openPdfPrintDialog(doc)) {
    doc.save(`quotation-${input.invoice.invoiceNo || "print"}.pdf`);
  }
};
