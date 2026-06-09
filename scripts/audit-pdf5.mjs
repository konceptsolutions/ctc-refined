import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

function isMeta(text, cells) {
  const t = text.toLowerCase();
  if (/stock with price|part no.*brand|location.*stock.*price|page \d+ of|main ctg|sub ctg|upto date|^app :/.test(t)) return true;
  if (/^total\s+line\s+item/i.test(t)) return true;
  if (cells.length === 1 && /^\d{1,3}(,\d{3})+$/.test(cells[0].str)) return true;
  if (/^\d{2}-[a-z]{3}-\d{2}/i.test(text)) return true;
  return false;
}

function isLikelyPartNo(p) {
  if (!p || p.length < 2) return false;
  if (/^total\s/i.test(p)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-\/\.\*xX_]{0,38}$/.test(p);
}

let skipped = { meta: 0, short: 0, noStart: 0, badPart: 0, parsed: 0 };
let badPartSamples = [];

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
    if (isMeta(text, sorted)) { skipped.meta++; continue; }
    if (sorted.length < 2) { skipped.short++; continue; }
    const first = sorted[0]?.str?.trim();
    if (!first || !/^[A-Za-z0-9]/.test(first)) { skipped.noStart++; continue; }
    if (!isLikelyPartNo(first)) { skipped.badPart++; if (badPartSamples.length < 20) badPartSamples.push({p,text}); continue; }
    skipped.parsed++;
  }
}

console.log(skipped);
badPartSamples.forEach(s => console.log(`P${s.p}: ${s.text}`));
