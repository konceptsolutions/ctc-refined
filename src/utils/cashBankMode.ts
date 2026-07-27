export type CashBankPaymentMode = "cash" | "online";

type SubgroupRef = { code?: string | null; name?: string | null } | null | undefined;

type AccountWithSubgroup = {
  name?: string | null;
  subgroup?: SubgroupRef;
  Subgroup?: SubgroupRef;
};

function getSubgroup(account: AccountWithSubgroup) {
  return account.subgroup ?? account.Subgroup;
}

const BANK_SUBGROUP_CODES = new Set(["103", "108"]);

function isBankSubgroup(code: string, subgroupName: string): boolean {
  if (BANK_SUBGROUP_CODES.has(code)) return true;
  if (subgroupName.includes("bank")) return true;
  // Seed chart: 102 = Bank Accounts
  if (code === "102" && subgroupName.includes("bank")) return true;
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
}): CashBankPaymentMode {
  const code = String(params.subgroupCode ?? "").trim();
  const subgroup = String(params.subgroupName ?? "").toLowerCase();
  const name = String(params.accountName ?? "").toLowerCase();

  if (isBankSubgroup(code, subgroup)) return "online";
  if (/\bonline\b/.test(name) || /\bonline\b/.test(subgroup)) return "online";
  return "cash";
}

export function isCashBankAccount(account: AccountWithSubgroup): boolean {
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
  });
}

export function isCashLedgerAccount(account: AccountWithSubgroup): boolean {
  return isCashBankAccount(account) && getAccountCashBankMode(account) === "cash";
}

export function isBankLedgerAccount(account: AccountWithSubgroup): boolean {
  return isCashBankAccount(account) && getAccountCashBankMode(account) === "online";
}
