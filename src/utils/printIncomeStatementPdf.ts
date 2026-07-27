import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type IncomeStatementPrintAccount = {
  label: string;
  amount: number;
};

export type IncomeStatementPrintInput = {
  fromDate: string;
  toDate: string;
  revenue: IncomeStatementPrintAccount[];
  cost: IncomeStatementPrintAccount[];
  expenses: IncomeStatementPrintAccount[];
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
};

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const formatPrintDate = (value: string) => {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const dateObj = new Date(value);
  if (Number.isNaN(dateObj.getTime())) return value;
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
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

type TableRow = [string, string];

const accountRows = (accounts: IncomeStatementPrintAccount[]): TableRow[] =>
  accounts.length > 0
    ? accounts.map((acc) => [acc.label, formatMoney(acc.amount)])
    : [["No accounts", ""]];

const totalRow = (label: string, amount: number): TableRow => [
  label,
  formatMoney(Math.abs(amount)),
];

/**
 * Generates the Income Statement PDF (jsPDF) and opens the browser print dialog.
 */
export const printIncomeStatement = (
  input: IncomeStatementPrintInput,
): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("Income Statement", marginX, 14);

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
    `Period: ${formatPrintDate(input.fromDate)} to ${formatPrintDate(input.toDate)}`,
    marginX,
    21,
  );

  const grossLabel =
    input.grossProfit >= 0 ? "Gross Profit" : "Gross Loss";
  const netLabel = input.netIncome >= 0 ? "Net Income" : "Net Loss";

  const body: TableRow[] = [
    ...accountRows(input.revenue),
    totalRow("Total Revenue", input.totalRevenue),
    ["", ""],
    ...accountRows(input.cost),
    totalRow("Total Cost", input.totalCost),
    totalRow(grossLabel, input.grossProfit),
    ["", ""],
    ...accountRows(input.expenses),
    totalRow("Total Expenses", input.totalExpenses),
    totalRow(netLabel, input.netIncome),
  ];

  const totalRowIndexes = new Set<number>();
  body.forEach((row, index) => {
    if (
      row[0] === "Total Revenue" ||
      row[0] === "Total Cost" ||
      row[0] === grossLabel ||
      row[0] === "Total Expenses" ||
      row[0] === netLabel
    ) {
      totalRowIndexes.add(index);
    }
  });

  autoTable(doc, {
    startY: 28,
    margin: { left: marginX, right: marginX },
    head: [["Account", "Amount"]],
    body,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 40 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (totalRowIndexes.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [243, 244, 246];
      }
      if (data.column.index === 1 && data.section === "body") {
        data.cell.styles.halign = "right";
      }
    },
  });

  return openPdfPrintDialog(doc);
};
