import express, { Request, Response } from "express";
import prisma from "../config/database";

const router = express.Router();

// Advanced search endpoint - optimized for speed and exact matching
router.get("/search", async (req: Request, res: Response) => {
  // No cache to ensure fresh data
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const { q, type = "all", limit = "50" } = req.query;

    if (!q || typeof q !== "string" || q.trim().length < 1) {
      return res.json({ data: [], exact: [], related: [] });
    }

    const searchTerm = q.trim();
    const searchLower = searchTerm.toLowerCase();
    const limitNum = Math.min(parseInt(limit as string) || 50, 200); // Max 200 results

    let exactMatches: any[] = [];
    let relatedMatches: any[] = [];

    // Determine search type
    const searchType = type as string;

    // MODEL SEARCH - Search in models table directly
    if (searchType === "model" || searchType === "all") {
      try {
        // Get all models that match the search term
        const models = await prisma.model.findMany({
          where: {
            name: {
              contains: searchTerm,
              mode: "insensitive", // Ensure case-insensitive search
            },
          },
          include: {
            Part: {
              include: {
                MasterPart: true,
                Brand: true,
                Category: true,
                Subcategory: true,
                Application: true,
              },
            },
          },
          take: limitNum,
        });

        // Separate exact matches from partial matches
        models.forEach((model: any) => {
          const modelNameLower = model.name.toLowerCase();
          const result = {
            type: "model",
            modelId: model.id,
            modelName: model.name,
            qtyUsed: model.qtyUsed,
            partId: model.Part.id,
            partNo: model.Part.partNo,
            masterPartNo: model.Part.MasterPart?.masterPartNo || null,
            brand: model.Part.Brand?.name || null,
            description: model.Part.description || "",
            category: model.Part.Category?.name || null,
            subcategory: model.Part.Subcategory?.name || null,
            application: model.Part.Application?.name || null,
            status: model.Part.status,
          };

          // Exact match (case-insensitive)
          if (modelNameLower === searchLower) {
            exactMatches.push(result);
          } else {
            relatedMatches.push(result);
          }
        });
      } catch (error) {
        console.error("Model search error:", error);
      }
    }

    // PART NUMBER SEARCH
    if (searchType === "part" || searchType === "all") {
      try {
        const parts = await prisma.part.findMany({
          where: {
            partNo: {
              contains: searchTerm,
              mode: "insensitive", // Ensure case-insensitive search
            },
          },
          include: {
            MasterPart: true,
            Brand: true,
            Category: true,
            Subcategory: true,
            Application: true,
            Model: true,
          },
          take: limitNum,
        });

        parts.forEach((part: any) => {
          const partNoLower = part.partNo.toLowerCase();
          const result = {
            type: "part",
            partId: part.id,
            partNo: part.partNo,
            masterPartNo: part.MasterPart?.masterPartNo || null,
            brand: part.Brand?.name || null,
            description: part.description || "",
            category: part.Category?.name || null,
            subcategory: part.Subcategory?.name || null,
            application: part.Application?.name || null,
            status: part.status,
            modelsCount: part.Model.length,
          };

          // Exact match (case-insensitive)
          if (partNoLower === searchLower) {
            exactMatches.push(result);
          } else {
            relatedMatches.push(result);
          }
        });
      } catch (error) {
        console.error("Part number search error:", error);
      }
    }

    // MASTER PART NUMBER SEARCH
    if (searchType === "master" || searchType === "all") {
      try {
        const masterParts = await prisma.masterPart.findMany({
          where: {
            masterPartNo: {
              contains: searchTerm,
              mode: "insensitive", // Ensure case-insensitive search
            },
          },
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
                Subcategory: true,
                Application: true,
                Model: true,
              },
              take: 10, // Limit parts per master part
            },
          },
          take: limitNum,
        });

        masterParts.forEach((masterPart: any) => {
          const masterPartNoLower = masterPart.masterPartNo.toLowerCase();

          masterPart.Part.forEach((part: any) => {
            const result = {
              type: "master",
              partId: part.id,
              partNo: part.partNo,
              masterPartNo: masterPart.masterPartNo,
              brand: part.Brand?.name || null,
              description: part.description || "",
              category: part.Category?.name || null,
              subcategory: part.Subcategory?.name || null,
              application: part.Application?.name || null,
              status: part.status,
              modelsCount: part.Model.length,
            };

            // Exact match (case-insensitive)
            if (masterPartNoLower === searchLower) {
              exactMatches.push(result);
            } else {
              relatedMatches.push(result);
            }
          });
        });
      } catch (error) {
        console.error("Master part search error:", error);
      }
    }

    // BRAND SEARCH
    if (searchType === "brand" || searchType === "all") {
      try {
        const brands = await prisma.brand.findMany({
          where: {
            name: {
              contains: searchTerm,
              mode: "insensitive", // Ensure case-insensitive search
            },
          },
          include: {
            Part: {
              include: {
                MasterPart: true,
                Category: true,
                Subcategory: true,
                Application: true,
                Model: true,
              },
              take: 10, // Limit parts per brand
            },
          },
          take: 10,
        });

        brands.forEach((brand: any) => {
          const brandNameLower = brand.name.toLowerCase();

          brand.Part.forEach((part: any) => {
            const result = {
              type: "brand",
              partId: part.id,
              partNo: part.partNo,
              masterPartNo: part.MasterPart?.masterPartNo || null,
              brand: brand.name,
              description: part.description || "",
              category: part.Category?.name || null,
              subcategory: part.Subcategory?.name || null,
              application: part.Application?.name || null,
              status: part.status,
              modelsCount: part.Model.length,
            };

            // Exact match (case-insensitive)
            if (brandNameLower === searchLower) {
              exactMatches.push(result);
            } else {
              relatedMatches.push(result);
            }
          });
        });
      } catch (error) {
        console.error("Brand search error:", error);
      }
    }

    // DESCRIPTION SEARCH (only if search term is longer than 3 characters)
    if (
      (searchType === "description" || searchType === "all") &&
      searchTerm.length >= 3
    ) {
      try {
        const parts = await prisma.part.findMany({
          where: {
            description: {
              contains: searchTerm,
              mode: "insensitive", // Ensure case-insensitive search
            },
          },
          include: {
            MasterPart: true,
            Brand: true,
            Category: true,
            Subcategory: true,
            Application: true,
            Model: true,
          },
          take: Math.min(limitNum, 50), // Increased description limit
        });

        parts.forEach((part: any) => {
          const result = {
            type: "description",
            partId: part.id,
            partNo: part.partNo,
            masterPartNo: part.MasterPart?.masterPartNo || null,
            brand: part.Brand?.name || null,
            description: part.description || "",
            category: part.Category?.name || null,
            subcategory: part.Subcategory?.name || null,
            application: part.Application?.name || null,
            status: part.status,
            modelsCount: part.Model.length,
          };

          // Description matches are always related, not exact
          relatedMatches.push(result);
        });
      } catch (error) {
        console.error("Description search error:", error);
      }
    }

    // Remove duplicates based on partId (but for models, allow multiple models per part)
    const seenPartIds = new Set<string>();
    const seenModelKeys = new Set<string>();

    exactMatches = exactMatches.filter((item) => {
      // For model type, use modelId + partId as key to allow multiple models per part
      if (item.type === "model") {
        const key = `model-${item.modelId}-${item.partId}`;
        if (seenModelKeys.has(key)) return false;
        seenModelKeys.add(key);
        return true;
      }
      // For other types, dedupe by partId
      if (seenPartIds.has(item.partId)) return false;
      seenPartIds.add(item.partId);
      return true;
    });

    relatedMatches = relatedMatches.filter((item) => {
      // For model type, use modelId + partId as key to allow multiple models per part
      if (item.type === "model") {
        const key = `model-${item.modelId}-${item.partId}`;
        if (seenModelKeys.has(key)) return false;
        seenModelKeys.add(key);
        return true;
      }
      // For other types, dedupe by partId
      if (seenPartIds.has(item.partId)) return false;
      seenPartIds.add(item.partId);
      return true;
    });

    // Combine results: exact matches first, then related matches
    const allResults = [...exactMatches, ...relatedMatches].slice(0, limitNum);

    res.json({
      data: allResults,
      exact: exactMatches,
      related: relatedMatches,
      total: allResults.length,
      exactCount: exactMatches.length,
      relatedCount: relatedMatches.length,
    });
  } catch (error: any) {
    console.error("Advanced search error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
