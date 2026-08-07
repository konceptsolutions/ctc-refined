import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";
import { applyPdfDrCrColors } from "@/utils/accountingColors";

export type TrialBalancePrintRow = {
  label: string;
  debit: number;
  credit: number;
  isSubgroup?: boolean;
};

export type TrialBalancePrintInput = {
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  rows: TrialBalancePrintRow[];
  totalDebit: number;
  totalCredit: number;
};

export const printTrialBalance = (input: TrialBalancePrintInput): boolean => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Trial Balance", marginX, 14);

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
    21,
  );

  const subgroupIndexes = new Set<number>();
  input.rows.forEach((row, index) => {
    if (row.isSubgroup) subgroupIndexes.add(index);
  });

  autoTable(doc, {
    startY: 28,
    margin: { left: marginX, right: marginX },
    head: [["Account", "Dr", "Cr"]],
    body: [
      ...input.rows.map((row) => [
        row.label,
        formatPdfMoney(row.debit),
        formatPdfMoney(row.credit),
      ]),
      ["Total", formatPdfMoney(input.totalDebit), formatPdfMoney(input.totalCredit)],
    ],
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
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
      1: { halign: "right", cellWidth: 35 },
      2: { halign: "right", cellWidth: 35 },
    },
    didParseCell: (data) => {
      applyPdfDrCrColors(data, 1, 2);
      if (data.section !== "body") return;
      const isTotal = data.row.index === input.rows.length;
      if (isTotal || subgroupIndexes.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [243, 244, 246];
      }
    },
  });

  return openPdfPrintDialog(doc);
};
