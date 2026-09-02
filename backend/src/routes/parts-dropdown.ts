import express, { Request, Response } from "express";
import prisma from "../config/database";
import { buildPartSearchWhereWithFamily } from "../utils/partFamilySearch";

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
        const searchStr = typeof search === "string" ? search.trim() : "";

        // Searching: default to a small page so autocomplete stays fast.
        // No search + no limit: keep legacy "load all" for Adjust Inventory.
        let limitNum: number | undefined = undefined;
        if (limit && limit !== "all") {
            const parsed = parseInt(limit as string, 10);
            if (!isNaN(parsed) && parsed > 0) {
                limitNum = Math.min(parsed, 500);
            }
        } else if (searchStr && limit !== "all") {
            limitNum = 80;
        }

        const where: any = await buildPartSearchWhereWithFamily(
            searchStr,
            { status: "active" },
        );

        // Use select to fetch ONLY what is needed for the dropdown label
        // Label format: Part No (master_part_no) | Master Part (part_no)
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
