import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatPdfMoney, openPdfPrintDialog } from "@/utils/pdfPrint";

export type DailyClosingPrintColumn = {
  id: string;
  name: string;
};

export type DailyClosingPrintRow = {
  serialNo: number;
  voucherNumber: string;
  description: string;
  amounts: Record<string, number>;
};

export type DailyClosingPrintInput = {
  date: string;
  columns: DailyClosingPrintColumn[];
  openingBalances: Record<string, number>;
  receipts: DailyClosingPrintRow[];
  payments: DailyClosingPrintRow[];
  totalReceipts: Record<string, number>;
  totalPayments: Record<string, number>;
  closingBalances: Record<string, number>;
};

const money = (value: number) => {
  const num = Math.round(Number(value || 0));
  if (num === 0) return "0";
  return formatPdfMoney(num, 0);
};

export const printDailyClosing = (input: DailyClosingPrintInput): boolean => {
  const doc = new jsPDF({
    orientation: input.columns.length > 4 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Daily Closing — Cash & Bank", marginX, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text(
    `Date: ${input.date} · Printed ${new Date().toLocaleString()}`,
    pageWidth - marginX,
    12,
    { align: "right" },
  );

  const amountCells = (values: Record<string, number>) =>
    input.columns.map((col) => money(Number(values[col.id] || 0)));

  const txnRows = (rows: DailyClosingPrintRow[]) =>
    rows.length === 0
      ? [
          [
            "",
            "",
            "—",
            ...input.columns.map(() => ""),
          ],
        ]
      : rows.map((row) => [
          String(row.serialNo),
          row.voucherNumber || "",
          row.description || "",
          ...amountCells(row.amounts),
        ]);

  const head = [
    ["S no", "V no", "Desc", ...input.columns.map((c) => c.name)],
  ];

  const body: string[][] = [
    ["", "", "Opening Balances:", ...amountCells(input.openingBalances)],
    [
      "Receipts",
      "",
      "",
      ...input.columns.map(() => ""),
    ],
    ...txnRows(input.receipts),
    ["", "", "Total Receipts:", ...amountCells(input.totalReceipts)],
    [
      "Payments",
      "",
      "",
      ...input.columns.map(() => ""),
    ],
    ...txnRows(input.payments),
    ["", "", "Total Payments:", ...amountCells(input.totalPayments)],
    ["", "", "Closing Balances:", ...amountCells(input.closingBalances)],
  ];

  const sectionIndexes = new Set<number>();
  const summaryIndexes = new Set<number>();
  body.forEach((row, index) => {
    if (row[0] === "Receipts" || row[0] === "Payments") {
      sectionIndexes.add(index);
    }
    if (
      row[2] === "Opening Balances:" ||
      row[2] === "Total Receipts:" ||
      row[2] === "Total Payments:" ||
      row[2] === "Closing Balances:"
    ) {
      summaryIndexes.add(index);
    }
  });

  autoTable(doc, {
    startY: 18,
    margin: { left: marginX, right: marginX },
    head,
    body,
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 1.2,
      textColor: [17, 17, 17],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: "auto" },
      ...Object.fromEntries(
        input.columns.map((_, i) => [i + 3, { halign: "right", cellWidth: 22 }]),
      ),
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (sectionIndexes.has(data.row.index)) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.halign = "center";
      }
      if (summaryIndexes.has(data.row.index)) {
        data.cell.styles.fillColor = [248, 250, 252];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  return openPdfPrintDialog(doc);
};
