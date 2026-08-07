import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";
import { applyPdfAmountColor } from "@/utils/accountingColors";

export type BalanceSheetPrintAccount = {
  label: string;
  balance: number;
};

export type BalanceSheetPrintSubgroup = {
  label: string;
  accounts: BalanceSheetPrintAccount[];
  total: number;
};

export type BalanceSheetPrintMainGroup = {
  label: string;
  subgroups: BalanceSheetPrintSubgroup[];
  total: number;
};

export type BalanceSheetPrintInput = {
  date?: string | Date | null;
  assets: BalanceSheetPrintMainGroup[];
  liabilities: BalanceSheetPrintMainGroup[];
  capital: BalanceSheetPrintMainGroup[];
  totalAssets: number;
  totalLiabilities: number;
  totalCapital: number;
  netIncomeLabel?: string;
  netIncome?: number;
};

const formatBalance = (value: number) => {
  if (value < 0) return `(${formatPdfMoney(Math.abs(value), 2)})`;
  return formatPdfMoney(value, 2);
};

const buildSectionRows = (groups: BalanceSheetPrintMainGroup[]) => {
  const rows: string[][] = [];
  const boldIndexes = new Set<number>();

  for (const group of groups) {
    boldIndexes.add(rows.length);
    rows.push([group.label, ""]);
    for (const subgroup of group.subgroups) {
      boldIndexes.add(rows.length);
      rows.push([`  ${subgroup.label}`, ""]);
      for (const account of subgroup.accounts) {
        rows.push([`    ${account.label}`, formatBalance(account.balance)]);
      }
      boldIndexes.add(rows.length);
      rows.push([`  Total ${subgroup.label}`, formatBalance(subgroup.total)]);
    }
    boldIndexes.add(rows.length);
    rows.push([`Total ${group.label}`, formatBalance(group.total)]);
    rows.push(["", ""]);
  }

  return { rows, boldIndexes };
};

export const printBalanceSheet = (input: BalanceSheetPrintInput): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Balance Sheet", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Printed ${new Date().toLocaleString()}`, pageWidth - marginX, 14, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text(`As of: ${formatPdfDate(input.date)}`, marginX, 21);

  const assets = buildSectionRows(input.assets);
  const liabilities = buildSectionRows(input.liabilities);
  const capital = buildSectionRows(input.capital);

  const body: string[][] = [
    ["ASSETS", ""],
    ...assets.rows,
    ["Total Assets", formatBalance(input.totalAssets)],
    ["", ""],
    ["LIABILITIES", ""],
    ...liabilities.rows,
    ["Total Liabilities", formatBalance(input.totalLiabilities)],
    ["", ""],
    ["CAPITAL", ""],
    ...capital.rows,
  ];

  if (input.netIncome !== undefined) {
    body.push([
      input.netIncomeLabel || "Net Income",
      formatBalance(input.netIncome),
    ]);
  }

  body.push(["Total Capital", formatBalance(input.totalCapital)]);
  body.push(["", ""]);
  body.push([
    "Total Liabilities & Capital",
    formatBalance(input.totalLiabilities + input.totalCapital),
  ]);

  const boldLabels = new Set([
    "ASSETS",
    "LIABILITIES",
    "CAPITAL",
    "Total Assets",
    "Total Liabilities",
    "Total Capital",
    "Total Liabilities & Capital",
    input.netIncomeLabel || "Net Income",
  ]);

  autoTable(doc, {
    startY: 28,
    margin: { left: marginX, right: marginX },
    head: [["Account", "Amount"]],
    body,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.4,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      1: { halign: "right", cellWidth: 40 },
    },
    didParseCell: (data) => {
      applyPdfAmountColor(data, 1);
      if (data.section !== "body") return;
      const label = String(data.row.raw?.[0] ?? "");
      if (
        boldLabels.has(label) ||
        label.startsWith("Total ") ||
        (/^[A-Z]/.test(label.trim()) && !label.startsWith(" "))
      ) {
        if (
          boldLabels.has(label) ||
          label.startsWith("Total ") ||
          label === "ASSETS" ||
          label === "LIABILITIES" ||
          label === "CAPITAL"
        ) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [243, 244, 246];
        }
      }
    },
  });

  return openPdfPrintDialog(doc);
};
