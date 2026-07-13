import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import prisma from "../config/database";

const router = express.Router();

const REQUEST_NO_BASE_REGEX = /^PIR-\d+/;
const CONSIGNEE_VALUES = ["ISB", "KHI", "Other"] as const;

const normalizeSupplierIds = (supplierIdsRaw: any): string[] =>
  Array.from(
    new Set(
      (Array.isArray(supplierIdsRaw) ? supplierIdsRaw : [])
        .map((id: any) => String(id || "").trim())
        .filter((id: string) => id.length > 0),
    ),
  );

const normalizeItems = (itemsRaw: any) =>
  (Array.isArray(itemsRaw) ? itemsRaw : [])
    .map((item: any) => {
      const khiQuantity = Number(item?.khiQuantity || 0);
      const isbQuantity = Number(item?.isbQuantity || 0);
      const otherQuantity = Number(item?.otherQuantity || 0);
      const splitQuantity = khiQuantity + isbQuantity + otherQuantity;
      const fallbackDemand = Number(item?.demandQuantity || 0);
      const demandQuantity = splitQuantity > 0 ? splitQuantity : fallbackDemand;
      return {
        partId: String(item?.partId || "").trim(),
        demandQuantity,
        khiQuantity: Number.isFinite(khiQuantity) ? khiQuantity : 0,
        isbQuantity: Number.isFinite(isbQuantity) ? isbQuantity : 0,
        otherQuantity: Number.isFinite(otherQuantity) ? otherQuantity : 0,
        weight: Number(item?.weight || 0),
      };
    })
    .filter(
      (item: any) =>
        item.partId &&
        Number.isFinite(item.demandQuantity) &&
        item.demandQuantity > 0,
    );

const getBaseRequestNo = (requestNo: string | null | undefined) => {
  if (!requestNo) return "";
  const match = requestNo.match(REQUEST_NO_BASE_REGEX);
  return match?.[0] || requestNo;
};

const normalizeRequestStatus = (value: any): "pending" | "confirm" => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "confirm" ? "confirm" : "pending";
};

const normalizeConsignee = (value: any): "ISB" | "KHI" | "Other" | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.toUpperCase() === "ISB") return "ISB";
  if (raw.toUpperCase() === "KHI") return "KHI";
  if (raw.toLowerCase() === "other") return "Other";
  return null;
};

const normalizeRequestDate = (value: unknown): Date => {
  if (value === undefined || value === null) return new Date();
  const raw = String(value).trim();
  if (!raw) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
};

const resolveRequestConsignee = async (
  purchaseImportRequestModel: any,
  row: { batchId: string; consignee?: string | null },
): Promise<string | null> => {
  const current = String(row.consignee || "").trim();
  if (current) return current;

  const sibling = await purchaseImportRequestModel.findFirst({
    where: {
      batchId: row.batchId,
      consignee: { not: null },
    },
    select: { consignee: true },
    orderBy: { createdAt: "asc" },
  });
  const siblingValue = String(sibling?.consignee || "").trim();
  return siblingValue || null;
};

const normalizeQuotationStatus = (value: any): "pending" | "confirm" | "revise" => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "confirm") return "confirm";
  if (normalized === "revise") return "revise";
  return "pending";
};

const normalizeQuotationNo = (value: any): string => String(value || "").trim();

const findDuplicateQuotationNo = async (
  purchaseQuotationModel: any,
  quotationNo: string,
  excludeQuotationId?: string,
) =>
  purchaseQuotationModel.findFirst({
    where: {
      quotationNo,
      ...(excludeQuotationId ? { id: { not: excludeQuotationId } } : {}),
    },
    select: { id: true },
  });

async function generateImportPoNumber(tx?: {
  purchaseOrder: { findMany: typeof prisma.purchaseOrder.findMany };
}): Promise<string> {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PO-${year}${month}-`;
  const client = tx?.purchaseOrder ?? prisma.purchaseOrder;

  const existingOrders = await client.findMany({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: "desc" },
    select: { poNumber: true },
  });

  const numbers = existingOrders
    .map((order) => {
      const match = order.poNumber.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((num) => num > 0);

  const nextNum = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(nextNum).padStart(3, "0")}`;
}

