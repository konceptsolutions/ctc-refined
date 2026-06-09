import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

const LOCATION_PATTERN = /^[A-Z]{1,2}\d+[A-Z]?$/i;
const hasCommaPrice = (t) => /\d,\d/.test(t);
const parsePlain = (v) => {
  const c = v.replace(/,/g, "");
  return /^\d+$/.test(c) ? parseInt(c, 10) : null;
};
const isLikelyPartNo = (p) =>
  p && p.length >= 2 && p.length <= 40 && /^[A-Za-z0-9][A-Za-z0-9\-\/\.\*xX_]{0,38}$/.test(p);

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
  if (cells.length === 1 && /^\d{1,3}(,\d{3})+$/.test(cells[0].str)) return true;
  return false;
}

function parseFallback(text) {
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length < 4 || !isLikelyPartNo(tokens[0])) return null;
  const firstComma = tokens.findIndex(hasCommaPrice);
  if (firstComma > 2) {
    for (let i = firstComma - 1; i >= 2; i--) {
      if (LOCATION_PATTERN.test(tokens[i])) continue;
      const q = parsePlain(tokens[i]);
      if (q !== null) return { partNo: tokens[0], qty: q };
    }
  }
  for (let i = 2; i < tokens.length; i++) {
    if (LOCATION_PATTERN.test(tokens[i])) {
      const q = parsePlain(tokens[i + 1]);
      if (q !== null) return { partNo: tokens[0], qty: q };
    }
  }
  return null;
}

function parseCol(row, partX, stockX) {
  const partCell = row.cells.find((c) => Math.abs(c.x - partX) <= 40) || row.cells[0];
  const stockCell = row.cells.find((c) => Math.abs(c.x - stockX) <= 42);
  if (!partCell || !stockCell) return null;
  const q = parsePlain(stockCell.str);
  if (q === null || !isLikelyPartNo(partCell.str)) return null;
  return { partNo: partCell.str, qty: q };
}

let parsed = [];
let failed = [];

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

    let hit = null;
    if (partX != null && stockX != null) hit = parseCol(row, partX, stockX);
    if (!hit) hit = parseFallback(row.text);
    if (hit) parsed.push({ ...hit, page: p });
    else if (isLikelyPartNo(first) && failed.length < 120) {
      failed.push({ page: p, text: row.text, cells: row.cells.map((c) => `[${c.x.toFixed(0)}]${c.str}`).join(" ") });
    }
  }
}

console.log("Parsed:", parsed.length);
console.log("Failed candidate rows:", failed.length);
console.log("\nFailed samples:");
failed.slice(0, 40).forEach((f) => {
  console.log(`P${f.page}: ${f.text}`);
  console.log(`  ${f.cells}`);
});
