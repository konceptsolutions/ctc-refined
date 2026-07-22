// DPO Voucher Logic: Vouchers (JV/PV) are ONLY created when store manager receives/approves the order
import * as express from "express";
import { Request, Response } from "express";
import { query, getClient } from "../config/db";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import prisma from "../config/database";
import { Prisma } from "@prisma/client";
import {
  processPurchaseReceive,
  calculateAverageCostDPO,
} from "../utils/inventoryFormulas";
import { getCanonicalPartId } from "../services/partCanonical";
import {
  netStockFromMovements,
  stockInOutTotals,
  unassignedStockFromMovements,
} from "../utils/stockMovementBalance";

const router = express.Router();
const DPO_START_NO = 113;

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const isTransferInDpo = (orderType?: string | null, dpoNumber?: string | null) =>
  String(orderType || "").trim() === "transfer_in" ||
  /^TIN-/i.test(String(dpoNumber || "").trim());

function supplierDisplayName(
  supplier?: { name?: string | null; companyName?: string | null } | null,
): string | null {
  if (!supplier) return null;
  const companyName = String(supplier.companyName || "").trim();
  const name = String(supplier.name || "").trim();
  return companyName || name || null;
}

/** Supplier payable (local purchase) or selected branch account (transfer in) for DPO vouchers. */
async function resolveDpoCounterpartyAccount(
  tx: PrismaTx,
  args: {
    isTransferIn: boolean;
    branchAccountId?: string | null;
    supplierId?: string | null;
    dpoNumber?: string | null;
    orderType?: string | null;
  },
): Promise<{
  counterpartyAccount: {
    id: string;
    code: string;
    name: string;
    Subgroup: { MainGroup: { type: string } };
  } | null;
  counterpartyLabel: string;
}> {
  const transferIn = isTransferInDpo(
    args.orderType ?? (args.isTransferIn ? "transfer_in" : "local_purchase"),
    args.dpoNumber,
  );

  if (transferIn) {
    const branchId = args.branchAccountId?.trim() || null;
    if (!branchId) {
      throw new Error(
        "Transfer In requires a branch account on the order before posting the voucher.",
      );
    }
    const branchAccount = await tx.account.findUnique({
      where: { id: branchId },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
    if (!branchAccount) {
      throw new Error(`Branch account not found (id: ${branchId}).`);
    }
    return {
      counterpartyAccount: branchAccount as any,
      counterpartyLabel: branchAccount.name || "Branch",
    };
  }

  const supplier = args.supplierId
    ? await tx.supplier.findUnique({ where: { id: args.supplierId } })
    : null;

  let counterpartyAccount = await tx.account.findFirst({
    where: {
      Subgroup: { code: "301" },
      OR: [
        { name: supplier?.name || "" },
        { name: supplier?.companyName || "" },
        { name: { contains: supplier?.name || "Supplier" } },
      ],
    },
    include: { Subgroup: { include: { MainGroup: true } } },
  });

  if (!counterpartyAccount) {
    counterpartyAccount = await tx.account.findFirst({
      where: { Subgroup: { code: "301" } },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
  }

  return {
    counterpartyAccount: counterpartyAccount as any,
    counterpartyLabel:
      supplier?.companyName || supplier?.name || "Supplier",
  };
}

// Get inventory dashboard stats
router.post("/sync-part-rack-shelf", async (req: Request, res: Response) => {
  try {
    console.log("[API] Starting PartRackShelf Sync...");

    // 1. Clear existing table to rebuild
    await prisma.partRackShelf.deleteMany({});

    // 2. Get all movements and all parts to resolve canonical IDs
    const [movements, allParts] = await Promise.all([
      prisma.stockMovement.findMany({}),
      prisma.part.findMany({ select: { id: true, partNo: true } }),
    ]);

    // Build a map for fast canonical lookup
    // First, group parts by partNo
    const partNoGroups = new Map<string, any[]>();
    for (const p of allParts) {
      if (!partNoGroups.has(p.partNo)) partNoGroups.set(p.partNo, []);
      partNoGroups.get(p.partNo)?.push(p);
    }

    // Prepare canonical map (ID -> Canonical ID)
    const canonicalMap = new Map<string, string>();
    // We already have getCanonicalPartId but it's slow in a loop.
    // For sync utility, we'll just pick the oldest ID as canonical for speed, or just use the first.
    // Actually, to match the app's real canonical logic:
    const partNos = Array.from(partNoGroups.keys());
    for (const pNo of partNos) {
      const canonicalId = await getCanonicalPartId(prisma, pNo);
      if (canonicalId) {
        const group = partNoGroups.get(pNo) || [];
        for (const p of group) {
          canonicalMap.set(p.id, canonicalId);
        }
      }
    }

    // 3. Aggregate in memory
    const stockMap = new Map<string, number>();

    for (const m of movements) {
      const canonicalId = canonicalMap.get(m.partId) || m.partId;
      const storeId = m.storeId || "null";
      const rackId = m.rackId || "null";
      const shelfId = m.shelfId || "null";
      const key = `${canonicalId}|${storeId}|${rackId}|${shelfId}`;

      const qty = m.type === "in" ? m.quantity : -m.quantity;
      const current = stockMap.get(key) || 0;
      stockMap.set(key, current + qty);
    }

    // 4. Insert records
    let insertCount = 0;
    for (const [key, quantity] of stockMap.entries()) {
      // We keep records even if quantity is 0 or negative during sync to match history exactly?
      // Actually usually we only want to see positive stock in the locations list,
      // but if we want to "Get all data from PR table", then PR should contain the net balance.
      // If balance is 0, we can skip to keep table clean, or keep it.
      // Let's keep only non-zero to avoid clutter.
      if (quantity === 0) continue;

      const [partId, storeIdRaw, rackIdRaw, shelfIdRaw] = key.split("|");
      const storeId = storeIdRaw === "null" ? null : storeIdRaw;
      const rackId = rackIdRaw === "null" ? null : rackIdRaw;
      const shelfId = shelfIdRaw === "null" ? null : shelfIdRaw;

      await prisma.partRackShelf.create({
        data: {
          partId,
          storeId,
          rackId,
          shelfId,
          quantity,
        },
      });
      insertCount++;
    }

    console.log(`[API] Sync Completed. Inserted ${insertCount} records.`);
    res.json({
      message: `Synced successfully. Created ${insertCount} records.`,
    });
  } catch (error: any) {
    console.error("[API] Sync Failed:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const [
      totalParts,
      activeParts,
      totalValue,
      categoriesCount,
      suppliersCount,
    ] = await Promise.all([
      prisma.part.count(),
      prisma.part.count({ where: { status: "active" } }),
      prisma.part.aggregate({
        _sum: {
          cost: true,
        },
        where: {
          status: "active",
        },
      }),
      prisma.category.count({ where: { status: "active" } }),
      prisma.supplier.count({ where: { status: "active" } }),
    ]);
    const activeKits = 0;

    // Get total quantity from stock movements
    const totalQtyResult = await prisma.stockMovement.aggregate({
      _sum: {
        quantity: true,
      },
    });

    // Calculate stock levels from movements
    const allMovements = await prisma.stockMovement.findMany({
      select: {
        partId: true,
        quantity: true,
        type: true,
      },
    });

    // Group movements by part
    const stockByPart: Record<string, { in: number; out: number }> = {};
    for (const movement of allMovements) {
      if (!stockByPart[movement.partId]) {
        stockByPart[movement.partId] = { in: 0, out: 0 };
      }
      if (movement.type === "in") {
        stockByPart[movement.partId].in += movement.quantity;
      } else {
        stockByPart[movement.partId].out += movement.quantity;
      }
    }

    // Calculate low stock and out of stock
    const parts = await prisma.part.findMany({
      where: { status: "active" },
      select: {
        id: true,
        reorderLevel: true,
      },
    });

    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const part of parts) {
      const stock = stockByPart[part.id] || { in: 0, out: 0 };
      const currentStock = stock.in - stock.out;

      if (currentStock <= 0) {
        outOfStockCount++;
      } else if (part.reorderLevel > 0 && currentStock <= part.reorderLevel) {
        lowStockCount++;
      }
    }

    // Get chart data: Category Value Distribution
    const partsWithCategories = await prisma.part.findMany({
      where: { status: "active" },
      include: {
        Category: true,
      },
    });

    // Get all stock movements for these parts
    const partIds = partsWithCategories.map((p) => p.id);
    const allPartMovements =
      partIds.length > 0
        ? await prisma.stockMovement.findMany({
            where: {
              partId: { in: partIds },
            },
            select: {
              partId: true,
              quantity: true,
              type: true,
            },
          })
        : [];

    // Group movements by part
    const movementsByPart: Record<string, { in: number; out: number }> = {};
    for (const movement of allPartMovements) {
      if (!movementsByPart[movement.partId]) {
        movementsByPart[movement.partId] = { in: 0, out: 0 };
      }
      if (movement.type === "in") {
        movementsByPart[movement.partId].in += movement.quantity;
      } else {
        movementsByPart[movement.partId].out += movement.quantity;
      }
    }

    // Calculate category values
    const categoryValueMap: Record<string, number> = {};
    const categoryCountMap: Record<string, number> = {};

    for (const part of partsWithCategories) {
      const stock = movementsByPart[part.id] || { in: 0, out: 0 };
      const currentStock = stock.in - stock.out;
      // Use cost if available, otherwise use 0 (will show value as 0)
      const value = (part.cost || 0) * Math.max(0, currentStock);

      const catName = (part as any).Category
        ? (part as any).Category.name
        : "Uncategorized";
      categoryValueMap[catName] = (categoryValueMap[catName] || 0) + value;
      categoryCountMap[catName] = (categoryCountMap[catName] || 0) + 1;
    }

    const categoryValueData = Object.entries(categoryValueMap)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);

    // Generate consistent colors for categories
    const categoryColors = [
      "hsl(0, 70%, 50%)", // Red
      "hsl(30, 70%, 50%)", // Orange
      "hsl(60, 70%, 50%)", // Yellow
      "hsl(120, 70%, 50%)", // Green
      "hsl(180, 70%, 50%)", // Cyan
      "hsl(240, 70%, 50%)", // Blue
      "hsl(270, 70%, 50%)", // Purple
      "hsl(300, 70%, 50%)", // Magenta
    ];

    const categoryDistribution = Object.entries(categoryCountMap)
      .map(([name, count], index) => ({
        name,
        value: count,
        color: categoryColors[index % categoryColors.length],
      }))
      .sort((a, b) => b.value - a.value);

    // Get brand values
    const partsWithBrands = await prisma.part.findMany({
      where: { status: "active" },
      include: {
        Brand: true,
      },
    });

    const brandValueMap: Record<string, number> = {};
    for (const part of partsWithBrands) {
      const stock = movementsByPart[part.id] || { in: 0, out: 0 };
      const currentStock = stock.in - stock.out;
      const value = (part.cost || 0) * currentStock;

      if (part.Brand) {
        brandValueMap[part.Brand.name] =
          (brandValueMap[part.Brand.name] || 0) + value;
      } else {
        // Handle parts without brand
        const brandName = "No Brand";
        brandValueMap[brandName] = (brandValueMap[brandName] || 0) + value;
      }
    }

    const topBrandsByValue = Object.entries(brandValueMap)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Get stock movement trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const movementsLast6Months = await prisma.stockMovement.findMany({
      where: {
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        quantity: true,
        type: true,
        createdAt: true,
      },
    });

    // Group by month
    const monthlyData: Record<string, { in: number; out: number }> = {};
    for (const movement of movementsLast6Months) {
      const monthKey = new Date(movement.createdAt).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "short" },
      );
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { in: 0, out: 0 };
      }
      if (movement.type === "in") {
        monthlyData[monthKey].in += movement.quantity;
      } else {
        monthlyData[monthKey].out += movement.quantity;
      }
    }

    // Generate last 6 months
    const stockMovementData = [];
    let balance = 0;
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      });
      const monthData = monthlyData[monthKey] || { in: 0, out: 0 };
      balance += monthData.in - monthData.out;
      stockMovementData.push({
        month: monthKey,
        balance,
        stockIn: monthData.in,
        stockOut: monthData.out,
      });
    }

    res.json({
      totalParts,
      activeParts,
      totalValue: totalValue._sum.cost || 0,
      totalQty: totalQtyResult._sum.quantity || 0,
      categoriesCount,
      activeKits,
      suppliersCount,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      charts: {
        categoryValueData,
        categoryDistribution,
        topBrandsByValue,
        stockMovementData,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed location breakdown for a specific part
router.get("/part-locations/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;

    // Query PartRackShelf ONLY for this exact partId using Raw SQL for maximum consistency with the main table.
    const records = await query(
      `SELECT 
        prs.id as id, 
        prs."storeId" as "storeId", 
        prs."rackId" as "rackId", 
        prs."shelfId" as "shelfId", 
        prs.quantity as quantity,
        s.name as store_name,
        r."codeNo" as rack_code,
        sh."shelfNo" as shelf_no
      FROM "PartRackShelf" prs
      LEFT JOIN "Store" s ON prs."storeId" = s.id
      LEFT JOIN "Rack" r ON prs."rackId" = r.id
      LEFT JOIN "Shelf" sh ON prs."shelfId" = sh.id
      WHERE prs."partId" = $1`,
      [partId],
    );

    // Look up the part for diagnostics
    const partInfoResult = await query(
      `SELECT p."partNo", b.name as brand_name 
       FROM "Part" p 
       LEFT JOIN "Brand" b ON p."brandId" = b.id 
       WHERE p.id = $1`,
      [partId],
    );
    const partInfo = partInfoResult.rows[0];

    console.log(
      `[API] part-locations partId=${partId} brand=${partInfo?.brand_name} partNo=${partInfo?.partNo} => found ${records.rows.length} PartRackShelf rows using RAW SQL`,
    );

    // Aggregate by Store/Rack/Shelf combination
    const locationMap = new Map();
    let totalAssigned = 0;

    for (const r of records.rows) {
      const storeKey = r.storeId || "null";
      const rackKey = r.rackId || "null";
      const shelfKey = r.shelfId || "null";
      const key = `${storeKey}-${rackKey}-${shelfKey}`;

      if (!locationMap.has(key)) {
        locationMap.set(key, {
          id: r.id,
          storeId: r.storeId,
          store: r.store_name || "No Store",
          rackId: r.rackId,
          rack: r.rack_code || "No Rack",
          shelfId: r.shelfId,
          shelf: r.shelf_no || "No Shelf",
          isUnlocated: !r.rackId && !r.shelfId,
          quantity: 0,
        });
      }

      const existing = locationMap.get(key);
      existing.quantity += r.quantity;
      totalAssigned += r.quantity;
    }

    // Calculate this specific part's actual stock from its own movements only
    const sm_in = await prisma.stockMovement.aggregate({
      where: { partId, type: "in" },
      _sum: { quantity: true },
    });
    const sm_out = await prisma.stockMovement.aggregate({
      where: { partId, type: "out" },
      _sum: { quantity: true },
    });
    const totalActualStock =
      (sm_in._sum.quantity || 0) - (sm_out._sum.quantity || 0);

    // Filter out zero-quantity entries
    const locations = Array.from(locationMap.values()).filter(
      (l: any) => l.quantity !== 0,
    );

    // Add Virtual Unallocated row if there is stock not assigned to any location
    const unallocatedDiff = totalActualStock - totalAssigned;
    if (unallocatedDiff !== 0) {
      locations.push({
        id: `unallocated-${partId}`,
        storeId: null,
        store: "Unallocated",
        rackId: null,
        rack: "No Rack",
        shelfId: null,
        shelf: "No Shelf",
        isUnlocated: true,
        quantity: unallocatedDiff,
      });
    }

    // Sort: allocated first, then unallocated, then largest quantity first
    locations.sort((a: any, b: any) => {
      if (a.isUnlocated !== b.isUnlocated) return a.isUnlocated ? 1 : -1;
      return b.quantity - a.quantity;
    });

    res.json({ data: locations });
  } catch (error: any) {
    console.error(`[API] Error in part-locations: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get stock movements
router.get("/movements", async (req: Request, res: Response) => {
  try {
    const {
      part_id,
      type,
      from_date,
      to_date,
      store_id,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      referenceType: { not: "location_adjustment" },
    };

    if (part_id) {
      where.partId = part_id as string;
    }

    if (type) {
      where.type = type as string;
    }

    if (store_id) {
      where.storeId = store_id as string;
    }

    if (from_date || to_date) {
      where.createdAt = {};
      if (from_date) {
        where.createdAt.gte = new Date(from_date as string);
      }
      if (to_date) {
        where.createdAt.lte = new Date(to_date as string);
      }
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          Part: {
            include: {
              Brand: true,
              Category: true,
            },
          },
          Store: true,
          Rack: true,
          Shelf: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNum,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    // Get reserved quantities for all parts in movements
    // Check both StockMovement with referenceType='stock_reservation' and StockReservation table
    const partIdsSet = new Set(movements.map((m) => m.partId));
    const partIds = Array.from(partIdsSet);

    // Initialize with empty objects if no parts
    const reservedByPart: Record<string, number> = {};
    const stockBalanceByPart: Record<string, number> = {};
    const unassignedBalanceByPart: Record<string, number> = {};

    if (partIds.length === 0) {
    } else {
      // Get reservations from StockReservation table
      const stockReservations = await prisma.stockReservation.findMany({
        where: {
          partId: { in: partIds },
          status: "reserved",
          OR: [
            { invoiceId: null },
            { SalesInvoice: { is: { status: { not: "cancelled" } } } },
          ],
        },
      });

      // Group reservations by partId
      stockReservations.forEach((res) => {
        reservedByPart[res.partId] =
          (reservedByPart[res.partId] || 0) + res.quantity;
      });

      // Calculate current stock balance for each part
      // IMPORTANT: Get ALL movements for these parts (not just current page) to calculate accurate stock balance
      const allMovements = await prisma.stockMovement.findMany({
        where: {
          partId: { in: partIds },
          OR: [
            { referenceType: null },
            { referenceType: { not: "stock_reservation" } },
          ],
        },
        select: {
          partId: true,
          type: true,
          quantity: true,
          rackId: true,
          shelfId: true,
        },
      });

      // Calculate stock balance per part
      allMovements.forEach((m) => {
        if (!stockBalanceByPart[m.partId]) {
          stockBalanceByPart[m.partId] = 0;
          unassignedBalanceByPart[m.partId] = 0;
        }

        const qty = m.quantity || 0;
        const isUnassigned = !m.rackId && !m.shelfId;

        if (m.type === "in") {
          stockBalanceByPart[m.partId] += qty;
          if (isUnassigned) unassignedBalanceByPart[m.partId] += qty;
        } else {
          stockBalanceByPart[m.partId] -= qty;
          if (isUnassigned) unassignedBalanceByPart[m.partId] -= qty;
        }
      });

      // Debug logging
      partIds.slice(0, 5).forEach((partId) => {
        const stock = stockBalanceByPart[partId] || 0;
        const reserved = reservedByPart[partId] || 0;
        const available = Math.max(0, stock - reserved);
        const part = movements.find((m) => m.partId === partId);
      });
    }

    const responseData = movements.map((m) => {
      const currentStock = stockBalanceByPart[m.partId] || 0;
      const unassignedStock = unassignedBalanceByPart[m.partId] || 0;
      const reservedQty = reservedByPart[m.partId] || 0;
      const availableQty = Math.max(0, currentStock - reservedQty);

      // Debug: Log first few movements - ALWAYS log to diagnose
      if (movements.indexOf(m) < 5) {
      }

      const movementData = {
        id: m.id,
        part_id: m.partId,
        part_no: (m as any).Part.partNo,
        part_description: (m as any).Part.description,
        brand: (m as any).Part.Brand?.name || null,
        category: (m as any).Part.Category?.name || null,
        type: m.type,
        quantity: m.quantity,
        // NOTE: reserved_quantity removed from here to prevent duplication in totals
        // Reserved qty is calculated per-part, showing it on each movement causes incorrect sums
        current_stock: currentStock,
        unassigned_stock: unassignedStock,
        available_quantity: availableQty,
        store_id: m.storeId,
        store_name: (m as any).Store?.name || null,
        rack_id: m.rackId,
        rack_code: (m as any).Rack?.codeNo || null,
        shelf_id: m.shelfId,
        shelf_no:
          (m as any).Shelf?.shelfNo || (m as any).Shelf?.shelf_no || null,
        shelf: (m as any).Shelf?.shelfNo || (m as any).Shelf?.shelf_no || null,
        reference_type: m.referenceType,
        reference_id: m.referenceId,
        notes: m.notes,
        created_at: m.createdAt,
      };

      // Verify data is being set correctly
      if (movements.indexOf(m) === 0) {
      }

      return movementData;
    });

    // CRITICAL DEBUG: Verify responseData has the fields before sending
    if (responseData.length > 0) {
      const firstItem = responseData[0];
    }

    res.json({
      data: responseData,
      reservedByPart, // Add part-level reserved quantities for frontend reference
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

// Create stock movement (Stock In/Out)
router.post("/movements", async (req: Request, res: Response) => {
  try {
    const {
      part_id,
      type,
      quantity,
      store_id,
      rack_id,
      shelf_id,
      reference_type,
      reference_id,
      notes,
    } = req.body;

    if (!part_id || !type || !quantity) {
      return res
        .status(400)
        .json({ error: "part_id, type, and quantity are required" });
    }

    if (type !== "in" && type !== "out") {
      return res.status(400).json({ error: 'type must be "in" or "out"' });
    }

    const movement = await prisma.$transaction(async (tx) => {
      const createdMovement = await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          partId: part_id,
          type: type,
          quantity: parseInt(quantity),
          storeId: store_id || null,
          rackId: rack_id || null,
          shelfId: shelf_id || null,
          referenceType: reference_type || null,
          referenceId: reference_id || null,
          notes: notes || null,
        } as any,
        include: {
          Part: {
            include: {
              Brand: true,
            },
          },
          Store: true,
        },
      });

      // Sync with PartRackShelf table
      // Only sync if we have a Store. If no Store, it's effectively "Unallocated" globally but PartRackShelf requires keys.
      // Actually PartRackShelf has Store, Rack, Shelf. Store is non-nullable in schema?
      // Checking schema... PartRackShelf: storeId String (Required).
      // So if movement has storeId, we sync.

      const mStoreId = store_id || null;
      const mRackId = rack_id || null;
      const mShelfId = shelf_id || null;
      const qtyChange =
        type === "in" ? parseInt(quantity) : -parseInt(quantity);

      // Find existing PartRackShelf entry for this specific location
      const existingEntry = await tx.partRackShelf.findFirst({
        where: {
          partId: part_id,
          storeId: mStoreId,
          rackId: mRackId,
          shelfId: mShelfId,
        },
      });

      if (existingEntry) {
        // Update existing entry
        const newQuantity = existingEntry.quantity + qtyChange;

        // Prevent negative stock IF IT'S AN OUT MOVEMENT
        // User Requirement: "stock will not go in nagitive like -5 it will stop at zero 0"
        if (newQuantity < 0) {
          // Treating "stop at zero" as "Don't allow transaction" or "Floor at 0"?
          // "stocke will go nagitive means Decreseing... stock will not go in nagitive like -5"
          // Interpretation: Decrease logic is fine, but result cannot be < 0.
          throw new Error(
            `Insufficient stock in this location. Available: ${existingEntry.quantity}, Requested: ${parseInt(quantity)}`,
          );
        }

        if (newQuantity <= 0) {
          await tx.partRackShelf.delete({
            where: { id: existingEntry.id },
          });
        } else {
          await tx.partRackShelf.update({
            where: { id: existingEntry.id },
            data: { quantity: newQuantity },
          });
        }
      } else {
        // Create new entry ONLY IF it's adding stock (since you can't have negative from nothing)
        if (qtyChange < 0) {
          throw new Error(
            `Insufficient stock in this location (None found). Requested: ${parseInt(quantity)}`,
          );
        }

        await tx.partRackShelf.create({
          data: {
            id: randomUUID(),
            partId: part_id,
            storeId: mStoreId,
            rackId: mRackId,
            shelfId: mShelfId,
            quantity: qtyChange,
          } as any,
        });
      }
      return createdMovement;
    });

    res.status(201).json({
      id: movement.id,
      part_id: movement.partId,
      part_no: (movement as any).Part.partNo,
      type: movement.type,
      quantity: movement.quantity,
      created_at: movement.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create stock location adjustment WITH creating a stock movement
// This ensures consistency between PartRackShelf and StockMovement tables
// Create stock location adjustment WITHOUT creating a stock movement
// This is used for "Manage Stock Location" form to organize stock without changing building totals
router.post("/update-location", async (req: Request, res: Response) => {
  try {
    const { part_id, store_id, rack_id, shelf_id, quantity, type } = req.body;

    if (!part_id || !quantity) {
      return res
        .status(400)
        .json({ error: "part_id and quantity are required" });
    }

    const qtyVal = parseInt(quantity);
    const qtyChange = type === "in" ? qtyVal : -qtyVal;

    const storeKey = store_id || null;
    const rackKey = rack_id ?? null;
    const shelfKey = shelf_id ?? null;

    const existingSum = await prisma.partRackShelf.aggregate({
      where: {
        partId: part_id,
        storeId: storeKey,
        rackId: rackKey,
        shelfId: shelfKey,
      },
      _sum: { quantity: true },
    });

    const totalCurrent = existingSum._sum.quantity || 0;
    if (totalCurrent + qtyChange < 0) {
      return res.status(400).json({
        error: `Insufficient stock in this location. Current Total: ${totalCurrent}`,
      });
    }

    // PartRackShelf is unique on (partId, storeId, rackId, shelfId): upsert one row per cell.
    const existingEntry = await prisma.partRackShelf.findFirst({
      where: {
        partId: part_id,
        storeId: storeKey,
        rackId: rackKey,
        shelfId: shelfKey,
      },
    });

    let record;
    if (existingEntry) {
      const updated = await prisma.partRackShelf.update({
        where: { id: existingEntry.id },
        data: { quantity: { increment: qtyChange } },
      });
      if (updated.quantity <= 0) {
        await prisma.partRackShelf.delete({ where: { id: existingEntry.id } });
        record = { ...updated, quantity: 0 };
      } else {
        record = updated;
      }
    } else {
      if (qtyChange < 0) {
        return res.status(400).json({
          error: `Insufficient stock in this location. Current Total: ${totalCurrent}`,
        });
      }
      record = await prisma.partRackShelf.create({
        data: {
          id: randomUUID(),
          partId: part_id,
          storeId: storeKey,
          rackId: rackKey,
          shelfId: shelfKey,
          quantity: qtyChange,
        } as any,
      });
    }

    res.status(201).json({
      message: "Location updated successfully (PartRackShelf only)",
      data: record,
    });
  } catch (error: any) {
    console.error(`[API] Error in update-location: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Transfer stock location (Move from A to B)
router.post("/transfer-location", async (req: Request, res: Response) => {
  try {
    const { part_id, quantity, source, target } = req.body;
    console.log(
      `[API] transfer-location called`,
      JSON.stringify(req.body, null, 2),
    );

    if (!part_id || !quantity || !target || !target.store_id) {
      return res.status(400).json({
        error: "Missing required fields (part_id, quantity, target store)",
      });
    }

    const qtyVal = parseInt(quantity);
    if (qtyVal <= 0) {
      return res.status(400).json({ error: "Quantity must be positive" });
    }

    // Transaction for Atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check Source Availability (if source is specified)
      // Source can be null/unallocated (store_id might be null)
      // But usually transfer is from a known location.
      // Assuming source object structure: { store_id: ..., rack_id: ..., shelf_id: ... }

      const sourceStoreId = source?.store_id || null;
      const sourceRackId = source?.rack_id || null;
      const sourceShelfId = source?.shelf_id || null;
      const sourceIsUnallocated =
        sourceStoreId === null &&
        sourceRackId === null &&
        sourceShelfId === null;

      // Calculate physical stock available in the exact source row, if any.
      const sourceStock = await tx.partRackShelf.aggregate({
        where: {
          partId: part_id,
          storeId: sourceStoreId,
          rackId: sourceRackId,
          shelfId: sourceShelfId,
        },
        _sum: { quantity: true },
      });

      const physicalSourceQty = sourceStock._sum.quantity || 0;
      let available = physicalSourceQty;

      // "Unallocated" in the UI can be a virtual row derived from movements,
      // so it may not exist in PartRackShelf at all.
      if (sourceIsUnallocated) {
        const [assignedStock, smIn, smOut] = await Promise.all([
          tx.partRackShelf.aggregate({
            where: { partId: part_id },
            _sum: { quantity: true },
          }),
          tx.stockMovement.aggregate({
            where: { partId: part_id, type: "in" },
            _sum: { quantity: true },
          }),
          tx.stockMovement.aggregate({
            where: { partId: part_id, type: "out" },
            _sum: { quantity: true },
          }),
        ]);

        const totalAssigned = assignedStock._sum.quantity || 0;
        const totalActualStock =
          (smIn._sum.quantity || 0) - (smOut._sum.quantity || 0);
        const derivedUnallocated = totalActualStock - totalAssigned;

        available = physicalSourceQty + Math.max(derivedUnallocated, 0);
      }

      if (available < qtyVal) {
        throw new Error(
          `Insufficient stock in source location. Available: ${available}, Requested: ${qtyVal}`,
        );
      }

      // 2. Decrement Source Stock (Update existing PartRackShelf or Find First)
      // Since unique constraint exists on (partId, storeId, rackId, shelfId), find the UNIQUE record.
      const sourceEntry = await tx.partRackShelf.findFirst({
        where: {
          partId: part_id,
          storeId: sourceStoreId,
          rackId: sourceRackId,
          shelfId: sourceShelfId,
        },
      });

      if (!sourceEntry && !sourceIsUnallocated) {
        // Should have been caught by aggregate check, but just in case
        throw new Error(`Source location entry not found.`);
      }

      // Only decrement a physical PartRackShelf source row when it exists.
      // For virtual unallocated stock there is no source row to decrement;
      // adding to the target location reduces the derived unallocated balance.
      if (sourceEntry) {
        const decrementQty = Math.min(sourceEntry.quantity, qtyVal);
        const updatedSource = await tx.partRackShelf.update({
          where: { id: sourceEntry.id },
          data: { quantity: { decrement: decrementQty } },
        });

        // If quantity becomes 0 or less, delete the entry to keep the location list clean
        if (updatedSource.quantity <= 0) {
          await tx.partRackShelf.delete({
            where: { id: sourceEntry.id },
          });
        }
      }

      // 3. Increment Target Stock (Upsert PartRackShelf)
      const targetStoreId = target.store_id || null;
      const targetRackId = target.rack_id || null;
      const targetShelfId = target.shelf_id || null;

      const targetEntry = await tx.partRackShelf.findFirst({
        where: {
          partId: part_id,
          storeId: targetStoreId,
          rackId: targetRackId,
          shelfId: targetShelfId,
        },
      });

      if (targetEntry) {
        await tx.partRackShelf.update({
          where: { id: targetEntry.id },
          data: { quantity: { increment: qtyVal } },
        });
      } else {
        await tx.partRackShelf.create({
          data: {
            id: randomUUID(),
            partId: part_id,
            storeId: targetStoreId,
            rackId: targetRackId,
            shelfId: targetShelfId,
            quantity: qtyVal,
          },
        });
      }

      // 4. Create Audit Trail (Stock Movements)
      // OUT from Source
      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          partId: part_id,
          type: "out",
          quantity: qtyVal,
          storeId: sourceStoreId,
          rackId: sourceRackId,
          shelfId: sourceShelfId,
          notes: `Transfer to ${target.store_id ? "Store..." : "Location"} (Ref: Transfer)`,
          createdAt: new Date(),
        },
      });

      // IN to Target
      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          partId: part_id,
          type: "in",
          quantity: qtyVal,
          storeId: targetStoreId,
          rackId: targetRackId,
          shelfId: targetShelfId,
          notes: `Transfer from ${sourceStoreId ? "Store..." : "Location"} (Ref: Transfer)`,
          createdAt: new Date(),
        },
      });

      return { success: true };
    });

    res.status(201).json({
      message: "Stock transferred successfully",
      data: result,
    });
  } catch (error: any) {
    console.error(`[API] Error in transfer-location: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Update stock movement
router.patch("/movements/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { store_id, rack_id, shelf_id } = req.body;
    console.log(`[DEBUG] PATCH /movements/${id}`, {
      store_id,
      rack_id,
      shelf_id,
    });

    const movement = await prisma.stockMovement.update({
      where: { id },
      data: {
        storeId:
          store_id !== undefined
            ? store_id === "" || store_id === null
              ? null
              : store_id
            : undefined,
        rackId:
          rack_id !== undefined
            ? rack_id === "" || rack_id === null
              ? null
              : rack_id
            : undefined,
        shelfId:
          shelf_id !== undefined
            ? shelf_id === "" || shelf_id === null
              ? null
              : shelf_id
            : undefined,
      },
      include: {
        Part: true,
        Store: true,
        Rack: true,
        Shelf: true,
      },
    });

    res.json({
      message: "Stock movement updated successfully",
      data: movement,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get stock balances by rack and shelf
router.get("/rack-shelf-balances", async (req: Request, res: Response) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      where: {
        OR: [{ rackId: { not: null } }, { shelfId: { not: null } }],
      },
      include: {
        Part: {
          include: {
            MasterPart: true,
          },
        },
      },
    });

    const stockMap: Record<
      string,
      {
        itemsCount: number;
        remainingQuantity: number;
        itemsMap: Record<string, any>;
      }
    > = {};

    movements.forEach((m) => {
      const quantity = m.type === "in" ? m.quantity : -m.quantity;
      const partId = m.partId;
      const partNo =
        (m as any).Part.MasterPart?.masterPartNo || (m as any).Part.partNo;
      const description = (m as any).Part.description || "";

      const processLocation = (type: "rack" | "shelf", id: string | null) => {
        if (!id) return;
        const key = `${type}_${id}`;
        if (!stockMap[key]) {
          stockMap[key] = { itemsCount: 0, remainingQuantity: 0, itemsMap: {} };
        }

        if (!stockMap[key].itemsMap[partId]) {
          stockMap[key].itemsMap[partId] = { partNo, description, quantity: 0 };
        }

        stockMap[key].itemsMap[partId].quantity += quantity;
        stockMap[key].remainingQuantity += quantity;
      };

      processLocation("rack", m.rackId);
      processLocation("shelf", m.shelfId);
    });

    const result: Record<string, any> = {};
    Object.keys(stockMap).forEach((key) => {
      const items = Object.values(stockMap[key].itemsMap).filter(
        (item: any) => item.quantity > 0,
      );

      if (items.length > 0) {
        result[key] = {
          itemsCount: items.length,
          remainingQuantity: items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          items,
        };
      }
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// New API for precise cost lookup (matches Pricing page logic)
router.get("/cost-lookup/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    console.log(`[API] Cost Lookup hit for ${partId}`);

    // Use queryRaw to replicate parts.ts logic exactly including joins
    // Cast result to any[] to avoid TS issues
    const result = (await prisma.$queryRaw`
      SELECT 
        p.id, p."avgCost", p.cost, p."purchasePrice", p."priceA",
        COALESCE(st.stock, 0) as current_stock,
        COALESCE(rs.reserved, 0) as reserved_stock
      FROM "Part" p
      LEFT JOIN (
          SELECT "partId", 
            SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as stock
          FROM "StockMovement"
          GROUP BY "partId"
      ) st ON p.id = st."partId"
      LEFT JOIN (
          SELECT "partId", SUM(quantity) as reserved
          FROM "StockReservation"
          WHERE status = 'reserved'
          GROUP BY "partId"
      ) rs ON p.id = rs."partId"
      WHERE p.id = ${partId}
    `) as any[];

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Part not found" });
    }

    const row = result[0];

    // Also try to get latest adjustment cost if everything else is 0
    // This is the CRITICAL fallback that Pricing page uses (via latest_adj_cost join)
    let finalAvgCost = row.avgCost || row.cost || row.purchasePrice || 0;

    if (finalAvgCost === 0) {
      const lastAdjustment = await prisma.adjustmentItem.findFirst({
        where: {
          partId: partId,
          Adjustment: { status: "approved", deletedAt: null },
          cost: { not: null, gt: 0 },
        },
        orderBy: [
          { Adjustment: { date: "desc" } },
          { Adjustment: { createdAt: "desc" } },
        ],
        select: { cost: true },
      });
      if (lastAdjustment?.cost) {
        finalAvgCost = lastAdjustment.cost;
      }
    }

    const currentStock = parseInt(row.current_stock) || 0;
    const reservedStock = parseInt(row.reserved_stock) || 0;

    res.json({
      part_id: row.id,
      current_stock: currentStock,
      reserved_stock: reservedStock,
      available_stock: Math.max(0, currentStock - reservedStock),
      avg_cost: finalAvgCost,
      cost: row.cost || 0,
      purchase_price: row.purchasePrice || 0,
      price_a: row.priceA || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get stock balance for a part
router.get("/balance/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;

    const movements = await prisma.stockMovement.findMany({
      where: { partId },
      select: {
        type: true,
        quantity: true,
        referenceType: true,
        rackId: true,
        shelfId: true,
      },
    });

    const reservedStock = await prisma.stockReservation.aggregate({
      where: {
        partId,
        status: "reserved",
        OR: [
          { invoiceId: null },
          { SalesInvoice: { is: { status: { not: "cancelled" } } } },
        ],
      },
      _sum: {
        quantity: true,
      },
    });

    const { stockIn, stockOut } = stockInOutTotals(movements);
    const currentStock = Math.max(0, netStockFromMovements(movements));
    const reservedQty = reservedStock._sum.quantity || 0;
    const availableStock = Math.max(0, currentStock - reservedQty);
    const unassignedStock = Math.max(
      0,
      unassignedStockFromMovements(movements),
    );

    const part = await prisma.part.findUnique({
      where: { id: partId },
      include: {
        Brand: true,
        Category: true,
      },
    });

    // Use Raw Query to get cost data to bypass any Prisma model/caching issues
    // This matches the logic that works in parts.ts
    const partCosts: any[] = await prisma.$queryRaw`
      SELECT cost, "purchasePrice", "avgCost", "priceA" 
      FROM "Part" 
      WHERE id = ${partId}
    `;

    const rawPartData = partCosts[0] || {};
    const dbAvgCost = rawPartData.avgCost || 0;
    const dbCost = rawPartData.cost || 0;
    const dbPurchasePrice = rawPartData.purchasePrice || 0;
    // const dbPriceA = rawPartData.priceA || 0; // Available if needed

    // Get latest adjustment cost (fallback logic same as Parts API)
    const lastAdjustment = await prisma.adjustmentItem.findFirst({
      where: {
        partId: partId,
        Adjustment: {
          status: "approved",
          deletedAt: null,
        },
        cost: { not: null, gt: 0 },
      },
      orderBy: [
        { Adjustment: { date: "desc" } },
        { Adjustment: { createdAt: "desc" } },
      ],
      select: { cost: true },
    });

    res.json({
      part_id: partId,
      part_no: part?.partNo,
      part_description: part?.description,
      brand: (part as any).Brand?.name || null,
      category: (part as any).Category?.name || null,
      stock_in: stockIn,
      stock_out: stockOut,
      current_stock: currentStock,
      unassigned_stock: unassignedStock,
      reserved_stock: reservedQty,
      available_stock: availableStock,
      reorder_level: part?.reorderLevel || 0,
      is_low_stock: part?.reorderLevel
        ? currentStock <= part.reorderLevel
        : false,
      is_out_of_stock: currentStock <= 0,
      cost: dbCost || part?.cost || 0,
      avg_cost:
        dbAvgCost || dbCost || dbPurchasePrice || lastAdjustment?.cost || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DEDICATED API FOR CURRENT STOCK PAGE
// Optimized to link Part, StockMovement (for totals), and PartRackShelf (for locations)
router.get("/part-rack-shelf", async (req: Request, res: Response) => {
  try {
    const {
      search,
      category_id,
      store_id,
      stock_as_of_date,
      brand_name,
      model_name,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 1. Build Query for Parts
    let whereClause = "WHERE p.status = 'active'";
    let params: any[] = [];
    let paramIdx = 1;
    let stockAsOfDate: Date | null = null;

    if (stock_as_of_date) {
      const stockDateStr = String(stock_as_of_date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(stockDateStr)) {
        stockAsOfDate = new Date(`${stockDateStr}T23:59:59.999Z`);
      } else {
        const parsed = new Date(stockDateStr);
        if (!isNaN(parsed.getTime())) {
          stockAsOfDate = parsed;
        }
      }
    }

    if (category_id) {
      whereClause += ` AND p."categoryId" = $${paramIdx++}`;
      params.push(category_id);
    }

    if (brand_name && String(brand_name).trim() !== "") {
      whereClause += ` AND b.name = $${paramIdx++}`;
      params.push(String(brand_name).trim());
    }

    if (model_name && String(model_name).trim() !== "") {
      whereClause += ` AND EXISTS (SELECT 1 FROM "Model" m WHERE m."partId" = p.id AND LOWER(m.name) = LOWER($${paramIdx++}))`;
      params.push(String(model_name).trim());
    }

    if (search) {
      whereClause += ` AND (p."partNo" ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx} OR b.name ILIKE $${paramIdx} OR mp."masterPartNo" ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const hasActiveFilter = !!(
      (search && String(search).trim()) ||
      category_id ||
      (brand_name && String(brand_name).trim()) ||
      (model_name && String(model_name).trim()) ||
      store_id ||
      stock_as_of_date ||
      req.query.sort_stock_first === "true" ||
      req.query.sort_stock_first === "1"
    );

    const orderByClause = hasActiveFilter
      ? `ORDER BY COALESCE(sm_agg.current_stock, 0) DESC, p."partNo" ASC`
      : `ORDER BY p."partNo" ASC`;

    const stockDateFilterClause = stockAsOfDate
      ? `WHERE "createdAt" <= '${stockAsOfDate.toISOString()}'`
      : "";

    const sql = `
      SELECT 
        p.id as part_id,
        p."partNo" as part_no,
        mp."masterPartNo" as master_part_no,
        p.description,
        b.name as brand,
        c.name as category,
        -- Official Stock from Movements (Picking only, no adding/effecting)
        COALESCE(sm_agg.current_stock, 0) as current_stock,
        -- Aggregated Locations from PartRackShelf
        COALESCE(loc.racks, '-') as rack,
        COALESCE(loc.shelves, '-') as shelf,
        COALESCE(loc.stores, 'Unallocated') as store
      FROM "Part" p
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      LEFT JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN (
        SELECT 
          "partId",
          SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as current_stock
        FROM "StockMovement"
        ${stockDateFilterClause}
        GROUP BY "partId"
      ) sm_agg ON sm_agg."partId" = p.id
      LEFT JOIN LATERAL (
        SELECT 
          STRING_AGG(DISTINCT r."codeNo", ', ') as racks,
          STRING_AGG(DISTINCT sh."shelfNo", ', ') as shelves,
          STRING_AGG(DISTINCT s."name", ', ') as stores
        FROM "PartRackShelf" prs
        LEFT JOIN "Rack" r ON prs."rackId" = r.id
        LEFT JOIN "Shelf" sh ON prs."shelfId" = sh.id
        LEFT JOIN "Store" s ON prs."storeId" = s.id
        WHERE prs."partId" = p.id
        GROUP BY prs."partId"
      ) loc ON true
      ${whereClause}
      ${orderByClause}
      LIMIT ${limitNum} OFFSET ${skip}
    `;

    const countSql = `
      SELECT COUNT(*) as total 
      FROM "Part" p 
      LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
      LEFT JOIN "Brand" b ON p."brandId" = b.id
      ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params),
    ]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      data: result.rows.map((row: any) => ({
        ...row,
        current_stock: parseInt(row.current_stock) || 0,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error(`[API] Error in part-rack-shelf: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get all stock balances (Main Balance API for general use)
router.get("/balances", async (req: Request, res: Response) => {
  try {
    const {
      search,
      category_id,
      store_id,
      part_id,
      part_ids,
      low_stock,
      out_of_stock,
      in_stock,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { status: "active" };
    if (category_id) {
      where.categoryId = category_id as string;
    }

    if (part_id) {
      where.id = part_id as string;
    } else if (part_ids) {
      const ids = Array.isArray(part_ids)
        ? (part_ids as string[])
        : (part_ids as string).split(",");
      where.id = { in: ids };
    }

    // Use optimized query for large datasets
    const useFastQuery = limitNum > 1000;

    if (useFastQuery) {
      // Fast path: Use raw SQL for better performance with large result sets
      let conditions = ["p.status = 'active'"];
      let params: any[] = [];
      let paramIdx = 1;

      if (category_id) {
        conditions.push(`p."categoryId" = $${paramIdx++}`);
        params.push(category_id);
      }
      if (part_id) {
        conditions.push(`p.id = $${paramIdx++}`);
        params.push(part_id);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `
        SELECT 
          p.id as part_id,
          p."partNo" as part_no,
          mp."masterPartNo" as master_part_no,
          p.description,
          b.name as brand,
          c.name as category,
          p."reorderLevel" as reorder_level,
          p.cost,
          p."priceA",
          COALESCE(sm_agg.stock_in, 0) as stock_in,
          COALESCE(sm_agg.stock_out, 0) as stock_out,
          COALESCE(sm_agg.stock_in, 0) - COALESCE(sm_agg.stock_out, 0) as current_stock,
          loc.racks as rack,
          loc.shelves as shelf,
          loc.stores as store
        FROM "Part" p
        LEFT JOIN "MasterPart" mp ON p."masterPartId" = mp.id
        LEFT JOIN "Brand" b ON p."brandId" = b.id
        LEFT JOIN "Category" c ON p."categoryId" = c.id
        -- Aggregated Stock from Movements
        LEFT JOIN (
          SELECT 
            "partId",
            SUM(CASE WHEN ("referenceType" IS NULL OR "referenceType" != 'stock_reservation') AND type = 'in' THEN quantity ELSE 0 END) as stock_in,
            SUM(CASE WHEN ("referenceType" IS NULL OR "referenceType" != 'stock_reservation') AND type != 'in' THEN quantity ELSE 0 END) as stock_out,
            SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as current_stock
          FROM "StockMovement"
          ${store_id ? `WHERE "storeId" = '${store_id}'` : ""}
          GROUP BY "partId"
        ) sm_agg ON sm_agg."partId" = p.id
        -- Aggregated Locations from PartRackShelf
        LEFT JOIN LATERAL (
          SELECT 
            STRING_AGG(DISTINCT r."codeNo", ', ') as racks,
            STRING_AGG(DISTINCT sh."shelfNo", ', ') as shelves,
            STRING_AGG(DISTINCT s."name", ', ') as stores
          FROM "PartRackShelf" prs
          LEFT JOIN "Rack" r ON prs."rackId" = r.id
          LEFT JOIN "Shelf" sh ON prs."shelfId" = sh.id
          LEFT JOIN "Store" s ON prs."storeId" = s.id
          WHERE prs."partId" = p.id
          GROUP BY prs."partId"
        ) loc ON true
        ${whereClause}
        ORDER BY p."partNo" ASC
        LIMIT ${limitNum} OFFSET ${skip}
      `;

      const countSql = `
        SELECT COUNT(*) as total 
        FROM "Part" p 
        LEFT JOIN "Brand" b ON p."brandId" = b.id
        ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        query(sql, params),
        query(countSql, params),
      ]);

      const total = parseInt(countResult.rows[0].total);

      const balances = result.rows.map((row: any) => ({
        part_id: row.part_id,
        part_no: row.part_no,
        master_part_no: row.master_part_no,
        description: row.description,
        brand: row.brand,
        category: row.category,
        location:
          row.rack && row.shelf
            ? `${row.rack}/${row.shelf}`
            : row.rack || row.shelf || null,
        rack: row.rack,
        shelf: row.shelf,
        store: row.store,
        stock_in: parseInt(row.stock_in) || 0,
        stock_out: parseInt(row.stock_out) || 0,
        current_stock: Math.max(0, parseInt(row.current_stock) || 0),
        reserved_quantity: 0, // This will be calculated later if needed, or fetched separately
        available_quantity: Math.max(0, parseInt(row.current_stock) || 0),
        reorder_level: row.reorder_level || 0,
        is_low_stock: row.reorder_level
          ? (parseInt(row.current_stock) || 0) <= row.reorder_level
          : false,
        is_out_of_stock: (parseInt(row.current_stock) || 0) <= 0,
        cost: row.cost,
        price: row.priceA || null,
        value: (row.cost || 0) * Math.max(0, parseInt(row.current_stock) || 0),
      }));

      return res.json({
        data: balances,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }

    // Slow path: Use Prisma for small datasets (original code)
    const parts = await prisma.part.findMany({
      where,
      include: {
        Brand: true,
        Category: true,
        MasterPart: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: part_id || part_ids ? 0 : skip,
      take: part_id || part_ids ? 1000 : limitNum,
    });

    // Get stock movements for these parts
    const partIds = parts.map((p) => p.id);
    const movements = await prisma.stockMovement.findMany({
      where: {
        partId: { in: partIds },
        storeId: store_id ? (store_id as string) : undefined,
      },
      select: {
        partId: true,
        quantity: true,
        type: true,
      },
    });

    // Group movements by part
    const stockByPart: Record<string, { in: number; out: number }> = {};
    for (const movement of movements) {
      if (!stockByPart[movement.partId]) {
        stockByPart[movement.partId] = { in: 0, out: 0 };
      }
      if (movement.type === "in") {
        stockByPart[movement.partId].in += movement.quantity;
      } else {
        stockByPart[movement.partId].out += movement.quantity;
      }
    }

    // Get official Location Info from PartRackShelf
    const locationRecords = await prisma.partRackShelf.findMany({
      where: { partId: { in: partIds } },
      include: { Rack: true, Shelf: true, Store: true },
    });

    const locationByPart: Record<
      string,
      { racks: Set<string>; shelves: Set<string>; stores: Set<string> }
    > = {};
    for (const record of locationRecords) {
      if (!locationByPart[record.partId]) {
        locationByPart[record.partId] = {
          racks: new Set(),
          shelves: new Set(),
          stores: new Set(),
        };
      }
      if (record.Rack?.codeNo)
        locationByPart[record.partId].racks.add(record.Rack.codeNo);
      if (record.Shelf?.shelfNo)
        locationByPart[record.partId].shelves.add(record.Shelf.shelfNo);
      if (record.Store?.name)
        locationByPart[record.partId].stores.add(record.Store.name);
    }

    // Get reserved quantities
    const stockReservations = await prisma.stockReservation.findMany({
      where: {
        partId: { in: partIds },
        status: "reserved",
        OR: [
          { invoiceId: null },
          { SalesInvoice: { is: { status: { not: "cancelled" } } } },
        ],
      },
      select: {
        partId: true,
        quantity: true,
      },
    });

    const reservedByPart: Record<string, number> = {};
    for (const res of stockReservations) {
      reservedByPart[res.partId] =
        (reservedByPart[res.partId] || 0) + res.quantity;
    }

    const balances = parts.map((part) => {
      const stock = stockByPart[part.id] || { in: 0, out: 0 };
      const locations = locationByPart[part.id] || {
        racks: new Set(),
        shelves: new Set(),
        stores: new Set(),
      };

      const currentStock = Math.max(0, stock.in - stock.out);
      const reservedQty = reservedByPart[part.id] || 0;
      const availableQty = Math.max(0, currentStock - reservedQty);

      const rack = Array.from(locations.racks).join(", ") || null;
      const shelf = Array.from(locations.shelves).join(", ") || null;
      const store = Array.from(locations.stores).join(", ") || null;

      let location = null;
      if (rack && shelf) {
        location = `${rack}/${shelf}`;
      } else {
        location = rack || shelf || null;
      }

      return {
        part_id: part.id,
        part_no: part.partNo,
        master_part_no: (part as any).masterPart?.masterPartNo || null, // Fixed casing
        description: part.description,
        brand: (part as any).Brand?.name || null,
        category: (part as any).Category?.name || null,
        location: location,
        rack: rack,
        shelf: shelf,
        store: store,
        stock_in: stock.in,
        stock_out: stock.out,
        current_stock: currentStock,
        reserved_quantity: reservedQty,
        available_quantity: availableQty,
        reorder_level: part.reorderLevel,
        is_low_stock: part.reorderLevel
          ? currentStock <= part.reorderLevel
          : false,
        is_out_of_stock: currentStock <= 0,
        cost: part.cost,
        price: part.priceA || null,
        value: (part.cost || 0) * currentStock,
      };
    });

    // Apply filters
    let filteredBalances = balances;
    if (String(in_stock ?? "").toLowerCase() === "true") {
      filteredBalances = filteredBalances.filter((b) => b.current_stock > 0);
    }
    if (low_stock === "true") {
      filteredBalances = filteredBalances.filter(
        (b) => b.is_low_stock && !b.is_out_of_stock,
      );
    }
    if (out_of_stock === "true") {
      filteredBalances = filteredBalances.filter((b) => b.is_out_of_stock);
    }
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filteredBalances = filteredBalances.filter(
        (b) =>
          b.part_no.toLowerCase().includes(searchLower) ||
          b.description?.toLowerCase().includes(searchLower) ||
          b.brand?.toLowerCase().includes(searchLower),
      );
    }

    const totalCount = await prisma.part.count({ where });

    res.json({
      data: filteredBalances,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error(`[API] Error in balances: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// End of balances

// New API for precise cost lookup (matches Pricing page logic)
router.get("/cost-lookup/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    console.log(`[API] Cost Lookup hit for ${partId}`);

    // Use queryRaw to replicate parts.ts logic exactly including joins
    // Cast result to any[] to avoid TS issues
    const result = (await prisma.$queryRaw`
      SELECT 
        p.id, p."avgCost", p.cost, p."purchasePrice", p."priceA",
        COALESCE(st.stock, 0) as current_stock,
        COALESCE(rs.reserved, 0) as reserved_stock
      FROM "Part" p
      LEFT JOIN (
          SELECT "partId", 
            SUM(CASE WHEN "referenceType" IS NULL OR "referenceType" != 'stock_reservation' THEN (CASE WHEN type = 'in' THEN quantity ELSE -quantity END) ELSE 0 END) as stock
          FROM "StockMovement"
          GROUP BY "partId"
      ) st ON p.id = st."partId"
      LEFT JOIN (
          SELECT "partId", SUM(quantity) as reserved
          FROM "StockReservation"
          WHERE status = 'reserved'
          GROUP BY "partId"
      ) rs ON p.id = rs."partId"
      WHERE p.id = ${partId}
    `) as any[];

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Part not found" });
    }

    const row = result[0];

    // Also try to get latest adjustment cost if everything else is 0
    // This is the CRITICAL fallback that Pricing page uses (via latest_adj_cost join)
    let finalAvgCost = row.avgCost || row.cost || row.purchasePrice || 0;

    if (finalAvgCost === 0) {
      const lastAdjustment = await prisma.adjustmentItem.findFirst({
        where: {
          partId: partId,
          Adjustment: { status: "approved", deletedAt: null },
          cost: { not: null, gt: 0 },
        },
        orderBy: [
          { Adjustment: { date: "desc" } },
          { Adjustment: { createdAt: "desc" } },
        ],
        select: { cost: true },
      });
      if (lastAdjustment?.cost) {
        finalAvgCost = lastAdjustment.cost;
      }
    }

    const currentStock = parseInt(row.current_stock) || 0;
    const reservedStock = parseInt(row.reserved_stock) || 0;

    res.json({
      part_id: row.id,
      current_stock: currentStock,
      reserved_stock: reservedStock,
      available_stock: Math.max(0, currentStock - reservedStock),
      avg_cost: finalAvgCost,
      cost: row.cost || 0,
      purchase_price: row.purchasePrice || 0,
      price_a: row.priceA || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get stock movement analysis
router.get("/stock-analysis", async (req: Request, res: Response) => {
  try {
    const {
      fast_moving_days = "30",
      slow_moving_days = "90",
      dead_stock_days = "180",
      analysis_period = "6",
      search,
      category,
      classification,
    } = req.query;

    const fastMovingDays = parseInt(fast_moving_days as string);
    const slowMovingDays = parseInt(slow_moving_days as string);
    const deadStockDays = parseInt(dead_stock_days as string);
    const analysisPeriodMonths = parseInt(analysis_period as string);

    // Calculate analysis period start date
    const analysisStartDate = new Date();
    analysisStartDate.setMonth(
      analysisStartDate.getMonth() - analysisPeriodMonths,
    );

    // Get all active parts
    const where: any = { status: "active" };
    if (category && category !== "all" && category !== "All Categories") {
      const categoryRecord = await prisma.category.findFirst({
        where: { name: { contains: category as string } },
      });
      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    const parts = await prisma.part.findMany({
      where,
      include: {
        Brand: true,
        Category: true,
      },
    });

    // Get all stock movements for these parts
    const partIds = parts.map((p) => p.id);
    const allMovements = await prisma.stockMovement.findMany({
      where: {
        partId: { in: partIds },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Group movements by part
    const movementsByPart: Record<string, typeof allMovements> = {};
    for (const movement of allMovements) {
      if (!movementsByPart[movement.partId]) {
        movementsByPart[movement.partId] = [];
      }
      movementsByPart[movement.partId].push(movement);
    }

    // Calculate stock levels and analysis metrics
    const stockByPart: Record<
      string,
      { in: number; out: number; lastMovementDate: Date | null }
    > = {};
    for (const part of parts) {
      const movements = movementsByPart[part.id] || [];
      stockByPart[part.id] = {
        in: 0,
        out: 0,
        lastMovementDate: movements.length > 0 ? movements[0].createdAt : null,
      };
      for (const movement of movements) {
        if (movement.type === "in") {
          stockByPart[part.id].in += movement.quantity;
        } else {
          stockByPart[part.id].out += movement.quantity;
        }
      }
    }

    // Calculate turnover (movements in analysis period)
    const turnoverByPart: Record<string, number> = {};
    for (const part of parts) {
      const movements = movementsByPart[part.id] || [];
      const periodMovements = movements.filter(
        (m) => m.createdAt >= analysisStartDate,
      );
      // Calculate total quantity moved (both in and out)
      const totalMoved = periodMovements.reduce(
        (sum, m) => sum + m.quantity,
        0,
      );
      // Turnover = total moved / analysis period in months
      turnoverByPart[part.id] = totalMoved / analysisPeriodMonths;
    }

    // Build analysis results
    const results = [];
    const now = new Date();

    for (const part of parts) {
      const stock = stockByPart[part.id] || {
        in: 0,
        out: 0,
        lastMovementDate: null,
      };
      const currentStock = stock.in - stock.out;
      const value = (part.cost || 0) * currentStock;

      // Calculate days idle
      let daysIdle = 0;
      if (stock.lastMovementDate) {
        const diffTime = now.getTime() - stock.lastMovementDate.getTime();
        daysIdle = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      } else {
        // If no movement, consider it very old (e.g., 365 days)
        daysIdle = 365;
      }

      const turnover = turnoverByPart[part.id] || 0;

      // Classify item
      let itemClassification: "Fast" | "Normal" | "Slow" | "Dead" = "Normal";
      if (daysIdle >= deadStockDays || turnover === 0) {
        itemClassification = "Dead";
      } else if (daysIdle >= slowMovingDays) {
        itemClassification = "Slow";
      } else if (daysIdle <= fastMovingDays && turnover >= 5) {
        itemClassification = "Fast";
      }

      // Apply classification filter
      if (
        classification &&
        classification !== "All" &&
        classification !== "all"
      ) {
        if (itemClassification !== classification) {
          continue;
        }
      }

      // Apply search filter
      if (search) {
        const searchLower = (search as string).toLowerCase();
        const matchesSearch =
          part.partNo.toLowerCase().includes(searchLower) ||
          (part.description || "").toLowerCase().includes(searchLower) ||
          ((part as any).Category?.name || "")
            .toLowerCase()
            .includes(searchLower);
        if (!matchesSearch) {
          continue;
        }
      }

      results.push({
        id: part.id,
        partNo: part.partNo,
        description: part.description || "",
        category: (part as any).Category?.name || "Uncategorized",
        quantity: currentStock,
        value: value,
        daysIdle: daysIdle,
        turnover: Math.round(turnover * 10) / 10, // Round to 1 decimal
        classification: itemClassification,
      });
    }

    // Sort by part number
    results.sort((a, b) => a.partNo.localeCompare(b.partNo));

    res.json({
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get stock balance & valuation with store and location details
router.get("/stock-balance-valuation", async (req: Request, res: Response) => {
  try {
    const { search, category, store, page = "1", limit = "1000" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get all active parts
    const where: any = { status: "active" };
    if (category && category !== "All Categories") {
      const categoryRecord = await prisma.category.findFirst({
        where: { name: { contains: category as string } },
      });
      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    const parts = await prisma.part.findMany({
      where,
      include: {
        Brand: true,
        Category: true,
      },
    });

    // Get all stock movements with store, rack, and shelf information
    const partIds = parts.map((p) => p.id);
    const movements = await prisma.stockMovement.findMany({
      where: {
        partId: { in: partIds },
      },
      include: {
        Store: true,
        Rack: true,
        Shelf: true,
      },
    });

    // Group movements by part, store, rack, and shelf for accurate location-based tracking
    // Key format: partId_storeId_rackId_shelfId
    const stockByLocation: Record<
      string,
      {
        in: number;
        out: number;
        store: any;
        rack: any;
        shelf: any;
      }
    > = {};

    for (const movement of movements) {
      // Use consistent keys for null values
      const storeId = movement.storeId || "no-store";
      const rackId = movement.rackId || "no-rack";
      const shelfId = movement.shelfId || "no-shelf";
      const key = `${movement.partId}_${storeId}_${rackId}_${shelfId}`;

      if (!stockByLocation[key]) {
        stockByLocation[key] = {
          in: 0,
          out: 0,
          store: (movement as any).Store,
          rack: (movement as any).Rack,
          shelf: (movement as any).Shelf,
        };
      }

      // Accumulate quantities correctly
      if (movement.type === "in") {
        stockByLocation[key].in += movement.quantity;
      } else if (movement.type === "out") {
        stockByLocation[key].out += movement.quantity;
      }
    }

    // Build result array - one row per part-store-location combination
    const result: any[] = [];
    let itemId = 1;

    for (const part of parts) {
      // Find all locations for this part
      const partLocations = Object.entries(stockByLocation).filter(([key]) =>
        key.startsWith(`${part.id}_`),
      );

      if (partLocations.length === 0) {
        // If no movements, include the part with zero stock (only if matches search)
        const matchesSearch =
          !search ||
          part.partNo
            .toLowerCase()
            .includes((search as string).toLowerCase()) ||
          (part.description || "")
            .toLowerCase()
            .includes((search as string).toLowerCase());

        if (matchesSearch) {
          result.push({
            id: itemId++,
            partNo: part.partNo,
            description: part.description || "",
            category: (part as any).Category?.name || "Uncategorized",
            uom: part.uom || "pcs",
            quantity: 0,
            cost: part.cost || 0,
            value: 0,
            store: "No Store",
            location: "-",
            rack: "-",
            shelf: "-",
          });
        }
      } else {
        // Create an entry for each location
        for (const [key, stockData] of partLocations) {
          const quantity = stockData.in - stockData.out;
          const storeName = stockData.store?.name || "No Store";

          // Apply store filter
          if (store && store !== "All Stores" && storeName !== store) {
            continue;
          }

          // Build location string
          const rackCode = stockData.rack?.codeNo || "";
          const shelfNo = stockData.shelf?.shelfNo || "";
          const location =
            rackCode && shelfNo
              ? `${rackCode}/${shelfNo}`
              : rackCode || shelfNo || "-";

          // Include all items (including zero or negative quantity for accurate reporting)
          // Negative quantities indicate data issues but should be shown
          result.push({
            id: itemId++,
            partNo: part.partNo,
            description: part.description || "",
            category: (part as any).Category?.name || "Uncategorized",
            uom: part.uom || "pcs",
            quantity: quantity,
            cost: part.cost || 0,
            value: (part.cost || 0) * Math.max(0, quantity), // Value should not be negative
            store: storeName,
            location: location,
            rack: rackCode || "-",
            shelf: shelfNo || "-",
          });
        }
      }
    }

    // Apply search filter
    let filteredResult = result;
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filteredResult = filteredResult.filter(
        (item) =>
          item.partNo.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower),
      );
    }

    // Apply category filter (already done in query, but double-check)
    if (category && category !== "All Categories") {
      filteredResult = filteredResult.filter((item) =>
        item.category
          .toLowerCase()
          .includes((category as string).toLowerCase()),
      );
    }

    // Sort by part number
    filteredResult.sort((a, b) => a.partNo.localeCompare(b.partNo));

    // Pagination
    const total = filteredResult.length;
    const paginatedResult = filteredResult.slice(skip, skip + limitNum);

    res.json({
      data: paginatedResult,
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

// Get transfers
router.get("/transfers", async (req: Request, res: Response) => {
  try {
    const { status, from_date, to_date, page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) {
      where.status = status as string;
    }
    if (from_date || to_date) {
      where.date = {};
      if (from_date) {
        where.date.gte = new Date(from_date as string);
      }
      if (to_date) {
        where.date.lte = new Date(to_date as string);
      }
    }

    const [transfers, total] = await Promise.all([
      prisma.transfer.findMany({
        where,
        include: {
          Store_Transfer_fromStoreIdToStore: true,
          Store_Transfer_toStoreIdToStore: true,
          TransferItem: {
            include: {
              Part: {
                include: {
                  Brand: true,
                },
              },
            },
          },
        },
        orderBy: {
          date: "desc",
        },
        skip,
        take: limitNum,
      }),
      prisma.transfer.count({ where }),
    ]);

    res.json({
      data: transfers.map((t) => ({
        id: t.id,
        transfer_number: t.transferNumber,
        date: t.date,
        status: t.status,
        notes: t.notes,
        total_qty: t.totalQty,
        from_store: (t as any).Store_Transfer_fromStoreIdToStore?.name || null,
        to_store: (t as any).Store_Transfer_toStoreIdToStore?.name || null,
        items_count: (t as any).TransferItem.length,
        created_at: t.createdAt,
      })),
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

// Create transfer
router.post("/transfers", async (req: Request, res: Response) => {
  try {
    const { transfer_number, date, from_store_id, to_store_id, notes, items } =
      req.body;

    if (!transfer_number || !date || !items || items.length === 0) {
      return res
        .status(400)
        .json({ error: "transfer_number, date, and items are required" });
    }

    const totalQty = items.reduce(
      (sum: number, item: any) => sum + (item.quantity || 0),
      0,
    );

    const transfer = await prisma.transfer.create({
      data: {
        id: crypto.randomUUID(),
        transferNumber: transfer_number,
        date: new Date(date),
        fromStoreId: from_store_id || null,
        toStoreId: to_store_id || null,
        notes: notes || null,
        totalQty: totalQty,
        status: "Draft",
        updatedAt: new Date(),
        TransferItem: {
          create: items.map((item: any) => ({
            id: crypto.randomUUID(),
            partId: item.part_id,
            fromStoreId: item.from_store_id || null,
            fromRackId: item.from_rack_id || null,
            fromShelfId: item.from_shelf_id || null,
            toStoreId: item.to_store_id || null,
            toRackId: item.to_rack_id || null,
            toShelfId: item.to_shelf_id || null,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        TransferItem: {
          include: {
            Part: true,
          },
        },
      },
    } as any);

    res.status(201).json({
      id: transfer.id,
      transfer_number: transfer.transferNumber,
      date: transfer.date,
      status: transfer.status,
      total_qty: transfer.totalQty,
      items_count: (transfer as any).TransferItem.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single transfer
router.get("/transfers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: {
        Store_Transfer_fromStoreIdToStore: true,
        Store_Transfer_toStoreIdToStore: true,
        TransferItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
            Store_TransferItem_fromStoreIdToStore: true,
            Rack_TransferItem_fromRackIdToRack: true,
            Shelf_TransferItem_fromShelfIdToShelf: true,
            Store_TransferItem_toStoreIdToStore: true,
            Rack_TransferItem_toRackIdToRack: true,
            Shelf_TransferItem_toShelfIdToShelf: true,
          },
        },
      },
    });

    if (!transfer) {
      return res.status(404).json({ error: "Transfer not found" });
    }

    res.json({
      id: transfer.id,
      transfer_number: transfer.transferNumber,
      date: transfer.date,
      status: transfer.status,
      notes: transfer.notes,
      total_qty: transfer.totalQty,
      from_store_id: transfer.fromStoreId,
      from_store:
        (transfer as any).Store_Transfer_fromStoreIdToStore?.name || null,
      to_store_id: transfer.toStoreId,
      to_store: (transfer as any).Store_Transfer_toStoreIdToStore?.name || null,
      items: (transfer as any).TransferItem.map((item: any) => ({
        id: item.id,
        part_id: item.partId,
        part_no: item.Part.partNo,
        part_description: item.Part.description,
        brand: item.Part.Brand?.name || "",
        category: item.Part.Category?.name || "",
        quantity: item.quantity,
        from_store_id: item.fromStoreId,
        from_store:
          (item as any).Store_TransferItem_fromStoreIdToStore?.name || null,
        from_rack_id: item.fromRackId,
        from_rack:
          (item as any).Rack_TransferItem_fromRackIdToRack?.codeNo || null,
        from_shelf_id: item.fromShelfId,
        from_shelf:
          (item as any).Shelf_TransferItem_fromShelfIdToShelf?.shelfNo || null,
        to_store_id: item.toStoreId,
        to_store:
          (item as any).Store_TransferItem_toStoreIdToStore?.name || null,
        to_rack_id: item.toRackId,
        to_rack: (item as any).Rack_TransferItem_toRackIdToRack?.codeNo || null,
        to_shelf_id: item.toShelfId,
        to_shelf:
          (item as any).Shelf_TransferItem_toShelfIdToShelf?.shelfNo || null,
      })),
      created_at: transfer.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update transfer
router.put("/transfers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      transfer_number,
      date,
      from_store_id,
      to_store_id,
      notes,
      status,
      items,
    } = req.body;

    // Check if transfer exists
    const existingTransfer = await prisma.transfer.findUnique({
      where: { id },
    });
    if (!existingTransfer) {
      return res.status(404).json({ error: "Transfer not found" });
    }

    const totalQty = items
      ? items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
      : existingTransfer.totalQty;

    // Update transfer
    const transfer = await prisma.transfer.update({
      where: { id },
      data: {
        ...(transfer_number && { transferNumber: transfer_number }),
        ...(date && { date: new Date(date) }),
        ...(from_store_id !== undefined && {
          fromStoreId: from_store_id || null,
        }),
        ...(to_store_id !== undefined && { toStoreId: to_store_id || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(status && { status }),
        ...(totalQty !== undefined && { totalQty }),
        ...(items && {
          items: {
            deleteMany: {},
            create: items.map((item: any) => ({
              partId: item.part_id,
              fromStoreId: item.from_store_id || null,
              fromRackId: item.from_rack_id || null,
              fromShelfId: item.from_shelf_id || null,
              toStoreId: item.to_store_id || null,
              toRackId: item.to_rack_id || null,
              toShelfId: item.to_shelf_id || null,
              quantity: item.quantity,
            })),
          },
        }),
      },
      include: {
        TransferItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    res.json({
      id: transfer.id,
      transfer_number: transfer.transferNumber,
      date: transfer.date,
      status: transfer.status,
      total_qty: transfer.totalQty,
      items_count: (transfer as any).TransferItem.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete transfer
router.delete("/transfers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const transfer = await prisma.transfer.findUnique({ where: { id } });
    if (!transfer) {
      return res.status(404).json({ error: "Transfer not found" });
    }

    await prisma.transfer.delete({ where: { id } });

    res.json({ message: "Transfer deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const parseAddInventoryFilter = (
  query: Request["query"],
): boolean | undefined => {
  const raw = query.add_inventory ?? query.adjust_type;
  if (raw === undefined || raw === null) return undefined;
  const value = String(Array.isArray(raw) ? raw[0] : raw)
    .trim()
    .toLowerCase();
  if (!value || value === "all") return undefined;
  if (value === "true" || value === "add") return true;
  if (value === "false" || value === "remove") return false;
  return undefined;
};

// Get adjustments
router.get("/adjustments", async (req: Request, res: Response) => {
  try {
    const {
      from_date,
      to_date,
      status,
      search,
      part_id,
      page = "1",
      limit = "50",
    } = req.query;
    const addInventoryFilter = parseAddInventoryFilter(req.query);

    console.log("Adjustments API called with params:", {
      from_date,
      to_date,
      status,
      search,
      part_id,
      add_inventory: addInventoryFilter,
      page,
      limit,
    });

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(
      1,
      Math.min(1000, parseInt(limit as string, 10) || 50),
    );
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {
      deletedAt: null,
    };

    if (part_id) {
      console.log("Adding part_id filter:", part_id);
      where.AdjustmentItem = {
        some: {
          partId: part_id as string,
        },
      };
      console.log("Where clause with part_id:", JSON.stringify(where, null, 2));
    }

    if (from_date) {
      where.date = { ...where.date, gte: new Date(from_date as string) };
    }

    if (to_date) {
      where.date = { ...where.date, lte: new Date(to_date as string) };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (addInventoryFilter !== undefined) {
      where.addInventory = addInventoryFilter;
    }

    if (search) {
      const searchStr = search as string;
      const searchNum = parseInt(searchStr);
      where.OR = [
        { subject: { contains: searchStr, mode: "insensitive" } },
        { notes: { contains: searchStr, mode: "insensitive" } },
        // Removed internal ID search to avoid matching too many records by numbers in UUID
        ...(!isNaN(searchNum) ? [{ adjustmentNo: searchNum }] : []),
        {
          store: {
            OR: [
              { name: { contains: searchStr, mode: "insensitive" } },
              { code: { contains: searchStr, mode: "insensitive" } },
            ],
          },
        },
        {
          voucher: {
            voucherNumber: { contains: searchStr, mode: "insensitive" },
          },
        },
        {
          items: {
            some: {
              OR: [
                {
                  Part: {
                    OR: [
                      { partNo: { contains: searchStr, mode: "insensitive" } },
                      {
                        description: {
                          contains: searchStr,
                          mode: "insensitive",
                        },
                      },
                      {
                        brand: {
                          name: { contains: searchStr, mode: "insensitive" },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      ];
    }

    // Get total count
    const total = await prisma.adjustment.count({ where });

    // WORKAROUND: Since prisma generate is failing due to file locks on Windows,
    // we fetch adjustmentNo using raw SQL to ensure it's in the response.
    const { rows: serialRows } = await query(
      'SELECT id, "adjustmentNo" FROM "Adjustment"',
    );
    const serialMap = new Map(
      serialRows.map((r: any) => [r.id, r.adjustmentNo]),
    );

    // Get adjustments
    const adjustmentsData = await prisma.adjustment.findMany({
      where,
      orderBy: { adjustmentNo: "desc" },
      skip: offset,
      take: limitNum,
      include: {
        Store: true,
        Voucher_Adjustment_voucherIdToVoucher: true,
        AdjustmentItem: {
          include: {
            Part: {
              include: {
                Brand: true,
              },
            },
            Rack: true,
            Shelf: true,
          },
        },
      },
    });

    console.log(
      `Found ${adjustmentsData.length} adjustments matching criteria`,
    );
    console.log("Sample adjustment data:", adjustmentsData[0]);

    const adjustments = adjustmentsData.map((adj: any) => {
      const serialNo = serialMap.get(adj.id) || adj.adjustmentNo;
      return {
        id: adj.id,
        adjustment_no: serialNo,
        date: adj.date,
        subject: adj.subject,
        store_id: adj.storeId,
        store_name: adj.Store?.name,
        add_inventory: adj.addInventory,
        notes: adj.notes,
        total_amount: adj.totalAmount,
        status: adj.status,
        voucher_id: adj.voucherId,
        voucher_number:
          adj.Voucher_Adjustment_voucherIdToVoucher?.voucherNumber,
        voucher_status: adj.Voucher_Adjustment_voucherIdToVoucher?.status,
        created_at: adj.createdAt,
        updated_at: adj.updatedAt,
        items_count: adj.AdjustmentItem?.length || 0,
        items: (adj.AdjustmentItem || []).map((item: any) => ({
          id: item.id,
          part_id: item.partId,
          part_no: item.Part?.partNo,
          part_description: item.Part?.description,
          brand: item.Part?.Brand?.name,
          quantity: item.quantity,
          cost: item.cost,
          notes: item.notes,
          rack_id: item.rackId,
          rack_code: item.Rack?.codeNo,
          shelf_id: item.shelfId,
          shelf_no: item.Shelf?.shelfNo,
          priceA: item.priceA,
          priceB: item.priceB,
          priceM: item.priceM,
        })),
      };
    });

    res.json({
      data: adjustments,
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

// Create adjustment
// Create adjustment
router.post("/adjustments", async (req: Request, res: Response) => {
  try {
    const { date, subject, store_id, add_inventory, notes, items } = req.body;

    if (!date || !items || items.length === 0) {
      return res.status(400).json({ error: "date and items are required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Calculate total amount
      const totalAmount = items.reduce((sum: number, item: any) => {
        const cost = parseFloat(item.cost) || 0;
        const qty = parseInt(item.quantity) || 0;
        return sum + cost * qty;
      }, 0);

      // 2. Fetch Part Descriptions (for voucher narration)
      const partIds = items.map((item: any) => item.part_id);
      const parts = await tx.part.findMany({
        where: { id: { in: partIds } },
        include: { Brand: true },
      });
      const partMap = new Map(parts.map((p) => [p.id, p]));

      const itemDescriptions = items
        .map((item: any) => {
          const part = partMap.get(item.part_id);
          const partInfo = part
            ? `${part.partNo}/${part.description || ""}/${
                (part as any).Brand?.name || ""
              }/${part.partNo}`
            : `Part ${item.part_id}`;
          return `Item: ${partInfo} is ${
            add_inventory !== false ? "added" : "remove"
          } from Adjust Inventory, Qty:${item.quantity}, Rate: ${
            parseFloat(item.cost) || 0
          }`;
        })
        .join("; ");

      // 3. Validation: Check stock levels if removing inventory
      if (add_inventory === false) {
        for (const item of items) {
          const movementsIn = await tx.stockMovement.aggregate({
            _sum: { quantity: true },
            where: {
              partId: item.part_id,
              storeId: store_id,
              type: "in",
            },
          });
          const movementsOut = await tx.stockMovement.aggregate({
            _sum: { quantity: true },
            where: {
              partId: item.part_id,
              storeId: store_id,
              type: "out",
            },
          });
          const balance =
            (movementsIn._sum.quantity || 0) -
            (movementsOut._sum.quantity || 0);

          const requestedQty = parseInt(item.quantity) || 0;

          if (requestedQty > balance) {
            const part = partMap.get(item.part_id);
            const partName = part ? part.partNo : item.part_id;
            throw new Error(
              `Insufficient stock for ${partName}. Available: ${balance}, requested: ${requestedQty}`,
            );
          }
        }
      }

      // 4. Helper to find or create account
      const getOrCreateAccount = async (
        codes: string[],
        fallbackSubgroupCode: string,
        newAccountCode: string,
        newAccountName: string,
        desc: string,
      ) => {
        // Try finding account
        for (const code of codes) {
          const acc = await tx.account.findFirst({
            where: { code, status: "Active" },
          });
          if (acc) return acc;
        }

        // Not found, try creating
        const subgroup = await tx.subgroup.findFirst({
          where: { code: fallbackSubgroupCode },
        });
        if (!subgroup)
          throw new Error(`Subgroup ${fallbackSubgroupCode} not found`);

        return await tx.account.create({
          data: {
            subgroupId: subgroup.id,
            code: newAccountCode,
            name: newAccountName,
            description: desc,
            openingBalance: 0,
            currentBalance: 0,
            status: "Active",
          },
        } as any);
      };

      // 5. Resolve Accounts
      const inventoryAccount = await getOrCreateAccount(
        ["101001", "104005", "104001"],
        "104",
        "104005",
        "Inventory - General",
        "General inventory account for adjustments",
      );

      let secondAccount;
      if (add_inventory !== false) {
        secondAccount = await getOrCreateAccount(
          ["501003"],
          "501",
          "501003",
          "OWNER CAPITAL",
          "Owner Capital account for inventory adjustments",
        );
      } else {
        secondAccount = await getOrCreateAccount(
          ["801014"],
          "801",
          "801014",
          "Dispose Inventory",
          "Dispose Inventory expense account for adjustments",
        );
      }

      // 6. Determine status
      const adjustmentStatus = add_inventory !== false ? "pending" : "approved";
      const voucherStatus = add_inventory !== false ? "draft" : "posted";

      // 7. Generate Voucher Number
      const lastVoucher = await tx.voucher.findFirst({
        where: { voucherNumber: { startsWith: "JV" } },
        orderBy: { createdAt: "desc" }, // Use createdAt or try to parse number?
        // Better to use Raw SQL for strict regex matching if 'startsWith' is too loose,
        // but for now let's rely on finding latest.
        // Actually, let's use a simpler heuristic or the same raw query if needed?
        // Since we are inside prisma tx, rawQuery is `tx.$queryRaw`.
      });

      // Let's stick to the previous robust logic:
      const maxRes: any[] =
        await tx.$queryRaw`SELECT "voucherNumber" FROM "Voucher" WHERE "voucherNumber" ~ '^JV[0-9]+$' ORDER BY CAST(substring("voucherNumber" FROM 3) AS INTEGER) DESC LIMIT 1`;
      let jvNumber = 1;
      if (maxRes && maxRes.length > 0) {
        const lastNumber = maxRes[0].voucherNumber;
        const match = lastNumber.match(/JV(\d+)/);
        if (match) {
          jvNumber = parseInt(match[1]) + 1;
        }
      }
      const voucherNumber = `JV${String(jvNumber).padStart(4, "0")}`;

      // 8. Prepare Voucher Entries
      const voucherEntries = [];
      if (add_inventory !== false) {
        // Debit Inventory, Credit Equity
        voucherEntries.push({
          id: crypto.randomUUID(),
          accountId: inventoryAccount.id,
          accountName: inventoryAccount.name,
          debit: totalAmount,
          credit: 0,
          description: "Inventory Adjustment (Add)",
          sortOrder: 0,
        });
        voucherEntries.push({
          id: crypto.randomUUID(),
          accountId: secondAccount.id,
          accountName: secondAccount.name,
          debit: 0,
          credit: totalAmount,
          description: "Owner Equity (Adjustment)",
          sortOrder: 1,
        });
      } else {
        // Debit Equity, Credit Inventory
        voucherEntries.push({
          id: crypto.randomUUID(),
          accountId: secondAccount.id,
          accountName: secondAccount.name,
          debit: totalAmount,
          credit: 0,
          description: "Owner Equity (Adjustment)",
          sortOrder: 0,
        });
        voucherEntries.push({
          id: crypto.randomUUID(),
          accountId: inventoryAccount.id,
          accountName: inventoryAccount.name,
          debit: 0,
          credit: totalAmount,
          description: "Inventory Adjustment (Deduct)",
          sortOrder: 1,
        });
      }

      // 9. Create Adjustment FIRST (isolated)
      const adjustmentId = crypto.randomUUID();

      const adjustment = await tx.adjustment.create({
        data: {
          id: adjustmentId,
          date: new Date(date),
          subject,
          storeId: store_id || null,
          addInventory: add_inventory !== false,
          notes,
          totalAmount,
          status: adjustmentStatus,
          updatedAt: new Date(),
          // voucherId is initially null
          AdjustmentItem: {
            create: items.map((item: any) => ({
              id: crypto.randomUUID(),
              partId: item.part_id,
              quantity: parseInt(item.quantity) || 0,
              cost: parseFloat(item.cost) || 0,
              notes: item.notes,
              updatedAt: new Date(),
              rackId: item.rack_id || null,
              shelfId: item.shelf_id || null,
              priceA: item.priceA ? parseFloat(item.priceA) : null,
              priceB: item.priceB ? parseFloat(item.priceB) : null,
              priceM: item.priceM ? parseFloat(item.priceM) : null,
            })),
          },
        } as any,
      });

      // 10. Create Voucher (isolated, NO adjustmentId)
      // We manually construct the object without adjustmentId property to be unsafe for Prisma strict types but safe for runtime
      const voucher = await tx.voucher.create({
        data: {
          id: crypto.randomUUID(),
          updatedAt: new Date(),
          voucherNumber,
          type: "journal",
          date: new Date(date),
          narration: itemDescriptions.substring(0, 1000),
          status: voucherStatus,
          createdBy: "System",
          totalDebit: totalAmount,
          totalCredit: totalAmount,
          isSystemGenerated: true,
          storeId: store_id || null,
          adjustment: undefined, // Explicitly prevent any auto-connection
          adjustmentId: undefined, // Explicitly prevent any auto-connection
        } as any,
      });

      // 10.5 Create Voucher Entries (Separate step)
      // Manually create entries linked to the voucher
      const entriesToCreate = voucherEntries.map((e, index) => ({
        id: `ve_${Date.now()}_${index}`, // Generate unique ID
        voucherId: voucher.id,
        accountId: e.accountId,
        accountName: e.accountName,
        description: e.description,
        debit: e.debit,
        credit: e.credit,
        sortOrder: index,
        // adjustmentId REMOVED COMPLETELY
      }));

      await tx.voucherEntry.createMany({
        data: entriesToCreate,
      });

      // 11. Link everything together
      // Link Adjustment -> Voucher
      await tx.adjustment.update({
        where: { id: adjustmentId },
        data: { voucherId: voucher.id },
      });

      // Link Voucher -> Adjustment
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          Adjustment_Voucher_adjustmentIdToAdjustment: {
            connect: { id: adjustmentId },
          },
        },
      });

      // Link Entries -> Adjustment
      await tx.voucherEntry.updateMany({
        where: { voucherId: voucher.id },
        data: { adjustmentId: adjustmentId } as any,
      });

      // 10.5 Update Price A & Price B if provided
      for (const item of items) {
        const priceA =
          item.priceA !== undefined && item.priceA !== null
            ? parseFloat(item.priceA)
            : undefined;
        const priceB =
          item.priceB !== undefined && item.priceB !== null
            ? parseFloat(item.priceB)
            : undefined;
        const priceM =
          item.priceM !== undefined && item.priceM !== null
            ? parseFloat(item.priceM)
            : undefined;

        if (
          priceA !== undefined ||
          priceB !== undefined ||
          priceM !== undefined
        ) {
          const part = await tx.part.findUnique({
            where: { id: item.part_id },
          });

          if (part) {
            const updateData: any = {};

            if (
              priceA !== undefined &&
              !isNaN(priceA) &&
              priceA !== part.priceA
            ) {
              updateData.priceA = priceA;
              await tx.priceHistory.create({
                data: {
                  id: crypto.randomUUID(),
                  partId: part.id,
                  partNo: part.partNo,
                  description: part.description,
                  priceField: "priceA",
                  updateType: "adjustment",
                  oldValue: part.priceA || 0,
                  newValue: priceA,
                  reason: `Price A updated via Adjust Inventory (${subject || "No subject"})`,
                  updatedBy: "System",
                } as any,
              });
            }

            if (
              priceB !== undefined &&
              !isNaN(priceB) &&
              priceB !== part.priceB
            ) {
              updateData.priceB = priceB;
              await tx.priceHistory.create({
                data: {
                  id: crypto.randomUUID(),
                  partId: part.id,
                  partNo: part.partNo,
                  description: part.description,
                  priceField: "priceB",
                  updateType: "adjustment",
                  oldValue: part.priceB || 0,
                  newValue: priceB,
                  reason: `Price B updated via Adjust Inventory (${subject || "No subject"})`,
                  updatedBy: "System",
                } as any,
              });
            }

            if (
              priceM !== undefined &&
              !isNaN(priceM) &&
              priceM !== part.priceM
            ) {
              updateData.priceM = priceM;
              await tx.priceHistory.create({
                data: {
                  id: crypto.randomUUID(),
                  partId: part.id,
                  partNo: part.partNo,
                  description: part.description,
                  priceField: "priceM",
                  updateType: "adjustment",
                  oldValue: part.priceM || 0,
                  newValue: priceM,
                  reason: `Price M updated via Adjust Inventory (${subject || "No subject"})`,
                  updatedBy: "System",
                } as any,
              });
            }

            if (Object.keys(updateData).length > 0) {
              await tx.part.update({
                where: { id: item.part_id },
                data: updateData,
              });
            }
          }
        }
      }

      // 11. Handle Stock Movements and Balances (if approved/remove)
      if (adjustmentStatus === "approved") {
        for (const item of items) {
          const qty = parseInt(item.quantity) || 0;
          await tx.stockMovement.create({
            data: {
              id: randomUUID(),
              partId: item.part_id,
              type: "out", // Since it's approved immediately, it's a removal
              quantity: qty,
              storeId: store_id || null,
              rackId: item.rack_id || null,
              shelfId: item.shelf_id || null,
              referenceType: "adjustment",
              referenceId: adjustment.id,
              notes: `Adjustment: ${subject || "Stock adjustment"}`,
              createdAt: new Date(),
            } as any,
          });

          // Update PartRackShelf
          const existingPrs = await tx.partRackShelf.findFirst({
            where: {
              partId: item.part_id,
              storeId: store_id || null,
              rackId: item.rack_id || null,
              shelfId: item.shelf_id || null,
            },
          });

          if (existingPrs) {
            await tx.partRackShelf.update({
              where: { id: existingPrs.id },
              data: {
                quantity: { decrement: qty },
              },
            });
          } else {
            // If removing from a location that doesn't "exist" in tracking, create negative balance entry
            // This shouldn't happen ideally but we support it
            await tx.partRackShelf.create({
              data: {
                id: randomUUID(),
                partId: item.part_id,
                storeId: store_id || null,
                rackId: item.rack_id || null,
                shelfId: item.shelf_id || null,
                quantity: -qty,
              },
            });
          }
        }

        // Update Part AvgCost for removal adjustments (auto-approved on create)
        for (const item of items) {
          const partId = item.part_id;
          const qtyRemoved = parseInt(item.quantity) || 0;
          const itemCost = parseFloat(item.cost) || 0;

          // Get current part data
          const part = await tx.part.findUnique({
            where: { id: partId },
            select: { avgCost: true, cost: true, purchasePrice: true } as any,
          });

          if (part) {
            // Get total stock quantity (after removal)
            const movementsIn = await tx.stockMovement.aggregate({
              _sum: { quantity: true },
              where: { partId, type: "in" },
            });
            const movementsOut = await tx.stockMovement.aggregate({
              _sum: { quantity: true },
              where: { partId, type: "out" },
            });

            const totalIn = movementsIn._sum.quantity || 0;
            const totalOut = movementsOut._sum.quantity || 0;
            const currentTotalQty = totalIn - totalOut;

            // Calculate old qty (before removal)
            const oldQty = currentTotalQty + qtyRemoved;

            const oldAvgCost =
              (part as any).avgCost ??
              part.cost ??
              (part as any).purchasePrice ??
              0;
            const rate = itemCost || oldAvgCost;

            let newAvgCost = oldAvgCost;

            if (currentTotalQty > 0 && oldQty > 0) {
              newAvgCost =
                (oldQty * oldAvgCost - rate * qtyRemoved) / currentTotalQty;
            }

            console.log(`[CREATE AUTO-APPROVED REMOVAL] Part ${partId}:`);
            console.log(
              `  Old Qty: ${oldQty}, Removed: ${qtyRemoved}, Current: ${currentTotalQty}`,
            );
            console.log(
              `  Old AvgCost: ${oldAvgCost}, Rate: ${rate}, New AvgCost: ${newAvgCost}`,
            );

            // Update Part - avgCost and purchasePrice only, NOT cost
            await tx.part.update({
              where: { id: partId },
              data: {
                purchasePrice: rate,
                avgCost: newAvgCost,
                // cost field is NOT updated - it's user-controlled
                updatedAt: new Date(),
              } as any,
            });

            console.log(
              `  ✅ Part ${partId} updated - purchasePrice: ${rate}, avgCost: ${newAvgCost}`,
            );
          }
        }

        // Update Account Balances
        // decrement inventory (asset credited)
        await tx.account.update({
          where: { id: inventoryAccount.id },
          data: { currentBalance: { decrement: totalAmount } },
        });
        // increment expense (expense debited)
        await tx.account.update({
          where: { id: secondAccount.id },
          data: { currentBalance: { increment: totalAmount } },
        });
      }

      return { id: adjustment.id, voucherNumber };
    });

    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get adjustments by store
router.get("/adjustments/by-store", async (req: Request, res: Response) => {
  try {
    const { store_id, status, part_id, page = "1", limit = "50" } = req.query;

    if (!store_id) {
      return res.status(400).json({ error: "store_id is required" });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const partId = String(part_id || req.query.partId || "").trim();

    const where: any = {
      storeId: store_id as string,
      deletedAt: null,
    };

    if (status && status !== "all") {
      where.status = status;
    }
    if (partId) {
      where.AdjustmentItem = {
        some: { partId },
      };
    }

    const [adjustments, total] = await Promise.all([
      prisma.adjustment.findMany({
        where,
        include: {
          Store: true,
          AdjustmentItem: {
            include: {
              Part: {
                include: {
                  Brand: true,
                  Category: true,
                },
              },
              Rack: true,
              Shelf: true,
            },
          },
        },
        orderBy: {
          id: "desc",
        },
        skip,
        take: limitNum,
      }),
      prisma.adjustment.count({ where }),
    ]);

    // Fetch vouchers separately
    const adjustmentIds = adjustments.map((a: any) => a.id);
    const vouchers = await prisma.voucher.findMany({
      where: {
        id: { in: adjustments.map((a: any) => a.voucherId).filter(Boolean) },
      },
      select: {
        id: true,
        voucherNumber: true,
        status: true,
      },
    });
    const voucherMap = new Map(vouchers.map((v) => [v.id, v]));

    res.json({
      data: adjustments.map((a: any) => {
        const voucher = a.voucherId ? voucherMap.get(a.voucherId) : null;
        return {
          id: a.id,
          date: a.date,
          subject: a.subject,
          store_id: a.storeId,
          store_name: a.store?.name || null,
          add_inventory: a.addInventory,
          notes: a.notes,
          total_amount: a.totalAmount,
          status: a.status,
          voucher_id: a.voucherId,
          voucher_number: voucher?.voucherNumber || null,
          voucher_status: voucher?.status || null,
          items: a.AdjustmentItem.map((item: any) => ({
            id: item.id,
            part_id: item.partId,
            part_no: item.Part.partNo,
            part_description: item.Part.description,
            brand: item.Part.Brand?.name || "",
            category: item.Part.Category?.name || "",
            quantity: item.quantity,
            cost: item.cost,
            notes: item.notes,
            rack_id: item.rackId,
            rack_code: item.Rack?.codeNo || null,
            shelf_id: item.shelfId,
            shelf_no: item.Shelf?.shelfNo || null,
          })),
          items_count: a.AdjustmentItem?.length || 0,
          created_at: a.createdAt,
          updated_at: a.updatedAt,
        };
      }),
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

// Get parts that are in adjustments (for filter dropdown)
router.get("/adjustment-parts", async (req: Request, res: Response) => {
  try {
    console.log("Fetching parts that are in adjustments");

    // Get unique part IDs from all AdjustmentItem records
    const adjustmentItems = await prisma.adjustmentItem.findMany({
      where: {
        Adjustment: {
          deletedAt: null,
        },
      },
      select: {
        partId: true,
      },
      distinct: ["partId"],
    });

    const partIds = adjustmentItems.map((item: any) => item.partId);
    console.log(`Found ${partIds.length} unique parts in adjustments`);

    // Now fetch the full part details for these IDs
    const parts = await prisma.part.findMany({
      where: {
        id: {
          in: partIds,
        },
      },
      include: {
        Brand: true,
      },
      orderBy: {
        partNo: "asc",
      },
    });

    const result = parts.map((part: any) => ({
      id: part.id,
      partNo: part.partNo,
      brand: part.Brand?.name || "",
      description: part.description,
    }));

    console.log(`Returning ${result.length} parts for dropdown`);
    res.json({ data: result });
  } catch (error: any) {
    console.error("Error fetching adjustment parts:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single adjustment
router.get("/adjustments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const adjustment = (await prisma.adjustment.findFirst({
      where: { id, deletedAt: null },
      include: {
        Store: true,
        AdjustmentItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
            Rack: true,
            Shelf: true,
          },
        },
      },
    })) as any;

    if (!adjustment) {
      return res.status(404).json({ error: "Adjustment not found" });
    }

    // Fetch voucher separately
    const voucher = adjustment.voucherId
      ? await prisma.voucher.findUnique({
          where: { id: adjustment.voucherId },
          select: {
            id: true,
            voucherNumber: true,
            status: true,
          },
        })
      : null;

    res.json({
      id: adjustment.id,
      date: adjustment.date,
      subject: adjustment.subject,
      store_id: adjustment.storeId,
      store_name: adjustment.store?.name || null,
      add_inventory: adjustment.addInventory,
      notes: adjustment.notes,
      total_amount: adjustment.totalAmount,
      status: adjustment.status,
      voucher_id: adjustment.voucherId,
      voucher_number: voucher?.voucherNumber || null,
      voucher_status: voucher?.status || null,
      items: adjustment.AdjustmentItem.map((item: any) => ({
        id: item.id,
        part_id: item.partId,
        part_no: item.Part.partNo,
        part_description: item.Part.description,
        brand: item.Part.Brand?.name || "",
        category: item.Part.Category?.name || "",
        quantity: item.quantity,
        cost: item.cost,
        notes: item.notes,
        rack_id: item.rackId,
        rack_code: item.Rack?.codeNo || null,
        shelf_id: item.shelfId,
        shelf_no: item.Shelf?.shelfNo || item.Shelf?.shelf_no || null,
        shelf: item.Shelf?.shelfNo || item.Shelf?.shelf_no || null,
      })),
      created_at: adjustment.createdAt,
      updated_at: adjustment.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update adjustment
router.put("/adjustments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, subject, store_id, add_inventory, notes, items } = req.body;

    // Check if adjustment exists and fetch its items for comparison
    const existingAdjustment = await prisma.adjustment.findFirst({
      where: { id, deletedAt: null },
      include: {
        AdjustmentItem: true,
      },
    });
    if (!existingAdjustment) {
      return res.status(404).json({ error: "Adjustment not found" });
    }

    // Calculate total amount
    const totalAmount = items
      ? items.reduce((sum: number, item: any) => {
          const cost = item.cost || 0;
          const qty = item.quantity || 0;
          return sum + cost * qty;
        }, 0)
      : existingAdjustment.totalAmount;

    // Use a transaction for the entire update process
    const result = await prisma.$transaction(async (tx) => {
      // Helper for balance change
      const calculateBalanceChange = (
        debit: number,
        credit: number,
        accountType: string,
      ) => {
        const type = accountType.toLowerCase();
        const isDebitNormal =
          type === "asset" || type === "expense" || type === "cost";
        return isDebitNormal ? debit - credit : credit - debit;
      };

      // Helper to find or create account
      const getOrCreateAccount = async (
        codes: string[],
        fallbackSubgroupCode: string,
        newAccountCode: string,
        newAccountName: string,
        desc: string,
      ) => {
        for (const code of codes) {
          const acc = await tx.account.findFirst({
            where: { code, status: "Active" },
          });
          if (acc) return acc;
        }
        const subgroup = await tx.subgroup.findFirst({
          where: { code: fallbackSubgroupCode },
        });
        if (!subgroup)
          throw new Error(`Subgroup ${fallbackSubgroupCode} not found`);
        return await tx.account.create({
          data: {
            subgroupId: subgroup.id,
            code: newAccountCode,
            name: newAccountName,
            description: desc,
            openingBalance: 0,
            currentBalance: 0,
            status: "Active",
          } as any,
        });
      };
      // 1. Validation: Check stock levels if removing inventory
      // We must check if there's enough stock EXCLUDING what this adjustment currently provides
      if (add_inventory === false && items) {
        for (const item of items) {
          // Query balance excluding THIS adjustment's current movements
          const balanceRes: any = await tx.$queryRaw`
            SELECT SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as balance 
            FROM "StockMovement" 
            WHERE "partId" = ${item.part_id} 
              AND "storeId" = ${store_id || existingAdjustment.storeId}
              AND "referenceId" != ${id}
          `;

          const baselineBalance = Number(balanceRes[0]?.balance ?? 0);
          const requestedQty = parseInt(item.quantity) || 0;

          if (requestedQty > baselineBalance) {
            // Fetch part name for better error message
            const part = await tx.part.findUnique({
              where: { id: item.part_id },
              select: { partNo: true },
            });
            throw new Error(
              `Insufficient stock for part ${part?.partNo || item.part_id}. Baseline Available (from other sources): ${baselineBalance}, requested withdrawal: ${requestedQty}. (Note: You are currently removing the stock previously added by this adjustment, so it is no longer counted in available stock)`,
            );
          }
        }
      }

      // 2. Delete existing stock movements for this adjustment
      await tx.stockMovement.deleteMany({
        where: {
          referenceType: "adjustment",
          referenceId: id,
        },
      });

      // 3. Determine status: Removals are auto-approved.
      // If it was already approved, keep it approved during edit.
      const shouldApprove =
        add_inventory === false || existingAdjustment.status === "approved";
      const adjustmentStatus = shouldApprove ? "approved" : "pending";

      // 4. Update adjustment
      const adjustment = (await tx.adjustment.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(subject !== undefined && { subject: subject || null }),
          ...(store_id !== undefined && { storeId: store_id || null }),
          ...(add_inventory !== undefined && { addInventory: add_inventory }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(totalAmount !== undefined && { totalAmount }),
          status: adjustmentStatus,
          ...(items && {
            AdjustmentItem: {
              deleteMany: {},
              create: items.map((item: any) => ({
                id: crypto.randomUUID(),
                partId: item.part_id,
                quantity: item.quantity,
                cost: item.cost || null,
                notes: item.notes || null,
                updatedAt: new Date(),
                rackId: item.rack_id || null,
                shelfId: item.shelf_id || null,
                priceA:
                  item.priceA !== undefined && item.priceA !== null
                    ? parseFloat(item.priceA)
                    : null,
                priceB:
                  item.priceB !== undefined && item.priceB !== null
                    ? parseFloat(item.priceB)
                    : null,
                priceM:
                  item.priceM !== undefined && item.priceM !== null
                    ? parseFloat(item.priceM)
                    : null,
              })),
            },
          }),
        } as any,
        include: {
          AdjustmentItem: {
            include: {
              Part: true,
            },
          },
        },
      })) as any;

      // 5. Handle Voucher update
      if (adjustment.voucherId) {
        const voucher = await tx.voucher.findUnique({
          where: { id: adjustment.voucherId },
          include: {
            VoucherEntry: {
              include: {
                Account: {
                  include: { Subgroup: { include: { MainGroup: true } } },
                },
              },
            },
          },
        });

        if (voucher) {
          // A. Revert old balances if voucher was posted
          if (voucher.status === "posted") {
            for (const entry of voucher.VoucherEntry) {
              if (entry.accountId && entry.Account) {
                const accountType = (entry.Account as any).Subgroup.MainGroup
                  .type;
                const balanceChange = -calculateBalanceChange(
                  entry.debit,
                  entry.credit,
                  accountType,
                );
                await tx.account.update({
                  where: { id: entry.accountId },
                  data: {
                    currentBalance: {
                      increment: balanceChange,
                    },
                  },
                });
              }
            }
          }

          // B. Soft Delete old voucher
          await tx.voucher.update({
            where: { id: voucher.id },
            data: {
              deletedAt: new Date(),
              status: "cancelled", // Mark as cancelled as well to be safe
            },
          });

          // C. Generate NEW Voucher Number
          const maxRes: any[] =
            await tx.$queryRaw`SELECT "voucherNumber" FROM "Voucher" WHERE "voucherNumber" ~ '^JV[0-9]+$' ORDER BY CAST(substring("voucherNumber" FROM 3) AS INTEGER) DESC LIMIT 1`;
          let jvNumber = 1;
          if (maxRes && maxRes.length > 0) {
            const lastNumber = maxRes[0].voucherNumber;
            const match = lastNumber.match(/JV(\d+)/);
            if (match) {
              jvNumber = parseInt(match[1]) + 1;
            }
          }
          const voucherNumber = `JV${String(jvNumber).padStart(4, "0")}`;

          // D. Resolve Accounts for new entries
          const inventoryAccount = await getOrCreateAccount(
            ["101001", "104005", "104001"],
            "104",
            "104005",
            "Inventory - General",
            "General inventory account for adjustments",
          );

          let secondAccount;
          if (add_inventory !== false) {
            secondAccount = await getOrCreateAccount(
              ["501003"],
              "501",
              "501003",
              "OWNER CAPITAL",
              "Owner Capital account for inventory adjustments",
            );
          } else {
            secondAccount = await getOrCreateAccount(
              ["801014"],
              "801",
              "801014",
              "Dispose Inventory",
              "Dispose Inventory expense account for adjustments",
            );
          }

          // E. Prepare New Entries
          const voucherEntries = [];
          if (add_inventory !== false) {
            // Add: Debit Inventory, Credit Equity
            voucherEntries.push({
              accountId: inventoryAccount.id,
              accountName: inventoryAccount.name,
              debit: totalAmount,
              credit: 0,
              description: "Inventory Adjustment (Add)",
            });
            voucherEntries.push({
              accountId: secondAccount.id,
              accountName: secondAccount.name,
              debit: 0,
              credit: totalAmount,
              description: "Owner Equity (Adjustment)",
            });
          } else {
            // Remove: Debit Expense, Credit Inventory
            voucherEntries.push({
              accountId: secondAccount.id,
              accountName: secondAccount.name,
              debit: totalAmount,
              credit: 0,
              description: "Inventory Adjustment (Remove)",
            });
            voucherEntries.push({
              accountId: inventoryAccount.id,
              accountName: inventoryAccount.name,
              debit: 0,
              credit: totalAmount,
              description: "Inventory Adjustment",
            });
          }

          // F. Create NEW Voucher
          const voucherStatus = shouldApprove ? "posted" : "draft";
          const itemDescriptions = adjustment.AdjustmentItem.map(
            (item: any) => `${item.Part.partNo} (${item.quantity})`,
          ).join(", ");

          const voucherId = randomUUID();
          console.log("Creating voucher with ID:", voucherId);
          const newVoucher = await tx.voucher.create({
            data: {
              id: voucherId,
              voucherNumber,
              type: "journal",
              date: date ? new Date(date) : new Date(),
              narration: itemDescriptions.substring(0, 1000),
              totalDebit: totalAmount,
              totalCredit: totalAmount,
              status: voucherStatus,
              createdBy: "System",
              isSystemGenerated: true,
              adjustmentId: id,
              VoucherEntry: {
                create: voucherEntries.map((e, index) => ({
                  id: randomUUID(),
                  accountId: e.accountId,
                  accountName: e.accountName,
                  description: e.description,
                  debit: e.debit,
                  credit: e.credit,
                  sortOrder: index,
                  adjustmentId: id,
                })),
              },
              updatedAt: new Date(),
            } as any,
          });

          // G. Update Adjustment with NEW Voucher ID
          await tx.adjustment.update({
            where: { id: id },
            data: { voucherId: newVoucher.id },
          });

          // H. Apply new balances if posted
          if (voucherStatus === "posted") {
            for (const entry of voucherEntries) {
              const acc = await tx.account.findUnique({
                where: { id: entry.accountId },
                include: { Subgroup: { include: { MainGroup: true } } },
              });
              if (acc) {
                const accountType = acc.Subgroup.MainGroup.type;
                const balanceChange = calculateBalanceChange(
                  entry.debit,
                  entry.credit,
                  accountType,
                );
                await tx.account.update({
                  where: { id: acc.id },
                  data: {
                    currentBalance: {
                      increment: balanceChange,
                    },
                  },
                });
              }
            }
          }
        }
      }

      // 5.5 Update Price A & Price B if provided (from PUT items)
      if (items) {
        console.log(
          "[PRICE_HISTORY_DEBUG] Processing items for price updates...",
        );
        for (const item of items) {
          console.log("[PRICE_HISTORY_DEBUG] Item received:", {
            part_id: item.part_id,
            priceA: item.priceA,
            priceB: item.priceB,
            priceM: item.priceM,
          });

          const priceA =
            item.priceA !== undefined && item.priceA !== null
              ? parseFloat(item.priceA)
              : undefined;
          const priceB =
            item.priceB !== undefined && item.priceB !== null
              ? parseFloat(item.priceB)
              : undefined;
          const priceM =
            item.priceM !== undefined && item.priceM !== null
              ? parseFloat(item.priceM)
              : undefined;

          console.log("[PRICE_HISTORY_DEBUG] Parsed prices:", {
            priceA,
            priceB,
            priceM,
          });

          if (
            priceA !== undefined ||
            priceB !== undefined ||
            priceM !== undefined
          ) {
            const part = await tx.part.findUnique({
              where: { id: item.part_id },
            });

            if (part) {
              console.log("[PRICE_HISTORY_DEBUG] Current part prices:", {
                partNo: part.partNo,
                currentPriceA: part.priceA,
                currentPriceB: part.priceB,
                currentPriceM: part.priceM,
              });

              const updateData: any = {};

              if (
                priceA !== undefined &&
                !isNaN(priceA) &&
                priceA !== part.priceA
              ) {
                updateData.priceA = priceA;
                await tx.priceHistory.create({
                  data: {
                    id: crypto.randomUUID(),
                    partId: part.id,
                    partNo: part.partNo,
                    description: part.description,
                    priceField: "priceA",
                    updateType: "adjustment",
                    oldValue: part.priceA || 0,
                    newValue: priceA,
                    reason: `Price A updated via Adjust Inventory (${subject || "No subject"})`,
                    updatedBy: "System",
                  } as any,
                });
              }

              if (
                priceB !== undefined &&
                !isNaN(priceB) &&
                priceB !== part.priceB
              ) {
                updateData.priceB = priceB;
                await tx.priceHistory.create({
                  data: {
                    id: crypto.randomUUID(),
                    partId: part.id,
                    partNo: part.partNo,
                    description: part.description,
                    priceField: "priceB",
                    updateType: "adjustment",
                    oldValue: part.priceB || 0,
                    newValue: priceB,
                    reason: `Price B updated via Adjust Inventory (${subject || "No subject"})`,
                    updatedBy: "System",
                  } as any,
                });
              }

              if (
                priceM !== undefined &&
                !isNaN(priceM) &&
                priceM !== part.priceM
              ) {
                updateData.priceM = priceM;
                await tx.priceHistory.create({
                  data: {
                    id: crypto.randomUUID(),
                    partId: part.id,
                    partNo: part.partNo,
                    description: part.description,
                    priceField: "priceM",
                    updateType: "adjustment",
                    oldValue: part.priceM || 0,
                    newValue: priceM,
                    reason: `Price M updated via Adjust Inventory (${subject || "No subject"})`,
                    updatedBy: "System",
                  } as any,
                });
              }

              if (Object.keys(updateData).length > 0) {
                console.log(
                  "[PRICE_HISTORY_DEBUG] Updating part with:",
                  updateData,
                );
                await tx.part.update({
                  where: { id: item.part_id },
                  data: updateData,
                });
                console.log("[PRICE_HISTORY_DEBUG] Part updated successfully");
              } else {
                console.log(
                  "[PRICE_HISTORY_DEBUG] No price changes detected, skipping update",
                );
              }
            } else {
              console.log(
                "[PRICE_HISTORY_DEBUG] Part not found for id:",
                item.part_id,
              );
            }
          } else {
            console.log("[PRICE_HISTORY_DEBUG] No prices provided in request");
          }
        }
      }

      // 6. Update Part AvgCost and Stock Movements
      const affectedPartIds = new Set<string>();
      if (items) items.forEach((i: any) => affectedPartIds.add(i.part_id));
      existingAdjustment.AdjustmentItem.forEach((i: any) =>
        affectedPartIds.add(i.partId),
      );

      for (const partId of affectedPartIds) {
        const newItem = items?.find((i: any) => i.part_id === partId);
        const oldItem = existingAdjustment.AdjustmentItem.find(
          (i: any) => i.partId === partId,
        );

        // A. Update Weighted Average Cost
        const part = await tx.part.findUnique({
          where: { id: partId },
          select: { avgCost: true, cost: true, purchasePrice: true } as any,
        });

        if (part) {
          // 1. Get current baseline stock (EXCLUDING this adjustment because movements were deleted in Step 2)
          const movementsIn = await tx.stockMovement.aggregate({
            _sum: { quantity: true },
            where: { partId, type: "in" },
          });
          const movementsOut = await tx.stockMovement.aggregate({
            _sum: { quantity: true },
            where: { partId, type: "out" },
          });
          const stockBaseline =
            (movementsIn._sum.quantity || 0) -
            (movementsOut._sum.quantity || 0);

          let currentAvg =
            (part as any).avgCost ??
            part.cost ??
            (part as any).purchasePrice ??
            0;

          let calculatedAvg = currentAvg;
          let finalRate = currentAvg;

          const oldStatus = existingAdjustment.status;
          const newStatus = adjustmentStatus;

          if (oldStatus === "approved" || newStatus === "approved") {
            const oldQty = oldItem ? oldItem.quantity : 0;
            const oldRate = oldItem ? (oldItem.cost ?? currentAvg) : currentAvg;

            if (oldStatus === "approved" && newStatus === "approved") {
              // CASE: Editing an already active adjustment
              if (
                existingAdjustment.addInventory &&
                adjustment.addInventory &&
                newItem
              ) {
                // User's Formula: ((stock * avg) - (edit qty API * rate) + (rate * new qty)) / (stock - edit qty API + new Qty)
                const stock = stockBaseline + oldQty;
                const newQty = newItem.quantity;
                const newRate = newItem.cost ?? currentAvg;
                const denominator = stock - oldQty + newQty;

                if (denominator > 0) {
                  calculatedAvg =
                    (stock * currentAvg - oldQty * oldRate + newRate * newQty) /
                    denominator;
                }
                finalRate = newRate;
                console.log(
                  `[ADD FORMULA] stock: ${stock}, avg: ${currentAvg}, oldQty: ${oldQty}, oldRate: ${oldRate}, newRate: ${newRate}, newQty: ${newQty} => ${calculatedAvg}`,
                );
              } else if (
                !existingAdjustment.addInventory &&
                !adjustment.addInventory &&
                newItem
              ) {
                // User's Removal Formula: ((stock * avg) + (edit qty API * rate) - (rate * new qty)) / (stock + edit qty API - new Qty)
                // stock here is the reduced stock (stockBaseline - oldQty)
                const stock = stockBaseline - oldQty;
                const newQty = newItem.quantity;
                const newRate = newItem.cost ?? currentAvg;
                const denominator = stock + oldQty - newQty; // This is basically stockBaseline - newQty

                if (denominator > 0) {
                  calculatedAvg =
                    (stock * currentAvg + oldQty * oldRate - newRate * newQty) /
                    denominator;
                }
                finalRate = newRate;
                console.log(
                  `[REMOVE FORMULA] stock: ${stock}, avg: ${currentAvg}, oldQty: ${oldQty}, oldRate: ${oldRate}, newRate: ${newRate}, newQty: ${newQty} => ${calculatedAvg}`,
                );
              } else {
                // Standard Revert and Apply for transitions (Add <-> Remove)
                // Revert old
                const oldImpact = existingAdjustment.addInventory
                  ? oldQty
                  : -oldQty;
                const stockWithOld = stockBaseline + oldImpact;
                if (stockWithOld > 0) {
                  const totalValueWithOld = stockWithOld * currentAvg;
                  const totalValueReverted =
                    totalValueWithOld - oldImpact * oldRate;
                  calculatedAvg =
                    stockBaseline > 0
                      ? totalValueReverted / stockBaseline
                      : oldRate;
                }

                // Apply new
                if (newItem && newStatus === "approved") {
                  const newQty = newItem.quantity;
                  const newRate = newItem.cost ?? calculatedAvg;
                  const newImpact = adjustment.addInventory ? newQty : -newQty;
                  const stockNew = stockBaseline + newImpact;

                  const totalValueNew =
                    stockBaseline * calculatedAvg + newImpact * newRate;
                  calculatedAvg =
                    stockNew > 0 ? totalValueNew / stockNew : newRate;
                  finalRate = newRate;
                }
              }
            } else if (oldStatus !== "approved" && newStatus === "approved") {
              // CASE: Newly approved (was pending)
              if (newItem) {
                const newQty = newItem.quantity;
                const newRate = newItem.cost ?? currentAvg;
                const newImpact = adjustment.addInventory ? newQty : -newQty;
                const stockNew = stockBaseline + newImpact;
                const totalValueNew =
                  stockBaseline * currentAvg + newImpact * newRate;
                calculatedAvg =
                  stockNew > 0 ? totalValueNew / stockNew : newRate;
                finalRate = newRate;
              }
            } else if (oldStatus === "approved" && newStatus !== "approved") {
              // CASE: Was approved, now turning pending (Revert only)
              const oldImpact = existingAdjustment.addInventory
                ? oldQty
                : -oldQty;
              const stockWithOld = stockBaseline + oldImpact;
              if (stockWithOld > 0) {
                const totalValueWithOld = stockWithOld * currentAvg;
                const totalValueReverted =
                  totalValueWithOld - oldImpact * oldRate;
                calculatedAvg =
                  stockBaseline > 0
                    ? totalValueReverted / stockBaseline
                    : oldRate;
              }
            }
          }

          // 2. Handle Stock Movements for approved additions/removals
          if (newStatus === "approved" && newItem) {
            await tx.stockMovement.create({
              data: {
                partId: partId,
                type: adjustment.addInventory ? "in" : "out",
                quantity: newItem.quantity,
                storeId: store_id || existingAdjustment.storeId || null,
                rackId: newItem.rack_id || null,
                shelfId: newItem.shelf_id || null,
                referenceType: "adjustment",
                referenceId: adjustment.id,
                notes: `Adjustment: ${subject || "Stock adjustment"}`,
                createdAt: new Date(),
              } as any,
            });
          }

          currentAvg = calculatedAvg;

          // 3. Update the Part record - avgCost and purchasePrice only, NOT cost
          await tx.part.update({
            where: { id: partId },
            data: {
              avgCost: currentAvg,
              // cost field is NOT updated - it's user-controlled
              ...(newStatus === "approved" && newItem?.cost
                ? { purchasePrice: finalRate }
                : {}),
              updatedAt: new Date(),
            } as any,
          });

          console.log(`[AVG COST UPDATE] Part ${partId}:`);
          console.log(
            `  Baseline Stock: ${stockBaseline}, New Total Stock: ${stockBaseline + (newStatus === "approved" && newItem ? (adjustment.addInventory ? newItem.quantity : -newItem.quantity) : 0)}`,
          );
          console.log(`  New Calculated Avg: ${currentAvg}`);
        }
      }

      return adjustment;
    });

    res.json({
      id: result.id,
      date: result.date,
      subject: result.subject,
      total_amount: result.totalAmount,
      items_count: result.AdjustmentItem?.length || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve adjustment (assign rack/shelf and approve)
router.put("/adjustments/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { items } = req.body; // Array of { id, rack_id?, shelf_id? }

    // Fetch adjustment with voucher and items
    const adjustment = (await prisma.adjustment.findUnique({
      where: { id },
      include: {
        AdjustmentItem: {
          include: {
            Part: true,
          },
        },
        Store: true,
      },
    })) as any;

    // Fetch voucher separately
    const voucher = adjustment?.voucherId
      ? await prisma.voucher.findUnique({
          where: { id: adjustment.voucherId },
          include: {
            VoucherEntry: {
              include: {
                Account: {
                  include: {
                    Subgroup: {
                      include: {
                        MainGroup: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : null;

    if (adjustment) {
      adjustment.voucher = voucher;
    }

    if (!adjustment) {
      return res.status(404).json({ error: "Adjustment not found" });
    }

    if (adjustment.status === "approved") {
      return res.status(400).json({ error: "Adjustment is already approved" });
    }

    if (!adjustment.voucher) {
      return res
        .status(400)
        .json({ error: "Voucher not found for this adjustment" });
    }

    // Update adjustment items with rack/shelf assignments
    if (items && Array.isArray(items)) {
      for (const itemUpdate of items) {
        await prisma.adjustmentItem.update({
          where: { id: itemUpdate.id },
          data: {
            rackId: itemUpdate.rack_id || null,
            shelfId: itemUpdate.shelf_id || null,
          } as any,
        });
      }
    }

    // Create stock movements with rack/shelf
    for (const item of adjustment.AdjustmentItem) {
      const itemUpdate = items?.find((i: any) => i.id === item.id);

      await prisma.stockMovement.create({
        data: {
          id: randomUUID(),
          partId: item.partId,
          type: adjustment.addInventory ? "in" : "out",
          quantity: item.quantity,
          storeId: adjustment.storeId || null,
          rackId: itemUpdate?.rack_id || item.rackId || null,
          shelfId: itemUpdate?.shelf_id || item.shelfId || null,
          referenceType: "adjustment",
          referenceId: adjustment.id,
          notes: `Adjustment: ${adjustment.subject || "Stock adjustment"}`,
        } as any,
      });

      // Update PartRackShelf
      const existingPrs = await prisma.partRackShelf.findFirst({
        where: {
          partId: item.partId,
          storeId: adjustment.storeId || null,
          rackId: itemUpdate?.rack_id || item.rackId || null,
          shelfId: itemUpdate?.shelf_id || item.shelfId || null,
        },
      });

      if (existingPrs) {
        await prisma.partRackShelf.update({
          where: { id: existingPrs.id },
          data: {
            quantity: {
              [adjustment.addInventory ? "increment" : "decrement"]:
                item.quantity,
            },
          },
        });
      } else {
        await prisma.partRackShelf.create({
          data: {
            id: randomUUID(),
            partId: item.partId,
            storeId: adjustment.storeId || null,
            rackId: itemUpdate?.rack_id || item.rackId || null,
            shelfId: itemUpdate?.shelf_id || item.shelfId || null,
            quantity: adjustment.addInventory ? item.quantity : -item.quantity,
          },
        });
      }
    }

    // Voucher is already posted when adjustment is created, so just fetch it
    // Only update if it's still in draft status (backward compatibility)
    let updatedVoucher;
    if (adjustment.voucher && adjustment.voucher.status === "draft") {
      // Legacy: If voucher is still draft, post it now
      updatedVoucher = await prisma.voucher.update({
        where: { id: adjustment.voucherId! },
        data: {
          status: "posted",
          approvedBy: "Store Manager",
          approvedAt: new Date(),
        },
        include: {
          VoucherEntry: {
            include: {
              Account: {
                include: {
                  Subgroup: {
                    include: {
                      MainGroup: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Update account balances only if voucher was just posted
      for (const entry of updatedVoucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        const balanceChange =
          accountType === "asset" ||
          accountType === "expense" ||
          accountType === "cost"
            ? entry.debit - entry.credit
            : entry.credit - entry.debit;

        await prisma.account.update({
          where: { id: entry.accountId },
          data: {
            currentBalance: {
              increment: balanceChange,
            },
          },
        });
      }
    } else {
      // Voucher is already posted, just fetch it
      updatedVoucher = await prisma.voucher.findUnique({
        where: { id: adjustment.voucherId! },
        include: {
          VoucherEntry: {
            include: {
              Account: {
                include: {
                  Subgroup: {
                    include: {
                      MainGroup: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    // Update Part Costs if adding inventory
    if (adjustment.addInventory) {
      for (const item of adjustment.AdjustmentItem) {
        // Calculate Weighted Average Cost
        // Formula: ((Overall Stock Qty * Avg Cost) + (Rate * Qty)) / (Overall Stock Qty + Qty)

        // 1. Get current part data
        const part = await prisma.part.findUnique({
          where: { id: item.partId },
          select: { avgCost: true, cost: true, purchasePrice: true } as any,
        });

        if (part) {
          // 2. Get total stock quantity (current, which includes the just-added adjustment movement)
          const movementsIn = await prisma.stockMovement.aggregate({
            _sum: { quantity: true },
            where: { partId: item.partId, type: "in" },
          });
          const movementsOut = await prisma.stockMovement.aggregate({
            _sum: { quantity: true },
            where: { partId: item.partId, type: "out" },
          });

          const totalIn = movementsIn._sum.quantity || 0;
          const totalOut = movementsOut._sum.quantity || 0;
          const currentTotalQty = totalIn - totalOut; // This matches (Overall Stock Qty + Qty)

          // 3. Derive Old Stock Qty (Overall Stock Qty)
          const qtyAdded = item.quantity;
          const oldQty = currentTotalQty - qtyAdded;

          // 4. Calculate New Avg Cost
          // Use existing avgCost if available, otherwise fall back to cost or purchasePrice
          const oldAvgCost =
            (part as any).avgCost ??
            part.cost ??
            (part as any).purchasePrice ??
            0;

          // Use item.cost if provided and > 0, otherwise use existing avgCost
          const rate = item.cost && item.cost > 0 ? item.cost : oldAvgCost;

          let newAvgCost = rate;

          // Apply weighted average formula if we had positive stock previously
          if (oldQty > 0) {
            // Formula: (overall_stock_qty * avg_cost + rate * qty) / (overall_stock_qty + qty)
            newAvgCost =
              (oldQty * oldAvgCost + rate * qtyAdded) / (oldQty + qtyAdded);
          }
          // If oldQty is 0 or negative, just use the rate as avgCost

          // 5. Update Part
          await prisma.part.update({
            where: { id: item.partId },
            data: {
              // Only update purchasePrice if a valid cost was provided
              ...(item.cost && item.cost > 0 ? { purchasePrice: rate } : {}),
              avgCost: newAvgCost,
              // cost field is NOT updated - it's user-controlled
              updatedAt: new Date(),
            } as any,
          });
        }
      }
    } else {
      // Remove Inventory Case
      for (const item of adjustment.AdjustmentItem) {
        // Calculate Avg Cost for Removal even if cost is 0
        // Formula: ((Overall Stock Qty * Avg Cost) - (Rate * Qty)) / (Overall Stock - Qty)

        // 1. Get current part data
        const part = await prisma.part.findUnique({
          where: { id: item.partId },
          select: { avgCost: true, cost: true, purchasePrice: true } as any,
        });

        if (part) {
          // 2. Get total stock quantity (current, which includes the just-removed adjustment movement)
          // Note: Since this is "out" adjustment, the current stock has DECREASED.
          const movementsIn = await prisma.stockMovement.aggregate({
            _sum: { quantity: true },
            where: { partId: item.partId, type: "in" },
          });
          const movementsOut = await prisma.stockMovement.aggregate({
            _sum: { quantity: true },
            where: { partId: item.partId, type: "out" },
          });

          const totalIn = movementsIn._sum.quantity || 0;
          const totalOut = movementsOut._sum.quantity || 0;
          const currentTotalQty = totalIn - totalOut; // This is (Overall Stock - Qty)

          // 3. Derive Old Stock Qty (Overall Stock Qty before removal)
          const qtyRemoved = item.quantity;
          const oldQty = currentTotalQty + qtyRemoved;

          // 4. Calculate New Avg Cost
          const currentAvgCost =
            (part as any).avgCost ??
            part.cost ??
            (part as any).purchasePrice ??
            0;
          const rate = item.cost || currentAvgCost;

          let newAvgCost = currentAvgCost;

          // Standard Removal Formula
          // Formula: ((Overall Stock Qty * Avg Cost) - (Rate * Qty)) / (Overall Stock - Qty)
          if (currentTotalQty > 0 && oldQty > 0) {
            newAvgCost =
              (oldQty * currentAvgCost - rate * qtyRemoved) / currentTotalQty;
          }

          console.log(`[REMOVAL] Part ${item.partId}:`);
          console.log(
            `  Old Qty: ${oldQty}, Removed: ${qtyRemoved}, Current: ${currentTotalQty}`,
          );
          console.log(
            `  Old AvgCost: ${currentAvgCost}, Rate: ${rate}, New AvgCost: ${newAvgCost}`,
          );

          // 5. Update Part with new avgCost and purchasePrice
          await prisma.part.update({
            where: { id: item.partId },
            data: {
              purchasePrice: rate, // Save the rate used for removal
              avgCost: newAvgCost, // Save the calculated weighted average
              cost: newAvgCost, // Also update cost field to keep it in sync
              updatedAt: new Date(),
            } as any,
          });

          console.log(
            `  ✅ Part ${item.partId} updated - purchasePrice: ${rate}, avgCost: ${newAvgCost}`,
          );
        }
      }
    }

    // Update adjustment status to approved
    const updatedAdjustment = (await prisma.adjustment.update({
      where: { id },
      data: {
        status: "approved",
      } as any,
      include: {
        AdjustmentItem: {
          include: {
            Part: {
              include: {
                Brand: true,
              },
            },
          },
        },
      },
    })) as any;

    // Fetch voucher separately
    const updatedVoucherInfo = updatedAdjustment.voucherId
      ? await prisma.voucher.findUnique({
          where: { id: updatedAdjustment.voucherId },
          select: {
            id: true,
            voucherNumber: true,
            status: true,
          },
        })
      : null;

    updatedAdjustment.voucher = updatedVoucherInfo;

    res.json({
      id: updatedAdjustment.id,
      date: updatedAdjustment.date,
      subject: updatedAdjustment.subject,
      total_amount: updatedAdjustment.totalAmount,
      status: updatedAdjustment.status,
      voucher_id: updatedAdjustment.voucherId,
      voucher_number: updatedAdjustment.voucher?.voucherNumber || null,
      voucher_status: updatedAdjustment.voucher?.status || null,
      items: (updatedAdjustment.AdjustmentItem || []).map((item: any) => ({
        id: item.id,
        part_id: item.partId,
        part_no: item.Part.partNo,
        quantity: item.quantity,
        cost: item.cost,
        rack_id: item.rackId,
        rack_code: item.rack?.codeNo || null,
        shelf_id: item.shelfId,
        shelf_no: item.shelf?.shelfNo || null,
      })),
      items_count: updatedAdjustment.AdjustmentItem?.length || 0,
      message:
        "Adjustment approved successfully. Voucher auto-approved and accounts updated.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete adjustment (Soft delete with reversal)
router.delete("/adjustments/:id", async (req: Request, res: Response) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { id } = req.params;

    // 1. Fetch adjustment and its voucher
    const adjRes = await client.query(
      'SELECT * FROM "Adjustment" WHERE id = $1',
      [id],
    );
    if ((adjRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Adjustment not found" });
    }
    const adjustment = adjRes.rows[0];

    if (adjustment.deletedAt) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Adjustment is already deleted" });
    }

    // 1b. If adding inventory and approved, check if deletion will cause negative stock
    if (adjustment.addInventory === true && adjustment.status === "approved") {
      const itemsRes = await client.query(
        'SELECT ai.*, p."partNo" FROM "AdjustmentItem" ai JOIN "Part" p ON ai."partId" = p.id WHERE ai."adjustmentId" = $1',
        [id],
      );

      for (const item of itemsRes.rows) {
        const partId = item.partId;
        const adjQty = item.quantity;

        // Calculate current stock for this part
        const movementsRes = await client.query(
          'SELECT SUM(CASE WHEN type = \'in\' THEN quantity ELSE -quantity END) as balance FROM "StockMovement" WHERE "partId" = $1',
          [partId],
        );
        const currentStock = parseInt(movementsRes.rows[0].balance || "0");

        if (currentStock - adjQty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `Cannot delete adjustment. Deleting ${adjQty} units of Part ${item.partNo} would cause stock to become negative. Current stock is ${currentStock}.`,
          });
        }
      }
    }

    // 2. Reverse Account Balances if voucher exists
    if (adjustment.voucherId) {
      const entriesRes = await client.query(
        'SELECT * FROM "VoucherEntry" WHERE "voucherId" = $1',
        [adjustment.voucherId],
      );

      for (const entry of entriesRes.rows) {
        if (!entry.accountId) continue;

        // Get account type to determine reversal direction
        const accTypeRes = await client.query(
          `SELECT mg.type FROM "Account" a 
           JOIN "Subgroup" sg ON a."subgroupId" = sg.id 
           JOIN "MainGroup" mg ON sg."mainGroupId" = mg.id 
           WHERE a.id = $1`,
          [entry.accountId],
        );
        const type = accTypeRes.rows[0]?.type?.toLowerCase();

        let reversalChange = 0;
        // Calculation:
        // Original was: Equity + (Credit - Debit)
        // Reversal: Equity + (Debit - Credit) <-- This undoes it.

        if (["asset", "expense", "cost"].includes(type)) {
          reversalChange = entry.credit - entry.debit;
        } else {
          reversalChange = entry.debit - entry.credit;
        }

        await client.query(
          'UPDATE "Account" SET "currentBalance" = "currentBalance" + $1, "updatedAt" = NOW() WHERE id = $2',
          [reversalChange, entry.accountId],
        );
      }

      // 3. Soft Delete Voucher and Entries
      await client.query(
        'UPDATE "VoucherEntry" SET "deletedAt" = NOW() WHERE "voucherId" = $1',
        [adjustment.voucherId],
      );
      await client.query(
        'UPDATE "Voucher" SET "deletedAt" = NOW(), status = \'deleted\', "updatedAt" = NOW() WHERE id = $1',
        [adjustment.voucherId],
      );
    }

    // 3b. Update Part Average Cost before deleting stock movements
    if (adjustment.status === "approved") {
      const itemsRes = await client.query(
        'SELECT * FROM "AdjustmentItem" WHERE "adjustmentId" = $1',
        [id],
      );

      for (const item of itemsRes.rows) {
        const partId = item.partId;
        const qty = item.quantity;
        const rate = parseFloat(item.cost) || 0;

        // Get part data
        const partRes = await client.query(
          'SELECT "avgCost", "cost", "purchasePrice" FROM "Part" WHERE id = $1',
          [partId],
        );
        const part = partRes.rows[0];
        if (!part) continue;

        const currentAvg = parseFloat(
          part.avgCost || part.cost || part.purchasePrice || "0",
        );

        // Calculate current overall stock
        const movementsRes = await client.query(
          'SELECT SUM(CASE WHEN type = \'in\' THEN quantity ELSE -quantity END) as balance FROM "StockMovement" WHERE "partId" = $1',
          [partId],
        );
        const overallStock = parseInt(movementsRes.rows[0].balance || "0");

        let newAvg = currentAvg;
        if (adjustment.addInventory) {
          // Case 1: Deleting Add Adjustment
          // New Avg = ((overall stock * avg) - (rate * qty)) / (overall stock - qty)
          const denominator = overallStock - qty;
          if (denominator > 0) {
            newAvg = (overallStock * currentAvg - rate * qty) / denominator;
          }
        } else {
          // Case 2: Deleting Remove Adjustment
          // New Avg = ((overall stock * avg) + (rate * qty)) / (overall stock + qty)
          const denominator = overallStock + qty;
          if (denominator > 0) {
            newAvg = (overallStock * currentAvg + rate * qty) / denominator;
          }
        }

        console.log(`[DELETE ADJUSTMENT] Part ${partId}:`);
        console.log(
          `  Formula: ${adjustment.addInventory ? "DELETE ADD" : "DELETE REMOVE"}`,
        );
        console.log(
          `  Values: Stock=${overallStock}, Avg=${currentAvg}, Rate=${rate}, Qty=${qty}`,
        );
        console.log(`  Result: New Avg = ${newAvg}`);

        await client.query(
          'UPDATE "Part" SET "avgCost" = $1, "cost" = $2, "updatedAt" = NOW() WHERE id = $3',
          [newAvg, newAvg, partId],
        );
      }
    }

    // 4. Delete associated stock movements (this reverses the stock quantity)
    await client.query(
      'DELETE FROM "StockMovement" WHERE "referenceType" = \'adjustment\' AND "referenceId" = $1',
      [id],
    );

    // 5. Soft delete the adjustment
    await client.query(
      'UPDATE "Adjustment" SET "deletedAt" = NOW(), "updatedAt" = NOW(), status = \'deleted\' WHERE id = $1',
      [id],
    );

    await client.query("COMMIT");
    res.json({
      message: "Adjustment deleted and entries reversed successfully",
    });
  } catch (error: any) {
    if (client) await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get purchase orders
router.get("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const { status, from_date, to_date, part_id, page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const partId = String(part_id || req.query.partId || "").trim();

    const where: any = {};
    if (status) {
      where.status = status as string;
    }
    if (from_date || to_date) {
      where.date = {};
      if (from_date) {
        where.date.gte = new Date(from_date as string);
      }
      if (to_date) {
        where.date.lte = new Date(to_date as string);
      }
    }
    if (partId) {
      where.PurchaseOrderItem = {
        some: { partId },
      };
    }

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          PurchaseOrderItem: {
            include: {
              Part: {
                include: {
                  Brand: true,
                  Category: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc", // Sort by creation date, newest first
        },
        skip,
        take: limitNum,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    // Fetch suppliers for orders that have supplierId
    const supplierIds = orders
      .filter((po) => po.supplierId)
      .map((po) => po.supplierId);
    const suppliers =
      supplierIds.length > 0
        ? await prisma.supplier.findMany({
            where: { id: { in: supplierIds as string[] } },
          })
        : [];
    const supplierMap = new Map(
      suppliers.map((s) => [s.id, s.companyName || s.name || "N/A"]),
    );

    res.json({
      data: orders.map((po) => ({
        id: po.id,
        po_number: po.poNumber,
        date: po.date,
        invoice_date: (po as any).invoiceDate ?? null,
        supplier_id: po.supplierId,
        supplier_name: po.supplierId
          ? supplierMap.get(po.supplierId) || "N/A"
          : "N/A",
        status: po.status,
        expected_date: po.expectedDate,
        notes: po.notes,
        total_amount: po.totalAmount,
        items_count: po.PurchaseOrderItem.length,
        items: po.PurchaseOrderItem.map((item) => ({
          id: item.id,
          part_id: item.partId,
          part_no: item.Part.partNo,
          part_description: item.Part.description,
          brand: item.Part.Brand?.name || "",
          quantity: item.quantity,
          unit_cost: item.unitCost,
          total_cost: item.totalCost,
          received_qty: item.receivedQty,
          notes: item.notes,
        })),
        created_at: po.createdAt,
      })),
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

// Get purchase orders by part ID
router.get(
  "/purchase-orders/by-part/:partId",
  async (req: Request, res: Response) => {
    try {
      const { partId } = req.params;
      const { page = "1", limit = "50" } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Find all purchase order items for this part
      const poItems = await prisma.purchaseOrderItem.findMany({
        where: { partId },
        include: {
          PurchaseOrder: {
            include: {
              PurchaseOrderItem: {
                include: {
                  Part: {
                    include: {
                      Brand: true,
                      Category: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          PurchaseOrder: {
            createdAt: "desc",
          },
        },
        skip,
        take: limitNum,
      });

      // Get unique purchase orders and their suppliers
      const uniquePOIds = [
        ...new Set(poItems.map((item) => item.purchaseOrderId)),
      ];
      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: { id: { in: uniquePOIds } },
        include: {
          PurchaseOrderItem: {
            where: { partId },
            include: {
              Part: {
                include: {
                  Brand: true,
                  Category: true,
                },
              },
            },
          },
        },
      });

      // Fetch suppliers
      const supplierIds = purchaseOrders
        .filter((po) => po.supplierId)
        .map((po) => po.supplierId);
      const suppliers =
        supplierIds.length > 0
          ? await prisma.supplier.findMany({
              where: { id: { in: supplierIds as string[] } },
            })
          : [];
      const supplierMap = new Map(
        suppliers.map((s) => [s.id, s.companyName || s.name || "N/A"]),
      );

      // Format response with purchase order details and the specific item for this part
      const result = purchaseOrders
        .map((po) => {
          const itemForPart = po.PurchaseOrderItem.find(
            (item) => item.partId === partId,
          );
          return {
            id: po.id,
            po_number: po.poNumber,
            date: po.date,
            supplier_id: po.supplierId,
            supplier_name: po.supplierId
              ? supplierMap.get(po.supplierId) || "N/A"
              : "N/A",
            status: po.status,
            expected_date: po.expectedDate,
            notes: po.notes,
            total_amount: po.totalAmount,
            item: itemForPart
              ? {
                  id: itemForPart.id,
                  part_id: itemForPart.partId,
                  part_no: itemForPart.Part.partNo,
                  part_description: itemForPart.Part.description,
                  brand: itemForPart.Part.Brand?.name || "",
                  quantity: itemForPart.quantity,
                  unit_cost: itemForPart.unitCost,
                  total_cost: itemForPart.totalCost,
                  received_qty: itemForPart.receivedQty,
                  notes: itemForPart.notes,
                }
              : null,
            created_at: po.createdAt,
          };
        })
        .filter((po) => po.item !== null); // Only return POs that have items for this part

      const total = await prisma.purchaseOrderItem.count({
        where: { partId },
      });

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
  },
);

// Generate next PO number
async function generatePoNumber(): Promise<string> {
  try {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `PO-${year}${month}-`;

    // Find all PO numbers for current month
    const existingOrders = await prisma.purchaseOrder.findMany({
      where: {
        poNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        poNumber: "desc",
      },
    });

    // Extract numbers and find max
    const numbers = existingOrders
      .map((order) => {
        const match = order.poNumber.match(new RegExp(`^${prefix}(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((num) => num > 0);

    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = maxNum + 1;

    return `${prefix}${String(nextNum).padStart(3, "0")}`;
  } catch (error) {
    // Fallback
    const year = String(new Date().getFullYear()).slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const timestamp = Date.now().toString().slice(-3);
    return `PO-${year}${month}-${timestamp}`;
  }
}

// Create purchase order
router.post("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const { po_number, date, supplier_id, expected_date, notes, items } =
      req.body;

    if (!date || !items || items.length === 0) {
      return res.status(400).json({ error: "date and items are required" });
    }

    // Auto-generate PO number if not provided or if it already exists
    let poNumber = po_number;
    if (!poNumber || poNumber.trim() === "") {
      poNumber = await generatePoNumber();
    } else {
      // Check if PO number already exists
      const existing = await prisma.purchaseOrder.findUnique({
        where: { poNumber: poNumber.trim() },
      });
      if (existing) {
        // Generate a new one if it exists
        poNumber = await generatePoNumber();
      }
    }

    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (item.total_cost || item.unit_cost * item.quantity);
    }, 0);

    const order = await prisma.purchaseOrder.create({
      data: {
        id: crypto.randomUUID(),
        poNumber: poNumber.trim(),
        date: new Date(date),
        supplierId: supplier_id || null,
        expectedDate: expected_date ? new Date(expected_date) : null,
        notes: notes || null,
        totalAmount: totalAmount,
        status: "Draft",
        updatedAt: new Date(),
      } as Prisma.PurchaseOrderUncheckedCreateInput,
    });

    // Create PurchaseOrderItem records
    await prisma.purchaseOrderItem.createMany({
      data: items.map((item: any) => ({
        id: crypto.randomUUID(),
        purchaseOrderId: order.id,
        partId: item.part_id,
        quantity: item.quantity,
        unitCost: item.unit_cost,
        totalCost: item.total_cost || item.unit_cost * item.quantity,
        receivedQty: item.received_qty || 0,
        notes: item.notes || null,
      })),
    });

    // Fetch the order with items
    const orderWithItems = await prisma.purchaseOrder.findUnique({
      where: { id: order.id },
      include: {
        PurchaseOrderItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    res.status(201).json({
      id: orderWithItems.id,
      po_number: orderWithItems.poNumber,
      date: orderWithItems.date,
      status: orderWithItems.status,
      total_amount: orderWithItems.totalAmount,
      items_count: orderWithItems.PurchaseOrderItem.length,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      // Unique constraint violation - try to generate a new PO number
      try {
        const { date, supplier_id, expected_date, notes, items } = req.body;
        const poNumber = await generatePoNumber();
        const totalAmount = items.reduce((sum: number, item: any) => {
          return sum + (item.total_cost || item.unit_cost * item.quantity);
        }, 0);

        const order = await prisma.purchaseOrder.create({
          data: {
            poNumber,
            date: new Date(date),
            supplierId: supplier_id || null,
            expectedDate: expected_date ? new Date(expected_date) : null,
            notes: notes || null,
            totalAmount: totalAmount,
            status: "Draft",
          } as Prisma.PurchaseOrderUncheckedCreateInput,
        });

        // Create PurchaseOrderItem records
        await prisma.purchaseOrderItem.createMany({
          data: items.map((item: any) => ({
            purchaseOrderId: order.id,
            partId: item.part_id,
            quantity: item.quantity,
            unitCost: item.unit_cost,
            totalCost: item.total_cost || item.unit_cost * item.quantity,
            receivedQty: item.received_qty || 0,
            notes: item.notes || null,
          })),
        });

        // Fetch the order with items
        const orderWithItems = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
          include: {
            PurchaseOrderItem: {
              include: {
                Part: true,
              },
            },
          },
        });

        return res.status(201).json({
          id: orderWithItems.id,
          po_number: orderWithItems.poNumber,
          date: orderWithItems.date,
          status: orderWithItems.status,
          total_amount: orderWithItems.totalAmount,
          items_count: orderWithItems.PurchaseOrderItem.length,
        });
      } catch (retryError: any) {
        return res.status(500).json({
          error: "Failed to create purchase order. Please try again.",
        });
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Get single purchase order
router.get("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        PurchaseOrderItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    // Fetch supplier if supplierId exists
    let supplierName = "N/A";
    if (order.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: order.supplierId },
      });
      supplierName = supplier
        ? supplier.companyName || supplier.name || "N/A"
        : "N/A";
    }

    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        referenceId: order.id,
        type: "in",
        referenceType: { in: ["import_purchase", "purchase", "Purchase"] },
      },
      include: { Rack: true, Shelf: true, Store: true },
    });
    const movementByPartId = new Map(
      stockMovements.map((mv) => [mv.partId, mv]),
    );

    res.json({
      id: order.id,
      po_number: order.poNumber,
      date: order.date,
      supplier_id: order.supplierId,
      supplier_name: supplierName,
      status: order.status,
      expected_date: order.expectedDate,
      notes: order.notes,
      purchase_quotation_id: (order as any).purchaseQuotationId ?? null,
      invoice_no: (order as any).invoiceNo ?? null,
      invoice_date: (order as any).invoiceDate ?? null,
      bl_no: (order as any).blNo ?? null,
      bl_date: (order as any).blDate ?? null,
      currency: (order as any).currency ?? null,
      conversion_rate: Number((order as any).conversionRate || 0) || null,
      fc_total: Number((order as any).fcTotal || 0),
      total_amount: order.totalAmount,
      items: order.PurchaseOrderItem.map((item) => {
        const mv = movementByPartId.get(item.partId);
        return {
        id: item.id,
        part_id: item.partId,
        part_no: item.Part.partNo,
        part_description: item.Part.description,
        brand: item.Part.Brand?.name || "",
        quantity: item.quantity,
        unit_cost: item.unitCost,
        total_cost: item.totalCost,
        received_qty: item.receivedQty,
        additional_qty: (item as any).additionalQty ?? 0,
        back_qty: (item as any).backQty ?? 0,
        fc_rate: (item as any).fcRate ?? 0,
        fc_amount: (item as any).fcAmount ?? 0,
        weight: (item as any).weight ?? 0,
        total_weight: (item as any).totalWeight ?? 0,
        store_id: mv?.storeId ?? null,
        rack_id: mv?.rackId ?? null,
        shelf_id: mv?.shelfId ?? null,
        rack_name: mv?.Rack?.codeNo ?? null,
        shelf_name: mv?.Shelf?.shelfNo ?? null,
        store_name: mv?.Store?.name ?? null,
        notes: item.notes,
      };
      }),
      created_at: order.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import-PO expense buckets -> chart-of-accounts codes under subgroup 302
// (Purchase expenses Payables). Each of these is Dr Inventory / Cr <payable>.
const IMPORT_EXPENSE_ACCOUNTS: Array<{
  field: string;
  code: string;
  label: string;
}> = [
  { field: "frtExpLc", code: "302002", label: "Frt.Exp" },
  { field: "customsDuty", code: "302003", label: "C.D" },
  { field: "additionalCustomsDuty", code: "302004", label: "A.C.D" },
  { field: "regulatoryDuty", code: "302005", label: "R.D" },
  { field: "salesTax", code: "302006", label: "S.T" },
  { field: "additionalSalesTax", code: "302007", label: "A.S.T" },
  { field: "incomeTax", code: "302008", label: "I.T" },
  { field: "ed", code: "302009", label: "E.D" },
  { field: "doAmount", code: "302010", label: "D.O" },
  { field: "miscExp", code: "302011", label: "Misc.Exp" },
  { field: "locFrt", code: "302012", label: "Loc.Frt" },
  { field: "crnExp", code: "302013", label: "Dmg.Exp" },
];

/**
 * Receive an import Purchase Order: create stock-in movements, update part
 * moving-average cost (DPO-style, landed cost = goods + distributed import
 * expenses), and post the import Journal Voucher. For international suppliers
 * the PO exchange rate is stored on the voucher.
 */
async function receiveImportPurchaseOrder(
  orderId: string,
  storeId: string | null,
) {
  const round2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
  const round4 = (n: any) => Math.round((Number(n) || 0) * 10000) / 10000;

  return await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { PurchaseOrderItem: { include: { Part: true } } },
    });
    if (!order) throw new Error("Purchase order not found");

    const supplier = order.supplierId
      ? await tx.supplier.findUnique({ where: { id: order.supplierId } })
      : null;
    const supplierName =
      supplier?.companyName || supplier?.name || "Supplier";
    const isInternational =
      String((supplier as any)?.type || "").toLowerCase() === "international";
    const conversionRate = Number(order.conversionRate) || 1;

    // ---- Amounts (all in local currency) ----
    const receivedItems = order.PurchaseOrderItem.filter(
      (i) => i.receivedQty > 0,
    );
    const goodsLc = round2(
      receivedItems.reduce(
        (s, i) =>
          s +
          (Number(i.totalCost) || Number(i.unitCost) * i.receivedQty || 0),
        0,
      ),
    );
    const invoiceLc = Number(order.totalAmount) || goodsLc;
    const pkgExpAmt = round2(
      (invoiceLc * (Number(order.pkgExpPercent) || 0)) / 100,
    );
    const discAmt = round2(
      Number(order.discAmt) ||
        (invoiceLc * (Number(order.invDiscPercent) || 0)) / 100,
    );
    const expenseAmounts: Record<string, number> = {
      frtExpLc: round2((Number(order.frtExp) || 0) * conversionRate),
      customsDuty: round2(order.customsDuty),
      additionalCustomsDuty: round2(order.additionalCustomsDuty),
      regulatoryDuty: round2(order.regulatoryDuty),
      salesTax: round2(order.salesTax),
      additionalSalesTax: round2(order.additionalSalesTax),
      incomeTax: round2(order.incomeTax),
      ed: round2(order.ed),
      doAmount: round2(order.doAmount),
      miscExp: round2(order.miscExp),
      locFrt: round2(order.locFrt),
      crnExp: round2(order.crnExp),
    };
    const otherExpTotal = round2(
      Object.values(expenseAmounts).reduce((s, v) => s + v, 0),
    );
    // Everything capitalised into inventory: goods + pkg + all other expenses.
    const expenseForCost = round2(pkgExpAmt + otherExpTotal);

    // ---- Distribute expenses across received lines by qty x weight ----
    const shares = receivedItems.map((i) => {
      const w = Number(i.weight) || Number(i.Part?.weight) || 0;
      return w > 0 ? i.receivedQty * w : i.receivedQty;
    });
    const totalShare = shares.reduce((s, v) => s + v, 0);
    const lineExpense = shares.map((sh) => {
      if (expenseForCost <= 0) return 0;
      if (totalShare <= 0)
        return receivedItems.length > 0
          ? expenseForCost / receivedItems.length
          : 0;
      return (sh / totalShare) * expenseForCost;
    });

    // ---- Stock-in + moving-average cost (mirrors the DPO pipeline) ----
    for (let idx = 0; idx < receivedItems.length; idx++) {
      const item = receivedItems[idx];
      const partId = item.partId;
      const qty = item.receivedQty;
      const baseRate = Number(item.unitCost) || 0;
      if (!partId || qty <= 0) continue;

      const existingMovement = await tx.stockMovement.findFirst({
        where: {
          referenceType: "import_purchase",
          referenceId: order.id,
          partId,
        },
      });
      if (existingMovement) continue;

      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          partId,
          type: "in",
          quantity: qty,
          storeId: storeId || null,
          referenceType: "import_purchase",
          referenceId: order.id,
          supplierId: order.supplierId,
          notes: `Import Purchase Order ${order.poNumber} - Received`,
        } as any,
      });

      const stockIn = await tx.stockMovement.aggregate({
        _sum: { quantity: true },
        where: { partId, type: "in" },
      });
      const stockOut = await tx.stockMovement.aggregate({
        _sum: { quantity: true },
        where: { partId, type: "out" },
      });
      const currentTotalStock =
        (stockIn._sum.quantity || 0) - (stockOut._sum.quantity || 0);
      const oldQty = currentTotalStock - qty;
      const currentAvg =
        Number(item.Part?.avgCost) || Number(item.Part?.cost) || 0;
      const landedValue = baseRate * qty + lineExpense[idx];
      const denom = oldQty + qty;
      const newAvg =
        oldQty > 0 && currentAvg > 0 && denom > 0
          ? (oldQty * currentAvg + landedValue) / denom
          : landedValue / qty;

      await tx.part.update({
        where: { id: partId },
        data: {
          ...(baseRate > 0 ? { purchasePrice: round4(baseRate) } : {}),
          ...(Number.isFinite(newAvg) && newAvg > 0
            ? { avgCost: round4(newAvg), cost: round4(newAvg) }
            : {}),
        },
      });
    }

    // Clear reservations for the received parts.
    await tx.stockReservation.deleteMany({
      where: {
        partId: { in: order.PurchaseOrderItem.map((i) => i.partId) },
        status: "reserved",
      },
    });

    // ---- Resolve accounts for the voucher ----
    let inventoryAccount = await tx.account.findFirst({
      where: {
        status: "Active",
        OR: [{ code: "101001" }, { Subgroup: { code: "104" } }],
      },
    });

    let supplierAccount = order.supplierId
      ? await tx.account.findFirst({
          where: {
            code: { startsWith: "301" },
            OR: [
              { supplierId: order.supplierId },
              { name: supplier?.name || "" },
              { name: supplier?.companyName || "" },
            ],
          },
        })
      : null;
    if (!supplierAccount && order.supplierId && supplier) {
      const payablesSubgroup = await tx.subgroup.findFirst({
        where: { code: "301" },
      });
      if (payablesSubgroup) {
        const last = await tx.account.findFirst({
          where: { code: { startsWith: "301" } },
          orderBy: { code: "desc" },
        });
        let nextCode = "301001";
        const m = last?.code.match(/^301(\d+)$/);
        if (m) nextCode = `301${String(parseInt(m[1], 10) + 1).padStart(3, "0")}`;
        supplierAccount = await tx.account.create({
          data: {
            subgroupId: payablesSubgroup.id,
            code: nextCode,
            name: supplier.name || supplier.companyName || "Supplier",
            description: `Supplier Account: ${supplierName}`,
            openingBalance: 0,
            currentBalance: 0,
            status: "Active",
            canDelete: false,
            supplierId: supplier.id,
          } as Prisma.AccountUncheckedCreateInput,
        });
      }
    }

    if (!inventoryAccount || !supplierAccount) {
      throw new Error(
        "Cannot post import voucher: inventory or supplier account not found.",
      );
    }

    const discountAccount =
      discAmt > 0.001
        ? await tx.account.findFirst({
            where: {
              status: "Active",
              OR: [
                { code: "901002" },
                { name: { contains: "Cost Inventory (Discount" } },
                { name: { contains: "Inventory Discount" } },
              ],
            },
          })
        : null;

    const acctLabel = (a: { code: string; name: string }) =>
      `${a.code}-${a.name}`;
    const entries: any[] = [];
    const pushEntry = (
      acc: { id: string; code: string; name: string },
      description: string,
      debit: number,
      credit: number,
    ) => {
      entries.push({
        id: crypto.randomUUID(),
        accountId: acc.id,
        accountName: acctLabel(acc),
        description,
        debit: round2(debit),
        credit: round2(credit),
        sortOrder: entries.length,
      });
    };

    // 1) Goods: Dr Inventory / Cr Supplier
    pushEntry(
      inventoryAccount as any,
      `Import PO ${order.poNumber}: Inventory received`,
      goodsLc,
      0,
    );
    pushEntry(
      supplierAccount as any,
      `Import PO ${order.poNumber}: ${supplierName} liability`,
      0,
      goodsLc,
    );

    // 2) Package expense: Dr Inventory / Cr Supplier
    if (pkgExpAmt > 0.001) {
      pushEntry(
        inventoryAccount as any,
        `Import PO ${order.poNumber}: Package expense`,
        pkgExpAmt,
        0,
      );
      pushEntry(
        supplierAccount as any,
        `Import PO ${order.poNumber}: Package expense`,
        0,
        pkgExpAmt,
      );
    }

    // 3) Discount: Dr Supplier / Cr Cost Inventory (Discounts)
    if (discAmt > 0.001 && discountAccount) {
      pushEntry(
        supplierAccount as any,
        `Import PO ${order.poNumber}: Invoice discount`,
        discAmt,
        0,
      );
      pushEntry(
        discountAccount as any,
        `Import PO ${order.poNumber}: Invoice discount`,
        0,
        discAmt,
      );
    }

    // 4) Other expenses: Dr Inventory / Cr <purchase expense payable>
    for (const def of IMPORT_EXPENSE_ACCOUNTS) {
      const amt = round2(expenseAmounts[def.field]);
      if (amt <= 0.001) continue;
      const expAcc = await tx.account.findFirst({
        where: {
          status: "Active",
          OR: [
            { code: def.code },
            { name: def.label },
            // Keep matching the previous chart name for Dmg.Exp (was Cm.Exp)
            ...(def.field === "crnExp" ? [{ name: "Cm.Exp" }] : []),
          ],
        },
      });
      if (!expAcc) continue;
      pushEntry(
        inventoryAccount as any,
        `Import PO ${order.poNumber}: ${def.label}`,
        amt,
        0,
      );
      pushEntry(
        expAcc as any,
        `Import PO ${order.poNumber}: ${def.label} payable`,
        0,
        amt,
      );
    }

    const totalDebit = round2(
      entries.reduce((s, e) => s + e.debit, 0),
    );
    const totalCredit = round2(
      entries.reduce((s, e) => s + e.credit, 0),
    );

    if (totalDebit > 0.001) {
      const lastVoucher = await tx.voucher.findFirst({
        where: { type: "journal", voucherNumber: { startsWith: "JV" } },
        orderBy: { voucherNumber: "desc" },
      });
      let nextNumber = 1;
      const jm = lastVoucher?.voucherNumber.match(/^JV(\d+)$/);
      if (jm) nextNumber = parseInt(jm[1], 10) + 1;
      const voucherNumber = `JV${String(nextNumber).padStart(4, "0")}`;

      const voucherDate = (order as any).invoiceDate || order.date;
      await tx.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber,
          type: "journal",
          date: voucherDate,
          narration: `Import Purchase Order: ${order.poNumber}`,
          totalDebit,
          totalCredit,
          status: "posted",
          createdBy: "System",
          approvedBy: "System",
          approvedAt: new Date(),
          isSystemGenerated: true,
          ...(isInternational ? { conversionRate } : {}),
          updatedAt: new Date(),
          VoucherEntry: { create: entries },
        } as any,
      });

      for (const entry of entries) {
        const acc = await tx.account.findUnique({
          where: { id: entry.accountId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (!acc) continue;
        const type = acc.Subgroup.MainGroup.type.toLowerCase();
        const change =
          type === "asset" || type === "expense" || type === "cost"
            ? entry.debit - entry.credit
            : entry.credit - entry.debit;
        await tx.account.update({
          where: { id: entry.accountId },
          data: { currentBalance: { increment: change } },
        });
      }
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "Received" },
    });

    return {
      id: updated.id,
      po_number: updated.poNumber,
      status: updated.status,
      total_amount: updated.totalAmount,
      voucher_total: totalDebit,
    };
  });
}

// Update purchase order
// Assign rack/shelf locations to received purchase order stock movements.
router.put("/purchase-orders/:id/locations", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { items, store_id } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { PurchaseOrderItem: true },
    });
    if (!order) {
      return res.status(404).json({ error: "Purchase order not found" });
    }
    if (order.status !== "Received") {
      return res
        .status(400)
        .json({ error: "Locations can only be assigned after the order is received" });
    }

    const referenceType = (order as any).purchaseQuotationId
      ? "import_purchase"
      : "purchase";

    await prisma.$transaction(async (tx) => {
      const adjustPartRackShelf = async (
        partId: string,
        storeId: string | null,
        rackId: string | null,
        shelfId: string | null,
        delta: number,
      ) => {
        if (!storeId || !delta) return;
        const existing = await tx.partRackShelf.findFirst({
          where: {
            partId,
            storeId,
            rackId: rackId ?? null,
            shelfId: shelfId ?? null,
          },
        });
        if (delta < 0) {
          if (!existing) return;
          const nextQty = Number(existing.quantity || 0) + delta;
          if (nextQty <= 0) {
            await tx.partRackShelf.delete({ where: { id: existing.id } });
          } else {
            await tx.partRackShelf.update({
              where: { id: existing.id },
              data: { quantity: nextQty },
            });
          }
          return;
        }
        if (existing) {
          await tx.partRackShelf.update({
            where: { id: existing.id },
            data: { quantity: { increment: delta } },
          });
        } else {
          await tx.partRackShelf.create({
            data: {
              id: crypto.randomUUID(),
              partId,
              storeId,
              rackId: rackId ?? null,
              shelfId: shelfId ?? null,
              quantity: delta,
            },
          });
        }
      };

      for (const item of items) {
        const partId = String(item.part_id || item.partId || "").trim();
        if (!partId) continue;

        const movement = await tx.stockMovement.findFirst({
          where: {
            referenceType,
            referenceId: order.id,
            partId,
            type: "in",
          },
        });
        if (!movement) continue;

        const qty = Number(movement.quantity) || 0;
        if (qty <= 0) continue;

        const newStoreId =
          item.store_id || item.storeId || store_id || movement.storeId || null;
        const newRackId = item.rack_id || item.rackId || null;
        const newShelfId = item.shelf_id || item.shelfId || null;

        if (movement.storeId) {
          await adjustPartRackShelf(
            partId,
            movement.storeId,
            movement.rackId ?? null,
            movement.shelfId ?? null,
            -qty,
          );
        }

        await tx.stockMovement.update({
          where: { id: movement.id },
          data: {
            storeId: newStoreId,
            rackId: newRackId,
            shelfId: newShelfId,
          } as any,
        });

        if (newStoreId) {
          await adjustPartRackShelf(
            partId,
            newStoreId,
            newRackId,
            newShelfId,
            qty,
          );
        }
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      po_number,
      date,
      supplier_id,
      expected_date,
      notes,
      status,
      items,
      expenses,
    } = req.body;

    const existingOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        PurchaseOrderItem: {
          include: {
            Part: true,
          },
        },
      },
    });
    if (!existingOrder) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    // Import POs (created from an import quotation) get a dedicated receive:
    // stock-in + DPO-style landed-cost averaging + import JV (with duties /
    // clearing expenses and, for international suppliers, the PO exchange rate).
    if (
      (existingOrder as any).purchaseQuotationId &&
      status === "Received" &&
      existingOrder.status !== "Received"
    ) {
      try {
        const result = await receiveImportPurchaseOrder(
          id,
          req.body?.store_id || null,
        );
        return res.json(result);
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Calculate total amount from received items
    const receivedItems = items
      ? items.filter((item: any) => item.received_qty > 0)
      : existingOrder.PurchaseOrderItem.filter((item) => item.receivedQty > 0);
    const totalAmount = receivedItems.reduce((sum: number, item: any) => {
      if (items) {
        return sum + (item.total_cost || item.unit_cost * item.received_qty);
      } else {
        return sum + (item.totalCost || item.unitCost * item.receivedQty);
      }
    }, 0);

    // Calculate total expenses if provided
    const totalExpenses = expenses
      ? expenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0)
      : 0;
    const grandTotal = totalAmount + totalExpenses;

    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(po_number && { poNumber: po_number }),
        ...(date && { date: new Date(date) }),
        ...(supplier_id !== undefined && { supplierId: supplier_id || null }),
        ...(expected_date && { expectedDate: new Date(expected_date) }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(status && { status }),
        ...(totalAmount !== undefined && { totalAmount: grandTotal }),
        ...(items && {
          items: {
            deleteMany: {},
            create: items.map((item: any) => ({
              partId: item.part_id,
              quantity: item.quantity,
              unitCost: item.unit_cost,
              totalCost: item.total_cost || item.unit_cost * item.quantity,
              receivedQty: item.received_qty || 0,
              notes: item.notes || null,
            })),
          },
        }),
      },
      include: {
        PurchaseOrderItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    // Recalculate grandTotal from updated order items (in case items were updated)
    const updatedReceivedItems = order.PurchaseOrderItem.filter(
      (item) => item.receivedQty > 0,
    );
    const updatedTotalAmount = updatedReceivedItems.reduce(
      (sum: number, item: any) => {
        return sum + (item.totalCost || item.unitCost * item.receivedQty);
      },
      0,
    );
    const updatedGrandTotal = updatedTotalAmount + totalExpenses;

    // Create stock movements when order is received
    if (status === "Received" && existingOrder.status !== "Received") {
      const { store_id } = req.body;
      try {
        // Create stock movements for all received items
        for (const item of order.PurchaseOrderItem) {
          if (item.receivedQty > 0) {
            // Check if stock movement already exists for this PO and item
            const existingMovement = await prisma.stockMovement.findFirst({
              where: {
                referenceType: "purchase",
                referenceId: order.id,
                partId: item.partId,
              },
            });

            // Only create if movement doesn't exist
            if (!existingMovement) {
              await prisma.stockMovement.create({
                data: {
                  id: crypto.randomUUID(),
                  partId: item.partId,
                  type: "in",
                  quantity: item.receivedQty,
                  storeId: store_id || null,
                  referenceType: "purchase",
                  referenceId: order.id,
                  supplierId: order.supplierId,
                  notes: `Purchase Order ${order.poNumber} - Received`,
                } as any,
              });

              // Update Part costs (Avg Cost and Purchase Price)
              const partId = item.partId;
              const qty = item.receivedQty;
              const rate = item.unitCost;

              if (partId && rate > 0 && qty > 0) {
                await prisma.part.update({
                  where: { id: partId },
                  data: { purchasePrice: rate },
                });

                const part = await prisma.part.findUnique({
                  where: { id: partId },
                });

                if (part) {
                  // Get stock including the just-added movement
                  const stockIn = await prisma.stockMovement.aggregate({
                    _sum: { quantity: true },
                    where: { partId, type: "in" },
                  });
                  const stockOut = await prisma.stockMovement.aggregate({
                    _sum: { quantity: true },
                    where: { partId, type: "out" },
                  });

                  const currentTotalStock =
                    (stockIn._sum.quantity || 0) -
                    (stockOut._sum.quantity || 0);
                  const oldQty = currentTotalStock - qty;
                  const currentAvg = part.avgCost || part.cost || 0;

                  // Formula: (OldQty * OldAvg + NewQty * Rate) / (TotalQty)
                  const newAvg =
                    oldQty + qty > 0
                      ? (oldQty * currentAvg + qty * rate) / (oldQty + qty)
                      : rate;

                  await prisma.part.update({
                    where: { id: partId },
                    data: { avgCost: newAvg, cost: newAvg },
                  });
                }
              }
            }
          }
        }

        // Clear reserved stock when order is received
        // Delete stockReservation records for all parts in this order
        try {
          const deletedReservations = await prisma.stockReservation.deleteMany({
            where: {
              partId: {
                in: order.PurchaseOrderItem.map((item) => item.partId),
              },
              status: "reserved",
            },
          });
          if (deletedReservations.count > 0) {
          }
        } catch (reservationError: any) {
          // Don't fail the purchase order update if reservation clearing fails
        }
      } catch (stockError: any) {
        // Don't fail the purchase order update if stock movement creation fails
      }
    }

    // Create journal entry when order is received
    if (
      status === "Received" &&
      existingOrder.status !== "Received" &&
      updatedGrandTotal > 0
    ) {
      try {
        if (true) {
          // Get supplier name and account
          let supplierName = "Supplier";
          let supplierAccount = null;
          if (order.supplierId) {
            const supplier = await prisma.supplier.findUnique({
              where: { id: order.supplierId },
            });
            if (supplier) {
              supplierName =
                supplier.companyName || supplier.name || "Supplier";
              // Find supplier account by name (format: "Name" or "Company Name")
              supplierAccount = await prisma.account.findFirst({
                where: {
                  AND: [
                    { code: { startsWith: "301" } },
                    {
                      OR: [
                        { name: supplier.name || "" },
                        { name: supplier.companyName },
                      ],
                    },
                  ],
                },
              });
            }
          }

          // Find Inventory account (101001-Inventory)
          const inventoryAccount = await prisma.account.findFirst({
            where: {
              OR: [
                { code: "101001" }, // Inventory
                { code: "104005" }, // Inventory - General (fallback)
                { code: "104001" }, // Raw Materials (fallback)
              ],
            },
          });

          // If supplier account not found, create it
          if (!supplierAccount && order.supplierId) {
            const supplier = await prisma.supplier.findUnique({
              where: { id: order.supplierId },
            });
            if (supplier) {
              const payablesSubgroup = await prisma.subgroup.findFirst({
                where: { code: "301" },
              });
              if (payablesSubgroup) {
                const existingAccounts = await prisma.account.findMany({
                  where: { code: { startsWith: "301" } },
                  orderBy: { code: "desc" },
                });
                let accountCode = "301001";
                if (existingAccounts.length > 0) {
                  const lastCode = existingAccounts[0].code;
                  const match = lastCode.match(/^301(\d+)$/);
                  if (match) {
                    const lastNum = parseInt(match[1], 10);
                    const nextNum = lastNum + 1;
                    accountCode = `301${String(nextNum).padStart(3, "0")}`;
                  }
                }
                supplierAccount = await prisma.account.create({
                  data: {
                    subgroupId: payablesSubgroup.id,
                    code: accountCode,
                    name: `${supplier.name || supplier.companyName}`,
                    description: `Supplier Account: ${supplier.companyName}`,
                    openingBalance: 0,
                    currentBalance: 0,
                    status: "Active",
                    canDelete: false,
                    supplierId: supplier.id,
                  } as Prisma.AccountUncheckedCreateInput,
                });
              }
            }
          }

          // Fallback to generic Accounts Payable if no supplier account
          if (!supplierAccount) {
            supplierAccount = await prisma.account.findFirst({
              where: { code: "301001" },
            });
          }

          if (inventoryAccount && supplierAccount) {
            // Create journal entry lines
            const journalLines: any[] = [];

            // Debit: Inventory account
            const inventoryDescription =
              order.PurchaseOrderItem.filter(
                (item: any) => item.receivedQty > 0,
              )
                .map((item: any) => {
                  const partName = item.Part?.partNo || "Item";
                  return `PO: ${order.poNumber} Inventory Added ,${partName}/, Qty ${item.receivedQty}, Rate ${item.unitCost}, Cost: ${item.totalCost}`;
                })
                .join("; ") || `PO: ${order.poNumber} Inventory Added`;

            journalLines.push({
              accountId: inventoryAccount.id,
              description: inventoryDescription,
              debit: updatedTotalAmount,
              credit: 0,
              lineOrder: 0,
            });

            // Debit: Expense accounts (if any)
            if (expenses && expenses.length > 0) {
              for (let i = 0; i < expenses.length; i++) {
                const exp = expenses[i];
                if (exp.amount > 0 && exp.payableAccount) {
                  // Find expense account by name or code (302009 for purchase expenses)
                  let expenseAccount = await prisma.account.findFirst({
                    where: {
                      OR: [
                        { code: "302009" }, // Purchase expenses payables
                        { name: { contains: exp.payableAccount } },
                        { code: exp.payableAccount },
                      ],
                    },
                  });

                  // If not found, try to find in 302 subgroup
                  if (!expenseAccount) {
                    const expenseSubgroup = await prisma.subgroup.findFirst({
                      where: { code: "302" },
                    });
                    if (expenseSubgroup) {
                      expenseAccount = await prisma.account.findFirst({
                        where: {
                          subgroupId: expenseSubgroup.id,
                          name: { contains: exp.payableAccount },
                        },
                      });
                    }
                  }

                  if (expenseAccount) {
                    journalLines.push({
                      accountId: expenseAccount.id,
                      description:
                        exp.type || `Expense for PO ${order.poNumber}`,
                      debit: exp.amount,
                      credit: 0,
                      lineOrder: journalLines.length,
                    });
                  }
                }
              }
            }

            // Credit: Supplier Account
            journalLines.push({
              accountId: supplierAccount.id,
              description: `PO: ${order.poNumber} ${supplierName} Liability Created`,
              debit: 0,
              credit: updatedGrandTotal,
              lineOrder: journalLines.length,
            });

            // Create Voucher automatically when PO is received
            try {
              // Generate voucher number (format: JV4707)
              // Get the highest journal voucher number
              const lastVoucher = await prisma.voucher.findFirst({
                where: {
                  type: "journal",
                  voucherNumber: {
                    startsWith: "JV",
                  },
                },
                orderBy: {
                  voucherNumber: "desc",
                },
              });

              let nextNumber = 1;
              if (lastVoucher) {
                // Extract number from voucher number (e.g., "JV4707" -> 4707)
                const match = lastVoucher.voucherNumber.match(/^JV(\d+)$/);
                if (match) {
                  nextNumber = parseInt(match[1]) + 1;
                } else {
                  // Fallback: count all journal vouchers
                  const voucherCount = await prisma.voucher.count({
                    where: { type: "journal" },
                  });
                  nextNumber = voucherCount + 1;
                }
              }
              const voucherNumber = `JV${String(nextNumber).padStart(4, "0")}`;

              // Get account details for voucher entries
              const voucherEntries = [];
              for (const line of journalLines) {
                const account = await prisma.account.findUnique({
                  where: { id: line.accountId },
                  select: { code: true, name: true },
                });

                voucherEntries.push({
                  id: crypto.randomUUID(),
                  accountId: line.accountId,
                  accountName: account
                    ? `${account.code}-${account.name}`
                    : "Account",
                  description:
                    line.description || `Purchase Order ${order.poNumber}`,
                  debit: line.debit,
                  credit: line.credit,
                  sortOrder: line.lineOrder,
                });
              }

              // Extract PO number for narration (e.g., "PO-15" -> "15", "PO-DEMO-001" -> extract number)
              let poNumberDisplay = order.poNumber;
              // Try to extract just the number part if it exists
              const poNumberMatch = order.poNumber.match(/PO-.*?(\d+)$/);
              if (poNumberMatch) {
                poNumberDisplay = poNumberMatch[1];
              } else {
                // Remove common prefixes
                poNumberDisplay = order.poNumber
                  .replace(/^PO-?/i, "")
                  .replace(/^DEMO-?/i, "");
              }

              // Create voucher
              const voucher = await prisma.voucher.create({
                data: {
                  id: `VOU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  voucherNumber,
                  type: "journal",
                  date: order.date,
                  narration: `Purchase Order Number: ${poNumberDisplay}`,
                  totalDebit: updatedGrandTotal,
                  totalCredit: updatedGrandTotal,
                  status: "posted", // Auto-approve the voucher
                  createdBy: "System",
                  approvedBy: "System",
                  approvedAt: new Date(),
                  updatedAt: new Date(),
                  VoucherEntry: {
                    create: voucherEntries.map((e: any) => ({
                      id: crypto.randomUUID(),
                      ...e,
                    })),
                  },
                },
              });
            } catch (voucherError: any) {
              // Don't fail the purchase order update if voucher creation fails
            }

            // Update account balances
            for (const line of journalLines) {
              const account = await prisma.account.findUnique({
                where: { id: line.accountId },
                include: {
                  Subgroup: {
                    include: { MainGroup: true },
                  },
                },
              });

              if (account) {
                const accountType =
                  account.Subgroup.MainGroup.type.toLowerCase();
                // Assets and Expenses: increase with debit, decrease with credit
                // Liabilities, Equity, Revenue: increase with credit, decrease with debit
                const balanceChange =
                  accountType === "asset" ||
                  accountType === "expense" ||
                  accountType === "cost"
                    ? line.debit - line.credit
                    : line.credit - line.debit;

                await prisma.account.update({
                  where: { id: line.accountId },
                  data: {
                    currentBalance: {
                      increment: balanceChange,
                    },
                  },
                });
              }
            }
          } else {
          }
        }
      } catch (journalError: any) {
        // Don't fail the purchase order update if journal entry creation fails
      }
    }

    res.json({
      id: order.id,
      po_number: order.poNumber,
      date: order.date,
      status: order.status,
      total_amount: order.totalAmount,
      items_count: order.PurchaseOrderItem.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete purchase order - Comprehensive deletion that removes all related data
router.delete("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Find the purchase order
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        PurchaseOrderItem: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    // Step 1: Delete stock movements
    const deletedStockMovements = await prisma.stockMovement.deleteMany({
      where: {
        OR: [
          {
            AND: [
              { referenceType: { in: ["purchase", "Purchase", "PURCHASE"] } },
              { referenceId: id },
            ],
          },
          {
            notes: {
              contains: order.poNumber,
            },
          },
        ],
      },
    });

    // Step 2: Delete related Vouchers and reverse balances
    const poNumberVariations = [order.poNumber, `PO-${order.poNumber}`];

    const vouchers = await prisma.voucher.findMany({
      where: {
        status: "posted",
        OR: poNumberVariations.map((poVar) => ({
          narration: { contains: poVar },
        })),
      },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: { Subgroup: { include: { MainGroup: true } } },
            },
          },
        },
      },
    });

    for (const v of vouchers) {
      for (const edge of v.VoucherEntry) {
        const accType = edge.Account.Subgroup.MainGroup.type.toLowerCase();
        const reverseBalance =
          accType === "asset" || accType === "expense" || accType === "cost"
            ? edge.credit - edge.debit
            : edge.debit - edge.credit;

        await prisma.account.update({
          where: { id: edge.accountId },
          data: { currentBalance: { increment: reverseBalance } },
        });
      }
      await prisma.voucher.delete({ where: { id: v.id } });
    }

    // Step 3: Delete the purchase order
    await prisma.purchaseOrder.delete({ where: { id } });

    res.json({
      message: "Purchase order deleted successfully",
      details: {
        stockMovementsDeleted: deletedStockMovements.count,
        vouchersDeleted: vouchers.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get stores
router.get("/stores", async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status && status !== "all") {
      where.status = status;
    }

    const stores = await prisma.store.findMany({
      where,
      include: {
        Rack: {
          include: {
            Shelf: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      stores.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.code, // Using code as type for now
        status: s.status,
        description: s.address || s.manager || "",
        code: s.code,
        address: s.address,
        phone: s.phone,
        manager: s.manager,
        Rack: s.Rack,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create store
router.post("/stores", async (req: Request, res: Response) => {
  try {
    const { name, type, status, description } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Name and type are required" });
    }

    // Generate code from name
    const code = name.toUpperCase().replace(/\s+/g, "-").substring(0, 20);
    const id = crypto.randomUUID();
    const updatedAt = new Date();

    const store = await prisma.store.create({
      data: {
        id,
        code,
        name,
        address: description || null,
        status: status || "active",
        updatedAt,
      },
    });

    res.json({
      id: store.id,
      name: store.name,
      type: store.code,
      status: store.status,
      description: store.address || "",
      code: store.code,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update store
router.put("/stores/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, status, description } = req.body;

    const store = await prisma.store.update({
      where: { id },
      data: {
        name,
        code: type || undefined,
        address: description || null,
        status: status || "active",
      },
    });

    res.json({
      id: store.id,
      name: store.name,
      type: store.code,
      status: store.status,
      description: store.address || "",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete store
router.delete("/stores/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Delete associated racks and shelves (cascade)
    await prisma.store.delete({
      where: { id },
    });

    res.json({ message: "Store deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get racks
router.get("/racks", async (req: Request, res: Response) => {
  try {
    const { store_id, status } = req.query;

    const where: any = {};
    if (store_id) {
      where.storeId = store_id as string;
    }
    if (status && status !== "all") {
      where.status = status;
    }

    const racks = await prisma.rack.findMany({
      where,
      include: {
        Store: true,
        Shelf: true,
      },
      orderBy: { codeNo: "asc" },
    });

    res.json(
      racks.map((r) => ({
        id: r.id,
        codeNo: r.codeNo,
        code_no: r.codeNo,
        storeId: r.storeId,
        store_id: r.storeId,
        store_name: r.Store?.name || null,
        description: r.description,
        status: r.status,
        Shelf: r.Shelf.map((s) => ({
          id: s.id,
          shelfNo: s.shelfNo,
          rackId: s.rackId,
          description: s.description,
          status: s.status,
        })),
        shelves_count: r.Shelf.length,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create rack
router.post("/racks", async (req: Request, res: Response) => {
  try {
    const {
      codeNo,
      storeId,
      description,
      status,
    }: {
      codeNo: string;
      storeId?: string | null;
      description?: string;
      status?: string;
    } = req.body;

    if (!codeNo || !storeId) {
      return res.status(400).json({ error: "Code and store ID are required" });
    }

    const rack = await prisma.rack.create({
      data: {
        id: crypto.randomUUID(),
        codeNo,
        ...(storeId && { storeId }),
        description: description || null,
        status: status || "Active",
        updatedAt: new Date(),
      } as any,
      include: {
        Shelf: true,
      },
    });

    res.json({
      id: rack.id,
      codeNo: rack.codeNo,
      storeId: rack.storeId,
      description: rack.description,
      status: rack.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update rack
router.put("/racks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      codeNo,
      storeId,
      description,
      status,
    }: {
      codeNo?: string;
      storeId?: string;
      description?: string;
      status?: string;
    } = req.body;

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        codeNo,
        storeId: storeId !== undefined ? storeId : undefined,
        description: description || null,
        status: status || "Active",
      },
      include: {
        Shelf: true,
      },
    });

    res.json({
      id: rack.id,
      codeNo: rack.codeNo,
      storeId: rack.storeId,
      description: rack.description,
      status: rack.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete rack
router.delete("/racks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.rack.delete({
      where: { id },
    });

    res.json({ message: "Rack deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get shelves
router.get("/shelves", async (req: Request, res: Response) => {
  try {
    const { rack_id, status } = req.query;

    const where: any = {};
    if (rack_id) {
      where.rackId = rack_id as string;
    }
    if (status && status !== "all") {
      where.status = status;
    }

    const shelves = await prisma.shelf.findMany({
      where,
      include: {
        Rack: {
          include: {
            Store: true,
          },
        },
      },
      orderBy: { shelfNo: "asc" },
    });

    res.json(
      shelves.map((s: any) => ({
        id: s.id,
        shelfNo: s.shelfNo,
        shelf_no: s.shelfNo,
        rackId: s.rackId,
        rack_id: s.rackId,
        rack_code: s.Rack.codeNo,
        store_id: s.Rack.storeId,
        store_name: s.Rack.store?.name || null,
        description: s.description,
        status: s.status,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create shelf
router.post("/shelves", async (req: Request, res: Response) => {
  try {
    const {
      id,
      shelfNo,
      rackId,
      description,
      status,
      updatedAt,
    }: {
      id?: string;
      shelfNo: string;
      rackId: string;
      description?: string;
      status?: string;
      updatedAt?: string;
    } = req.body;

    console.log("[SHELF CREATE] Received request:", {
      id,
      shelfNo,
      rackId,
      description,
      status,
      updatedAt,
    });

    if (!shelfNo || !rackId) {
      return res
        .status(400)
        .json({ error: "Shelf number and rack ID are required" });
    }

    // Validate that the rack exists
    const rackExists = await prisma.rack.findUnique({
      where: { id: String(rackId) },
    });

    if (!rackExists) {
      console.error(`[SHELF CREATE] Rack not found: ${rackId}`);
      return res.status(404).json({
        error: `Rack with ID ${rackId} not found. Please select a valid rack.`,
      });
    }

    console.log("[SHELF CREATE] Creating shelf with data:", {
      id: id || "will-generate",
      shelfNo,
      rackId: String(rackId),
      description: description || null,
      status: status || "Active",
    });

    const shelf = await prisma.shelf.create({
      data: {
        id: id || crypto.randomUUID(),
        shelfNo: shelfNo,
        rackId: String(rackId),
        description: description || null,
        status: status || "Active",
        updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
      },
    });

    console.log("[SHELF CREATE] Successfully created shelf:", shelf.id);

    res.json({
      id: shelf.id,
      shelfNo: shelf.shelfNo,
      rackId: shelf.rackId,
      description: shelf.description,
      status: shelf.status,
    });
  } catch (error: any) {
    console.error("[SHELF CREATE] Error:", error.message);
    console.error("[SHELF CREATE] Error code:", error.code);
    console.error("[SHELF CREATE] Error meta:", error.meta);

    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Shelf with this name already exists in this rack" });
    }
    if (error.code === "P2003") {
      return res
        .status(400)
        .json({ error: "Invalid rack ID. The specified rack does not exist." });
    }
    res.status(500).json({ error: error.message });
  }
});

// NEW TEST ENDPOINT - Create shelf with proper ID generation
router.post("/shelves/create-new", async (req: Request, res: Response) => {
  try {
    const { shelfNo, rackId, description, status } = req.body;

    console.log("[SHELF CREATE NEW] Received request:", {
      shelfNo,
      rackId,
      description,
      status,
    });

    if (!shelfNo || !rackId) {
      return res
        .status(400)
        .json({ error: "Shelf number and rack ID are required" });
    }

    // Validate that the rack exists
    const rackExists = await prisma.rack.findUnique({
      where: { id: String(rackId) },
    });

    if (!rackExists) {
      console.error(`[SHELF CREATE NEW] Rack not found: ${rackId}`);
      return res.status(404).json({
        error: `Rack with ID ${rackId} not found. Please select a valid rack.`,
      });
    }

    console.log("[SHELF CREATE NEW] Creating shelf...");

    const shelf = await prisma.shelf.create({
      data: {
        id: crypto.randomUUID(),
        shelfNo: shelfNo,
        rackId: String(rackId),
        description: description || null,
        status: status || "Active",
        updatedAt: new Date(),
      },
    });

    console.log("[SHELF CREATE NEW] Successfully created shelf:", shelf.id);

    res.json({
      id: shelf.id,
      shelfNo: shelf.shelfNo,
      rackId: shelf.rackId,
      description: shelf.description,
      status: shelf.status,
    });
  } catch (error: any) {
    console.error("[SHELF CREATE NEW] Error:", error.message);
    console.error("[SHELF CREATE NEW] Error code:", error.code);
    console.error("[SHELF CREATE NEW] Error meta:", error.meta);

    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Shelf with this name already exists in this rack" });
    }
    if (error.code === "P2003") {
      return res
        .status(400)
        .json({ error: "Invalid rack ID. The specified rack does not exist." });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update shelf
router.put("/shelves/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { shelfNo, description, status } = req.body;

    const shelf = await prisma.shelf.update({
      where: { id },
      data: {
        shelfNo,
        description: description || null,
        status: status || "Active",
      },
    });

    res.json({
      id: shelf.id,
      shelfNo: shelf.shelfNo,
      rackId: shelf.rackId,
      description: shelf.description,
      status: shelf.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete shelf
router.delete("/shelves/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.shelf.delete({
      where: { id },
    });

    res.json({ message: "Shelf deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Multi-dimensional stock report
router.get("/multi-dimensional-report", async (req: Request, res: Response) => {
  try {
    const {
      primary_dimension,
      secondary_dimension,
      tertiary_dimension,
      category_filter,
      brand_filter,
      sort_by,
      sort_direction = "desc",
    } = req.query;

    if (!primary_dimension) {
      return res.status(400).json({ error: "primary_dimension is required" });
    }

    // Build where clause for parts
    const where: any = { status: "active" };

    // Apply category filter
    if (category_filter && category_filter !== "All Categories") {
      const categoryRecord = await prisma.category.findFirst({
        where: { name: category_filter as string },
      });
      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    // Apply brand filter
    if (brand_filter && brand_filter !== "All Brands") {
      const brandRecord = await prisma.brand.findFirst({
        where: { name: brand_filter as string },
      });
      if (brandRecord) {
        where.brandId = brandRecord.id;
      }
    }

    // Get all parts with related data
    const parts = await prisma.part.findMany({
      where,
      include: {
        Brand: true,
        Category: true,
        StockMovement: {
          include: {
            Store: true,
          },
        },
      },
    });

    // Calculate stock for each part
    const partStockMap: Record<
      string,
      {
        quantity: number;
        cost: number;
        value: number;
        category: string;
        brand: string;
        store: string;
        location: string;
        uom: string;
      }
    > = {};

    for (const part of parts) {
      const stockIn = part.StockMovement.filter((m) => m.type === "in").reduce(
        (sum, m) => sum + m.quantity,
        0,
      );
      const stockOut = part.StockMovement.filter(
        (m) => m.type === "out",
      ).reduce((sum, m) => sum + m.quantity, 0);
      const quantity = stockIn - stockOut;

      if (quantity > 0) {
        const cost = part.cost || 0;
        const value = cost * quantity;
        const category = part.Category?.name || "Uncategorized";
        const brand = part.Brand?.name || "No Brand";

        // Group by store if needed
        const movementsByStore: Record<string, { in: number; out: number }> =
          {};
        for (const movement of part.StockMovement) {
          const storeKey = movement.Store?.name || "No Store";
          if (!movementsByStore[storeKey]) {
            movementsByStore[storeKey] = { in: 0, out: 0 };
          }
          if (movement.type === "in") {
            movementsByStore[storeKey].in += movement.quantity;
          } else {
            movementsByStore[storeKey].out += movement.quantity;
          }
        }

        // If grouping by store, create separate entries
        if (
          primary_dimension === "Store" ||
          secondary_dimension === "Store" ||
          tertiary_dimension === "Store"
        ) {
          for (const [storeName, storeStock] of Object.entries(
            movementsByStore,
          )) {
            const storeQty = storeStock.in - storeStock.out;
            if (storeQty > 0) {
              const key = `${part.id}_${storeName}`;
              partStockMap[key] = {
                quantity: storeQty,
                cost,
                value: cost * storeQty,
                category,
                brand,
                store: storeName,
                location: "-",
                uom: part.uom || "pcs",
              };
            }
          }
        } else {
          // Single entry per part
          partStockMap[part.id] = {
            quantity,
            cost,
            value,
            category,
            brand,
            store: "All Stores",
            location: "-",
            uom: part.uom || "pcs",
          };
        }
      }
    }

    // Group by dimensions
    const dimensionGroups: Record<
      string,
      {
        items: Set<string>;
        quantity: number;
        value: number;
        costs: number[];
      }
    > = {};

    for (const [partKey, stockData] of Object.entries(partStockMap)) {
      const dimensionKeys: string[] = [];

      // Primary dimension
      if (primary_dimension === "Category") {
        dimensionKeys.push(stockData.category);
      } else if (primary_dimension === "Brand") {
        dimensionKeys.push(stockData.brand);
      } else if (primary_dimension === "Store") {
        dimensionKeys.push(stockData.store);
      } else if (primary_dimension === "Location") {
        dimensionKeys.push(stockData.location);
      } else if (primary_dimension === "UOM") {
        dimensionKeys.push(stockData.uom);
      }

      // Secondary dimension
      if (secondary_dimension && secondary_dimension !== "none") {
        if (secondary_dimension === "Category") {
          dimensionKeys.push(stockData.category);
        } else if (secondary_dimension === "Brand") {
          dimensionKeys.push(stockData.brand);
        } else if (secondary_dimension === "Store") {
          dimensionKeys.push(stockData.store);
        } else if (secondary_dimension === "Location") {
          dimensionKeys.push(stockData.location);
        } else if (secondary_dimension === "UOM") {
          dimensionKeys.push(stockData.uom);
        }
      }

      // Tertiary dimension
      if (tertiary_dimension && tertiary_dimension !== "none") {
        if (tertiary_dimension === "Category") {
          dimensionKeys.push(stockData.category);
        } else if (tertiary_dimension === "Brand") {
          dimensionKeys.push(stockData.brand);
        } else if (tertiary_dimension === "Store") {
          dimensionKeys.push(stockData.store);
        } else if (tertiary_dimension === "Location") {
          dimensionKeys.push(stockData.location);
        } else if (tertiary_dimension === "UOM") {
          dimensionKeys.push(stockData.uom);
        }
      }

      const groupKey = dimensionKeys.join("|");
      if (!dimensionGroups[groupKey]) {
        dimensionGroups[groupKey] = {
          items: new Set(),
          quantity: 0,
          value: 0,
          costs: [],
        };
      }

      dimensionGroups[groupKey].items.add(partKey);
      dimensionGroups[groupKey].quantity += stockData.quantity;
      dimensionGroups[groupKey].value += stockData.value;
      dimensionGroups[groupKey].costs.push(stockData.cost);
    }

    // Convert to report rows
    const reportRows = Object.entries(dimensionGroups).map(([key, group]) => {
      const dimensionParts = key.split("|");
      const dimension = dimensionParts.join(" - ") || "All";
      const items = group.items.size;
      const avgCost =
        group.costs.length > 0
          ? group.costs.reduce((sum, cost) => sum + cost, 0) /
            group.costs.length
          : 0;

      return {
        id: key,
        dimension,
        items,
        quantity: group.quantity,
        value: group.value,
        avgCost,
      };
    });

    // Calculate total for percentage calculation
    const totalValue = reportRows.reduce((sum, row) => sum + row.value, 0);
    const totalQuantity = reportRows.reduce(
      (sum, row) => sum + row.quantity,
      0,
    );
    const totalItems = reportRows.reduce((sum, row) => sum + row.items, 0);

    // Add percentage of total
    const reportRowsWithPercent = reportRows.map((row) => ({
      ...row,
      percentOfTotal: totalValue > 0 ? (row.value / totalValue) * 100 : 0,
    }));

    // Sort
    let sortedRows = [...reportRowsWithPercent];
    if (sort_by) {
      sortedRows.sort((a, b) => {
        let comparison = 0;
        switch (sort_by) {
          case "Value":
            comparison = a.value - b.value;
            break;
          case "Quantity":
            comparison = a.quantity - b.quantity;
            break;
          case "Items":
            comparison = a.items - b.items;
            break;
          case "Avg Cost":
            comparison = a.avgCost - b.avgCost;
            break;
          case "Name":
            comparison = a.dimension.localeCompare(b.dimension);
            break;
          default:
            comparison = a.value - b.value;
        }
        return sort_direction === "desc" ? -comparison : comparison;
      });
    }

    res.json({
      data: sortedRows,
      totals: {
        items: totalItems,
        quantity: totalQuantity,
        value: totalValue,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stock Verification Routes

// Get all verification sessions
router.get("/verifications", async (req: Request, res: Response) => {
  try {
    const { status, page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status && status !== "all") {
      where.status = status as string;
    }

    const [verifications, total] = await Promise.all([
      prisma.stockVerification.findMany({
        where,
        include: {
          StockVerificationItem: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNum,
      }),
      prisma.stockVerification.count({ where }),
    ]);

    res.json({
      data: verifications.map((v) => ({
        id: v.id,
        name: v.name,
        notes: v.notes,
        status: v.status,
        startDate: v.startDate,
        completedDate: v.completedDate,
        totalItems: v.StockVerificationItem.length,
        verifiedItems: v.StockVerificationItem.filter(
          (i) => i.status === "Verified",
        ).length,
        discrepancies: v.StockVerificationItem.filter(
          (i) => i.status === "Discrepancy",
        ).length,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })),
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

// Get active verification session
router.get("/verifications/active", async (req: Request, res: Response) => {
  try {
    const verification = await prisma.stockVerification.findFirst({
      where: { status: "Active" },
      include: {
        StockVerificationItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
            Store: true,
            Rack: true,
            Shelf: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!verification) {
      return res.json(null);
    }

    res.json({
      id: verification.id,
      name: verification.name,
      notes: verification.notes,
      status: verification.status,
      startDate: verification.startDate,
      completedDate: verification.completedDate,
      items: verification.StockVerificationItem.map((item) => {
        const locationParts = [];
        if (item.Store?.name) locationParts.push(item.Store.name);
        if (item.Rack?.codeNo) locationParts.push(item.Rack.codeNo);
        if (item.Shelf?.shelfNo) locationParts.push(item.Shelf.shelfNo);
        const location =
          locationParts.length > 0 ? locationParts.join(" / ") : "No Location";

        return {
          id: item.id,
          partNo: item.Part.partNo,
          description: item.Part.description || "",
          location: location,
          systemQty: item.systemQty,
          physicalQty: item.physicalQty,
          variance: item.variance,
          status: item.status,
          remarks: item.remarks || "",
        };
      }),
      totalItems: verification.StockVerificationItem.length,
      verifiedItems: verification.StockVerificationItem.filter(
        (i) => i.status === "Verified",
      ).length,
      discrepancies: verification.StockVerificationItem.filter(
        (i) => i.status === "Discrepancy",
      ).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new verification session
router.post("/verifications", async (req: Request, res: Response) => {
  try {
    const { name, notes, store_id, rack_id, shelf_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Get all active parts
    const parts = await prisma.part.findMany({
      where: { status: "active" },
    });

    // Get stock movements for all parts, filtered by location if provided
    const partIds = parts.map((p) => p.id);
    const whereMovement: any = {
      partId: { in: partIds },
    };

    if (store_id) {
      whereMovement.storeId = store_id;
    }
    if (rack_id) {
      whereMovement.rackId = rack_id;
    }
    if (shelf_id) {
      whereMovement.shelfId = shelf_id;
    }

    const movements = await prisma.stockMovement.findMany({
      where: whereMovement,
    });

    // Group movements by part
    const stockByPart: Record<string, { in: number; out: number }> = {};
    for (const movement of movements) {
      if (!stockByPart[movement.partId]) {
        stockByPart[movement.partId] = { in: 0, out: 0 };
      }
      if (movement.type === "in") {
        stockByPart[movement.partId].in += movement.quantity;
      } else {
        stockByPart[movement.partId].out += movement.quantity;
      }
    }

    // Calculate system quantities for each part and create verification items
    const verificationItems = [];
    for (const part of parts) {
      const stock = stockByPart[part.id] || { in: 0, out: 0 };
      const systemQty = stock.in - stock.out;

      // Include all parts if no location filter, or only those with stock at the location if filtered
      if (systemQty > 0 || (!store_id && !rack_id && !shelf_id)) {
        verificationItems.push({
          id: crypto.randomUUID(),
          partId: part.id,
          storeId: store_id || null,
          rackId: rack_id || null,
          shelfId: shelf_id || null,
          systemQty: systemQty,
          physicalQty: null,
          variance: null,
          status: "Pending",
          remarks: null,
          updatedAt: new Date(),
        });
      }
    }

    const verification = await prisma.stockVerification.create({
      data: {
        id: crypto.randomUUID(),
        name,
        notes: notes || null,
        status: "Active",
        updatedAt: new Date(),
        StockVerificationItem: {
          create: verificationItems,
        },
      } as any,
      include: {
        StockVerificationItem: true,
      },
    });

    res.status(201).json({
      id: verification.id,
      name: verification.name,
      status: verification.status,
      startDate: verification.startDate,
      totalItems: verification.StockVerificationItem.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single verification session
router.get("/verifications/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const verification = await prisma.stockVerification.findUnique({
      where: { id },
      include: {
        StockVerificationItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
            Store: true,
            Rack: true,
            Shelf: true,
          },
        },
      },
    });

    if (!verification) {
      return res.status(404).json({ error: "Verification not found" });
    }

    res.json({
      id: verification.id,
      name: verification.name,
      notes: verification.notes,
      status: verification.status,
      startDate: verification.startDate,
      completedDate: verification.completedDate,
      items: verification.StockVerificationItem.map((item) => {
        const locationParts = [];
        if (item.Store?.name) locationParts.push(item.Store.name);
        if (item.Rack?.codeNo) locationParts.push(item.Rack.codeNo);
        if (item.Shelf?.shelfNo) locationParts.push(item.Shelf.shelfNo);
        const location =
          locationParts.length > 0 ? locationParts.join(" / ") : "No Location";

        return {
          id: item.id,
          partNo: item.Part.partNo,
          description: item.Part.description || "",
          location: location,
          systemQty: item.systemQty,
          physicalQty: item.physicalQty,
          variance: item.variance,
          status: item.status,
          remarks: item.remarks || "",
        };
      }),
      totalItems: verification.StockVerificationItem.length,
      verifiedItems: verification.StockVerificationItem.filter(
        (i) => i.status === "Verified",
      ).length,
      discrepancies: verification.StockVerificationItem.filter(
        (i) => i.status === "Discrepancy",
      ).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update verification item
router.put(
  "/verifications/:id/items/:itemId",
  async (req: Request, res: Response) => {
    try {
      const { id, itemId } = req.params;
      const { physicalQty, remarks } = req.body;

      // Get the item to calculate variance
      const item = await prisma.stockVerificationItem.findUnique({
        where: { id: itemId },
      });

      if (!item || item.verificationId !== id) {
        return res.status(404).json({ error: "Item not found" });
      }

      const physicalQtyNum =
        physicalQty !== null && physicalQty !== undefined
          ? parseInt(physicalQty)
          : null;
      const variance =
        physicalQtyNum !== null ? physicalQtyNum - item.systemQty : null;
      const status =
        physicalQtyNum === null
          ? "Pending"
          : variance === 0
            ? "Verified"
            : "Discrepancy";

      const updatedItem = await prisma.stockVerificationItem.update({
        where: { id: itemId },
        data: {
          physicalQty: physicalQtyNum,
          variance,
          status,
          remarks: remarks || null,
        },
      });

      res.json({
        id: updatedItem.id,
        physicalQty: updatedItem.physicalQty,
        variance: updatedItem.variance,
        status: updatedItem.status,
        remarks: updatedItem.remarks,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Complete verification session
router.put(
  "/verifications/:id/complete",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const verification = await prisma.stockVerification.findUnique({
        where: { id },
        include: {
          StockVerificationItem: true,
        },
      });

      if (!verification) {
        return res.status(404).json({ error: "Verification not found" });
      }

      if (verification.status !== "Active") {
        return res.status(400).json({ error: "Verification is not active" });
      }

      const updatedVerification = await prisma.stockVerification.update({
        where: { id },
        data: {
          status: "Completed",
          completedDate: new Date(),
        },
        include: {
          StockVerificationItem: true,
        },
      });

      res.json({
        id: updatedVerification.id,
        status: updatedVerification.status,
        completedDate: updatedVerification.completedDate,
        totalItems: updatedVerification.StockVerificationItem.length,
        verifiedItems: updatedVerification.StockVerificationItem.filter(
          (i) => i.status === "Verified",
        ).length,
        discrepancies: updatedVerification.StockVerificationItem.filter(
          (i) => i.status === "Discrepancy",
        ).length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Cancel verification session
router.put("/verifications/:id/cancel", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const verification = await prisma.stockVerification.findUnique({
      where: { id },
    });

    if (!verification) {
      return res.status(404).json({ error: "Verification not found" });
    }

    if (verification.status !== "Active") {
      return res
        .status(400)
        .json({ error: "Only active verifications can be cancelled" });
    }

    const updatedVerification = await prisma.stockVerification.update({
      where: { id },
      data: {
        status: "Cancelled",
      },
    });

    res.json({
      id: updatedVerification.id,
      status: updatedVerification.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Direct Purchase Orders Routes

// Get all direct purchase orders
router.get("/direct-purchase-orders", async (req: Request, res: Response) => {
  try {
    const {
      status,
      from_date,
      to_date,
      store_id,
      order_type,
      part_id,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const partId = String(part_id || req.query.partId || "").trim();

    const where: any = {};
    if (order_type && String(order_type).trim() !== "") {
      where.orderType = String(order_type).trim();
    } else {
      // Local purchase list: never include transfer-in documents
      where.orderType = { not: "transfer_in" };
    }
    if (status && status !== "all") {
      where.status = status as string;
    }
    if (store_id) {
      where.storeId = store_id as string;
    }
    if (from_date || to_date) {
      where.date = {};
      if (from_date) {
        where.date.gte = new Date(from_date as string);
      }
      if (to_date) {
        where.date.lte = new Date(to_date as string);
      }
    }
    if (partId) {
      where.DirectPurchaseOrderItem = {
        some: { partId },
      };
    }

    const [orders, total] = await Promise.all([
      prisma.directPurchaseOrder.findMany({
        where,
        include: {
          Store: true,
          Supplier: true,
          BranchAccount: true,
          DirectPurchaseOrderItem: {
            include: {
              Part: {
                include: {
                  Brand: true,
                  Category: true,
                },
              },
              Rack: true,
              Shelf: true,
            },
          },
          DirectPurchaseOrderExpense: true,
        },
        orderBy: [{ dpoNumber: "desc" }, { createdAt: "desc" }],
        skip,
        take: limitNum,
      }),
      prisma.directPurchaseOrder.count({ where }),
    ]);

    res.json({
      data: orders.map((dpo) => {
        // Calculate total quantity from items
        const total_quantity = dpo.DirectPurchaseOrderItem.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        return {
          id: dpo.id,
          dpo_no: dpo.dpoNumber,
          date: dpo.date,
          invoice_no: (dpo as any).invoiceNo || null,
          invoice_date: (dpo as any).invoiceDate || null,
          store_id: dpo.storeId,
          store_name: dpo.Store?.name || null,
          supplier_id: dpo.supplierId,
          supplier_name: supplierDisplayName(dpo.Supplier),
          branch_account_id: dpo.branchAccountId,
          branch_account_name: dpo.BranchAccount?.name?.trim() || null,
          order_type: dpo.orderType || "local_purchase",
          account: dpo.account,
          description: dpo.description,
          status: dpo.status,
          discount: dpo.discount ?? 0,
          total_amount: dpo.totalAmount,
          items_count: dpo.DirectPurchaseOrderItem.length,
          total_quantity: total_quantity,
          expenses_count: dpo.DirectPurchaseOrderExpense.length,
          created_at: dpo.createdAt,
          items: dpo.DirectPurchaseOrderItem.map((item) => ({
            id: item.id,
            part_id: item.partId,
            partId: item.partId,
            part_no: item.Part?.partNo || null,
            partNo: item.Part?.partNo || null,
            part_description: item.Part?.description || null,
            partDescription: item.Part?.description || null,
            description: item.Part?.description || null,
            quantity: item.quantity,
            purchase_price: item.purchasePrice,
            purchasePrice: item.purchasePrice,
            sale_price: item.salePrice,
            salePrice: item.salePrice,
            amount: item.amount,
            rack_id: item.rackId,
            rackId: item.rackId,
            shelf_id: item.shelfId,
            shelfId: item.shelfId,
            rack: item.Rack
              ? {
                  id: item.Rack.id,
                  codeNo: item.Rack.codeNo,
                }
              : null,
            shelf: item.Shelf
              ? {
                  id: item.Shelf.id,
                  shelfNo: item.Shelf.shelfNo,
                }
              : null,
            part: item.Part
              ? {
                  id: item.Part.id,
                  partNo: item.Part.partNo,
                  description: item.Part.description,
                }
              : null,
          })),
        };
      }),
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

// Get single direct purchase order
router.get(
  "/direct-purchase-orders/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const order = await prisma.directPurchaseOrder.findUnique({
        where: { id },
        include: {
          Store: true,
          Supplier: true,
          BranchAccount: true,
          DirectPurchaseOrderItem: {
            include: {
              Part: {
                include: {
                  Brand: true,
                  Category: true,
                },
              },
              Rack: {
                include: {
                  Store: true,
                },
              },
              Shelf: true,
            },
          },
          DirectPurchaseOrderExpense: true,
          DirectPurchaseOrderReturn: {
            include: {
              DirectPurchaseOrderReturnItem: true,
            },
          },
        },
      });

      if (!order) {
        return res
          .status(404)
          .json({ error: "Direct purchase order not found" });
      }

      // Calculate returned quantities map: partId -> totalReturned
      const returnedQtyMap = new Map<string, number>();
      order.DirectPurchaseOrderReturn.forEach((ret) => {
        ret.DirectPurchaseOrderReturnItem.forEach((retItem) => {
          const current = returnedQtyMap.get(retItem.partId) || 0;
          returnedQtyMap.set(retItem.partId, current + retItem.returnQuantity);
        });
      });

      res.json({
        id: order.id,
        dpo_no: order.dpoNumber,
        date: order.date,
        invoice_no: (order as any).invoiceNo || null,
        invoice_date: (order as any).invoiceDate || null,
        store_id: order.storeId,
        store_name: order.Store?.name || null,
        supplier_id: order.supplierId,
        supplier_name: supplierDisplayName(order.Supplier),
        branch_account_id: order.branchAccountId,
        branch_account_name: order.BranchAccount?.name?.trim() || null,
        order_type: order.orderType || "local_purchase",
        account: order.account,
        description: order.description,
        status: order.status,
        discount: order.discount ?? 0,
        total_amount: order.totalAmount,
        items: order.DirectPurchaseOrderItem.map((item) => ({
          id: item.id,
          part_id: item.partId,
          part_no: item.Part.partNo,
          part_description: item.Part.description,
          brand: item.Part.Brand?.name || "",
          category: item.Part.Category?.name || "",
          uom: item.Part.uom || "pcs",
          quantity: item.quantity,
          returned_quantity: returnedQtyMap.get(item.partId) || 0,
          purchase_price: item.purchasePrice,
          sale_price: item.salePrice,
          amount: item.amount,
          price_a:
            item.priceA !== null && item.priceA !== undefined
              ? item.priceA
              : null,
          price_b:
            item.priceB !== null && item.priceB !== undefined
              ? item.priceB
              : null,
          price_m:
            item.priceM !== null && item.priceM !== undefined
              ? item.priceM
              : null,
          rack_id: item.rackId,
          rack_name: item.Rack?.codeNo || null,
          rack_store_id: item.Rack?.storeId || null,
          rack_store_name: item.Rack?.Store?.name || null,
          shelf_id: item.shelfId,
          shelf_name: item.Shelf?.shelfNo || null,
        })),
        expenses: order.DirectPurchaseOrderExpense.map((expense) => ({
          id: expense.id,
          expense_type: expense.expenseType,
          payable_account: expense.payableAccount,
          description: expense.description,
          amount: expense.amount,
        })),
        created_at: order.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Create direct purchase order
// Create direct purchase order
router.post("/direct-purchase-orders", async (req: Request, res: Response) => {
  try {
    let {
      dpo_number,
      date,
      invoice_no,
      invoice_date,
      store_id,
      supplier_id,
      branch_account_id,
      order_type,
      account,
      description,
      status,
      items,
      expenses,
      discount: discountBody,
    } = req.body || {};

    const resolvedOrderType =
      String(order_type || "local_purchase").trim() || "local_purchase";
    const isTransferIn = isTransferInDpo(resolvedOrderType, dpo_number);

    if (!date || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "date and items are required" });
    }

    if (isTransferIn) {
      if (!branch_account_id) {
        return res.status(400).json({ error: "Branch is required" });
      }
    } else if (!supplier_id) {
      return res.status(400).json({ error: "Supplier is required" });
    }

    const { order, voucherStatus } = await prisma.$transaction(async (tx) => {
      // Generate DPO number
      const numberPrefix = isTransferIn ? "TIN" : "DPO";
      if (!dpo_number) {
        const year = new Date(date).getFullYear();
        const dposForYear = await tx.directPurchaseOrder.findMany({
          where: { dpoNumber: { startsWith: `${numberPrefix}-${year}-` } },
          select: { dpoNumber: true },
        });

        let maxNum = DPO_START_NO - 1;
        const pattern = new RegExp(`^${numberPrefix}-${year}-(\\d+)$`);
        for (const row of dposForYear) {
          const match = row.dpoNumber.match(pattern);
          if (!match) continue;
          const parsed = parseInt(match[1], 10);
          if (!Number.isNaN(parsed)) {
            maxNum = Math.max(maxNum, parsed);
          }
        }

        const nextNum = maxNum + 1;
        dpo_number = `${numberPrefix}-${year}-${String(nextNum).padStart(3, "0")}`;
      }

      // Calculate totals
      const itemsTotal = items.reduce((sum: number, item: any) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(
          item.unit_cost ??
            item.unitCost ??
            item.purchase_price ??
            item.unit_price ??
            item.unitPrice ??
            0,
        );
        return sum + (Number(item.amount) || qty * rate);
      }, 0);

      const expensesTotal = (expenses || []).reduce(
        (sum: number, exp: any) => sum + (Number(exp.amount) || 0),
        0,
      );
      let discountVal =
        discountBody !== undefined && discountBody !== null
          ? Number(discountBody)
          : 0;
      if (!Number.isFinite(discountVal) || discountVal < 0) discountVal = 0;
      discountVal = Math.min(discountVal, itemsTotal);
      discountVal = Math.round(discountVal * 100) / 100;
      const netItems = Math.round((itemsTotal - discountVal) * 100) / 100;
      const totalAmount = Math.round((netItems + expensesTotal) * 100) / 100;

      const dpoId = crypto.randomUUID();
      const newOrder = await tx.directPurchaseOrder.create({
        data: {
          id: dpoId,
          dpoNumber: dpo_number,
          date: new Date(date),
          invoiceNo:
            invoice_no !== undefined && String(invoice_no).trim() !== ""
              ? String(invoice_no).trim()
              : null,
          invoiceDate: invoice_date ? new Date(invoice_date) : null,
          storeId: store_id || null,
          supplierId: isTransferIn ? null : supplier_id || null,
          branchAccountId: isTransferIn ? branch_account_id || null : null,
          orderType: resolvedOrderType,
          account: account || null,
          description: description || null,
          status: status || "Completed",
          discount: discountVal,
          totalAmount: totalAmount,
          DirectPurchaseOrderItem: {
            create: items.map((item: any) => ({
              id: crypto.randomUUID(),
              partId: item.part_id,
              quantity: Number(item.quantity) || 0,
              purchasePrice: Number(
                item.unit_cost ??
                  item.unitCost ??
                  item.purchase_price ??
                  item.unit_price ??
                  item.unitPrice ??
                  0,
              ),
              salePrice: Number(item.sale_price || item.salePrice || 0),
              amount:
                Number(item.amount) ||
                Number(item.quantity) *
                  Number(
                    item.unit_cost ??
                      item.unitCost ??
                      item.purchase_price ??
                      item.unit_price ??
                      item.unitPrice ??
                      0,
                  ),
              priceA: item.price_a != null ? Number(item.price_a) : null,
              priceB: item.price_b != null ? Number(item.price_b) : null,
              priceM: item.price_m != null ? Number(item.price_m) : null,
              rackId: item.rack_id || null,
              shelfId: item.shelf_id || null,
            })),
          },
          DirectPurchaseOrderExpense: {
            create: (expenses || []).map((exp: any) => ({
              id: crypto.randomUUID(),
              expenseType: exp.expense_type,
              payableAccount: exp.payable_account,
              description: exp.description || null,
              amount: Number(exp.amount) || 0,
            })),
          },
        } as any,
        include: {
          DirectPurchaseOrderItem: { include: { Part: true } },
          DirectPurchaseOrderExpense: true,
        },
      });

      // Update Parts and Stock
      const isApprovedStatus = (s: string) =>
        ["completed", "received", "approved"].includes(s.toLowerCase());
      const currentStatus = status || "Completed";

      // 1. Unconditionally update Part.purchasePrice and Part.avgCost using
      //    a true running weighted average:
      //
      //      new_avg = (current_avg × current_stock
      //                 + Σ_lines((purchase_price + EXP/unit) × qty))
      //                / (current_stock + Σ_lines(qty))
      //
      //    EXP/unit is computed by distributing the DPO's total expenses
      //    across lines proportionally to (qty × weight), matching the UI
      //    (falls back to qty when weight is 0 / equal split when there is
      //    no positive share at all).
      const itemRowsForCost = (items || []).map((item: any) => {
        const partId = item.part_id as string | undefined;
        const qty = Number(item.quantity) || 0;
        const baseRate = Number(
          item.unit_cost ??
            item.unitCost ??
            item.purchase_price ??
            item.unit_price ??
            item.unitPrice ??
            0,
        );
        return { partId, qty, baseRate, itemValue: qty * baseRate };
      });

      const expenseTotalForCost = Number(expensesTotal) || 0;
      const uniquePartIds = Array.from(
        new Set(
          itemRowsForCost
            .map((r) => r.partId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      // Fetch part weights and current avgCost for the formula.
      const partRecords = uniquePartIds.length
        ? await tx.part.findMany({
            where: { id: { in: uniquePartIds } },
            select: { id: true, weight: true, avgCost: true, cost: true },
          })
        : [];
      const partInfoById = new Map<
        string,
        { weight: number; avgCost: number }
      >();
      for (const p of partRecords) {
        const w = Number((p as any).weight) || 0;
        const avg =
          Number((p as any).avgCost) || Number((p as any).cost) || 0;
        partInfoById.set(p.id, { weight: w, avgCost: avg });
      }

      // Current on-hand stock per part (excluding reservations) BEFORE this
      // DPO's stock-in is applied. POST has not created the new movements
      // yet, so the existing aggregate is the "before" snapshot.
      const stockByPartId = new Map<string, number>();
      uniquePartIds.forEach((id) => stockByPartId.set(id, 0));
      if (uniquePartIds.length) {
        const grouped = await tx.stockMovement.groupBy({
          by: ["partId", "type"],
          where: {
            partId: { in: uniquePartIds },
            OR: [
              { referenceType: null },
              { referenceType: { not: "stock_reservation" } },
            ],
          },
          _sum: { quantity: true },
        });
        for (const row of grouped) {
          const cur = stockByPartId.get(row.partId) || 0;
          const q = Number(row._sum.quantity || 0);
          stockByPartId.set(
            row.partId,
            row.type === "in" ? cur + q : cur - q,
          );
        }
      }

      // Distribute total DPO expenses across lines by qty × weight.
      const lineShares = itemRowsForCost.map((row) => {
        if (!row.partId || row.qty <= 0) return 0;
        const w = partInfoById.get(row.partId)?.weight || 0;
        return w > 0 ? row.qty * w : row.qty;
      });
      const totalShare = lineShares.reduce((s, v) => s + v, 0);
      const lineDistributedExpense = lineShares.map((share, i) => {
        if (expenseTotalForCost <= 0) return 0;
        if (totalShare <= 0) {
          const positiveLines = itemRowsForCost.filter(
            (r) => r.partId && r.qty > 0,
          ).length;
          return positiveLines > 0
            ? expenseTotalForCost / positiveLines
            : 0;
        }
        return (share / totalShare) * expenseTotalForCost;
      });

      // Aggregate per part: new qty added by this DPO and the matching
      // value-with-expense (= qty × (purchase_price + EXP/unit)).
      const partAggForCost = new Map<
        string,
        { qty: number; totalBaseValue: number; totalValueWithExpense: number }
      >();
      itemRowsForCost.forEach((row, index) => {
        if (!row.partId || row.qty <= 0) return;
        const distExp = lineDistributedExpense[index] || 0;
        const rowValueWithExpense = row.itemValue + distExp;
        const existing = partAggForCost.get(row.partId) || {
          qty: 0,
          totalBaseValue: 0,
          totalValueWithExpense: 0,
        };
        existing.qty += row.qty;
        existing.totalBaseValue += row.itemValue;
        existing.totalValueWithExpense += rowValueWithExpense;
        partAggForCost.set(row.partId, existing);
      });

      for (const [partId, agg] of partAggForCost.entries()) {
        if (agg.qty <= 0) continue;
        const info = partInfoById.get(partId);
        const currentAvg = info?.avgCost || 0;
        const currentStock = Math.max(0, stockByPartId.get(partId) || 0);

        const purchaseRate =
          Math.round((agg.totalBaseValue / agg.qty) * 10000) / 10000;

        // Running weighted average per the user's formula.
        const denom = currentStock + agg.qty;
        const runningAvg =
          currentStock > 0 && currentAvg > 0
            ? (currentAvg * currentStock + agg.totalValueWithExpense) /
              denom
            : agg.totalValueWithExpense / agg.qty;
        const avgCostRate =
          Number.isFinite(runningAvg) && runningAvg > 0
            ? Math.round(runningAvg * 10000) / 10000
            : 0;

        if (purchaseRate > 0 || avgCostRate > 0) {
          await tx.part.update({
            where: { id: partId },
            data: {
              ...(purchaseRate > 0 ? { purchasePrice: purchaseRate } : {}),
              ...(avgCostRate > 0 ? { avgCost: avgCostRate } : {}),
            },
          });
        }
      }

      // 2. Only calculate average cost and create stock movements if Approved
      if (isApprovedStatus(currentStatus)) {
        for (const item of items) {
          const partId = item.part_id;
          const qty = Number(item.quantity) || 0;
          const rate = Number(
            item.unit_cost ??
              item.unitCost ??
              item.purchase_price ??
              item.unit_price ??
              item.unitPrice ??
              0,
          );

          if (partId && rate > 0) {
            const movementStoreId = item.store_id || store_id || null;
            const movementRackId = item.rack_id || null;
            const movementShelfId = item.shelf_id || null;
            // Removed auto-update of avgCost and cost per user request

            await tx.stockMovement.create({
              data: {
                id: crypto.randomUUID(),
                partId,
                type: "in",
                quantity: qty,
                storeId: movementStoreId,
                rackId: movementRackId,
                shelfId: movementShelfId,
                referenceType: "direct_purchase",
                referenceId: dpoId,
                supplierId: supplier_id,
                notes: `Direct Purchase Order: ${dpo_number}`,
              } as any,
            });

            // Keep PartRackShelf in sync with direct purchase location assignments
            if (movementStoreId) {
              const existingPrs = await tx.partRackShelf.findFirst({
                where: {
                  partId,
                  storeId: movementStoreId,
                  rackId: movementRackId,
                  shelfId: movementShelfId,
                },
              });
              if (existingPrs) {
                await tx.partRackShelf.update({
                  where: { id: existingPrs.id },
                  data: { quantity: { increment: qty } },
                });
              } else {
                await tx.partRackShelf.create({
                  data: {
                    id: crypto.randomUUID(),
                    partId,
                    storeId: movementStoreId,
                    rackId: movementRackId,
                    shelfId: movementShelfId,
                    quantity: qty,
                  },
                });
              }
            }
          }
        }
      }

      // Accounting
      const voucherCreationStatus = {
        jvCreated: false,
        pvCreated: false,
        jvNumber: null as string | null,
        pvNumber: null as string | null,
        errors: [] as string[],
      };
      if (isApprovedStatus(currentStatus) && totalAmount > 0) {
        try {
          let inventoryAccount = await tx.account.findFirst({
            where: {
              OR: [
                { Subgroup: { code: "104" } },
                { code: "101001" },
                { code: "104005" },
                { name: { contains: "Inventory - General" } },
              ],
              status: "Active",
            },
            include: { Subgroup: { include: { MainGroup: true } } },
          });
          if (!inventoryAccount) {
            inventoryAccount = await tx.account.findFirst({
              where: {
                OR: [
                  { Subgroup: { code: "104" } },
                  { name: { contains: "Inventory" } },
                ],
                status: "Active",
              },
              include: { Subgroup: { include: { MainGroup: true } } },
            });
          }

          const { counterpartyAccount: mainPayableAccount, counterpartyLabel } =
            await resolveDpoCounterpartyAccount(tx, {
              isTransferIn,
              orderType: resolvedOrderType,
              branchAccountId: branch_account_id || newOrder.branchAccountId,
              supplierId: supplier_id,
              dpoNumber: dpo_number,
            });

          if (inventoryAccount && mainPayableAccount) {
            const lastVoucher = await tx.voucher.findFirst({
              where: { type: "journal", voucherNumber: { startsWith: "JV" } },
              orderBy: { voucherNumber: "desc" },
            });
            const jvNum = lastVoucher
              ? parseInt(lastVoucher.voucherNumber.match(/\d+/)![0]) + 1
              : 1;
            const jvNumber = `JV${String(jvNum).padStart(4, "0")}`;

            const goodsJvDesc =
              discountVal > 0.001
                ? `DPO: ${dpo_number} Inventory Added (items ${itemsTotal}, discount ${discountVal})`
                : `DPO: ${dpo_number} Inventory Added`;
            const voucherEntries = [
              {
                id: crypto.randomUUID(),
                accountId: inventoryAccount.id,
                accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                description: goodsJvDesc,
                debit: itemsTotal,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: mainPayableAccount.id,
                accountName: `${mainPayableAccount.code}-${mainPayableAccount.name}`,
                description: `DPO: ${dpo_number} Liability Created`,
                debit: 0,
                credit: itemsTotal,
                sortOrder: 1,
              },
            ];

            if (discountVal > 0.001) {
              const inventoryDiscountAccount = await tx.account.findFirst({
                where: {
                  status: "Active",
                  OR: [
                    { code: "901002" },
                    { name: { contains: "Cost Inventory Discount" } },
                    { name: { contains: "Inventory Discount" } },
                    { name: { contains: "Cost Inventory (Discount" } },
                    { name: { contains: "Inventory (Discount" } },
                  ],
                },
              });
              if (inventoryDiscountAccount) {
                voucherEntries.push({
                  id: crypto.randomUUID(),
                  accountId: mainPayableAccount.id,
                  accountName: `${mainPayableAccount.code}-${mainPayableAccount.name}`,
                  description: `DPO: ${dpo_number} Discount Adjustment`,
                  debit: discountVal,
                  credit: 0,
                  sortOrder: voucherEntries.length,
                });
                voucherEntries.push({
                  id: crypto.randomUUID(),
                  accountId: inventoryDiscountAccount.id,
                  accountName: `${inventoryDiscountAccount.code}-${inventoryDiscountAccount.name}`,
                  description: `DPO: ${dpo_number} Discount Adjustment`,
                  debit: 0,
                  credit: discountVal,
                  sortOrder: voucherEntries.length,
                });
              } else {
                voucherCreationStatus.errors.push(
                  "Cost Inventory Discount account not found; discount JV adjustment skipped.",
                );
              }
            }

            const sourceExpensesForVoucher =
              expenses && Array.isArray(expenses)
                ? expenses
                : (newOrder.DirectPurchaseOrderExpense || []).map((exp: any) => ({
                    amount: exp.amount,
                    description: exp.description,
                  }));
            if (sourceExpensesForVoucher.length > 0) {
              const totalExpenseAmount = Math.round(
                sourceExpensesForVoucher.reduce((sum: number, exp: any) => {
                  const amt = Number(exp.amount) || 0;
                  return sum + (amt > 0 ? amt : 0);
                }, 0) * 100,
              ) / 100;
              const freightDescriptions = sourceExpensesForVoucher
                .map((exp: any) => (exp?.description || "").trim())
                .filter((desc: string) => !!desc)
                .join("; ");

              if (totalExpenseAmount > 0) {
                const freightAccount = await tx.account.findFirst({
                  where: {
                    status: "Active",
                    OR: [
                      { name: { equals: "Local Purchase Freight", mode: "insensitive" } },
                      { name: { contains: "Local Purchase Freight", mode: "insensitive" } },
                      { name: { equals: "Direct Purchase Freight", mode: "insensitive" } },
                      { name: { contains: "Direct Purchase Freight", mode: "insensitive" } },
                    ],
                  },
                });

                if (freightAccount) {
                  voucherEntries.push({
                    id: crypto.randomUUID(),
                    accountId: inventoryAccount.id,
                    accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                    description: `DPO: ${dpo_number} - Direct Purchase Freight`,
                    debit: totalExpenseAmount,
                    credit: 0,
                    sortOrder: voucherEntries.length,
                  });
                  voucherEntries.push({
                    id: crypto.randomUUID(),
                    accountId: freightAccount.id,
                    accountName: `${freightAccount.code}-${freightAccount.name}`,
                    description:
                      freightDescriptions ||
                      `DPO: ${dpo_number} - Direct Purchase Freight Payable`,
                    debit: 0,
                    credit: totalExpenseAmount,
                    sortOrder: voucherEntries.length,
                  });
                } else {
                  voucherCreationStatus.errors.push(
                    "Direct Purchase Freight account not found; expense JV adjustment skipped.",
                  );
                }
              }
            }

            await tx.voucher.create({
              data: {
                id: crypto.randomUUID(),
                voucherNumber: jvNumber,
                type: "journal",
                date: new Date(date),
                narration: counterpartyLabel,
                totalDebit:
                  Math.round((itemsTotal + expensesTotal) * 100) / 100,
                totalCredit:
                  Math.round((itemsTotal + expensesTotal) * 100) / 100,
                status: "posted",
                createdBy: "System",
                approvedBy: "System",
                approvedAt: new Date(),
                VoucherEntry: { create: voucherEntries },
              },
            });

            for (const entry of voucherEntries) {
              const acc = await tx.account.findUnique({
                where: { id: entry.accountId },
                include: { Subgroup: { include: { MainGroup: true } } },
              });
              if (acc) {
                const type = acc.Subgroup.MainGroup.type.toLowerCase();
                const change =
                  type === "asset" || type === "expense" || type === "cost"
                    ? entry.debit - entry.credit
                    : entry.credit - entry.debit;
                await tx.account.update({
                  where: { id: entry.accountId },
                  data: { currentBalance: { increment: change } },
                });
              }
            }
            voucherCreationStatus.jvCreated = true;
            voucherCreationStatus.jvNumber = jvNumber;
          }

          // PV settles full document total (net items after discount + expenses)
          if (account && totalAmount > 0 && mainPayableAccount) {
            const cashBankAccount = await tx.account.findUnique({
              where: { id: account },
            });
            if (cashBankAccount) {
              const lastPV = await tx.voucher.findFirst({
                where: { type: "payment", voucherNumber: { startsWith: "PV" } },
                orderBy: { voucherNumber: "desc" },
              });
              const pvNum = lastPV
                ? parseInt(lastPV.voucherNumber.match(/\d+/)![0]) + 1
                : 1;
              const pvNumber = `PV${String(pvNum).padStart(4, "0")}`;

              await tx.voucher.create({
                data: {
                  id: crypto.randomUUID(),
                  voucherNumber: pvNumber,
                  type: "payment",
                  date: new Date(date),
                  narration: counterpartyLabel,
                  cashBankAccount: cashBankAccount.name,
                  totalDebit: totalAmount,
                  totalCredit: totalAmount,
                  status: "posted",
                  createdBy: "System",
                  approvedBy: "System",
                  approvedAt: new Date(),
                  VoucherEntry: {
                    create: [
                      {
                        id: crypto.randomUUID(),
                        accountId: mainPayableAccount.id,
                        accountName: `${mainPayableAccount.code}-${mainPayableAccount.name}`,
                        description: `Payment for DPO ${dpo_number}`,
                        debit: totalAmount,
                        credit: 0,
                        sortOrder: 0,
                      },
                      {
                        id: crypto.randomUUID(),
                        accountId: cashBankAccount.id,
                        accountName: `${cashBankAccount.code}-${cashBankAccount.name}`,
                        description: `Payment via ${cashBankAccount.name}`,
                        debit: 0,
                        credit: totalAmount,
                        sortOrder: 1,
                      },
                    ],
                  },
                },
              });

              await tx.account.update({
                where: { id: mainPayableAccount.id },
                data: { currentBalance: { decrement: totalAmount } },
              });
              await tx.account.update({
                where: { id: cashBankAccount.id },
                data: { currentBalance: { decrement: totalAmount } },
              });
              voucherCreationStatus.pvCreated = true;
              voucherCreationStatus.pvNumber = pvNumber;
            }
          }
        } catch (accError: any) {
          voucherCreationStatus.errors.push(accError.message);
        }
      }

      return { order: newOrder, voucherStatus: voucherCreationStatus };
    });

    res.status(201).json({ ...order, vouchers: voucherStatus });
  } catch (error: any) {
    console.error("DPO POST Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update direct purchase order
router.put(
  "/direct-purchase-orders/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        dpo_number,
        date,
        invoice_no,
        invoice_date,
        store_id,
        supplier_id,
        branch_account_id,
        order_type,
        account,
        description,
        status,
        items,
        expenses,
        discount: discountBody,
      } = req.body || {};

      const existingOrder = await prisma.directPurchaseOrder.findUnique({
        where: { id },
        include: {
          DirectPurchaseOrderItem: true,
          DirectPurchaseOrderExpense: true,
        },
      });

      if (!existingOrder) {
        return res
          .status(404)
          .json({ error: "Direct Purchase Order not found" });
      }

      const resolvedOrderType =
        order_type !== undefined
          ? String(order_type).trim() || existingOrder.orderType
          : existingOrder.orderType || "local_purchase";
      const isTransferIn = isTransferInDpo(
        resolvedOrderType,
        dpo_number || existingOrder.dpoNumber,
      );

      if (isTransferIn && branch_account_id === undefined && !existingOrder.branchAccountId) {
        return res.status(400).json({ error: "Branch is required" });
      }
      if (!isTransferIn && supplier_id === undefined && !existingOrder.supplierId) {
        return res.status(400).json({ error: "Supplier is required" });
      }

      // Calculate totals (items + expenses − discount on items only)
      let itemsTotal = 0;
      if (items && Array.isArray(items)) {
        itemsTotal = items.reduce((sum: number, item: any) => {
          const qty = Number(item.quantity) || 0;
          const rate = Number(
            item.unit_cost ??
              item.unitCost ??
              item.purchase_price ??
              item.unit_price ??
              item.unitPrice ??
              0,
          );
          return sum + (Number(item.amount) || qty * rate);
        }, 0);
      } else {
        itemsTotal = existingOrder.DirectPurchaseOrderItem.reduce(
          (s, i) => s + (Number(i.amount) || 0),
          0,
        );
      }

      let expensesTotal = 0;
      if (expenses && Array.isArray(expenses)) {
        expensesTotal = expenses.reduce(
          (sum: number, exp: any) => sum + (Number(exp.amount) || 0),
          0,
        );
      } else {
        expensesTotal = existingOrder.DirectPurchaseOrderExpense.reduce(
          (s, e) => s + (Number(e.amount) || 0),
          0,
        );
      }

      let discountVal =
        discountBody !== undefined && discountBody !== null
          ? Number(discountBody)
          : Number(existingOrder.discount) || 0;
      if (!Number.isFinite(discountVal) || discountVal < 0) discountVal = 0;
      discountVal = Math.min(discountVal, itemsTotal);
      discountVal = Math.round(discountVal * 100) / 100;
      const netItems = Math.round((itemsTotal - discountVal) * 100) / 100;
      const totalAmount = Math.round((netItems + expensesTotal) * 100) / 100;

      const order = await prisma.$transaction(async (tx) => {
        // 1. Update DPO Header
        const updated = await tx.directPurchaseOrder.update({
          where: { id },
          data: {
            dpoNumber: dpo_number || existingOrder.dpoNumber,
            date: date ? new Date(date) : existingOrder.date,
            invoiceNo:
              invoice_no !== undefined
                ? String(invoice_no).trim() || null
                : (existingOrder as any).invoiceNo,
            invoiceDate:
              invoice_date !== undefined
                ? invoice_date
                  ? new Date(invoice_date)
                  : null
                : (existingOrder as any).invoiceDate,
            storeId: store_id !== undefined ? store_id : existingOrder.storeId,
            orderType: resolvedOrderType,
            supplierId: isTransferIn
              ? null
              : supplier_id !== undefined
                ? supplier_id
                : existingOrder.supplierId,
            branchAccountId: isTransferIn
              ? branch_account_id !== undefined
                ? branch_account_id || null
                : existingOrder.branchAccountId
              : null,
            account: account !== undefined ? account : existingOrder.account,
            description:
              description !== undefined
                ? description
                : existingOrder.description,
            status: status || existingOrder.status,
            discount: discountVal,
            totalAmount,
            updatedAt: new Date(),
          } as any,
        });

        // 2. Update Items and Stock Movements if provided
        if (items) {
          await tx.directPurchaseOrderItem.deleteMany({
            where: { directPurchaseOrderId: id },
          });
          await tx.directPurchaseOrderItem.createMany({
            data: items.map((item: any) => ({
              id: crypto.randomUUID(),
              directPurchaseOrderId: id,
              partId: item.part_id,
              quantity: Number(item.quantity) || 0,
              purchasePrice: Number(
                item.unit_cost ??
                  item.unitCost ??
                  item.purchase_price ??
                  item.unit_price ??
                  item.unitPrice ??
                  0,
              ),
              salePrice: Number(item.sale_price || item.salePrice || 0),
              amount:
                Number(item.amount) ||
                Number(item.quantity) *
                  Number(
                    item.unit_cost ??
                      item.unitCost ??
                      item.purchase_price ??
                      item.unit_price ??
                      item.unitPrice ??
                      0,
                  ),
              priceA: item.price_a != null ? Number(item.price_a) : null,
              priceB: item.price_b != null ? Number(item.price_b) : null,
              priceM: item.price_m != null ? Number(item.price_m) : null,
              rackId: item.rack_id || null,
              shelfId: item.shelf_id || null,
            })),
          });

          // Update Part.purchasePrice and Part.avgCost using a running
          // weighted average:
          //
          //   new_avg = (current_avg × current_stock
          //              + Σ_lines((purchase_price + EXP/unit) × qty))
          //             / (current_stock + Σ_lines(qty))
          //
          // For an edit, "current_stock" must exclude this DPO's previous
          // contribution so we are not double-counting it (the prior
          // movements are reversed below in the same transaction, but we
          // need the value before that side-effect occurs).
          const sourceItems: any[] =
            items && Array.isArray(items)
              ? items
              : existingOrder.DirectPurchaseOrderItem.map((it: any) => ({
                  part_id: it.partId,
                  quantity: it.quantity,
                  purchase_price: it.purchasePrice,
                  rack_id: it.rackId,
                  shelf_id: it.shelfId,
                }));
          const sourceExpenses: any[] =
            expenses && Array.isArray(expenses)
              ? expenses
              : existingOrder.DirectPurchaseOrderExpense.map((exp: any) => ({
                  amount: exp.amount,
                  description: exp.description,
                }));

          const sourceItemRowsForCost = sourceItems.map((item: any) => {
            const partId = item.part_id as string | undefined;
            const qty = Number(item.quantity) || 0;
            const baseRate = Number(
              item.unit_cost ??
                item.unitCost ??
                item.purchase_price ??
                item.unit_price ??
                item.unitPrice ??
                0,
            );
            return {
              partId,
              qty,
              baseRate,
              itemValue: qty * baseRate,
              rackId: item.rack_id,
              shelfId: item.shelf_id,
            };
          });
          const totalExpenseForCost = sourceExpenses.reduce(
            (sum: number, exp: any) => sum + (Number(exp.amount) || 0),
            0,
          );

          const uniquePartIdsPut = Array.from(
            new Set(
              sourceItemRowsForCost
                .map((r) => r.partId)
                .filter((id): id is string => Boolean(id)),
            ),
          );

          // Fetch part weight + current avgCost.
          const partRecordsPut = uniquePartIdsPut.length
            ? await tx.part.findMany({
                where: { id: { in: uniquePartIdsPut } },
                select: {
                  id: true,
                  weight: true,
                  avgCost: true,
                  cost: true,
                },
              })
            : [];
          const partInfoByIdPut = new Map<
            string,
            { weight: number; avgCost: number }
          >();
          for (const p of partRecordsPut) {
            const w = Number((p as any).weight) || 0;
            const avg =
              Number((p as any).avgCost) || Number((p as any).cost) || 0;
            partInfoByIdPut.set(p.id, { weight: w, avgCost: avg });
          }

          // Stock per part = total existing stock - this DPO's prior qty.
          const stockByPartIdPut = new Map<string, number>();
          uniquePartIdsPut.forEach((id) => stockByPartIdPut.set(id, 0));
          if (uniquePartIdsPut.length) {
            const grouped = await tx.stockMovement.groupBy({
              by: ["partId", "type"],
              where: {
                partId: { in: uniquePartIdsPut },
                OR: [
                  { referenceType: null },
                  { referenceType: { not: "stock_reservation" } },
                ],
              },
              _sum: { quantity: true },
            });
            for (const row of grouped) {
              const cur = stockByPartIdPut.get(row.partId) || 0;
              const q = Number(row._sum.quantity || 0);
              stockByPartIdPut.set(
                row.partId,
                row.type === "in" ? cur + q : cur - q,
              );
            }
            // Subtract qty contributed by this DPO's existing items so the
            // formula treats it as if the DPO were being added fresh.
            for (const oldItem of existingOrder.DirectPurchaseOrderItem) {
              const pid = (oldItem as any).partId as string | undefined;
              const qty = Number((oldItem as any).quantity) || 0;
              if (!pid) continue;
              if (!stockByPartIdPut.has(pid)) continue;
              stockByPartIdPut.set(
                pid,
                (stockByPartIdPut.get(pid) || 0) - qty,
              );
            }
          }

          // Distribute total expenses by qty × weight, falling back to qty
          // (then equal split) when no positive share exists.
          const lineSharesPut = sourceItemRowsForCost.map((row) => {
            if (!row.partId || row.qty <= 0) return 0;
            const w = partInfoByIdPut.get(row.partId)?.weight || 0;
            return w > 0 ? row.qty * w : row.qty;
          });
          const totalSharePut = lineSharesPut.reduce((s, v) => s + v, 0);
          const lineDistributedExpensePut = lineSharesPut.map((share, i) => {
            if (totalExpenseForCost <= 0) return 0;
            if (totalSharePut <= 0) {
              const positiveLines = sourceItemRowsForCost.filter(
                (r) => r.partId && r.qty > 0,
              ).length;
              return positiveLines > 0
                ? totalExpenseForCost / positiveLines
                : 0;
            }
            return (share / totalSharePut) * totalExpenseForCost;
          });

          // Aggregate per part.
          const partAggForCostPut = new Map<
            string,
            {
              qty: number;
              totalBaseValue: number;
              totalValueWithExpense: number;
            }
          >();
          sourceItemRowsForCost.forEach((row, index) => {
            if (!row.partId || row.qty <= 0) return;
            const distExp = lineDistributedExpensePut[index] || 0;
            const rowValueWithExpense = row.itemValue + distExp;
            const existing = partAggForCostPut.get(row.partId) || {
              qty: 0,
              totalBaseValue: 0,
              totalValueWithExpense: 0,
            };
            existing.qty += row.qty;
            existing.totalBaseValue += row.itemValue;
            existing.totalValueWithExpense += rowValueWithExpense;
            partAggForCostPut.set(row.partId, existing);
          });

          for (const [partId, agg] of partAggForCostPut.entries()) {
            if (agg.qty <= 0) continue;
            const info = partInfoByIdPut.get(partId);
            const currentAvg = info?.avgCost || 0;
            const currentStock = Math.max(
              0,
              stockByPartIdPut.get(partId) || 0,
            );

            const purchaseRate =
              Math.round((agg.totalBaseValue / agg.qty) * 10000) / 10000;

            const denom = currentStock + agg.qty;
            const runningAvg =
              currentStock > 0 && currentAvg > 0
                ? (currentAvg * currentStock + agg.totalValueWithExpense) /
                  denom
                : agg.totalValueWithExpense / agg.qty;
            const avgCostRate =
              Number.isFinite(runningAvg) && runningAvg > 0
                ? Math.round(runningAvg * 10000) / 10000
                : 0;

            if (purchaseRate > 0 || avgCostRate > 0) {
              await tx.part.update({
                where: { id: partId },
                data: {
                  ...(purchaseRate > 0
                    ? { purchasePrice: purchaseRate }
                    : {}),
                  ...(avgCostRate > 0 ? { avgCost: avgCostRate } : {}),
                },
              });
            }
          }

          // Stock Movements and Avg Cost (Only handle if Completed/Received/Approved)
          const isApprovedStatus = (s: string) =>
            ["completed", "received", "approved"].includes(s.toLowerCase());
          const newStatus = status || existingOrder.status;

          if (isApprovedStatus(newStatus)) {
            // Re-create stock movements. Delete existing movements first to avoid duplication
            const oldMovements = await tx.stockMovement.findMany({
              where: { referenceType: "direct_purchase", referenceId: id, type: "in" },
            });
            // Reverse old direct purchase impact from PartRackShelf
            for (const mv of oldMovements) {
              if (!mv.storeId) continue;
              const existingPrs = await tx.partRackShelf.findFirst({
                where: {
                  partId: mv.partId,
                  storeId: mv.storeId,
                  rackId: mv.rackId || null,
                  shelfId: mv.shelfId || null,
                },
              });
              if (!existingPrs) continue;
              const nextQty = Number(existingPrs.quantity || 0) - Number(mv.quantity || 0);
              if (nextQty <= 0) {
                await tx.partRackShelf.delete({ where: { id: existingPrs.id } });
              } else {
                await tx.partRackShelf.update({
                  where: { id: existingPrs.id },
                  data: { quantity: nextQty },
                });
              }
            }
            await tx.stockMovement.deleteMany({
              where: { referenceType: "direct_purchase", referenceId: id },
            });

            for (const item of sourceItems) {
              const partId = String(item.part_id || "");
              const qty = Number(item.quantity) || 0;
              const rate = Number(
                item.unit_cost ??
                  item.unitCost ??
                  item.purchase_price ??
                  item.unit_price ??
                  item.unitPrice ??
                  0,
              );
              const movementStoreId = item.store_id || store_id || existingOrder.storeId || null;
              const movementRackId = item.rack_id || null;
              const movementShelfId = item.shelf_id || null;

              if (!partId || qty <= 0) continue;
              if (rate > 0) {
                // Removed auto-update of avgCost and cost per user request
              }

              // Create stock movement per item row (preserve per-row location)
              await tx.stockMovement.create({
                data: {
                  id: crypto.randomUUID(),
                  partId,
                  type: "in",
                  quantity: qty,
                  storeId: movementStoreId,
                  rackId: movementRackId,
                  shelfId: movementShelfId,
                  referenceType: "direct_purchase",
                  referenceId: id,
                  supplierId: supplier_id || existingOrder.supplierId,
                  notes: `Updated DPO: ${dpo_number || existingOrder.dpoNumber}`,
                } as any,
              });

              // Sync PartRackShelf for the exact row location
              if (movementStoreId) {
                const existingPrs = await tx.partRackShelf.findFirst({
                  where: {
                    partId,
                    storeId: movementStoreId,
                    rackId: movementRackId,
                    shelfId: movementShelfId,
                  },
                });
                if (existingPrs) {
                  await tx.partRackShelf.update({
                    where: { id: existingPrs.id },
                    data: { quantity: { increment: qty } },
                  });
                } else {
                  await tx.partRackShelf.create({
                    data: {
                      id: crypto.randomUUID(),
                      partId,
                      storeId: movementStoreId,
                      rackId: movementRackId,
                      shelfId: movementShelfId,
                      quantity: qty,
                    },
                  });
                }
              }
            }
          }
        }

        // 3. Update Expenses if provided
        if (expenses) {
          await tx.directPurchaseOrderExpense.deleteMany({
            where: { directPurchaseOrderId: id },
          });
          await tx.directPurchaseOrderExpense.createMany({
            data: expenses.map((exp: any) => ({
              id: crypto.randomUUID(),
              directPurchaseOrderId: id,
              expenseType: exp.expense_type,
              payableAccount: exp.payable_account,
              description: exp.description || null,
              amount: Number(exp.amount) || 0,
            })),
          });
        }

        // 4. Accounting (Triggers if status becomes Approved/Received/Completed from another status)
        const isApprovedStatus = (s: string) =>
          ["completed", "received", "approved"].includes(s.toLowerCase());
        const isNowApproved =
          status &&
          isApprovedStatus(status) &&
          !isApprovedStatus(existingOrder.status);
        if (isNowApproved && totalAmount > 0) {
          let inventoryAccount = await tx.account.findFirst({
            where: {
              OR: [
                { Subgroup: { code: "104" } },
                { code: "101001" },
                { code: "104005" },
                { name: { contains: "Inventory - General" } },
              ],
              status: "Active",
            },
            include: { Subgroup: { include: { MainGroup: true } } },
          });
          if (!inventoryAccount) {
            inventoryAccount = await tx.account.findFirst({
              where: {
                OR: [
                  { Subgroup: { code: "104" } },
                  { name: { contains: "Inventory" } },
                ],
                status: "Active",
              },
              include: { Subgroup: { include: { MainGroup: true } } },
            });
          }

          const { counterpartyAccount: mainPayableAccount, counterpartyLabel } =
            await resolveDpoCounterpartyAccount(tx, {
              isTransferIn,
              orderType: updated.orderType,
              branchAccountId: updated.branchAccountId,
              supplierId: updated.supplierId,
              dpoNumber: updated.dpoNumber,
            });

          if (inventoryAccount && mainPayableAccount) {
            const lastVoucher = await tx.voucher.findFirst({
              where: { type: "journal", voucherNumber: { startsWith: "JV" } },
              orderBy: { voucherNumber: "desc" },
            });
            const jvNum = lastVoucher
              ? parseInt(lastVoucher.voucherNumber.match(/\d+/)![0]) + 1
              : 1;
            const voucherNumber = `JV${String(jvNum).padStart(4, "0")}`;

            const goodsJvDescUpd =
              discountVal > 0.001
                ? `DPO: ${updated.dpoNumber} Inventory Added (items ${itemsTotal}, discount ${discountVal})`
                : `DPO: ${updated.dpoNumber} Inventory Added`;
            const voucherEntries = [
              {
                id: crypto.randomUUID(),
                accountId: inventoryAccount.id,
                accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                description: goodsJvDescUpd,
                debit: itemsTotal,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: mainPayableAccount.id,
                accountName: `${mainPayableAccount.code}-${mainPayableAccount.name}`,
                description: `DPO: ${updated.dpoNumber} Liability Created`,
                debit: 0,
                credit: itemsTotal,
                sortOrder: 1,
              },
            ];

            if (discountVal > 0.001) {
              const inventoryDiscountAccount = await tx.account.findFirst({
                where: {
                  status: "Active",
                  OR: [
                    { code: "901002" },
                    { name: { contains: "Cost Inventory Discount" } },
                    { name: { contains: "Inventory Discount" } },
                    { name: { contains: "Cost Inventory (Discount" } },
                    { name: { contains: "Inventory (Discount" } },
                  ],
                },
              });
              if (inventoryDiscountAccount) {
                voucherEntries.push({
                  id: crypto.randomUUID(),
                  accountId: mainPayableAccount.id,
                  accountName: `${mainPayableAccount.code}-${mainPayableAccount.name}`,
                  description: `DPO: ${updated.dpoNumber} Discount Adjustment`,
                  debit: discountVal,
                  credit: 0,
                  sortOrder: voucherEntries.length,
                });
                voucherEntries.push({
                  id: crypto.randomUUID(),
                  accountId: inventoryDiscountAccount.id,
                  accountName: `${inventoryDiscountAccount.code}-${inventoryDiscountAccount.name}`,
                  description: `DPO: ${updated.dpoNumber} Discount Adjustment`,
                  debit: 0,
                  credit: discountVal,
                  sortOrder: voucherEntries.length,
                });
              } else {
                console.warn(
                  "Cost Inventory Discount account not found; discount JV adjustment skipped.",
                );
              }
            }

            const sourceExpensesForVoucher =
              expenses && Array.isArray(expenses)
                ? expenses
                : existingOrder.DirectPurchaseOrderExpense.map((exp: any) => ({
                    amount: exp.amount,
                    description: exp.description,
                  }));
            if (sourceExpensesForVoucher.length > 0) {
              const totalExpenseAmount = Math.round(
                sourceExpensesForVoucher.reduce((sum: number, exp: any) => {
                  const amt = Number(exp.amount) || 0;
                  return sum + (amt > 0 ? amt : 0);
                }, 0) * 100,
              ) / 100;
              const freightDescriptions = sourceExpensesForVoucher
                .map((exp: any) => (exp?.description || "").trim())
                .filter((desc: string) => !!desc)
                .join("; ");

              if (totalExpenseAmount > 0) {
                const freightAccount = await tx.account.findFirst({
                  where: {
                    status: "Active",
                    OR: [
                      { name: { equals: "Local Purchase Freight", mode: "insensitive" } },
                      { name: { contains: "Local Purchase Freight", mode: "insensitive" } },
                      { name: { equals: "Direct Purchase Freight", mode: "insensitive" } },
                      { name: { contains: "Direct Purchase Freight", mode: "insensitive" } },
                    ],
                  },
                });

                if (freightAccount) {
                  voucherEntries.push({
                    id: crypto.randomUUID(),
                    accountId: inventoryAccount.id,
                    accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                    description: `DPO: ${updated.dpoNumber} - Direct Purchase Freight`,
                    debit: totalExpenseAmount,
                    credit: 0,
                    sortOrder: voucherEntries.length,
                  });
                  voucherEntries.push({
                    id: crypto.randomUUID(),
                    accountId: freightAccount.id,
                    accountName: `${freightAccount.code}-${freightAccount.name}`,
                    description:
                      freightDescriptions ||
                      `DPO: ${updated.dpoNumber} - Direct Purchase Freight Payable`,
                    debit: 0,
                    credit: totalExpenseAmount,
                    sortOrder: voucherEntries.length,
                  });
                } else {
                  console.warn(
                    "Direct Purchase Freight account not found; expense JV adjustment skipped.",
                  );
                }
              }
            }

            await tx.voucher.create({
              data: {
                id: crypto.randomUUID(),
                voucherNumber,
                type: "journal",
                date: new Date(date || updated.date),
                narration: counterpartyLabel,
                totalDebit:
                  Math.round((itemsTotal + expensesTotal) * 100) / 100,
                totalCredit:
                  Math.round((itemsTotal + expensesTotal) * 100) / 100,
                status: "posted",
                createdBy: "System",
                approvedBy: "System",
                approvedAt: new Date(),
                VoucherEntry: { create: voucherEntries },
              },
            });

            for (const entry of voucherEntries) {
              const acc = await tx.account.findUnique({
                where: { id: entry.accountId },
                include: { Subgroup: { include: { MainGroup: true } } },
              });
              if (acc) {
                const type = acc.Subgroup.MainGroup.type.toLowerCase();
                const change =
                  type === "asset" || type === "expense" || type === "cost"
                    ? entry.debit - entry.credit
                    : entry.credit - entry.debit;
                await tx.account.update({
                  where: { id: entry.accountId },
                  data: { currentBalance: { increment: change } },
                });
              }
            }

            const paymentAccountId = account || updated.account;
            if (paymentAccountId && totalAmount > 0) {
              const cashBankAccount = await tx.account.findUnique({
                where: { id: paymentAccountId },
              });
              if (cashBankAccount) {
                const lastPV = await tx.voucher.findFirst({
                  where: {
                    type: "payment",
                    voucherNumber: { startsWith: "PV" },
                  },
                  orderBy: { voucherNumber: "desc" },
                });
                const pvNum = lastPV
                  ? parseInt(lastPV.voucherNumber.match(/\d+/)![0]) + 1
                  : 1;
                const pvVoucherNumber = `PV${String(pvNum).padStart(4, "0")}`;

                await tx.voucher.create({
                  data: {
                    id: crypto.randomUUID(),
                    voucherNumber: pvVoucherNumber,
                    type: "payment",
                    date: new Date(date || updated.date),
                    narration: counterpartyLabel,
                    cashBankAccount: cashBankAccount.name,
                    totalDebit: totalAmount,
                    totalCredit: totalAmount,
                    status: "posted",
                    createdBy: "System",
                    approvedBy: "System",
                    approvedAt: new Date(),
                    VoucherEntry: {
                      create: [
                        {
                          id: crypto.randomUUID(),
                          accountId: mainPayableAccount.id,
                          accountName: `${mainPayableAccount.code}-${mainPayableAccount.name}`,
                          description: `Payment for DPO ${updated.dpoNumber}`,
                          debit: totalAmount,
                          credit: 0,
                          sortOrder: 0,
                        },
                        {
                          id: crypto.randomUUID(),
                          accountId: cashBankAccount.id,
                          accountName: `${cashBankAccount.code}-${cashBankAccount.name}`,
                          description: `Payment for DPO ${updated.dpoNumber}`,
                          debit: 0,
                          credit: totalAmount,
                          sortOrder: 1,
                        },
                      ],
                    },
                  },
                });

                await tx.account.update({
                  where: { id: mainPayableAccount.id },
                  data: { currentBalance: { decrement: totalAmount } },
                });
                await tx.account.update({
                  where: { id: cashBankAccount.id },
                  data: { currentBalance: { decrement: totalAmount } },
                });
              }
            }
          }
        }

        return updated;
      });

      res.json(order);
    } catch (error: any) {
      console.error("Error updating DPO:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Delete direct purchase order
// Create Payment Voucher for supplier payment
router.post(
  "/direct-purchase-orders/:dpoId/payment",
  async (req: Request, res: Response) => {
    try {
      const { dpoId } = req.params;
      const { amount, cashBankAccountId, paymentDate, description } = req.body;

      // Get DPO
      const dpo = await prisma.directPurchaseOrder.findUnique({
        where: { id: dpoId },
      });

      if (!dpo) {
        return res.status(400).json({
          error: "Direct Purchase Order not found",
        });
      }

      const isTransferIn = (dpo.orderType || "local_purchase") === "transfer_in";

      if (!isTransferIn && !dpo.supplierId) {
        return res.status(400).json({
          error: "Direct Purchase Order has no supplier",
        });
      }

      if (isTransferIn && !dpo.branchAccountId) {
        return res.status(400).json({
          error: "Transfer In order has no branch account",
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          error: "Payment amount is required and must be greater than 0",
        });
      }

      let counterpartyAccount: {
        id: string;
        code: string;
        name: string;
      } | null = null;
      let counterpartyLabel = "Supplier";

      if (isTransferIn && dpo.branchAccountId) {
        counterpartyAccount = await prisma.account.findUnique({
          where: { id: dpo.branchAccountId },
          select: { id: true, code: true, name: true },
        });
        counterpartyLabel = counterpartyAccount?.name || "Branch";
      } else {
        const supplier = await prisma.supplier.findUnique({
          where: { id: dpo.supplierId! },
        });

        if (!supplier) {
          return res.status(400).json({ error: "Supplier not found" });
        }

        counterpartyLabel =
          supplier.companyName || supplier.name || "Supplier";

        const payablesSubgroup = await prisma.subgroup.findFirst({
          where: { code: "301" },
        });

        if (!payablesSubgroup) {
          return res
            .status(400)
            .json({ error: "Supplier Payables subgroup not found" });
        }

        counterpartyAccount = await prisma.account.findFirst({
          where: {
            subgroupId: payablesSubgroup.id,
            OR: [
              { name: supplier.companyName || "" },
              { name: supplier.name || "" },
            ],
          },
          select: { id: true, code: true, name: true },
        });
      }

      if (!counterpartyAccount) {
        return res.status(400).json({
          error: isTransferIn
            ? "Branch account not found."
            : "Supplier account not found. Please ensure supplier account exists.",
        });
      }

      // Get cash/bank account (current asset)
      const cashBankAccount = await prisma.account.findUnique({
        where: { id: cashBankAccountId },
        include: {
          Subgroup: {
            include: {
              MainGroup: true,
            },
          },
        },
      });

      if (!cashBankAccount) {
        return res.status(400).json({ error: "Cash/Bank account not found" });
      }

      // Verify it's a Cash (101) or Bank (102) account
      const subgroupCode = cashBankAccount.Subgroup?.code || "";
      const isCashOrBank = subgroupCode === "101" || subgroupCode === "102";

      if (!isCashOrBank) {
        // If not cash/bank by subgroup code, check mainGroup type as fallback
        const accountType =
          cashBankAccount.Subgroup?.MainGroup?.type?.toLowerCase() || "";
        if (accountType !== "asset") {
          return res.status(400).json({
            error:
              "Selected account must be a Cash (subgroup 101) or Bank (subgroup 102) account",
          });
        }
      }

      // Generate PV number (format: PV3116 - 4 digits)
      const lastPV = await prisma.voucher.findFirst({
        where: {
          type: "payment",
          voucherNumber: {
            startsWith: "PV",
          },
        },
        orderBy: {
          voucherNumber: "desc",
        },
      });

      let pvNumber = 1;
      if (lastPV) {
        const match = lastPV.voucherNumber.match(/^PV(\d+)$/);
        if (match) {
          pvNumber = parseInt(match[1]) + 1;
        } else {
          // Fallback: count all payment vouchers
          const voucherCount = await prisma.voucher.count({
            where: { type: "payment" },
          });
          pvNumber = voucherCount + 1;
        }
      }
      const voucherNumber = `PV${String(pvNumber).padStart(4, "0")}`;

      // Create Payment Voucher
      const paymentVoucher = await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber,
          type: "payment",
          date: paymentDate ? new Date(paymentDate) : new Date(),
          narration: `${counterpartyLabel} Payment`,
          cashBankAccount: cashBankAccount.name,
          totalDebit: amount,
          totalCredit: amount,
          status: "posted",
          createdBy: "System",
          approvedBy: "System",
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: [
              {
                id: crypto.randomUUID(),
                accountId: counterpartyAccount.id,
                accountName: `${counterpartyAccount.code}-${counterpartyAccount.name}`,
                description: description || `Payment for DPO ${dpo.dpoNumber}`,
                debit: amount,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: cashBankAccount.id,
                accountName: `${cashBankAccount.code}-${cashBankAccount.name}`,
                description: description || `Payment made`,
                debit: 0,
                credit: amount,
                sortOrder: 1,
              },
            ],
          },
        },
      });

      // Update account balances
      await prisma.account.update({
        where: { id: counterpartyAccount.id },
        data: {
          currentBalance: {
            decrement: amount,
          },
        },
      });

      await prisma.account.update({
        where: { id: cashBankAccount.id },
        data: {
          currentBalance: {
            decrement: amount,
          },
        },
      });

      res.status(201).json({
        data: {
          id: paymentVoucher.id,
          voucherNumber: paymentVoucher.voucherNumber,
          amount,
          counterparty: counterpartyAccount.name,
          cashBankAccount: cashBankAccount.name,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.delete(
  "/direct-purchase-orders/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const order = await prisma.directPurchaseOrder.findUnique({
        where: { id },
      });
      if (!order) {
        return res
          .status(404)
          .json({ error: "Direct purchase order not found" });
      }

      // Delete associated stock movements
      await prisma.stockMovement.deleteMany({
        where: {
          referenceType: "direct_purchase",
          referenceId: id,
        },
      });

      // Delete order (items and expenses will be deleted via cascade)
      await prisma.directPurchaseOrder.delete({ where: { id } });

      res.json({ message: "Direct purchase order deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Reserve stock for a part (general reservation, not tied to invoice)
// Note: Reserved stock is tracked separately and does not affect stock in/out calculations
router.post("/stock/reserve", async (req: Request, res: Response) => {
  try {
    const { partId, quantity } = req.body;

    if (!partId || quantity === undefined || quantity === null) {
      return res
        .status(400)
        .json({ error: "partId and quantity are required" });
    }

    // Check if part exists
    const part = await prisma.part.findUnique({
      where: { id: partId },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }

    const qty = parseInt(quantity as string);

    // To prevent "adding up" bugs, we will consolidate all existing general reservations for this part.
    // First, delete any existing general reservations (those not tied to an invoice).
    await prisma.stockReservation.deleteMany({
      where: {
        partId: partId,
        invoiceId: null,
        status: "reserved",
      },
    });

    if (qty <= 0) {
      return res.json({
        message: "Reservation removed successfully",
        partId,
        quantity: 0,
      });
    }

    // Create a new single reservation for this quantity
    const reservation = await (prisma.stockReservation as any).create({
      data: {
        id: crypto.randomUUID(),
        partId: partId,
        quantity: qty,
        status: "reserved",
        notes: `General reservation: ${qty} units`,
      },
      include: {
        Part: {
          include: {
            Brand: true,
          },
        },
      },
    });

    res.status(200).json({
      id: reservation.id,
      partId: reservation.partId,
      partNo: reservation.part.partNo,
      quantity: reservation.quantity,
      reservedAt: reservation.reservedAt,
      message: `${qty} units reserved successfully`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
