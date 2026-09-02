import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import type { PartIdentityFields } from "@/lib/part-identity";

export type PartFamilySearchRow = PartIdentityFields & {
  id?: string;
  description?: string | null;
  brand?: string | null;
  Brand?: { name?: string | null } | null;
  application?: string | null;
  category?: string | null;
  subCategory?: string | null;
  subcategory?: string | null;
  machineModels?: Array<{ name?: string | null }>;
  brands?: Array<{ name?: string | null }>;
};

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** All part-number identifiers on a row (DB + UI field names). */
export function getPartIdentityKeys(part: PartFamilySearchRow): string[] {
  return Array.from(
    new Set(
      [
        part.part_no,
        part.master_part_no,
        part.partNo,
        part.masterPartNo,
        part.masterPart,
      ]
        .map(normalizeKey)
        .filter(Boolean),
    ),
  );
}

export function partRowMatchesPartNumberSearch(
  part: PartFamilySearchRow,
  search: string,
): boolean {
  const q = normalizeKey(search);
  if (!q) return false;
  return getPartIdentityKeys(part).some((key) => key.includes(q));
}

export function partRowMatchesSearch(
  part: PartFamilySearchRow,
  search: string,
): boolean {
  const q = normalizeKey(search);
  if (!q) return true;
  if (partRowMatchesPartNumberSearch(part, search)) return true;

  const description = normalizeKey(part.description);
  const brand = normalizeKey(part.brand || part.Brand?.name);
  const category = normalizeKey(part.category);
  const subCategory = normalizeKey(part.subCategory || part.subcategory);
  const application = normalizeKey(part.application);
  if (
    description.includes(q) ||
    brand.includes(q) ||
    category.includes(q) ||
    subCategory.includes(q) ||
    application.includes(q)
  ) {
    return true;
  }

  const modelNames = (part.machineModels || []).map((m) =>
    normalizeKey(m.name),
  );
  const brandNames = (part.brands || []).map((b) => normalizeKey(b.name));
  return (
    modelNames.some((name) => name.includes(q)) ||
    brandNames.some((name) => name.includes(q))
  );
}

/** Include all alternates when search matches a part number in the family. */
export function filterPartsWithFamilyExpansion<T extends PartFamilySearchRow>(
  parts: T[],
  search: string,
  options?: { maxResults?: number },
): T[] {
  const q = search.trim();
  if (!q) {
    return options?.maxResults ? parts.slice(0, options.maxResults) : parts;
  }

  const directMatches = parts.filter((part) => partRowMatchesSearch(part, q));
  const identityKeys = new Set<string>();
  for (const match of directMatches) {
    if (partRowMatchesPartNumberSearch(match, q)) {
      for (const key of getPartIdentityKeys(match)) {
        identityKeys.add(key);
      }
    }
  }

  let result: T[];
  if (identityKeys.size === 0) {
    result = directMatches;
  } else {
    const seen = new Set<string>();
    result = [];
    for (const part of parts) {
      const rowId = part.id || getPartIdentityKeys(part).join("|");
      const inFamily = getPartIdentityKeys(part).some((key) =>
        identityKeys.has(key),
      );
      const isDirect = directMatches.includes(part);
      if ((inFamily || isDirect) && !seen.has(rowId)) {
        seen.add(rowId);
        result.push(part);
      }
    }
  }

  return options?.maxResults ? result.slice(0, options.maxResults) : result;
}

export type PartSearchableSelectOption = SearchableSelectOption & {
  familyKey?: string;
  uiPartNo?: string;
  uiMasterPart?: string;
};

export function buildPartSearchableSelectFields(
  part: PartFamilySearchRow,
): Pick<PartSearchableSelectOption, "familyKey" | "uiPartNo" | "uiMasterPart"> {
  const keys = getPartIdentityKeys(part);
  return {
    familyKey: keys.join("::") || undefined,
    uiPartNo: keys[0] || undefined,
    uiMasterPart: keys[1] || keys[0] || undefined,
  };
}

function optionIdentityKeys(
  opt: PartSearchableSelectOption,
): string[] {
  return Array.from(
    new Set(
      [opt.familyKey, opt.uiPartNo, opt.uiMasterPart, ...opt.label.split("|")]
        .flatMap((value) => String(value || "").split("::"))
        .map(normalizeKey)
        .filter(Boolean),
    ),
  );
}

function optionMatchesPartNumberSearch(
  opt: PartSearchableSelectOption,
  query: string,
): boolean {
  const q = normalizeKey(query);
  if (!q) return false;
  return optionIdentityKeys(opt).some((key) => key.includes(q));
}

function optionMatchesSearch(
  opt: PartSearchableSelectOption,
  query: string,
): boolean {
  const q = normalizeKey(query);
  if (!q) return true;
  if (
    opt.label.toLowerCase().includes(q) ||
    opt.description?.toLowerCase().includes(q) ||
    opt.listOnlyDescription?.toLowerCase().includes(q)
  ) {
    return true;
  }
  return optionMatchesPartNumberSearch(opt, q);
}

export function resolveFilterPartFamilyIds(
  selectedPartId: string,
  parts: PartFamilySearchRow[],
): string[] {
  const trimmed = String(selectedPartId || "").trim();
  if (!trimmed) return [];

  const selected = parts.find((part) => part.id === trimmed);
  if (!selected) return [trimmed];

  const identityKeys = new Set(getPartIdentityKeys(selected));
  const familyIds = parts
    .filter(
      (part) =>
        part.id &&
        getPartIdentityKeys(part).some((key) => identityKeys.has(key)),
    )
    .map((part) => String(part.id));

  return familyIds.length > 0 ? familyIds : [trimmed];
}

export function filterSearchableSelectOptionsWithFamilyExpansion(
  options: PartSearchableSelectOption[],
  query: string,
): PartSearchableSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;

  const directMatches = options.filter((opt) => optionMatchesSearch(opt, q));
  const identityKeys = new Set<string>();
  for (const match of directMatches) {
    if (optionMatchesPartNumberSearch(match, q)) {
      for (const key of optionIdentityKeys(match)) {
        identityKeys.add(key);
      }
    }
  }

  if (identityKeys.size === 0) return directMatches;

  return options.filter((opt) => {
    if (optionIdentityKeys(opt).some((key) => identityKeys.has(key))) {
      return true;
    }
    return directMatches.includes(opt);
  });
}
