import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { openPdfPrintDialog, formatPdfMoney } from "@/utils/pdfPrint";

export type SaleReturnPdfItem = {
  partNo: string;
  itemName: string;
  brand?: string;
  uom?: string;
  returnQty: number;
  price: number;
  total: number;
};

export type SaleReturnPdfInput = {
  invoiceNo: string;
  returnDate: string;
  customerName: string;
  contact?: string;
  subtotal: number;
  gst: number;
  totalAmount: number;
  discount: number;
  amountAfterDiscount: number;
  items: SaleReturnPdfItem[];
};

const PLAIN_TABLE = {
  theme: "plain" as const,
  styles: {
    font: "helvetica",
    fontSize: 9,
    cellPadding: 2,
    textColor: [0, 0, 0] as [number, number, number],
    fillColor: [255, 255, 255] as [number, number, number],
    lineColor: [180, 180, 180] as [number, number, number],
    lineWidth: 0.2,
    valign: "middle" as const,
    overflow: "linebreak" as const,
  },
  headStyles: {
    fillColor: [22, 100, 218] as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 9,
  },
};

export const printSaleReturnPdf = (input: SaleReturnPdfInput): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  let y = 18;

  // Centered title
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SALE RETURN", pageW / 2, y, { align: "center" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Invoice : ${input.invoiceNo || "-"}`, pageW / 2, y, {
    align: "center",
  });
  y += 6;
  doc.text(`Date: ${input.returnDate || "-"}`, pageW / 2, y, {
    align: "center",
  });
  y += 10;

  // Customer header bar
  doc.setFillColor(22, 100, 218);
  doc.rect(marginL, y, contentW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Customer", marginL + 3, y + 4.8);
  y += 7;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(255, 255, 255);
  doc.rect(marginL, y, contentW, 14, "S");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Name: ${input.customerName || "-"}`, marginL + 3, y + 5.5);
  doc.text(
    `Contact: ${String(input.contact || "").trim() || "N/A"}`,
    marginL + 3,
    y + 11,
  );
  y += 18;

  const items = input.items || [];
  const tableBody = items.length
    ? items.map((item, idx) => [
        String(idx + 1),
        item.partNo || "-",
        item.itemName || "-",
        item.brand || "-",
        item.uom || "-",
        String(Number(item.returnQty) || 0),
        formatPdfMoney(Number(item.price) || 0),
        formatPdfMoney(Number(item.total) || 0),
      ])
    : [["", "No items", "", "", "", "", "", ""]];

  autoTable(doc, {
    ...PLAIN_TABLE,
    startY: y,
    margin: { left: marginL, right: marginR },
    head: [
      [
        "S.No.",
        "OEM/ Part No",
        "ITEM",
        "Brand",
        "Uom",
        "QTY",
        "PRICE",
        "SUB TOTAL",
      ],
    ],
    body: tableBody,
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 42 },
      3: { cellWidth: 22 },
      4: { cellWidth: 14, halign: "center" },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 24, halign: "right" },
    },
  });

  const lastY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || y;
  y = lastY + 12;

  const noteX = marginL;
  const totalsX = pageW - marginR - 75;
  const labelW = 42;
  const valueW = 33;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("NOTE:", noteX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const notes = [
    "All manufacturer's Names, Numbers, Symbols and Descriptions are used for reference.",
    "Document invalid without authorised signature and stamp.",
    "Goods once sold can not be taken back.",
  ];
  let noteY = y + 5;
  for (const line of notes) {
    const wrapped = doc.splitTextToSize(line, totalsX - noteX - 8);
    doc.text(wrapped, noteX, noteY);
    noteY += wrapped.length * 4 + 1;
  }

  const moneyRows: Array<{ label: string; value: number; bold?: boolean }> = [
    { label: "Subtotal", value: input.subtotal },
    { label: "GST", value: input.gst },
    { label: "Total Amount", value: input.totalAmount },
    { label: "Discount", value: input.discount },
    {
      label: "Total After Discount",
      value: input.amountAfterDiscount,
      bold: true,
    },
  ];

  let totalsY = y;
  for (const row of moneyRows) {
    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(row.bold ? 10 : 9);
    doc.setTextColor(0, 0, 0);
    doc.text(row.label, totalsX + labelW, totalsY, { align: "right" });
    doc.text(
      `PKR ${formatPdfMoney(Number(row.value) || 0)}/-`,
      totalsX + labelW + valueW,
      totalsY,
      { align: "right" },
    );
    totalsY += 6;
  }

  const signatureY = Math.max(noteY, totalsY) + 28;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  const sigLineW = 50;
  const sigX = pageW - marginR - sigLineW;
  doc.line(sigX, signatureY, sigX + sigLineW, signatureY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Authorised Signature", sigX + sigLineW / 2, signatureY + 6, {
    align: "center",
  });

  return openPdfPrintDialog(doc);
};
