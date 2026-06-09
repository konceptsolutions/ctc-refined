import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

for (const pg of [62, 64]) {
  const page = await pdf.getPage(pg);
  const content = await page.getTextContent();
  const lineMap = new Map();
  for (const raw of content.items) {
    if (!raw.str?.trim()) continue;
    const y = Math.round(raw.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: raw.transform[4], str: raw.str.trim() });
  }
  console.log(`\n=== Page ${pg} ===`);
  for (const cells of lineMap.values()) {
    const sorted = cells.sort((a, b) => a.x - b.x);
    const text = sorted.map((c) => c.str).join(" ");
    if (/GIFTS|COOLANT\(3LTR\)/i.test(text)) {
      console.log(text);
      console.log("  cells:", sorted.map(c => `[${c.x.toFixed(0)}]${c.str}`).join(" | "));
    }
  }
}
