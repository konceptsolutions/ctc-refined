export type CashBankPaymentMode = "cash" | "online";

type MainGroupRef = { type?: string | null } | null | undefined;
type SubgroupRef = {
  code?: string | null;
  name?: string | null;
  MainGroup?: MainGroupRef;
  mainGroup?: MainGroupRef;
} | null | undefined;

type AccountWithSubgroup = {
  name?: string | null;
  subgroup?: SubgroupRef;
  Subgroup?: SubgroupRef;
};

function getSubgroup(account: AccountWithSubgroup) {
  return account.subgroup ?? account.Subgroup;
}

function getMainGroupType(account: AccountWithSubgroup): string {
  const subgroup = getSubgroup(account);
  const mainGroup = subgroup?.MainGroup ?? subgroup?.mainGroup;
  return String(mainGroup?.type ?? "").trim().toLowerCase();
}

/** Cash/bank ledgers live under Current Assets only — not expense groups like Bank Charges. */
function isAssetCashBankChart(account: AccountWithSubgroup): boolean {
  const mainType = getMainGroupType(account);
  return mainType === "asset" || mainType === "";
}

const BANK_SUBGROUP_CODES = new Set(["103", "108"]);

function isBankSubgroup(code: string, subgroupName: string): boolean {
  if (BANK_SUBGROUP_CODES.has(code)) return true;
  // Seed chart: 102 = Bank Accounts (when subgroup name says bank)
  if (code === "102" && subgroupName.includes("bank")) return true;
  if (
    subgroupName.includes("bank account") ||
    subgroupName === "bank" ||
    subgroupName.startsWith("bank ")
  ) {
    return true;
  }
  return false;
}

function isCashSubgroup(code: string, subgroupName: string): boolean {
  if (code === "101") return true;
  if (subgroupName.includes("cash") && !subgroupName.includes("receivable")) {
    return true;
  }
  // This deployment: 102 = Cash subgroup
  if (code === "102" && !isBankSubgroup(code, subgroupName)) return true;
  return false;
}

/** Payment/receipt mode from chart-of-accounts subgroup. */
export function resolveCashBankMode(params: {
  subgroupCode?: string | null;
  subgroupName?: string | null;
  accountName?: string | null;
  mainGroupType?: string | null;
}): CashBankPaymentMode {
  const mainType = String(params.mainGroupType ?? "").trim().toLowerCase();
  if (mainType && mainType !== "asset") return "cash";

  const code = String(params.subgroupCode ?? "").trim();
  const subgroup = String(params.subgroupName ?? "").toLowerCase();
  const name = String(params.accountName ?? "").toLowerCase();

  if (isBankSubgroup(code, subgroup)) return "online";
  if (/\bonline\b/.test(name) || /\bonline\b/.test(subgroup)) return "online";
  return "cash";
}

export function isCashBankAccount(account: AccountWithSubgroup): boolean {
  if (!isAssetCashBankChart(account)) return false;

  const subgroup = getSubgroup(account);
  const code = String(subgroup?.code ?? "").trim();
  const name = String(subgroup?.name ?? "").toLowerCase();

  return isBankSubgroup(code, name) || isCashSubgroup(code, name);
}

export function getAccountCashBankMode(account: AccountWithSubgroup): CashBankPaymentMode {
  const subgroup = getSubgroup(account);
  return resolveCashBankMode({
    subgroupCode: subgroup?.code,
    subgroupName: subgroup?.name,
    accountName: account.name,
    mainGroupType: getMainGroupType(account),
  });
}

export function isCashLedgerAccount(account: AccountWithSubgroup): boolean {
  return isCashBankAccount(account) && getAccountCashBankMode(account) === "cash";
}

export function isBankLedgerAccount(account: AccountWithSubgroup): boolean {
  return isCashBankAccount(account) && getAccountCashBankMode(account) === "online";
}

/** Normalize API cash/bank account rows when mode is missing. */
export function normalizeCashBankModeFromApi(row: {
  mode?: string | null;
  code?: string | null;
}): CashBankPaymentMode {
  if (row.mode === "online" || row.mode === "cash") return row.mode;
  const code = String(row.code || "").trim();
  if (/^10[38]/.test(code)) return "online";
  return "cash";
}
