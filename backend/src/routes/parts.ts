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
      const searchStr = `%${(search as string).trim()}%`;
      conditions.push(`(
        p."partNo" ILIKE $${paramIdx} OR 
        p."description" ILIKE $${paramIdx} OR 
        mp."masterPartNo" ILIKE $${paramIdx}
      )`);
      params.push(searchStr);
      paramIdx++;
    }

    if (part_no) {
      conditions.push(`p."partNo" = $${paramIdx++}`);
      params.push((part_no as string).trim());
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        p.id, p."partNo" as part_no, p.description, p.cost, p."priceA" as price_a, 
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

    res.json({
      success: true,
      data: result.rows.map((p: any) => ({
        id: p.id,
        part_no: p.part_no,
        master_part_no: p.master_part_no,
        brand_name: p.brand_name,
        description: p.description,
        uom: p.uom,
        weight: p.weight,
        cost: p.cost,
        price_a: p.price_a,
        stock: parseInt(p.stock) || 0,
        reserved_stock: parseInt(p.reserved_stock) || 0,
        updated_at: p.updated_at,
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
      status,
      master_part_no,
      part_no,
      description,
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

      if (update_mode === "group") {
        // Expand search to include all "family items" (parts sharing the same masterPartId)
        conditions.push(`(
          p."partNo" ILIKE $${paramIdx} OR 
          p."description" ILIKE $${paramIdx} OR 
          mp."masterPartNo" ILIKE $${paramIdx} OR
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
          mp."masterPartNo" ILIKE $${paramIdx}
        )`);
      }
      params.push(searchPattern);
      paramIdx++;
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

    if (master_part_no) {
      conditions.push(`mp."masterPartNo" ILIKE $${paramIdx++}`);
      params.push(`%${(master_part_no as string).trim()}%`);
    }

    if (part_no) {
      conditions.push(`p."partNo" ILIKE $${paramIdx++}`);
      params.push(`%${(part_no as string).trim()}%`);
    }

    if (description) {
      conditions.push(`p."description" ILIKE $${paramIdx++}`);
      params.push(`%${(description as string).trim()}%`);
    }

    if (status) {
      conditions.push(`p."status" = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Skip images for large result sets to reduce payload size (29MB -> <1MB)
    const skipImages = limitNum > 1000;

    const sql = `
      SELECT 
        p.id, p."partNo", p.description, p."hsCode", p.weight, p."reorderLevel", p.uom, p.status, p."createdAt", p."updatedAt",
        p."masterPartId", p."brandId", p."categoryId", p."subcategoryId", p."applicationId",
        p.cost, p."purchasePrice", p."avgCost", p."priceA", p."priceB", p."priceM",
        mp."masterPartNo" as master_part_no,
        b."name" as brand_name,
        c."name" as category_name,
        sc."name" as subcategory_name,
        app."name" as application_name,
        COALESCE(st.stock, 0) as current_stock,
        COALESCE(st.reserved, 0) as reserved_stock,
        lac.cost as latest_adj_cost,
        COALESCE(loc.locations, '[]'::jsonb) as locations,
        (COALESCE(st.stock, 0) - COALESCE(loc.assigned_stock, 0)) as unlocated_stock
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
          SELECT DISTINCT ON (ai."partId") ai."partId", ai.cost
          FROM "AdjustmentItem" ai
          JOIN "Adjustment" a ON ai."adjustmentId" = a.id
          WHERE a.status = 'approved' AND a."deletedAt" IS NULL
          ORDER BY ai."partId", a.date DESC, a."createdAt" DESC, ai."createdAt" DESC
      ) lac ON p.id = lac."partId"
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
      ) loc ON p.id = loc."partId"
      ${whereClause}
      ORDER BY p."updatedAt" DESC
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
        qty: parseInt(part.current_stock || part.currentstock) || 0,
        stock: parseInt(part.current_stock || part.currentstock) || 0,
        reserved_stock:
          parseInt(part.reserved_stock || part.reservedstock) || 0,
        cost: part.cost,
        // Fallback: Use latest approved adjustment cost if available in history, otherwise show 0 if no transactions exist
        purchasePrice: rawPurchasePrice || latestAdjCost || 0,
        avgCost: rawAvgCost || latestAdjCost || 0,

        price_a: part.priceA || part.pricea || null,
        price_b: part.priceB || part.priceb || null,
        price_m: part.priceM || part.pricem || null,
        // Only include images for small result sets
        image_p1: skipImages ? null : part.imageP1 || part.imagep1,
        image_p2: skipImages ? null : part.imageP2 || part.imagep2,
        status: part.status,
        locations: part.locations || [],
        unlocated_stock: Math.max(0, parseInt(part.unlocated_stock) || 0),
        created_at: part.createdAt || part.createdat,
        updated_at: part.updatedAt || part.updatedat,
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

      if (update_mode === "group") {
        // Expand search to include all "family items" (parts sharing the same masterPartId)
        conditions.push(`(
          p."partNo" ILIKE $${paramIdx} OR 
          p."description" ILIKE $${paramIdx} OR 
          mp."masterPartNo" ILIKE $${paramIdx} OR
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
          mp."masterPartNo" ILIKE $${paramIdx}
        )`);
      }
      params.push(searchPattern);
      paramIdx++;
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
      model,
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
      const searchStr = `%${(search as string).trim()}%`;
      conditions.push(`(
        p."partNo" ILIKE $${paramIdx} OR 
        p."description" ILIKE $${paramIdx} OR 
        mp."masterPartNo" ILIKE $${paramIdx}
      )`);
      params.push(searchStr);
      paramIdx++;
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
      ${whereClause}
      ORDER BY p."updatedAt" DESC, p."partNo" ASC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    params.push(limitNum, offset);
    const result = await query(sql, params);

    const transformedParts = result.rows.map((p: any) =>({
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
    const { page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [history, total] = await Promise.all([
      prisma.priceHistory.findMany({
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
      prisma.priceHistory.count(),
    ]);

    const result = history.map((h) => ({
      id: h.id,
      date: h.createdAt.toISOString(),
      itemsUpdated: h.itemsUpdated,
      priceField: h.priceField,
      updateType:
        h.updateType === "percentage"
          ? "Percentage (%)"
          : h.updateType === "fixed"
            ? "Fixed Amount"
            : h.updateType,
      value: h.updateValue || h.newValue || 0,
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
      },
    });

    if (!part) {
      return res.status(404).json({ error: "Part not found" });
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
      remarks: (part as any).remarks || null,
      models: ((part as any).Model || []).map((m: any) => ({
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
      image_p1,
      image_p2,
      status,
      models,
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

    // Create part with models
    const part = await prisma.part.create({
      data: partData,
      include: {
        MasterPart: true,
        Brand: true,
        Category: true,
        Subcategory: true,
        Application: true,
        Model: true,
      },
    });

    const p = part as any;
    res.status(201).json({
      id: part.id,
      master_part_no: p.MasterPart?.masterPartNo || null,
      part_no: part.partNo,
      brand_name: p.Brand?.name || null,
      category_name: p.Category?.name || null,
      subcategory_name: p.Subcategory?.name || null,
      application_name: p.Application?.name || null,
      application: p.Application
        ? { id: p.Application.id, name: p.Application.name }
        : null,
      application_id: part.applicationId || null,
      description: part.description,
      hs_code: part.hsCode,
      weight: part.weight,
      reorder_level: part.reorderLevel,
      uom: part.uom,
      cost: part.cost,
      purchasePrice: (part as any).purchasePrice,
      avgCost: (part as any).avgCost,
      price_a: part.priceA,
      price_b: part.priceB,
      price_m: part.priceM,
      smc: part.smc,
      size: part.size,
      origin: part.origin || null,
      image_p1: part.imageP1,
      image_p2: part.imageP2,
      status: part.status,
      models: (p.Model || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        qty_used: m.qtyUsed,
      })),
      created_at: part.createdAt,
      updated_at: part.updatedAt,
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
      image_p1,
      image_p2,
      status,
      models,
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
      } catch (error: any) {}
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
      } else {
        // Verify application belongs to subcategory
        try {
          const application = await prisma.application.findUnique({
            where: { id: validatedApplicationId },
          });
          if (
            application &&
            application.subcategoryId !== validatedSubcategoryId
          ) {
            // Application doesn't belong to subcategory, clear it
            validatedApplicationId = null;
          }
        } catch (error) {
          validatedApplicationId = null;
        }
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

    // Update part
    const part = await prisma.part.update({
      where: { id },
      data: updateData,
      include: {
        MasterPart: true,
        Brand: true,
        Category: true,
        Subcategory: true,
        Application: true,
        Model: true,
      },
    });

    // Debug log to verify application is included

    const p = part as any;
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
      remarks: (part as any).remarks || null,
      models: (p.Model || []).map((m: any) => ({
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
            KitItem: true,
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

    // KitItem has onDelete: Restrict, so we need to check this first
    if ((part as any)._count.KitItem > 0) {
      // Get kit names that use this part
      const kitItems = await prisma.kitItem.findMany({
        where: { partId: id },
        include: {
          Kit: {
            select: {
              name: true,
              badge: true,
            },
          },
        },
        take: 5, // Limit to first 5 for error message
      });

      const kitNames = kitItems
        .map((ki: any) => ki.Kit.name || ki.Kit.badge)
        .join(", ");
      const moreKits =
        (part as any)._count.KitItem > 5
          ? ` and ${(part as any)._count.KitItem - 5} more`
          : "";

      return res.status(400).json({
        error: `Cannot delete part because it is used in ${(part as any)._count.KitItem} kit(s)`,
        details: `This part is used in the following kits: ${kitNames}${moreKits}. Please remove this part from all kits before deleting it.`,
        kitCount: (part as any)._count.KitItem,
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
