type DbClient = {
  part: {
    findUnique: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any[]>;
    updateMany: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
  };
  $queryRaw?: (query: TemplateStringsArray, ...values: any[]) => Promise<any[]>;
  $queryRawUnsafe?: (query: string, ...values: any[]) => Promise<any[]>;
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

  // Use a single ANY() lookup instead of Prisma OR + MasterPart relation
  // filters (those generate one LEFT JOIN per key and OOM the DB on large lists).
  const lowerKeys = keys.map((k) => k.toLowerCase());
  let siblings: Array<{
    partNo?: string | null;
    imageP1?: string | null;
    imageP2?: string | null;
    masterPartNo?: string | null;
  }> = [];

  if (typeof db.$queryRawUnsafe === "function") {
    siblings = await db.$queryRawUnsafe(
      `SELECT p."partNo", p."imageP1", p."imageP2", mp."masterPartNo"
       FROM "Part" p
       LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
       WHERE (
         LOWER(p."partNo") = ANY($1::text[])
         OR LOWER(mp."masterPartNo") = ANY($1::text[])
       )
       AND (
         NULLIF(BTRIM(COALESCE(p."imageP1", '')), '') IS NOT NULL
         OR NULLIF(BTRIM(COALESCE(p."imageP2", '')), '') IS NOT NULL
       )
       LIMIT 500`,
      lowerKeys,
    );
  } else {
    // Fallback: batch keys so Prisma never builds hundreds of joins
    const batchSize = 20;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const rows = await db.part.findMany({
        where: {
          OR: batch.flatMap((key) => [
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
        take: 100,
      });
      for (const row of rows) {
        siblings.push({
          partNo: row.partNo,
          imageP1: row.imageP1,
          imageP2: row.imageP2,
          masterPartNo: row.MasterPart?.masterPartNo,
        });
      }
      if (siblings.length >= 500) break;
    }
  }

  const imageByKey = new Map<string, PartImagePair>();
  for (const sibling of siblings) {
    const p1 = clean(sibling.imageP1) || null;
    const p2 = clean(sibling.imageP2) || null;
    if (!p1 && !p2) continue;
    for (const key of familyKeysForPart({
      partNo: sibling.partNo,
      masterPartNo: sibling.masterPartNo,
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
  const partNo = clean(identity.partNo);
  const masterPartNo = clean(identity.masterPartNo);
  const keys = Array.from(
    new Set([partNo, masterPartNo].filter(Boolean).map((k) => k.toLowerCase())),
  );

  if (keys.length === 0 && !identity.masterPartId) {
    return { imageP1: null, imageP2: null };
  }

  let siblings: Array<{ imageP1?: string | null; imageP2?: string | null }> = [];

  if (typeof db.$queryRawUnsafe === "function") {
    const params: any[] = [];
    const matchClauses: string[] = [];
    const andClauses: string[] = [];
    if (keys.length > 0) {
      params.push(keys);
      matchClauses.push(
        `LOWER(p."partNo") = ANY($${params.length}::text[])`,
        `LOWER(mp."masterPartNo") = ANY($${params.length}::text[])`,
      );
    }
    if (identity.masterPartId) {
      params.push(identity.masterPartId);
      matchClauses.push(`p."masterPartId" = $${params.length}`);
    }
    if (matchClauses.length === 0) {
      return { imageP1: null, imageP2: null };
    }
    andClauses.push(`(${matchClauses.join(" OR ")})`);
    if (identity.excludePartId) {
      params.push(identity.excludePartId);
      andClauses.push(`p.id <> $${params.length}`);
    }
    andClauses.push(`(
      NULLIF(BTRIM(COALESCE(p."imageP1", '')), '') IS NOT NULL
      OR NULLIF(BTRIM(COALESCE(p."imageP2", '')), '') IS NOT NULL
    )`);
    siblings = await db.$queryRawUnsafe(
      `SELECT p."imageP1", p."imageP2"
       FROM "Part" p
       LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
       WHERE ${andClauses.join(" AND ")}
       LIMIT 200`,
      ...params,
    );
  } else {
    const where = identityWhere(identity);
    if (!where) return { imageP1: null, imageP2: null };
    siblings = await db.part.findMany({
      where,
      select: { imageP1: true, imageP2: true },
      take: 200,
    });
  }

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
