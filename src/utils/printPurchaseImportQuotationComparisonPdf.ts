import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfFcLcColors } from "@/utils/accountingColors";

export type PurchaseImportQuotationComparisonSupplier = {
  supplierId: string;
  supplierName: string;
  quotationNo?: string | null;
  quotationDate?: string | Date | null;
  currency?: string | null;
  conversionRate?: number | null;
  fcTotal?: number | null;
  lcTotal?: number | null;
};

export type PurchaseImportQuotationComparisonItem = {
  partId: string;
  masterPartNo?: string | null;
  partNo?: string | null;
  description?: string | null;
  brand?: string | null;
  demandQty?: number | null;
  quotes: Record<
    string,
    {
      quotationQty: number;
      shipDays: string;
      fcRate: number;
      lcRate: number;
      fcAmount: number;
      lcAmount: number;
    } | null
  >;
};

export type PurchaseImportQuotationComparisonDetail = {
  requestNo?: string | null;
  baseRequestNo?: string | null;
  requestDate?: string | Date | null;
  consignee?: string | null;
  supplierCount?: number | null;
  quotationsAvailable?: number | null;
};

const MONTH_SHORT_UPPER = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const formatPrintDate = (value?: string | Date | null) => {
  const dateObj = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dateObj.getTime())) return "-";
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = MONTH_SHORT_UPPER[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
};

const formatPrintDateTime = (value?: string | Date | null) => {
  const dateObj = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dateObj.getTime())) return "-";
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${formatPrintDate(dateObj)} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
};

const text = (value: unknown) => String(value ?? "");
const num = (value: unknown, digits = 2) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
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

