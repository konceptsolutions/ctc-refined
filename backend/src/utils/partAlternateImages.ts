type DbClient = {
  part: {
    findUnique: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any[]>;
    updateMany: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
  };
};

export type PartImagePair = {
  imageP1: string | null;
  imageP2: string | null;
};

const clean = (value: unknown) => String(value ?? "").trim();

export const familyKeysForPart = (part: {
  partNo?: string | null;
  part_no?: string | null;
  masterPartNo?: string | null;
  master_part_no?: string | null;
}) => {
  const keys = new Set<string>();
  const partNo = clean(part.partNo || part.part_no).toLowerCase();
  const masterPartNo = clean(part.masterPartNo || part.master_part_no).toLowerCase();
  if (partNo) keys.add(partNo);
  if (masterPartNo) keys.add(masterPartNo);
  return [...keys];
};

export const shareImagesWithinPartRows = <
  T extends {
    id?: string;
    part_no?: string | null;
    master_part_no?: string | null;
    image_p1?: string | null;
    image_p2?: string | null;
  },
>(
  rows: T[],
): T[] => {
  const imageByKey = new Map<string, PartImagePair>();

  for (const row of rows) {
    const p1 = clean(row.image_p1) || null;
    const p2 = clean(row.image_p2) || null;
    if (!p1 && !p2) continue;
    for (const key of familyKeysForPart({
      partNo: row.part_no,
      masterPartNo: row.master_part_no,
    })) {
      const existing = imageByKey.get(key);
      if (!existing) {
        imageByKey.set(key, { imageP1: p1, imageP2: p2 });
        continue;
      }
      if (!existing.imageP1 && p1) existing.imageP1 = p1;
      if (!existing.imageP2 && p2) existing.imageP2 = p2;
    }
  }

  return rows.map((row) => {
    if (clean(row.image_p1) || clean(row.image_p2)) return row;
    for (const key of familyKeysForPart({
      partNo: row.part_no,
      masterPartNo: row.master_part_no,
    })) {
      const shared = imageByKey.get(key);
      if (shared && (shared.imageP1 || shared.imageP2)) {
        return {
          ...row,
          image_p1: shared.imageP1,
          image_p2: shared.imageP2,
        };
      }
    }
    return row;
  });
};

const identityWhere = (identity: {
  partNo?: string | null;
  masterPartNo?: string | null;
  masterPartId?: string | null;
  excludePartId?: string | null;
}) => {
  const partNo = clean(identity.partNo);
  const masterPartNo = clean(identity.masterPartNo);
  const or: any[] = [];
  for (const value of Array.from(new Set([partNo, masterPartNo].filter(Boolean)))) {
    or.push({ partNo: value });
    or.push({ MasterPart: { masterPartNo: value } });
  }
  if (identity.masterPartId) {
    or.push({ masterPartId: identity.masterPartId });
  }
  if (or.length === 0) return null;
  const where: any = { OR: or };
  if (identity.excludePartId) {
    where.id = { not: identity.excludePartId };
  }
  return where;
};

const alternateWhere = (part: {
  id: string;
  partNo?: string | null;
  masterPartId?: string | null;
  MasterPart?: { masterPartNo?: string | null } | null;
  masterPartNo?: string | null;
}) =>
  identityWhere({
    partNo: part.partNo,
    masterPartNo: part.masterPartNo || part.MasterPart?.masterPartNo,
    masterPartId: part.masterPartId,
    excludePartId: part.id,
  });

export async function findAlternatePartIds(
  db: DbClient,
  partId: string,
): Promise<string[]> {
  const part = await db.part.findUnique({
    where: { id: partId },
    select: {
      id: true,
      partNo: true,
      masterPartId: true,
      MasterPart: { select: { masterPartNo: true } },
    },
  });
  if (!part) return [];
  const where = alternateWhere(part);
  if (!where) return [];
  const rows = await db.part.findMany({
    where,
    select: { id: true },
    take: 500,
  });
  return rows.map((row) => String(row.id));
}

export async function fillMissingImagesFromFamily<
  T extends {
    id?: string;
    part_no?: string | null;
    master_part_no?: string | null;
    image_p1?: string | null;
    image_p2?: string | null;
  },
