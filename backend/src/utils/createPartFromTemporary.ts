import { randomUUID } from "crypto";
import prisma from "../config/database";

/**
 * Minimal Part create for promoting temporary quotation/inquiry lines.
 * partNo is required; brand/master part are optional and upserted when provided.
 */
export async function createPartFromTemporaryInput(input: {
  partNo: string;
  description?: string | null;
  brand?: string | null;
  masterPartNo?: string | null;
  weight?: number | null;
  origin?: string | null;
}): Promise<{ id: string; partNo: string; description: string | null; brand: string | null }> {
  const partNo = String(input.partNo || "").trim();
  if (!partNo) {
    throw new Error("Part number is required to save an item.");
  }
  const description = String(input.description || "").trim() || null;
  const brandName = String(input.brand || "").trim() || null;
  const masterPartNo = String(input.masterPartNo || "").trim() || null;
  const origin = String(input.origin || "").trim() || null;
  const weightRaw = Number(input.weight);
  const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : null;

  let masterPartId: string | null = null;
  if (masterPartNo) {
    const masterPart = await prisma.masterPart.upsert({
      where: { masterPartNo },
      update: {},
      create: {
        id: randomUUID(),
        masterPartNo,
        updatedAt: new Date(),
      },
    });
    masterPartId = masterPart.id;
  }

  let brandId: string | null = null;
  if (brandName) {
    const brand = await prisma.brand.upsert({
      where: { name: brandName },
      update: {},
      create: {
        id: randomUUID(),
        name: brandName,
        updatedAt: new Date(),
      } as any,
    });
    brandId = brand.id;
  }

  const existing = await prisma.part.findFirst({
    where: {
      partNo: { equals: partNo, mode: "insensitive" },
      ...(masterPartNo
        ? {
            MasterPart: {
              masterPartNo: { equals: masterPartNo, mode: "insensitive" },
            },
          }
        : { masterPartId: null }),
      ...(brandName
        ? { Brand: { name: { equals: brandName, mode: "insensitive" } } }
        : { brandId: null }),
    },
    select: {
      id: true,
      partNo: true,
      description: true,
      Brand: { select: { name: true } },
    },
  });
  if (existing) {
    return {
      id: existing.id,
      partNo: existing.partNo,
      description: existing.description,
      brand: existing.Brand?.name || brandName,
    };
  }

  const created = await prisma.part.create({
    data: {
      id: randomUUID(),
      partNo,
      description,
      masterPartId,
      brandId,
      weight,
      origin,
      uom: "pcs",
      type: "single",
      status: "active",
      reorderLevel: 0,
      costSource: "MANUAL",
      updatedAt: new Date(),
    } as any,
    select: {
      id: true,
      partNo: true,
      description: true,
      Brand: { select: { name: true } },
    },
  });

  return {
    id: created.id,
    partNo: created.partNo,
    description: created.description,
    brand: created.Brand?.name || brandName,
  };
}
