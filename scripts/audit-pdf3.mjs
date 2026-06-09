import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

function isMeta(text, cells) {
  const t = text.toLowerCase();
  if (/stock with price|part no.*brand|location.*stock.*price|page \d+ of|main ctg|sub ctg|upto date|^app :/.test(t)) return true;
  if (cells.length === 1 && /^\d{1,3}(,\d{3})+$/.test(cells[0].str)) return true;
  if (/^\d{2}-[a-z]{3}-\d{2}/i.test(text)) return true;
  return false;
}

let allRows = [];
let metaRows = 0;

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
  for (const cells of lineMap.values()) {
    const sorted = cells.sort((a, b) => a.x - b.x);
    const text = sorted.map((c) => c.str).join(" ");
    if (isMeta(text, sorted)) { metaRows++; continue; }
    if (sorted.length < 2) continue;
    const first = sorted[0]?.str?.trim();
    if (!first || !/^[A-Za-z0-9]/.test(first)) continue;
    allRows.push({ p, text, n: sorted.length });
  }
}

console.log("Non-meta rows with part-like start:", allRows.length);
console.log("Meta rows skipped:", metaRows);

// rows with unusual cell counts
const byLen = {};
for (const r of allRows) byLen[r.n] = (byLen[r.n] || 0) + 1;
console.log("By cell count:", byLen);

// show shortest rows
allRows.filter(r => r.n <= 4).slice(0, 20).forEach(r => console.log(`P${r.p} [${r.n}]: ${r.text}`));
