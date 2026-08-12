type PartLookup = {
  partNo?: string | null;
  description?: string | null;
  Brand?: { name?: string | null } | null;
  MasterPart?: { masterPartNo?: string | null } | null;
} | null | undefined;

const trim = (value: unknown) => String(value ?? "").trim();

/** Display part no: MasterPart (blue block) then Part.partNo. */
export function displayPartNoFromPart(part: PartLookup): string {
  return trim(part?.MasterPart?.masterPartNo) || trim(part?.partNo);
}

export function hydrateSalesInvoiceItem<T extends Record<string, any>>(item: T): T {
  const part = (item as any)?.Part as PartLookup;
  const partNo = trim((item as any).partNo) || displayPartNoFromPart(part);
  const description = trim((item as any).description) || trim(part?.description);
  const brand = trim((item as any).brand) || trim(part?.Brand?.name);
  return {
    ...item,
    partNo,
    description,
    brand,
  };
}

export function hydrateSalesInvoiceItems<T extends Record<string, any>>(
  items: T[] | null | undefined,
): T[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => hydrateSalesInvoiceItem(item));
}

export const invoiceItemPartSelect = {
  partNo: true,
  description: true,
  avgCost: true,
  cost: true,
  Brand: { select: { name: true } },
  MasterPart: { select: { masterPartNo: true } },
} as const;

export async function resolveInvoiceItemPartFields(
  prisma: {
    part: {
      findUnique: (args: any) => Promise<PartLookup>;
    };
  },
  item: { partId?: string; partNo?: string; description?: string; brand?: string },
): Promise<{ partNo: string; description: string; brand: string }> {
  const part = item.partId
    ? await prisma.part.findUnique({
        where: { id: item.partId },
        select: invoiceItemPartSelect,
      })
    : null;
  return {
    partNo: trim(item.partNo) || displayPartNoFromPart(part),
    description: trim(item.description) || trim(part?.description),
    brand: trim(item.brand) || trim(part?.Brand?.name),
  };
}
