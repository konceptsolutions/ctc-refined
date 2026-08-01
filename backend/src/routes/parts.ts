import { randomUUID } from "crypto";
import express, { Request, Response } from "express";
import { query } from "../config/db";
import { Prisma } from "@prisma/client";
import prisma from "../config/database";
import {
  isExactPartNoMatch,
  getCanonicalPartId,
} from "../services/partCanonical";

const router = express.Router();

/** Matches Prisma schema; use when generated client omits `componentPartId`. */
type KitItemRecord = {
  id: string;
  partId: string;
  componentPartId?: string | null;
  partNo: string;
  partName: string;
  quantity: number;
  costPerUnit: number;
  createdAt: Date;
  updatedAt: Date;
};

const kitComponentPartId = (row: Pick<KitItemRecord, "componentPartId">) =>
  row.componentPartId ? String(row.componentPartId).trim() : "";

type PartDeletabilityInput = {
  currentStock: number;
  reservedStock: number;
  adjustmentCount: number;
  directPurchaseCount: number;
  salesInvoiceCount: number;
  kitComponentCount: number;
};

const evaluatePartDeletability = (
  input: PartDeletabilityInput,
): { canDelete: boolean; reason: string | null } => {
  if (input.currentStock !== 0) {
    return {
      canDelete: false,
      reason: "Current stock must be zero before deleting this item.",
    };
  }
  if (input.reservedStock !== 0) {
    return {
      canDelete: false,
      reason: "Reserved stock must be zero before deleting this item.",
    };
  }
  if (input.adjustmentCount > 0) {
    return {
      canDelete: false,
      reason: "This item has inventory adjustment history and cannot be deleted.",
    };
  }
  if (input.directPurchaseCount > 0) {
    return {
      canDelete: false,
      reason: "This item has direct purchase history and cannot be deleted.",
    };
  }
  if (input.salesInvoiceCount > 0) {
    return {
      canDelete: false,
      reason: "This item has sales history and cannot be deleted.",
    };
  }
  if (input.kitComponentCount > 0) {
    return {
      canDelete: false,
      reason: "This item is used as a kit component and cannot be deleted.",
    };
  }
  return { canDelete: true, reason: null };
};

