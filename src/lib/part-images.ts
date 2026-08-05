import { apiClient } from "@/lib/api";

const cleanKey = (value: unknown) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "n/a" || text === "-") return "";
  return text;
};

const familyKeys = (item: {
  partNo?: string | null;
  masterPartNo?: string | null;
  masterPart?: string | null;
}) =>
  [item.partNo, item.masterPartNo, item.masterPart]
    .map(cleanKey)
    .filter((value, index, arr) => value && arr.indexOf(value) === index);

export async function fetchFamilyPartImages(
  partNo?: string | null,
  masterPartNo?: string | null,
): Promise<{ imageP1: string | null; imageP2: string | null } | null> {
  const keys = [partNo, masterPartNo]
    .map((value) => String(value || "").trim())
    .filter((value, index, arr) => value && arr.indexOf(value) === index);
  if (keys.length === 0) return null;

  const requests = keys.flatMap((key) => [
    apiClient.getParts({ part_no: key, limit: 50, page: 1 }),
    apiClient.getParts({ master_part_no: key, limit: 50, page: 1 }),
  ]);

  const responses = await Promise.all(requests);
  let imageP1: string | null = null;
  let imageP2: string | null = null;

  for (const response of responses) {
    const rows = Array.isArray((response as any)?.data)
      ? (response as any).data
      : Array.isArray(response)
        ? response
        : [];
    for (const row of rows) {
      if (!imageP1) {
        imageP1 = String(row.image_p1 || row.imageP1 || "").trim() || null;
      }
      if (!imageP2) {
        imageP2 = String(row.image_p2 || row.imageP2 || "").trim() || null;
      }
      if (imageP1 && imageP2) {
        return { imageP1, imageP2 };
      }
    }
  }

  if (!imageP1 && !imageP2) return null;
  return { imageP1, imageP2 };
}

export function shareImagesAcrossFamilyItems<
  T extends {
    partNo?: string | null;
    masterPartNo?: string | null;
    masterPart?: string | null;
    images?: string[];
  },
>(items: T[]): T[] {
  const imageByKey = new Map<string, string[]>();

  for (const item of items) {
    const images = (item.images || []).filter(Boolean);
    if (images.length === 0) continue;
    for (const key of familyKeys(item)) {
      const existing = imageByKey.get(key);
      if (!existing || existing.length < images.length) {
        imageByKey.set(key, images);
      }
    }
  }

  return items.map((item) => {
    if ((item.images || []).some(Boolean)) return item;
    for (const key of familyKeys(item)) {
      const shared = imageByKey.get(key);
      if (shared?.length) return { ...item, images: shared };
    }
    return item;
  });
}
