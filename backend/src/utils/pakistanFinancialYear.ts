/** Pakistan financial year runs 1 July – 30 June. */

export function getPakistanFinancialYearStartYear(
  asOfDate: string | Date = new Date(),
): number {
  const dateStr =
    asOfDate instanceof Date
      ? asOfDate.toISOString().slice(0, 10)
      : String(asOfDate).slice(0, 10);
  const [year, month] = dateStr.split("-").map(Number);
  if (!year || !month) {
    const now = new Date();
    return now.getUTCMonth() + 1 >= 7
      ? now.getUTCFullYear()
      : now.getUTCFullYear() - 1;
  }
  return month >= 7 ? year : year - 1;
}

export function getPakistanFinancialYearBounds(asOfDate?: string | Date): {
  from: Date;
  to: Date;
  fyStartYear: number;
} {
  const fyStartYear = getPakistanFinancialYearStartYear(
    asOfDate ?? new Date(),
  );
  const fyEndYear = fyStartYear + 1;
  return {
    from: new Date(`${fyStartYear}-07-01T00:00:00.000Z`),
    to: new Date(`${fyEndYear}-06-30T23:59:59.999Z`),
    fyStartYear,
  };
}
