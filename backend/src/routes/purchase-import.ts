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

    const [movements, dpoItems, poItems] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { partId },
        select: { type: true, quantity: true },
      }),
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

    const currentStock = movements.reduce((sum, row) => {
      return sum + (row.type === "in" ? row.quantity : -row.quantity);
    }, 0);

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

    const lastPurchases = [...normalizedDpo, ...normalizedPo]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);

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
            createdAt: new Date(),
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
            createdAt: new Date(),
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
            createdAt: new Date(),
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
            createdAt: new Date(),
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
      const maxQuotationRows = await prisma.$queryRaw<Array<{ maxNo: number | null }>>`
        SELECT COALESCE(MAX((regexp_match("quotationNo", '^PQ-([0-9]+)'))[1]::INT), 0) AS "maxNo"
        FROM "PurchaseQuotation"
      `;
      const maxNo = Number(maxQuotationRows?.[0]?.maxNo || 0);
      quotationNo = `PQ-${String(maxNo + 1).padStart(4, "0")}`;
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

    const maxQuotationRows = await prisma.$queryRaw<Array<{ maxNo: number | null }>>`
      SELECT COALESCE(MAX((regexp_match("quotationNo", '^PQ-([0-9]+)'))[1]::INT), 0) AS "maxNo"
      FROM "PurchaseQuotation"
    `;
    const maxNo = Number(maxQuotationRows?.[0]?.maxNo || 0);
    const quotationNo = `PQ-${String(maxNo + 1).padStart(4, "0")}`;

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
      Math.min(100, parseInt(String(req.query.limit || "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      purchaseQuotationModel.findMany({
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
        },
      }),
      purchaseQuotationModel.count(),
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
        items: (row.PurchaseQuotationItem || []).map((item: any) => ({
          partId: item.partId,
          masterPartNo: item.Part?.MasterPart?.masterPartNo || "",
          partNo: item.Part?.partNo || "",
          description: item.Part?.description || "",
          brand: item.Part?.Brand?.name || "",
          demandQuantity: Number(item.demandQuantity || 0),
          quotationQuantity: Number(item.quotationQuantity || 0),
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
        })),
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
        quotationNo: existing.quotationNo,
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
      Math.min(100, parseInt(String(req.query.limit || "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      purchaseImportRequestModel.findMany({
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
        },
      }),
      purchaseImportRequestModel.count(),
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
