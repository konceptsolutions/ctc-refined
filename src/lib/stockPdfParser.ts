import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Prefer the Vite-bundled worker (correct MIME + cache-busted). Fall back to /public copy.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc || "/pdf.worker.min.mjs";

export interface PdfStockRow {
  partNo: string;
  brand: string | null;
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

type ColumnPositions = {
  partColumnX: number | null;
  brandColumnX: number | null;
  stockColumnX: number | null;
};

const HEADER_TOKEN_PATTERN =
  /^(sr\.?\s*no|s\.?\s*no|part\s*no|part\s*#|item\s*no|description|qty|quantity|stock|balance|total|page|brand|uom|rate|amount|price|location|min\.?\s*price|price\s*value)$/i;

const LOCATION_PATTERN = /^[A-Z]{1,2}\d+[A-Z]?$/i;

const STOCK_COLUMN_TOLERANCE = 42;
const PART_COLUMN_TOLERANCE = 40;
const BRAND_COLUMN_TOLERANCE = 35;

const isLikelyPartNo = (value: string) => {
  const part = value.trim();
  if (part.length < 2 || part.length > 60) return false;
  if (/^total\s/i.test(part)) return false;
  if (!/[A-Za-z0-9]/.test(part)) return false;
  if (/^\d{1,2}$/.test(part)) return false;
  if (HEADER_TOKEN_PATTERN.test(part)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-\/\.\*xX_()\s]{0,58}$/.test(part);
};

const parsePlainInteger = (value: string): number | null => {
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  const qty = parseInt(cleaned, 10);
  return Number.isFinite(qty) ? qty : null;
};

const hasCommaPrice = (token: string) => /\d,\d/.test(token);

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

/** Header is often split across rows: "Part No Brand..." and "Location Stock Price..." */
const buildColumnPositions = (tableRows: TableRow[]): ColumnPositions => {
  let partColumnX: number | null = null;
  let brandColumnX: number | null = null;
  let stockColumnX: number | null = null;

  for (const row of tableRows.slice(0, 20)) {
    const text = rowText(row).toLowerCase();
    if (
      !text.includes("part") &&
      !text.includes("stock") &&
      !text.includes("location") &&
      !text.includes("brand")
    ) {
      continue;
    }

    for (const cell of row.cells) {
      const value = cell.str.trim().toLowerCase();
      if (value === "part no" || value === "partno" || value === "part") {
        partColumnX = cell.x;
      }
      if (value === "brand") {
        brandColumnX = cell.x;
      }
      if (value === "stock") {
        stockColumnX = cell.x;
      }
    }
  }

  if (partColumnX === null) {
    const headerish = tableRows.find((row) =>
      rowText(row).toLowerCase().includes("part no"),
    );
    partColumnX = headerish?.cells[0]?.x ?? null;
    brandColumnX = brandColumnX ?? headerish?.cells[1]?.x ?? null;
  }

  return { partColumnX, brandColumnX, stockColumnX };
};

const extractBrandFromRow = (
  row: TableRow,
  brandColumnX: number | null,
  partCell: TextCell,
): string | null => {
  const brandCell =
    brandColumnX !== null
      ? getCellNearX(row, brandColumnX, BRAND_COLUMN_TOLERANCE)
      : null;
  if (brandCell && brandCell !== partCell) {
    const brand = brandCell.str.trim();
    if (brand && !HEADER_TOKEN_PATTERN.test(brand)) {
      return brand;
    }
  }

  const partIdx = row.cells.indexOf(partCell);
  if (partIdx >= 0 && partIdx + 1 < row.cells.length) {
    const next = row.cells[partIdx + 1].str.trim();
    if (next && !HEADER_TOKEN_PATTERN.test(next) && !LOCATION_PATTERN.test(next)) {
      const qty = parsePlainInteger(next);
      if (qty === null) return next;
    }
  }

  return null;
};

const isMetaOrHeaderRow = (row: TableRow) => {
  const text = rowText(row).toLowerCase();
  if (!text) return true;
  if (/stock\s+with\s+price/i.test(text)) return true;
  if (/^main\s+ctg/i.test(text)) return true;
  if (/^sub\s+ctg/i.test(text)) return true;
  if (/^app\s*:/i.test(text)) return true;
  if (/^upto\s+date/i.test(text)) return true;
  if (/^page\s+\d+\s+of\s+\d+/i.test(text)) return true;
  if (/^\d{2}-[a-z]{3}-\d{2}/i.test(text)) return true;
  if (/^total\s+line\s+item/i.test(text)) return true;
  if (text.includes("part no") && text.includes("brand")) return true;
  if (text.includes("location") && text.includes("stock") && text.includes("price")) {
    return true;
  }
  if (row.cells.length === 1) {
    const only = row.cells[0].str.trim();
    if (/^\d{1,3}(,\d{3})+$/.test(only)) return true;
    if (/^\d+$/.test(only) && only.length <= 2) return true;
  }
  return false;
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
  return Math.abs(nearest.x - targetX) <= tolerance * 1.6 ? nearest : null;
};

const parseRowByColumns = (
  row: TableRow,
  partColumnX: number,
  brandColumnX: number | null,
  stockColumnX: number,
): { partNo: string; brand: string | null; qty: number } | null => {
  const partCell =
    getCellNearX(row, partColumnX, PART_COLUMN_TOLERANCE) ?? row.cells[0];
  const stockCell = getCellNearX(row, stockColumnX, STOCK_COLUMN_TOLERANCE);
  if (!partCell || !stockCell) return null;

  const partNo = partCell.str.trim();
  if (!isLikelyPartNo(partNo)) return null;

  const qty = parsePlainInteger(stockCell.str);
  if (qty === null) return null;

  return {
    partNo,
    brand: extractBrandFromRow(row, brandColumnX, partCell),
    qty,
  };
};

/** Fallback when column positions fail or row has no location column */
export const parseStockWithPriceLine = (
  line: string,
  partNoFromCell?: string,
  brandFromCell?: string | null,
): { partNo: string; brand: string | null; qty: number } | null => {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 3) return null;
  if (/stock\s+with\s+price/i.test(trimmed)) return null;

  const tokens = trimmed.split(" ").filter(Boolean);
  if (tokens.length < 3) return null;

  const partNo = partNoFromCell?.trim() || tokens[0];
  if (!isLikelyPartNo(partNo)) return null;

  const partTokenCount = partNoFromCell
    ? partNo.split(" ").filter(Boolean).length
    : 1;
  const brand =
    brandFromCell?.trim() ||
    (tokens.length > partTokenCount &&
    !HEADER_TOKEN_PATTERN.test(tokens[partTokenCount]) &&
    !LOCATION_PATTERN.test(tokens[partTokenCount]) &&
    parsePlainInteger(tokens[partTokenCount]) === null
      ? tokens[partTokenCount]
      : null);

  const firstCommaPriceIdx = tokens.findIndex((token) => hasCommaPrice(token));

  if (firstCommaPriceIdx > 2) {
    for (let i = firstCommaPriceIdx - 1; i >= 2; i -= 1) {
      const token = tokens[i];
      if (LOCATION_PATTERN.test(token)) continue;
      const qty = parsePlainInteger(token);
      if (qty !== null) {
        return { partNo: partNo.trim(), brand: brand || null, qty };
      }
    }
  }

  let locationIdx = -1;
  for (let i = partTokenCount + (brand ? 1 : 0); i < tokens.length; i += 1) {
    if (LOCATION_PATTERN.test(tokens[i])) {
      locationIdx = i;
      break;
    }
  }

  if (locationIdx >= 0 && locationIdx + 1 < tokens.length) {
    const qty = parsePlainInteger(tokens[locationIdx + 1]);
    if (qty !== null) {
      return { partNo: partNo.trim(), brand: brand || null, qty };
    }
  }

  for (let i = partTokenCount + (brand ? 1 : 0); i < tokens.length; i += 1) {
    if (LOCATION_PATTERN.test(tokens[i])) continue;
    if (hasCommaPrice(tokens[i])) break;
    const qty = parsePlainInteger(tokens[i]);
    if (qty !== null) {
      return { partNo: partNo.trim(), brand: brand || null, qty };
    }
  }

  return null;
};

const parsePageRows = (
  tableRows: TableRow[],
): Array<{ partNo: string; brand: string | null; qty: number }> => {
  const { partColumnX, brandColumnX, stockColumnX } =
    buildColumnPositions(tableRows);
  const useColumns = partColumnX !== null && stockColumnX !== null;
  const parsedRows: Array<{ partNo: string; brand: string | null; qty: number }> =
    [];

  for (const row of tableRows) {
    if (isMetaOrHeaderRow(row)) continue;

    const text = rowText(row);
    if (!text || row.cells.length < 2) continue;

    const partCell =
      (partColumnX !== null
        ? getCellNearX(row, partColumnX, PART_COLUMN_TOLERANCE)
        : null) ?? row.cells[0];
    const brand =
      partCell !== null
        ? extractBrandFromRow(row, brandColumnX, partCell)
        : null;

    if (useColumns) {
      const byColumns = parseRowByColumns(
        row,
        partColumnX!,
        brandColumnX,
        stockColumnX!,
      );
      if (byColumns) {
        parsedRows.push(byColumns);
        continue;
      }
    }

    const fallback = parseStockWithPriceLine(text, partCell?.str, brand);
    if (fallback) parsedRows.push(fallback);
  }

  return parsedRows;
};

export const extractStockRowsFromPdf = async (
  file: File,
): Promise<{ rows: PdfStockRow[]; pageCount: number; parsedLineCount: number }> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rows: PdfStockRow[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const tableRows = await extractPageTableRows(page);
    const parsedRows = parsePageRows(tableRows);

    for (const parsed of parsedRows) {
      rows.push({
        partNo: parsed.partNo,
        brand: parsed.brand,
        qty: parsed.qty,
        pages: [pageNumber],
      });
    }
  }

  return {
    rows,
    pageCount: pdf.numPages,
    parsedLineCount: rows.length,
  };
};

export const parseStockLine = parseStockWithPriceLine;
