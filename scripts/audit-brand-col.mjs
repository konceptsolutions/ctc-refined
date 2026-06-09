import * as fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = "c:/Users/Ksol/Downloads/STOCK_QTY.PDF";
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

const page = await pdf.getPage(1);
const content = await page.getTextContent();
for (const raw of content.items) {
  if (/brand|part/i.test(raw.str)) {
    console.log(`[${raw.transform[4].toFixed(0)}] ${raw.str}`);
  }
}
