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
  /** Debit — dark teal, high contrast on white */
  dr: {
    className: "text-teal-800 font-bold",
    headerClassName: "text-teal-950 font-bold",
    css: "#115e59",
    rgb: [17, 94, 89],
  },
  /** Credit — dark amber/brown (not pale yellow) */
  cr: {
    className: "text-amber-900 font-bold",
    headerClassName: "text-amber-950 font-bold",
    css: "#78350f",
    rgb: [120, 53, 15],
  },
  /** Amount — deep indigo */
  amount: {
    className: "text-indigo-900 font-bold",
    headerClassName: "text-indigo-950 font-bold",
    css: "#312e81",
    rgb: [49, 46, 129],
  },
  /** Balance — deep rose/red */
  balance: {
    className: "text-rose-800 font-bold",
    headerClassName: "text-rose-950 font-bold",
    css: "#9f1239",
    rgb: [159, 18, 57],
  },
  /**
   * Foreign currency (FC) — strong navy blue.
   * Used across Purchase Import + Accounting UI and PDFs.
   */
  fc: {
    className: "text-blue-900 font-bold",
    headerClassName: "text-blue-950 font-bold",
    css: "#1e3a8a",
    rgb: [30, 58, 138],
  },
  /**
   * Local currency (LC) — strong fuchsia/magenta (clearly different from FC blue).
   */
  lc: {
    className: "text-fuchsia-900 font-bold",
    headerClassName: "text-fuchsia-950 font-bold",
    css: "#701a75",
    rgb: [112, 26, 117],
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
