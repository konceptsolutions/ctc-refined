import ExcelJS from "exceljs";
import type { PdfStockRow } from "@/lib/stockPdfParser";

export interface SystemStockItem {
  part_id: string;
  part_no: string;
  master_part_no: string | null;
  description: string | null;
  brand: string | null;
  category: string | null;
  current_stock: number;
}

export type CompareStatus = "Match" | "Over" | "Under" | "Not in System";

export interface CompareRow {
  pdfPartNo: string;
  pdfBrand: string | null;
  systemPartNo: string | null;
  masterPartNo: string | null;
  systemBrand: string | null;
  description: string | null;
  pdfQty: number;
  systemQty: number;
  variance: number;
  status: CompareStatus;
  reason: string;
  pdfPages: string;
}

const NOT_IN_SYSTEM_REASON = "Item not present in system";

export interface CompareSummary {
  pdfPages: number;
  pdfLinesParsed: number;
  pdfItems: number;
  systemItems: number;
  matched: number;
  over: number;
  under: number;
  notInSystem: number;
  systemOnly: number;
}

const normalizePartNo = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, "");

const normalizeBrand = (value: string | null | undefined) =>
  (value || "").trim().toUpperCase();

const partBrandKey = (partNo: string, brand: string | null | undefined) =>
  `${normalizePartNo(partNo)}|${normalizeBrand(brand)}`;

const buildSystemLookup = (items: SystemStockItem[]) => {
  const byPartAndBrand = new Map<string, SystemStockItem>();
  const byMasterPartAndBrand = new Map<string, SystemStockItem>();

  for (const item of items) {
    // Display convention: DB master_part_no = Part No, DB part_no = Master Part No.
    if (item.master_part_no) {
      const key = partBrandKey(item.master_part_no, item.brand);
      if (!byMasterPartAndBrand.has(key)) {
        byMasterPartAndBrand.set(key, item);
      }
    }
    if (item.part_no) {
      byPartAndBrand.set(partBrandKey(item.part_no, item.brand), item);
    }
  }

  return { byPartAndBrand, byMasterPartAndBrand };
};

const resolveStatus = (pdfQty: number, systemQty: number): CompareStatus => {
  if (systemQty < 0) return "Not in System";
  if (pdfQty === systemQty) return "Match";
  if (pdfQty > systemQty) return "Over";
  return "Under";
};

export const comparePdfStockWithSystem = (
  pdfRows: PdfStockRow[],
  systemStock: SystemStockItem[],
  meta: { pageCount: number; parsedLineCount: number },
): {
  rows: CompareRow[];
  systemOnlyRows: SystemStockItem[];
  summary: CompareSummary;
} => {
  const { byPartAndBrand, byMasterPartAndBrand } = buildSystemLookup(systemStock);
  const rows: CompareRow[] = [];

  for (const pdfRow of pdfRows) {
    const key = partBrandKey(pdfRow.partNo, pdfRow.brand);
    const systemItem =
      byMasterPartAndBrand.get(key) || byPartAndBrand.get(key) || null;
    const systemQty = systemItem?.current_stock ?? -1;
    const status = resolveStatus(pdfRow.qty, systemQty);

    rows.push({
      pdfPartNo: pdfRow.partNo,
      pdfBrand: pdfRow.brand,
      systemPartNo: systemItem?.master_part_no ?? null,
      masterPartNo: systemItem?.part_no ?? null,
      systemBrand: systemItem?.brand ?? null,
      description: systemItem?.description ?? null,
      pdfQty: pdfRow.qty,
      systemQty: systemQty < 0 ? 0 : systemQty,
      variance: pdfRow.qty - (systemQty < 0 ? 0 : systemQty),
      status,
      reason: status === "Not in System" ? NOT_IN_SYSTEM_REASON : "",
      pdfPages: pdfRow.pages.join(", "),
    });
  }

  const pdfPartNos = new Set(
    pdfRows.map((row) => normalizePartNo(row.partNo)).filter(Boolean),
  );

  const systemOnlyRows = systemStock.filter((item) => {
    if (Number(item.current_stock || 0) <= 0) return false;
    const systemPartNos = [item.master_part_no, item.part_no]
      .filter(Boolean)
      .map((value) => normalizePartNo(String(value)));
    return !systemPartNos.some((partNo) => pdfPartNos.has(partNo));
  });

  const summary: CompareSummary = {
    pdfPages: meta.pageCount,
    pdfLinesParsed: meta.parsedLineCount,
    pdfItems: pdfRows.length,
    systemItems: systemStock.length,
    matched: rows.filter((row) => row.status === "Match").length,
    over: rows.filter((row) => row.status === "Over").length,
    under: rows.filter((row) => row.status === "Under").length,
    notInSystem: rows.filter((row) => row.status === "Not in System").length,
    systemOnly: systemOnlyRows.length,
  };

  return { rows, systemOnlyRows, summary };
};

