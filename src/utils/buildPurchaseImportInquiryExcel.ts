import ExcelJS from "exceljs";
import type {
  InquiryViewItemRow,
  InquiryViewSupplierRow,
  PurchaseImportInquiryPrintDetail,
} from "@/utils/printPurchaseImportInquiryPdf";

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

const toInputDate = (value?: string | Date | null) => {
  if (!value) return "";
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) return "";
  return dateObj.toISOString().split("T")[0];
};

const text = (value: unknown) => String(value ?? "");

/** Excel workbook matching Purchase Import Inquiry PDF content. */
export const buildPurchaseImportInquiryExcelBlob = async ({
  detail,
  supplierRows,
  itemRows,
  totals,
}: {
  detail: PurchaseImportInquiryPrintDetail;
  supplierRows: InquiryViewSupplierRow[];
  itemRows: InquiryViewItemRow[];
  totals: { qty: number; weight: number };
}): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CTC Refined";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Inquiry", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Section", key: "section", width: 14 },
    { header: "Field / #", key: "field", width: 12 },
    { header: "Value / Item", key: "value", width: 48 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Weight", key: "weight", width: 12 },
    { header: "Total Weight", key: "totalWeight", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1664DA" },
  };

  const addInfo = (field: string, value: string) => {
    sheet.addRow({
      section: "Header",
      field,
      value,
      qty: "",
      weight: "",
      totalWeight: "",
    });
  };

  addInfo("Title", "Purchase Import Inquiry");
  addInfo("Inquiry No", text(detail.requestNo || "-"));
  addInfo("Inquiry Date", toInputDate(detail.requestDate) || "-");
  addInfo("Status", text(detail.status || "pending"));
  addInfo("Part Reference", text(detail.partReference || "-"));
  addInfo("Upto Date", formatPrintDate(new Date()));
  if (detail.notes) {
    addInfo("Notes", text(detail.notes));
  }

  sheet.addRow({});

  if (supplierRows.length === 0) {
    sheet.addRow({
      section: "Suppliers",
      field: "",
      value: "No suppliers",
      qty: "",
      weight: "",
      totalWeight: "",
    });
  } else {
    supplierRows.forEach((supplier, index) => {
      sheet.addRow({
        section: "Suppliers",
        field: String(index + 1),
        value: `${text(supplier.name)} | ${text(supplier.country)} | ${text(supplier.area)}`,
        qty: "",
        weight: "",
        totalWeight: "",
      });
    });
  }

  sheet.addRow({});

  if (itemRows.length === 0) {
    sheet.addRow({
      section: "Items",
      field: "",
      value: "No items",
      qty: "",
      weight: "",
      totalWeight: "",
    });
  } else {
    itemRows.forEach((item, index) => {
      sheet.addRow({
        section: "Items",
        field: String(index + 1),
        value: `${text(item.masterPartNo)} | ${text(item.partNo)} — ${text(item.description)}`,
        qty: item.totalDemand,
        weight: Number(item.weight.toFixed(2)),
        totalWeight: Number(item.totalWeight.toFixed(2)),
      });
    });
  }

  const totalsRow = sheet.addRow({
    section: "Totals",
    field: "",
    value: "Totals",
    qty: totals.qty,
    weight: "",
    totalWeight: Number(totals.weight.toFixed(2)),
  });
  totalsRow.font = { bold: true };

  sheet.addRow({});
  sheet.addRow({
    section: "Footer",
    field: "",
    value: "Computer-generated document.",
    qty: "",
    weight: "",
    totalWeight: "",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};
