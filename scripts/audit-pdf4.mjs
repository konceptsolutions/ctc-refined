import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

const LOCATION_PATTERN = /^[A-Z]{1,2}\d+[A-Z]?$/i;
const hasCommaPrice = (t) => /\d,\d/.test(t);

function parseQty(v) {
  const cleaned = v.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

function nearestCell(cells, targetX, tol) {
  const matches = cells.filter((c) => Math.abs(c.x - targetX) <= tol);
  if (!matches.length) return null;
  return matches.sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
}

function isLikelyPartNo(p) {
  if (!p || p.length < 2) return false;
  if (/^total\s/i.test(p)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-\/\.\*xX_]{0,38}$/.test(p);
}

function buildCols(rows) {
  let partX = null, stockX = null;
  for (const row of rows.slice(0, 20)) {
    for (const c of row.cells) {
      const v = c.str.toLowerCase();
      if (v === "part no" || v === "part") partX = c.x;
      if (v === "stock") stockX = c.x;
    }
  }
  return { partX, stockX };
}

function isMeta(text, cells) {
  const t = text.toLowerCase();
  if (/stock with price|part no.*brand|location.*stock.*price|page \d+ of|main ctg|sub ctg|upto date|^app :/.test(t)) return true;
  if (/^total\s+line\s+item/i.test(t)) return true;
  if (cells.length === 1 && /^\d{1,3}(,\d{3})+$/.test(cells[0].str)) return true;
  if (/^\d{2}-[a-z]{3}-\d{2}/i.test(text)) return true;
  return false;
}

function parseFallback(text) {
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length < 3 || !isLikelyPartNo(tokens[0])) return null;
  const firstComma = tokens.findIndex(hasCommaPrice);
  if (firstComma > 2) {
    for (let i = firstComma - 1; i >= 2; i--) {
      if (LOCATION_PATTERN.test(tokens[i])) continue;
      const q = parseQty(tokens[i]);
      if (q !== null) return { partNo: tokens[0], qty: q };
    }
  }
  for (let i = 2; i < tokens.length; i++) {
    if (LOCATION_PATTERN.test(tokens[i])) {
      const q = parseQty(tokens[i + 1]);
      if (q !== null) return { partNo: tokens[0], qty: q };
    }
  }
  // Short rows: part brand desc... stock (last numeric token before prices)
  for (let i = tokens.length - 1; i >= 2; i--) {
    if (LOCATION_PATTERN.test(tokens[i])) continue;
    const q = parseQty(tokens[i]);
    if (q !== null) return { partNo: tokens[0], qty: q };
  }
  return null;
}

function parseRow(row, partX, stockX) {
  if (partX != null && stockX != null) {
    const partCell = nearestCell(row.cells, partX, 40) || row.cells[0];
    const stockCell = nearestCell(row.cells, stockX, 42);
    if (partCell && stockCell) {
      const q = parseQty(stockCell.str);
      if (q !== null && isLikelyPartNo(partCell.str)) return { partNo: partCell.str, qty: q };
    }
  }
  return parseFallback(row.text);
}

let failed = [];
let parsed = 0;

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const lineMap = new Map();
  for (const raw of content.items) {
    if (!raw.str?.trim()) continue;
    const y = Math.round(raw.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: raw.transform[4], str: raw.str.trim() });
  }
  const rows = [...lineMap.values()].map((cells) => ({
    cells: cells.sort((a, b) => a.x - b.x),
    text: cells.map((c) => c.str).join(" "),
  }));
  const { partX, stockX } = buildCols(rows);
  for (const row of rows) {
    if (isMeta(row.text, row.cells)) continue;
    if (row.cells.length < 2) continue;
    const first = row.cells[0]?.str?.trim();
    if (!first || !/^[A-Za-z0-9]/.test(first)) continue;
    if (!isLikelyPartNo(first)) continue;
    const hit = parseRow(row, partX, stockX);
    if (hit) parsed++;
    else failed.push({ p, text: row.text, cells: row.cells.map(c => `[${c.x.toFixed(0)}]${c.str}`).join(' ') });
  }
}

console.log("Parsed:", parsed);
console.log("Failed:", failed.length);
failed.forEach(f => console.log(`P${f.p}: ${f.text}\n  ${f.cells}`));