export const printPurchaseImportQuotationComparison = ({
  detail,
  suppliers,
  items,
}: {
  detail: PurchaseImportQuotationComparisonDetail;
  suppliers: PurchaseImportQuotationComparisonSupplier[];
  items: PurchaseImportQuotationComparisonItem[];
}): boolean => {
  if (suppliers.length < 2) return false;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const printedOn = formatPrintDateTime(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text("Purchase Quotation Comparison", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(printedOn, pageWidth - marginX, 14, { align: "right" });

  const cards: Array<{ label: string; value: string }> = [
    {
      label: "Inquiry No",
      value: text(detail.baseRequestNo || detail.requestNo || "-"),
    },
    {
      label: "Inquiry Date",
      value: formatPrintDate(detail.requestDate),
    },
    {
      label: "Consignee",
      value: (() => {
        const raw = text(detail.consignee || "").trim();
        if (!raw || raw === "-") return "-";
        return raw.toUpperCase();
      })(),
    },
    {
      label: "Suppliers",
      value: String(detail.supplierCount || suppliers.length),
    },
    {
      label: "Quotations",
      value: String(detail.quotationsAvailable || suppliers.filter((s) => s.quotationNo).length),
    },
  ];

  const gap = 2.5;
  const cols = 5;
  const cardW = (contentWidth - gap * (cols - 1)) / cols;
  const cardH = 12;
  const cardY = 18;

  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = marginX + col * (cardW + gap);
    const y = cardY + row * (cardH + gap);

    doc.setDrawColor(221, 221, 221);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(102, 102, 102);
    doc.text(card.label, x + 2, y + 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(17, 17, 17);
    const valueLines = doc.splitTextToSize(card.value, cardW - 4);
    doc.text(valueLines, x + 2, y + 8);
  });

  let cursorY = cardY + Math.ceil(cards.length / cols) * (cardH + gap) + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text("Supplier Quotations", marginX, cursorY + 3);
  cursorY += 5;

  const perSupplierCols = 3; // FC Rate | LC Rate | Ship Days
  const columnCount = 4 + suppliers.length * perSupplierCols;

  const comparableLcFor = (
    quote:
      | {
          fcRate: number;
          lcRate: number;
        }
      | null
      | undefined,
    supplier: PurchaseImportQuotationComparisonSupplier,
  ) => {
    if (!quote) return null;
    const fcRate = Number(quote.fcRate || 0);
    const exchangeRate = Number(supplier.conversionRate || 1);
    if (!Number.isFinite(fcRate) || fcRate <= 0) return null;
    return fcRate * (Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1);
  };

  /**
   * High-contrast rank colors for older readers (80+):
   * vivid fills + dark borders + black text (not pale pastels).
   * Best (lowest LC) → green, then yellow → orange → red (highest).
   */
  const PRICE_RANK_COLORS: Array<{
    fill: [number, number, number];
    border: [number, number, number];
    text: [number, number, number];
  }> = [
    { fill: [34, 197, 94], border: [20, 83, 45], text: [0, 0, 0] }, // vivid green - best
    { fill: [250, 204, 21], border: [113, 63, 18], text: [0, 0, 0] }, // vivid yellow
    { fill: [249, 115, 22], border: [124, 45, 18], text: [0, 0, 0] }, // vivid orange
    { fill: [239, 68, 68], border: [127, 29, 29], text: [0, 0, 0] }, // vivid red - highest
  ];

  const itemPriceRanks = items.map((item) => {
    const priced = suppliers
      .map((supplier, supplierIndex) => {
        const quote = item.quotes[supplier.supplierId];
        const comparableLc = comparableLcFor(quote, supplier);
        return comparableLc == null
          ? null
          : { supplierIndex, comparableLc };
      })
      .filter(
        (row): row is { supplierIndex: number; comparableLc: number } =>
          row != null,
      )
      .sort((a, b) => a.comparableLc - b.comparableLc);

    const rankBySupplierIndex = new Map<number, number>();
    priced.forEach((row, rank) => {
      // Same LC price shares the same rank color
      const previous = priced[rank - 1];
      if (previous && Math.abs(previous.comparableLc - row.comparableLc) < 0.0001) {
        rankBySupplierIndex.set(
          row.supplierIndex,
          rankBySupplierIndex.get(previous.supplierIndex) ?? rank,
        );
      } else {
        rankBySupplierIndex.set(row.supplierIndex, rank);
      }
    });
    return rankBySupplierIndex;
  });

  const headRow1: Array<
    string | { content: string; rowSpan?: number; colSpan?: number; styles?: Record<string, unknown> }
  > = [
    { content: "#", rowSpan: 2 },
    { content: "Item", rowSpan: 2 },
    { content: "Brand", rowSpan: 2 },
    { content: "Req Qty", rowSpan: 2, styles: { halign: "right" } },
    ...suppliers.map((supplier) => ({
      content: `${supplier.supplierName}\n${text(supplier.currency || "-")} | Rate ${num(supplier.conversionRate || 0, 4)}`,
      colSpan: perSupplierCols,
      styles: { halign: "center" as const },
    })),
  ];
  const headRow2 = suppliers.flatMap(() => [
    { content: "FC Rate", styles: { halign: "right" as const } },
    { content: "LC Rate", styles: { halign: "right" as const } },
    { content: "Ship Days", styles: { halign: "center" as const } },
  ]);

  const body =
    items.length === 0
      ? [
          Array(columnCount)
            .fill("")
            .map((_, i) => (i === 1 ? "No items" : "")),
        ]
      : items.map((item, index) => {
          const row: string[] = [
            String(index + 1),
            `${text(item.masterPartNo || "-")} | ${text(item.partNo || "-")}\n${text(item.description || "-")}`,
            text(item.brand || "-"),
            String(Number(item.demandQty || 0)),
          ];

          for (const supplier of suppliers) {
            const quote = item.quotes[supplier.supplierId];
            if (!quote) {
              row.push("-", "-", "-");
            } else {
              const lcFromFc = comparableLcFor(quote, supplier);
              row.push(
                num(quote.fcRate, 2),
                num(lcFromFc ?? quote.lcRate, 0),
                text(quote.shipDays || "-"),
              );
            }
          }

          return row;
        });

  const foot: Array<
    string | { content: string; colSpan?: number; styles?: Record<string, unknown> }
  > = [
    { content: "", colSpan: 1 },
    { content: "Totals", colSpan: 3 },
  ];
  for (const supplier of suppliers) {
    foot.push(
      {
        content: num(supplier.fcTotal || 0),
        styles: { halign: "right" as const },
      },
      {
        content: num(supplier.lcTotal || 0),
        styles: { halign: "right" as const },
      },
      { content: "" },
    );
  }

  const fontSize = suppliers.length > 3 ? 6 : suppliers.length > 2 ? 6.5 : 7;
  const headingFontSize = suppliers.length > 3 ? 7 : suppliers.length > 2 ? 7.5 : 8;
  const itemColumnWidth = suppliers.length > 3 ? 60 : suppliers.length > 2 ? 68 : 78;
  const brandWidth = 13;
  const reqQtyWidth = 12;
  const indexWidth = 7;
  const remainingWidth =
    contentWidth - indexWidth - itemColumnWidth - brandWidth - reqQtyWidth;
  // 3 cols per supplier: FC Rate | LC Rate | Ship Days; ship days is narrower
  const shipDaysWidth = 13;
  const rateColWidth = Math.max(
    14,
    (remainingWidth - suppliers.length * shipDaysWidth) / (suppliers.length * 2),
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [headRow1, headRow2],
    body,
    foot: [foot],
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize,
      cellPadding: 1.2,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [22, 100, 218],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: headingFontSize,
      valign: "middle",
      cellPadding: 1.4,
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: "bold",
      fontSize,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      0: { cellWidth: indexWidth, valign: "top" },
      1: { cellWidth: itemColumnWidth, valign: "top" },
      2: { cellWidth: brandWidth, valign: "top" },
      3: { halign: "right", cellWidth: reqQtyWidth, valign: "top" },
      ...Object.fromEntries(
        suppliers.flatMap((_, supplierIndex) => {
          const base = 4 + supplierIndex * perSupplierCols;
          return [
            [base, { halign: "right" as const, cellWidth: rateColWidth }],
            [base + 1, { halign: "right" as const, cellWidth: rateColWidth }],
            [base + 2, { halign: "center" as const, cellWidth: shipDaysWidth }],
          ];
        }),
      ),
    },
    didParseCell: (data) => {
      if (data.section === "body" || data.section === "foot") {
        const fcCols: number[] = [];
        const lcCols: number[] = [];
        for (let i = 0; i < suppliers.length; i++) {
          const base = 4 + i * perSupplierCols;
          fcCols.push(base);
          lcCols.push(base + 1);
        }
        applyPdfFcLcColors(data as Parameters<typeof applyPdfFcLcColors>[0], fcCols, lcCols);
      }
      if (data.section !== "body" || data.column.index < 4) return;
      const colOffset = data.column.index - 4;
      // Ship days column (index 2 within each supplier block) — skip price coloring
      if (colOffset % perSupplierCols === 2) return;
      const rowIndex = data.row.index;
      const supplierIndex = Math.floor(colOffset / perSupplierCols);
      const ranks = itemPriceRanks[rowIndex];
      const rank = ranks?.get(supplierIndex);
      if (rank == null || !ranks || ranks.size === 0) return;

      const maxRank = Math.max(...Array.from(ranks.values()));
      const colorIndex =
        maxRank <= 0
          ? 0
          : Math.round((rank / maxRank) * (PRICE_RANK_COLORS.length - 1));
      const color = PRICE_RANK_COLORS[colorIndex];
      data.cell.styles.fillColor = color.fill;
      data.cell.styles.textColor = color.text;
      data.cell.styles.fontStyle = "bold";
      data.cell.styles.lineColor = color.border;
      data.cell.styles.lineWidth = rank === 0 ? 1.4 : 1.0;
    },
  });

  const finalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(
    "Price guide: GREEN = lowest LC (best)  |  YELLOW = mid  |  ORANGE = high  |  RED = highest LC",
    marginX,
    finalY,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text(
    "LC compared as FC Rate × Exchange Rate. Same LC price shares the same color.",
    marginX,
    finalY + 4.5,
  );

  let notesY = finalY + 10;
  doc.setFontSize(8);
  for (const supplier of suppliers) {
    const note = `${supplier.supplierName}: ${supplier.quotationNo || "No quotation"} | ${text(supplier.currency || "-")} | Rate ${num(supplier.conversionRate || 0, 4)} | LC Total ${num(supplier.lcTotal || 0)}`;
    doc.text(note, marginX, notesY);
    notesY += 4;
  }

  // ── Supplier Summary (cheapest items per supplier) ────────────────────────
  // Count how many items each supplier wins (lowest LC rate)
  const cheapestCount = new Map<number, number>(); // supplierIndex → count
  const tiedItems: number[] = []; // item indices where 2+ suppliers tie for best
  let itemsWithAnyQuote = 0;

  items.forEach((_item, itemIdx) => {
    const ranks = itemPriceRanks[itemIdx];
    if (!ranks || ranks.size === 0) return;
    itemsWithAnyQuote++;
    // Collect all supplierIndexes that share rank 0 (best price)
    const bestIndexes = Array.from(ranks.entries())
      .filter(([, rank]) => rank === 0)
      .map(([sIdx]) => sIdx);
    if (bestIndexes.length > 1) {
      tiedItems.push(itemIdx);
    }
    bestIndexes.forEach((sIdx) => {
      cheapestCount.set(sIdx, (cheapestCount.get(sIdx) || 0) + 1);
    });
  });

  const summaryStartY = notesY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text("Price Summary — Cheapest Supplier per Item", marginX, summaryStartY);

  const summaryTableHead = [["Supplier", "Quotation No", "Currency", "Exchange Rate", "Cheapest Items", "% of Total", "LC Total"]];
  const summaryTableBody = suppliers.map((supplier, sIdx) => {
    const count = cheapestCount.get(sIdx) || 0;
    const pct = itemsWithAnyQuote > 0 ? ((count / itemsWithAnyQuote) * 100).toFixed(1) : "0.0";
    return [
      supplier.supplierName,
      supplier.quotationNo || "-",
      text(supplier.currency || "-"),
      num(supplier.conversionRate || 0, 4),
      String(count),
      `${pct}%`,
      num(supplier.lcTotal || 0),
    ];
  });

  // Sort summary rows by cheapest items descending for readability
  summaryTableBody.sort((a, b) => Number(b[4]) - Number(a[4]));

  autoTable(doc, {
    startY: summaryStartY + 3,
    margin: { left: marginX, right: marginX },
    head: summaryTableHead,
    body: summaryTableBody,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.5,
      textColor: [17, 17, 17],
      lineColor: [221, 221, 221],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [22, 100, 218],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: {
      4: { halign: "center", fontStyle: "bold" },
      5: { halign: "center" },
      6: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      // Highlight the row with the most cheapest items in green
      const maxCount = Math.max(...Array.from(cheapestCount.values()), 0);
      if (data.column.index === 4 && Number(data.cell.raw) === maxCount && maxCount > 0) {
        data.cell.styles.fillColor = [34, 197, 94];
        data.cell.styles.textColor = [0, 0, 0];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const summaryFinalY =
    ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || summaryStartY) + 5;

  if (tiedItems.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Note: ${tiedItems.length} item(s) tied for best price — counted for each tied supplier.`,
      marginX,
      summaryFinalY,
    );
  }

  return openPdfPrintDialog(doc);
};
