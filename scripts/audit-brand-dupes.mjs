import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

function rowText(cells) {
  return cells.map((c) => c.str).join(" ");
}

function getCellNearX(cells, targetX, tolerance) {
  const matches = cells.filter((c) => Math.abs(c.x - targetX) <= tolerance);
  if (!matches.length) return null;
  return matches.sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
}

function buildCols(tableRows) {
  let partX = null, brandX = null, stockX = null;
  for (const row of tableRows.slice(0, 20)) {
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
  const tableRows = [...lineMap.values()].map((cells) => cells.sort((a, b) => a.x - b.x));
  const { partX, brandX, stockX } = buildCols(tableRows.map(c => ({ cells: c })));
  for (const cells of tableRows) {
    if (isMeta(cells) || cells.length < 2) continue;
    const partCell = partX != null ? getCellNearX(cells, partX, 40) : cells[0];
    const brandCell = brandX != null ? getCellNearX(cells, brandX, 35) : cells[1];
    const stockCell = stockX != null ? getCellNearX(cells, stockX, 42) : null;
    if (!partCell) continue;
    const part = partCell.str.trim();
    const brand = brandCell?.str?.trim() || "";
    const key = part.toUpperCase().replace(/\s+/g, "");
    lines.push({ p, part, brand, key, text: rowText(cells) });
  }
}

const byPartOnly = new Map();
for (const line of lines) {
  if (!byPartOnly.has(line.key)) byPartOnly.set(line.key, new Set());
  byPartOnly.get(line.key).add(line.brand.toUpperCase());
}

const multiBrand = [...byPartOnly.entries()].filter(([, brands]) => brands.size > 1);
console.log("Total parsed-ish lines:", lines.length);
console.log("Unique part keys:", byPartOnly.size);
console.log("Part keys with multiple brands:", multiBrand.length);
console.log("\nSample multi-brand parts:");
multiBrand.slice(0, 15).forEach(([part, brands]) => {
  const samples = lines.filter(l => l.key === part).slice(0, 4);
  console.log(`\n${part}: brands=[${[...brands].join(", ")}]`);
  samples.forEach(s => console.log(`  P${s.p}: ${s.text}`));
});
