import type { SearchableSelectOption } from "@/components/ui/searchable-select";

type RawAccount = {
  id: string;
  code?: string | null;
  name?: string | null;
  status?: string | null;
  subgroup?: {
    code?: string | null;
    name?: string | null;
    MainGroup?: { code?: string | null; name?: string | null } | null;
    mainGroup?: { code?: string | null; name?: string | null } | null;
  } | null;
  Subgroup?: {
    code?: string | null;
    name?: string | null;
    MainGroup?: { code?: string | null; name?: string | null } | null;
    mainGroup?: { code?: string | null; name?: string | null } | null;
  } | null;
};

function getSubgroup(account: RawAccount) {
  return account.subgroup ?? account.Subgroup;
}

function getMainGroup(account: RawAccount) {
  const subgroup = getSubgroup(account);
  return subgroup?.MainGroup ?? subgroup?.mainGroup;
}

export function isActiveLedgerAccount(account: RawAccount): boolean {
  const status = String(account.status ?? "Active").trim().toLowerCase();
  return status === "active";
}

/** All active chart accounts usable on payment/receipt/journal/contra lines. */
export function buildVoucherAccountOptions(
  rawAccounts: RawAccount[],
): SearchableSelectOption[] {
  return rawAccounts
    .filter(isActiveLedgerAccount)
    .sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? "")))
    .map((acc) => {
      const mg = getMainGroup(acc);
      const mainGroupLabel = mg
        ? `${mg.code ?? ""}-${mg.name ?? ""}`.replace(/^-/, "")
        : "";
      return {
        value: acc.id,
        label: `${acc.code} - ${acc.name}`,
        description: mainGroupLabel || undefined,
      };
    });
}
