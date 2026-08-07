import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";
import { applyPdfDrCrColors } from "@/utils/accountingColors";

export type GeneralJournalPrintEntry = {
  tId: number | string;
  voucherNo: string;
  date: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
};

export type GeneralJournalPrintInput = {
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  entries: GeneralJournalPrintEntry[];
};

export const printGeneralJournal = (
  input: GeneralJournalPrintInput,
): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("General Journal", marginX, 14);

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

  const totalDebit = input.entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = input.entries.reduce(
    (s, e) => s + (Number(e.credit) || 0),
    0,
  );

  autoTable(doc, {
    startY: 28,
    margin: { left: marginX, right: marginX },
    head: [["T_Id", "Voucher No", "Date", "Account", "Description", "Debit", "Credit"]],
    body: input.entries.map((entry) => [
      String(entry.tId ?? ""),
      entry.voucherNo || "",
      entry.date || "",
      entry.account || "",
      entry.description || "",
      formatPdfMoney(entry.debit),
      formatPdfMoney(entry.credit),
    ]),
    foot: [
      [
        "",
        "",
        "",
        "",
        "Total",
        formatPdfMoney(totalDebit),
        formatPdfMoney(totalCredit),
      ],
    ],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.5,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      5: { halign: "right" },
      6: { halign: "right" },
    },
    didParseCell: (data) => {
      applyPdfDrCrColors(data, 5, 6);
    },
  });

  return openPdfPrintDialog(doc);
};