async function reserveImportPoNumbers(
  count: number,
  tx?: {
    purchaseOrder: { findMany: typeof prisma.purchaseOrder.findMany };
  },
): Promise<string[]> {
  if (count <= 0) return [];

  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PO-${year}${month}-`;
  const client = tx?.purchaseOrder ?? prisma.purchaseOrder;

  const existingOrders = await client.findMany({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: "desc" },
    select: { poNumber: true },
  });

  const numbers = existingOrders
    .map((order) => {
      const match = order.poNumber.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((num) => num > 0);

  let nextNum = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  const reserved: string[] = [];
  for (let i = 0; i < count; i += 1) {
    reserved.push(`${prefix}${String(nextNum).padStart(3, "0")}`);
    nextNum += 1;
  }
  return reserved;
}

async function createPurchaseOrderFromQuotation(quotationId: string) {
  const result = await confirmPurchaseQuotation(quotationId, {
    confirmationDate: new Date(),
    items: null,
  });
  return result.purchaseOrders[0] || null;
}

type ConfirmQuotationItemInput = {
  partId: string;
  confirmQuantity: number;
  khiQuantity?: number;
  isbQuantity?: number;
  otherQuantity?: number;
};

type PoLaneKey = "khi" | "isb" | "other";

const PO_LANE_CONSIGNEE: Record<PoLaneKey, string> = {
  khi: "khi",
  isb: "isb",
  other: "other",
};

function distributeConfirmQuantity(
  confirmQty: number,
  quotationQty: number,
  khi: number,
  isb: number,
  other: number,
): Record<PoLaneKey, number> {
  const safeConfirm = Math.max(0, Math.floor(Number(confirmQty) || 0));
  if (safeConfirm <= 0) {
    return { khi: 0, isb: 0, other: 0 };
  }

  const splitTotal = Math.max(0, khi) + Math.max(0, isb) + Math.max(0, other);
  if (splitTotal <= 0) {
    return { khi: 0, isb: 0, other: safeConfirm };
  }

  const khiQty = Math.round((Math.max(0, khi) / splitTotal) * safeConfirm);
  const isbQty = Math.round((Math.max(0, isb) / splitTotal) * safeConfirm);
  let otherQty = safeConfirm - khiQty - isbQty;
  if (otherQty < 0) {
    otherQty = 0;
  }

  return { khi: khiQty, isb: isbQty, other: otherQty };
}

async function confirmPurchaseQuotation(
  quotationId: string,
  options: {
    confirmationDate?: Date | string | null;
    items?: ConfirmQuotationItemInput[] | null;
  },
) {
  const purchaseQuotationModel = (prisma as any).purchaseQuotation;
  if (!purchaseQuotationModel) {
    throw new Error(
      "Purchase quotation model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
    );
  }

  const quotation = await purchaseQuotationModel.findUnique({
    where: { id: quotationId },
    include: {
      PurchaseQuotationItem: true,
      PurchaseImportRequest: {
        select: {
          requestNo: true,
          PurchaseImportRequestItem: {
            select: {
              partId: true,
              khiQuantity: true,
              isbQuantity: true,
              otherQuantity: true,
            },
          },
        },
      },
      PurchaseOrder: {
        select: {
          id: true,
          poNumber: true,
          status: true,
          totalAmount: true,
          consignee: true,
        },
      },
    },
  });

  if (!quotation) {
    throw new Error("Purchase quotation not found.");
  }

  if (quotation.PurchaseOrder?.length > 0) {
    return {
      quotation: {
        id: quotation.id,
        quotationNo: quotation.quotationNo,
        status: quotation.status,
        confirmationDate: quotation.confirmationDate,
      },
      purchaseOrders: quotation.PurchaseOrder,
    };
  }

  const currentStatus = String(quotation.status || "").toLowerCase();
  if (currentStatus === "confirm") {
    // Allow creating POs if confirmation happened without orders (retry path).
  }

  const inquirySplitByPartId = new Map<
    string,
    { khiQuantity: number; isbQuantity: number; otherQuantity: number }
  >(
    (quotation.PurchaseImportRequest?.PurchaseImportRequestItem || []).map(
      (item: any) => [
        String(item.partId),
        {
          khiQuantity: Number(item.khiQuantity || 0),
          isbQuantity: Number(item.isbQuantity || 0),
          otherQuantity: Number(item.otherQuantity || 0),
        },
      ],
    ),
  );

  const confirmItemByPartId = new Map<string, ConfirmQuotationItemInput>();
  if (Array.isArray(options.items) && options.items.length > 0) {
    for (const item of options.items) {
      const partId = String(item?.partId || "").trim();
      if (!partId) continue;
      confirmItemByPartId.set(partId, {
        partId,
        confirmQuantity: Math.max(0, Math.floor(Number(item.confirmQuantity || 0))),
        khiQuantity:
          item?.khiQuantity !== undefined
            ? Math.max(0, Math.floor(Number(item.khiQuantity)))
            : undefined,
        isbQuantity:
          item?.isbQuantity !== undefined
            ? Math.max(0, Math.floor(Number(item.isbQuantity)))
            : undefined,
        otherQuantity:
          item?.otherQuantity !== undefined
            ? Math.max(0, Math.floor(Number(item.otherQuantity)))
            : undefined,
      });
    }
  }

  const useRevisedRates = String(quotation.quotationType || "").toLowerCase() === "revised";
  const laneItems: Record<
    PoLaneKey,
    Array<{ partId: string; quantity: number; unitCost: number; totalCost: number }>
  > = {
    khi: [],
    isb: [],
    other: [],
  };

  for (const item of quotation.PurchaseQuotationItem || []) {
    const partId = String(item.partId || "").trim();
    if (!partId) continue;

    const quotationQty = Number(item.quotationQuantity || 0);
    const itemInput = confirmItemByPartId.get(partId);
    const confirmQty = itemInput ? Number(itemInput.confirmQuantity || 0) : quotationQty;

    if (confirmQty <= 0) continue;

    const hasExplicitSplit =
      itemInput &&
      (itemInput.khiQuantity !== undefined ||
        itemInput.isbQuantity !== undefined ||
        itemInput.otherQuantity !== undefined);

    let laneQty: Record<PoLaneKey, number>;
    if (hasExplicitSplit) {
      const khi = Number(itemInput.khiQuantity || 0);
      const isb = Number(itemInput.isbQuantity || 0);
      const other = Number(itemInput.otherQuantity || 0);
      const splitSum = khi + isb + other;
      if (splitSum !== confirmQty) {
        throw new Error(
          `ISB, KHI, and Other quantities must total the confirm quantity (${confirmQty}) for part ${partId}.`,
        );
      }
      laneQty = { khi, isb, other };
    } else {
      const split = inquirySplitByPartId.get(partId) || {
        khiQuantity: 0,
        isbQuantity: 0,
        otherQuantity: 0,
      };
      laneQty = distributeConfirmQuantity(
        confirmQty,
        quotationQty,
        split.khiQuantity,
        split.isbQuantity,
        split.otherQuantity,
      );
    }

    const revisedLcRate = Number(item.revisedLcRate || 0);
    const lcRate = Number(item.lcRate || 0);
    const unitCost =
      useRevisedRates && revisedLcRate > 0 ? revisedLcRate : lcRate;

    (Object.keys(laneQty) as PoLaneKey[]).forEach((lane) => {
      const quantity = laneQty[lane];
      if (quantity <= 0) return;
      laneItems[lane].push({
        partId,
        quantity,
        unitCost,
        totalCost: unitCost * quantity,
      });
    });
  }

  const lanesWithItems = (Object.keys(laneItems) as PoLaneKey[]).filter(
    (lane) => laneItems[lane].length > 0,
  );

  if (lanesWithItems.length === 0) {
    throw new Error("No items with confirm quantity to order.");
  }

  const confirmationDate = parseDateOrNow(options.confirmationDate);
  const requestNo = quotation.PurchaseImportRequest?.requestNo || "";

  const createdOrders = await prisma.$transaction(async (tx) => {
    await (tx as any).purchaseQuotation.update({
      where: { id: quotationId },
      data: {
        status: "confirm",
        confirmationDate,
        updatedAt: new Date(),
      },
    });

    const orders: Array<{
      id: string;
      poNumber: string;
      status: string;
      totalAmount: number;
      consignee: string | null;
    }> = [];

    const poNumbers = await reserveImportPoNumbers(lanesWithItems.length, tx);

    for (const [laneIndex, lane] of lanesWithItems.entries()) {
      const poItems = laneItems[lane];
      const totalAmount = poItems.reduce((sum, row) => sum + row.totalCost, 0);
      const poNumber = poNumbers[laneIndex];
      const consignee = PO_LANE_CONSIGNEE[lane];
      const notes = `Created from purchase quotation ${quotation.quotationNo}${
        requestNo ? ` (Inquiry ${requestNo})` : ""
      } - ${consignee.toUpperCase()}`;

      const created = await tx.purchaseOrder.create({
        data: {
          id: randomUUID(),
          poNumber,
          date: confirmationDate,
          supplierId: quotation.supplierId,
          purchaseQuotationId: quotationId,
          consignee,
          currency: quotation.currency,
          conversionRate: Number(quotation.conversionRate || 1),
          status: "Pending",
          notes,
          totalAmount,
          updatedAt: new Date(),
        } as any,
      });

      await tx.purchaseOrderItem.createMany({
        data: poItems.map((row) => ({
          id: randomUUID(),
          purchaseOrderId: created.id,
          partId: row.partId,
          quantity: row.quantity,
          unitCost: row.unitCost,
          totalCost: row.totalCost,
          receivedQty: 0,
        })),
      });

      orders.push({
        id: created.id,
        poNumber: created.poNumber,
        status: created.status,
        totalAmount: created.totalAmount,
        consignee: (created as any).consignee ?? null,
      });
    }

    return orders;
  });

  return {
    quotation: {
      id: quotation.id,
      quotationNo: quotation.quotationNo,
      status: "confirm",
      confirmationDate,
    },
    purchaseOrders: createdOrders,
  };
}

const PURCHASE_QUOTATION_TERMS = [
  "EX-Works",
  "F.O.B",
  "CTF/CNF",
  "CFR",
  "CIF",
] as const;

const normalizePurchaseQuotationTerms = (value: any): string | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const matched = PURCHASE_QUOTATION_TERMS.find(
    (term) => term.toLowerCase() === raw.toLowerCase(),
  );
  return matched || null;
};

const parseDateOrNow = (value: any) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const parseOptionalDate = (value: any) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveLastQuotationFcRate = (item: {
  fcRate?: number | null;
  revisedFcRate?: number | null;
}) => {
  const revised = Number(item.revisedFcRate || 0);
  if (revised > 0) return revised;
  return Number(item.fcRate || 0);
};

const isQuotationRevisedRecord = (quotation: {
  quotationType?: string | null;
  status?: string | null;
}) => {
  const type = String(quotation.quotationType || "").trim().toLowerCase();
  const status = String(quotation.status || "").trim().toLowerCase();
  return type === "revised" || status === "revise";
};

const getEffectiveQuotationItemValues = (
  item: {
    fcRate?: number | null;
    fcAmount?: number | null;
    lcRate?: number | null;
    lcAmount?: number | null;
    revisedFcRate?: number | null;
    revisedFcAmount?: number | null;
    revisedLcRate?: number | null;
    revisedLcAmount?: number | null;
  },
  isRevised: boolean,
) => {
  if (isRevised) {
    const fcRate =
      Number(item.revisedFcRate || 0) > 0
        ? Number(item.revisedFcRate)
        : Number(item.fcRate || 0);
    const fcAmount =
      Number(item.revisedFcAmount || 0) > 0
        ? Number(item.revisedFcAmount)
        : Number(item.fcAmount || 0);
    const lcRate =
      Number(item.revisedLcRate || 0) > 0
        ? Number(item.revisedLcRate)
        : Number(item.lcRate || 0);
    const lcAmount =
      Number(item.revisedLcAmount || 0) > 0
        ? Number(item.revisedLcAmount)
        : Number(item.lcAmount || 0);
    return { fcRate, fcAmount, lcRate, lcAmount };
  }
  return {
    fcRate: Number(item.fcRate || 0),
    fcAmount: Number(item.fcAmount || 0),
    lcRate: Number(item.lcRate || 0),
    lcAmount: Number(item.lcAmount || 0),
  };
};

async function getLastSupplierFcRatesByPartIds(
  supplierId: string,
  partIds: string[],
  excludeQuotationId?: string | null,
): Promise<Map<string, number>> {
  const uniquePartIds = Array.from(
    new Set(partIds.map((id) => String(id || "").trim()).filter(Boolean)),
  );
  const normalizedSupplierId = String(supplierId || "").trim();
  if (!normalizedSupplierId || uniquePartIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.purchaseQuotationItem.findMany({
    where: {
      partId: { in: uniquePartIds },
      PurchaseQuotation: {
        supplierId: normalizedSupplierId,
        ...(excludeQuotationId
          ? { id: { not: String(excludeQuotationId) } }
          : {}),
      },
    },
    select: {
      partId: true,
      fcRate: true,
      revisedFcRate: true,
      createdAt: true,
      PurchaseQuotation: {
        select: {
          quotationDate: true,
          createdAt: true,
        },
      },
    },
  });

  rows.sort((a, b) => {
    const dateA = new Date(a.PurchaseQuotation?.quotationDate || 0).getTime();
    const dateB = new Date(b.PurchaseQuotation?.quotationDate || 0).getTime();
    if (dateB !== dateA) return dateB - dateA;
    const createdA = new Date(a.PurchaseQuotation?.createdAt || 0).getTime();
    const createdB = new Date(b.PurchaseQuotation?.createdAt || 0).getTime();
    if (createdB !== createdA) return createdB - createdA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const rateMap = new Map<string, number>();
  for (const row of rows) {
    const partId = String(row.partId || "");
    if (!partId || rateMap.has(partId)) continue;
    const rate = resolveLastQuotationFcRate(row);
    if (rate > 0) {
      rateMap.set(partId, rate);
    }
  }

  return rateMap;
}

async function attachLastSupplierFcRates(
  supplierId: string,
  items: any[],
  excludeQuotationId?: string | null,
) {
  const rateMap = await getLastSupplierFcRatesByPartIds(
    supplierId,
    items.map((item) => item.partId),
    excludeQuotationId,
  );
  return items.map((item) => ({
    ...item,
    lastFcRate: rateMap.get(String(item.partId)) ?? 0,
  }));
}

router.get("/suppliers/:supplierId/last-fc-rates", async (req: Request, res: Response) => {
  try {
    const supplierId = String(req.params.supplierId || "").trim();
    if (!supplierId) {
      return res.status(400).json({ error: "Supplier id is required." });
    }

    const partIds = String(req.query.part_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const excludeQuotationId = req.query.exclude_quotation_id
      ? String(req.query.exclude_quotation_id).trim()
      : null;

    const rateMap = await getLastSupplierFcRatesByPartIds(
      supplierId,
      partIds,
      excludeQuotationId,
    );

    res.json({
      data: Object.fromEntries(rateMap.entries()),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/alternate-parts/:partId", async (req: Request, res: Response) => {
  try {
    const partId = String(req.params.partId || "").trim();
    if (!partId) {
      return res.status(400).json({ error: "Part id is required." });
    }

    const part = await prisma.part.findUnique({
      where: { id: partId },
      select: {
        id: true,
        partNo: true,
        masterPartId: true,
        MasterPart: { select: { masterPartNo: true } },
      },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    const partNo = String(part.partNo || "").trim();
    const masterPartNo = String(part.MasterPart?.masterPartNo || "").trim();
    const searchKeys = Array.from(
      new Set([partNo, masterPartNo].filter((value) => value.length > 0)),
    );

    if (searchKeys.length === 0 && !part.masterPartId) {
      return res.json({ data: [] });
    }

    const params: unknown[] = [partId];
    const matchClauses: string[] = [];
    let paramIdx = 2;

    for (const key of searchKeys) {
      params.push(`%${key}%`);
      matchClauses.push(`(
        p."partNo" ILIKE $${paramIdx}
        OR mp."masterPartNo" ILIKE $${paramIdx}
        OR (p."masterPartId" IS NOT NULL AND p."masterPartId" IN (
          SELECT "masterPartId" FROM "Part"
          WHERE "partNo" ILIKE $${paramIdx} AND "masterPartId" IS NOT NULL
          UNION
          SELECT id FROM "MasterPart" WHERE "masterPartNo" ILIKE $${paramIdx}
        ))
      )`);
      paramIdx += 1;
    }

    if (part.masterPartId) {
      params.push(part.masterPartId);
      matchClauses.push(`p."masterPartId" = $${paramIdx}::uuid`);
      paramIdx += 1;
    }

    const whereMatch =
      matchClauses.length > 0 ? `AND (${matchClauses.join(" OR ")})` : "";

    const rows = (await prisma.$queryRawUnsafe(
      `
        SELECT
          p.id,
          p."partNo" AS "partNo",
          p.description,
          COALESCE(p.weight, 0) AS weight,
          COALESCE(mp."masterPartNo", '') AS "masterPartNo",
          COALESCE(b.name, '') AS brand_name
        FROM "Part" p
        LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
        LEFT JOIN "Brand" b ON p."brandId" = b.id
        WHERE p.id::text <> $1::text
        ${whereMatch}
        ORDER BY mp."masterPartNo" ASC NULLS LAST, p."partNo" ASC
        LIMIT 200
      `,
      ...params,
    )) as Array<{
      id: string;
      partNo: string;
      description: string | null;
      weight: number;
      masterPartNo: string;
      brand_name: string;
    }>;

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        partNo: row.partNo,
        masterPartNo: row.masterPartNo || "",
        description: row.description || "",
        brand: row.brand_name || "",
        weight: Number(row.weight || 0),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/part-details/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    const includeHistory =
      String(req.query.includeHistory || "").toLowerCase() === "true" ||
      String(req.query.includeHistory || "") === "1";

    const part = await prisma.part.findUnique({
      where: { id: partId },
      select: {
        id: true,
        partNo: true,
        description: true,
        weight: true,
        Brand: { select: { name: true } },
        MasterPart: { select: { masterPartNo: true } },
      },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    // Aggregate stock in DB instead of loading every movement row.
    const stockRows = await prisma.$queryRaw<Array<{ stock: number | bigint | null }>>`
      SELECT COALESCE(
        SUM(
          CASE
            WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation'
            THEN CASE WHEN type = 'in' THEN quantity ELSE -quantity END
            ELSE 0
          END
        ),
        0
      ) AS stock
      FROM "StockMovement"
      WHERE "partId" = ${partId}
    `;
    const currentStock = Number(stockRows?.[0]?.stock ?? 0);

    let lastPurchases: Array<{
      source: string;
      documentNumber: string;
      date: Date;
      supplierName: string;
      quantity: number;
      rate: number;
      amount: number;
    }> = [];

    if (includeHistory) {
      const [dpoItems, poItems] = await Promise.all([
        prisma.directPurchaseOrderItem.findMany({
          where: { partId },
          take: 3,
          orderBy: { createdAt: "desc" },
          include: {
            DirectPurchaseOrder: {
              select: {
                dpoNumber: true,
                date: true,
                Supplier: {
                  select: {
                    name: true,
                    companyName: true,
                  },
                },
              },
            },
          },
        }),
        prisma.purchaseOrderItem.findMany({
          where: { partId },
          take: 3,
          orderBy: { createdAt: "desc" },
          include: {
            PurchaseOrder: {
              select: {
                poNumber: true,
                date: true,
                Supplier: {
                  select: {
                    name: true,
                    companyName: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      const normalizedDpo = dpoItems.map((row) => ({
        source: "DPO",
        documentNumber: row.DirectPurchaseOrder?.dpoNumber || "-",
        date: row.DirectPurchaseOrder?.date || row.createdAt,
        supplierName:
          row.DirectPurchaseOrder?.Supplier?.companyName ||
          row.DirectPurchaseOrder?.Supplier?.name ||
          "-",
        quantity: row.quantity,
        rate: row.purchasePrice,
        amount: row.amount,
      }));

      const normalizedPo = poItems.map((row) => ({
        source: "PO",
        documentNumber: row.PurchaseOrder?.poNumber || "-",
        date: row.PurchaseOrder?.date || row.createdAt,
        supplierName:
          row.PurchaseOrder?.Supplier?.companyName ||
          row.PurchaseOrder?.Supplier?.name ||
          "-",
        quantity: row.quantity,
        rate: row.unitCost,
        amount: row.totalCost,
      }));

      lastPurchases = [...normalizedDpo, ...normalizedPo]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3);
    }

    res.json({
      data: {
        part: {
          id: part.id,
          partNo: part.partNo,
          description: part.description || "",
          masterPartNo: part.MasterPart?.masterPartNo || "",
          brand: part.Brand?.name || "",
          weight: part.weight || 0,
        },
        currentStock,
        lastPurchases,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/requests", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseImportRequestItemModel = (prisma as any).purchaseImportRequestItem;
    if (!purchaseImportRequestModel || !purchaseImportRequestItemModel) {
      return res.status(500).json({
        error:
          "Purchase import models are unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const supplierIdsRaw = req.body?.supplierIds;
    const itemsRaw = req.body?.items;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    const partReference =
      typeof req.body?.partReference === "string"
        ? req.body.partReference.trim()
        : "";
    const rawConsignee = req.body?.consignee;
    const consignee = normalizeConsignee(rawConsignee);
    const requestDate = normalizeRequestDate(req.body?.requestDate);

    const supplierIds = normalizeSupplierIds(supplierIdsRaw);
    const items = normalizeItems(itemsRaw);

    if (items.length === 0) {
      return res
        .status(400)
        .json({ error: "Please add at least one valid item row." });
    }

    if (
      rawConsignee !== undefined &&
      rawConsignee !== null &&
      String(rawConsignee).trim() !== "" &&
      !consignee
    ) {
      return res.status(400).json({
        error: `Consignee must be one of: ${CONSIGNEE_VALUES.join(", ")}`,
      });
    }

    const partIds: string[] = Array.from(
      new Set(items.map((item: any) => String(item.partId))),
    );
    const [suppliersCount, partsCount, movements] = await Promise.all([
      supplierIds.length > 0
        ? prisma.supplier.count({ where: { id: { in: supplierIds } } })
        : Promise.resolve(0),
      prisma.part.count({ where: { id: { in: partIds } } }),
      prisma.stockMovement.findMany({
        where: { partId: { in: partIds } },
        select: { partId: true, type: true, quantity: true },
      }),
    ]);

    if (supplierIds.length > 0 && suppliersCount !== supplierIds.length) {
      return res.status(400).json({ error: "One or more suppliers are invalid." });
    }

    if (partsCount !== partIds.length) {
      return res.status(400).json({ error: "One or more items are invalid." });
    }

    const stockByPartId = movements.reduce(
      (acc, row) => {
        const delta = row.type === "in" ? row.quantity : -row.quantity;
        acc[row.partId] = (acc[row.partId] || 0) + delta;
        return acc;
      },
      {} as Record<string, number>,
    );

    const batchId = randomUUID();
    let requestCount = 0;
    let itemRecordCount = 0;
    let baseRequestNo = "";

    await prisma.$transaction(async (tx) => {
      const maxRequestNoRows = await (tx as any).$queryRaw<
        Array<{ maxNo: number | null }>
      >`SELECT COALESCE(MAX((regexp_match("requestNo", '^PIR-([0-9]+)'))[1]::INT), 0) AS "maxNo" FROM "PurchaseImportRequest"`;
      const maxNo = Number(maxRequestNoRows?.[0]?.maxNo || 0);
      baseRequestNo = `PIR-${String(maxNo + 1).padStart(4, "0")}`;
      const requestSuppliers: Array<string | null> =
        supplierIds.length > 0 ? supplierIds : [null];

      for (const supplierId of requestSuppliers) {
        const requestId = randomUUID();
        const requestNo =
          requestSuppliers.length > 1
            ? `${baseRequestNo}-${requestCount + 1}`
            : baseRequestNo;
        await (tx as any).purchaseImportRequest.create({
          data: {
            id: requestId,
            requestNo,
            batchId,
            supplierId: supplierId || null,
            partReference: partReference || null,
            consignee,
            status: "pending",
            notes: notes || null,
            createdAt: requestDate,
            updatedAt: new Date(),
          },
        });
        requestCount += 1;

        const itemRecords = items.map((item: any) => {
          const weight = Number.isFinite(item.weight) ? item.weight : 0;
          const totalWeight = item.demandQuantity * weight;
          return {
            id: randomUUID(),
            purchaseImportRequestId: requestId,
            partId: item.partId,
            currentStock: stockByPartId[item.partId] || 0,
            demandQuantity: item.demandQuantity,
            khiQuantity: item.khiQuantity,
            isbQuantity: item.isbQuantity,
            otherQuantity: item.otherQuantity,
            weight,
            totalWeight,
            createdAt: requestDate,
            updatedAt: new Date(),
          };
        });

        await (tx as any).purchaseImportRequestItem.createMany({
          data: itemRecords,
        });
        itemRecordCount += itemRecords.length;
      }
    });

    res.status(201).json({
      data: {
        batchId,
        baseRequestNo,
        createdCount: itemRecordCount,
        requestCount,
        supplierCount: supplierIds.length,
        itemCount: items.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/requests/:requestId", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    if (!purchaseImportRequestModel) {
      return res.status(500).json({
        error:
          "Purchase import request model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({ error: "Request id is required." });
    }

    const selectedRequest = await purchaseImportRequestModel.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        batchId: true,
        notes: true,
        status: true,
        requestNo: true,
        partReference: true,
        consignee: true,
        createdAt: true,
      },
    });

    if (!selectedRequest) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }

    const batchRows = await purchaseImportRequestModel.findMany({
      where: { batchId: selectedRequest.batchId },
      orderBy: { createdAt: "asc" },
      include: {
        PurchaseImportRequestItem: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const selectedBatchRow =
      batchRows.find((row: any) => row.id === requestId) ?? batchRows[0];
    const items = (selectedBatchRow?.PurchaseImportRequestItem || []).map(
      (item: any) => ({
        id: item.id,
        partId: item.partId,
        demandQuantity:
          Number(item.khiQuantity || 0) +
            Number(item.isbQuantity || 0) +
            Number(item.otherQuantity || 0) ||
          Number(item.demandQuantity || 0),
        khiQuantity: Number(item.khiQuantity || 0),
        isbQuantity: Number(item.isbQuantity || 0),
        otherQuantity: Number(item.otherQuantity || 0),
        weight: item.weight,
        currentStock: item.currentStock,
        totalWeight: item.totalWeight,
      }),
    );

    res.json({
      data: {
        id: selectedRequest.id,
        batchId: selectedRequest.batchId,
        requestNo: selectedRequest.requestNo,
        baseRequestNo: getBaseRequestNo(selectedRequest.requestNo),
        requestDate: selectedRequest.createdAt,
        partReference: selectedRequest.partReference || "",
        consignee:
          batchRows.find((row: any) => row.consignee)?.consignee ||
          selectedRequest.consignee ||
          null,
        notes: selectedRequest.notes || "",
        status: selectedRequest.status || "pending",
        supplierIds: batchRows
          .map((row: any) => row.supplierId)
          .filter((id: any) => typeof id === "string" && id.trim() !== ""),
        items,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/requests/:requestId", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseImportRequestItemModel = (prisma as any).purchaseImportRequestItem;
    if (!purchaseImportRequestModel || !purchaseImportRequestItemModel) {
      return res.status(500).json({
        error:
          "Purchase import models are unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({ error: "Request id is required." });
    }

    const supplierIds = normalizeSupplierIds(req.body?.supplierIds);
    const items = normalizeItems(req.body?.items);
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    const partReference =
      typeof req.body?.partReference === "string"
        ? req.body.partReference.trim()
        : "";
    const rawConsignee = req.body?.consignee;
    const consignee = normalizeConsignee(rawConsignee);
    const hasRequestDate =
      req.body?.requestDate !== undefined &&
      req.body?.requestDate !== null &&
      String(req.body.requestDate).trim() !== "";
    const requestDate = hasRequestDate
      ? normalizeRequestDate(req.body.requestDate)
      : null;

    if (items.length === 0) {
      return res
        .status(400)
        .json({ error: "Please add at least one valid item row." });
    }

    if (
      rawConsignee !== undefined &&
      rawConsignee !== null &&
      String(rawConsignee).trim() !== "" &&
      !consignee
    ) {
      return res.status(400).json({
        error: `Consignee must be one of: ${CONSIGNEE_VALUES.join(", ")}`,
      });
    }

    const requestRow = await purchaseImportRequestModel.findUnique({
      where: { id: requestId },
      select: { batchId: true, requestNo: true },
    });
    if (!requestRow) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }

    const confirmedRowsCount = await purchaseImportRequestModel.count({
      where: { batchId: requestRow.batchId, status: "confirm" },
    });
    if (confirmedRowsCount > 0) {
      return res.status(400).json({
        error: "Confirmed request cannot be edited.",
      });
    }

    const partIds: string[] = Array.from(
      new Set(items.map((item: any) => String(item.partId))),
    );
    const [suppliersCount, partsCount, movements] = await Promise.all([
      supplierIds.length > 0
        ? prisma.supplier.count({ where: { id: { in: supplierIds } } })
        : Promise.resolve(0),
      prisma.part.count({ where: { id: { in: partIds } } }),
      prisma.stockMovement.findMany({
        where: { partId: { in: partIds } },
        select: { partId: true, type: true, quantity: true },
      }),
    ]);

    if (supplierIds.length > 0 && suppliersCount !== supplierIds.length) {
      return res.status(400).json({ error: "One or more suppliers are invalid." });
    }

    if (partsCount !== partIds.length) {
      return res.status(400).json({ error: "One or more items are invalid." });
    }

    const stockByPartId = movements.reduce(
      (acc, row) => {
        const delta = row.type === "in" ? row.quantity : -row.quantity;
        acc[row.partId] = (acc[row.partId] || 0) + delta;
        return acc;
      },
      {} as Record<string, number>,
    );

    const batchId = requestRow.batchId;
    const baseRequestNo = getBaseRequestNo(requestRow.requestNo);
    let requestCount = 0;
    let itemRecordCount = 0;

    await prisma.$transaction(async (tx) => {
      if (requestDate) {
        await (tx as any).purchaseImportRequest.updateMany({
          where: { batchId },
          data: { createdAt: requestDate, updatedAt: new Date() },
        });
      }

      const existingBatchRequests = await (tx as any).purchaseImportRequest.findMany({
        where: { batchId },
        orderBy: { createdAt: "asc" },
        select: { id: true, supplierId: true },
      });
      const existingBySupplierId = new Map<
        string | null,
        { id: string; supplierId: string | null }
      >();
      for (const row of existingBatchRequests) {
        if (!existingBySupplierId.has(row.supplierId)) {
          existingBySupplierId.set(row.supplierId, row);
        }
      }

      const targetSupplierIds: Array<string | null> =
        supplierIds.length > 0 ? supplierIds : [null];
      const activeRequestIds: string[] = [];
      const matchedExistingIds = new Set<string>();

      const takeReusableExisting = () =>
        existingBatchRequests.find((row: any) => !matchedExistingIds.has(row.id));

      for (let index = 0; index < targetSupplierIds.length; index += 1) {
        const supplierId = targetSupplierIds[index];
        const requestNo =
          targetSupplierIds.length > 1
            ? `${baseRequestNo}-${index + 1}`
            : baseRequestNo;
        const existing = existingBySupplierId.get(supplierId);
        const rowToUpdate =
          existing && !matchedExistingIds.has(existing.id)
            ? existing
            : takeReusableExisting();

        if (rowToUpdate) {
          await (tx as any).purchaseImportRequest.update({
            where: { id: rowToUpdate.id },
            data: {
              requestNo,
              supplierId: supplierId || null,
              partReference: partReference || null,
              consignee,
              notes: notes || null,
              updatedAt: new Date(),
            },
          });
          matchedExistingIds.add(rowToUpdate.id);
          activeRequestIds.push(rowToUpdate.id);
          continue;
        }

        const newRequestId = randomUUID();
        await (tx as any).purchaseImportRequest.create({
          data: {
            id: newRequestId,
            requestNo,
            batchId,
            supplierId: supplierId || null,
            partReference: partReference || null,
            consignee,
            status: "pending",
            notes: notes || null,
            createdAt: requestDate || new Date(),
            updatedAt: new Date(),
          },
        });
        matchedExistingIds.add(newRequestId);
        activeRequestIds.push(newRequestId);
      }

      const removableRequestIds = existingBatchRequests
        .filter(
          (row: any) =>
            !matchedExistingIds.has(row.id) && row.id !== requestId,
        )
        .map((row: any) => row.id);

      if (removableRequestIds.length > 0) {
        await (tx as any).purchaseImportRequest.deleteMany({
          where: { id: { in: removableRequestIds } },
        });
      }

      const itemTargetRequestIds = Array.from(
        new Set([...activeRequestIds, requestId]),
      );

      await (tx as any).purchaseImportRequestItem.deleteMany({
        where: { purchaseImportRequestId: { in: itemTargetRequestIds } },
      });

      for (const activeRequestId of itemTargetRequestIds) {
        const itemRecords = items.map((item: any) => {
          const weight = Number.isFinite(item.weight) ? item.weight : 0;
          const totalWeight = item.demandQuantity * weight;
          return {
            id: randomUUID(),
            purchaseImportRequestId: activeRequestId,
            partId: item.partId,
            currentStock: stockByPartId[item.partId] || 0,
            demandQuantity: item.demandQuantity,
            khiQuantity: item.khiQuantity,
            isbQuantity: item.isbQuantity,
            otherQuantity: item.otherQuantity,
            weight,
            totalWeight,
            createdAt: requestDate || new Date(),
            updatedAt: new Date(),
          };
        });

        await (tx as any).purchaseImportRequestItem.createMany({
          data: itemRecords,
        });
        requestCount += 1;
        itemRecordCount += itemRecords.length;
      }
    });

    res.json({
      data: {
        batchId,
        updatedCount: itemRecordCount,
        requestCount,
        supplierCount: supplierIds.length,
        itemCount: items.length,
        savedItemCount: items.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/requests/:requestId/status", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    if (!purchaseImportRequestModel) {
      return res.status(500).json({
        error:
          "Purchase import request model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({ error: "Request id is required." });
    }

    const status = normalizeRequestStatus(req.body?.status);
    const requestRow = await purchaseImportRequestModel.findUnique({
      where: { id: requestId },
      select: { id: true, batchId: true },
    });
    if (!requestRow) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }

    if (status === "confirm") {
      const supplierRowsCount = await purchaseImportRequestModel.count({
        where: {
          batchId: requestRow.batchId,
          supplierId: { not: null },
        },
      });
      if (supplierRowsCount === 0) {
        return res.status(400).json({
          error:
            "Select at least one supplier on this inquiry before confirming.",
        });
      }
    }

    if (status === "pending") {
      const batchRequestRows = await purchaseImportRequestModel.findMany({
        where: { batchId: requestRow.batchId },
        select: { id: true },
      });
      const batchRequestIds = batchRequestRows.map((row: { id: string }) => row.id);
      const purchaseQuotationModel = (prisma as any).purchaseQuotation;
      if (purchaseQuotationModel && batchRequestIds.length > 0) {
        const quotationCount = await purchaseQuotationModel.count({
          where: { purchaseImportRequestId: { in: batchRequestIds } },
        });
        if (quotationCount > 0) {
          return res.status(400).json({
            error:
              "Cannot unconfirm an inquiry that already has purchase quotations.",
          });
        }
      }
    }

    const updateResult = await purchaseImportRequestModel.updateMany({
      where: { batchId: requestRow.batchId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      data: {
        batchId: requestRow.batchId,
        status,
        updatedCount: updateResult.count || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/requests/:requestId/quotation-context", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    if (!purchaseImportRequestModel) {
      return res.status(500).json({
        error:
          "Purchase import request model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({ error: "Request id is required." });
    }

    const requestRow = await purchaseImportRequestModel.findUnique({
      where: { id: requestId },
      include: {
        Supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            companyName: true,
            currencyName: true,
          },
        },
        PurchaseImportRequestItem: {
          orderBy: { createdAt: "asc" },
          include: {
            Part: {
              select: {
                id: true,
                partNo: true,
                description: true,
                MasterPart: { select: { masterPartNo: true } },
                Brand: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!requestRow) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }

    if (String(requestRow.status || "").toLowerCase() !== "confirm") {
      return res.status(400).json({
        error: "Only confirmed purchase import inquiries can create quotations.",
      });
    }
    if (!requestRow.Supplier?.id) {
      return res.status(400).json({
        error: "Please select supplier in purchase import inquiry before creating quotation.",
      });
    }

    const supplierCurrency = requestRow.Supplier?.currencyName || "USD";
    const currencyOptions = Array.from(new Set(["USD", supplierCurrency]));
    const consignee = await resolveRequestConsignee(
      purchaseImportRequestModel,
      requestRow,
    );

    const stockByPartId = new Map<string, number>(
      (requestRow.PurchaseImportRequestItem || []).map((item: any) => [
        String(item.partId),
        Number(item.currentStock || 0),
      ]),
    );

    const existingQuotation = purchaseQuotationModel
      ? await purchaseQuotationModel.findFirst({
          where: { purchaseImportRequestId: requestId },
          orderBy: { createdAt: "desc" },
          include: {
            PurchaseQuotationItem: {
              orderBy: { createdAt: "asc" },
              include: {
                Part: {
                  select: {
                    id: true,
                    partNo: true,
                    description: true,
                    MasterPart: { select: { masterPartNo: true } },
                    Brand: { select: { name: true } },
                  },
                },
              },
            },
          },
        })
      : null;

    let quotationNo: string;
    let quotationDate: Date;
    let defaultCurrency = "USD";
    let conversionRate = 1;
    let terms: string | null = null;
    let existingQuotationId: string | null = null;
    let items: any[];

    if (existingQuotation) {
      existingQuotationId = existingQuotation.id;
      quotationNo = existingQuotation.quotationNo;
      quotationDate = existingQuotation.quotationDate;
      defaultCurrency = String(existingQuotation.currency || "USD");
      conversionRate = Number(existingQuotation.conversionRate || 1);
      terms = existingQuotation.terms || null;
      items = (existingQuotation.PurchaseQuotationItem || []).map((item: any) => ({
        partId: item.partId,
        masterPartNo: item.Part?.MasterPart?.masterPartNo || "",
        partNo: item.Part?.partNo || "",
        description: item.Part?.description || "",
        brand: item.Part?.Brand?.name || "",
        currentStock: stockByPartId.get(String(item.partId)) ?? 0,
        demandQuantity: Number(item.demandQuantity || 0),
        quotationQuantity: Number(item.quotationQuantity || 0),
        shipDays: Number(item.shipDays || 0),
        fcRate: Number(item.fcRate || 0),
        revisedFcRate: Number(item.revisedFcRate || 0),
        weight: Number(item.weight || 0),
        totalWeight: Number(item.totalWeight || 0),
      }));
    } else {
      quotationNo = "";
      quotationDate = new Date();
      items = requestRow.PurchaseImportRequestItem.map((item: any) => ({
        partId: item.partId,
        masterPartNo: item.Part?.MasterPart?.masterPartNo || "",
        partNo: item.Part?.partNo || "",
        description: item.Part?.description || "",
        brand: item.Part?.Brand?.name || "",
        currentStock: Number(item.currentStock || 0),
        demandQuantity: Number(item.demandQuantity || 0),
        weight: Number(item.weight || 0),
        totalWeight: Number(item.totalWeight || 0),
        quotationQuantity: Number(item.demandQuantity || 0),
        shipDays: 0,
        fcRate: 0,
        revisedFcRate: 0,
      }));
    }

    items = await attachLastSupplierFcRates(
      requestRow.supplierId || requestRow.Supplier?.id,
      items,
      existingQuotationId,
    );

    res.json({
      data: {
        requestId: requestRow.id,
        requestNo: requestRow.requestNo,
        requestDate: requestRow.createdAt,
        consignee,
        quotationNo,
        quotationDate,
        existingQuotationId,
        currency: defaultCurrency,
        conversionRate,
        terms,
        supplier: {
          id: requestRow.Supplier?.id,
          code: requestRow.Supplier?.code,
          name: requestRow.Supplier?.companyName || requestRow.Supplier?.name || "-",
          currency: supplierCurrency,
        },
        currencyOptions,
        defaultCurrency,
        items,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/requests/:requestId/quotations", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    const purchaseQuotationItemModel = (prisma as any).purchaseQuotationItem;
    if (!purchaseImportRequestModel || !purchaseQuotationModel || !purchaseQuotationItemModel) {
      return res.status(500).json({
        error:
          "Purchase quotation models are unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({ error: "Request id is required." });
    }

    const requestRow = await purchaseImportRequestModel.findUnique({
      where: { id: requestId },
      select: { id: true, supplierId: true, status: true },
    });
    if (!requestRow) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }
    if (String(requestRow.status || "").toLowerCase() !== "confirm") {
      return res.status(400).json({
        error: "Only confirmed purchase import inquiries can create quotations.",
      });
    }
    if (!requestRow.supplierId) {
      return res.status(400).json({
        error: "Please select supplier in purchase import inquiry before creating quotation.",
      });
    }

    const existingForRequest = await purchaseQuotationModel.findFirst({
      where: { purchaseImportRequestId: requestId },
      select: { id: true, quotationNo: true },
    });
    if (existingForRequest) {
      return res.status(409).json({
        error: `Quotation ${existingForRequest.quotationNo} already exists for this inquiry. Open it to view or update saved details.`,
      });
    }

    const quotationDate = parseDateOrNow(req.body?.quotationDate);
    const quotationNo = normalizeQuotationNo(req.body?.quotationNo);
    if (!quotationNo) {
      return res.status(400).json({ error: "Quotation number is required." });
    }
    const duplicateQuotationNo = await findDuplicateQuotationNo(
      purchaseQuotationModel,
      quotationNo,
    );
    if (duplicateQuotationNo) {
      return res.status(409).json({
        error: `Quotation number "${quotationNo}" is already in use.`,
      });
    }
    const revisedQuotationDate = req.body?.revisedQuotationDate
      ? parseDateOrNow(req.body.revisedQuotationDate)
      : null;
    const conversionRate = Number(req.body?.conversionRate || 1);
    const currency = String(req.body?.currency || "USD").trim().toUpperCase() || "USD";
    const quotationType =
      String(req.body?.quotationType || "original").trim().toLowerCase() === "revised"
        ? "revised"
        : "original";
    const status = String(req.body?.status || "pending").trim().toLowerCase() || "pending";
    const termsRaw = req.body?.terms;
    if (termsRaw != null && String(termsRaw).trim() && !normalizePurchaseQuotationTerms(termsRaw)) {
      return res.status(400).json({
        error: `Invalid terms. Allowed values: ${PURCHASE_QUOTATION_TERMS.join(", ")}.`,
      });
    }
    const terms = normalizePurchaseQuotationTerms(termsRaw);
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

    const items = itemsRaw
      .map((item: any) => {
        const quotationQuantity = Number(item?.quotationQuantity || 0);
        const fcRate = Number(item?.fcRate || 0);
        const lcRate = fcRate * conversionRate;
        const demandQuantity = Number(item?.demandQuantity || 0);
        const shipDays = Number(item?.shipDays || 0);
        const weight = Number(item?.weight || 0);
        return {
          partId: String(item?.partId || "").trim(),
          demandQuantity,
          quotationQuantity,
          shipDays,
          fcRate,
          fcAmount: fcRate * quotationQuantity,
          lcRate,
          lcAmount: lcRate * quotationQuantity,
          revisedFcRate: Number(item?.revisedFcRate || 0),
          revisedFcAmount: Number(item?.revisedFcAmount || 0),
          revisedLcRate: Number(item?.revisedLcRate || 0),
          revisedLcAmount: Number(item?.revisedLcAmount || 0),
          weight,
          totalWeight: weight * quotationQuantity,
        };
      })
      .filter((item: any) => item.partId);

    if (items.length === 0) {
      return res.status(400).json({ error: "Please add at least one quotation item." });
    }

    const partIds: string[] = Array.from(
      new Set(items.map((item: any) => String(item.partId))),
    );
    const validPartsCount = await prisma.part.count({ where: { id: { in: partIds } } });
    if (validPartsCount !== partIds.length) {
      return res.status(400).json({ error: "One or more items are invalid." });
    }

    const fcTotal = items.reduce((sum: number, item: any) => sum + Number(item.fcAmount || 0), 0);
    const lcTotal = items.reduce((sum: number, item: any) => sum + Number(item.lcAmount || 0), 0);
    const fcRevisedTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.revisedFcAmount || 0),
      0,
    );
    const lcRevisedTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.revisedLcAmount || 0),
      0,
    );

    const created = await prisma.$transaction(async (tx) => {
      const quotationId = randomUUID();
      await (tx as any).purchaseQuotation.create({
        data: {
          id: quotationId,
          quotationNo,
          purchaseImportRequestId: requestRow.id,
          supplierId: requestRow.supplierId,
          currency,
          conversionRate: Number.isFinite(conversionRate) && conversionRate > 0 ? conversionRate : 1,
          fcTotal,
          lcTotal,
          fcRevisedTotal,
          lcRevisedTotal,
          quotationDate,
          revisedQuotationDate,
          quotationType,
          terms,
          status,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await (tx as any).purchaseQuotationItem.createMany({
        data: items.map((item: any) => ({
          id: randomUUID(),
          purchaseQuotationId: quotationId,
          partId: item.partId,
          demandQuantity: item.demandQuantity,
          quotationQuantity: item.quotationQuantity,
          shipDays: item.shipDays,
          fcRate: item.fcRate,
          fcAmount: item.fcAmount,
          lcRate: item.lcRate,
          lcAmount: item.lcAmount,
          revisedFcRate: item.revisedFcRate,
          revisedFcAmount: item.revisedFcAmount,
          revisedLcRate: item.revisedLcRate,
          revisedLcAmount: item.revisedLcAmount,
          weight: item.weight,
          totalWeight: item.totalWeight,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      return { quotationId, quotationNo };
    });

    res.status(201).json({
      data: {
        id: created.quotationId,
        quotationNo: created.quotationNo,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/quotations", async (req: Request, res: Response) => {
  try {
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    if (!purchaseQuotationModel) {
      return res.status(500).json({
        error:
          "Purchase quotation model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(
      1,
      Math.min(1000, parseInt(String(req.query.limit || "50"), 10) || 50),
    );
    const skip = (page - 1) * limit;
    const statusFilter = String(req.query.status || "")
      .trim()
      .toLowerCase();
    const where =
      statusFilter === "confirm"
        ? { status: "confirm" }
        : statusFilter === "open"
          ? { status: { not: "confirm" } }
          : undefined;

    const [rows, total] = await Promise.all([
      purchaseQuotationModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          Supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              companyName: true,
            },
          },
          PurchaseImportRequest: {
            select: {
              id: true,
              requestNo: true,
            },
          },
          PurchaseQuotationItem: {
            select: {
              id: true,
              demandQuantity: true,
              quotationQuantity: true,
              totalWeight: true,
            },
          },
          PurchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              status: true,
              consignee: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      purchaseQuotationModel.count({ where }),
    ]);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/quotations/:quotationId", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    if (!purchaseQuotationModel) {
      return res.status(500).json({
        error:
          "Purchase quotation model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const quotationId = String(req.params.quotationId || "").trim();
    if (!quotationId) {
      return res.status(400).json({ error: "Quotation id is required." });
    }

    const row = await purchaseQuotationModel.findUnique({
      where: { id: quotationId },
      include: {
        Supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            companyName: true,
            currencyName: true,
          },
        },
        PurchaseImportRequest: {
          select: {
            id: true,
            requestNo: true,
            createdAt: true,
            consignee: true,
            batchId: true,
            PurchaseImportRequestItem: {
              select: {
                partId: true,
                currentStock: true,
                khiQuantity: true,
                isbQuantity: true,
                otherQuantity: true,
              },
            },
          },
        },
        PurchaseQuotationItem: {
          orderBy: { createdAt: "asc" },
          include: {
            Part: {
              select: {
                id: true,
                partNo: true,
                description: true,
                MasterPart: { select: { masterPartNo: true } },
                Brand: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!row) {
      return res.status(404).json({ error: "Purchase quotation not found." });
    }

    const requestConsignee = row.PurchaseImportRequest
      ? await resolveRequestConsignee(purchaseImportRequestModel, {
          batchId: row.PurchaseImportRequest.batchId,
          consignee: row.PurchaseImportRequest.consignee,
        })
      : null;

    res.json({
      data: {
        id: row.id,
        quotationNo: row.quotationNo,
        quotationDate: row.quotationDate,
        revisedQuotationDate: row.revisedQuotationDate,
        confirmationDate: row.confirmationDate,
        quotationType: row.quotationType,
        terms: row.terms || null,
        status: row.status,
        currency: row.currency,
        conversionRate: Number(row.conversionRate || 1),
        request: {
          id: row.PurchaseImportRequest?.id,
          requestNo: row.PurchaseImportRequest?.requestNo,
          requestDate: row.PurchaseImportRequest?.createdAt,
          consignee: requestConsignee,
        },
        supplier: {
          id: row.Supplier?.id,
          code: row.Supplier?.code,
          name: row.Supplier?.companyName || row.Supplier?.name || "-",
          currency: row.Supplier?.currencyName || row.currency || "USD",
        },
        items: await attachLastSupplierFcRates(
          row.supplierId,
          (row.PurchaseQuotationItem || []).map((item: any) => {
            const split = (row.PurchaseImportRequest?.PurchaseImportRequestItem || []).find(
              (requestItem: any) => String(requestItem.partId) === String(item.partId),
            );
            return {
            partId: item.partId,
            masterPartNo: item.Part?.MasterPart?.masterPartNo || "",
            partNo: item.Part?.partNo || "",
            description: item.Part?.description || "",
            brand: item.Part?.Brand?.name || "",
            currentStock: Number(split?.currentStock || 0),
            demandQuantity: Number(item.demandQuantity || 0),
            quotationQuantity: Number(item.quotationQuantity || 0),
            khiQuantity: Number(split?.khiQuantity || 0),
            isbQuantity: Number(split?.isbQuantity || 0),
            otherQuantity: Number(split?.otherQuantity || 0),
            shipDays: Number(item.shipDays || 0),
            fcRate: Number(item.fcRate || 0),
            fcAmount: Number(item.fcAmount || 0),
            lcRate: Number(item.lcRate || 0),
            lcAmount: Number(item.lcAmount || 0),
            revisedFcRate: Number(item.revisedFcRate || 0),
            revisedFcAmount: Number(item.revisedFcAmount || 0),
            revisedLcRate: Number(item.revisedLcRate || 0),
            revisedLcAmount: Number(item.revisedLcAmount || 0),
            weight: Number(item.weight || 0),
            totalWeight: Number(item.totalWeight || 0),
          };
          }),
          row.id,
        ),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/quotations/:quotationId", async (req: Request, res: Response) => {
  try {
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    const purchaseQuotationItemModel = (prisma as any).purchaseQuotationItem;
    if (!purchaseQuotationModel || !purchaseQuotationItemModel) {
      return res.status(500).json({
        error:
          "Purchase quotation models are unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const quotationId = String(req.params.quotationId || "").trim();
    if (!quotationId) {
      return res.status(400).json({ error: "Quotation id is required." });
    }

    const existing = await purchaseQuotationModel.findUnique({
      where: { id: quotationId },
      select: { id: true, quotationNo: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Purchase quotation not found." });
    }

    const quotationDate = parseDateOrNow(req.body?.quotationDate);
    const quotationNo = normalizeQuotationNo(req.body?.quotationNo);
    if (!quotationNo) {
      return res.status(400).json({ error: "Quotation number is required." });
    }
    const duplicateQuotationNo = await findDuplicateQuotationNo(
      purchaseQuotationModel,
      quotationNo,
      quotationId,
    );
    if (duplicateQuotationNo) {
      return res.status(409).json({
        error: `Quotation number "${quotationNo}" is already in use.`,
      });
    }
    const conversionRate = Number(req.body?.conversionRate || 1);
    const normalizedConversionRate =
      Number.isFinite(conversionRate) && conversionRate > 0 ? conversionRate : 1;
    const currency = String(req.body?.currency || "USD").trim().toUpperCase() || "USD";
    const termsRaw = req.body?.terms;
    if (termsRaw != null && String(termsRaw).trim() && !normalizePurchaseQuotationTerms(termsRaw)) {
      return res.status(400).json({
        error: `Invalid terms. Allowed values: ${PURCHASE_QUOTATION_TERMS.join(", ")}.`,
      });
    }
    const terms = normalizePurchaseQuotationTerms(termsRaw);
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

    const items = itemsRaw
      .map((item: any) => {
        const quotationQuantity = Number(item?.quotationQuantity || 0);
        const fcRate = Number(item?.fcRate || 0);
        const lcRate = fcRate * normalizedConversionRate;
        const demandQuantity = Number(item?.demandQuantity || 0);
        const shipDays = Number(item?.shipDays || 0);
        const weight = Number(item?.weight || 0);
        return {
          partId: String(item?.partId || "").trim(),
          demandQuantity,
          quotationQuantity,
          shipDays,
          fcRate,
          fcAmount: fcRate * quotationQuantity,
          lcRate,
          lcAmount: lcRate * quotationQuantity,
          revisedFcRate: Number(item?.revisedFcRate || 0),
          revisedFcAmount: Number(item?.revisedFcRate || 0) * quotationQuantity,
          revisedLcRate: Number(item?.revisedFcRate || 0) * normalizedConversionRate,
          revisedLcAmount:
            Number(item?.revisedFcRate || 0) * normalizedConversionRate * quotationQuantity,
          weight,
          totalWeight: weight * quotationQuantity,
        };
      })
      .filter((item: any) => item.partId);

    if (items.length === 0) {
      return res.status(400).json({ error: "Please add at least one quotation item." });
    }

    const partIds: string[] = Array.from(
      new Set(items.map((item: any) => String(item.partId))),
    );
    const validPartsCount = await prisma.part.count({ where: { id: { in: partIds } } });
    if (validPartsCount !== partIds.length) {
      return res.status(400).json({ error: "One or more items are invalid." });
    }

    const fcTotal = items.reduce((sum: number, item: any) => sum + Number(item.fcAmount || 0), 0);
    const lcTotal = items.reduce((sum: number, item: any) => sum + Number(item.lcAmount || 0), 0);
    const fcRevisedTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.revisedFcAmount || 0),
      0,
    );
    const lcRevisedTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.revisedLcAmount || 0),
      0,
    );

    await prisma.$transaction(async (tx) => {
      await (tx as any).purchaseQuotation.update({
        where: { id: quotationId },
        data: {
          quotationNo,
          quotationDate,
          currency,
          conversionRate: normalizedConversionRate,
          fcTotal,
          lcTotal,
          fcRevisedTotal,
          lcRevisedTotal,
          terms,
          updatedAt: new Date(),
        },
      });

      await (tx as any).purchaseQuotationItem.deleteMany({
        where: { purchaseQuotationId: quotationId },
      });

      await (tx as any).purchaseQuotationItem.createMany({
        data: items.map((item: any) => ({
          id: randomUUID(),
          purchaseQuotationId: quotationId,
          partId: item.partId,
          demandQuantity: item.demandQuantity,
          quotationQuantity: item.quotationQuantity,
          shipDays: item.shipDays,
          fcRate: item.fcRate,
          fcAmount: item.fcAmount,
          lcRate: item.lcRate,
          lcAmount: item.lcAmount,
          revisedFcRate: item.revisedFcRate,
          revisedFcAmount: item.revisedFcAmount,
          revisedLcRate: item.revisedLcRate,
          revisedLcAmount: item.revisedLcAmount,
          weight: item.weight,
          totalWeight: item.totalWeight,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });
    });

    res.json({
      data: {
        id: quotationId,
        quotationNo,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/quotations/:quotationId/revise", async (req: Request, res: Response) => {
  try {
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    const purchaseQuotationItemModel = (prisma as any).purchaseQuotationItem;
    if (!purchaseQuotationModel || !purchaseQuotationItemModel) {
      return res.status(500).json({
        error:
          "Purchase quotation models are unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const quotationId = String(req.params.quotationId || "").trim();
    if (!quotationId) {
      return res.status(400).json({ error: "Quotation id is required." });
    }

    const existing = await purchaseQuotationModel.findUnique({
      where: { id: quotationId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Purchase quotation not found." });
    }

    const quotationDate = parseDateOrNow(req.body?.quotationDate);
    const revisedQuotationDate = parseDateOrNow(req.body?.revisedQuotationDate);
    const conversionRate = Number(req.body?.conversionRate || 1);
    const normalizedConversionRate =
      Number.isFinite(conversionRate) && conversionRate > 0 ? conversionRate : 1;
    const currency = String(req.body?.currency || "USD").trim().toUpperCase() || "USD";
    const status = normalizeQuotationStatus(req.body?.status || "revise");
    const termsRaw = req.body?.terms;
    if (termsRaw != null && String(termsRaw).trim() && !normalizePurchaseQuotationTerms(termsRaw)) {
      return res.status(400).json({
        error: `Invalid terms. Allowed values: ${PURCHASE_QUOTATION_TERMS.join(", ")}.`,
      });
    }
    const terms =
      termsRaw !== undefined
        ? normalizePurchaseQuotationTerms(termsRaw)
        : undefined;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

    const items = itemsRaw
      .map((item: any) => {
        const quotationQuantity = Number(item?.quotationQuantity || 0);
        const fcRate = Number(item?.fcRate || 0);
        const revisedFcRate = Number(item?.revisedFcRate || 0);
        const demandQuantity = Number(item?.demandQuantity || 0);
        const shipDays = Number(item?.shipDays || 0);
        const weight = Number(item?.weight || 0);
        const lcRate = fcRate * normalizedConversionRate;
        const revisedLcRate = revisedFcRate * normalizedConversionRate;

        return {
          partId: String(item?.partId || "").trim(),
          demandQuantity,
          quotationQuantity,
          shipDays,
          fcRate,
          fcAmount: fcRate * quotationQuantity,
          lcRate,
          lcAmount: lcRate * quotationQuantity,
          revisedFcRate,
          revisedFcAmount: revisedFcRate * quotationQuantity,
          revisedLcRate,
          revisedLcAmount: revisedLcRate * quotationQuantity,
          weight,
          totalWeight: weight * quotationQuantity,
        };
      })
      .filter((item: any) => item.partId);

    if (items.length === 0) {
      return res.status(400).json({ error: "Please add at least one quotation item." });
    }

    const partIds: string[] = Array.from(
      new Set(items.map((item: any) => String(item.partId))),
    );
    const validPartsCount = await prisma.part.count({ where: { id: { in: partIds } } });
    if (validPartsCount !== partIds.length) {
      return res.status(400).json({ error: "One or more items are invalid." });
    }

    const fcTotal = items.reduce((sum: number, item: any) => sum + Number(item.fcAmount || 0), 0);
    const lcTotal = items.reduce((sum: number, item: any) => sum + Number(item.lcAmount || 0), 0);
    const fcRevisedTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.revisedFcAmount || 0),
      0,
    );
    const lcRevisedTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.revisedLcAmount || 0),
      0,
    );

    const updated = await prisma.$transaction(async (tx) => {
      await (tx as any).purchaseQuotation.update({
        where: { id: quotationId },
        data: {
          quotationDate,
          revisedQuotationDate,
          quotationType: "revised",
          status,
          currency,
          conversionRate: normalizedConversionRate,
          fcTotal,
          lcTotal,
          fcRevisedTotal,
          lcRevisedTotal,
          ...(terms !== undefined ? { terms } : {}),
          updatedAt: new Date(),
        },
      });

      await (tx as any).purchaseQuotationItem.deleteMany({
        where: { purchaseQuotationId: quotationId },
      });

      await (tx as any).purchaseQuotationItem.createMany({
        data: items.map((item: any) => ({
          id: randomUUID(),
          purchaseQuotationId: quotationId,
          partId: item.partId,
          demandQuantity: item.demandQuantity,
          quotationQuantity: item.quotationQuantity,
          shipDays: item.shipDays,
          fcRate: item.fcRate,
          fcAmount: item.fcAmount,
          lcRate: item.lcRate,
          lcAmount: item.lcAmount,
          revisedFcRate: item.revisedFcRate,
          revisedFcAmount: item.revisedFcAmount,
          revisedLcRate: item.revisedLcRate,
          revisedLcAmount: item.revisedLcAmount,
          weight: item.weight,
          totalWeight: item.totalWeight,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      return (tx as any).purchaseQuotation.findUnique({
        where: { id: quotationId },
        select: {
          id: true,
          quotationNo: true,
          status: true,
          quotationType: true,
          revisedQuotationDate: true,
        },
      });
    });

    res.json({ data: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/quotations/:quotationId/status", async (req: Request, res: Response) => {
  try {
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    if (!purchaseQuotationModel) {
      return res.status(500).json({
        error:
          "Purchase quotation model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const quotationId = String(req.params.quotationId || "").trim();
    if (!quotationId) {
      return res.status(400).json({ error: "Quotation id is required." });
    }

    const status = normalizeQuotationStatus(req.body?.status);

    const existing = await purchaseQuotationModel.findUnique({
      where: { id: quotationId },
      select: { id: true, quotationType: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Purchase quotation not found." });
    }

    const updatePayload: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };

    if (status === "revise") {
      updatePayload.quotationType = "revised";
      updatePayload.revisedQuotationDate = new Date();
    }

    if (status === "confirm") {
      return res.status(400).json({
        error:
          "Use the quotation confirmation form to confirm and create purchase orders.",
      });
    }

    const updated = await purchaseQuotationModel.update({
      where: { id: quotationId },
      data: updatePayload,
      select: {
        id: true,
        quotationNo: true,
        status: true,
        quotationType: true,
        revisedQuotationDate: true,
      },
    });

    res.json({ data: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/quotations/:quotationId/confirm", async (req: Request, res: Response) => {
  try {
    const quotationId = String(req.params.quotationId || "").trim();
    if (!quotationId) {
      return res.status(400).json({ error: "Quotation id is required." });
    }

    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = itemsRaw
      .map((item: any) => ({
        partId: String(item?.partId || "").trim(),
        confirmQuantity: Math.max(0, Math.floor(Number(item?.confirmQuantity || 0))),
        khiQuantity:
          item?.khiQuantity !== undefined
            ? Math.max(0, Math.floor(Number(item.khiQuantity)))
            : undefined,
        isbQuantity:
          item?.isbQuantity !== undefined
            ? Math.max(0, Math.floor(Number(item.isbQuantity)))
            : undefined,
        otherQuantity:
          item?.otherQuantity !== undefined
            ? Math.max(0, Math.floor(Number(item.otherQuantity)))
            : undefined,
      }))
      .filter((item: { partId: string }) => item.partId);

    const result = await confirmPurchaseQuotation(quotationId, {
      confirmationDate: req.body?.confirmationDate,
      items,
    });

    res.json(result);
  } catch (error: any) {
    const message = error?.message || "Failed to confirm quotation.";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.post("/quotations/:quotationId/convert-to-po", async (req: Request, res: Response) => {
  try {
    const quotationId = String(req.params.quotationId || "").trim();
    if (!quotationId) {
      return res.status(400).json({ error: "Quotation id is required." });
    }

    const result = await confirmPurchaseQuotation(quotationId, {
      confirmationDate: new Date(),
      items: null,
    });
    const purchaseOrder = result.purchaseOrders[0];
    if (!purchaseOrder) {
      return res.status(400).json({ error: "No purchase order was created." });
    }
    res.status(201).json({ data: purchaseOrder, purchaseOrders: result.purchaseOrders });
  } catch (error: any) {
    const message = error?.message || "Failed to create purchase order.";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

type ReceivePurchaseOrderItemInput = {
  id: string;
  receiveQty: number;
  fcRate?: number;
};

type ImportPurchaseOrderExpenses = {
  pkgExpPercent: number;
  invDiscPercent: number;
  frtExp: number;
  discAmt: number;
  customsDuty: number;
  additionalCustomsDuty: number;
  regulatoryDuty: number;
  salesTax: number;
  additionalSalesTax: number;
  incomeTax: number;
  ed: number;
  doAmount: number;
  miscExp: number;
  locFrt: number;
  crnExp: number;
  totalExp: number;
};

const IMPORT_PO_EXPENSE_AMOUNT_KEYS: Array<
  keyof Omit<ImportPurchaseOrderExpenses, "pkgExpPercent" | "invDiscPercent" | "frtExp" | "discAmt" | "totalExp">
> = [
  "customsDuty",
  "additionalCustomsDuty",
  "regulatoryDuty",
  "salesTax",
  "additionalSalesTax",
  "incomeTax",
  "ed",
  "doAmount",
  "miscExp",
  "locFrt",
  "crnExp",
];

function normalizeExpenseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function computeImportPoCommercialAmounts(
  expenses: Pick<ImportPurchaseOrderExpenses, "pkgExpPercent" | "invDiscPercent" | "frtExp">,
  invoiceLcAmount: number,
  conversionRate: number,
) {
  const invoiceLc = Math.max(0, Number(invoiceLcAmount) || 0);
  const rate = Math.max(0, Number(conversionRate) || 0);
  const pkgExpPercent = normalizeExpenseNumber(expenses.pkgExpPercent);
  const invDiscPercent = normalizeExpenseNumber(expenses.invDiscPercent);
  const frtExp = normalizeExpenseNumber(expenses.frtExp);
  return {
    pkgExpAmt: (invoiceLc * pkgExpPercent) / 100,
    invDiscAmt: (invoiceLc * invDiscPercent) / 100,
    frtExpLc: frtExp * rate,
  };
}

function computeImportPoTotalExp(
  expenses: Omit<ImportPurchaseOrderExpenses, "totalExp">,
  invoiceLcAmount = 0,
  conversionRate = 1,
) {
  const commercial = computeImportPoCommercialAmounts(
    expenses,
    invoiceLcAmount,
    conversionRate,
  );
  const clearingLocalTotal = IMPORT_PO_EXPENSE_AMOUNT_KEYS.reduce(
    (sum, key) => sum + normalizeExpenseNumber(expenses[key]),
    0,
  );
  return commercial.pkgExpAmt + commercial.frtExpLc + clearingLocalTotal;
}

function readImportPoExpensesFromOrder(order: any): ImportPurchaseOrderExpenses {
  const base = {
    pkgExpPercent: normalizeExpenseNumber(order?.pkgExpPercent),
    invDiscPercent: normalizeExpenseNumber(order?.invDiscPercent),
    frtExp: normalizeExpenseNumber(order?.frtExp),
    discAmt: 0,
    customsDuty: normalizeExpenseNumber(order?.customsDuty),
    additionalCustomsDuty: normalizeExpenseNumber(order?.additionalCustomsDuty),
    regulatoryDuty: normalizeExpenseNumber(order?.regulatoryDuty),
    salesTax: normalizeExpenseNumber(order?.salesTax),
    additionalSalesTax: normalizeExpenseNumber(order?.additionalSalesTax),
    incomeTax: normalizeExpenseNumber(order?.incomeTax),
    ed: normalizeExpenseNumber(order?.ed),
    doAmount: normalizeExpenseNumber(order?.doAmount),
    miscExp: normalizeExpenseNumber(order?.miscExp),
    locFrt: normalizeExpenseNumber(order?.locFrt),
    crnExp: normalizeExpenseNumber(order?.crnExp),
  };
  const invoiceLc = normalizeExpenseNumber(order?.totalAmount);
  const conversionRate =
    normalizeExpenseNumber(order?.conversionRate) > 0
      ? normalizeExpenseNumber(order?.conversionRate)
      : 1;
  const commercial = computeImportPoCommercialAmounts(base, invoiceLc, conversionRate);
  const storedTotal = normalizeExpenseNumber(order?.totalExp);
  return {
    ...base,
    discAmt: commercial.invDiscAmt,
    totalExp:
      storedTotal > 0
        ? storedTotal
        : computeImportPoTotalExp(base, invoiceLc, conversionRate),
  };
}

function parseImportPoExpensesFromBody(
  body: any,
  invoiceLcAmount = 0,
  conversionRate = 1,
): ImportPurchaseOrderExpenses {
  const source = body?.expenses && typeof body.expenses === "object" ? body.expenses : body;
  const base = {
    pkgExpPercent: normalizeExpenseNumber(source?.pkgExpPercent),
    invDiscPercent: normalizeExpenseNumber(source?.invDiscPercent),
    frtExp: normalizeExpenseNumber(source?.frtExp),
    discAmt: 0,
    customsDuty: normalizeExpenseNumber(source?.customsDuty),
    additionalCustomsDuty: normalizeExpenseNumber(source?.additionalCustomsDuty),
    regulatoryDuty: normalizeExpenseNumber(source?.regulatoryDuty),
    salesTax: normalizeExpenseNumber(source?.salesTax),
    additionalSalesTax: normalizeExpenseNumber(source?.additionalSalesTax),
    incomeTax: normalizeExpenseNumber(source?.incomeTax),
    ed: normalizeExpenseNumber(source?.ed),
    doAmount: normalizeExpenseNumber(source?.doAmount),
    miscExp: normalizeExpenseNumber(source?.miscExp),
    locFrt: normalizeExpenseNumber(source?.locFrt),
    crnExp: normalizeExpenseNumber(source?.crnExp),
  };
  const commercial = computeImportPoCommercialAmounts(
    base,
    invoiceLcAmount,
    conversionRate,
  );
  return {
    ...base,
    discAmt: commercial.invDiscAmt,
    totalExp: computeImportPoTotalExp(base, invoiceLcAmount, conversionRate),
  };
}

function computeReceiveVariance(orderQty: number, receiveQty: number) {
  const normalizedReceive = Math.max(0, Math.floor(Number(receiveQty) || 0));
  const normalizedOrder = Math.max(0, Math.floor(Number(orderQty) || 0));
  return {
    receiveQty: normalizedReceive,
    additionalQty:
      normalizedReceive > normalizedOrder
        ? normalizedReceive - normalizedOrder
        : 0,
    backQty:
      normalizedReceive < normalizedOrder
        ? normalizedOrder - normalizedReceive
        : 0,
  };
}

router.get("/parts/expected-arrivals", async (req: Request, res: Response) => {
  try {
    const rawPartIds = String(req.query.partIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const partIds = Array.from(new Set(rawPartIds));
    if (partIds.length === 0) {
      return res.json({ data: {} });
    }

    const rows = await prisma.purchaseOrderItem.findMany({
      where: {
        partId: { in: partIds },
        PurchaseOrder: {
          purchaseQuotationId: { not: null },
          expectedDate: { not: null },
          status: { notIn: ["Received", "received"] },
        },
      },
      select: {
        partId: true,
        PurchaseOrder: {
          select: {
            poNumber: true,
            expectedDate: true,
            forwarder: true,
            status: true,
          },
        },
      },
    });

    const data: Record<
      string,
      { estTimeDate: string; forwarder: string | null; poNumber: string }
    > = {};

    const sorted = [...rows].sort((a, b) => {
      const aTime = new Date(a.PurchaseOrder?.expectedDate || 0).getTime();
      const bTime = new Date(b.PurchaseOrder?.expectedDate || 0).getTime();
      return aTime - bTime;
    });

    for (const row of sorted) {
      const partId = String(row.partId || "").trim();
      const estTimeDate = row.PurchaseOrder?.expectedDate;
      if (!partId || !estTimeDate || data[partId]) continue;
      data[partId] = {
        estTimeDate: estTimeDate.toISOString(),
        forwarder: (row.PurchaseOrder as any)?.forwarder || null,
        poNumber: row.PurchaseOrder?.poNumber || "",
      };
    }

    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Purchase order id is required." });
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        Supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            companyName: true,
          },
        },
        PurchaseOrderItem: {
          orderBy: { createdAt: "asc" },
          include: {
            Part: {
              select: {
                id: true,
                partNo: true,
                description: true,
                MasterPart: { select: { masterPartNo: true } },
                Brand: { select: { name: true } },
              },
            },
          },
        },
        PurchaseQuotation: {
          include: {
            PurchaseImportRequest: {
              select: {
                id: true,
                requestNo: true,
                PurchaseImportRequestItem: {
                  select: {
                    partId: true,
                    currentStock: true,
                  },
                },
              },
            },
            PurchaseQuotationItem: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    if (!order.purchaseQuotationId || !order.PurchaseQuotation) {
      return res.status(400).json({
        error: "Only import purchase orders are available in purchase import",
      });
    }

    const quotation = order.PurchaseQuotation;
    const isRevised = isQuotationRevisedRecord(quotation);
    const quotationItemByPartId = new Map(
      (quotation.PurchaseQuotationItem || []).map((item) => [
        String(item.partId),
        item,
      ]),
    );
    const requestItemByPartId = new Map(
      (quotation.PurchaseImportRequest?.PurchaseImportRequestItem || []).map(
        (item) => [String(item.partId), item],
      ),
    );

    const savedOrderConversionRate = Number((order as any).conversionRate);
    const quotationConversionRate = Number(quotation.conversionRate || 0);
    // A fresh PO carries the default conversionRate of 1, so fall back to the
    // quotation's rate unless a meaningful (non-default) rate was already saved.
    const orderConversionRate =
      savedOrderConversionRate > 0 && savedOrderConversionRate !== 1
        ? savedOrderConversionRate
        : quotationConversionRate > 0
          ? quotationConversionRate
          : savedOrderConversionRate > 0
            ? savedOrderConversionRate
            : 1;
    const isReceived = String(order.status || "").trim().toLowerCase() === "received";

    const baseItems = order.PurchaseOrderItem.map((poItem) => {
      const partId = String(poItem.partId);
      const quotationItem = quotationItemByPartId.get(partId);
      const requestItem = requestItemByPartId.get(partId);
      const orderQty = Number(poItem.quantity) || 0;
      const savedFcRate = Number((poItem as any).fcRate || 0);
      const useSavedAmounts = isReceived || savedFcRate > 0;

      if (useSavedAmounts) {
        const receiveQty = Number(poItem.receivedQty) || orderQty;
        return {
          id: poItem.id,
          partId,
          masterPartNo: poItem.Part?.MasterPart?.masterPartNo || "",
          partNo: poItem.Part?.partNo || "",
          description: poItem.Part?.description || "",
          brand: poItem.Part?.Brand?.name || "",
          currentStock: Number(requestItem?.currentStock || 0),
          demandQuantity: Number(quotationItem?.demandQuantity || 0),
          quotationQuantity: Number(quotationItem?.quotationQuantity || 0),
          shipDays: Number(quotationItem?.shipDays || 0),
          fcRate: savedFcRate,
          fcAmount: Number((poItem as any).fcAmount || 0),
          lcRate: Number(poItem.unitCost) || 0,
          lcAmount: Number(poItem.totalCost) || 0,
          weight: Number((poItem as any).weight || 0),
          totalWeight: Number((poItem as any).totalWeight || 0),
          orderQty,
          unitCost: Number(poItem.unitCost) || 0,
          receivedQty: receiveQty,
          additionalQty: Number((poItem as any).additionalQty) || 0,
          backQty: Number((poItem as any).backQty) || 0,
        };
      }

      const effective = quotationItem
        ? getEffectiveQuotationItemValues(quotationItem, isRevised)
        : {
            fcRate: 0,
            fcAmount: 0,
            lcRate: Number(poItem.unitCost) || 0,
            lcAmount: Number(poItem.totalCost) || 0,
          };
      const quotationQty = Number(quotationItem?.quotationQuantity || 0);
      const poUnitCost = Number(poItem.unitCost) || 0;
      let fcRate = Number(effective.fcRate || 0);
      let lcRate = Number(effective.lcRate || 0);

      if (fcRate <= 0 && quotationQty > 0 && Number(effective.fcAmount || 0) > 0) {
        fcRate = Number(effective.fcAmount) / quotationQty;
      }
      if (lcRate <= 0 && quotationQty > 0 && Number(effective.lcAmount || 0) > 0) {
        lcRate = Number(effective.lcAmount) / quotationQty;
      }
      if (fcRate <= 0 && poUnitCost > 0 && orderConversionRate > 0) {
        lcRate = poUnitCost;
        fcRate = poUnitCost / orderConversionRate;
      } else if (lcRate <= 0 && fcRate > 0) {
        lcRate = fcRate * orderConversionRate;
      } else if (fcRate <= 0 && lcRate > 0 && orderConversionRate > 0) {
        fcRate = lcRate / orderConversionRate;
      }

      const weight = Number(quotationItem?.weight || 0);
      return {
        id: poItem.id,
        partId,
        masterPartNo: poItem.Part?.MasterPart?.masterPartNo || "",
        partNo: poItem.Part?.partNo || "",
        description: poItem.Part?.description || "",
        brand: poItem.Part?.Brand?.name || "",
        currentStock: Number(requestItem?.currentStock || 0),
        demandQuantity: Number(quotationItem?.demandQuantity || 0),
        quotationQuantity: Number(quotationItem?.quotationQuantity || 0),
        shipDays: Number(quotationItem?.shipDays || 0),
        fcRate,
        fcAmount: fcRate * orderQty,
        lcRate,
        lcAmount: lcRate * orderQty,
        weight,
        totalWeight: weight * orderQty,
        orderQty,
        unitCost: Number(poItem.unitCost) || 0,
        receivedQty: Number(poItem.receivedQty) || 0,
        additionalQty: Number((poItem as any).additionalQty) || 0,
        backQty: Number((poItem as any).backQty) || 0,
      };
    });

    const items = await attachLastSupplierFcRates(
      order.supplierId || "",
      baseItems,
      quotation.id,
    );

    const computedFcTotal = items.reduce(
      (sum, item) => sum + Number(item.fcAmount || 0),
      0,
    );

    res.json({
      data: {
        id: order.id,
        poNumber: order.poNumber,
        status: order.status,
        date: order.date,
        consignee: (order as any).consignee ?? null,
        invoiceNo: (order as any).invoiceNo ?? null,
        invoiceDate: (order as any).invoiceDate ?? null,
        blNo: (order as any).blNo ?? null,
        blDate: (order as any).blDate ?? null,
        forwarder: (order as any).forwarder ?? null,
        estTimeDate: (order as any).expectedDate ?? null,
        totalAmount: order.totalAmount,
        fcTotal:
          Number((order as any).fcTotal || 0) > 0
            ? Number((order as any).fcTotal)
            : computedFcTotal,
        currency: (order as any).currency || quotation.currency,
        conversionRate: orderConversionRate,
        supplier: {
          id: order.Supplier?.id || null,
          name:
            order.Supplier?.companyName ||
            order.Supplier?.name ||
            order.Supplier?.code ||
            "-",
        },
        quotation: {
          id: quotation.id,
          quotationNo: quotation.quotationNo,
          currency: quotation.currency,
          conversionRate: Number(quotation.conversionRate || 1),
          terms: quotation.terms || null,
          quotationType: quotation.quotationType,
          isRevised,
          requestNo: quotation.PurchaseImportRequest?.requestNo || null,
        },
        expenses: readImportPoExpensesFromOrder(order),
        items,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/purchase-orders/:id/receive", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const invoiceNo = String(req.body?.invoiceNo ?? "").trim() || null;
    const blNo = String(req.body?.blNo ?? "").trim() || null;
    const invoiceDate = parseOptionalDate(req.body?.invoiceDate);
    const blDate = parseOptionalDate(req.body?.blDate);
    const forwarder = String(req.body?.forwarder ?? "").trim() || null;
    const estTimeDate = parseOptionalDate(
      req.body?.estTimeDate ?? req.body?.expectedDate,
    );
    const conversionRate = Number(req.body?.conversionRate);

    if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
      return res.status(400).json({ error: "Valid conversion rate is required" });
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        PurchaseOrderItem: true,
        PurchaseQuotation: {
          include: {
            PurchaseQuotationItem: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    if (!order.purchaseQuotationId || !order.PurchaseQuotation) {
      return res.status(400).json({
        error: "Only import purchase orders can be received from this screen",
      });
    }

    const quotation = order.PurchaseQuotation;
    const isRevised = isQuotationRevisedRecord(quotation);
    const quotationItemByPartId = new Map(
      (quotation.PurchaseQuotationItem || []).map((item) => [
        String(item.partId),
        item,
      ]),
    );

    const receiveByItemId = new Map<string, { receiveQty: number; fcRate?: number }>();
    for (const row of itemsRaw as ReceivePurchaseOrderItemInput[]) {
      const itemId = String(row?.id || "").trim();
      if (!itemId) continue;
      receiveByItemId.set(itemId, {
        receiveQty: Number(row.receiveQty) || 0,
        fcRate:
          row.fcRate !== undefined && Number.isFinite(Number(row.fcRate))
            ? Number(row.fcRate)
            : undefined,
      });
    }

    if (receiveByItemId.size === 0) {
      return res.status(400).json({ error: "At least one item receive quantity is required" });
    }

    const missingItems = order.PurchaseOrderItem.filter(
      (item) => !receiveByItemId.has(item.id),
    );
    if (missingItems.length > 0) {
      return res.status(400).json({
        error: "Receive quantity is required for every purchase order line",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let totalLc = 0;
      let totalFc = 0;

      for (const poItem of order.PurchaseOrderItem) {
        const receiveRow = receiveByItemId.get(poItem.id);
        const variance = computeReceiveVariance(
          poItem.quantity,
          receiveRow?.receiveQty ?? 0,
        );
        const quotationItem = quotationItemByPartId.get(String(poItem.partId));
        const effective = quotationItem
          ? getEffectiveQuotationItemValues(quotationItem, isRevised)
          : { fcRate: 0 };
        const quotationFcRate = Number(effective.fcRate || 0);
        const fcRate =
          receiveRow?.fcRate !== undefined
            ? Math.max(0, Number(receiveRow.fcRate) || 0)
            : quotationFcRate;
        const weight = Number(quotationItem?.weight || 0);
        const lineUnitCost = fcRate * conversionRate;
        const receiveQty = variance.receiveQty;
        const fcAmount = fcRate * receiveQty;
        const lineTotalCost = lineUnitCost * receiveQty;
        const totalWeight = weight * receiveQty;

        totalLc += lineTotalCost;
        totalFc += fcAmount;

        await tx.$executeRaw`
          UPDATE "PurchaseOrderItem"
          SET
            "receivedQty" = ${variance.receiveQty},
            "additionalQty" = ${variance.additionalQty},
            "backQty" = ${variance.backQty},
            "fcRate" = ${fcRate},
            "fcAmount" = ${fcAmount},
            "weight" = ${weight},
            "totalWeight" = ${totalWeight},
            "unitCost" = ${lineUnitCost},
            "totalCost" = ${lineTotalCost}
          WHERE "id" = ${poItem.id}
        `;
      }

      const expenses = parseImportPoExpensesFromBody(req.body, totalLc, conversionRate);

      await tx.$executeRaw`
        UPDATE "PurchaseOrder"
        SET
          "conversionRate" = ${conversionRate},
          "fcTotal" = ${totalFc},
          "totalAmount" = ${totalLc},
          "currency" = ${quotation.currency || (order as any).currency || null},
          "invoiceNo" = ${invoiceNo},
          "invoiceDate" = ${invoiceDate},
          "blNo" = ${blNo},
          "blDate" = ${blDate},
          "forwarder" = ${forwarder},
          "expectedDate" = ${estTimeDate},
          "pkgExpPercent" = ${expenses.pkgExpPercent},
          "invDiscPercent" = ${expenses.invDiscPercent},
          "frtExp" = ${expenses.frtExp},
          "discAmt" = ${expenses.discAmt},
          "customsDuty" = ${expenses.customsDuty},
          "additionalCustomsDuty" = ${expenses.additionalCustomsDuty},
          "regulatoryDuty" = ${expenses.regulatoryDuty},
          "salesTax" = ${expenses.salesTax},
          "additionalSalesTax" = ${expenses.additionalSalesTax},
          "incomeTax" = ${expenses.incomeTax},
          "ed" = ${expenses.ed},
          "doAmount" = ${expenses.doAmount},
          "miscExp" = ${expenses.miscExp},
          "locFrt" = ${expenses.locFrt},
          "crnExp" = ${expenses.crnExp},
          "totalExp" = ${expenses.totalExp},
          "updatedAt" = ${new Date()}
        WHERE "id" = ${id}
      `;

      return tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          PurchaseOrderItem: {
            include: {
              Part: {
                select: {
                  id: true,
                  partNo: true,
                  description: true,
                },
              },
            },
          },
        },
      });
    });

    if (!updated) {
      return res.status(404).json({ error: "Purchase order not found after receive" });
    }

    res.json({
      data: {
        id: updated.id,
        poNumber: updated.poNumber,
        status: updated.status,
        conversionRate: (updated as any).conversionRate ?? conversionRate,
        fcTotal: (updated as any).fcTotal ?? 0,
        totalAmount: updated.totalAmount,
        currency: (updated as any).currency ?? null,
        invoiceNo: (updated as any).invoiceNo ?? null,
        invoiceDate: (updated as any).invoiceDate ?? null,
        blNo: (updated as any).blNo ?? null,
        blDate: (updated as any).blDate ?? null,
        forwarder: (updated as any).forwarder ?? null,
        estTimeDate: (updated as any).expectedDate ?? null,
        expenses: readImportPoExpensesFromOrder(updated),
        items: updated.PurchaseOrderItem.map((item) => ({
          id: item.id,
          part_id: item.partId,
          part_no: item.Part.partNo,
          part_description: item.Part.description,
          quantity: item.quantity,
          received_qty: item.receivedQty,
          additional_qty: (item as any).additionalQty ?? 0,
          back_qty: (item as any).backQty ?? 0,
          fc_rate: (item as any).fcRate ?? 0,
          fc_amount: (item as any).fcAmount ?? 0,
          unit_cost: item.unitCost,
          total_cost: item.totalCost,
          weight: (item as any).weight ?? 0,
          total_weight: (item as any).totalWeight ?? 0,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(
      1,
      Math.min(1000, parseInt(String(req.query.limit || "50"), 10) || 50),
    );
    const skip = (page - 1) * limit;

    const where = {
      purchaseQuotationId: { not: null },
    } as any;

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          Supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              companyName: true,
            },
          },
          PurchaseQuotation: {
            select: {
              id: true,
              quotationNo: true,
              currency: true,
              PurchaseImportRequest: {
                select: {
                  id: true,
                  requestNo: true,
                },
              },
            },
          },
          PurchaseOrderItem: {
            select: { id: true },
          },
        } as any,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    res.json({
      data: orders.map((po: any) => ({
        id: po.id,
        poNumber: po.poNumber,
        date: po.date,
        status: po.status,
        consignee: po.consignee,
        totalAmount: po.totalAmount,
        notes: po.notes,
        forwarder: po.forwarder ?? null,
        estTimeDate: po.expectedDate ?? null,
        supplier: po.Supplier
          ? {
              id: po.Supplier.id,
              code: po.Supplier.code,
              name: po.Supplier.companyName || po.Supplier.name || po.Supplier.code,
            }
          : null,
        quotation: po.PurchaseQuotation
          ? {
              id: po.PurchaseQuotation.id,
              quotationNo: po.PurchaseQuotation.quotationNo,
              currency: po.PurchaseQuotation.currency,
              requestNo: po.PurchaseQuotation.PurchaseImportRequest?.requestNo || null,
            }
          : null,
        itemsCount: po.PurchaseOrderItem.length,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/requests", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    if (!purchaseImportRequestModel) {
      return res.status(500).json({
        error:
          "Purchase import request model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(
      1,
      Math.min(1000, parseInt(String(req.query.limit || "50"), 10) || 50),
    );
    const skip = (page - 1) * limit;
    const supplierId = String(req.query.supplierId || "").trim();
    const requestNo = String(
      req.query.requestNo || req.query.inquiryNo || "",
    ).trim();
    const partReference = String(req.query.partReference || "").trim();

    const where: Record<string, unknown> = {};
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (requestNo) {
      where.requestNo = { contains: requestNo, mode: "insensitive" };
    }
    if (partReference) {
      where.partReference = { contains: partReference, mode: "insensitive" };
    }

    const [rows, total] = await Promise.all([
      purchaseImportRequestModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ requestNo: "desc" }, { createdAt: "desc" }],
        include: {
          Supplier: {
            select: { id: true, code: true, name: true, companyName: true },
          },
          PurchaseImportRequestItem: {
            include: {
              Part: {
                select: {
                  id: true,
                  partNo: true,
                  description: true,
                  MasterPart: { select: { masterPartNo: true } },
                  Brand: { select: { name: true } },
                },
              },
            },
          },
          PurchaseQuotation: {
            select: { id: true, status: true, quotationNo: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      purchaseImportRequestModel.count({ where }),
    ]);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