const getPartDeletabilityCounts = async (partId: string) => {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: { id: true },
  });
  if (!part) {
    return null;
  }

  const stockByPartId = await getCurrentStockByPartIds([partId]);
  const reservedAgg = await prisma.stockReservation.aggregate({
    where: { partId, status: "reserved" },
    _sum: { quantity: true },
  });

  const kitComponentRows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "KitItem"
    WHERE "componentPartId" = ${partId}
  `;

  const [
    adjustmentCount,
    directPurchaseCount,
    salesInvoiceCount,
  ] = await Promise.all([
    prisma.adjustmentItem.count({ where: { partId } }),
    prisma.directPurchaseOrderItem.count({ where: { partId } }),
    prisma.salesInvoiceItem.count({ where: { partId } }),
  ]);
  const kitComponentCount = Number(kitComponentRows[0]?.count || 0);

  return evaluatePartDeletability({
    currentStock: Number(stockByPartId.get(partId) || 0),
    reservedStock: Number(reservedAgg._sum.quantity || 0),
    adjustmentCount,
    directPurchaseCount,
    salesInvoiceCount,
    kitComponentCount,
  });
};

const normalizePartType = (value: any): "single" | "kit" => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "kit" ? "kit" : "single";
};

const normalizeKitItemsPayload = (kitItems: any): { itemPartId: string; quantity: number }[] => {
  if (!Array.isArray(kitItems)) return [];

  const byPartId = new Map<string, number>();
  kitItems.forEach((row: any) => {
    // Do not read row.partId — on KitItem rows that is the parent kit Part id, not the component.
    const itemPartId = String(
      row?.item_part_id ||
        row?.itemPartId ||
        row?.component_part_id ||
        row?.componentPartId ||
        row?.part_id ||
        "",
    ).trim();
    const quantityValue = Number(row?.quantity || row?.qty || 0);
    const quantity = Number.isFinite(quantityValue)
      ? Math.max(1, Math.floor(quantityValue))
      : 1;
    if (!itemPartId) return;
    byPartId.set(itemPartId, (byPartId.get(itemPartId) || 0) + quantity);
  });

  return Array.from(byPartId.entries()).map(([itemPartId, quantity]) => ({
    itemPartId,
    quantity,
  }));
};

type KitComponentRow = {
  id: string;
  partNo: string;
  description: string | null;
  cost: number | null;
};

type DbClient = Pick<typeof prisma, "kitItem" | "part">;

const validateKitComponents = async (
  normalizedKitItems: { itemPartId: string; quantity: number }[],
  db: DbClient = prisma,
): Promise<KitComponentRow[]> => {
  if (!normalizedKitItems.length) return [];

  const componentPartIds = normalizedKitItems.map((row) => row.itemPartId);
  const validatedKitComponents = await db.part.findMany({
    where: {
      id: { in: componentPartIds },
      type: "single",
      status: "active",
    },
    select: {
      id: true,
      partNo: true,
      description: true,
      cost: true,
    },
  });

  if (validatedKitComponents.length !== new Set(componentPartIds).size) {
    throw new Error("Kit items must be active single-type parts");
  }

  return validatedKitComponents;
};

const buildKitItemCreateRows = (
  parentPartId: string,
  normalizedKitItems: { itemPartId: string; quantity: number }[],
  validatedKitComponents: KitComponentRow[],
) => {
  const componentById = new Map(
    validatedKitComponents.map((row) => [row.id, row]),
  );
  const now = new Date();

  return normalizedKitItems
    .map((row) => {
      const component = componentById.get(row.itemPartId);
      if (!component) return null;
      return {
        id: randomUUID(),
        partId: parentPartId,
        componentPartId: row.itemPartId,
        partNo: component.partNo,
        partName: component.description || component.partNo,
        quantity: row.quantity,
        costPerUnit: component.cost || 0,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter(Boolean) as {
    id: string;
    partId: string;
    componentPartId: string;
    partNo: string;
    partName: string;
    quantity: number;
    costPerUnit: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
};

const syncKitItemsForParentPart = async (
  db: DbClient,
  parentPartId: string,
  kitItemsPayload: unknown,
  partType: "single" | "kit",
) => {
  const parent = await db.part.findUnique({
    where: { id: parentPartId },
    select: { id: true },
  });
  if (!parent) {
    throw new Error("Part not found");
  }

  if (partType === "single") {
    await db.kitItem.deleteMany({ where: { partId: parentPartId } });
    return;
  }

  if (!Array.isArray(kitItemsPayload)) return;

  const normalizedKitItems = normalizeKitItemsPayload(kitItemsPayload);
  if (normalizedKitItems.some((row) => row.itemPartId === parentPartId)) {
    throw new Error("A kit cannot include itself as a component");
  }
  await db.kitItem.deleteMany({ where: { partId: parentPartId } });

  if (!normalizedKitItems.length) return;

  const validatedKitComponents = await validateKitComponents(
    normalizedKitItems,
    db,
  );
  const rows = buildKitItemCreateRows(
    parentPartId,
    normalizedKitItems,
    validatedKitComponents,
  );
  if (rows.length > 0) {
    await db.kitItem.createMany({ data: rows });
  }
};

const buildKitItemsResponse = async (
  kitItems: {
    partNo: string;
    partName: string;
    quantity: number;
    costPerUnit: number;
    componentPartId?: string | null;
  }[],
) => {
  if (!kitItems.length) return [];

  const byComponentId = new Map<
    string,
    { id: string; partNo: string; description: string | null; cost: number | null }
  >();
  const componentIds = Array.from(
    new Set(
      kitItems
        .map((row) => String(row?.componentPartId || "").trim())
        .filter(Boolean),
    ),
  );
  if (componentIds.length > 0) {
    const resolved = await prisma.part.findMany({
      where: {
        id: { in: componentIds },
        type: "single",
        status: "active",
      },
      select: { id: true, partNo: true, description: true, cost: true },
    });
    resolved.forEach((p) => byComponentId.set(p.id, p));
  }

  const legacyPartNos = Array.from(
    new Set(
      kitItems
        .filter((row) => !String(row?.componentPartId || "").trim())
        .map((row) => String(row?.partNo || "").trim())
        .filter((value) => value !== ""),
    ),
  );

  const singlePartByPartNo = new Map<
    string,
    { id: string; partNo: string; description: string | null; cost: number | null }
  >();
  if (legacyPartNos.length > 0) {
    const singleParts = await prisma.part.findMany({
      where: {
        partNo: { in: legacyPartNos },
        type: "single",
        status: "active",
      },
      select: {
        id: true,
        partNo: true,
        description: true,
        cost: true,
      },
    });
    singleParts.forEach((part) => {
      if (!singlePartByPartNo.has(part.partNo)) {
        singlePartByPartNo.set(part.partNo, part);
      }
    });
  }

  return kitItems.map((row) => {
    const cid = String(row?.componentPartId || "").trim();
    if (cid) {
      const linked = byComponentId.get(cid);
      return {
        item_part_id: linked?.id || null,
        item_part_no: linked?.partNo || row.partNo,
        item_description: row.partName || linked?.description || row.partNo,
        quantity: row.quantity || 1,
        cost_per_unit: row.costPerUnit ?? linked?.cost ?? 0,
      };
    }
    const linkedPart = singlePartByPartNo.get(row.partNo);
    return {
      item_part_id: linkedPart?.id || null,
      item_part_no: row.partNo,
      item_description: row.partName || linkedPart?.description || row.partNo,
      quantity: row.quantity || 1,
      cost_per_unit: row.costPerUnit ?? linkedPart?.cost ?? 0,
    };
  });
};

const buildKitOperationDetails = async (kitPartId: string) => {
  const kitPart = await prisma.part.findUnique({
    where: { id: kitPartId },
    include: { KitItem: true },
  });
  if (!kitPart) return null;
  if ((kitPart.type || "single") !== "kit") {
    return { error: "not_kit" as const };
  }

  const kitItemRows = ((kitPart as { KitItem?: KitItemRecord[] }).KitItem ||
    []) as KitItemRecord[];

  const componentIds = new Set<string>();
  const legacyPartNos = new Set<string>();
  kitItemRows.forEach((row) => {
    const cid = kitComponentPartId(row);
    if (cid) componentIds.add(cid);
    else {
      const partNo = String(row.partNo || "").trim();
      if (partNo) legacyPartNos.add(partNo);
    }
  });

  const legacyParts = legacyPartNos.size
    ? await prisma.part.findMany({
        where: {
          partNo: { in: Array.from(legacyPartNos) },
          type: "single",
          status: "active",
        },
        select: { id: true, partNo: true },
      })
    : [];

  const resolvedComponents = componentIds.size
    ? await prisma.part.findMany({
        where: { id: { in: Array.from(componentIds) } },
        select: {
          id: true,
          partNo: true,
          description: true,
          MasterPart: { select: { masterPartNo: true } },
          Brand: { select: { name: true } },
        },
      })
    : [];
  const componentById = new Map(resolvedComponents.map((row) => [row.id, row]));

  const stockPartIds = [
    kitPartId,
    ...Array.from(componentIds),
    ...legacyParts.map((row) => row.id),
  ];
  const stockByPartId = await getCurrentStockByPartIds(stockPartIds);

  const stockByPartNo = new Map<string, number>();
  legacyParts.forEach((row) => {
    const partNo = String(row.partNo || "").trim();
    if (!partNo) return;
    stockByPartNo.set(
      partNo,
      (stockByPartNo.get(partNo) || 0) + Number(stockByPartId.get(row.id) || 0),
    );
  });

  const kitItems = kitItemRows
    .map((row) => {
      const cid = kitComponentPartId(row);
      const linked = cid ? componentById.get(cid) : undefined;
      const legacyMatch = !cid
        ? legacyParts.find((p) => p.partNo === row.partNo)
        : undefined;
      const itemPartId = cid || legacyMatch?.id || "";
      if (!itemPartId) return null;

      const partNo = linked?.partNo || String(row.partNo || "").trim();
      const stock = cid
        ? Number(stockByPartId.get(cid) || 0)
        : Number(stockByPartNo.get(partNo) || 0);

      return {
        item_part_id: itemPartId,
        master_part_no: linked?.MasterPart?.masterPartNo || "",
        item_part_no: partNo,
        item_description:
          linked?.description || row.partName || partNo,
        brand_name: linked?.Brand?.name || "",
        quantity: Math.max(1, Number(row.quantity || 1)),
        stock,
      };
    })
    .filter(Boolean);

  return {
    kit_stock: Number(stockByPartId.get(kitPartId) || 0),
    kit_items: kitItems,
  };
};

const getCurrentStockByPartIds = async (partIds: string[]) => {
  const stockByPartId = new Map<string, number>();
  if (!partIds.length) return stockByPartId;

  partIds.forEach((id) => stockByPartId.set(id, 0));

  const grouped = await prisma.stockMovement.groupBy({
    by: ["partId", "type"],
    where: {
      partId: { in: partIds },
      OR: [{ referenceType: null }, { referenceType: { not: "stock_reservation" } }],
    },
    _sum: { quantity: true },
  });

  grouped.forEach((row) => {
    const current = stockByPartId.get(row.partId) || 0;
    const qty = Number(row._sum.quantity || 0);
    stockByPartId.set(
      row.partId,
      row.type === "in" ? current + qty : current - qty,
    );
  });

  return stockByPartId;
};

// Dedicated API for Part Entry screen - Optimized for quick loading and accurate stock
router.get("/part-entry-list", async (req: Request, res: Response) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );

  try {
    const {
      search,
      part_no, // Filter by exact part_no (used for family matching)
      page = "1",
      limit = "100",
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    let limitNum = limit === "all" ? 100000 : parseInt(limit as string) || 1000;
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [`p."status" = 'active'`];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      const rawSearch = String(search).trim();
      const searchStr = `%${rawSearch}%`;
      const normalizedSearch = rawSearch;
      conditions.push(`(
        p."partNo" ILIKE $${paramIdx} OR 
        p."description" ILIKE $${paramIdx} OR 
        mp."masterPartNo" ILIKE $${paramIdx} OR
        regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
        regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%'
      )`);
      params.push(searchStr);
      params.push(normalizedSearch);
      paramIdx += 2;
    }

    if (part_no) {
      conditions.push(`(p."partNo" ILIKE $${paramIdx} OR mp."masterPartNo" ILIKE $${paramIdx})`);
      params.push(`%${(part_no as string).trim()}%`);
      paramIdx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        p.id, p."partNo" as part_no, p."masterPartId", p.description, p.cost, p."priceA" as price_a, p."priceB" as price_b, p."type",
        p.uom, p.weight, p."updatedAt" as updated_at,
        mp."masterPartNo" as master_part_no,
        b."name" as brand_name,
        COALESCE(st.stock, 0) as stock,
        COALESCE(sr.reserved, 0) as reserved_stock
      FROM "Part" p
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      LEFT JOIN (
          SELECT "partId", 
            SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as stock
          FROM "StockMovement"
          GROUP BY "partId"
      ) st ON p.id = st."partId"
      LEFT JOIN (
          SELECT "partId", 
            SUM(quantity) as reserved
          FROM "StockReservation"
          WHERE status = 'reserved'
          GROUP BY "partId"
      ) sr ON p.id = sr."partId"
      ${whereClause}
      ORDER BY p."updatedAt" DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    params.push(limitNum, offset);
    const result = await query(sql, params);
    const partIds = result.rows.map((r: any) => r.id);

    // Model total qty per part (sum of qtyUsed); use sibling's total when part has no models
    let modelTotalByPartId: Record<string, number> = {};
    if (partIds.length > 0) {
      const modelSums = await prisma.model.groupBy({
        by: ["partId"],
        where: { partId: { in: partIds } },
        _sum: { qtyUsed: true },
      });
      modelSums.forEach((row) => {
        modelTotalByPartId[row.partId] = row._sum.qtyUsed || 0;
      });

      // Helper: get model total for any part in DB by partNo or masterPartId
      const getModelTotalByPartNo = async (partNo: string): Promise<number> => {
        const trimmed = (partNo || "").trim();
        if (!trimmed) return 0;
        const other = await prisma.part.findFirst({
          where: { partNo: trimmed, status: "active", Model: { some: {} } },
          include: { Model: true },
        });
        if (!other?.Model?.length) return 0;
        return other.Model.reduce((s, m) => s + (m.qtyUsed || 0), 0);
      };
      const getModelTotalByMasterPartId = async (masterPartId: string): Promise<number> => {
        const other = await prisma.part.findFirst({
          where: { masterPartId, status: "active", Model: { some: {} } },
          include: { Model: true },
        });
        if (!other?.Model?.length) return 0;
        return other.Model.reduce((s, m) => s + (m.qtyUsed || 0), 0);
      };

      // For each part in result with 0 model total, look up sibling in full DB by part_no (Part.partNo)
      const partNosToResolve = new Set<string>();
      result.rows.forEach((p: any) => {
        const total = modelTotalByPartId[p.id] ?? 0;
        if (total === 0) {
          const pno = (p.part_no != null && String(p.part_no).trim() !== "") ? String(p.part_no).trim() : null;
          if (pno) partNosToResolve.add(pno);
        }
      });
      const partNoToTotal: Record<string, number> = {};
      await Promise.all(
        Array.from(partNosToResolve).map(async (pno) => {
          const tot = await getModelTotalByPartNo(pno);
          if (tot > 0) partNoToTotal[pno] = tot;
        }),
      );
      result.rows.forEach((p: any) => {
        const pid = p.id;
        if ((modelTotalByPartId[pid] ?? 0) === 0) {
          const pno = (p.part_no != null && String(p.part_no).trim() !== "") ? String(p.part_no).trim() : null;
          if (pno && partNoToTotal[pno] != null) modelTotalByPartId[pid] = partNoToTotal[pno];
        }
      });

      // Same by master part: parts with 0 and a masterPartId get total from any sibling in DB
      const masterIdsToResolve = new Set<string>();
      result.rows.forEach((p: any) => {
        const total = modelTotalByPartId[p.id] ?? 0;
        if (total === 0) {
          const mid = p.masterPartId || p.masterpartid;
          if (mid) masterIdsToResolve.add(mid);
        }
      });
      const masterIdToTotal: Record<string, number> = {};
      await Promise.all(
        Array.from(masterIdsToResolve).map(async (mid) => {
          const tot = await getModelTotalByMasterPartId(mid);
          if (tot > 0) masterIdToTotal[mid] = tot;
        }),
      );
      result.rows.forEach((p: any) => {
        const pid = p.id;
        if ((modelTotalByPartId[pid] ?? 0) === 0) {
          const mid = p.masterPartId || p.masterpartid;
          if (mid && masterIdToTotal[mid] != null) modelTotalByPartId[pid] = masterIdToTotal[mid];
        }
      });
    }

    res.json({
      success: true,
      data: result.rows.map((p: any) => ({
        id: p.id,
        part_no: p.part_no,
        master_part_no: p.master_part_no,
        brand_name: p.brand_name,
        description: p.description,
        type: p.type || "single",
        uom: p.uom,
        weight: p.weight,
        cost: p.cost,
        price_a: p.price_a,
        price_b: p.price_b,
        stock: parseInt(p.stock) || 0,
        reserved_stock: parseInt(p.reserved_stock) || 0,
        updated_at: p.updated_at,
        model_total_qty: modelTotalByPartId[p.id] ?? 0,
      })),
    });
  } catch (error: any) {
    console.error("Error in part-entry-list API:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all parts with filters
router.get("/", async (req: Request, res: Response) => {
  // Add cache headers to prevent stale data
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const {
      search,
      category_id,
      category_name,
      subcategory_id,
      subcategory_name,
      brand_id,
      brand_name,
      application_id,
      application_name,
      part_type,
      status,
      master_part_no,
      part_no,
      description,
      include_locations = "false",
      duplicates_only,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    let limitNum = limit === "all" ? 100000 : parseInt(limit as string) || 1000;
    const offset = (pageNum - 1) * limitNum;

    // ... (rest of conditions logic)
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Build WHERE clause
    if (search) {
      const { update_mode } = req.query;
      const searchStr = (search as string).trim();
      const searchPattern = `%${searchStr}%`;
      const normalizedSearchPattern = searchStr;

      if (update_mode === "group") {
        // Expand search to include all "family items" (parts sharing the same masterPartId)
        conditions.push(`(
          p."partNo" ILIKE $${paramIdx} OR 
          p."description" ILIKE $${paramIdx} OR 
          mp."masterPartNo" ILIKE $${paramIdx} OR
          regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
          regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
          (p."masterPartId" IS NOT NULL AND p."masterPartId" IN (
              SELECT "masterPartId" FROM "Part" 
              WHERE "partNo" ILIKE $${paramIdx} AND "masterPartId" IS NOT NULL
              UNION
              SELECT id FROM "MasterPart" 
              WHERE "masterPartNo" ILIKE $${paramIdx}
          ))
        )`);
      } else {
        // Standard search for individual items
        conditions.push(`(
          p."partNo" ILIKE $${paramIdx} OR 
          p."description" ILIKE $${paramIdx} OR 
          mp."masterPartNo" ILIKE $${paramIdx} OR
          regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
          regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%'
        )`);
      }
      params.push(searchPattern);
      params.push(normalizedSearchPattern);
      paramIdx += 2;
    }

    if (category_id) {
      conditions.push(`p."categoryId" = $${paramIdx++}`);
      params.push(category_id);
    }

    if (category_name && category_name !== "all") {
      conditions.push(`c."name" = $${paramIdx++}`);
      params.push(category_name);
    }

    if (subcategory_id) {
      conditions.push(`p."subcategoryId" = $${paramIdx++}`);
      params.push(subcategory_id);
    }

    if (subcategory_name && subcategory_name !== "all") {
      conditions.push(`sc."name" = $${paramIdx++}`);
      params.push(subcategory_name);
    }

    if (brand_id) {
      conditions.push(`p."brandId" = $${paramIdx++}`);
      params.push(brand_id);
    }

    if (brand_name) {
      conditions.push(`b."name" = $${paramIdx++}`);
      params.push(brand_name);
    }

    if (application_id) {
      conditions.push(`p."applicationId" = $${paramIdx++}`);
      params.push(application_id);
    }

    if (application_name && application_name !== "all") {
      conditions.push(`app."name" = $${paramIdx++}`);
      params.push(application_name);
    }

    if (part_type && part_type !== "all") {
      const normalizedPartType = String(part_type).trim().toLowerCase();
      if (normalizedPartType === "single" || normalizedPartType === "kit") {
        conditions.push(`p."type" = $${paramIdx++}`);
        params.push(normalizedPartType);
      }
    }

    if (master_part_no) {
      conditions.push(`(mp."masterPartNo" ILIKE $${paramIdx} OR p."partNo" ILIKE $${paramIdx})`);
      params.push(`%${(master_part_no as string).trim()}%`);
      paramIdx++;
    }

    if (part_no) {
      conditions.push(`(p."partNo" ILIKE $${paramIdx} OR mp."masterPartNo" ILIKE $${paramIdx})`);
      params.push(`%${(part_no as string).trim()}%`);
      paramIdx++;
    }

    if (description) {
      conditions.push(`p."description" ILIKE $${paramIdx++}`);
      params.push(`%${(description as string).trim()}%`);
    }

    const partDuplicateKeySql = `CONCAT(
      LOWER(TRIM(COALESCE(p."partNo", ''))), '|',
      LOWER(TRIM(COALESCE(mp."masterPartNo", ''))), '|',
      LOWER(TRIM(COALESCE(p."description", ''))), '|',
      LOWER(TRIM(COALESCE(app."name", ''))), '|',
      LOWER(TRIM(COALESCE(b."name", '')))
    )`;

    if (duplicates_only === "true") {
      conditions.push(`${partDuplicateKeySql} IN (
        SELECT dup_key FROM (
          SELECT
            CONCAT(
              LOWER(TRIM(COALESCE(p2."partNo", ''))), '|',
              LOWER(TRIM(COALESCE(mp2."masterPartNo", ''))), '|',
              LOWER(TRIM(COALESCE(p2."description", ''))), '|',
              LOWER(TRIM(COALESCE(app2."name", ''))), '|',
              LOWER(TRIM(COALESCE(b2."name", '')))
            ) AS dup_key,
            COUNT(*)::int AS cnt
          FROM "Part" p2
          LEFT JOIN "MasterPart" mp2 ON p2."masterPartId" = mp2.id
          LEFT JOIN "Brand" b2 ON p2."brandId" = b2.id
          LEFT JOIN "Application" app2 ON p2."applicationId" = app2.id
          GROUP BY 1
          HAVING COUNT(*) > 1
        ) duplicate_groups
      )`);
    }

    if (status) {
      conditions.push(`p."status" = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Skip images for large result sets to reduce payload size (29MB -> <1MB)
    const skipImages = limitNum > 1000;
    const showLocations = include_locations === "true";
    const showDuplicateMeta = duplicates_only === "true";
    const orderByClause = showDuplicateMeta
      ? `ORDER BY ${partDuplicateKeySql}, p."partNo", p."id"`
      : `ORDER BY p."updatedAt" DESC`;

    const sql = `
      SELECT 
        p.id, p."partNo", p."type", p.description, p."hsCode", p.weight, p."reorderLevel", p.uom, p.status, p."createdAt", p."updatedAt",
        p."masterPartId", p."brandId", p."categoryId", p."subcategoryId", p."applicationId",
        p.cost, p."purchasePrice", p."avgCost", p."priceA", p."priceB", p."priceM",
        mp."masterPartNo" as master_part_no,
        b."name" as brand_name,
        c."name" as category_name,
        sc."name" as subcategory_name,
        app."name" as application_name,
        COALESCE(st.stock, 0) as current_stock,
        (COALESCE(st.reserved, 0) + COALESCE(sr.reserved, 0)) as reserved_stock,
        (SELECT COUNT(*)::int FROM "AdjustmentItem" ai WHERE ai."partId" = p.id) as adjustment_count,
        (SELECT COUNT(*)::int FROM "DirectPurchaseOrderItem" dpoi WHERE dpoi."partId" = p.id) as direct_purchase_count,
        (SELECT COUNT(*)::int FROM "SalesInvoiceItem" sii_cnt WHERE sii_cnt."partId" = p.id) as sales_invoice_count,
        (SELECT COUNT(*)::int FROM "KitItem" ki_cmp WHERE ki_cmp."componentPartId" = p.id) as kit_component_count,
        lac.cost as latest_adj_cost,
        ls.last_sale_qty,
        ls.last_sale_price,
        ls.last_sale_customer,
        ls.last_sale_date,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', m.id,
                'name', m.name,
                'qty_used', m."qtyUsed"
              )
            )
            FROM "Model" m
            WHERE m."partId" = p.id
          ),
          '[]'::json
        ) as models
        ${showDuplicateMeta ? `, ${partDuplicateKeySql} as duplicate_key, COUNT(*) OVER (PARTITION BY ${partDuplicateKeySql})::int as duplicate_group_size` : ""}
        ${showLocations ? ", COALESCE(loc.locations, '[]'::jsonb) as locations, (COALESCE(st.stock, 0) - COALESCE(loc.assigned_stock, 0)) as unlocated_stock" : ""}
        ${skipImages ? "" : ', p."imageP1", p."imageP2"'}
      FROM "Part" p
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "Subcategory" sc ON p."subcategoryId" = sc.id
      LEFT JOIN "Application" app ON p."applicationId" = app.id
      LEFT JOIN (
          SELECT "partId", 
            SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as stock,
            SUM(CASE WHEN "referenceType" = 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as reserved
          FROM "StockMovement"
          GROUP BY "partId"
      ) st ON p.id = st."partId"
      LEFT JOIN (
          SELECT "partId", SUM(quantity) as reserved
          FROM "StockReservation"
          WHERE status = 'reserved'
          GROUP BY "partId"
      ) sr ON p.id = sr."partId"
      LEFT JOIN (
          SELECT DISTINCT ON (ai."partId") ai."partId", ai.cost
          FROM "AdjustmentItem" ai
          JOIN "Adjustment" a ON ai."adjustmentId" = a.id
          WHERE a.status = 'approved' AND a."deletedAt" IS NULL
          ORDER BY ai."partId", a.date DESC, a."createdAt" DESC, ai."createdAt" DESC
      ) lac ON p.id = lac."partId"
      LEFT JOIN LATERAL (
          SELECT
            sii."orderedQty" as last_sale_qty,
            sii."unitPrice" as last_sale_price,
            si."customerName" as last_sale_customer,
            si."invoiceDate" as last_sale_date
          FROM "SalesInvoiceItem" sii
          JOIN "SalesInvoice" si ON sii."invoiceId" = si.id
          WHERE sii."partId" = p.id
          ORDER BY si."invoiceDate" DESC, sii."createdAt" DESC
          LIMIT 1
      ) ls ON true
      ${showLocations ? `
      LEFT JOIN (
          SELECT prs."partId",
            jsonb_agg(jsonb_build_object(
              'id', prs.id,
              'storeId', prs."storeId",
              'storeName', s_loc.name,
              'rackId', prs."rackId",
              'rackCode', r_loc."codeNo",
              'shelfId', prs."shelfId",
              'shelfNo', sh_loc."shelfNo",
              'quantity', prs.quantity
            )) as locations,
            SUM(prs.quantity) as assigned_stock
          FROM "PartRackShelf" prs
          LEFT JOIN "Store" s_loc ON prs."storeId" = s_loc.id
          LEFT JOIN "Rack" r_loc ON prs."rackId" = r_loc.id
          LEFT JOIN "Shelf" sh_loc ON prs."shelfId" = sh_loc.id
          GROUP BY prs."partId"
      ) loc ON p.id = loc."partId" ` : ""}
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    params.push(limitNum, offset);

    const result = await query(sql, params);
    const countResult = await query(
      `SELECT count(*) as total FROM "Part" p 
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "Subcategory" sc ON p."subcategoryId" = sc.id
      LEFT JOIN "Application" app ON p."applicationId" = app.id
    ${whereClause}`,
      params.slice(0, -2),
    ); // Remove limit/offset params

    const total = parseInt(countResult.rows[0].total);

    // Transform response
    const transformedParts = result.rows.map((part) => {
      // PostgreSQL returns lowercase column names from raw SQL
      const rawPurchasePrice = part.purchasePrice || part.purchaseprice || null;
      const rawAvgCost = part.avgCost || part.avgcost || null;
      const latestAdjCost = part.latest_adj_cost || null;
      const currentStock =
        parseInt(part.current_stock || part.currentstock) || 0;
      const reservedStock =
        parseInt(part.reserved_stock || part.reservedstock) || 0;
      const deletability = evaluatePartDeletability({
        currentStock,
        reservedStock,
        adjustmentCount: parseInt(part.adjustment_count) || 0,
        directPurchaseCount: parseInt(part.direct_purchase_count) || 0,
        salesInvoiceCount: parseInt(part.sales_invoice_count) || 0,
        kitComponentCount: parseInt(part.kit_component_count) || 0,
      });

      return {
        id: part.id || part.ID,
        master_part_no: part.master_part_no || part.masterpartno,
        part_no: part.partNo || part.partno,
        brand_name: part.brand_name || part.brandname,
        category_name: part.category_name || part.categoryname,
        subcategory_name: part.subcategory_name || part.subcategoryname,
        application_name: part.application_name || part.applicationname,
        description: part.description,
        hs_code: part.hsCode || part.hscode,
        weight: part.weight,
        reorder_level: part.reorderLevel || part.reorderlevel,
        uom: part.uom,
        qty: currentStock,
        stock: currentStock,
        reserved_stock: reservedStock,
        can_delete: deletability.canDelete,
        delete_block_reason: deletability.reason,
        cost: part.cost,
        // Fallback: Use latest approved adjustment cost if available in history, otherwise show 0 if no transactions exist
        purchasePrice: rawPurchasePrice || latestAdjCost || 0,
        avgCost: rawAvgCost || latestAdjCost || 0,

        price_a: part.priceA ?? part.pricea ?? null,
        price_b: part.priceB ?? part.priceb ?? null,
        price_m: part.priceM ?? part.pricem ?? null,
        lastSaleQty: parseInt(part.last_sale_qty) || 0,
        lastSalePrice: parseFloat(part.last_sale_price) || 0,
        lastSaleCustomerName: part.last_sale_customer || "",
        lastSaleDate: part.last_sale_date || null,
        models: part.models || [],
        // Only include images for small result sets
        image_p1: skipImages ? null : part.imageP1 || part.imagep1,
        image_p2: skipImages ? null : part.imageP2 || part.imagep2,
        status: part.status,
        type: part.type || "single",
        locations: part.locations || [],
        unlocated_stock: Math.max(0, parseInt(part.unlocated_stock) || 0),
        created_at: part.createdAt || part.createdat,
        updated_at: part.updatedAt || part.updatedat,
        duplicate_key: part.duplicate_key || part.duplicatekey || null,
        duplicate_group_size:
          parseInt(part.duplicate_group_size || part.duplicategroupsize) || null,
      };
    });

    res.json({
      data: transformedParts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("Error fetching parts (GET /):", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Dedicated minimal route for Details Item Search - returns only essential fields, no images
router.get("/details-search", async (req: Request, res: Response) => {
  try {
    const {
      search,
      category_name,
      subcategory_name,
      brand_name,
      model,
      update_mode,
      page = "1",
      limit = "100",
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    let limitNum = limit === "all" ? 100000 : parseInt(limit as string) || 1000;
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [`p."status" = 'active'`];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      const searchStr = (search as string).trim();
      const searchPattern = `%${searchStr}%`;
      const normalizedSearchPattern = searchStr;

      if (update_mode === "group") {
        // Expand search to include all "family items" (parts sharing the same masterPartId)
        conditions.push(`(
          p."partNo" ILIKE $${paramIdx} OR 
          p."description" ILIKE $${paramIdx} OR 
          mp."masterPartNo" ILIKE $${paramIdx} OR
          regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
          regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
          (p."masterPartId" IS NOT NULL AND p."masterPartId" IN (
              SELECT "masterPartId" FROM "Part" 
              WHERE "partNo" ILIKE $${paramIdx} AND "masterPartId" IS NOT NULL
              UNION
              SELECT id FROM "MasterPart" 
              WHERE "masterPartNo" ILIKE $${paramIdx}
          ))
        )`);
      } else {
        // Standard search for individual items
        conditions.push(`(
          p."partNo" ILIKE $${paramIdx} OR 
          p."description" ILIKE $${paramIdx} OR 
          mp."masterPartNo" ILIKE $${paramIdx} OR
          regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
          regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%'
        )`);
      }
      params.push(searchPattern);
      params.push(normalizedSearchPattern);
      paramIdx += 2;
    }

    if (category_name && category_name !== "all") {
      conditions.push(`c."name" ILIKE $${paramIdx++}`);
      params.push(`%${(category_name as string).trim()}%`);
    }

    if (subcategory_name && subcategory_name !== "all") {
      conditions.push(`sc."name" ILIKE $${paramIdx++}`);
      params.push(`%${(subcategory_name as string).trim()}%`);
    }

    if (brand_name && brand_name !== "all") {
      conditions.push(`b."name" ILIKE $${paramIdx++}`);
      params.push(`%${(brand_name as string).trim()}%`);
    }

    if (model) {
      conditions.push(`EXISTS (
        SELECT 1 FROM "Model" m 
        WHERE m."partId" = p.id AND m."name" ILIKE $${paramIdx++}
      )`);
      params.push(`%${(model as string).trim()}%`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        p.id, p."partNo" as part_no, p.description, p.cost, p."purchasePrice" as purchase_price, p."avgCost" as avg_cost, 
        p."priceA" as price_a, p."priceB" as price_b, p."priceM" as price_m, p."updatedAt" as updated_at,
        mp."masterPartNo" as master_part_no,
        b."name" as brand_name,
        c."name" as category_name,
        sc."name" as subcategory_name,
        COALESCE(st.stock, 0) as stock,
        COALESCE(sr.reserved, 0) as reserved_stock,
        ph."createdAt" as price_rev_date,
        loc.stores, loc.racks, loc.shelves
      FROM "Part" p
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "Subcategory" sc ON p."subcategoryId" = sc.id
      LEFT JOIN (
          SELECT "partId", SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as stock
          FROM "StockMovement"
          GROUP BY "partId"
      ) st ON p.id = st."partId"
      LEFT JOIN (
          SELECT "partId", SUM(quantity) as reserved
          FROM "StockReservation"
          WHERE status = 'reserved'
          GROUP BY "partId"
      ) sr ON p.id = sr."partId"
      LEFT JOIN (
          SELECT DISTINCT ON ("partId") "partId", "createdAt"
          FROM "PriceHistory"
          ORDER BY "partId", "createdAt" DESC
      ) ph ON p.id = ph."partId"
      LEFT JOIN (
          SELECT prs."partId",
            string_agg(DISTINCT s_loc.name, ', ') as stores,
            string_agg(DISTINCT r_loc."codeNo", ', ') as racks,
            string_agg(DISTINCT sh_loc."shelfNo", ', ') as shelves
          FROM "PartRackShelf" prs
          LEFT JOIN "Store" s_loc ON prs."storeId" = s_loc.id
          LEFT JOIN "Rack" r_loc ON prs."rackId" = r_loc.id
          LEFT JOIN "Shelf" sh_loc ON prs."shelfId" = sh_loc.id
          GROUP BY prs."partId"
      ) loc ON p.id = loc."partId"
      ${whereClause}
      ORDER BY p."updatedAt" DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    params.push(limitNum, offset);
    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("Error in details-search API:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// End of replaced block, keep remaining routes...

// Get parts for price management (with stock quantities) - MUST BE BEFORE /:id routes to avoid route conflicts
router.get("/price-management", async (req: Request, res: Response) => {
  // Add cache headers to prevent stale data
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const {
      search,
      category,
      category_name,
      subcategory_name,
      brand_name,
      status,
      model,
      page = "1",
      limit = "100",
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    let limitNum = limit === "all" ? 100000 : parseInt(limit as string) || 1000;
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      const rawSearch = String(search).trim();
      const searchStr = `%${rawSearch}%`;
      const normalizedSearch = rawSearch;
      conditions.push(`(
        p."partNo" ILIKE $${paramIdx} OR 
        p."description" ILIKE $${paramIdx} OR 
        mp."masterPartNo" ILIKE $${paramIdx} OR
        regexp_replace(UPPER(COALESCE(p."partNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%' OR
        regexp_replace(UPPER(COALESCE(mp."masterPartNo", '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER($${paramIdx + 1}), '[^A-Z0-9]', '', 'g') || '%'
      )`);
      params.push(searchStr);
      params.push(normalizedSearch);
      paramIdx += 2;
    }

    const catSearch = category_name || category;
    if (catSearch && catSearch !== "all") {
      conditions.push(`c."name" ILIKE $${paramIdx++}`);
      params.push(`%${(catSearch as string).trim()}%`);
    }

    if (subcategory_name && subcategory_name !== "all") {
      conditions.push(`sc."name" ILIKE $${paramIdx++}`);
      params.push(`%${(subcategory_name as string).trim()}%`);
    }

    if (brand_name && brand_name !== "all") {
      conditions.push(`b."name" ILIKE $${paramIdx++}`);
      params.push(`%${(brand_name as string).trim()}%`);
    }

    if (status && status !== "all") {
      conditions.push(`p."status" = $${paramIdx++}`);
      params.push(String(status).trim());
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        p.id, p."partNo", p.description, p.cost, p."purchasePrice", p."avgCost", 
        p."priceA", p."priceB", p."priceM", p."updatedAt", p."createdAt",
        mp."masterPartNo" as master_part_no,
        b."name" as brand_name,
        c."name" as category_name,
        sc."name" as subcategory_name,
        ls.last_sale_price,
        COALESCE(st.stock, 0) as stock,
        COALESCE(st.reserved, 0) as reserved_stock,
        ph."updateValue" as last_update_value,
        ph."updateType" as last_update_type,
        ph."priceField" as last_price_field,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', m.id,
                'name', m.name,
                'qty_used', m."qtyUsed"
              )
            )
            FROM "Model" m 
            WHERE m."partId" = p.id
          ),
          '[]'::json
        ) as models
      FROM "Part" p
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "Subcategory" sc ON p."subcategoryId" = sc.id
      LEFT JOIN (
          SELECT "partId", 
            SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as stock,
            SUM(CASE WHEN "referenceType" = 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as reserved
          FROM "StockMovement"
          GROUP BY "partId"
      ) st ON p.id = st."partId"
      LEFT JOIN (
          SELECT DISTINCT ON ("partId") "partId", "updateValue", "updateType", "priceField"
          FROM "PriceHistory"
          ORDER BY "partId", "createdAt" DESC
      ) ph ON p.id = ph."partId"
      LEFT JOIN LATERAL (
          SELECT
            sii."unitPrice" as last_sale_price
          FROM "SalesInvoiceItem" sii
          JOIN "SalesInvoice" si ON sii."invoiceId" = si.id
          WHERE sii."partId" = p.id
          ORDER BY si."invoiceDate" DESC, sii."createdAt" DESC
          LIMIT 1
      ) ls ON true
      ${whereClause}
      ORDER BY p."updatedAt" DESC, p."partNo" ASC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    params.push(limitNum, offset);
    const result = await query(sql, params);

    const transformedParts = result.rows.map((p: any) => ({
      id: p.id,
      partNo: p.partNo || p.partno,
      master_part_no: p.master_part_no || p.masterpartno,
      brand: p.brand_name || p.brandname,
      description: p.description,
      stock: parseInt(p.stock) || 0,
      reserved_stock: parseInt(p.reserved_stock || p.reservedstock) || 0,
      cost: parseFloat(p.cost) || 0,
      purchasePrice: parseFloat(p.purchasePrice || p.purchaseprice) || 0,
      avgCost: parseFloat(p.avgCost || p.avgcost) || 0,
      lastSalePrice: parseFloat(p.last_sale_price || p.lastsaleprice) || 0,
      updated_at: p.updatedAt || p.updatedat,
      price_a: parseFloat(p.priceA || p.pricea) || 0,
      price_b: parseFloat(p.priceB || p.priceb) || 0,
      price_m: parseFloat(p.priceM || p.pricem) || 0,
      category: p.category_name || p.categoryname,
      subcategory: p.subcategory_name || p.subcategoryname,
      last_percentage: p.last_update_value || p.lastupdatevalue,
      last_change_type: p.last_update_type || p.lastupdatetype,
      last_price_field: p.last_price_field || p.lastpricefield,
      models: p.models || [],
    }));

    res.json({
      success: true,
      data: transformedParts,
    });
  } catch (error: any) {
    console.error("Error fetching price management parts:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Bulk update prices - MUST BE BEFORE /:id routes
router.post("/bulk-update-prices", async (req: Request, res: Response) => {
  try {
    const {
      part_ids,
      price_field, // 'cost', 'priceA', 'priceB', 'all'
      update_type, // 'percentage', 'fixed'
      update_value,
      reason,
      updated_by,
    } = req.body;

    if (!part_ids || !Array.isArray(part_ids) || part_ids.length === 0) {
      return res.status(400).json({ error: "part_ids array is required" });
    }

    if (!price_field || !update_type || update_value === undefined) {
      return res.status(400).json({
        error: "price_field, update_type, and update_value are required",
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "reason is required" });
    }

    // Get all parts to update
    const parts = await prisma.part.findMany({
      where: {
        id: { in: part_ids },
      },
    });

    if (parts.length === 0) {
      return res.status(404).json({ error: "No parts found" });
    }

    const updateValue = parseFloat(update_value);
    if (isNaN(updateValue)) {
      return res
        .status(400)
        .json({ error: "update_value must be a valid number" });
    }

    // Update parts and create history records
    const updatedParts = [];
    const historyRecords = [];

    for (const part of parts) {
      const updates: any = {};
      const historyData: any = {
        partId: part.id,
        partNo: part.partNo,
        description: part.description,
        priceField: price_field,
        updateType: update_type,
        updateValue: updateValue,
        itemsUpdated: part_ids.length,
        reason: reason,
        updatedBy: updated_by || "System",
      };

      const applyUpdate = (currentPrice: number) => {
        if (update_type === "percentage") {
          return Math.round(currentPrice * (1 + updateValue / 100) * 100) / 100;
        } else {
          return Math.round((currentPrice + updateValue) * 100) / 100;
        }
      };

      if (price_field === "cost" || price_field === "all") {
        const oldCost = part.cost || 0;
        const newCost = applyUpdate(oldCost);
        updates.cost = newCost;
        if (price_field === "cost") {
          historyData.oldValue = oldCost;
          historyData.newValue = newCost;
        }
      }

      if (price_field === "priceA" || price_field === "all") {
        const oldPriceA = part.priceA || 0;
        const newPriceA = applyUpdate(oldPriceA);
        updates.priceA = newPriceA;
        if (price_field === "priceA") {
          historyData.oldValue = oldPriceA;
          historyData.newValue = newPriceA;
        }
      }

      if (price_field === "priceB" || price_field === "all") {
        const oldPriceB = part.priceB || 0;
        const newPriceB = applyUpdate(oldPriceB);
        updates.priceB = newPriceB;
        if (price_field === "priceB") {
          historyData.oldValue = oldPriceB;
          historyData.newValue = newPriceB;
        }
      }

      // Update part
      const updatedPart = await prisma.part.update({
        where: { id: part.id },
        data: updates,
      });

      updatedParts.push(updatedPart);

      // Create history record
      await prisma.priceHistory.create({
        data: historyData,
      });
    }

    res.json({
      message: `Successfully updated ${updatedParts.length} parts`,
      updated_count: updatedParts.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get price update history - MUST BE BEFORE /:id routes
router.get("/price-history", async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "50", partId } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Optional filter by part
    const where: any = {};
    if (partId && typeof partId === "string" && partId.trim() !== "") {
      where.partId = partId;
    }

    const [history, total] = await Promise.all([
      prisma.priceHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
        include: {
          Part: {
            select: {
              partNo: true,
              description: true,
            },
          },
        },
      }),
      prisma.priceHistory.count({ where }),
    ]);

    const result = history.map((h) => ({
      id: h.id,
      date: h.createdAt.toISOString(),
      partId: h.partId,
      partNo: h.partNo,
      description: h.description,
      itemsUpdated: h.itemsUpdated,
      priceField: h.priceField,
      updateType:
        h.updateType === "percentage"
          ? "Percentage (%)"
          : h.updateType === "fixed"
            ? "Fixed Amount"
            : h.updateType,
      // Keep `value` for backwards compatibility, but also expose the
      // actual old/new prices so consumers (e.g. the Price Update History
      // dialog) can show "X -> Y" changes for any update source.
      value: h.updateValue ?? h.newValue ?? 0,
      oldValue: h.oldValue ?? null,
      newValue: h.newValue ?? null,
      updateValue: h.updateValue ?? null,
      reason: h.reason,
      updatedBy: h.updatedBy || "System",
    }));

    res.json({
      data: result,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single part by part_no (and optional master_part_no)
router.get("/by-part-no", async (req: Request, res: Response) => {
  try {
    const part_no = (req.query.part_no as string)?.trim();
    const master_part_no = (req.query.master_part_no as string)?.trim();
    if (!part_no && !master_part_no) {
      return res.status(400).json({ error: "part_no or master_part_no is required" });
    }

    const candidates = [part_no, master_part_no]
      .map((v) => (v || "").trim())
      .filter((v) => v.length > 0);

    const where: any = {
      OR: candidates.flatMap((value) => [
        { partNo: value },
        { MasterPart: { masterPartNo: value } },
      ]),
    };

    const part = await prisma.part.findFirst({
      where,
      include: {
        MasterPart: true,
        Brand: true,
        Category: true,
        Subcategory: true,
        Application: true,
        Model: true,
      },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    // If this part has no models but shares a master part, use models from a sibling part
    let modelsToReturn = (part as any).Model || [];
    if (modelsToReturn.length === 0 && part.masterPartId) {
      const siblingWithModels = await prisma.part.findFirst({
        where: {
          masterPartId: part.masterPartId,
          id: { not: part.id },
          Model: { some: {} },
        },
        include: { Model: true },
      });
      if (siblingWithModels?.Model?.length) {
        modelsToReturn = siblingWithModels.Model;
      }
    }

    const id = part.id;
    const stockMovements = await prisma.stockMovement.groupBy({
      by: ["type"],
      where: {
        partId: id,
        OR: [
          { referenceType: null },
          { referenceType: { not: "stock_reservation" } },
        ],
      },
      _sum: { quantity: true },
    });
    let currentStock = 0;
    stockMovements.forEach((m) => {
      const qty = m._sum.quantity || 0;
      if (m.type === "in") currentStock += qty;
      else if (m.type === "out") currentStock -= qty;
    });

    return res.json({
      id: part.id,
      master_part_no: (part as any).MasterPart?.masterPartNo || null,
      part_no: part.partNo,
      brand_name: (part as any).Brand?.name || null,
      brand_id: part.brandId || null,
      category_name: (part as any).Category?.name || null,
      category_id: part.categoryId || null,
      subcategory_name: (part as any).Subcategory?.name || null,
      subcategory_id: part.subcategoryId || null,
      application_name: (part as any).Application?.name || null,
      application_id: part.applicationId || null,
      application: (part as any).Application
        ? { id: (part as any).Application.id, name: (part as any).Application.name }
        : null,
      description: part.description,
      hs_code: part.hsCode,
      weight: part.weight,
      reorder_level: part.reorderLevel || (part as any).reorderlevel,
      uom: part.uom,
      qty: currentStock,
      stock: currentStock,
      cost: part.cost,
      avg_cost: part.avgCost,
      avgCost: part.avgCost,
      price_a: part.priceA || (part as any).pricea || null,
      price_b: part.priceB || (part as any).priceb || null,
      price_m: part.priceM || (part as any).pricem || null,
      smc: part.smc || null,
      size: part.size || null,
      origin: part.origin || null,
      image_p1: part.imageP1 || null,
      image_p2: part.imageP2 || null,
      status: part.status || "active",
      type: (part as any).type || "single",
      remarks: (part as any).remarks || null,
      models: modelsToReturn.map((m: any) => ({
        id: m.id,
        name: m.name,
        qty_used: m.qtyUsed,
      })),
      created_at: part.createdAt,
      updated_at: part.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Distinct model names for part-entry dropdowns
router.get("/model-names", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || "").trim();
    const rows = await prisma.model.groupBy({
      by: ["name"],
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : undefined,
      orderBy: { name: "asc" },
      take: 1000,
    });

    const names = rows
      .map((row) => String(row.name || "").trim())
      .filter(Boolean);

    res.json(names);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all active parts using a specific model name
router.get("/model-associations/:modelName", async (req: Request, res: Response) => {
  try {
    const modelName = decodeURIComponent(String(req.params.modelName || "")).trim();
    const rawApplication = String(req.query.application || "").trim();
    const invalidApplicationValues = new Set(["n/a", "na", "none", "-", "--", ""]);
    const application = invalidApplicationValues.has(rawApplication.toLowerCase())
      ? ""
      : rawApplication;
    if (!modelName) {
      return res.status(400).json({ error: "Model name is required" });
    }

    const modelRows = await prisma.model.findMany({
      where: {
        name: { equals: modelName, mode: "insensitive" },
        Part: {
          status: "active",
          ...(application
            ? {
                Application: {
                  name: { equals: application, mode: "insensitive" },
                },
              }
            : {}),
        },
      },
      include: {
        Part: {
          include: {
            MasterPart: true,
            Brand: true,
            Application: true,
          },
        },
      },
      orderBy: [{ qtyUsed: "desc" }, { createdAt: "desc" }],
    });

    const data = modelRows.map((row) => ({
      partId: row.partId,
      masterPart: row.Part?.MasterPart?.masterPartNo || "N/A",
      partNo: row.Part?.partNo || "N/A",
      description: row.Part?.description || "N/A",
      brand: row.Part?.Brand?.name || "N/A",
      application: row.Part?.Application?.name || application || "N/A",
      model: row.name,
      quantity: row.qtyUsed || 0,
    }));

    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single part by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const part = await prisma.part.findUnique({
      where: { id },
      include: {
        MasterPart: true,
        Brand: true,
        Category: true,
        Subcategory: true,
        Application: true,
        Model: true,
        KitItem: true,
      },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    // If this part has no models but shares a master part, use models from a sibling part
    let modelsToReturn = (part as any).Model || [];
    if (modelsToReturn.length === 0 && part.masterPartId) {
      const siblingWithModels = await prisma.part.findFirst({
        where: {
          masterPartId: part.masterPartId,
          id: { not: part.id },
          Model: { some: {} },
        },
        include: { Model: true },
      });
      if (siblingWithModels?.Model?.length) {
        modelsToReturn = siblingWithModels.Model;
      }
    }

    // Calculate stock
    const stockMovements = await prisma.stockMovement.groupBy({
      by: ["type"],
      where: {
        partId: id,
        OR: [
          { referenceType: null },
          { referenceType: { not: "stock_reservation" } },
        ],
      },
      _sum: { quantity: true },
    });

    let currentStock = 0;
    stockMovements.forEach((m) => {
      const qty = m._sum.quantity || 0;
      if (m.type === "in") currentStock += qty;
      else if (m.type === "out") currentStock -= qty;
    });

    const kitItemsToReturn = await buildKitItemsResponse(
      (part as any).KitItem || [],
    );

    res.json({
      id: part.id,
      master_part_no: (part as any).MasterPart?.masterPartNo || null,
      part_no: part.partNo,
      brand_name: (part as any).Brand?.name || null,
      brand_id: part.brandId || null,
      category_name: (part as any).Category?.name || null,
      category_id: part.categoryId || null,
      subcategory_name: (part as any).Subcategory?.name || null,
      subcategory_id: part.subcategoryId || null,
      application_name: (part as any).Application?.name || null,
      application_id: part.applicationId || null,
      application: (part as any).Application
        ? {
          id: (part as any).Application.id,
          name: (part as any).Application.name,
        }
        : null,
      description: part.description,
      hs_code: part.hsCode,
      weight: part.weight,
      reorder_level: part.reorderLevel || (part as any).reorderlevel,
      uom: part.uom,
      qty: currentStock,
      stock: currentStock,
      cost: part.cost,
      price_a: part.priceA || (part as any).pricea || null,
      price_b: part.priceB || (part as any).priceb || null,
      price_m: part.priceM || (part as any).pricem || null,
      smc: part.smc || null,
      size: part.size || null,
      origin: part.origin || null,
      image_p1: part.imageP1 || null,
      image_p2: part.imageP2 || null,
      status: part.status || "active",
      type: (part as any).type || "single",
      remarks: (part as any).remarks || null,
      models: modelsToReturn.map((m: any) => ({
        id: m.id,
        name: m.name,
        qty_used: m.qtyUsed,
      })),
      kit_items: kitItemsToReturn,
      created_at: part.createdAt,
      updated_at: part.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new part
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      master_part_no,
      part_no,
      brand_name,
      description,
      category_id,
      subcategory_id,
      application_id,
      hs_code,
      weight,
      reorder_level,
      uom,
      cost,
      price_a,
      price_b,
      price_m,
      smc,
      size,
      origin,
      type,
      image_p1,
      image_p2,
      status,
      models,
      kit_items,
    } = req.body;

    // Validate required fields
    const partNoStr = part_no ? String(part_no).trim() : "";
    if (!partNoStr || partNoStr === "") {
      return res.status(400).json({ error: "Part number is required" });
    }

    // Handle master part
    let masterPartId = null;
    if (master_part_no && String(master_part_no).trim()) {
      const masterPartNoValue = String(master_part_no).trim();
      try {
        const masterPart = await prisma.masterPart.upsert({
          where: { masterPartNo: masterPartNoValue },
          update: {},
          create: {
            id: randomUUID(),
            masterPartNo: masterPartNoValue,
            updatedAt: new Date(),
          },
        });
        masterPartId = masterPart.id;
        console.log("Master Part Upserted:", masterPart);
      } catch (error: any) {
        console.error("Error upserting Master Part:", error);
      }
    } else {
    }

    // Handle brand
    let brandId = null;
    if (brand_name) {
      const brand = await prisma.brand.upsert({
        where: { name: brand_name },
        update: {},
        create: {
          id: randomUUID(),
          name: brand_name,
          updatedAt: new Date(),
        } as any,
      });
      brandId = brand.id;
    }

    // Helper function to check if string looks like a UUID
    const isUUID = (str: string) => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Validate and handle category (auto-create if not found)
    let validatedCategoryId = null;
    if (category_id && String(category_id).trim() !== "") {
      try {
        const categoryIdStr = String(category_id).trim();
        let category = null;

        if (isUUID(categoryIdStr)) {
          category = await prisma.category.findUnique({
            where: { id: categoryIdStr },
          });
        }

        if (!category) {
          category = await prisma.category.findUnique({
            where: { name: categoryIdStr },
          });
        }

        // If not found, auto-create it
        if (!category) {
          try {
            category = await prisma.category.create({
              data: {
                id: randomUUID(),
                name: categoryIdStr,
                status: "active",
                updatedAt: new Date(),
              } as any,
            });
          } catch (createError: any) {
            // If creation fails (e.g., unique constraint), try to find it again
            category = await prisma.category.findUnique({
              where: { name: categoryIdStr },
            });
            if (category) {
            }
          }
        }

        if (category) {
          validatedCategoryId = category.id;
        }
      } catch (error: any) {
        validatedCategoryId = null;
      }
    }

    // Validate and handle subcategory
    let validatedSubcategoryId = null;
    if (subcategory_id && String(subcategory_id).trim() !== "") {
      try {
        const subcategoryIdStr = String(subcategory_id).trim();
        let subcategory = null;

        if (isUUID(subcategoryIdStr)) {
          subcategory = await prisma.subcategory.findUnique({
            where: { id: subcategoryIdStr },
            include: { Category: true },
          });
        }

        if (!subcategory) {
          subcategory = await prisma.subcategory.findFirst({
            where: { name: subcategoryIdStr },
            include: { Category: true },
          });
        }

        // If still not found and we have a category, auto-create it
        if (!subcategory && validatedCategoryId) {
          try {
            subcategory = await prisma.subcategory.create({
              data: {
                id: randomUUID(),
                name: subcategoryIdStr,
                categoryId: validatedCategoryId,
                status: "active",
                updatedAt: new Date(),
              } as any,
              include: { Category: true },
            });
          } catch (createError: any) {
            // If creation fails (e.g., unique constraint), try to find it again
            subcategory = await prisma.subcategory.findFirst({
              where: {
                name: subcategoryIdStr,
                categoryId: validatedCategoryId,
              },
              include: { Category: true },
            });
            if (subcategory) {
            } else {
            }
          }
        }

        if (subcategory) {
          validatedSubcategoryId = subcategory.id;
          // Auto-set category if not already set
          if (!validatedCategoryId) {
            validatedCategoryId = subcategory.categoryId;
          }
        } else {
        }
      } catch (error: any) {
        validatedSubcategoryId = null;
      }
    }

    // Validate and handle application (with auto-creation if name provided and subcategory exists)
    let validatedApplicationId = null;
    if (application_id && String(application_id).trim() !== "") {
      try {
        const applicationIdStr = String(application_id).trim();
        let application = null;

        if (isUUID(applicationIdStr)) {
          // Try to find by ID
          application = await prisma.application.findUnique({
            where: { id: applicationIdStr },
            include: { Subcategory: { include: { Category: true } } },
          });
        }

        // If not found by ID, try to find by name
        if (!application) {
          if (validatedSubcategoryId) {
            // Try within the validated subcategory
            application = await prisma.application.findFirst({
              where: {
                name: applicationIdStr,
                subcategoryId: validatedSubcategoryId,
              },
              include: { Subcategory: { include: { Category: true } } },
            });
          }

          // If still not found, try any subcategory
          if (!application) {
            application = await prisma.application.findFirst({
              where: { name: applicationIdStr },
              include: { Subcategory: { include: { Category: true } } },
            });
          }
        }

        // If still not found and we have a subcategory, auto-create it
        if (!application && validatedSubcategoryId) {
          try {
            application = await prisma.application.create({
              data: {
                id: randomUUID(),
                name: applicationIdStr,
                subcategoryId: validatedSubcategoryId,
                status: "active",
                updatedAt: new Date(),
              } as any,
              include: { Subcategory: { include: { Category: true } } },
            });
          } catch (createError: any) {
            // If creation fails (e.g., unique constraint), try to find it again
            application = await prisma.application.findFirst({
              where: {
                name: applicationIdStr,
                subcategoryId: validatedSubcategoryId,
              },
              include: { Subcategory: { include: { Category: true } } },
            });
            if (application) {
            } else {
            }
          }
        }

        if (application) {
          validatedApplicationId = application.id;
          // Auto-set subcategory and category if not already set
          if (!validatedSubcategoryId) {
            validatedSubcategoryId = application.subcategoryId;
            if ((application as any).Subcategory?.categoryId) {
              validatedCategoryId = (application as any).Subcategory.categoryId;
            }
          }
        } else {
        }
      } catch (error: any) {
        validatedApplicationId = null;
      }
    }

    const normalizedPartType = normalizePartType(type);
    const normalizedKitItems = normalizeKitItemsPayload(kit_items);

    if (normalizedPartType === "kit" && normalizedKitItems.length > 0) {
      try {
        await validateKitComponents(normalizedKitItems);
      } catch (kitError: any) {
        return res.status(400).json({ error: kitError.message });
      }
    }

    // Prepare part data
    const partData: any = {
      id: randomUUID(),
      updatedAt: new Date(),
      masterPartId,
      partNo: partNoStr,
      brandId,
      description: description ? String(description).trim() : null,
      categoryId: validatedCategoryId || null,
      subcategoryId: validatedSubcategoryId || null,
      applicationId: validatedApplicationId || null,
      hsCode: hs_code ? String(hs_code).trim() : null,
      weight: weight ? parseFloat(String(weight)) : null,
      reorderLevel: reorder_level ? parseInt(String(reorder_level)) : 0,
      uom: uom ? String(uom).trim() : "pcs",
      cost:
        cost !== null && cost !== undefined ? parseFloat(String(cost)) : null,
      purchasePrice:
        cost !== null && cost !== undefined ? parseFloat(String(cost)) : null,
      avgCost:
        cost !== null && cost !== undefined ? parseFloat(String(cost)) : null,
      costSource: "MANUAL",
      priceA:
        price_a !== null && price_a !== undefined
          ? parseFloat(String(price_a))
          : null,
      priceB:
        price_b !== null && price_b !== undefined
          ? parseFloat(String(price_b))
          : null,
      priceM:
        price_m !== null && price_m !== undefined
          ? parseFloat(String(price_m))
          : null,
      smc: smc ? String(smc).trim() : null,
      size: size ? String(size).trim() : null,
      origin: origin ? String(origin).trim() : null,
      type: normalizedPartType,
      imageP1: image_p1 ? String(image_p1).trim() : null,
      imageP2: image_p2 ? String(image_p2).trim() : null,
      status: (() => {
        if (!status) return "active";
        const statusStr = String(status).trim();
        if (statusStr === "A" || statusStr === "a") return "active";
        if (statusStr === "N" || statusStr === "n") return "inactive";
        return statusStr === "active" || statusStr === "inactive"
          ? statusStr
          : "active";
      })(),
    };

    // Only add Model relation if there are models
    if (models && Array.isArray(models) && models.length > 0) {
      partData.Model = {
        create: models
          .filter((m: any) => m && m.name && String(m.name).trim() !== "")
          .map((m: any) => ({
            id: randomUUID(),
            name: String(m.name).trim(),
            qtyUsed: parseInt(String(m.qty_used || 1)),
            updatedAt: new Date(),
          })),
      };
    }

    const part = await prisma.part.create({
      data: partData,
    });

    if (normalizedPartType === "kit" && Array.isArray(kit_items)) {
      try {
        await syncKitItemsForParentPart(prisma, part.id, kit_items, "kit");
      } catch (kitError: any) {
        await prisma.part.delete({ where: { id: part.id } }).catch(() => undefined);
        return res.status(400).json({ error: kitError.message });
      }
    }

    const partWithRelations = await prisma.part.findUnique({
      where: { id: part.id },
      include: {
        MasterPart: true,
        Brand: true,
        Category: true,
        Subcategory: true,
        Application: true,
        Model: true,
        KitItem: true,
      },
    });

    const p = partWithRelations as any;
    const createdKitItems = await buildKitItemsResponse((p.KitItem || []) as any[]);
    res.status(201).json({
      id: partWithRelations?.id,
      master_part_no: p.MasterPart?.masterPartNo || null,
      part_no: partWithRelations?.partNo,
      brand_name: p.Brand?.name || null,
      category_name: p.Category?.name || null,
      subcategory_name: p.Subcategory?.name || null,
      application_name: p.Application?.name || null,
      application: p.Application
        ? { id: p.Application.id, name: p.Application.name }
        : null,
      application_id: partWithRelations?.applicationId || null,
      description: partWithRelations?.description,
      hs_code: partWithRelations?.hsCode,
      weight: partWithRelations?.weight,
      reorder_level: partWithRelations?.reorderLevel,
      uom: partWithRelations?.uom,
      cost: partWithRelations?.cost,
      purchasePrice: (partWithRelations as any)?.purchasePrice,
      avgCost: (partWithRelations as any)?.avgCost,
      price_a: partWithRelations?.priceA,
      price_b: partWithRelations?.priceB,
      price_m: partWithRelations?.priceM,
      smc: partWithRelations?.smc,
      size: partWithRelations?.size,
      origin: partWithRelations?.origin || null,
      image_p1: partWithRelations?.imageP1,
      image_p2: partWithRelations?.imageP2,
      status: partWithRelations?.status,
      type: (partWithRelations as any)?.type || "single",
      models: (p.Model || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        qty_used: m.qtyUsed,
      })),
      kit_items: createdKitItems,
      created_at: partWithRelations?.createdAt,
      updated_at: partWithRelations?.updatedAt,
    });
  } catch (error: any) {
    // Handle specific Prisma errors
    if (error.code === "P2002") {
      // Unique constraint violation
      const field = error.meta?.target?.[0] || "field";
      // Allow duplicate partNo - duplicates are now allowed per schema
      if (field === "partNo" || field === "part_no") {
        // If we get here, the database constraint still exists
        // The schema has been updated to allow duplicates, but migration needs to be run
        // Return error with instructions
        return res.status(400).json({
          error:
            "Part number already exists. Please run Prisma migrations: npm run migrate:deploy",
          details:
            "Schema allows duplicate part_no; ensure migrations are applied.",
        });
      } else {
        return res.status(400).json({
          error: `A part with this ${field} already exists`,
          details: error.meta,
        });
      }
    }

    if (error.code === "P2003") {
      // Foreign key constraint violation
      return res.status(400).json({
        error: "Invalid reference to related record",
        details: error.meta,
      });
    }

    res.status(500).json({
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

router.get("/:id/kit-operation-details", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const details = await buildKitOperationDetails(id);
    if (!details) {
      return res.status(404).json({ error: "Part not found" });
    }
    if ("error" in details && details.error === "not_kit") {
      return res.status(400).json({ error: "Selected item is not a kit" });
    }
    res.json(details);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/make-kit", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const quantityRaw = Number(req.body?.quantity);
    const quantity = Number.isFinite(quantityRaw)
      ? Math.max(1, Math.floor(quantityRaw))
      : 0;

    if (quantity < 1) {
      return res.status(400).json({ error: "Quantity must be at least 1" });
    }

    const kitPart = await prisma.part.findUnique({
      where: { id },
      include: { KitItem: true },
    });

    if (!kitPart) return res.status(404).json({ error: "Kit item not found" });
    if ((kitPart.type || "single") !== "kit") {
      return res.status(400).json({ error: "Selected item is not a kit" });
    }
    if (!kitPart.KitItem.length) {
      return res
        .status(400)
        .json({ error: "No associated single items found for this kit" });
    }

    type MergedKitNeed = {
      componentPartId: string | null;
      partNo: string;
      perKitQty: number;
    };
    const mergedKitNeeds = new Map<string, MergedKitNeed>();
    for (const row of kitPart.KitItem as KitItemRecord[]) {
      const partNo = String(row.partNo || "").trim();
      if (!partNo) continue;
      const perKitQty = Math.max(1, Number(row.quantity || 1));
      const cid = kitComponentPartId(row);
      const mergeKey = cid ? `id:${cid}` : `pn:${partNo}`;
      const prev = mergedKitNeeds.get(mergeKey);
      if (prev) {
        prev.perKitQty += perKitQty;
      } else {
        mergedKitNeeds.set(mergeKey, {
          componentPartId: cid || null,
          partNo,
          perKitQty,
        });
      }
    }
    const kitNeeds = Array.from(mergedKitNeeds.values());

    const explicitIds = [
      ...new Set(
        kitNeeds.map((n) => n.componentPartId).filter((v): v is string => Boolean(v)),
      ),
    ];
    const explicitParts = explicitIds.length
      ? await prisma.part.findMany({
          where: {
            id: { in: explicitIds },
            type: "single",
            status: "active",
          },
          select: {
            id: true,
            partNo: true,
            avgCost: true,
            cost: true,
            purchasePrice: true,
          },
        })
      : [];
    const explicitById = new Map(explicitParts.map((p) => [p.id, p]));

    const legacyPartNos = [
      ...new Set(kitNeeds.filter((n) => !n.componentPartId).map((n) => n.partNo)),
    ];
    const componentCandidates = legacyPartNos.length
      ? await prisma.part.findMany({
          where: {
            partNo: { in: legacyPartNos },
            type: "single",
            status: "active",
          },
          select: {
            id: true,
            partNo: true,
            avgCost: true,
            cost: true,
            purchasePrice: true,
          },
        })
      : [];

    const stockByPartId = await getCurrentStockByPartIds([
      id,
      ...explicitParts.map((row) => row.id),
      ...componentCandidates.map((row) => row.id),
    ]);

    const candidatesByPartNo = new Map<
      string,
      {
        id: string;
        partNo: string;
        avgCost: number | null;
        cost: number | null;
        purchasePrice: number | null;
        stock: number;
      }[]
    >();
    for (const row of componentCandidates) {
      const stock = Number(stockByPartId.get(row.id) || 0);
      const arr = candidatesByPartNo.get(row.partNo) || [];
      arr.push({
        id: row.id,
        partNo: row.partNo,
        avgCost: row.avgCost,
        cost: row.cost,
        purchasePrice: row.purchasePrice,
        stock,
      });
      candidatesByPartNo.set(row.partNo, arr);
    }
    candidatesByPartNo.forEach((arr) =>
      arr.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0)),
    );

    const insufficientItems: Array<{
      partNo: string;
      stock: number;
      requiredQty: number;
      enoughStock: boolean;
    }> = [];
    const consumePlan: Array<{ partId: string; quantity: number; partNo: string }> = [];
    let unitKitAvg = 0;

    for (const need of kitNeeds) {
      if (need.componentPartId) {
        const part = explicitById.get(need.componentPartId);
        if (!part) {
          return res.status(400).json({
            error: `Associated item (id ${need.componentPartId}) is missing or not active single type`,
          });
        }
        const requiredQty = need.perKitQty * quantity;
        const stock = Math.max(0, Number(stockByPartId.get(part.id) || 0));
        const componentAvg = Number(
          part.avgCost ?? part.cost ?? part.purchasePrice ?? 0,
        );
        unitKitAvg += componentAvg * need.perKitQty;

        if (stock < requiredQty) {
          insufficientItems.push({
            partNo: part.partNo,
            stock,
            requiredQty,
            enoughStock: false,
          });
          continue;
        }

        consumePlan.push({
          partId: part.id,
          quantity: requiredQty,
          partNo: part.partNo,
        });
        continue;
      }

      const partNo = need.partNo;
      const perKitQty = need.perKitQty;
      const candidates = candidatesByPartNo.get(partNo) || [];
      if (candidates.length === 0) {
        return res.status(400).json({
          error: `Associated item ${partNo} is missing or not active single type`,
        });
      }

      const requiredQty = perKitQty * quantity;
      const totalStock = candidates.reduce(
        (sum, row) => sum + Math.max(0, Number(row.stock || 0)),
        0,
      );

      const totalWeight = candidates.reduce((sum, row) => {
        const available = Math.max(0, Number(row.stock || 0));
        const avg = Number(row.avgCost ?? row.cost ?? row.purchasePrice ?? 0);
        return sum + available * avg;
      }, 0);
      const fallbackAvg = Number(
        candidates[0].avgCost ?? candidates[0].cost ?? candidates[0].purchasePrice ?? 0,
      );
      const componentAvg = totalStock > 0 ? totalWeight / totalStock : fallbackAvg;
      unitKitAvg += componentAvg * perKitQty;

      if (totalStock < requiredQty) {
        insufficientItems.push({
          partNo,
          stock: totalStock,
          requiredQty,
          enoughStock: false,
        });
        continue;
      }

      let remaining = requiredQty;
      for (const candidate of candidates) {
        const available = Math.max(0, Number(candidate.stock || 0));
        if (available <= 0 || remaining <= 0) continue;
        const consume = Math.min(available, remaining);
        consumePlan.push({
          partId: candidate.id,
          quantity: consume,
          partNo,
        });
        remaining -= consume;
      }
    }

    if (insufficientItems.length > 0) {
      return res.status(400).json({
        error: "Cannot make kit: stock is less than required quantity",
        details: insufficientItems,
      });
    }

    const currentKitStock = Number(stockByPartId.get(id) || 0);
    const currentKitAvg = Number(
      kitPart.avgCost ?? kitPart.cost ?? kitPart.purchasePrice ?? 0,
    );
    const denominator = currentKitStock + quantity;
    const newKitAvg =
      denominator > 0
        ? (currentKitAvg * currentKitStock + unitKitAvg * quantity) / denominator
        : unitKitAvg;

    const operationId = randomUUID();

    await prisma.$transaction(async (tx) => {
      for (const movement of consumePlan) {
        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            partId: movement.partId,
            type: "out",
            quantity: movement.quantity,
            referenceType: "kit_make",
            referenceId: operationId,
            notes: `Kit make for ${kitPart.partNo} x ${quantity} (component ${movement.partNo})`,
            createdAt: new Date(),
          } as any,
        });
      }

      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          partId: id,
          type: "in",
          quantity: quantity,
          referenceType: "kit_make",
          referenceId: operationId,
          notes: `Kit made from associated items x ${quantity}`,
          createdAt: new Date(),
        } as any,
      });

      await tx.part.update({
        where: { id },
        data: { avgCost: newKitAvg },
      });
    });

    return res.json({
      success: true,
      message: "Kit created successfully",
      data: {
        part_id: id,
        quantity,
        current_stock_before: currentKitStock,
        avg_cost_before: currentKitAvg,
        avg_cost_after: newKitAvg,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:id/break-kit", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const quantityRaw = Number(req.body?.quantity);
    const quantity = Number.isFinite(quantityRaw)
      ? Math.max(1, Math.floor(quantityRaw))
      : 0;

    if (quantity < 1) {
      return res.status(400).json({ error: "Quantity must be at least 1" });
    }

    const kitPart = await prisma.part.findUnique({
      where: { id },
      include: { KitItem: true },
    });

    if (!kitPart) return res.status(404).json({ error: "Kit item not found" });
    if ((kitPart.type || "single") !== "kit") {
      return res.status(400).json({ error: "Selected item is not a kit" });
    }
    if (!kitPart.KitItem.length) {
      return res
        .status(400)
        .json({ error: "No associated single items found for this kit" });
    }

    const mergedLegacyReceive = new Map<string, number>();
    const mergedExplicitReceive = new Map<
      string,
      { targetPartId: string; partNo: string; receiveQty: number }
    >();

    for (const kitRow of kitPart.KitItem as KitItemRecord[]) {
      const partNo = String(kitRow.partNo || "").trim();
      if (!partNo) continue;
      const perKitQty = Math.max(1, Number(kitRow.quantity || 1));
      const addQty = perKitQty * quantity;
      const cid = kitComponentPartId(kitRow);
      if (cid) {
        const prev = mergedExplicitReceive.get(cid);
        if (prev) {
          prev.receiveQty += addQty;
        } else {
          mergedExplicitReceive.set(cid, {
            targetPartId: cid,
            partNo,
            receiveQty: addQty,
          });
        }
      } else {
        mergedLegacyReceive.set(
          partNo,
          (mergedLegacyReceive.get(partNo) || 0) + addQty,
        );
      }
    }

    const componentPartNos = Array.from(mergedLegacyReceive.keys());
    const components = componentPartNos.length
      ? await prisma.part.findMany({
          where: {
            partNo: { in: componentPartNos },
            type: "single",
            status: "active",
          },
          select: {
            id: true,
            partNo: true,
            avgCost: true,
            cost: true,
            purchasePrice: true,
          },
        })
      : [];
    const componentCandidatesByPartNo = new Map<
      string,
      {
        id: string;
        partNo: string;
        avgCost: number | null;
        cost: number | null;
        purchasePrice: number | null;
      }[]
    >();
    components.forEach((row) => {
      const arr = componentCandidatesByPartNo.get(row.partNo) || [];
      arr.push(row);
      componentCandidatesByPartNo.set(row.partNo, arr);
    });

    const targetPartIdByPartNo = new Map<string, string>();
    for (const partNo of componentPartNos) {
      const canonicalId = await getCanonicalPartId(prisma as any, partNo);
      const fallbackCandidate = (componentCandidatesByPartNo.get(partNo) || [])[0];
      const targetPartId = canonicalId || fallbackCandidate?.id;
      if (!targetPartId) {
        return res.status(400).json({
          error: `Associated item ${partNo} is missing or not active single type`,
        });
      }
      targetPartIdByPartNo.set(partNo, targetPartId);
    }

    const allTargetIds = new Set<string>();
    for (const partNo of componentPartNos) {
      allTargetIds.add(targetPartIdByPartNo.get(partNo)!);
    }
    for (const row of mergedExplicitReceive.values()) {
      allTargetIds.add(row.targetPartId);
    }

    const allComponents = await prisma.part.findMany({
      where: {
        id: { in: [...allTargetIds] },
        type: "single",
        status: "active",
      },
      select: {
        id: true,
        partNo: true,
        avgCost: true,
        cost: true,
        purchasePrice: true,
      },
    });
    if (allComponents.length !== allTargetIds.size) {
      return res.status(400).json({
        error: "One or more kit components are missing or not active single type",
      });
    }

    const stockByPartId = await getCurrentStockByPartIds([id, ...allTargetIds]);
    const currentKitStock = Number(stockByPartId.get(id) || 0);
    if (currentKitStock < quantity) {
      return res.status(400).json({
        error: "Cannot break kit: kit stock is less than requested quantity",
      });
    }

    const kitAvg = Number(kitPart.avgCost ?? kitPart.cost ?? kitPart.purchasePrice ?? 0);
    const releasedKitValue = kitAvg * quantity;

    const componentById = new Map(allComponents.map((row) => [row.id, row]));
    const breakRows: Array<{
      partNo: string;
      targetPartId: string;
      receiveQty: number;
      perKitQty: number;
      currentAvg: number;
      currentStock: number;
    }> = [];

    for (const [partNo, receiveQty] of mergedLegacyReceive.entries()) {
      const targetPartId = targetPartIdByPartNo.get(partNo)!;
      const targetPart = componentById.get(targetPartId)!;
      const currentAvg = Number(
        targetPart.avgCost ?? targetPart.cost ?? targetPart.purchasePrice ?? 0,
      );
      const currentStock = Math.max(0, Number(stockByPartId.get(targetPartId) || 0));
      breakRows.push({
        partNo,
        targetPartId,
        receiveQty,
        perKitQty: Math.max(1, receiveQty / quantity),
        currentAvg,
        currentStock,
      });
    }

    for (const row of mergedExplicitReceive.values()) {
      const targetPart = componentById.get(row.targetPartId)!;
      const currentAvg = Number(
        targetPart.avgCost ?? targetPart.cost ?? targetPart.purchasePrice ?? 0,
      );
      const currentStock = Math.max(0, Number(stockByPartId.get(row.targetPartId) || 0));
      breakRows.push({
        partNo: row.partNo,
        targetPartId: row.targetPartId,
        receiveQty: row.receiveQty,
        perKitQty: Math.max(1, row.receiveQty / quantity),
        currentAvg,
        currentStock,
      });
    }

    const knownAvgRows = breakRows.filter((row) => row.currentAvg > 0);
    const fallbackAvg =
      knownAvgRows.length > 0
        ? knownAvgRows.reduce((sum, row) => sum + row.currentAvg, 0) /
          knownAvgRows.length
        : 1;
    const weightedRows = breakRows.map((row) => ({
      ...row,
      weightPerUnit: row.currentAvg > 0 ? row.currentAvg : fallbackAvg,
    }));
    let sumWeights = weightedRows.reduce(
      (sum, row) => sum + row.weightPerUnit * row.perKitQty,
      0,
    );
    const useQuantityOnlyWeights = sumWeights <= 0;
    if (sumWeights <= 0) {
      sumWeights = weightedRows.reduce((sum, row) => sum + row.perKitQty, 0);
    }
    const rowsWithAllocation = weightedRows.map((row) => {
      const ratioWeight =
        sumWeights > 0
          ? useQuantityOnlyWeights
            ? row.perKitQty
            : row.weightPerUnit * row.perKitQty
          : row.perKitQty;
      const allocatedValue =
        sumWeights > 0 ? (releasedKitValue * ratioWeight) / sumWeights : 0;
      const nextStock = row.currentStock + row.receiveQty;
      const nextAvg =
        nextStock > 0
          ? (row.currentAvg * row.currentStock + allocatedValue) / nextStock
          : row.currentAvg;
      return {
        ...row,
        allocatedValue,
        nextAvg,
      };
    });

    const operationId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          partId: id,
          type: "out",
          quantity: quantity,
          referenceType: "kit_break",
          referenceId: operationId,
          notes: `Kit break x ${quantity}`,
          createdAt: new Date(),
        } as any,
      });

      for (const row of rowsWithAllocation) {
        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            partId: row.targetPartId,
            type: "in",
            quantity: row.receiveQty,
            referenceType: "kit_break",
            referenceId: operationId,
            notes: `Received from kit break ${kitPart.partNo} x ${quantity}`,
            createdAt: new Date(),
          } as any,
        });

        await tx.part.update({
          where: { id: row.targetPartId },
          data: { avgCost: row.nextAvg },
        });
      }
    });

    return res.json({
      success: true,
      message: "Kit broken successfully",
      data: {
        part_id: id,
        quantity,
        current_stock_before: currentKitStock,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Update part
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      master_part_no,
      part_no,
      brand_name,
      description,
      category_id,
      subcategory_id,
      application_id,
      hs_code,
      weight,
      reorder_level,
      uom,
      cost,
      price_a,
      price_b,
      price_m,
      smc,
      size,
      origin,
      type,
      image_p1,
      image_p2,
      status,
      models,
      kit_items,
    } = req.body;

    // Handle master part
    let masterPartId = null;
    if (master_part_no && String(master_part_no).trim()) {
      const masterPartNoValue = String(master_part_no).trim();
      try {
        const masterPart = await prisma.masterPart.upsert({
          where: { masterPartNo: masterPartNoValue },
          update: {},
          create: { masterPartNo: masterPartNoValue } as any,
        });
        masterPartId = masterPart.id;
      } catch (error: any) { }
    } else {
    }

    // Handle brand
    let brandId = null;
    if (brand_name) {
      const brand = await prisma.brand.upsert({
        where: { name: brand_name },
        update: {},
        create: { name: brand_name } as any,
      });
      brandId = brand.id;
    }

    // Helper function to check if string looks like a UUID
    const isUUID = (str: string) => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Validate category exists if provided (auto-create if not found)
    let validatedCategoryId = null;
    if (category_id && String(category_id).trim() !== "") {
      try {
        const categoryIdStr = String(category_id).trim();
        let category = null;

        if (isUUID(categoryIdStr)) {
          // Try to find by ID
          category = await prisma.category.findUnique({
            where: { id: categoryIdStr },
          });
        } else {
          // Try to find by name
          category = await prisma.category.findUnique({
            where: { name: categoryIdStr },
          });
        }

        // If not found, auto-create it
        if (!category) {
          try {
            category = await prisma.category.create({
              data: {
                name: categoryIdStr,
                status: "active",
              } as any,
            });
          } catch (createError: any) {
            // If creation fails (e.g., unique constraint), try to find it again
            category = await prisma.category.findUnique({
              where: { name: categoryIdStr },
            });
            if (category) {
            }
          }
        }

        if (category) {
          validatedCategoryId = category.id;
        }
      } catch (error: any) {
        validatedCategoryId = null;
      }
    }

    // Validate subcategory exists
    let validatedSubcategoryId = null;
    if (subcategory_id && String(subcategory_id).trim() !== "") {
      try {
        const subcategoryIdStr = String(subcategory_id).trim();
        let subcategory = null;

        if (isUUID(subcategoryIdStr)) {
          // Try to find by ID
          subcategory = await prisma.subcategory.findUnique({
            where: { id: subcategoryIdStr },
            include: { Category: true },
          });
        }

        // If not found by ID, try to find by name
        if (!subcategory) {
          if (validatedCategoryId) {
            // Try within the validated category
            subcategory = await prisma.subcategory.findFirst({
              where: {
                name: subcategoryIdStr,
                categoryId: validatedCategoryId,
              },
              include: { Category: true },
            });
          }

          // If still not found, try any category
          if (!subcategory) {
            subcategory = await prisma.subcategory.findFirst({
              where: { name: subcategoryIdStr },
              include: { Category: true },
            });
          }
        }

        // If still not found and we have a category, auto-create it
        if (!subcategory && validatedCategoryId) {
          try {
            subcategory = await prisma.subcategory.create({
              data: {
                name: subcategoryIdStr,
                categoryId: validatedCategoryId,
                status: "active",
              } as any,
              include: { Category: true },
            });
          } catch (createError: any) {
            // If creation fails (e.g., unique constraint), try to find it again
            subcategory = await prisma.subcategory.findFirst({
              where: {
                name: subcategoryIdStr,
                categoryId: validatedCategoryId,
              },
              include: { Category: true },
            });
            if (subcategory) {
            } else {
            }
          }
        } else if (!subcategory) {
        }

        if (subcategory) {
          validatedSubcategoryId = subcategory.id;
          // Auto-set category if not already set
          if (!validatedCategoryId) {
            validatedCategoryId = subcategory.categoryId;
          }
        }
      } catch (error: any) {
        validatedSubcategoryId = null;
      }
    }

    // Validate application exists
    let validatedApplicationId = null;
    if (application_id && String(application_id).trim() !== "") {
      try {
        const applicationIdStr = String(application_id).trim();
        let application = null;

        if (isUUID(applicationIdStr)) {
          // Try to find by ID
          application = await prisma.application.findUnique({
            where: { id: applicationIdStr },
            include: { Subcategory: { include: { Category: true } } },
          });
        }

        // If not found by ID, try to find by name
        if (!application) {
          if (validatedSubcategoryId) {
            // Try within the validated subcategory
            application = await prisma.application.findFirst({
              where: {
                name: applicationIdStr,
                subcategoryId: validatedSubcategoryId,
              },
              include: { Subcategory: { include: { Category: true } } },
            });
          }

          // If still not found, try any subcategory
          if (!application) {
            application = await prisma.application.findFirst({
              where: { name: applicationIdStr },
              include: { Subcategory: { include: { Category: true } } },
            });
          }
        }

        // If still not found and we have a subcategory, auto-create it
        if (!application && validatedSubcategoryId) {
          try {
            application = await prisma.application.create({
              data: {
                name: applicationIdStr,
                subcategoryId: validatedSubcategoryId,
                status: "active",
              } as any,
              include: { Subcategory: { include: { Category: true } } },
            });
          } catch (createError: any) {
            // If creation fails (e.g., unique constraint), try to find it again
            application = await prisma.application.findFirst({
              where: {
                name: applicationIdStr,
                subcategoryId: validatedSubcategoryId,
              },
              include: { Subcategory: { include: { Category: true } } },
            });
            if (application) {
            } else {
            }
          }
        } else if (!application) {
        }

        if (application) {
          validatedApplicationId = application.id;
          // Auto-set subcategory and category if not already set
          if (!validatedSubcategoryId) {
            validatedSubcategoryId = application.subcategoryId;
            if ((application as any).Subcategory?.categoryId) {
              validatedCategoryId = (application as any).Subcategory.categoryId;
            }
          }
        }
      } catch (error: any) {
        validatedApplicationId = null;
      }
    }

    // Ensure foreign key relationships are valid
    // If subcategory is set, category must also be set and match
    if (validatedSubcategoryId && !validatedCategoryId) {
      // Get category from subcategory
      try {
        const subcategory = await prisma.subcategory.findUnique({
          where: { id: validatedSubcategoryId },
        });
        if (subcategory) {
          validatedCategoryId = subcategory.categoryId;
        } else {
          // Subcategory doesn't exist, clear it
          validatedSubcategoryId = null;
        }
      } catch (error) {
        validatedSubcategoryId = null;
      }
    }

    // If application is set, subcategory and category must also be set and match
    if (validatedApplicationId) {
      if (!validatedSubcategoryId) {
        // Get subcategory from application
        try {
          const application = await prisma.application.findUnique({
            where: { id: validatedApplicationId },
            include: { Subcategory: true },
          });
          if (application) {
            validatedSubcategoryId = application.subcategoryId;
            if ((application as any).Subcategory) {
              validatedCategoryId = (application as any).Subcategory.categoryId;
            }
          } else {
            // Application doesn't exist, clear it
            validatedApplicationId = null;
          }
        } catch (error) {
          validatedApplicationId = null;
        }
      }
      // Applications may belong to a different subcategory than the part
      // (e.g. group-level "VEHICLE PARTS" app on a "SEAL KIT" part).
    }

    const existingPart = await prisma.part.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!existingPart) {
      return res.status(404).json({ error: "Part not found" });
    }

    const normalizedKitItems = normalizeKitItemsPayload(kit_items);
    if (Array.isArray(kit_items) && normalizedKitItems.length > 0) {
      try {
        await validateKitComponents(normalizedKitItems);
      } catch (kitError: any) {
        return res.status(400).json({ error: kitError.message });
      }
    }

    // Delete existing models and create new ones
    if (models && Array.isArray(models)) {
      await prisma.model.deleteMany({
        where: { partId: id },
      });
    }

    // Build update data object
    // Build update data object - only include fields provided in req.body to avoid overwriting with null
    const updateData: any = {};
    if ("master_part_no" in req.body) updateData.masterPartId = masterPartId;
    if ("part_no" in req.body) updateData.partNo = part_no;
    if ("brand_name" in req.body) updateData.brandId = brandId;
    if ("description" in req.body)
      updateData.description = description ? String(description).trim() : null;
    if ("category_id" in req.body) updateData.categoryId = validatedCategoryId;
    if ("subcategory_id" in req.body)
      updateData.subcategoryId = validatedSubcategoryId;
    if ("application_id" in req.body)
      updateData.applicationId = validatedApplicationId;
    if ("hs_code" in req.body)
      updateData.hsCode = hs_code ? String(hs_code).trim() : null;
    if ("weight" in req.body)
      updateData.weight = weight ? parseFloat(weight) : null;
    if ("reorder_level" in req.body)
      updateData.reorderLevel = reorder_level ? parseInt(reorder_level) : 0;
    if ("uom" in req.body) updateData.uom = uom || "pcs";
    if ("cost" in req.body) {
      updateData.cost = cost ? parseFloat(cost) : null;
      updateData.purchasePrice = cost ? parseFloat(cost) : null;
      updateData.avgCost = cost ? parseFloat(cost) : null;
      updateData.costSource = "MANUAL";
    }
    if ("price_a" in req.body)
      updateData.priceA = price_a ? parseFloat(price_a) : null;
    if ("price_b" in req.body)
      updateData.priceB = price_b ? parseFloat(price_b) : null;
    if ("price_m" in req.body)
      updateData.priceM = price_m ? parseFloat(price_m) : null;
    if ("smc" in req.body) updateData.smc = smc || null;
    if ("size" in req.body) updateData.size = size || null;
    if ("origin" in req.body) updateData.origin = origin || null;
    if ("type" in req.body) updateData.type = normalizePartType(type);
    if ("status" in req.body) updateData.status = status || "active";

    // Handle images - explicitly set to null if provided as null/empty string, otherwise keep existing if not provided
    if ("image_p1" in req.body) {
      updateData.imageP1 = image_p1 && image_p1.trim() !== "" ? image_p1 : null;
    }
    if ("image_p2" in req.body) {
      updateData.imageP2 = image_p2 && image_p2.trim() !== "" ? image_p2 : null;
    }

    // Handle models
    if (models && Array.isArray(models)) {
      updateData.Model = {
        create: models.map((m: any) => ({
          name: m.name,
          qtyUsed: m.qty_used || m.qtyUsed || 1,
        })),
      };
    }

    const nextType = ("type" in req.body
      ? normalizePartType(type)
      : undefined) as "single" | "kit" | undefined;
    const effectiveType: "single" | "kit" =
      nextType ?? normalizePartType(existingPart.type || "single");

    let part;
    try {
      part = await prisma.$transaction(async (tx) => {
        const updated = await tx.part.update({
          where: { id },
          data: updateData,
          include: {
            MasterPart: true,
            Brand: true,
            Category: true,
            Subcategory: true,
            Application: true,
            Model: true,
            KitItem: true,
          },
        });

        if (effectiveType === "single") {
          await syncKitItemsForParentPart(tx, id, [], "single");
        } else if (Array.isArray(kit_items)) {
          await syncKitItemsForParentPart(tx, id, kit_items, "kit");
        }

        return tx.part.findUnique({
          where: { id },
          include: {
            MasterPart: true,
            Brand: true,
            Category: true,
            Subcategory: true,
            Application: true,
            Model: true,
            KitItem: true,
          },
        });
      });
    } catch (kitError: any) {
      if (kitError?.message === "Part not found") {
        return res.status(404).json({ error: kitError.message });
      }
      if (
        kitError?.message === "Kit items must be active single-type parts" ||
        kitError?.message === "A kit cannot include itself as a component"
      ) {
        return res.status(400).json({ error: kitError.message });
      }
      if (kitError?.code === "P2003") {
        return res.status(400).json({
          error:
            "Could not save kit items. Ensure the part exists and each kit line is an active single-type part.",
        });
      }
      throw kitError;
    }

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    // Debug log to verify application is included

    const p = part as any;
    const updatedKitItems = await buildKitItemsResponse((p.KitItem || []) as any[]);

    res.json({
      id: part.id,
      // Step 1: Master Part No
      master_part_no: p.MasterPart?.masterPartNo || null,
      // Step 2: Part Number
      part_no: part.partNo,
      // Step 3: Brand
      brand_name: p.Brand?.name || null,
      brand_id: part.brandId || null,
      // Step 4: Description
      description: part.description || null,
      // Step 5: Category
      category_name: p.Category?.name || null,
      category_id: part.categoryId || null,
      // Step 6: Subcategory
      subcategory_name: p.Subcategory?.name || null,
      subcategory_id: part.subcategoryId || null,
      // Step 7: Application
      application_name: p.Application?.name || null,
      application_id: part.applicationId || null,
      application: p.Application
        ? { id: p.Application.id, name: p.Application.name }
        : null,
      // Step 8: Other fields
      hs_code: part.hsCode || null,
      weight: part.weight || null,
      reorder_level: part.reorderLevel || 0,
      uom: part.uom || "pcs",
      cost: part.cost || null,
      purchasePrice: (part as any).purchasePrice || null,
      avgCost: (part as any).avgCost || null,
      price_a: part.priceA || null,
      price_b: part.priceB || null,
      price_m: part.priceM || null,
      smc: part.smc || null,
      size: part.size || null,
      origin: part.origin || null,
      image_p1: part.imageP1 || null,
      image_p2: part.imageP2 || null,
      status: part.status || "active",
      type: (part as any).type || "single",
      remarks: (part as any).remarks || null,
      models: (p.Model || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        qty_used: m.qtyUsed,
      })),
      kit_items: updatedKitItems,
      created_at: part.createdAt,
      updated_at: part.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete part
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if part exists
    const part = await prisma.part.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            StockMovement: true,
            PurchaseOrderItem: true,
            DirectPurchaseOrderItem: true,
            AdjustmentItem: true,
            TransferItem: true,
            StockVerificationItem: true,
            PriceHistory: true,
          },
        },
      },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    const deletability = await getPartDeletabilityCounts(id);
    if (!deletability) {
      return res.status(404).json({ error: "Part not found" });
    }
    if (!deletability.canDelete) {
      return res.status(400).json({
        error: deletability.reason || "This item cannot be deleted",
      });
    }

    // Other relationships have onDelete: Cascade, but we can inform the user
    const pc = (part as any)._count;
    const relatedCounts = {
      stockMovements: pc.StockMovement,
      purchaseOrderItems: pc.PurchaseOrderItem,
      directPurchaseOrderItems: pc.DirectPurchaseOrderItem,
      adjustmentItems: pc.AdjustmentItem,
      transferItems: pc.TransferItem,
      verificationItems: pc.StockVerificationItem,
      priceHistory: pc.PriceHistory,
    };

    const totalRelated = Object.values(relatedCounts).reduce(
      (sum: any, count: any) => sum + count,
      0,
    );

    // Delete price history records FIRST (they don't have cascade and reference the part)
    if (pc.PriceHistory > 0) {
      await prisma.priceHistory.deleteMany({
        where: { partId: id },
      });
    }

    // Delete the part (cascade deletes will handle other related records)
    await prisma.part.delete({
      where: { id },
    });

    res.json({
      message: "Part deleted successfully",
      deletedRelatedRecords:
        totalRelated > 0
          ? {
            stockMovements: relatedCounts.stockMovements,
            purchaseOrderItems: relatedCounts.purchaseOrderItems,
            directPurchaseOrderItems: relatedCounts.directPurchaseOrderItems,
            adjustmentItems: relatedCounts.adjustmentItems,
            transferItems: relatedCounts.transferItems,
            verificationItems: relatedCounts.verificationItems,
            priceHistory: relatedCounts.priceHistory,
          }
          : null,
    });
  } catch (error: any) {
    // Handle foreign key constraint errors more gracefully
    if (error.code === "P2003") {
      return res.status(400).json({
        error: "Cannot delete part due to foreign key constraints",
        details:
          "This part is referenced by other records in the system. Please remove all references before deleting.",
        code: error.code,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// Update individual part prices - MUST BE AFTER /:id routes
router.put("/:id/prices", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cost, priceA, priceB, priceM, reason, updated_by } = req.body;

    const part = await prisma.part.findUnique({
      where: { id },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    const updates: any = {};
    const historyRecords: any[] = [];

    if (cost !== undefined) {
      const oldCost = part.cost || 0;
      const newCost = parseFloat(cost);
      if (!isNaN(newCost)) {
        updates.cost = newCost;
        updates.avgCost = newCost;
        updates.purchasePrice = newCost;
        updates.costSource = "MANUAL";
        updates.costUpdatedAt = new Date();
        historyRecords.push({
          partId: part.id,
          partNo: part.partNo,
          description: part.description,
          priceField: "cost",
          updateType: "individual",
          oldValue: oldCost,
          newValue: newCost,
          itemsUpdated: 1,
          reason: reason || "Individual price update",
          updatedBy: updated_by || "System",
        });
      }
    }

    if (priceA !== undefined) {
      const oldPriceA = part.priceA || 0;
      const newPriceA = parseFloat(priceA);
      if (!isNaN(newPriceA)) {
        updates.priceA = newPriceA;
        historyRecords.push({
          partId: part.id,
          partNo: part.partNo,
          description: part.description,
          priceField: "priceA",
          updateType: "individual",
          oldValue: oldPriceA,
          newValue: newPriceA,
          itemsUpdated: 1,
          reason: reason || "Individual price update",
          updatedBy: updated_by || "System",
        });
      }
    }

    if (priceB !== undefined) {
      const oldPriceB = part.priceB || 0;
      const newPriceB = parseFloat(priceB);
      if (!isNaN(newPriceB)) {
        updates.priceB = newPriceB;
        historyRecords.push({
          partId: part.id,
          partNo: part.partNo,
          description: part.description,
          priceField: "priceB",
          updateType: "individual",
          oldValue: oldPriceB,
          newValue: newPriceB,
          itemsUpdated: 1,
          reason: reason || "Individual price update",
          updatedBy: updated_by || "System",
        });
      }
    }

    if (priceM !== undefined) {
      const oldPriceM = part.priceM || 0;
      const newPriceM = parseFloat(priceM);
      if (!isNaN(newPriceM)) {
        updates.priceM = newPriceM;
        historyRecords.push({
          partId: part.id,
          partNo: part.partNo,
          description: part.description,
          priceField: "price_m",
          updateType: "individual",
          oldValue: oldPriceM,
          newValue: newPriceM,
          itemsUpdated: 1,
          reason: reason || "Individual price update",
          updatedBy: updated_by || "System",
        });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid price fields to update" });
    }

    // Update part
    const updatedPart = await prisma.part.update({
      where: { id },
      data: updates,
    });

    // Create history records
    for (const historyData of historyRecords) {
      await prisma.priceHistory.create({
        data: historyData,
      });
    }

    res.json({
      id: updatedPart.id,
      part_no: updatedPart.partNo,
      cost: updatedPart.cost,
      price_a: updatedPart.priceA,
      price_b: updatedPart.priceB,
      price_m: updatedPart.priceM,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
