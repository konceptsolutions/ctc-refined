import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfStockRow {
  partNo: string;
  qty: number;
  pages: number[];
}

type TextCell = {
  x: number;
  str: string;
};

type TableRow = {
  y: number;
  cells: TextCell[];
};

const HEADER_PATTERN =
  /^(sr\.?\s*no|s\.?\s*no|part\s*no|part\s*#|item\s*no|description|qty|quantity|stock|balance|total|page|brand|uom|rate|amount|price|location|min\.?\s*price)/i;

const LOCATION_PATTERN = /^[A-Z]{1,2}\d+[A-Z]?$/i;

const STOCK_COLUMN_TOLERANCE = 28;
const PART_COLUMN_TOLERANCE = 35;

const normalizePartNo = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, "");

const isLikelyPartNo = (value: string) => {
  const part = value.trim();
  if (part.length < 2 || part.length > 40) return false;
  if (!/[A-Za-z0-9]/.test(part)) return false;
  if (/^\d{1,2}$/.test(part)) return false;
  if (HEADER_PATTERN.test(part)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-\/\.\*xX_]{0,38}$/.test(part);
};

const parsePlainInteger = (value: string): number | null => {
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const qty = parseInt(cleaned, 10);
  return Number.isFinite(qty) && qty >= 0 ? qty : null;
};

/** Fallback for "STOCK WITH PRICE" style rows: Part | Brand | Description | Location | Stock | Price... */
export const parseStockWithPriceLine = (
  line: string,
): { partNo: string; qty: number } | null => {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 3) return null;
  if (/stock\s+with\s+price/i.test(trimmed)) return null;
  if (HEADER_PATTERN.test(trimmed.split(" ")[0] || "")) return null;

  const tokens = trimmed.split(" ").filter(Boolean);
  if (tokens.length < 6) return null;

  const partNo = tokens[0];
  if (!isLikelyPartNo(partNo)) return null;

  let locationIdx = -1;
  for (let i = 2; i < tokens.length; i += 1) {
    if (LOCATION_PATTERN.test(tokens[i])) {
      locationIdx = i;
      break;
    }
  }

  if (locationIdx < 0 || locationIdx + 1 >= tokens.length) return null;

  const qty = parsePlainInteger(tokens[locationIdx + 1]);
  if (qty === null) return null;

  return { partNo: partNo.trim(), qty };
};

type TextItem = {
  str: string;
  transform: number[];
};

const extractPageTableRows = async (
  page: pdfjsLib.PDFPageProxy,
): Promise<TableRow[]> => {
  const content = await page.getTextContent();
  const lineMap = new Map<number, TextCell[]>();

  for (const rawItem of content.items) {
    const item = rawItem as TextItem;
    if (!item?.str?.trim()) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y)!.push({ x, str: item.str.trim() });
  }

  return [...lineMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => ({
      y,
      cells: cells.sort((a, b) => a.x - b.x),
    }))
    .filter((row) => row.cells.length > 0);
};

const rowText = (row: TableRow) =>
  row.cells
    .map((cell) => cell.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const isHeaderRow = (row: TableRow) => {
  const text = rowText(row).toLowerCase();
  return (
    text.includes("part") &&
    text.includes("stock") &&
    (text.includes("brand") || text.includes("description"))
  );
};

const findColumnX = (row: TableRow, matchers: RegExp[]): number | null => {
  for (const cell of row.cells) {
    const value = cell.str.trim().toLowerCase();
    if (matchers.some((matcher) => matcher.test(value))) {
      return cell.x;
    }
  }
  return null;
};

const getCellNearX = (row: TableRow, targetX: number, tolerance: number) => {
  const matches = row.cells.filter(
    (cell) => Math.abs(cell.x - targetX) <= tolerance,
  );
  if (matches.length > 0) {
    return matches.sort(
      (a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX),
    )[0];
  }

  if (row.cells.length === 0) return null;
  const nearest = row.cells.reduce((best, cell) =>
    Math.abs(cell.x - targetX) < Math.abs(best.x - targetX) ? cell : best,
  );
  return Math.abs(nearest.x - targetX) <= tolerance * 1.5 ? nearest : null;
};

const parseRowByColumns = (
  row: TableRow,
  partColumnX: number,
  stockColumnX: number,
): { partNo: string; qty: number } | null => {
  const partCell = getCellNearX(row, partColumnX, PART_COLUMN_TOLERANCE);
  const stockCell = getCellNearX(row, stockColumnX, STOCK_COLUMN_TOLERANCE);
  if (!partCell || !stockCell) return null;

  const partNo = partCell.str.trim();
  if (!isLikelyPartNo(partNo)) return null;

  const qty = parsePlainInteger(stockCell.str);
  if (qty === null) return null;

  return { partNo, qty };
};

const parsePageRows = (
  tableRows: TableRow[],
): Array<{ partNo: string; qty: number }> => {
  const headerRow = tableRows.find(isHeaderRow);
  if (!headerRow) {
    return tableRows
      .map((row) => parseStockWithPriceLine(rowText(row)))
      .filter((parsed): parsed is { partNo: string; qty: number } => !!parsed);
  }

  const partColumnX =
    findColumnX(headerRow, [/^part\s*no$/i, /^part$/i, /^partno$/i]) ??
    headerRow.cells[0]?.x ??
    null;
  const stockColumnX = findColumnX(headerRow, [/^stock$/i]);

  if (partColumnX === null || stockColumnX === null) {
    return tableRows
      .map((row) => parseStockWithPriceLine(rowText(row)))
      .filter((parsed): parsed is { partNo: string; qty: number } => !!parsed);
  }

  const parsedRows: Array<{ partNo: string; qty: number }> = [];
  let passedHeader = false;

  for (const row of tableRows) {
    if (!passedHeader) {
      if (row === headerRow) passedHeader = true;
      continue;
    }

    if (isHeaderRow(row)) continue;

    const text = rowText(row);
    if (!text || /stock\s+with\s+price/i.test(text)) continue;
    if (/^page\s+\d+\s+of\s+\d+/i.test(text)) continue;
    if (/^upto\s+date/i.test(text)) continue;

    const byColumns = parseRowByColumns(row, partColumnX, stockColumnX);
    if (byColumns) {
      parsedRows.push(byColumns);
      continue;
    }

    const fallback = parseStockWithPriceLine(text);
    if (fallback) parsedRows.push(fallback);
  }

  return parsedRows;
};

export const extractStockRowsFromPdf = async (
  file: File,
): Promise<{ rows: PdfStockRow[]; pageCount: number; rawLineCount: number }> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const aggregated = new Map<string, PdfStockRow>();
  let rawLineCount = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const tableRows = await extractPageTableRows(page);
    rawLineCount += tableRows.length;

    const parsedRows = parsePageRows(tableRows);
    for (const parsed of parsedRows) {
      const key = normalizePartNo(parsed.partNo);
      const existing = aggregated.get(key);
      if (existing) {
        existing.qty += parsed.qty;
        if (!existing.pages.includes(pageNumber)) {
          existing.pages.push(pageNumber);
        }
      } else {
        aggregated.set(key, {
          partNo: parsed.partNo,
          qty: parsed.qty,
          pages: [pageNumber],
        });
      }
    }
  }

  return {
    rows: [...aggregated.values()].sort((a, b) =>
      a.partNo.localeCompare(b.partNo),
    ),
    pageCount: pdf.numPages,
    rawLineCount,
  };
};

// Kept for tests / backwards compatibility
export const parseStockLine = parseStockWithPriceLine;