const styleHeaderRow = (sheet: ExcelJS.Worksheet) => {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F1FF" },
  };
};

const styleNotInSystemRow = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFC7CE" },
    };
    cell.font = {
      color: { argb: "FF9C0006" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE08A8A" } },
      left: { style: "thin", color: { argb: "FFE08A8A" } },
      bottom: { style: "thin", color: { argb: "FFE08A8A" } },
      right: { style: "thin", color: { argb: "FFE08A8A" } },
    };
  });
};

export const generateStockCompareExcel = async (input: {
  rows: CompareRow[];
  systemOnlyRows: SystemStockItem[];
  summary: CompareSummary;
  fileName: string;
}): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CTC Inventory";
  workbook.created = new Date();

  const comparisonSheet = workbook.addWorksheet("Comparison");
  comparisonSheet.columns = [
    { header: "PDF Part No", key: "pdfPartNo", width: 18 },
    { header: "PDF Brand", key: "pdfBrand", width: 12 },
    { header: "System Part No", key: "systemPartNo", width: 18 },
    { header: "Master Part No", key: "masterPartNo", width: 18 },
    { header: "System Brand", key: "systemBrand", width: 12 },
    { header: "Description", key: "description", width: 36 },
    { header: "PDF Qty", key: "pdfQty", width: 12 },
    { header: "System Qty", key: "systemQty", width: 12 },
    { header: "Variance", key: "variance", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Reason", key: "reason", width: 28 },
    { header: "PDF Page(s)", key: "pdfPages", width: 14 },
  ];

  input.rows.forEach((row) => {
    const excelRow = comparisonSheet.addRow(row);
    if (row.status === "Not in System") {
      styleNotInSystemRow(excelRow);
    }
  });
  styleHeaderRow(comparisonSheet);

  const systemOnlySheet = workbook.addWorksheet("System Stock Not in PDF");
  systemOnlySheet.columns = [
    { header: "Part No", key: "part_no", width: 18 },
    { header: "Master Part No", key: "master_part_no", width: 18 },
    { header: "Brand", key: "brand", width: 14 },
    { header: "Description", key: "description", width: 36 },
    { header: "Category", key: "category", width: 18 },
    { header: "System Qty", key: "current_stock", width: 12 },
  ];
  input.systemOnlyRows.forEach((row) =>
    systemOnlySheet.addRow({
      ...row,
      part_no: row.master_part_no,
      master_part_no: row.part_no,
    }),
  );
  styleHeaderRow(systemOnlySheet);

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 16 },
  ];
  const summaryRows: Array<[string, string | number]> = [
    ["Source PDF", input.fileName],
    ["PDF Pages Scanned", input.summary.pdfPages],
    ["PDF Text Lines Scanned", input.summary.pdfLinesParsed],
    ["PDF Items Parsed", input.summary.pdfItems],
    ["System Items Loaded", input.summary.systemItems],
    ["Matched", input.summary.matched],
    ["Over (PDF > System)", input.summary.over],
    ["Under (PDF < System)", input.summary.under],
    ["Not in System", input.summary.notInSystem],
    ["System Stock Not in PDF", input.summary.systemOnly],
    ["Generated At", new Date().toLocaleString()],
  ];
  summaryRows.forEach(([metric, value]) =>
    summarySheet.addRow({ metric, value }),
  );
  styleHeaderRow(summarySheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
