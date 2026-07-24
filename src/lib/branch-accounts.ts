import { apiClient } from "@/lib/api";

export type BranchAccountOption = {
  id: string;
  value: string;
  label: string;
};

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isBranchesSubgroup = (name: unknown) => {
  const n = normalizeName(name);
  return n === "branches" || n === "branch" || n.includes("branch");
};

/** Strip ledger code prefix when present (e.g. "301001 - CP" → "CP"). */
export function branchAccountDisplayName(
  value: string | null | undefined,
): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const separator = text.indexOf(" - ");
  if (separator > 0) return text.slice(separator + 3).trim();
  return text;
}

/**
 * Accounts under the given main group (e.g. Current Liabilities / Current Assets)
 * and subgroup "Branches".
 */
export async function fetchBranchAccountOptions(
  mainGroupName: string,
): Promise<BranchAccountOption[]> {
  const mainGroupsRes = (await apiClient.getMainGroups()) as {
    data?: Array<{ id: string; name: string }>;
  };
  const mainGroups = mainGroupsRes?.data || [];
  const mainGroup = mainGroups.find(
    (mg) => normalizeName(mg.name) === normalizeName(mainGroupName),
  );
  if (!mainGroup?.id) return [];

  const subgroupsRes = (await apiClient.getSubgroups({
    mainGroupId: mainGroup.id,
    isActive: true,
  })) as { data?: Array<{ id: string; code?: string; name: string }> };
  const subgroups = subgroupsRes?.data || [];
  const branchesSubgroup =
    subgroups.find((sg) => String(sg.code || "").trim() === "305") ||
    subgroups.find((sg) => isBranchesSubgroup(sg.name));
  if (!branchesSubgroup?.id) return [];

  const accountsRes = (await apiClient.getAccounts({
    subgroupId: branchesSubgroup.id,
    status: "Active",
  })) as { data?: Array<{ id: string; code?: string; name?: string; status?: string }> };
  const accounts = accountsRes?.data || [];

  return accounts
    .filter((acc) => acc?.id && acc?.name)
    .filter((acc) => normalizeName(acc.status || "active") === "active")
    .map((acc) => ({
      id: acc.id,
      value: acc.id,
      label: String(acc.name ?? "").trim(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
