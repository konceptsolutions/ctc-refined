export type PartIdentityFields = {
  partNo?: string | null;
  part_no?: string | null;
  masterPartNo?: string | null;
  master_part_no?: string | null;
  masterPart?: string | null;
};

const clean = (value: unknown) => String(value ?? "").trim();

/** UI Part No = DB master_part_no / masterPartNo */
export function getUiPartNoFromDb(part: PartIdentityFields): string {
  return clean(part.masterPartNo || part.master_part_no);
}

/** UI Master Part = DB part_no / partNo */
export function getUiMasterPartFromDb(part: PartIdentityFields): string {
  return clean(part.partNo || part.part_no);
}

export function formatPartIdentityLabel(
  uiPartNo: string,
  uiMasterPart: string,
  separator = " | ",
  fallback = "-",
): string {
  const partNo = clean(uiPartNo);
  const masterPart = clean(uiMasterPart);
  if (partNo && masterPart && partNo !== masterPart) {
    return `${partNo}${separator}${masterPart}`;
  }
  return partNo || masterPart || fallback;
}

/** Use for raw API/DB rows (unswapped field names). */
export function formatPartIdentityFromDb(
  part: PartIdentityFields,
  separator = " | ",
  fallback = "-",
): string {
  return formatPartIdentityLabel(
    getUiPartNoFromDb(part),
    getUiMasterPartFromDb(part),
    separator,
    fallback,
  );
}

/**
 * Use when the object already follows UI convention:
 * partNo = DB master part, masterPartNo/masterPart = DB part no.
 */
export function formatPartIdentityFromUi(
  part: {
    partNo?: string | null;
    masterPartNo?: string | null;
    masterPart?: string | null;
  },
  separator = " | ",
  fallback = "-",
): string {
  return formatPartIdentityLabel(
    clean(part.partNo),
    clean(part.masterPartNo || part.masterPart),
    separator,
    fallback,
  );
}
