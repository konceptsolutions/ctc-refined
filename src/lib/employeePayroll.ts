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
