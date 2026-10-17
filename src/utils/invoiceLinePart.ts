import {
  formatPartIdentityFromUi,
  getUiMasterPartFromDb,
  getUiPartNoFromDb,
} from "@/lib/part-identity";

/** Resolve denormalized invoice line part fields, falling back to related Part. */
export function resolveInvoiceLinePartFields(item: any): {
  /** UI Part No (= DB master_part_no) */
  partNo: string;
  /** UI Master Part (= DB part_no) */
  masterPartNo: string;
  /** Combined "Part No | Master Part" label */
  partLabel: string;
  description: string;
  brand: string;
  origin: string;
} {
  const part = item?.Part || item?.part || {};
  const master = part?.MasterPart || part?.masterPart || {};

  // Prefer raw DB fields / nested Part (never treat UI partNo as DB part_no alone)
  const dbPartNo = String(
    item?.part_no ||
      part?.part_no ||
      part?.partNo ||
      "",
  ).trim();

  const dbMasterPartNo = String(
    item?.master_part_no ||
      master?.masterPartNo ||
      master?.master_part_no ||
      part?.master_part_no ||
      part?.MasterPart?.masterPartNo ||
      "",
  ).trim();

  // If API already hydrated UI fields and Part is missing both raw ids
  if (!dbPartNo && !dbMasterPartNo && (item?.partNo || item?.masterPartNo)) {
    const partNo = String(item.partNo || "").trim();
    const masterPartNo = String(item.masterPartNo || "").trim();
    return {
      partNo,
      masterPartNo,
      partLabel: formatPartIdentityFromUi({ partNo, masterPartNo }),
      description: String(item?.description || part?.description || "").trim(),
      brand: String(
        item?.brand || part?.Brand?.name || part?.brand?.name || "",
      ).trim(),
      origin: String(item?.origin || part?.origin || "").trim(),
    };
  }

  const partNo = getUiPartNoFromDb({
    master_part_no: dbMasterPartNo,
    part_no: dbPartNo,
  });
  const masterPartNo = getUiMasterPartFromDb({
    part_no: dbPartNo,
    master_part_no: dbMasterPartNo,
  });

  const description = String(item?.description || part?.description || "").trim();
  const brand = String(
    item?.brand || part?.Brand?.name || part?.brand?.name || "",
  ).trim();
  const origin = String(
    item?.origin || part?.origin || "",
  ).trim();

  return {
    partNo,
    masterPartNo,
    partLabel: formatPartIdentityFromUi({ partNo, masterPartNo }),
    description,
    brand,
    origin,
  };
}

/** Extract Part No | Master Part from a store PO/DPO/adjustment line. */
export function resolveStoreLinePartFields(item: any): {
  partNo: string;
  masterPartNo: string;
  partLabel: string;
} {
  const part = item?.part || item?.Part || {};
  const master = part?.MasterPart || part?.masterPart || {};

  // Prefer raw DB snake_case fields from API
  const dbPartNo = String(
    item?.part_no ||
      part?.part_no ||
      "",
  ).trim();
  const dbMasterPartNo = String(
    item?.master_part_no ||
      master?.masterPartNo ||
      master?.master_part_no ||
      part?.master_part_no ||
      "",
  ).trim();

  // Nested Part often has camelCase DB partNo + MasterPart.masterPartNo
  const nestedDbPartNo = String(part?.partNo || "").trim();
  const nestedDbMaster = String(
    part?.masterPartNo || part?.MasterPart?.masterPartNo || "",
  ).trim();

  const resolvedDbPartNo = dbPartNo || nestedDbPartNo;
  const resolvedDbMaster = dbMasterPartNo || nestedDbMaster;

  // Already UI-mapped objects (partNo = master, masterPartNo = part_no)
  if (
    !resolvedDbPartNo &&
    !resolvedDbMaster &&
    (item?.partNo || item?.masterPartNo)
  ) {
    const partNo = String(item.partNo || "").trim();
    const masterPartNo = String(item.masterPartNo || "").trim();
    return {
      partNo,
      masterPartNo,
      partLabel: formatPartIdentityFromUi({ partNo, masterPartNo }),
    };
  }

  const partNo = getUiPartNoFromDb({
    master_part_no: resolvedDbMaster,
    part_no: resolvedDbPartNo,
  });
  const masterPartNo = getUiMasterPartFromDb({
    part_no: resolvedDbPartNo,
    master_part_no: resolvedDbMaster,
  });

  return {
    partNo,
    masterPartNo,
    partLabel: formatPartIdentityFromUi({ partNo, masterPartNo }),
  };
}
