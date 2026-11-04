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

export type ComparisonLedgerEntry = {
  id?: number | string;
  tId?: number | string | null;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit?: number | null;
  credit?: number | null;
  balance?: number;
};

export type ComparisonPrintInput = {
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  supplierAccountLabel?: string;
  customerAccountLabel?: string;
  supplierName?: string | null;
  customerName?: string | null;
  supplierBalance?: number | null;
  customerBalance?: number | null;
  combinedBalance?: number | null;
  supplierEntries: ComparisonLedgerEntry[];
  customerEntries: ComparisonLedgerEntry[];
};

type CombinedRow = {
  side: "Supplier" | "Customer" | "";
  tId: string;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  sortKey: number;
  sortOrder: number;
};

const formatAmount = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "";
  return formatPdfMoney(value, 2);
};

const isOpeningRow = (entry: ComparisonLedgerEntry) => {
  const desc = String(entry.description || "")
    .trim()
    .toLowerCase();
  return desc === "opening balance" || String(entry.id || "").startsWith("opening-balance");
};

/** Parse DD/MM/YYYY (and common variants) to a sortable timestamp. */
const parseLedgerDate = (value: string): number => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return 0;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return Date.UTC(year, month - 1, day);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Build one chronological ledger from supplier + customer entries.
 * Running balance uses Customer − Supplier convention (asset-like net):
 * each line contributes (debit − credit) so purchases reduce net and sales increase it.
 */
export const buildCombinedSingularLedger = (
  supplierEntries: ComparisonLedgerEntry[],
  customerEntries: ComparisonLedgerEntry[],
): CombinedRow[] => {
  const supplierOpening = supplierEntries.find(isOpeningRow);
  const customerOpening = customerEntries.find(isOpeningRow);
  const openingBalance =
    Number(customerOpening?.balance || 0) - Number(supplierOpening?.balance || 0);

  const rows: CombinedRow[] = [];
  let order = 0;

  const pushSide = (
    side: "Supplier" | "Customer",
    entries: ComparisonLedgerEntry[],
  ) => {
    for (const entry of entries) {
      if (isOpeningRow(entry)) continue;
      rows.push({
        side,
        tId: entry.tId == null ? "-" : String(entry.tId),
        voucherNo: entry.voucherNo || "-",
        timeStamp: entry.timeStamp || "-",
        description: entry.description || "-",
        debit: entry.debit ?? null,
        credit: entry.credit ?? null,
        balance: 0,
        sortKey: parseLedgerDate(entry.timeStamp),
        sortOrder: order++,
      });
    }
  };

  pushSide("Supplier", supplierEntries);
  pushSide("Customer", customerEntries);

  rows.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    if (a.side !== b.side) return a.side === "Customer" ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  const combined: CombinedRow[] = [
    {
      side: "",
      tId: "-",
      voucherNo: "-",
      timeStamp:
        customerOpening?.timeStamp ||
        supplierOpening?.timeStamp ||
        "-",
      description: "Opening Balance",
      debit: null,
      credit: null,
      balance: openingBalance,
      sortKey: 0,
      sortOrder: -1,
    },
  ];

  let running = openingBalance;
  for (const row of rows) {
    const debit = Number(row.debit || 0);
    const credit = Number(row.credit || 0);
    // Net receivable view: both sides contribute debit − credit
    // (customer asset normal; supplier liability inverted via Customer − Supplier).
    running += debit - credit;
    combined.push({
      ...row,
      balance: running,
    });
  }

  return combined;
};

export const printSupplierCustomerComparison = (
  input: ComparisonPrintInput,
): boolean => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const title = "Supplier / Customer Combined Ledger";

  const combinedRows = buildCombinedSingularLedger(
    input.supplierEntries || [],
    input.customerEntries || [],
  );
  const closingCombined =
    input.combinedBalance != null && Number.isFinite(Number(input.combinedBalance))
      ? Number(input.combinedBalance)
      : combinedRows.length
        ? combinedRows[combinedRows.length - 1].balance
        : 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Printed ${new Date().toLocaleString()}`, pageWidth - marginX, 14, {
    align: "right",
  });

  const normalizeName = (value?: string | null) =>
    String(value || "")
      .replace(/\.+$/, "")
      .trim();
  const customerName = normalizeName(input.customerName);
  const supplierName = normalizeName(input.supplierName);
  const displayName =
    customerName && supplierName
      ? customerName.toLowerCase() === supplierName.toLowerCase()
        ? customerName
        : `${customerName} / ${supplierName}`
      : customerName || supplierName || "Customer / Supplier";

  const accountCodeOnly = (label?: string) => {
    const raw = String(label || "").trim();
    if (!raw) return "";
    const dash = raw.indexOf("-");
    if (dash > 0) return raw.slice(0, dash).trim();
    return raw;
  };
  const customerAc = accountCodeOnly(input.customerAccountLabel);
  const supplierAc = accountCodeOnly(input.supplierAccountLabel);

  let y = 21;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  const cardHeight = 24;
  doc.roundedRect(marginX, y - 2, pageWidth - marginX * 2, cardHeight, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("COMBINED ACCOUNT", marginX + 4, y + 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(displayName, marginX + 4, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    [
      customerAc ? `Customer A/C: ${customerAc}` : null,
      supplierAc ? `Supplier A/C: ${supplierAc}` : null,
    ]
      .filter(Boolean)
      .join("   |   ") || "",
    marginX + 4,
    y + 16,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("NET BALANCE", pageWidth - marginX - 4, y + 2, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(formatAmount(closingCombined), pageWidth - marginX - 4, y + 12, {
    align: "right",
  });

  y += cardHeight + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text(
    `Period: ${formatPdfDate(input.fromDate)} to ${formatPdfDate(input.toDate)}`,
    marginX,
    y,
  );
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Supplier bal ${formatAmount(input.supplierBalance)}   |   Customer bal ${formatAmount(input.customerBalance)}   |   Combined ${formatAmount(closingCombined)}`,
    marginX,
    y,
  );

  const head = [["Side", "Voucher No", "Date", "Description", "Dr", "Cr", "Balance"]];
  const body = combinedRows.map((row) => [
    row.side,
    row.voucherNo,
    row.timeStamp,
    row.description,
    formatAmount(row.debit),
    formatAmount(row.credit),
    formatAmount(row.balance),
  ]);

  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head,
    body: body.length > 0 ? body : [["", "", "", "No entries", "", "", ""]],
    styles: {
      font: "helvetica",
      fontSize: 8,
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
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 30 },
      2: { cellWidth: 26 },
      4: { halign: "right", cellWidth: 30 },
      5: { halign: "right", cellWidth: 30 },
      6: { halign: "right", cellWidth: 32 },
    },
    didParseCell: (data) => {
      applyPdfDrCrColors(data, 4, 5);
      applyPdfBalanceColor(data, 6);
      if (data.section === "body" && data.column.index === 0) {
        const side = String(data.cell.raw || "");
        if (side === "Customer") {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        } else if (side === "Supplier") {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  return openPdfPrintDialog(doc);
};
