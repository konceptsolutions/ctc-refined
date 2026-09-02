export function calculateAccruedSalary(
  monthlySalary: number,
  workingDays: number,
  absentDays: number,
): number {
  if (workingDays <= 0) return 0;

  const safeAbsent = Math.min(Math.max(Number(absentDays || 0), 0), workingDays);
  const daysWorked = workingDays - safeAbsent;

  return Math.round((Number(monthlySalary || 0) / workingDays) * daysWorked * 100) / 100;
}

export function validateEmployeeSalaryPaymentSplit(params: {
  cashAmount: number;
  bankAmount: number;
  outstanding: number;
  cashAccountId?: string;
  bankAccountId?: string;
}): string | null {
  const cashAmt = Math.max(0, Number(params.cashAmount || 0));
  const bankAmt = Math.max(0, Number(params.bankAmount || 0));
  const total = cashAmt + bankAmt;

  if (total <= 0) {
    return "Payment amount must be greater than zero.";
  }
  if (total > Number(params.outstanding || 0) + 0.01) {
    return `Combined cash and bank payment cannot exceed outstanding amount (${Number(params.outstanding || 0).toFixed(2)}).`;
  }
  if (cashAmt > 0 && !String(params.cashAccountId || "").trim()) {
    return "Please select a cash account when cash amount is greater than zero.";
  }
  if (bankAmt > 0 && !String(params.bankAccountId || "").trim()) {
    return "Please select a bank account when bank amount is greater than zero.";
  }
  return null;
}

export function validatePayrollExtraFieldDescriptions(params: {
  extraPayment: number;
  extraPaymentDescription?: string | null;
  extraDeduction: number;
  extraDeductionDescription?: string | null;
}): string | null {
  if (params.extraPayment > 0 && !String(params.extraPaymentDescription || "").trim()) {
    return "Extra payment description is required when an extra payment amount is entered.";
  }
  if (params.extraDeduction > 0 && !String(params.extraDeductionDescription || "").trim()) {
    return "Extra deduction description is required when an extra deduction amount is entered.";
  }
  return null;
}
