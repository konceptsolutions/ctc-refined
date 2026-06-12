
// Dedicated API for Adjustment Item Details
// Optimized to return ONLY relevant fields for the adjustment/stock taking interface

import express, { Request, Response } from "express";
import prisma from "../config/database";

const router = express.Router();

router.get("/:partId", async (req: Request, res: Response) => {
    try {
        const { partId } = req.params;
        // Optional store_id query param if we want to filter by store
        const { store_id } = req.query;

        // 1. Fetch Basic Part Info
        const part = await prisma.part.findUnique({
            where: { id: partId },
            include: {
                Brand: true,
                Category: true,
            },
        });

        if (!part) {
            return res.status(404).json({ error: "Part not found" });
        }

        // 2. Calculate Stock Levels (In/Out/Current)
        // If store_id is provided, filter movements by store
        const whereMovements: any = { partId: partId };
        if (store_id) {
            whereMovements.storeId = store_id;
        }

        const movements = await prisma.stockMovement.findMany({
            where: whereMovements,
            select: { type: true, quantity: true }
        });

        // Match cost-lookup / Stock In-Out: only exact lowercase "in" adds stock;
        // every other type (including "IN", "out", etc.) reduces stock.
        const currentStock = movements.reduce(
            (sum, m) => sum + (m.type === "in" ? m.quantity : -m.quantity),
            0,
        );

        // 3. Get Cost Data (Raw Query for reliability as seen in other endpoints)
        const partCosts: any[] = await prisma.$queryRaw`
      SELECT cost, "purchasePrice", "avgCost", "priceA", "priceB", "priceM"
      FROM "Part" 
      WHERE id = ${partId}
    `;
        const rawPartData = partCosts[0] || {};
        const cost = rawPartData.cost || part.cost || 0;
        const avgCost = rawPartData.avgCost || 0;
        const priceA = rawPartData.priceA || part.priceA || 0;
        const priceB = rawPartData.priceB || part.priceB || 0;
        const priceM = rawPartData.priceM || part.priceM || 0;

        // 4. Construct Clean Response
        const response = {
            part_id: part.id,
            part_no: part.partNo,
            description: part.description,
            brand: (part as any).Brand?.name || null,
            category: (part as any).Category?.name || null,
            current_stock: currentStock,
            cost: cost,
            avg_cost: avgCost,
            priceA: priceA,
            priceB: priceB,
            priceM: priceM
        };

        res.json(response);
    } catch (error: any) {
        console.error(`[API] Error in stock-details: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

export default router;
