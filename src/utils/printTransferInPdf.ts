import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";
import { formatPartIdentityFromDb } from "@/lib/part-identity";
import { formatPurchasePrice } from "@/utils/purchasePriceRound";

export type TransferInPdfItem = {
  partNo?: string | null;
  masterPartNo?: string | null;
  description?: string | null;
  brand?: string | null;
  uom?: string | null;
  quantity?: number | null;
  purchasePrice?: number | null;
  amount?: number | null;
};

export type TransferInPdfInput = {
  title?: string;
  orderNumberLabel?: string;
  /** Label for party field (Branch / Supplier) */
  partyFieldLabel?: string;
  orderNo: string;
  store?: string | null;
  branch?: string | null;
  requestDate?: string | Date | null;
  invoiceNo?: string | null;
  invoiceDate?: string | Date | null;
  status?: string | null;
  remarks?: string | null;
  discount?: number | null;
  totalExpenses?: number | null;
  grandTotal?: number | null;
  items: TransferInPdfItem[];
};

export const printTransferInPdf = (input: TransferInPdfInput): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const title = input.title || "Transfer In";
  const orderNumberLabel = input.orderNumberLabel || "Transfer In No.";
  const partyFieldLabel = input.partyFieldLabel || "Branch";
  const items = Array.isArray(input.items) ? input.items : [];

  const itemsSubtotal = items.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, pageW / 2, margin + 2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const metaLeft = [
    `${orderNumberLabel}: ${input.orderNo || "-"}`,
    `Store: ${input.store || "-"}`,
    `${partyFieldLabel}: ${input.branch || "-"}`,
    `Request Date: ${formatPdfDate(input.requestDate)}`,
  ];
  const metaRight = [
    `Status: ${input.status || "-"}`,
    `Invoice No.: ${input.invoiceNo || "-"}`,
    `Invoice Date: ${formatPdfDate(input.invoiceDate)}`,
    `Remarks: ${input.remarks || "-"}`,
  ];

  metaLeft.forEach((line, idx) => {
    doc.text(line, margin, margin + 12 + idx * 5);
  });
  metaRight.forEach((line, idx) => {
    doc.text(line, pageW / 2 + 4, margin + 12 + idx * 5);
  });

  const tableStartY = margin + 36;

  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        "#",
        "Part No | Master Part",
        "Description",
        "Brand",
        "UoM",
        "Qty",
        "Purchase Price",
        "Amount",
      ],
    ],
    body: items.map((item, index) => [
      String(index + 1),
      formatPartIdentityFromDb({
        partNo: item.partNo,
        masterPartNo: item.masterPartNo,
      }),
      String(item.description || "-"),
      String(item.brand || "-"),
      String(item.uom || "-"),
      String(Number(item.quantity) || 0),
      formatPurchasePrice(Number(item.purchasePrice) || 0),
      formatPdfMoney(Number(item.amount) || 0),
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [33, 37, 41],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 36 },
      2: { cellWidth: 42 },
      3: { cellWidth: 16 },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 24, halign: "right" },
      7: { cellWidth: 22, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? tableStartY;
  let y = finalY + 8;
  const rightX = pageW - margin;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Items subtotal: Rs ${formatPdfMoney(itemsSubtotal)}`, rightX, y, {
    align: "right",
  });
  y += 5;

  if (Number(input.discount || 0) > 0) {
    doc.text(
      `Discount: Rs ${formatPdfMoney(Number(input.discount || 0))}`,
      rightX,
      y,
      { align: "right" },
    );
    y += 5;
  }

  if (Number(input.totalExpenses || 0) > 0) {
    doc.text(
      `Expenses: Rs ${formatPdfMoney(Number(input.totalExpenses || 0))}`,
      rightX,
      y,
      { align: "right" },
    );
    y += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `Grand total: Rs ${formatPdfMoney(Number(input.grandTotal || 0))}`,
    rightX,
    y + 2,
    { align: "right" },
  );

  return openPdfPrintDialog(doc);
};