>(db: DbClient, rows: T[]): Promise<T[]> {
  const withLocalShare = shareImagesWithinPartRows(rows);
  const missing = withLocalShare.filter(
    (row) => !clean(row.image_p1) && !clean(row.image_p2),
  );
  if (missing.length === 0) return withLocalShare;

  const keys = Array.from(
    new Set(
      missing.flatMap((row) =>
        [clean(row.part_no), clean(row.master_part_no)].filter(Boolean),
      ),
    ),
  );
  if (keys.length === 0) return withLocalShare;

  const siblings = await db.part.findMany({
    where: {
      OR: keys.flatMap((key) => [
        { partNo: { equals: key, mode: "insensitive" } },
        { MasterPart: { masterPartNo: { equals: key, mode: "insensitive" } } },
      ]),
    },
    select: {
      partNo: true,
      imageP1: true,
      imageP2: true,
      MasterPart: { select: { masterPartNo: true } },
    },
    take: 500,
  });

  const imageByKey = new Map<string, PartImagePair>();
  for (const sibling of siblings) {
    const p1 = clean(sibling.imageP1) || null;
    const p2 = clean(sibling.imageP2) || null;
    if (!p1 && !p2) continue;
    for (const key of familyKeysForPart({
      partNo: sibling.partNo,
      masterPartNo: sibling.MasterPart?.masterPartNo,
    })) {
      const existing = imageByKey.get(key);
      if (!existing) {
        imageByKey.set(key, { imageP1: p1, imageP2: p2 });
        continue;
      }
      if (!existing.imageP1 && p1) existing.imageP1 = p1;
      if (!existing.imageP2 && p2) existing.imageP2 = p2;
    }
  }

  if (imageByKey.size === 0) return withLocalShare;

  return withLocalShare.map((row) => {
    if (clean(row.image_p1) || clean(row.image_p2)) return row;
    for (const key of familyKeysForPart({
      partNo: row.part_no,
      masterPartNo: row.master_part_no,
    })) {
      const shared = imageByKey.get(key);
      if (shared && (shared.imageP1 || shared.imageP2)) {
        return {
          ...row,
          image_p1: shared.imageP1,
          image_p2: shared.imageP2,
        };
      }
    }
    return row;
  });
}

export async function findSharedImagesByIdentity(
  db: DbClient,
  identity: {
    partNo?: string | null;
    masterPartNo?: string | null;
    masterPartId?: string | null;
    excludePartId?: string | null;
  },
): Promise<PartImagePair> {
  const where = identityWhere(identity);
  if (!where) return { imageP1: null, imageP2: null };

  const siblings = await db.part.findMany({
    where,
    select: { imageP1: true, imageP2: true },
    take: 200,
  });

  let imageP1: string | null = null;
  let imageP2: string | null = null;
  for (const sibling of siblings) {
    if (!imageP1) imageP1 = clean(sibling.imageP1) || null;
    if (!imageP2) imageP2 = clean(sibling.imageP2) || null;
    if (imageP1 && imageP2) break;
  }
  return { imageP1, imageP2 };
}

export async function resolveSharedImagesForPart(
  db: DbClient,
  part: {
    id: string;
    partNo?: string | null;
    masterPartId?: string | null;
    imageP1?: string | null;
    imageP2?: string | null;
    MasterPart?: { masterPartNo?: string | null } | null;
    masterPartNo?: string | null;
  },
): Promise<PartImagePair> {
  const ownP1 = clean(part.imageP1) || null;
  const ownP2 = clean(part.imageP2) || null;
  if (ownP1 && ownP2) {
    return { imageP1: ownP1, imageP2: ownP2 };
  }

  const shared = await findSharedImagesByIdentity(db, {
    partNo: part.partNo,
    masterPartNo: part.masterPartNo || part.MasterPart?.masterPartNo,
    masterPartId: part.masterPartId,
    excludePartId: part.id,
  });

  return {
    imageP1: ownP1 || shared.imageP1,
    imageP2: ownP2 || shared.imageP2,
  };
}

export async function syncImagesToAlternateParts(
  db: DbClient,
  partId: string,
  images: { imageP1?: string | null; imageP2?: string | null },
) {
  const alternateIds = await findAlternatePartIds(db, partId);
  if (alternateIds.length === 0) return 0;

  const data: { imageP1?: string | null; imageP2?: string | null } = {};
  if ("imageP1" in images) data.imageP1 = images.imageP1 ?? null;
  if ("imageP2" in images) data.imageP2 = images.imageP2 ?? null;
  if (Object.keys(data).length === 0) return 0;

  await db.part.updateMany({
    where: { id: { in: alternateIds } },
    data,
  });
  return alternateIds.length;
}
