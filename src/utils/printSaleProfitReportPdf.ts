import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";

export type SaleProfitPrintItem = {
  part_no: string;
  description: string;
  brand: string;
  quantity: number;
  unit_price: number;
  avg_cost: number;
  line_total: number;
  line_cost: number;
  line_profit: number;
};

export type SaleProfitPrintInvoice = {
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  margin_percent: number;
  items: SaleProfitPrintItem[];
};

export type SaleProfitPrintSummary = {
  invoice_count: number;
  total_sales: number;
  total_cost: number;
  total_profit: number;
  margin_percent: number;
};

export type SaleProfitPrintInput = {
  fromDate: string;
  toDate: string;
  invoices: SaleProfitPrintInvoice[];
  summary: SaleProfitPrintSummary;
};

const formatPercent = (value: number) =>
  `${Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

export const printSaleProfitReport = (input: SaleProfitPrintInput): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("Sale Profit Report", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Printed ${new Date().toLocaleString()}`, pageWidth - marginX, 14, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text(
    `Period: ${formatPdfDate(input.fromDate)} to ${formatPdfDate(input.toDate)}`,
    marginX,
    22,
  );

  autoTable(doc, {
    startY: 28,
    margin: { left: marginX, right: marginX },
    head: [["Invoices", "Total Sales", "Total Cost", "Total Profit", "Margin"]],
    body: [
      [
        String(input.summary.invoice_count),
        formatPdfMoney(input.summary.total_sales),
        formatPdfMoney(input.summary.total_cost),
        formatPdfMoney(input.summary.total_profit),
        formatPercent(input.summary.margin_percent),
      ],
    ],
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [22, 100, 218],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { halign: "center" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  let cursorY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 40;

  const ensureSpace = (needed = 24) => {
    if (cursorY > pageHeight - needed) {
      doc.addPage();
      cursorY = 14;
    }
  };

  const itemColumnStyles = {
    0: { cellWidth: 22 },
    1: { cellWidth: contentWidth - 22 - 18 - 12 - 18 - 18 - 22 - 22 - 22 },
    2: { cellWidth: 18 },
    3: { cellWidth: 12, halign: "right" as const },
    4: { cellWidth: 18, halign: "right" as const },
    5: { cellWidth: 18, halign: "right" as const },
    6: { cellWidth: 22, halign: "right" as const },
    7: { cellWidth: 22, halign: "right" as const },
    8: { cellWidth: 22, halign: "right" as const },
  };

  for (const invoice of input.invoices) {
    ensureSpace(34);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(
      `${invoice.invoice_no}  |  ${invoice.customer_name}  |  ${formatPdfDate(invoice.invoice_date)}`,
      marginX,
      cursorY,
    );
    cursorY += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(68, 68, 68);
    doc.text(
      `Sales: ${formatPdfMoney(invoice.sales_amount)}   Cost: ${formatPdfMoney(invoice.cost_amount)}   Profit: ${formatPdfMoney(invoice.profit_amount)} (${formatPercent(invoice.margin_percent)})`,
      marginX,
      cursorY,
    );
    cursorY += 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          "Part No",
          "Description",
          "Brand",
          "Qty",
          "Unit Price",
          "Avg Cost",
          "Sales",
          "Cost",
          "Profit",
        ],
      ],
      body:
        invoice.items.length === 0
          ? [["-", "No line items", "-", "-", "-", "-", "-", "-", "-"]]
          : invoice.items.map((item) => [
              item.part_no || "-",
              item.description || "-",
              item.brand || "-",
              String(item.quantity),
              formatPdfMoney(item.unit_price),
              formatPdfMoney(item.avg_cost),
              formatPdfMoney(item.line_total),
              formatPdfMoney(item.line_cost),
              formatPdfMoney(item.line_profit),
            ]),
      foot:
        invoice.items.length === 0
          ? undefined
          : [
              [
                "",
                "Invoice Total",
                "",
                "",
                "",
                "",
                formatPdfMoney(invoice.sales_amount),
                formatPdfMoney(invoice.cost_amount),
                formatPdfMoney(invoice.profit_amount),
              ],
            ],
      showFoot: invoice.items.length === 0 ? undefined : "lastPage",
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
        fillColor: [241, 245, 249],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 7,
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: itemColumnStyles,
    });

    cursorY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? cursorY + 20;
    cursorY += 6;
  }

  if (input.invoices.length === 0) {
    ensureSpace(12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(102, 102, 102);
    doc.text("No invoices found for the selected period.", marginX, cursorY + 4);
  }

  return openPdfPrintDialog(doc);
};
