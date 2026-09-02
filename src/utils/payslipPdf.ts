import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatUiDate } from "@/utils/dateUtils";

export type PayslipPdfRow = {
  date: string;
  payrollMonth?: string | null;
  grossAmount: number;
  absentDays: number;
  leaves?: number;
  workingDays: number;
  daysWorked: number;
  loanRecovery: number;
  advanceRecovery: number;
  extraPayment?: number;
  extraPaymentDescription?: string | null;
  extraDeduction?: number;
  extraDeductionDescription?: string | null;
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

const formatDate = (value?: string | null) => formatUiDate(value) || "—";

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

  const extraPayment = Number(row.extraPayment || 0);
  const extraDeduction = Number(row.extraDeduction || 0);
  const extraPaymentDescription = String(row.extraPaymentDescription || "").trim();
  const extraDeductionDescription = String(row.extraDeductionDescription || "").trim();
  const hasExtraPayment = extraPayment > 0 || extraPaymentDescription.length > 0;
  const hasExtraDeduction = extraDeduction > 0 || extraDeductionDescription.length > 0;

  const summaryBody: string[][] = [
    ["Working Days", "", String(row.workingDays)],
    ["Absent Days", "", String(row.absentDays)],
    ["Leaves", "", String(row.leaves ?? 0)],
    ["Days Worked", "", String(row.daysWorked)],
    ["Gross Salary", "", formatMoney(row.grossAmount)],
    ["Loan Recovery", "", formatMoney(row.loanRecovery)],
    ["Advance Recovery", "", formatMoney(row.advanceRecovery)],
  ];

  if (hasExtraPayment) {
    summaryBody.push([
      "Extra Payment",
      extraPaymentDescription || "—",
      formatMoney(extraPayment),
    ]);
  }

  if (hasExtraDeduction) {
    summaryBody.push([
      "Extra Deduction",
      extraDeductionDescription || "—",
      formatMoney(extraDeduction),
    ]);
  }

  const netPayableRowIndex = summaryBody.length;
  summaryBody.push(
    ["Net Payable", "", formatMoney(row.netPayable)],
    ["Paid", "", formatMoney(row.paidAmount)],
    ["Outstanding", "", formatMoney(row.outstanding)],
  );
  const outstandingRowIndex = summaryBody.length - 1;

  autoTable(doc, {
    startY: summaryStartY,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
    head: [["Description", "Particulars", "Amount (PKR)"]],
    body: summaryBody,
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 88 },
      2: { halign: "right", cellWidth: 32 },
    },
    didParseCell: (data) => {
      if (
        data.section === "body" &&
        (data.row.index === netPayableRowIndex || data.row.index === outstandingRowIndex)
      ) {
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
