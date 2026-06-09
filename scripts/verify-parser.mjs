/**
 * Quick verification against STOCK_QTY.PDF using the same rules as stockPdfParser.ts
 */
import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

const HEADER_TOKEN_PATTERN =
  /^(sr\.?\s*no|s\.?\s*no|part\s*no|part\s*#|item\s*no|description|qty|quantity|stock|balance|total|page|brand|uom|rate|amount|price|location|min\.?\s*price|price\s*value)$/i;
const LOCATION_PATTERN = /^[A-Z]{1,2}\d+[A-Z]?$/i;
const hasCommaPrice = (t) => /\d,\d/.test(t);

function isLikelyPartNo(part) {
  if (part.length < 2 || part.length > 60) return false;
  if (/^total\s/i.test(part)) return false;
  if (!/[A-Za-z0-9]/.test(part)) return false;
  if (/^\d{1,2}$/.test(part)) return false;
  if (HEADER_TOKEN_PATTERN.test(part)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-\/\.\*xX_()\s]{0,58}$/.test(part);
}

function parsePlainInteger(value) {
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  const qty = parseInt(cleaned, 10);
  return Number.isFinite(qty) ? qty : null;
}

function rowText(cells) {
  return cells.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim();
}

function isMetaOrHeaderRow(cells) {
  const text = rowText(cells).toLowerCase();
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
  if (text.includes("location") && text.includes("stock") && text.includes("price")) return true;
  if (cells.length === 1) {
    const only = cells[0].str.trim();
    if (/^\d{1,3}(,\d{3})+$/.test(only)) return true;
    if (/^\d+$/.test(only) && only.length <= 2) return true;
  }
  return false;
}

function getCellNearX(cells, targetX, tolerance) {
  const matches = cells.filter((cell) => Math.abs(cell.x - targetX) <= tolerance);
  if (matches.length > 0) {
    return matches.sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
  }
  if (!cells.length) return null;
  const nearest = cells.reduce((best, cell) =>
    Math.abs(cell.x - targetX) < Math.abs(best.x - targetX) ? cell : best,
  );
  return Math.abs(nearest.x - targetX) <= tolerance * 1.6 ? nearest : null;
}

function buildColumnPositions(tableRows) {
  let partColumnX = null;
  let stockColumnX = null;
  for (const row of tableRows.slice(0, 20)) {
    const text = rowText(row.cells).toLowerCase();
    if (!text.includes("part") && !text.includes("stock") && !text.includes("location")) continue;
    for (const cell of row.cells) {
      const value = cell.str.trim().toLowerCase();
      if (value === "part no" || value === "partno" || value === "part") partColumnX = cell.x;
      if (value === "stock") stockColumnX = cell.x;
    }
  }
  if (partColumnX === null) {
    const headerish = tableRows.find((row) => rowText(row.cells).toLowerCase().includes("part no"));
    partColumnX = headerish?.cells[0]?.x ?? null;
  }
  return { partColumnX, stockColumnX };
}

function parseStockWithPriceLine(line, partNoFromCell) {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 3) return null;
  const tokens = trimmed.split(" ").filter(Boolean);
  if (tokens.length < 3) return null;
  const partNo = partNoFromCell?.trim() || tokens[0];
  if (!isLikelyPartNo(partNo)) return null;
  const firstCommaPriceIdx = tokens.findIndex(hasCommaPrice);
  if (firstCommaPriceIdx > 2) {
    for (let i = firstCommaPriceIdx - 1; i >= 2; i--) {
      if (LOCATION_PATTERN.test(tokens[i])) continue;
      const qty = parsePlainInteger(tokens[i]);
      if (qty !== null) return { partNo: partNo.trim(), qty };
    }
  }
  let locationIdx = -1;
  for (let i = 2; i < tokens.length; i++) {
    if (LOCATION_PATTERN.test(tokens[i])) { locationIdx = i; break; }
  }
  if (locationIdx >= 0 && locationIdx + 1 < tokens.length) {
    const qty = parsePlainInteger(tokens[locationIdx + 1]);
    if (qty !== null) return { partNo: partNo.trim(), qty };
  }
  for (let i = 2; i < tokens.length; i++) {
    if (LOCATION_PATTERN.test(tokens[i])) continue;
    if (hasCommaPrice(tokens[i])) break;
    const qty = parsePlainInteger(tokens[i]);
    if (qty !== null) return { partNo: partNo.trim(), qty };
  }
  return null;
}

function parseRowByColumns(row, partColumnX, stockColumnX) {
  const partCell = getCellNearX(row.cells, partColumnX, 40) ?? row.cells[0];
  const stockCell = getCellNearX(row.cells, stockColumnX, 42);
  if (!partCell || !stockCell) return null;
  const partNo = partCell.str.trim();
  if (!isLikelyPartNo(partNo)) return null;
  const qty = parsePlainInteger(stockCell.str);
  if (qty === null) return null;
  return { partNo, qty };
}

let total = 0;
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const lineMap = new Map();
  for (const rawItem of content.items) {
    if (!rawItem.str?.trim()) continue;
    const y = Math.round(rawItem.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: rawItem.transform[4], str: rawItem.str.trim() });
  }
  const tableRows = [...lineMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => ({ y, cells: cells.sort((a, b) => a.x - b.x) }))
    .filter((row) => row.cells.length > 0);

  const { partColumnX, stockColumnX } = buildColumnPositions(tableRows);
  const useColumns = partColumnX !== null && stockColumnX !== null;

  for (const row of tableRows) {
    if (isMetaOrHeaderRow(row.cells)) continue;
    const text = rowText(row.cells);
    if (!text || row.cells.length < 2) continue;
    const partCell =
      (partColumnX !== null ? getCellNearX(row.cells, partColumnX, 40) : null) ?? row.cells[0];
    let hit = null;
    if (useColumns) hit = parseRowByColumns(row, partColumnX, stockColumnX);
    if (!hit) hit = parseStockWithPriceLine(text, partCell?.str);
    if (hit) total++;
  }
}

console.log("Parsed line items:", total);
