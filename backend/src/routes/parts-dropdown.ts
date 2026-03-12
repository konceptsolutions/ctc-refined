import express, { Request, Response } from "express";
import prisma from "../config/database";

const router = express.Router();

/**
 * Optimized API for AdjustItem Dropdown
 * Fetches only essential fields needed for the dropdown options.
 * Avoids heavy joins and calculations.
 * 
 * USER REQUEST: "Remove all the limits it will load all item Dropdown at once"
 */
router.get("/dropdown", async (req: Request, res: Response) => {
    // Add cache headers but ensure revalidation
    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    try {
        const { search, limit } = req.query;

        // Default behavior: NO LIMIT (undefined take)
        // If limit is provided and NOT "all", use it.
        // If limit is "all" or undefined, use undefined (fetch all).

        let limitNum: number | undefined = undefined;
        if (limit && limit !== "all") {
            const parsed = parseInt(limit as string);
            if (!isNaN(parsed)) {
                limitNum = parsed;
            }
        }

        const where: any = {
            status: "active"
        };

        if (search) {
            const searchStr = search as string;
            where.OR = [
                { partNo: { contains: searchStr, mode: "insensitive" } },
                { description: { contains: searchStr, mode: "insensitive" } },
                { Brand: { name: { contains: searchStr, mode: "insensitive" } } },
                { MasterPart: { masterPartNo: { contains: searchStr, mode: "insensitive" } } }
            ];
        }

        // Use select to fetch ONLY what is needed for the dropdown label
        // Label format: Master Part | Part No (brand) for easy filtering
        const parts = await prisma.part.findMany({
            where,
            select: {
                id: true,
                partNo: true,
                description: true,
                Brand: {
                    select: {
                        name: true
                    }
                },
                MasterPart: {
                    select: {
                        masterPartNo: true
                    }
                }
            },
            orderBy: {
                partNo: 'asc'
            },
            take: limitNum
        });

        const transformed = parts.map(p => ({
            id: p.id,
            partNo: p.partNo,
            masterPartNo: (p as any).MasterPart?.masterPartNo ?? null,
            description: p.description,
            brand: p.Brand?.name || null
        }));

        res.json({
            data: transformed
        });

    } catch (error: any) {
        console.error("Error in parts dropdown API:", error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
