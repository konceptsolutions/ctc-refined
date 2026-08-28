import ExcelJS from "exceljs";

const escapeCsvCell = (value: unknown): string =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const triggerDownload = (blob: Blob, filename: string) => {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToCSV = (data: any[], headers: string[], filename: string) => {
  try {
    const bodyRows = data.map((item) => {
      if (Array.isArray(item)) {
        return item.map(escapeCsvCell).join(",");
      }
      return headers
        .map((header) => {
          const key = header.toLowerCase().replace(/\s+/g, "_");
          const value = item[key] ?? item[header] ?? "";
          return escapeCsvCell(value);
        })
        .join(",");
    });

    const csvContent = [headers.map(escapeCsvCell).join(","), ...bodyRows].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    triggerDownload(blob, downloadName);
    return true;
  } catch {
    return false;
  }
};

export const exportRowsToExcel = async (
  headers: string[],
  rows: unknown[][],
  filename: string,
) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const downloadName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  triggerDownload(blob, downloadName);
};

export const exportTableToCSV = (tableId: string, filename: string) => {
  try {
    const table = document.getElementById(tableId);
    if (!table) return false;

    const rows = Array.from(table.querySelectorAll("tr"));
    const csvContent = rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("th, td"));
        return cells.map((cell) => escapeCsvCell(cell.textContent?.trim() || "")).join(",");
      })
      .join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    triggerDownload(blob, downloadName);
    return true;
  } catch {
    return false;
  }
};

export const printReport = (title: string) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const content = document.querySelector(".printable-content") || document.body;
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${content.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};
