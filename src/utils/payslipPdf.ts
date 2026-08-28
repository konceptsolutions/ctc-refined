import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PayslipPdfRow = {
  date: string;
  payrollMonth?: string | null;
  grossAmount: number;
  absentDays: number;
  workingDays: number;
  daysWorked: number;
  loanRecovery: number;
  advanceRecovery: number;
  netPayable: number;
  paidAmount: number;
  outstanding: number;
  voucherNumber?: string | null;
  employee?: {
    code: string;
    name: string;
    monthlySalary: number;
    department?: string | null;
    designation?: string | null;
  } | null;
  payments?: Array<{ date: string; amount: number; referenceNo?: string | null }>;
};

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
};

const formatPayrollMonth = (value?: string | null) => {
  if (!value) return "—";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
};

export function printPayslipPdf(row: PayslipPdfRow): boolean {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const employeeName = row.employee?.name || "Employee";
  const employeeCode = row.employee?.code || "—";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Salary Payslip", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(formatPayrollMonth(row.payrollMonth), 14, 22);

  autoTable(doc, {
    startY: 28,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
    body: [
      ["Employee", `${employeeName} (${employeeCode})`, "Accrual Date", formatDate(row.date)],
      ["Department", row.employee?.department || "—", "Designation", row.employee?.designation || "—"],
      ["Monthly Salary", formatMoney(row.employee?.monthlySalary || 0), "Voucher", row.voucherNumber || "—"],
    ],
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold", fillColor: [250, 250, 250] },
      2: { cellWidth: 32, fontStyle: "bold", fillColor: [250, 250, 250] },
    },
  });

  const summaryStartY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    : 70;

  autoTable(doc, {
    startY: summaryStartY,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
    head: [["Description", "Amount (PKR)"]],
    body: [
      ["Working Days", String(row.workingDays)],
      ["Absent Days", String(row.absentDays)],
      ["Days Worked", String(row.daysWorked)],
      ["Gross Salary", formatMoney(row.grossAmount)],
      ["Loan Recovery", formatMoney(row.loanRecovery)],
      ["Advance Recovery", formatMoney(row.advanceRecovery)],
      ["Net Payable", formatMoney(row.netPayable)],
      ["Paid", formatMoney(row.paidAmount)],
      ["Outstanding", formatMoney(row.outstanding)],
    ],
    columnStyles: {
      1: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && (data.row.index === 6 || data.row.index === 8)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [250, 250, 250];
      }
    },
  });

  const paymentStartY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    : summaryStartY + 60;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Payment History", 14, paymentStartY);

  const paymentRows =
    row.payments && row.payments.length > 0
      ? row.payments.map((payment) => [
          formatDate(payment.date),
          formatMoney(payment.amount),
          payment.referenceNo || "—",
        ])
      : [["No payments recorded", "", ""]];

  autoTable(doc, {
    startY: paymentStartY + 3,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
    head: [["Date", "Amount", "Reference"]],
    body: paymentRows,
    columnStyles: {
      1: { halign: "right" },
    },
  });

  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(url, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    doc.save(`payslip-${employeeCode}-${row.payrollMonth || "salary"}.pdf`);
    return false;
  }

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    URL.revokeObjectURL(url);
  }, 500);

  return true;
}
