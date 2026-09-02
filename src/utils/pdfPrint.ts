import { jsPDF } from "jspdf";

/** Delay print until the PDF viewer has rendered every page (slow servers need more time). */
const getPdfRenderDelayMs = (pageCount: number) =>
  Math.min(8000, Math.max(1200, 800 + Math.max(1, pageCount) * 350));

/** Open a jsPDF document in a new tab and trigger the browser print dialog. */
export const openPdfPrintDialog = (doc: jsPDF): boolean => {
  const pageCount = doc.getNumberOfPages();
  const renderDelayMs = getPdfRenderDelayMs(pageCount);
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(url, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return false;
  }

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      printWindow.focus();
      printWindow.print();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    }
  };

  // Blob PDFs often fire "load" before all pages are painted — wait before printing.
  printWindow.addEventListener?.("load", () => {
    window.setTimeout(triggerPrint, renderDelayMs);
  });
  window.setTimeout(triggerPrint, renderDelayMs + 500);
  return true;
};

export const formatPdfMoney = (value: number, fractionDigits = 0) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

import { formatUiDate } from "./dateUtils";

export const formatPdfDate = (value?: string | Date | null) => {
  if (!value) return "-";
  const formatted = formatUiDate(value);
  return formatted || "-";
};
