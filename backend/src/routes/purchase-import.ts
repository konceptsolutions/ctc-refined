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

const formatConsigneesFromSplitItems = (
  items: Array<{
    khiQuantity?: number | null;
    isbQuantity?: number | null;
    otherQuantity?: number | null;
  }>,
  fallbackConsignee?: string | null,
): string => {
  let hasIsb = false;
  let hasKhi = false;
  let hasOther = false;

  for (const item of items) {
    if (Number(item.isbQuantity || 0) > 0) hasIsb = true;
    if (Number(item.khiQuantity || 0) > 0) hasKhi = true;
    if (Number(item.otherQuantity || 0) > 0) hasOther = true;
  }

  const parts: string[] = [];
  if (hasIsb) parts.push("ISB");
  if (hasKhi) parts.push("KHI");
  if (hasOther) parts.push("Other");
  if (parts.length > 0) return parts.join(", ");

  const fallback = String(fallbackConsignee || "")
    .trim()
    .toUpperCase();
  if (fallback === "ISB" || fallback === "KHI") return fallback;
  if (fallback === "OTHER") return "Other";
  return "-";
};

const resolveQuotationConsigneeLabel = async (
  purchaseImportRequestModel: any,
  request:
    | {
        batchId: string;
        consignee?: string | null;
        PurchaseImportRequestItem?: Array<{
          khiQuantity?: number | null;
          isbQuantity?: number | null;
          otherQuantity?: number | null;
        }>;
      }
    | null
    | undefined,
): Promise<string> => {
  if (!request?.batchId) return "-";

  const resolvedConsignee = await resolveRequestConsignee(
    purchaseImportRequestModel,
    request,
  );

  let items = request.PurchaseImportRequestItem || [];
  const hasSplitQty = items.some(
    (item) =>
      Number(item.khiQuantity || 0) > 0 ||
      Number(item.isbQuantity || 0) > 0 ||
      Number(item.otherQuantity || 0) > 0,
  );

  if (!hasSplitQty) {
    const batchRows = await purchaseImportRequestModel.findMany({
      where: { batchId: request.batchId },
      select: {
        consignee: true,
        PurchaseImportRequestItem: {
          select: {
            khiQuantity: true,
            isbQuantity: true,
            otherQuantity: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    items = batchRows.flatMap(
      (row: any) => row.PurchaseImportRequestItem || [],
    );

    const batchConsignees = [
      ...new Set(
        batchRows
          .map((row: any) => String(row.consignee || "").trim())
          .filter(Boolean),
      ),
    ];
    if (batchConsignees.length > 1) {
      return batchConsignees
        .map((value) => {
          const text = String(value);
          const normalized = text.toUpperCase();
          if (normalized === "ISB" || normalized === "KHI") return normalized;
          if (normalized === "OTHER") return "Other";
          return text;
        })
        .join(", ");
    }
  }

  return formatConsigneesFromSplitItems(items, resolvedConsignee);
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
  quotationId?: string;
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
    combineQuotationIds?: string[] | null;
  },
) {
  const purchaseQuotationModel = (prisma as any).purchaseQuotation;
  if (!purchaseQuotationModel) {
    throw new Error(
      "Purchase quotation model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
    );
  }

  const primaryId = String(quotationId || "").trim();
  if (!primaryId) {
    throw new Error("Quotation id is required.");
  }

  const combineIds = Array.from(
    new Set(
      (Array.isArray(options.combineQuotationIds) ? options.combineQuotationIds : [])
        .map((id) => String(id || "").trim())
        .filter((id) => id && id !== primaryId),
    ),
  );
  const allQuotationIds = [primaryId, ...combineIds];

  const quotations: any[] = await purchaseQuotationModel.findMany({
    where: { id: { in: allQuotationIds } },
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

  if (quotations.length !== allQuotationIds.length) {
    throw new Error("One or more purchase quotations were not found.");
  }

  const quotationById = new Map<string, any>(
    quotations.map((row: any) => [String(row.id), row]),
  );
  const primary: any = quotationById.get(primaryId);
  if (!primary) {
    throw new Error("Purchase quotation not found.");
  }

  if (primary.PurchaseOrder?.length > 0 && combineIds.length === 0) {
    return {
      quotation: {
        id: primary.id,
        quotationNo: primary.quotationNo,
        status: primary.status,
        confirmationDate: primary.confirmationDate,
      },
      purchaseOrders: primary.PurchaseOrder,
      quotations: [
        {
          id: primary.id,
          quotationNo: primary.quotationNo,
          status: primary.status,
          confirmationDate: primary.confirmationDate,
        },
      ],
    };
  }

  const supplierId = String(primary.supplierId || "").trim();
  if (!supplierId) {
    throw new Error("Primary quotation has no supplier.");
  }

  const primaryCurrency = String(primary.currency || "")
    .trim()
    .toUpperCase();

  for (const id of allQuotationIds) {
    const row: any = quotationById.get(id);
    if (!row) continue;
    if (String(row.supplierId || "").trim() !== supplierId) {
      throw new Error(
        "Only quotations from the same supplier can be combined for confirmation.",
      );
    }
    if (
      primaryCurrency &&
      String(row.currency || "").trim().toUpperCase() !== primaryCurrency
    ) {
      throw new Error(
        "Only quotations with the same currency can be combined for confirmation.",
      );
    }
    if (row.PurchaseOrder?.length > 0) {
      throw new Error(
        `Quotation ${row.quotationNo} already has purchase order(s) and cannot be combined.`,
      );
    }
    const status = String(row.status || "").trim().toLowerCase();
    if (status === "confirm" && id !== primaryId) {
      throw new Error(
        `Quotation ${row.quotationNo} is already confirmed and cannot be combined.`,
      );
    }
  }

  const confirmInputs = Array.isArray(options.items) ? options.items : [];
  const confirmByQuotationPart = new Map<string, ConfirmQuotationItemInput>();
  for (const item of confirmInputs) {
    const partId = String(item?.partId || "").trim();
    if (!partId) continue;
    const itemQuotationId =
      String(item?.quotationId || primaryId).trim() || primaryId;
    if (!allQuotationIds.includes(itemQuotationId)) continue;
    confirmByQuotationPart.set(`${itemQuotationId}::${partId}`, {
      quotationId: itemQuotationId,
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

  const laneItems: Record<
    PoLaneKey,
    Array<{ partId: string; quantity: number; unitCost: number; totalCost: number }>
  > = {
    khi: [],
    isb: [],
    other: [],
  };

  for (const qid of allQuotationIds) {
    const quotation: any = quotationById.get(qid);
    if (!quotation) continue;

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

    const useRevisedRates =
      String(quotation.quotationType || "").toLowerCase() === "revised";

    for (const item of quotation.PurchaseQuotationItem || []) {
      const partId = String(item.partId || "").trim();
      if (!partId) continue;

      const quotationQty = Number(item.quotationQuantity || 0);
      const itemInput = confirmByQuotationPart.get(`${qid}::${partId}`);

      if (confirmInputs.length > 0 && !itemInput) continue;

      const confirmQty = itemInput
        ? Number(itemInput.confirmQuantity || 0)
        : quotationQty;
      if (confirmQty <= 0) continue;

      const hasExplicitSplit =
        !!itemInput &&
        (itemInput.khiQuantity !== undefined ||
          itemInput.isbQuantity !== undefined ||
          itemInput.otherQuantity !== undefined);

      let laneQty: Record<PoLaneKey, number>;
      if (hasExplicitSplit && itemInput) {
        const khi = Number(itemInput.khiQuantity || 0);
        const isb = Number(itemInput.isbQuantity || 0);
        const other = Number(itemInput.otherQuantity || 0);
        const splitSum = khi + isb + other;
        if (splitSum !== confirmQty) {
          throw new Error(
            `ISB, KHI, and Other quantities must total the confirm quantity (${confirmQty}) for part ${partId} on quotation ${quotation.quotationNo}.`,
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
  }

  const lanesWithItems = (Object.keys(laneItems) as PoLaneKey[]).filter(
    (lane) => laneItems[lane].length > 0,
  );

  if (lanesWithItems.length === 0) {
    throw new Error("No items with confirm quantity to order.");
  }

  const confirmationDate = parseDateOrNow(options.confirmationDate);
  const quotationNos = allQuotationIds
    .map((id) => (quotationById.get(id) as any)?.quotationNo)
    .filter(Boolean)
    .join(", ");
  const requestNos = Array.from(
    new Set(
      allQuotationIds
        .map((id) => (quotationById.get(id) as any)?.PurchaseImportRequest?.requestNo)
        .filter(Boolean),
    ),
  ).join(", ");

  const createdOrders = await prisma.$transaction(async (tx) => {
    await (tx as any).purchaseQuotation.updateMany({
      where: { id: { in: allQuotationIds } },
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
      const notes = `Created from purchase quotation${
        allQuotationIds.length > 1 ? "s" : ""
      } ${quotationNos}${
        requestNos ? ` (Inquiry ${requestNos})` : ""
      } - ${consignee.toUpperCase()}`;

      const created = await tx.purchaseOrder.create({
        data: {
          id: randomUUID(),
          poNumber,
          date: confirmationDate,
          supplierId,
          purchaseQuotationId: primaryId,
          consignee,
          currency: primary.currency,
          conversionRate: Number(primary.conversionRate || 1),
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
      id: primary.id,
      quotationNo: primary.quotationNo,
      status: "confirm",
      confirmationDate,
    },
    quotations: allQuotationIds.map((id) => {
      const row: any = quotationById.get(id);
      return {
        id,
        quotationNo: row?.quotationNo || "",
        status: "confirm",
        confirmationDate,
      };
    }),
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
        priceA: true,
        priceB: true,
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
          priceA: part.priceA ?? 0,
          priceB: part.priceB ?? 0,
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

    const allBatchItems = batchRows.flatMap(
      (row: any) => row.PurchaseImportRequestItem || [],
    );

    res.json({
      data: {
        id: selectedRequest.id,
        batchId: selectedRequest.batchId,
        requestNo: selectedRequest.requestNo,
        baseRequestNo: getBaseRequestNo(selectedRequest.requestNo),
        requestDate: selectedRequest.createdAt,
        partReference: selectedRequest.partReference || "",
        consignee: formatConsigneesFromSplitItems(
          allBatchItems.length > 0 ? allBatchItems : items,
          selectedRequest.consignee,
        ),
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
        const confirmedQuotationCount = await purchaseQuotationModel.count({
          where: {
            purchaseImportRequestId: { in: batchRequestIds },
            status: "confirm",
          },
        });
        if (confirmedQuotationCount > 0) {
          return res.status(400).json({
            error:
              "Cannot unconfirm an inquiry after a quotation has been confirmed.",
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

// Delete purchase inquiry (entire batch) only when no quotation has been made
router.delete("/requests/:requestId", async (req: Request, res: Response) => {
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
      select: { id: true, batchId: true, requestNo: true },
    });
    if (!requestRow) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }

    const batchRequestRows = await purchaseImportRequestModel.findMany({
      where: { batchId: requestRow.batchId },
      select: { id: true },
    });
    const batchRequestIds = batchRequestRows.map((row: { id: string }) => row.id);

    if (purchaseQuotationModel && batchRequestIds.length > 0) {
      const quotationCount = await purchaseQuotationModel.count({
        where: { purchaseImportRequestId: { in: batchRequestIds } },
      });
      if (quotationCount > 0) {
        return res.status(400).json({
          error:
            "Cannot delete this inquiry because a quotation has already been made.",
        });
      }
    }

    await purchaseImportRequestModel.deleteMany({
      where: { batchId: requestRow.batchId },
    });

    res.json({
      success: true,
      message: `Inquiry ${requestRow.requestNo || ""} deleted successfully.`,
      data: { batchId: requestRow.batchId, deletedCount: batchRequestIds.length },
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

    const batchRows = await purchaseImportRequestModel.findMany({
      where: { batchId: requestRow.batchId },
      select: { id: true, supplierId: true },
    });
    const supplierCount = batchRows.filter((row: any) => row.supplierId).length;
    let quotationsInBatch = 0;
    if (purchaseQuotationModel && batchRows.length > 0) {
      quotationsInBatch = await purchaseQuotationModel.count({
        where: {
          purchaseImportRequestId: {
            in: batchRows.map((row: any) => row.id),
          },
        },
      });
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
        batchId: requestRow.batchId,
        supplierCount,
        quotationsInBatch,
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

router.get("/requests/:requestId/quotation-comparison", async (req: Request, res: Response) => {
  try {
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    if (!purchaseImportRequestModel || !purchaseQuotationModel) {
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
      select: {
        id: true,
        requestNo: true,
        batchId: true,
        createdAt: true,
        consignee: true,
        PurchaseImportRequestItem: {
          select: {
            khiQuantity: true,
            isbQuantity: true,
            otherQuantity: true,
          },
        },
      },
    });
    if (!requestRow) {
      return res.status(404).json({ error: "Purchase import inquiry not found." });
    }

    const batchRows = await purchaseImportRequestModel.findMany({
      where: { batchId: requestRow.batchId },
      orderBy: { createdAt: "asc" },
      include: {
        Supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            companyName: true,
          },
        },
        PurchaseImportRequestItem: {
          select: {
            khiQuantity: true,
            isbQuantity: true,
            otherQuantity: true,
          },
        },
      },
    });

    const supplierRows = batchRows.filter((row: any) => row.supplierId);
    if (supplierRows.length < 2) {
      return res.status(400).json({
        error: "Quotation comparison is available only for inquiries with multiple suppliers.",
      });
    }

    const batchItems = batchRows.flatMap(
      (row: any) => row.PurchaseImportRequestItem || [],
    );
    const consignee = formatConsigneesFromSplitItems(
      batchItems.length > 0
        ? batchItems
        : requestRow.PurchaseImportRequestItem || [],
      requestRow.consignee,
    );

    const suppliers: Array<{
      requestId: string;
      supplierId: string;
      supplierName: string;
      quotationId: string | null;
      quotationNo: string | null;
      quotationDate: string | null;
      currency: string | null;
      conversionRate: number;
      fcTotal: number;
      lcTotal: number;
    }> = [];

    type PartRow = {
      partId: string;
      masterPartNo: string;
      partNo: string;
      description: string;
      brand: string;
      demandQty: number;
      quotes: Record<
        string,
        {
          quotationQty: number;
          fcRate: number;
          lcRate: number;
          fcAmount: number;
          lcAmount: number;
        } | null
      >;
    };

    const partRows = new Map<string, PartRow>();

    for (const batchRow of supplierRows) {
      const supplierId = String(batchRow.supplierId);
      const supplierName =
        batchRow.Supplier?.companyName ||
        batchRow.Supplier?.name ||
        batchRow.Supplier?.code ||
        "-";

      const quotation = await purchaseQuotationModel.findFirst({
        where: { purchaseImportRequestId: batchRow.id },
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
      });

      suppliers.push({
        requestId: batchRow.id,
        supplierId,
        supplierName,
        quotationId: quotation?.id || null,
        quotationNo: quotation?.quotationNo || null,
        quotationDate: quotation?.quotationDate || null,
        currency: quotation?.currency || null,
        conversionRate: Number(quotation?.conversionRate || 1),
        fcTotal: Number(quotation?.fcTotal || 0),
        lcTotal: Number(quotation?.lcTotal || 0),
      });

      for (const item of quotation?.PurchaseQuotationItem || []) {
        const partId = String(item.partId);
        const existing = partRows.get(partId) || {
          partId,
          masterPartNo: item.Part?.MasterPart?.masterPartNo || "",
          partNo: item.Part?.partNo || "",
          description: item.Part?.description || "",
          brand: item.Part?.Brand?.name || "",
          demandQty: Number(item.demandQuantity || 0),
          quotes: {},
        };
        existing.quotes[supplierId] = {
          quotationQty: Number(item.quotationQuantity || 0),
          fcRate: Number(item.fcRate || 0),
          lcRate: Number(item.lcRate || 0),
          fcAmount: Number(item.fcAmount || 0),
          lcAmount: Number(item.lcAmount || 0),
        };
        partRows.set(partId, existing);
      }
    }

    const quotationsAvailable = suppliers.filter((row) => row.quotationId).length;
    if (quotationsAvailable === 0) {
      return res.status(400).json({
        error: "No quotations found for this inquiry batch.",
      });
    }

    for (const supplier of suppliers) {
      for (const part of partRows.values()) {
        if (!(supplier.supplierId in part.quotes)) {
          part.quotes[supplier.supplierId] = null;
        }
      }
    }

    const baseRequestNo = String(requestRow.requestNo || "").replace(/-\d+$/, "");

    res.json({
      data: {
        requestId: requestRow.id,
        requestNo: requestRow.requestNo,
        baseRequestNo,
        requestDate: requestRow.createdAt,
        consignee,
        supplierCount: supplierRows.length,
        quotationsAvailable,
        suppliers,
        items: Array.from(partRows.values()),
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
    const purchaseImportRequestModel = (prisma as any).purchaseImportRequest;
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    if (!purchaseQuotationModel) {
      return res.status(500).json({
        error:
          "Purchase quotation model is unavailable in Prisma client. Restart backend and regenerate Prisma client.",
      });
    }
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
    const statusFilter = String(req.query.status || "")
      .trim()
      .toLowerCase();
    const supplierId = String(req.query.supplierId || "").trim();
    const quotationNo = String(req.query.quotationNo || "").trim();
    const partReference = String(req.query.partReference || "").trim();

    const where: Record<string, unknown> = {};
    if (statusFilter === "confirm") {
      where.status = "confirm";
    } else if (statusFilter === "open") {
      where.status = { not: "confirm" };
    } else if (statusFilter === "all" || !statusFilter) {
      // no status filter
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (quotationNo) {
      where.quotationNo = { contains: quotationNo, mode: "insensitive" };
    }
    if (partReference) {
      where.PurchaseImportRequest = {
        partReference: { contains: partReference, mode: "insensitive" },
      };
    }

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
              partReference: true,
              consignee: true,
              batchId: true,
              PurchaseImportRequestItem: {
                select: {
                  khiQuantity: true,
                  isbQuantity: true,
                  otherQuantity: true,
                },
              },
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
              PurchaseOrderItem: {
                select: { fcRate: true, receivedQty: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      purchaseQuotationModel.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row: any) => ({
        ...row,
        consigneeLabel: await resolveQuotationConsigneeLabel(
          purchaseImportRequestModel,
          row.PurchaseImportRequest,
        ),
      })),
    );

    res.json({
      data,
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

// Delete quotation only when it has not been confirmed
router.delete("/quotations/:quotationId", async (req: Request, res: Response) => {
  try {
    const purchaseQuotationModel = (prisma as any).purchaseQuotation;
    const purchaseOrderModel = (prisma as any).purchaseOrder;
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

    const existing = await purchaseQuotationModel.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        quotationNo: true,
        status: true,
        purchaseImportRequestId: true,
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "Purchase quotation not found." });
    }

    if (normalizeQuotationStatus(existing.status) === "confirm") {
      return res.status(400).json({
        error: "Cannot delete a confirmed quotation.",
      });
    }

    if (purchaseOrderModel) {
      const poCount = await purchaseOrderModel.count({
        where: { purchaseQuotationId: quotationId },
      });
      if (poCount > 0) {
        return res.status(400).json({
          error:
            "Cannot delete this quotation because a purchase order has already been created.",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await (tx as any).purchaseQuotation.delete({ where: { id: quotationId } });

      // Inquiry status lives on every request row of the batch. When the last
      // quotation of the batch is deleted, the inquiry goes back to pending
      // (unconfirmed) so it can be edited or deleted again.
      const requestRow = await (tx as any).purchaseImportRequest.findUnique({
        where: { id: existing.purchaseImportRequestId },
        select: { batchId: true },
      });
      if (!requestRow?.batchId) return;

      const batchRequestRows = await (tx as any).purchaseImportRequest.findMany({
        where: { batchId: requestRow.batchId },
        select: { id: true },
      });
      const batchRequestIds = batchRequestRows.map(
        (row: { id: string }) => row.id,
      );
      if (batchRequestIds.length === 0) return;

      const remainingQuotations = await (tx as any).purchaseQuotation.count({
        where: { purchaseImportRequestId: { in: batchRequestIds } },
      });
      if (remainingQuotations > 0) return;

      await (tx as any).purchaseImportRequest.updateMany({
        where: { batchId: requestRow.batchId },
        data: { status: "pending", updatedAt: new Date() },
      });
    });

    res.json({
      success: true,
      message: `Quotation ${existing.quotationNo || ""} deleted successfully.`,
    });
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
        quotationId: String(item?.quotationId || "").trim() || undefined,
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

    const combineQuotationIds = Array.isArray(req.body?.combineQuotationIds)
      ? req.body.combineQuotationIds
          .map((id: any) => String(id || "").trim())
          .filter(Boolean)
      : [];

    const result = await confirmPurchaseQuotation(quotationId, {
      confirmationDate: req.body?.confirmationDate,
      items,
      combineQuotationIds,
    });

    res.json(result);
  } catch (error: any) {
    const message = error?.message || "Failed to confirm quotation.";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

function isImportPurchaseOrderSavedForUnconfirm(order: {
  status?: string | null;
  PurchaseOrderItem?: Array<{ fcRate?: number | null; receivedQty?: number | null }>;
}) {
  const status = String(order.status || "")
    .trim()
    .toLowerCase();
  if (
    status === "purchase invoice pending" ||
    status === "stock receiving pending" ||
    status === "received"
  ) {
    return true;
  }
  return (order.PurchaseOrderItem || []).some(
    (item) => Number(item.fcRate || 0) > 0 || Number(item.receivedQty || 0) > 0,
  );
}

// Notes are written by confirmPurchaseQuotation as:
// "Created from purchase quotation(s) Q1, Q2 (Inquiry R1) - KHI"
const parseQuotationNosFromPoNotes = (notes: any): string[] => {
  const text = String(notes || "").trim();
  const match =
    /^Created from purchase quotations?\s+(.+?)(?:\s+\(Inquiry\s.+?\))?\s+-\s+\S+$/.exec(
      text,
    );
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

router.post("/quotations/:quotationId/unconfirm", async (req: Request, res: Response) => {
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

    const quotation = await purchaseQuotationModel.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        quotationNo: true,
        status: true,
        quotationType: true,
      },
    });
    if (!quotation) {
      return res.status(404).json({ error: "Purchase quotation not found." });
    }

    if (normalizeQuotationStatus(quotation.status) !== "confirm") {
      return res.status(400).json({
        error: "Only confirmed quotations can be unconfirmed.",
      });
    }

    const linkedOrders = await prisma.purchaseOrder.findMany({
      where: { purchaseQuotationId: quotationId },
      select: {
        id: true,
        poNumber: true,
        status: true,
        notes: true,
        purchaseQuotationId: true,
        PurchaseOrderItem: {
          select: { fcRate: true, receivedQty: true },
        },
      },
    });

    let orders = linkedOrders;
    if (orders.length === 0 && quotation.quotationNo) {
      // Combined confirmation attaches POs to the primary quotation only.
      // Find sibling POs that still reference this quotation number in notes.
      const candidateOrders = await prisma.purchaseOrder.findMany({
        where: {
          purchaseQuotationId: { not: null },
          notes: { contains: String(quotation.quotationNo) },
        },
        select: {
          id: true,
          poNumber: true,
          status: true,
          notes: true,
          purchaseQuotationId: true,
          PurchaseOrderItem: {
            select: { fcRate: true, receivedQty: true },
          },
        },
      });
      orders = candidateOrders.filter((order) => {
        const nos = parseQuotationNosFromPoNotes(order.notes);
        return nos.includes(String(quotation.quotationNo));
      });
    }

    if (orders.some((order) => isImportPurchaseOrderSavedForUnconfirm(order))) {
      return res.status(400).json({
        error:
          "Cannot unconfirm this quotation after Purchase Import has been saved.",
      });
    }

    const orderIds = orders.map((order) => order.id);
    const quotationIdsToRevert = new Set<string>([quotationId]);
    for (const order of orders) {
      if (order.purchaseQuotationId) {
        quotationIdsToRevert.add(String(order.purchaseQuotationId));
      }
    }

    const combinedNos = Array.from(
      new Set(orders.flatMap((order) => parseQuotationNosFromPoNotes(order.notes))),
    );

    await prisma.$transaction(async (tx) => {
      if (orderIds.length > 0) {
        await tx.purchaseOrder.deleteMany({
          where: { id: { in: orderIds } },
        });
      }

      const revertWhere = {
        status: "confirm",
        OR: [
          { id: { in: Array.from(quotationIdsToRevert) } },
          ...(combinedNos.length > 0
            ? [{ quotationNo: { in: combinedNos } }]
            : []),
        ],
      } as any;

      await (tx as any).purchaseQuotation.updateMany({
        where: { ...revertWhere, quotationType: "revised" },
        data: {
          status: "revise",
          confirmationDate: null,
          updatedAt: new Date(),
        },
      });
      await (tx as any).purchaseQuotation.updateMany({
        where: { ...revertWhere, quotationType: { not: "revised" } },
        data: {
          status: "pending",
          confirmationDate: null,
          updatedAt: new Date(),
        },
      });
    });

    res.json({
      success: true,
      message: `Quotation ${quotation.quotationNo || ""} unconfirmed successfully.`,
      data: {
        id: quotation.id,
        quotationNo: quotation.quotationNo,
        deletedPurchaseOrderIds: orderIds,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
  id?: string;
  partId?: string;
  receiveQty: number;
  fcRate?: number;
  priceA?: number;
  priceB?: number;
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
  crnExp: number;
  cmExp: number;
  agencyExp: number;
  miscExp: number;
  locFrt: number;
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
  "crnExp",
  "cmExp",
  "agencyExp",
  "miscExp",
  "locFrt",
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
    crnExp: normalizeExpenseNumber(order?.crnExp),
    cmExp: normalizeExpenseNumber(order?.cmExp),
    agencyExp: normalizeExpenseNumber(order?.agencyExp),
    miscExp: normalizeExpenseNumber(order?.miscExp),
    locFrt: normalizeExpenseNumber(order?.locFrt),
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
    crnExp: normalizeExpenseNumber(source?.crnExp),
    cmExp: normalizeExpenseNumber(source?.cmExp),
    agencyExp: normalizeExpenseNumber(source?.agencyExp),
    miscExp: normalizeExpenseNumber(source?.miscExp),
    locFrt: normalizeExpenseNumber(source?.locFrt),
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
                priceA: true,
                priceB: true,
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
      const partPriceA = Number(poItem.Part?.priceA || 0);
      const partPriceB = Number(poItem.Part?.priceB || 0);

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
          priceA: partPriceA,
          priceB: partPriceB,
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
        priceA: partPriceA,
        priceB: partPriceB,
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
    const statusLower = String(order.status || "").trim().toLowerCase();
    const importSaved =
      statusLower === "purchase invoice pending" ||
      statusLower === "stock receiving pending" ||
      statusLower === "received" ||
      (order.PurchaseOrderItem || []).some(
        (item: any) =>
          Number(item.fcRate || 0) > 0 || Number(item.receivedQty || 0) > 0,
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
        importSaved,
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

    if (String(order.status || "").trim().toLowerCase() === "received") {
      return res.status(400).json({
        error: "Purchase import cannot be updated after the purchase order is received",
      });
    }

    const receiveStageRaw = String(req.body?.stage || req.body?.mode || "")
      .trim()
      .toLowerCase();
    const receiveStage =
      receiveStageRaw === "invoice" ||
      receiveStageRaw === "purchase-invoice" ||
      receiveStageRaw === "purchase_invoice"
        ? "invoice"
        : "import";

    const currentStatus = String(order.status || "").trim().toLowerCase();
    const hasImportData = (order.PurchaseOrderItem || []).some(
      (item: any) =>
        Number(item.fcRate || 0) > 0 || Number(item.receivedQty || 0) > 0,
    );
    const importReady =
      currentStatus === "purchase invoice pending" ||
      currentStatus === "stock receiving pending" ||
      hasImportData;

    if (receiveStage === "invoice" && !importReady) {
      return res.status(400).json({
        error:
          "Save Purchase Import at least once before saving Purchase Invoice.",
      });
    }

    if (
      receiveStage === "import" &&
      (currentStatus === "stock receiving pending" ||
        currentStatus === "received")
    ) {
      return res.status(400).json({
        error:
          "Purchase Import cannot be updated after Purchase Invoice has been saved.",
      });
    }

    const nextStatus =
      receiveStage === "invoice"
        ? "Stock Receiving Pending"
        : currentStatus === "stock receiving pending" || currentStatus === "received"
          ? String(order.status || "Purchase Invoice Pending")
          : "Purchase Invoice Pending";

    const quotation = order.PurchaseQuotation;
    const isRevised = isQuotationRevisedRecord(quotation);
    const quotationItemByPartId = new Map(
      (quotation.PurchaseQuotationItem || []).map((item) => [
        String(item.partId),
        item,
      ]),
    );

    const existingItemIds = new Set(
      order.PurchaseOrderItem.map((item) => String(item.id)),
    );

    const receiveByItemId = new Map<
      string,
      { receiveQty: number; fcRate?: number; priceA?: number; priceB?: number }
    >();
    const newItems: Array<{
      partId: string;
      receiveQty: number;
      fcRate: number;
      priceA?: number;
      priceB?: number;
    }> = [];
    const partPriceUpdates = new Map<
      string,
      { priceA?: number; priceB?: number }
    >();

    const queuePartPriceUpdate = (
      partId: string,
      priceA?: number,
      priceB?: number,
    ) => {
      if (!partId) return;
      const normalizedA =
        priceA !== undefined && Number.isFinite(Number(priceA))
          ? Math.max(0, Number(priceA))
          : undefined;
      const normalizedB =
        priceB !== undefined && Number.isFinite(Number(priceB))
          ? Math.max(0, Number(priceB))
          : undefined;
      if (normalizedA === undefined && normalizedB === undefined) return;
      const existing = partPriceUpdates.get(partId) || {};
      partPriceUpdates.set(partId, {
        priceA: normalizedA ?? existing.priceA,
        priceB: normalizedB ?? existing.priceB,
      });
    };

    for (const row of itemsRaw as ReceivePurchaseOrderItemInput[]) {
      const itemId = String(row?.id || "").trim();
      const partId = String(row?.partId || "").trim();
      const receiveQty = Number(row.receiveQty) || 0;
      const fcRate =
        row.fcRate !== undefined && Number.isFinite(Number(row.fcRate))
          ? Math.max(0, Number(row.fcRate) || 0)
          : undefined;
      const priceA =
        row.priceA !== undefined && Number.isFinite(Number(row.priceA))
          ? Math.max(0, Number(row.priceA) || 0)
          : undefined;
      const priceB =
        row.priceB !== undefined && Number.isFinite(Number(row.priceB))
          ? Math.max(0, Number(row.priceB) || 0)
          : undefined;

      if (itemId && existingItemIds.has(itemId)) {
        receiveByItemId.set(itemId, { receiveQty, fcRate, priceA, priceB });
        const poItem = order.PurchaseOrderItem.find((item) => item.id === itemId);
        if (poItem) {
          queuePartPriceUpdate(String(poItem.partId), priceA, priceB);
        }
        continue;
      }

      if (!partId) continue;

      newItems.push({
        partId,
        receiveQty,
        fcRate: fcRate ?? 0,
        priceA,
        priceB,
      });
      queuePartPriceUpdate(partId, priceA, priceB);
    }

    if (receiveByItemId.size === 0 && newItems.length === 0) {
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
        const weight = Number(
          quotationItem?.weight ?? (poItem as any).weight ?? 0,
        );
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

      for (const newItem of newItems) {
        const part = await tx.part.findUnique({
          where: { id: newItem.partId },
          select: { id: true, weight: true },
        });
        if (!part) {
          throw new Error(`Part not found: ${newItem.partId}`);
        }

        const receiveQty = Math.max(0, Math.floor(Number(newItem.receiveQty) || 0));
        const fcRate = Math.max(0, Number(newItem.fcRate) || 0);
        const weight = Number(part.weight || 0);
        const lineUnitCost = fcRate * conversionRate;
        const fcAmount = fcRate * receiveQty;
        const lineTotalCost = lineUnitCost * receiveQty;
        const totalWeight = weight * receiveQty;

        totalLc += lineTotalCost;
        totalFc += fcAmount;

        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: id,
            partId: newItem.partId,
            quantity: receiveQty,
            receivedQty: receiveQty,
            additionalQty: 0,
            backQty: 0,
            fcRate,
            fcAmount,
            weight,
            totalWeight,
            unitCost: lineUnitCost,
            totalCost: lineTotalCost,
          },
        });
      }

      for (const [partId, prices] of partPriceUpdates.entries()) {
        const updateData: { priceA?: number; priceB?: number } = {};
        if (prices.priceA !== undefined) updateData.priceA = prices.priceA;
        if (prices.priceB !== undefined) updateData.priceB = prices.priceB;
        if (Object.keys(updateData).length === 0) continue;
        await tx.part.update({
          where: { id: partId },
          data: updateData,
        });
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
          "crnExp" = ${expenses.crnExp},
          "cmExp" = ${expenses.cmExp},
          "agencyExp" = ${expenses.agencyExp},
          "miscExp" = ${expenses.miscExp},
          "locFrt" = ${expenses.locFrt},
          "totalExp" = ${expenses.totalExp},
          "status" = ${nextStatus},
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
    const message = error?.message || "Failed to receive purchase order";
    const status =
      message.includes("Part not found") || message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

// Delete import purchase order only when it has not been received
router.delete("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ error: "Purchase order id is required." });
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        poNumber: true,
        status: true,
        purchaseQuotationId: true,
        notes: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Purchase order not found." });
    }

    if (!order.purchaseQuotationId) {
      return res.status(400).json({
        error: "Only import purchase orders can be deleted from this endpoint.",
      });
    }

    // Stock enters only when the store receives the order (status becomes
    // "Received"). Items may already carry receivedQty from the purchase
    // invoice step, which has no stock impact, so status is the only guard.
    const status = String(order.status || "").trim().toLowerCase();
    if (status === "received") {
      return res.status(400).json({
        error: "Cannot delete a purchase order that has already been received.",
      });
    }

    const quotationId = order.purchaseQuotationId;

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.delete({ where: { id: orderId } });

      const remaining = await tx.purchaseOrder.count({
        where: { purchaseQuotationId: quotationId },
      });
      if (remaining > 0) return;

      // No orders left from this confirmation, so the quotation goes back to
      // its unconfirmed state. Combined confirmations link every PO to the
      // primary quotation only, so recover the other quotation numbers from
      // the PO notes to revert them too.
      const combinedNos = parseQuotationNosFromPoNotes(order.notes);
      const revertWhere = {
        status: "confirm",
        OR: [
          { id: quotationId },
          ...(combinedNos.length > 0
            ? [{ quotationNo: { in: combinedNos } }]
            : []),
        ],
      } as any;

      await (tx as any).purchaseQuotation.updateMany({
        where: { ...revertWhere, quotationType: "revised" },
        data: { status: "revise", confirmationDate: null, updatedAt: new Date() },
      });
      await (tx as any).purchaseQuotation.updateMany({
        where: { ...revertWhere, quotationType: { not: "revised" } },
        data: { status: "pending", confirmationDate: null, updatedAt: new Date() },
      });
    });

    res.json({
      success: true,
      message: `Purchase order ${order.poNumber || ""} deleted successfully.`,
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
            select: { id: true, fcRate: true, receivedQty: true },
          },
        } as any,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    const khiReceivedOrders = orders.filter((po: any) => {
      const status = String(po.status || "")
        .trim()
        .toLowerCase();
      const consignee = String(po.consignee || "")
        .trim()
        .toUpperCase();
      return status === "received" && consignee === "KHI";
    });

    const stockedOutPoIds = new Set<string>();
    const unlinkedKhiReceived = khiReceivedOrders.filter(
      (po: any) => !po.transferOutInvoiceId,
    );

    // Prefer the saved transfer-out invoice id on the PO.
    for (const po of khiReceivedOrders) {
      if (po.transferOutInvoiceId) {
        stockedOutPoIds.add(String(po.id));
      }
    }

    // Backfill older stock-outs that only have remarks, and persist the invoice id.
    if (unlinkedKhiReceived.length > 0) {
      const remarkMatchers = unlinkedKhiReceived.flatMap((po: any) => {
        const poNumber = String(po.poNumber || "").trim();
        const matchers: string[] = [`importPoId:${po.id}`];
        if (poNumber) {
          matchers.push(`Stock out from Import PO ${poNumber}`);
        }
        return matchers;
      });

      const transferOuts = await prisma.salesInvoice.findMany({
        where: {
          customerType: "transfer",
          status: { notIn: ["cancelled", "Canceled", "void", "Void"] },
          OR: remarkMatchers.map((value) => ({
            remarks: { contains: value, mode: "insensitive" },
          })),
        },
        select: { id: true, remarks: true },
      });

      for (const invoice of transferOuts) {
        const remarks = String(invoice.remarks || "");
        for (const po of unlinkedKhiReceived) {
          if (stockedOutPoIds.has(String(po.id))) continue;
          const poNumber = String(po.poNumber || "").trim();
          const byId = remarks.includes(`importPoId:${po.id}`);
          const byNumber =
            Boolean(poNumber) &&
            remarks.toLowerCase().includes(
              `stock out from import po ${poNumber}`.toLowerCase(),
            );
          if (!byId && !byNumber) continue;

          stockedOutPoIds.add(String(po.id));
          try {
            await prisma.purchaseOrder.updateMany({
              where: {
                id: po.id,
                transferOutInvoiceId: null,
              } as any,
              data: {
                transferOutInvoiceId: invoice.id,
                updatedAt: new Date(),
              } as any,
            });
          } catch {
            // Non-fatal: list still marks stockedOut from the in-memory set.
          }
        }
      }
    }

    res.json({
      data: orders.map((po: any) => {
        const items = po.PurchaseOrderItem || [];
        const importSaved =
          String(po.status || "")
            .trim()
            .toLowerCase() === "purchase invoice pending" ||
          String(po.status || "")
            .trim()
            .toLowerCase() === "stock receiving pending" ||
          String(po.status || "")
            .trim()
            .toLowerCase() === "received" ||
          items.some(
            (item: any) =>
              Number(item.fcRate || 0) > 0 || Number(item.receivedQty || 0) > 0,
          );
        return {
        id: po.id,
        poNumber: po.poNumber,
        date: po.date,
        status: po.status,
        consignee: po.consignee,
        totalAmount: po.totalAmount,
        notes: po.notes,
        forwarder: po.forwarder ?? null,
        estTimeDate: po.expectedDate ?? null,
        importSaved,
        transferOutInvoiceId: po.transferOutInvoiceId || null,
        stockedOut: stockedOutPoIds.has(String(po.id)),
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
        itemsCount: items.length,
      };
      }),
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

/**
 * Back Order Summary Report
 * Filters import POs by supplier + date range; returns ISB then KHI groups,
 * each grouped by purchase order number with line items.
 */
router.get("/reports/back-order-summary", async (req: Request, res: Response) => {
  try {
    const supplierId = String(req.query.supplierId || "").trim();
    const fromDateRaw = String(req.query.fromDate || req.query.from_date || "").trim();
    const toDateRaw = String(req.query.toDate || req.query.to_date || "").trim();

    if (!supplierId) {
      return res.status(400).json({ error: "Supplier is required." });
    }
    if (!fromDateRaw || !toDateRaw) {
      return res.status(400).json({ error: "From date and to date are required." });
    }

    const fromDate = new Date(fromDateRaw);
    const toDate = new Date(toDateRaw);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: "Invalid date range." });
    }
    // Inclusive end-of-day for toDate
    toDate.setHours(23, 59, 59, 999);

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        code: true,
        name: true,
        companyName: true,
        type: true,
      },
    });
    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found." });
    }

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        purchaseQuotationId: { not: null },
        supplierId,
        date: { gte: fromDate, lte: toDate },
        consignee: { in: ["isb", "khi"] },
      } as any,
      orderBy: [{ date: "asc" }, { poNumber: "asc" }],
      include: {
        PurchaseOrderItem: {
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
      } as any,
    });

    type SummaryLine = {
      partId: string;
      partNo: string;
      masterPartNo: string;
      brand: string;
      description: string;
      fcRate: number;
      orderQty: number;
      receivedQty: number;
      fromBackQty: number;
      backQty: number;
      poNumber?: string;
      poDate?: string | null;
    };

    type PoGroup = {
      poId: string;
      poNumber: string;
      poDate: string | null;
      items: SummaryLine[];
    };

    const buildSection = (consignee: "isb" | "khi"): PoGroup[] => {
      const groups: PoGroup[] = [];
      for (const po of orders as any[]) {
        if (String(po.consignee || "").toLowerCase() !== consignee) continue;
        const poItems = po.PurchaseOrderItem || po.purchaseOrderItem || [];
        const poNumber = String(po.poNumber || "").trim() || "-";
        const poDate = po.date
          ? new Date(po.date).toISOString().split("T")[0]
          : null;
        const items: SummaryLine[] = poItems
          .filter(
            (item: any) =>
              Number(item.backQty || 0) > 0 ||
              Number(item.additionalQty || 0) > 0,
          )
          .map((item: any) => ({
            partId: String(item.partId || item.Part?.id || ""),
            partNo: item.Part?.partNo || "-",
            masterPartNo: item.Part?.MasterPart?.masterPartNo || "-",
            brand: item.Part?.Brand?.name || "-",
            description: item.Part?.description || "-",
            fcRate: Number(item.fcRate ?? item.fc_rate ?? 0) || 0,
            orderQty: Number(item.quantity) || 0,
            receivedQty: Number(item.receivedQty ?? item.received_qty ?? 0) || 0,
            fromBackQty:
              Number(item.additionalQty ?? item.additional_qty ?? 0) || 0,
            backQty: Number(item.backQty ?? item.back_qty ?? 0) || 0,
            // Also stamp PO fields on each line so the UI can recover if grouping is flattened
            poNumber,
            poDate,
          }))
          .filter((item: SummaryLine) => item.partId)
          .sort((a: SummaryLine, b: SummaryLine) =>
            String(a.partNo).localeCompare(String(b.partNo)),
          );
        if (items.length === 0) continue;
        groups.push({
          poId: String(po.id),
          poNumber,
          poDate,
          items,
        });
      }
      return groups;
    };

    const sumLines = (groups: PoGroup[]) =>
      groups.reduce(
        (acc, group) => {
          for (const row of group.items) {
            acc.orderQty += row.orderQty;
            acc.receivedQty += row.receivedQty;
            acc.fromBackQty += row.fromBackQty;
            acc.backQty += row.backQty;
          }
          return acc;
        },
        { orderQty: 0, receivedQty: 0, fromBackQty: 0, backQty: 0 },
      );

    const isb = buildSection("isb");
    const khi = buildSection("khi");

    res.json({
      data: {
        supplier: {
          id: supplier.id,
          code: supplier.code,
          name: supplier.companyName || supplier.name || supplier.code,
        },
        fromDate: fromDateRaw,
        toDate: toDateRaw,
        sections: {
          ISB: isb,
          KHI: khi,
        },
        totals: {
          ISB: sumLines(isb),
          KHI: sumLines(khi),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to generate back order summary report",
    });
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
