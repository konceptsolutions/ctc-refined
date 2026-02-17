import { PrismaClient } from '@prisma/client';

/**
 * Get the canonical Part ID for a given partNo
 * Selection priority:
 * 1. costSource='DPO_RECEIVED' with latest costUpdatedAt
 * 2. Latest costUpdatedAt not null
 * 3. Latest updatedAt
 * 4. Fallback to lowest createdAt (oldest record)
 */
export async function getCanonicalPartId(
  prisma: PrismaClient,
  partNo: string
): Promise<string | null> {
  const parts = await prisma.part.findMany({
    where: { partNo },
    select: {
      id: true,
      costSource: true,
      costUpdatedAt: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [
      { costUpdatedAt: 'desc' },
      { updatedAt: 'desc' },
      { createdAt: 'asc' }, // Fallback to oldest if no updates
    ],
  });

  if (parts.length === 0) return null;

  // Priority 1: DPO_RECEIVED with latest costUpdatedAt
  const dpoReceivedParts = parts.filter(
    p => p.costSource === 'DPO_RECEIVED' && p.costUpdatedAt
  );
  if (dpoReceivedParts.length > 0) {
    // Already ordered by costUpdatedAt desc, so first one is latest
    return dpoReceivedParts[0].id;
  }

  // Priority 2: Latest costUpdatedAt not null
  const partsWithCostUpdate = parts.filter(p => p.costUpdatedAt !== null);
  if (partsWithCostUpdate.length > 0) {
    return partsWithCostUpdate[0].id;
  }

  // Priority 3: Latest updatedAt
  const partsWithUpdate = parts.filter(p => p.updatedAt !== null);
  if (partsWithUpdate.length > 0) {
    return partsWithUpdate[0].id;
  }

  // Priority 4: Fallback to lowest createdAt (oldest record)
  return parts[parts.length - 1].id; // Last in asc order = oldest
}

/**
 * Get the canonical Part record for a given partNo
 * Returns the full Part record with relations
 */
export async function getCanonicalPart(
  prisma: PrismaClient,
  partNo: string
) {
  const canonicalId = await getCanonicalPartId(prisma, partNo);
  if (!canonicalId) return null;

  return prisma.part.findUnique({
    where: { id: canonicalId },
    include: {
      MasterPart: true,
      Brand: true,
      Category: true,
      Subcategory: true,
      Application: true,
    },
  });
}

/**
 * Check if a search term is an exact partNo match
 * Returns the partNo if it's an exact match, null otherwise
 */
export async function isExactPartNoMatch(
  prisma: PrismaClient,
  searchTerm: string
): Promise<string | null> {
  const trimmed = searchTerm.trim();
  if (!trimmed) return null;

  // Check if there's an exact match (SQLite doesn't support case-insensitive, so use exact match)
  const exactMatch = await prisma.part.findFirst({
    where: {
      partNo: trimmed,
    },
    select: { partNo: true },
  });

  return exactMatch ? exactMatch.partNo : null;
}
