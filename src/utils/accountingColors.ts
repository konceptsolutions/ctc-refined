/** Shared DR / CR / Amount / Balance / FC / LC colors for accounts UI, views, and PDFs. */

export type AccountingColorKey =
  | "dr"
  | "cr"
  | "amount"
  | "balance"
  | "fc"
  | "lc";

type AccountingColor = {
  /** Tailwind text class for values */
  className: string;
  /** Tailwind text class for column headers */
  headerClassName: string;
  /** Hex for HTML print / inline styles */
  css: string;
  /** RGB for jsPDF / autoTable */
  rgb: readonly [number, number, number];
};

export const ACCOUNTING_COLORS: Record<AccountingColorKey, AccountingColor> = {
  dr: {
    className: "text-teal-600",
    headerClassName: "text-teal-700",
    css: "#0d9488",
    rgb: [13, 148, 136],
  },
  cr: {
    className: "text-amber-600",
    headerClassName: "text-amber-700",
    css: "#d97706",
    rgb: [217, 119, 6],
  },
  amount: {
    className: "text-indigo-600",
    headerClassName: "text-indigo-700",
    css: "#4f46e5",
    rgb: [79, 70, 229],
  },
  balance: {
    className: "text-rose-600",
    headerClassName: "text-rose-700",
    css: "#e11d48",
    rgb: [225, 29, 72],
  },
  /** Foreign currency */
  fc: {
    className: "text-sky-600",
    headerClassName: "text-sky-700",
    css: "#0284c7",
    rgb: [2, 132, 199],
  },
  /** Local currency */
  lc: {
    className: "text-violet-600",
    headerClassName: "text-violet-700",
    css: "#7c3aed",
    rgb: [124, 58, 237],
  },
};

const hasMoney = (value?: number | null): boolean =>
  value != null && Number(value) !== 0 && !Number.isNaN(Number(value));

/** Class for debit values (muted when empty/zero). */
export const drValueClass = (value?: number | null, always = false): string =>
  always || hasMoney(value)
    ? ACCOUNTING_COLORS.dr.className
    : "text-muted-foreground/50";

/** Class for credit values (muted when empty/zero). */
export const crValueClass = (value?: number | null, always = false): string =>
  always || hasMoney(value)
    ? ACCOUNTING_COLORS.cr.className
    : "text-muted-foreground/50";

/** Class for standalone Amount columns. */
export const amountValueClass = (value?: number | null, always = true): string =>
  always || hasMoney(value)
    ? ACCOUNTING_COLORS.amount.className
    : "text-muted-foreground/50";

/** Class for Balance columns. */
export const balanceValueClass = (
  value?: number | null,
  always = true,
): string =>
  always || hasMoney(value)
    ? ACCOUNTING_COLORS.balance.className
    : "text-muted-foreground/50";

/** Class for FC (foreign currency) values. */
export const fcValueClass = (value?: number | null, always = true): string =>
  always || hasMoney(value)
    ? ACCOUNTING_COLORS.fc.className
    : "text-muted-foreground/50";

/** Class for LC (local currency) values. */
export const lcValueClass = (value?: number | null, always = true): string =>
  always || hasMoney(value)
    ? ACCOUNTING_COLORS.lc.className
    : "text-muted-foreground/50";

export const drHeaderClass = ACCOUNTING_COLORS.dr.headerClassName;
export const crHeaderClass = ACCOUNTING_COLORS.cr.headerClassName;
export const amountHeaderClass = ACCOUNTING_COLORS.amount.headerClassName;
export const balanceHeaderClass = ACCOUNTING_COLORS.balance.headerClassName;
export const fcHeaderClass = ACCOUNTING_COLORS.fc.headerClassName;
export const lcHeaderClass = ACCOUNTING_COLORS.lc.headerClassName;

/** Compatible with jspdf-autotable CellHookData (textColor is Color = string | number | ...). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfCellHookData = {
  section: string;
  column: { index: number };
  cell: { styles: { textColor?: any } };
};

/** Apply DR/CR text color to autoTable cells by column index. */
export const applyPdfDrCrColors = (
  data: PdfCellHookData,
  debitColIndex: number,
  creditColIndex: number,
): void => {
  if (data.section !== "body" && data.section !== "foot") return;
  if (data.column.index === debitColIndex) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.dr.rgb];
  } else if (data.column.index === creditColIndex) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.cr.rgb];
  }
};

/** Apply Amount text color to autoTable cells by column index. */
export const applyPdfAmountColor = (
  data: PdfCellHookData,
  amountColIndex: number,
): void => {
  if (data.section !== "body" && data.section !== "foot") return;
  if (data.column.index === amountColIndex) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.amount.rgb];
  }
};

/** Apply Balance text color to autoTable cells by column index. */
export const applyPdfBalanceColor = (
  data: PdfCellHookData,
  balanceColIndex: number,
): void => {
  if (data.section !== "body" && data.section !== "foot") return;
  if (data.column.index === balanceColIndex) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.balance.rgb];
  }
};

/** Apply FC text color to autoTable cells by column index. */
export const applyPdfFcColor = (
  data: PdfCellHookData,
  fcColIndex: number,
): void => {
  if (data.section !== "body" && data.section !== "foot") return;
  if (data.column.index === fcColIndex) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.fc.rgb];
  }
};

/** Apply LC text color to autoTable cells by column index. */
export const applyPdfLcColor = (
  data: PdfCellHookData,
  lcColIndex: number,
): void => {
  if (data.section !== "body" && data.section !== "foot") return;
  if (data.column.index === lcColIndex) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.lc.rgb];
  }
};

/** Color multiple FC and LC columns in a PDF table. */
export const applyPdfFcLcColors = (
  data: PdfCellHookData,
  fcColIndexes: number[],
  lcColIndexes: number[],
): void => {
  if (data.section !== "body" && data.section !== "foot") return;
  if (fcColIndexes.includes(data.column.index)) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.fc.rgb];
  } else if (lcColIndexes.includes(data.column.index)) {
    data.cell.styles.textColor = [...ACCOUNTING_COLORS.lc.rgb];
  }
};
