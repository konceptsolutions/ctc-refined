import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatPdfDate,
  formatPdfMoney,
  openPdfPrintDialog,
} from "@/utils/pdfPrint";
import {
  applyPdfBalanceColor,
  applyPdfDrCrColors,
} from "@/utils/accountingColors";

export type LedgerPrintEntry = {
  tId?: number | string | null;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit?: number | null;
  credit?: number | null;
  balance: number;
  exchangeRate?: number | null;
  debitFc?: number | null;
  creditFc?: number | null;
  balanceFc?: number | null;
};

export type LedgerPrintParty = {
  name?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  phone?: string | null;
  type?: string | null;
};

export type LedgerPrintInput = {
  title?: string;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  accountLabel?: string;
  subtitle?: string;
  showExchangeRate?: boolean;
  /** Show FC + LC amount columns in one table */
  dualCurrency?: boolean;
  currencyName?: string;
  party?: LedgerPrintParty | null;
  currentBalance?: number | null;
  balanceLabel?: string;
  currentBalanceFc?: number | null;
  balanceFcLabel?: string;
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
  const party = input.party;
  if (party) {
    const partyLabel = party.type === "supplier" ? "Supplier" : "Customer";
    const detailWidth = pageWidth - marginX * 2 - 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const phoneWrapped = doc.splitTextToSize(
      `Phone / Mobile: ${party.phone || "-"}`,
      detailWidth,
    );
    const addressWrapped = doc.splitTextToSize(
      `Address: ${party.address || "-"}`,
      detailWidth,
    );
    const contactWrapped = doc.splitTextToSize(
      `Contact persons: ${party.contactPerson || "-"}`,
      detailWidth,
    );
    const cardTop = y - 2;
    const cardHeight =
      16 +
      phoneWrapped.length * 3.6 +
      addressWrapped.length * 3.6 +
      contactWrapped.length * 3.6 +
      6;

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, cardTop, pageWidth - marginX * 2, cardHeight, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(partyLabel.toUpperCase(), marginX + 4, y + 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(party.name || "-", marginX + 4, y + 8);

    if (input.currentBalance != null && Number.isFinite(Number(input.currentBalance))) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text((input.balanceLabel || "Balance").toUpperCase(), pageWidth - marginX - 4, y + 2, {
        align: "right",
      });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(
        formatAmount(Number(input.currentBalance)),
        pageWidth - marginX - 4,
        y + 8,
        { align: "right" },
      );
      if (
        input.dualCurrency &&
        input.currentBalanceFc != null &&
        Number.isFinite(Number(input.currentBalanceFc))
      ) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          (input.balanceFcLabel || "Balance (FC)").toUpperCase(),
          pageWidth - marginX - 4,
          y + 12,
          { align: "right" },
        );
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(
          formatAmount(Number(input.currentBalanceFc)),
          pageWidth - marginX - 4,
          y + 17,
          { align: "right" },
        );
      }
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    let detailY = y + 14;
    doc.text(phoneWrapped, marginX + 4, detailY);
    detailY += phoneWrapped.length * 3.6 + 1;
    doc.text(addressWrapped, marginX + 4, detailY);
    detailY += addressWrapped.length * 3.6 + 1;
    doc.text(contactWrapped, marginX + 4, detailY);
    y = cardTop + cardHeight + 6;
  }
  doc.setTextColor(17, 17, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
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

  const fcLabel = input.currencyName ? `FC (${input.currencyName})` : "FC";
  const head = input.dualCurrency
    ? [[
        "T_Id",
        "Voucher No",
        "Time Stamp",
        "Description",
        "Exch. Rate",
        `Dr ${fcLabel}`,
        `Cr ${fcLabel}`,
        `Bal ${fcLabel}`,
        "Dr LC",
        "Cr LC",
        "Bal LC",
      ]]
    : input.showExchangeRate
      ? [["T_Id", "Voucher No", "Time Stamp", "Description", "Exchange Rate", "Dr", "Cr", "Balance"]]
      : [["T_Id", "Voucher No", "Time Stamp", "Description", "Dr", "Cr", "Balance"]];

  const body = input.entries.map((entry) => {
    const base = [
      entry.tId == null ? "-" : String(entry.tId),
      entry.voucherNo || "",
      entry.timeStamp || "",
      entry.description || "",
    ];
    if (input.dualCurrency) {
      base.push(
        entry.exchangeRate == null || entry.exchangeRate === undefined
          ? ""
          : Number(entry.exchangeRate).toFixed(4),
        formatAmount(entry.debitFc),
        formatAmount(entry.creditFc),
        formatAmount(entry.balanceFc),
        formatAmount(entry.debit),
        formatAmount(entry.credit),
        formatAmount(entry.balance),
      );
      return base;
    }
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

  const emptyDual = ["", "", "", "No entries", "", "", "", "", "", "", ""];
  const emptyFx = ["", "", "", "No entries", "", "", "", ""];
  const emptyLc = ["", "", "", "No entries", "", "", ""];

  autoTable(doc, {
    startY: y + 7,
    margin: { left: marginX, right: marginX },
    head,
    body:
      body.length > 0
        ? body
        : [input.dualCurrency ? emptyDual : input.showExchangeRate ? emptyFx : emptyLc],
    styles: {
      font: "helvetica",
      fontSize: input.dualCurrency ? 7 : 8,
      cellPadding: 1.2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: input.dualCurrency ? 7 : 8,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: input.dualCurrency
      ? {
          4: { halign: "right", cellWidth: 18 },
          5: { halign: "right", cellWidth: 22 },
          6: { halign: "right", cellWidth: 22 },
          7: { halign: "right", cellWidth: 22 },
          8: { halign: "right", cellWidth: 22 },
          9: { halign: "right", cellWidth: 22 },
          10: { halign: "right", cellWidth: 24 },
        }
      : input.showExchangeRate
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
    didParseCell: (data) => {
      if (input.dualCurrency) {
        applyPdfDrCrColors(data, 5, 6);
        applyPdfBalanceColor(data, 7);
        applyPdfDrCrColors(data, 8, 9);
        applyPdfBalanceColor(data, 10);
        return;
      }
      const debitCol = input.showExchangeRate ? 5 : 4;
      const creditCol = input.showExchangeRate ? 6 : 5;
      const balanceCol = input.showExchangeRate ? 7 : 6;
      applyPdfDrCrColors(data, debitCol, creditCol);
      applyPdfBalanceColor(data, balanceCol);
    },
  });

  return openPdfPrintDialog(doc);
};
