export type CashBankPaymentMode = "cash" | "online";

const BANK_SUBGROUP_CODES = new Set(["103", "108"]);

function isBankSubgroup(code: string, subgroupName: string): boolean {
  if (BANK_SUBGROUP_CODES.has(code)) return true;
  if (subgroupName.includes("bank")) return true;
  if (code === "102" && subgroupName.includes("bank")) return true;
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

export function resolveCashBankModeFromAccount(account: {
  name?: string | null;
  Subgroup?: { code?: string | null; name?: string | null } | null;
}): CashBankPaymentMode {
  return resolveCashBankMode({
    subgroupCode: account.Subgroup?.code,
    subgroupName: account.Subgroup?.name,
    accountName: account.name,
  });
}
