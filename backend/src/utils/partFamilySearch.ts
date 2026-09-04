import { Prisma } from "@prisma/client";
import prisma from "../config/database";

export function partDirectSearchOr(searchStr: string) {
  return [
    { partNo: { contains: searchStr, mode: "insensitive" as const } },
    { description: { contains: searchStr, mode: "insensitive" as const } },
    { Brand: { name: { contains: searchStr, mode: "insensitive" as const } } },
    {
      MasterPart: {
        masterPartNo: { contains: searchStr, mode: "insensitive" as const },
      },
    },
  ];
}

/**
 * When a search hits any part in a family (shared DB part_no), include all siblings.
 */
export async function buildPartSearchWhereWithFamily(
  searchStr: string,
  baseWhere: Record<string, unknown> = { status: "active" },
) {
  const trimmed = searchStr.trim();
  if (!trimmed) return baseWhere;

  const directWhere = {
    ...baseWhere,
    OR: partDirectSearchOr(trimmed),
  };

  const directMatches = await prisma.part.findMany({
    where: directWhere,
    select: { partNo: true },
    take: 300,
  });

  const familyPartNos = Array.from(
    new Set(
      directMatches
        .map((p) => String(p.partNo || "").trim())
        .filter((pn) => pn.length > 0),
    ),
  );

  const orClauses: Prisma.PartWhereInput[] = [...partDirectSearchOr(trimmed)];
  if (familyPartNos.length > 0) {
    orClauses.push({ partNo: { in: familyPartNos } });
  }

  return { ...baseWhere, OR: orClauses };
}

/** All active part ids sharing the same DB part_no family as the given part. */
export async function getPartFamilyIds(partId: string): Promise<string[]> {
  const trimmed = String(partId || "").trim();
  if (!trimmed) return [];

  const part = await prisma.part.findUnique({
    where: { id: trimmed },
    select: { id: true, partNo: true },
  });
  if (!part) return [trimmed];

  const familyPartNo = String(part.partNo || "").trim();
  if (!familyPartNo) return [part.id];

  const family = await prisma.part.findMany({
    where: { partNo: familyPartNo, status: "active" },
    select: { id: true },
  });

  const ids = family.map((row) => row.id);
  return ids.length > 0 ? ids : [part.id];
}

/** SQL fragment for lite part-entry list search (single search param). */
export function buildPartFamilySearchLiteSql(paramIdx: number): string {
  return `(
    p."partNo" ILIKE $${paramIdx} OR
    p."description" ILIKE $${paramIdx} OR
    mp."masterPartNo" ILIKE $${paramIdx} OR
    b."name" ILIKE $${paramIdx} OR
    (
      COALESCE(TRIM(p."partNo"), '') <> '' AND
      p."partNo" IN (
        SELECT DISTINCT p2."partNo"
        FROM "Part" p2
        LEFT JOIN "MasterPart" mp2 ON p2."masterPartId" = mp2.id
        LEFT JOIN "Brand" b2 ON p2."brandId" = b2.id
        WHERE p2."status" = 'active'
          AND COALESCE(TRIM(p2."partNo"), '') <> ''
          AND (
            p2."partNo" ILIKE $${paramIdx} OR
            p2."description" ILIKE $${paramIdx} OR
            mp2."masterPartNo" ILIKE $${paramIdx} OR
            b2."name" ILIKE $${paramIdx}
          )
      )
    )
  )`;
}

/** SQL fragment for part_no / master_part_no list filters with family expansion. */
export function buildPartIdentityFilterSql(paramIdx: number): string {
  return `(
    p."partNo" ILIKE $${paramIdx} OR
    mp."masterPartNo" ILIKE $${paramIdx} OR
    (
      COALESCE(TRIM(p."partNo"), '') <> '' AND
      p."partNo" IN (
        SELECT DISTINCT p2."partNo"
        FROM "Part" p2
        LEFT JOIN "MasterPart" mp2 ON p2."masterPartId" = mp2.id
        WHERE COALESCE(TRIM(p2."partNo"), '') <> ''
          AND (p2."partNo" ILIKE $${paramIdx} OR mp2."masterPartNo" ILIKE $${paramIdx})
      )
    )
  )`;
}

/** SQL fragment for inventory/list search boxes (part no, master part, description, brand). */
export function buildPartListSearchWithFamilySql(paramIdx: number): string {
  return `(
    p."partNo" ILIKE $${paramIdx} OR
    p.description ILIKE $${paramIdx} OR
    b.name ILIKE $${paramIdx} OR
    mp."masterPartNo" ILIKE $${paramIdx} OR
    (
      COALESCE(TRIM(p."partNo"), '') <> '' AND
      p."partNo" IN (
        SELECT DISTINCT p2."partNo"
        FROM "Part" p2
        LEFT JOIN "MasterPart" mp2 ON p2."masterPartId" = mp2.id
        LEFT JOIN "Brand" b2 ON p2."brandId" = b2.id
        WHERE COALESCE(TRIM(p2."partNo"), '') <> ''
          AND (
            p2."partNo" ILIKE $${paramIdx} OR
            p2.description ILIKE $${paramIdx} OR
            b2.name ILIKE $${paramIdx} OR
            mp2."masterPartNo" ILIKE $${paramIdx}
          )
      )
    )
  )`;
}

/** SQL fragment for raw parts list/search queries. */
export function buildPartFamilySearchSql(
  paramIdx: number,
  normalizedParamIdx: number,
): string {
  return `(
    p."partNo" ILIKE $${paramIdx} OR
    p."description" ILIKE $${paramIdx} OR
    mp."masterPartNo" ILIKE $${paramIdx} OR
    regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${normalizedParamIdx}), '[^A-Z0-9]', '', 'g') || '%' OR
    regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${normalizedParamIdx}), '[^A-Z0-9]', '', 'g') || '%' OR
    (
      COALESCE(TRIM(p."partNo"), '') <> '' AND
      p."partNo" IN (
        SELECT DISTINCT p2."partNo"
        FROM "Part" p2
        LEFT JOIN "MasterPart" mp2 ON p2."masterPartId" = mp2.id
        WHERE p2."status" = 'active'
          AND COALESCE(TRIM(p2."partNo"), '') <> ''
          AND (
            p2."partNo" ILIKE $${paramIdx} OR
            p2."description" ILIKE $${paramIdx} OR
            mp2."masterPartNo" ILIKE $${paramIdx} OR
            regexp_replace(UPPER(COALESCE(p2."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${normalizedParamIdx}), '[^A-Z0-9]', '', 'g') || '%' OR
            regexp_replace(UPPER(COALESCE(mp2."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${normalizedParamIdx}), '[^A-Z0-9]', '', 'g') || '%'
          )
      )
    )
  )`;
}
