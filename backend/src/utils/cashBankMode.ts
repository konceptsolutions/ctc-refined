export type CashBankPaymentMode = "cash" | "online";

const BANK_SUBGROUP_CODES = new Set(["103", "108"]);

function getMainGroupType(account: {
  Subgroup?: {
    MainGroup?: { type?: string | null } | null;
    mainGroup?: { type?: string | null } | null;
  } | null;
}): string {
  const mainGroup =
    account.Subgroup?.MainGroup ?? account.Subgroup?.mainGroup ?? null;
  return String(mainGroup?.type ?? "").trim().toLowerCase();
}

function isAssetCashBankChart(account: {
  Subgroup?: {
    MainGroup?: { type?: string | null } | null;
    mainGroup?: { type?: string | null } | null;
  } | null;
}): boolean {
  const mainType = getMainGroupType(account);
  return mainType === "asset" || mainType === "";
}

function isBankSubgroup(code: string, subgroupName: string): boolean {
  if (BANK_SUBGROUP_CODES.has(code)) return true;
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

export function isCashBankAccount(account: {
  name?: string | null;
  Subgroup?: {
    code?: string | null;
    name?: string | null;
    MainGroup?: { type?: string | null } | null;
    mainGroup?: { type?: string | null } | null;
  } | null;
}): boolean {
  if (!isAssetCashBankChart(account)) return false;

  const code = String(account.Subgroup?.code ?? "").trim();
  const subgroupName = String(account.Subgroup?.name ?? "").toLowerCase();
  return isBankSubgroup(code, subgroupName) || isCashSubgroup(code, subgroupName);
}

export function resolveCashBankModeFromAccount(account: {
  name?: string | null;
  Subgroup?: {
    code?: string | null;
    name?: string | null;
    MainGroup?: { type?: string | null } | null;
    mainGroup?: { type?: string | null } | null;
  } | null;
}): CashBankPaymentMode {
  return resolveCashBankMode({
    subgroupCode: account.Subgroup?.code,
    subgroupName: account.Subgroup?.name,
    accountName: account.name,
    mainGroupType: getMainGroupType(account),
  });
}
