/**
 * Generate temporary PDF/Excel exports for the AI assistant.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const EXPORT_DIR = path.join(process.cwd(), "tmp", "ai-exports");
const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_EXPORT_ROWS = 200;

export type AiExportAttachment = {
  id: string;
  fileName: string;
  format: "excel" | "pdf";
  mimeType: string;
  downloadPath: string;
  rowCount: number;
  title: string;
};

function ensureDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

function cleanupOldFiles() {
  try {
    ensureDir();
    const now = Date.now();
    for (const name of fs.readdirSync(EXPORT_DIR)) {
      const full = path.join(EXPORT_DIR, name);
      const st = fs.statSync(full);
      if (now - st.mtimeMs > TTL_MS) {
        fs.unlinkSync(full);
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function sanitizeFilePart(s: string) {
  return String(s || "export")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 60);
}

function flattenRows(
  rows: Record<string, unknown>[],
  columns?: string[],
): { headers: string[]; matrix: (string | number)[][] } {
  const headers =
    columns && columns.length
      ? columns
      : Array.from(
          rows.reduce((set, row) => {
            Object.keys(row || {}).forEach((k) => set.add(k));
            return set;
          }, new Set<string>()),
        );

  const matrix = rows.slice(0, MAX_EXPORT_ROWS).map((row) =>
    headers.map((h) => {
      const v = row?.[h];
      if (v == null) return "";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "object") return JSON.stringify(v);
      if (typeof v === "number") return v;
      return String(v);
    }),
  );

  return { headers, matrix };
}

async function writeExcel(
  filePath: string,
  title: string,
  headers: string[],
  matrix: (string | number)[][],
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Koncepts AI";
  const ws = wb.addWorksheet("Data");
  ws.addRow([title]);
  ws.addRow([`Generated: ${new Date().toISOString()}`]);
  ws.addRow([]);
  ws.addRow(headers);
  for (const row of matrix) ws.addRow(row);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(4).font = { bold: true };
  ws.columns = headers.map(() => ({ width: 18 }));
  await wb.xlsx.writeFile(filePath);
}

function writePdf(
  filePath: string,
  title: string,
  headers: string[],
  matrix: (string | number)[][],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      layout: headers.length > 6 ? "landscape" : "portrait",
    });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(14).text(title, { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#555").text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();
    doc.fillColor("#000");

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colCount = Math.max(headers.length, 1);
    const colWidth = pageWidth / colCount;
    const startX = doc.page.margins.left;

    const drawRow = (cells: (string | number)[], bold = false) => {
      const y = doc.y;
      if (y > doc.page.height - 50) {
        doc.addPage();
      }
      const rowY = doc.y;
      cells.forEach((cell, i) => {
        const text = String(cell ?? "").slice(0, 40);
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(8)
          .text(text, startX + i * colWidth, rowY, {
            width: colWidth - 4,
            lineBreak: false,
          });
      });
      doc.moveDown(0.8);
    };

    drawRow(headers, true);
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + pageWidth, doc.y)
      .strokeColor("#ccc")
      .stroke();
    doc.moveDown(0.3);

    for (const row of matrix) drawRow(row);

    if (matrix.length === 0) {
      doc.fontSize(10).text("No rows to export.");
    }

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

export async function createAiExportFile(opts: {
  format: "excel" | "pdf";
  title: string;
  rows: Record<string, unknown>[];
  columns?: string[];
}): Promise<AiExportAttachment> {
  cleanupOldFiles();
  ensureDir();

  const format = opts.format === "pdf" ? "pdf" : "excel";
  const { headers, matrix } = flattenRows(opts.rows || [], opts.columns);
  const id = randomUUID();
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const safeTitle = sanitizeFilePart(opts.title || "export");
  const fileName = `${safeTitle}_${id.slice(0, 8)}.${ext}`;
  const filePath = path.join(EXPORT_DIR, `${id}.${ext}`);

  if (format === "excel") {
    await writeExcel(filePath, opts.title || "Export", headers, matrix);
  } else {
    await writePdf(filePath, opts.title || "Export", headers, matrix);
  }

  return {
    id,
    fileName,
    format,
    mimeType:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    downloadPath: `/ai-assistant/exports/${id}.${ext}`,
    rowCount: matrix.length,
    title: opts.title || "Export",
  };
}

export function resolveAiExportFile(
  fileParam: string,
): { fullPath: string; mimeType: string; downloadName: string } | null {
  cleanupOldFiles();
  const match = String(fileParam || "").match(
    /^([0-9a-f-]{36})\.(xlsx|pdf)$/i,
  );
  if (!match) return null;
  const id = match[1];
  const ext = match[2].toLowerCase();
  const fullPath = path.join(EXPORT_DIR, `${id}.${ext}`);
  if (!fs.existsSync(fullPath)) return null;
  const st = fs.statSync(fullPath);
  if (Date.now() - st.mtimeMs > TTL_MS) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      /* ignore */
    }
    return null;
  }
  return {
    fullPath,
    mimeType:
      ext === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    downloadName: `koncepts-export.${ext}`,
  };
}

export { MAX_EXPORT_ROWS };
