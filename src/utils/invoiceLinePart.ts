/** Resolve denormalized invoice line part fields, falling back to related Part. */
export function resolveInvoiceLinePartFields(item: any): {
  partNo: string;
  description: string;
  brand: string;
} {
  const part = item?.Part || item?.part || {};
  const master = part?.MasterPart || part?.masterPart || {};
  const partNo = String(
    item?.partNo ||
      item?.part_no ||
      master?.masterPartNo ||
      part?.masterPartNo ||
      part?.master_part_no ||
      part?.partNo ||
      part?.part_no ||
      "",
  ).trim();
  const description = String(item?.description || part?.description || "").trim();
  const brand = String(
    item?.brand || part?.Brand?.name || part?.brand?.name || "",
  ).trim();
  return { partNo, description, brand };
}
