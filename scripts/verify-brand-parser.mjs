import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

const HEADER_TOKEN_PATTERN =
  /^(sr\.?\s*no|s\.?\s*no|part\s*no|part\s*#|item\s*no|description|qty|quantity|stock|balance|total|page|brand|uom|rate|amount|price|location|min\.?\s*price|price\s*value)$/i;
const LOCATION_PATTERN = /^[A-Z]{1,2}\d+[A-Z]?$/i;

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

function getCellNearX(cells, targetX, tolerance) {
  const matches = cells.filter((c) => Math.abs(c.x - targetX) <= tolerance);
  if (matches.length) return matches.sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
  if (!cells.length) return null;
  const nearest = cells.reduce((best, c) => Math.abs(c.x - targetX) < Math.abs(best.x - targetX) ? c : best);
  return Math.abs(nearest.x - targetX) <= tolerance * 1.6 ? nearest : null;
}

function extractBrandFromRow(cells, brandColumnX, partCell) {
  const brandCell = brandColumnX != null ? getCellNearX(cells, brandColumnX, 35) : null;
  if (brandCell && brandCell !== partCell) {
    const brand = brandCell.str.trim();
    if (brand && !HEADER_TOKEN_PATTERN.test(brand)) return brand;
  }
  const partIdx = cells.indexOf(partCell);
  if (partIdx >= 0 && partIdx + 1 < cells.length) {
    const next = cells[partIdx + 1].str.trim();
    if (next && !HEADER_TOKEN_PATTERN.test(next) && !LOCATION_PATTERN.test(next) && parsePlainInteger(next) === null) return next;
  }
  return null;
}

function buildCols(tableRows) {
  let partX = null, brandX = null, stockX = null;
  for (const row of tableRows.slice(0, 20)) {
    const text = rowText(row.cells).toLowerCase();
    if (!text.includes("part") && !text.includes("stock") && !text.includes("location") && !text.includes("brand")) continue;
    for (const c of row.cells) {
      const v = c.str.trim().toLowerCase();
      if (v === "part no" || v === "part") partX = c.x;
      if (v === "brand") brandX = c.x;
      if (v === "stock") stockX = c.x;
    }
  }
  return { partX, brandX, stockX };
}

function isMeta(cells) {
  const text = rowText(cells).toLowerCase();
  if (/stock with price|part no.*brand|location.*stock.*price|page \d+ of|main ctg|sub ctg|upto date|^app :|^total\s+line\s+item|^\d{2}-[a-z]{3}-\d{2}/.test(text)) return true;
  if (cells.length === 1 && /^\d{1,3}(,\d{3})+$/.test(cells[0].str)) return true;
  return false;
}

const lines = [];
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
  const tableRows = [...lineMap.entries()].sort((a,b)=>b[0]-a[0]).map(([,cells]) => ({ cells: cells.sort((a,b)=>a.x-b.x) }));
  const { partX, brandX, stockX } = buildCols(tableRows);
  for (const row of tableRows) {
    if (isMeta(row.cells) || row.cells.length < 2) continue;
    const partCell = partX != null ? getCellNearX(row.cells, partX, 40) : row.cells[0];
    const stockCell = stockX != null ? getCellNearX(row.cells, stockX, 42) : null;
    if (!partCell || !stockCell || !isLikelyPartNo(partCell.str)) continue;
    const qty = parsePlainInteger(stockCell.str);
    if (qty === null) continue;
    const brand = extractBrandFromRow(row.cells, brandX, partCell);
    lines.push({ part: partCell.str, brand, qty });
  }
}

const byPartOnly = new Map();
const byPartBrand = new Map();
for (const l of lines) {
  const pk = l.part.toUpperCase().replace(/\s+/g, "");
  if (!byPartOnly.has(pk)) byPartOnly.set(pk, new Set());
  byPartOnly.get(pk).add((l.brand || "").toUpperCase());
  const pbk = `${pk}|${(l.brand || "").toUpperCase()}`;
  byPartBrand.set(pbk, (byPartBrand.get(pbk) || 0) + 1);
}

const multiBrand = [...byPartOnly.entries()].filter(([,b]) => b.size > 1);
const missingBrand = lines.filter(l => !l.brand);

console.log("Lines:", lines.length);
console.log("Unique part+brand:", byPartBrand.size);
console.log("Multi-brand part numbers:", multiBrand.length);
console.log("Lines missing brand:", missingBrand.length);
if (missingBrand.length) console.log("Samples:", missingBrand.slice(0, 5));
