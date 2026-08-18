import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { openPdfPrintDialog, formatPdfDate } from "@/utils/pdfPrint";

export type DeliveryChallanPdfItem = {
  partNo: string;
  ssPartNo?: string;
  description?: string;
  brand?: string;
  uom?: string;
  qty?: number;
  deliveredQty: number;
  pendingQty: number;
  location?: string;
  weight?: number;
};

export type DeliveryChallanPdfInput = {
  challanNo: string;
  invoiceNo: string;
  invoiceDate?: string;
  printDateTime?: string;
  customerName: string;
  deliveredTo?: string;
  status?: string;
  userName?: string;
  notes?: string;
  items: DeliveryChallanPdfItem[];
};

export const printDeliveryChallanPdf = (input: DeliveryChallanPdfInput) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const printDateTime = input.printDateTime || new Date().toLocaleString();
  const invoiceDateText = input.invoiceDate
    ? formatPdfDate(input.invoiceDate)
    : "-";
  const items = input.items || [];
  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const totalDelivered = items.reduce(
    (sum, item) => sum + (Number(item.deliveredQty) || 0),
    0,
  );
  const totalPending = items.reduce(
    (sum, item) => sum + (Number(item.pendingQty) || 0),
    0,
  );
  const totalWeight = items.reduce(
    (sum, item) => sum + (Number(item.weight) || 0),
    0,
  );

  const drawHeader = () => {
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("DELIVERY CHALLAN", pageW / 2, margin + 2, { align: "center" });

    doc.setFontSize(9);
    doc.text(`M/S. ${input.customerName || "-"}`, margin, margin + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(String(input.deliveredTo || "-"), margin, margin + 14);

    const rightX = pageW - margin;
    [
      `Print: ${printDateTime}`,
      "Page 1 of 1",
      `No: ${input.invoiceNo}`,
      `Date: ${invoiceDateText}`,
      `Challan: ${input.challanNo}`,
      `User: ${input.userName || "-"}`,
    ].forEach((line, idx) => {
      doc.text(line, rightX, margin + 6 + idx * 3.5, { align: "right" });
    });
  };

  drawHeader();
  autoTable(doc, {
    theme: "plain",
    startY: margin + 28,
    margin: { left: margin, right: margin, top: margin + 28, bottom: 10 },
    head: [
      [
        "Sr#",
        "Part #",
        "SS Part #",
        "Description",
        "Brand",
        "UOM",
        "Qty",
        "Delivered Qty",
        "Pending Qty",
        "Location",
        "Weight",
      ],
    ],
    body: items.length
      ? items.map((item, idx) => [
          String(idx + 1),
          item.partNo || "-",
          item.ssPartNo || item.partNo || "-",
          item.description || "-",
          item.brand || "-",
          item.uom || "NOS",
          String(Number(item.qty) || 0),
          String(Number(item.deliveredQty) || 0),
          String(Number(item.pendingQty) || 0),
          item.location || "-",
          Number(item.weight || 0).toFixed(3),
        ])
      : [["", "No items", "", "", "", "", "", "", "", "", ""]],
    foot: [
      [
        "",
        "",
        "",
        "",
        "",
        "Total",
        String(totalQty),
        String(totalDelivered),
        String(totalPending),
        "-",
        totalWeight.toFixed(3),
      ],
    ],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.1,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 40 },
      4: { cellWidth: 16 },
      5: { cellWidth: 12, halign: "center" },
      6: { cellWidth: 12, halign: "center" },
      7: { cellWidth: 18, halign: "center" },
      8: { cellWidth: 16, halign: "center" },
      9: { cellWidth: 22 },
      10: { cellWidth: 14, halign: "center" },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader();
    },
    didParseCell: (data: any) => {
      data.cell.styles.fillColor = [255, 255, 255];
      data.cell.styles.textColor = [0, 0, 0];
    },
  });

  let y =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 40) + 6;
  if (y > pageH - 24) {
    doc.addPage();
    drawHeader();
    y = margin + 28;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Delivered to : ${input.deliveredTo || "-"}`, margin, y);
  const noteLines = doc.splitTextToSize(
    `Note :- ${
      input.notes ||
      "Received goods as per invoice in original packing and condition."
    }`,
    pageW * 0.55,
  );
  doc.text(noteLines, margin, y + 4.5);

  doc.text("Status", pageW - margin - 50, y);
  doc.text(String(input.status || "-"), pageW - margin, y, { align: "right" });
  doc.setLineWidth(0.15);
  doc.line(pageW - margin - 50, y + 1.2, pageW - margin, y + 1.2);
  doc.text("Invoice No", pageW - margin - 50, y + 6);
  doc.text(String(input.invoiceNo || "-"), pageW - margin, y + 6, {
    align: "right",
  });
  doc.line(pageW - margin - 50, y + 7.2, pageW - margin, y + 7.2);

  const sigY = pageH - 12;
  const colW = (pageW - margin * 2) / 3;
  ["( Delivered By )", "( Verified By )", "( Received By )"].forEach(
    (label, idx) => {
      const x = margin + idx * colW + colW / 2;
      doc.line(x - 28, sigY - 4, x + 28, sigY - 4);
      doc.text(label, x, sigY, { align: "center" });
    },
  );

  if (!openPdfPrintDialog(doc)) {
    doc.save(`delivery-challan-${input.challanNo || input.invoiceNo}.pdf`);
  }
};
