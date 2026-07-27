import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";

export type LedgerPrintEntry = {
  tId?: number | string | null;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit?: number | null;
  credit?: number | null;
  balance: number;
  exchangeRate?: number | null;
};

export type LedgerPrintInput = {
  title?: string;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  accountLabel?: string;
  subtitle?: string;
  showExchangeRate?: boolean;
  entries: LedgerPrintEntry[];
};

const formatAmount = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "";
  return formatPdfMoney(value, 2);
};

export const printLedgers = (input: LedgerPrintInput): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const title = input.title || "Ledgers";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Printed ${new Date().toLocaleString()}`, pageWidth - marginX, 14, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  let y = 21;
  doc.text(
    `Period: ${formatPdfDate(input.fromDate)} to ${formatPdfDate(input.toDate)}`,
    marginX,
    y,
  );
  if (input.accountLabel) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Account: ${input.accountLabel}`, marginX, y);
  }
  if (input.subtitle) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(input.subtitle, marginX, y);
  }

  const head = input.showExchangeRate
    ? [["T_Id", "Voucher No", "Time Stamp", "Description", "Exchange Rate", "Dr", "Cr", "Balance"]]
    : [["T_Id", "Voucher No", "Time Stamp", "Description", "Dr", "Cr", "Balance"]];

  const body = input.entries.map((entry) => {
    const base = [
      entry.tId == null ? "-" : String(entry.tId),
      entry.voucherNo || "",
      entry.timeStamp || "",
      entry.description || "",
    ];
    if (input.showExchangeRate) {
      base.push(
        entry.exchangeRate == null || entry.exchangeRate === undefined
          ? ""
          : Number(entry.exchangeRate).toFixed(4),
      );
    }
    base.push(
      formatAmount(entry.debit),
      formatAmount(entry.credit),
      formatAmount(entry.balance),
    );
    return base;
  });

  autoTable(doc, {
    startY: y + 7,
    margin: { left: marginX, right: marginX },
    head,
    body:
      body.length > 0
        ? body
        : [input.showExchangeRate ? ["", "", "", "No entries", "", "", "", ""] : ["", "", "", "No entries", "", "", ""]],
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
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: input.showExchangeRate
      ? {
          4: { halign: "right", cellWidth: 28 },
          5: { halign: "right", cellWidth: 28 },
          6: { halign: "right", cellWidth: 28 },
          7: { halign: "right", cellWidth: 30 },
        }
      : {
          4: { halign: "right", cellWidth: 30 },
          5: { halign: "right", cellWidth: 30 },
          6: { halign: "right", cellWidth: 32 },
        },
  });

  return openPdfPrintDialog(doc);
};
