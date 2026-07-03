export type PrintPaperSize = "A4" | "A5" | "letter";

export function buildPageRule(
  paperSize: PrintPaperSize = "A4",
  margin = "10mm",
): string {
  return `@page { size: ${paperSize}; margin: ${margin}; }`;
}

/**
 * Strip portrait/landscape from @page rules so Chrome/Edge show
 * the native Layout option in the print dialog.
 */
export function unlockBrowserPrintLayout(html: string): string {
  return html.replace(/@page\s*\{([^}]*)\}/gi, (_match, body: string) => {
    let normalized = body
      .replace(
        /size\s*:\s*([a-z0-9]+)\s+(landscape|portrait)/gi,
        "size: $1",
      )
      .replace(/size\s*:\s*(landscape|portrait)\s+([a-z0-9]+)/gi, "size: $2")
      .replace(/size\s*:\s*(landscape|portrait)\s*;/gi, "size: A4;")
      .replace(/size\s*:\s*(landscape|portrait)(\s|;|$)/gi, "size: A4$2");

    return `@page {${normalized}}`;
  });
}

export function openPrintHtml(
  html: string,
  options?: {
    paperSize?: PrintPaperSize;
    margin?: string;
    closeAfterPrint?: boolean;
    onBlocked?: () => void;
  },
): boolean {
  let finalHtml = unlockBrowserPrintLayout(html);

  if (options?.paperSize && !/@page\s*\{/i.test(finalHtml)) {
    const rule = buildPageRule(options.paperSize, options.margin ?? "10mm");
    if (/<style/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<style([^>]*)>/i, `<style$1>\n    ${rule}\n`);
    } else if (/<head>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(
        /<head>/i,
        `<head>\n  <style>${rule}</style>`,
      );
    } else {
      finalHtml = `<style>${rule}</style>${finalHtml}`;
    }
  } else if (options?.paperSize) {
    finalHtml = finalHtml.replace(/@page\s*\{[^}]*\}/gi, () =>
      buildPageRule(options.paperSize!, options.margin ?? "10mm"),
    );
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    options?.onBlocked?.();
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(finalHtml);
  printWindow.document.close();
  printWindow.focus();

  window.setTimeout(() => {
    printWindow.print();
    if (options?.closeAfterPrint !== false) {
      printWindow.close();
    }
  }, 250);

  return true;
}

const PRINT_PAGE_STYLE_ID = "ctc-print-page-style";

/** For window.print() on the current page — paper size only, no locked orientation. */
export function printCurrentPage(options?: {
  paperSize?: PrintPaperSize;
  margin?: string;
}): void {
  let style = document.getElementById(
    PRINT_PAGE_STYLE_ID,
  ) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = PRINT_PAGE_STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = buildPageRule(
    options?.paperSize ?? "A4",
    options?.margin ?? "10mm",
  );

  const cleanup = () => {
    style?.remove();
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.print();
}
