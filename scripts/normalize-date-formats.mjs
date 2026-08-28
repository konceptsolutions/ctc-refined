import fs from "fs";
import path from "path";

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "generated"].includes(entry.name)) {
        walk(full, files);
      }
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const displayPatterns = [
  [/format\(([^,\n]+?),\s*["']dd\/MM\/yyyy["']\)/g, "formatUiDate($1)"],
  [/format\(([^,\n]+?),\s*["']MM\/dd\/yyyy["']\)/g, "formatUiDate($1)"],
  [
    /format\(([^,\n]+?),\s*["']dd\/MM\/yyyy HH:mm["']\)/g,
    "format($1, 'MM-dd-yyyy HH:mm')",
  ],
  [/<span>DD\/MM\/YYYY<\/span>/g, "<span>{UI_DATE_PLACEHOLDER}</span>"],
  [/["']DD\/MM\/YYYY["']/g, "UI_DATE_PLACEHOLDER"],
  [/<span>dd\/mm\/yyyy<\/span>/g, "<span>{UI_DATE_PLACEHOLDER}</span>"],
  [/["']dd\/mm\/yyyy["']/g, "UI_DATE_PLACEHOLDER"],
  [
    /\.toLocaleDateString\(\s*["']en-GB["']\s*\)/g,
    ".toLocaleDateString('en-US')",
  ],
];

const importBoth =
  'import { formatUiDate, UI_DATE_PLACEHOLDER } from "@/utils/dateUtils";';
const importFormatOnly = 'import { formatUiDate } from "@/utils/dateUtils";';
const importPlaceholderOnly =
  'import { UI_DATE_PLACEHOLDER } from "@/utils/dateUtils";';

let changed = 0;
for (const file of walk("src")) {
  if (file.includes("dateUtils.ts") || file.includes("date-input.tsx")) continue;
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  for (const [re, rep] of displayPatterns) {
    content = content.replace(re, rep);
  }
  if (content === original) continue;

  const usesFormatUiDate = content.includes("formatUiDate(");
  const usesPlaceholder = content.includes("UI_DATE_PLACEHOLDER");
  if ((usesFormatUiDate || usesPlaceholder) && !content.includes("@/utils/dateUtils")) {
    let line = importBoth;
    if (usesFormatUiDate && !usesPlaceholder) line = importFormatOnly;
    if (!usesFormatUiDate && usesPlaceholder) line = importPlaceholderOnly;
    const importMatch = content.match(/^import .+$/m);
    if (importMatch) {
      const idx = content.indexOf(importMatch[0]);
      content = content.slice(0, idx) + line + "\n" + content.slice(idx);
    } else {
      content = line + "\n" + content;
    }
  }
  fs.writeFileSync(file, content);
  changed++;
  console.log("updated", file);
}
console.log("files changed:", changed);
