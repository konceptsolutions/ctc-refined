import express, { Request, Response } from "express";
import prisma from "../config/database";
import { randomUUID } from "crypto";

const router = express.Router();

// Get all master part numbers
router.get("/master-parts", async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    const where = search
      ? { masterPartNo: { contains: search as string } }
      : {};

    // Fetch ALL master parts without any limit
    const masterParts = await prisma.masterPart.findMany({
      where,
      select: { masterPartNo: true },
      orderBy: { masterPartNo: "asc" },
      // Explicitly no limit - get all records
    });

    res.json(masterParts.map((mp) => mp.masterPartNo));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all brands
router.get("/brands", async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    const where: any = { status: "active" };
    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll filter in memory if needed
      where.name = { contains: search as string };
    }

    const brands = await prisma.brand.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 50,
    });

    res.json(brands);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all categories
router.get("/categories", async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    const where: any = { status: "active" };
    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll filter in memory if needed
      where.name = { contains: search as string };
    }

    const categories = await prisma.category.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get subcategories by category
router.get("/subcategories", async (req: Request, res: Response) => {
  try {
    const { category_id, search } = req.query;

    const where: any = { status: "active" };
    if (category_id) {
      where.categoryId = category_id as string;
    }
    if (search) {
      // SQLite doesn't support case-insensitive mode
      where.name = { contains: search as string };
    }

    const subcategories = await prisma.subcategory.findMany({
      where,
      select: { id: true, name: true, categoryId: true },
      orderBy: { name: "asc" },
    });

    res.json(subcategories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get applications by subcategory or master_part_no
router.get("/applications", async (req: Request, res: Response) => {
  try {
    const { subcategory_id, master_part_no, search } = req.query;

    const where: any = { status: "active", NOT: [{ name: "." }, { name: "" }] };
    if (subcategory_id) {
      where.subcategoryId = subcategory_id as string;
    }
    if (master_part_no) {
      const mp = await prisma.masterPart.findFirst({
        where: { masterPartNo: String(master_part_no).trim() },
      });
      if (mp) where.masterPartId = mp.id;
    }
    if (search) {
      where.name = { contains: search as string };
    }

    const applications = await prisma.application.findMany({
      where,
      select: { id: true, name: true, subcategoryId: true, masterPartId: true },
      orderBy: { name: "asc" },
    });

    res.json(applications);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all applications (with status/master_part_no/subcategory filter for attributes page)
router.get("/applications/all", async (req: Request, res: Response) => {
  try {
    const { search, status, subcategory_id, master_part_no } = req.query;

    const where: any = { NOT: [{ name: "." }, { name: "" }] };
    if (status && status !== "all") {
      where.status = status as string;
    }
    if (subcategory_id && subcategory_id !== "all") {
      where.subcategoryId = subcategory_id as string;
    }
    if (master_part_no && master_part_no !== "all") {
      const mp = await prisma.masterPart.findFirst({
        where: { masterPartNo: String(master_part_no).trim() },
      });
      if (mp) where.masterPartId = mp.id;
    }
    if (search) {
      where.name = { contains: search as string };
    }

    const applications = await prisma.application.findMany({
      where,
      include: {
        Subcategory: {
          select: { name: true, Category: { select: { name: true } } },
        },
        MasterPart: { select: { masterPartNo: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      applications.map((app) => ({
        id: app.id,
        name: app.name,
        subcategoryId: app.subcategoryId,
        subcategoryName: app.Subcategory?.name ?? null,
        categoryName: app.Subcategory?.Category?.name ?? null,
        masterPartId: app.masterPartId,
        masterPartNo: app.MasterPart?.masterPartNo ?? null,
        status: app.status === "active" ? "Active" : "Inactive",
        createdAt: app.createdAt,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create application (linked by Master Part Number only; subcategory is not used)
router.post("/applications", async (req: Request, res: Response) => {
  try {
    const { name, master_part_no, status } = req.body;

    const trimmedName = String(name ?? "").trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Application name is required" });
    }
    if (/^\.+$/.test(trimmedName)) {
      return res.status(400).json({ error: "Invalid application name" });
    }
    const masterPartNoTrim = String(master_part_no ?? "").trim();
    if (!masterPartNoTrim) {
      return res.status(400).json({ error: "Master Part Number is required" });
    }

    const masterPart = await prisma.masterPart.findFirst({
      where: { masterPartNo: masterPartNoTrim },
    });
    if (!masterPart) {
      return res
        .status(400)
        .json({ error: `Master Part Number "${masterPartNoTrim}" not found` });
    }

    const application = await prisma.application.create({
      data: {
        id: randomUUID(),
        name: trimmedName,
        masterPartId: masterPart.id,
        status: status === "Inactive" ? "inactive" : "active",
        updatedAt: new Date(),
      } as any,
      include: {
        Subcategory: {
          select: { name: true, Category: { select: { name: true } } },
        },
        MasterPart: { select: { masterPartNo: true } },
      },
    });

    res.status(201).json({
      id: application.id,
      name: application.name,
      subcategoryId: application.subcategoryId,
      subcategoryName: (application as any).Subcategory?.name ?? null,
      categoryName: (application as any).Subcategory?.Category?.name ?? null,
      masterPartId: application.masterPartId,
      masterPartNo: (application as any).MasterPart?.masterPartNo ?? null,
      status: application.status === "active" ? "Active" : "Inactive",
      createdAt: application.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({
        error:
          "Application with this name already exists for this master part or subcategory",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update application (linked by Master Part Number only; subcategory is not used)
router.put("/applications/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, master_part_no, status } = req.body;

    const trimmedName = String(name ?? "").trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Application name is required" });
    }
    if (/^\.+$/.test(trimmedName)) {
      return res.status(400).json({ error: "Invalid application name" });
    }
    const masterPartNoTrim = String(master_part_no ?? "").trim();
    if (!masterPartNoTrim) {
      return res.status(400).json({ error: "Master Part Number is required" });
    }

    const masterPart = await prisma.masterPart.findFirst({
      where: { masterPartNo: masterPartNoTrim },
    });
    if (!masterPart) {
      return res
        .status(400)
        .json({ error: `Master Part Number "${masterPartNoTrim}" not found` });
    }

    const application = await prisma.application.update({
      where: { id },
      data: {
        name: trimmedName,
        subcategoryId: null,
        masterPartId: masterPart.id,
        status: status === "Inactive" ? "inactive" : "active",
      },
      include: {
        Subcategory: {
          select: { name: true, Category: { select: { name: true } } },
        },
        MasterPart: { select: { masterPartNo: true } },
      },
    });

    res.json({
      id: application.id,
      name: application.name,
      subcategoryId: application.subcategoryId,
      subcategoryName: (application as any).Subcategory?.name ?? null,
      categoryName: (application as any).Subcategory?.Category?.name ?? null,
      masterPartId: application.masterPartId,
      masterPartNo: (application as any).MasterPart?.masterPartNo ?? null,
      status: application.status === "active" ? "Active" : "Inactive",
      createdAt: application.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Application not found" });
    }
    if (error.code === "P2002") {
      return res.status(400).json({
        error:
          "Application with this name already exists for this master part or subcategory",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete application
router.delete("/applications/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if application has parts
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Part: true },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    if ((application as any)._count.Part > 0) {
      return res.status(400).json({
        error:
          "Cannot delete application with associated parts. Please remove or reassign the parts first.",
      });
    }

    await prisma.application.delete({
      where: { id },
    });

    res.json({ message: "Application deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove duplicate applications from the database (same masterPartId + name). Keeps one per group, reassigns parts to it, deletes the rest.
router.post(
  "/applications/remove-duplicates",
  async (req: Request, res: Response) => {
    try {
      const applications = await prisma.application.findMany({
        select: { id: true, name: true, masterPartId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      // Group by (masterPartId, name) — normalize null/empty
      const key = (a: { masterPartId: string | null; name: string }) =>
        `${a.masterPartId ?? ""}\0${(a.name || "").trim().toLowerCase()}`;
      const groups = new Map<string, typeof applications>();
      for (const a of applications) {
        const k = key(a);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(a);
      }

      let removed = 0;
      for (const [, list] of groups) {
        if (list.length <= 1) continue;
        const [keep, ...duplicates] = list;
        for (const dup of duplicates) {
          await prisma.$transaction([
            prisma.part.updateMany({
              where: { applicationId: dup.id },
              data: { applicationId: keep.id },
            }),
            prisma.application.delete({ where: { id: dup.id } }),
          ]);
          removed++;
        }
      }

      res.json({
        removed,
        message: removed
          ? `Removed ${removed} duplicate application(s) from the database.`
          : "No duplicate applications found.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Get parts by master part number (for part number dropdown)
router.get("/parts", async (req: Request, res: Response) => {
  try {
    const { master_part_no, search } = req.query;

    const where: any = { status: "active" };

    if (master_part_no) {
      const trimmedMaster = String(master_part_no).trim();
      where.OR = [
        { MasterPart: { masterPartNo: trimmedMaster } },
        { partNo: trimmedMaster },
      ];
    }

    if (search) {
      const searchOr = [
        { partNo: { contains: search as string } },
        { description: { contains: search as string } },
        { brand: { name: { contains: search as string } } },
        { MasterPart: { masterPartNo: { contains: search as string } } },
      ];
      where.OR = where.OR ? [...where.OR, ...searchOr] : searchOr;
    }

    const parts = await prisma.part.findMany({
      where,
      select: {
        id: true,
        partNo: true,
        description: true,
        Brand: { select: { name: true } },
        MasterPart: { select: { masterPartNo: true } },
      },
      orderBy: { partNo: "asc" },
      take: 50,
    });

    res.json(
      parts.map((p) => ({
        id: p.id,
        part_no: p.partNo,
        description: p.description,
        brand: (p as any).Brand?.name || null,
        master_part: (p as any).MasterPart?.masterPartNo || null,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== CATEGORIES CRUD ==========

// Get all categories (with status filter for attributes page)
router.get("/categories/all", async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;

    const where: any = {};
    if (status && status !== "all") {
      where.status = status as string;
    }
    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll filter in memory if needed
      where.name = { contains: search as string };
    }

    const categories = await prisma.category.findMany({
      where,
      include: {
        _count: {
          select: { Subcategory: true },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        status: cat.status === "active" ? "Active" : "Inactive",
        subcategoryCount: (cat as any)._count.Subcategory,
        createdAt: cat.createdAt,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post("/categories", async (req: Request, res: Response) => {
  try {
    const { name, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const category = await prisma.category.create({
      data: {
        id: randomUUID(),
        name: name.trim(),
        status: status === "Inactive" ? "inactive" : "active",
        updatedAt: new Date(),
      } as any,
      include: {
        _count: {
          select: { Subcategory: true },
        },
      },
    });

    res.status(201).json({
      id: category.id,
      name: category.name,
      status: category.status === "active" ? "Active" : "Inactive",
      subcategoryCount: (category as any)._count.Subcategory,
      createdAt: category.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Category with this name already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put("/categories/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: name.trim(),
        status: status === "Inactive" ? "inactive" : "active",
      },
      include: {
        _count: {
          select: { Subcategory: true },
        },
      },
    });

    res.json({
      id: category.id,
      name: category.name,
      status: category.status === "active" ? "Active" : "Inactive",
      subcategoryCount: (category as any)._count.Subcategory,
      createdAt: category.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Category not found" });
    }
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Category with this name already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete("/categories/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if category has subcategories
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Subcategory: true },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    if ((category as any)._count.Subcategory > 0) {
      return res.status(400).json({
        error:
          "Cannot delete category with subcategories. Please delete all subcategories first.",
      });
    }

    await prisma.category.delete({
      where: { id },
    });

    res.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SUBCATEGORIES CRUD ==========

// Get all subcategories (with status filter for attributes page)
router.get("/subcategories/all", async (req: Request, res: Response) => {
  try {
    const { search, status, category_id } = req.query;

    const where: any = {};
    if (status && status !== "all") {
      where.status = status as string;
    }
    if (category_id && category_id !== "all") {
      where.categoryId = category_id as string;
    }
    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll filter in memory if needed
      where.name = { contains: search as string };
    }

    const subcategories = await prisma.subcategory.findMany({
      where,
      include: {
        Category: {
          select: { name: true },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        categoryId: sub.categoryId,
        categoryName: (sub as any).Category.name,
        status: sub.status === "active" ? "Active" : "Inactive",
        createdAt: sub.createdAt,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create subcategory
router.post("/subcategories", async (req: Request, res: Response) => {
  try {
    const { name, category_id, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Subcategory name is required" });
    }
    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }

    const subcategory = await prisma.subcategory.create({
      data: {
        id: randomUUID(),
        name: name.trim(),
        categoryId: category_id,
        status: status === "Inactive" ? "inactive" : "active",
        updatedAt: new Date(),
      } as any,
      include: {
        Category: {
          select: { name: true },
        },
      },
    });

    res.status(201).json({
      id: subcategory.id,
      name: subcategory.name,
      categoryId: subcategory.categoryId,
      categoryName: (subcategory as any).Category.name,
      status: subcategory.status === "active" ? "Active" : "Inactive",
      createdAt: subcategory.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({
        error: "Subcategory with this name already exists in this category",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update subcategory
router.put("/subcategories/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category_id, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Subcategory name is required" });
    }
    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }

    const subcategory = await prisma.subcategory.update({
      where: { id },
      data: {
        name: name.trim(),
        categoryId: category_id,
        status: status === "Inactive" ? "inactive" : "active",
      },
      include: {
        Category: {
          select: { name: true },
        },
      },
    });

    res.json({
      id: subcategory.id,
      name: subcategory.name,
      categoryId: subcategory.categoryId,
      categoryName: (subcategory as any).Category.name,
      status: subcategory.status === "active" ? "Active" : "Inactive",
      createdAt: subcategory.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Subcategory not found" });
    }
    if (error.code === "P2002") {
      return res.status(400).json({
        error: "Subcategory with this name already exists in this category",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete subcategory
router.delete("/subcategories/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if subcategory has parts
    const subcategory = await prisma.subcategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Part: true },
        },
      },
    });

    if (!subcategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    if ((subcategory as any)._count.Part > 0) {
      return res.status(400).json({
        error:
          "Cannot delete subcategory with associated parts. Please remove or reassign the parts first.",
      });
    }

    await prisma.subcategory.delete({
      where: { id },
    });

    res.json({ message: "Subcategory deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== BRANDS CRUD ==========

// Get all brands (with status filter for attributes page)
router.get("/brands/all", async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;

    const where: any = {};
    if (status && status !== "all") {
      where.status = status as string;
    }
    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll filter in memory if needed
      where.name = { contains: search as string };
    }

    const brands = await prisma.brand.findMany({
      where,
      orderBy: { name: "asc" },
    });

    res.json(
      brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        status: brand.status === "active" ? "Active" : "Inactive",
        createdAt: brand.createdAt,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create brand
router.post("/brands", async (req: Request, res: Response) => {
  try {
    const { name, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Brand name is required" });
    }

    const brand = await prisma.brand.create({
      data: {
        id: randomUUID(),
        name: name.trim(),
        status: status === "Inactive" ? "inactive" : "active",
        updatedAt: new Date(),
      } as any,
    });

    res.status(201).json({
      id: brand.id,
      name: brand.name,
      status: brand.status === "active" ? "Active" : "Inactive",
      createdAt: brand.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Brand with this name already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update brand
router.put("/brands/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Brand name is required" });
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        name: name.trim(),
        status: status === "Inactive" ? "inactive" : "active",
      },
    });

    res.json({
      id: brand.id,
      name: brand.name,
      status: brand.status === "active" ? "Active" : "Inactive",
      createdAt: brand.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Brand not found" });
    }
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Brand with this name already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete brand
router.delete("/brands/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if brand has parts
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Part: true },
        },
      },
    });

    if (!brand) {
      return res.status(404).json({ error: "Brand not found" });
    }

    if ((brand as any)._count.Part > 0) {
      return res.status(400).json({
        error:
          "Cannot delete brand with associated parts. Please remove or reassign the parts first.",
      });
    }

    await prisma.brand.delete({
      where: { id },
    });

    res.json({ message: "Brand deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all unique areas from the Area master table
router.get("/areas", async (req: Request, res: Response) => {
  try {
    const areas = await prisma.area.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
    });

    // One-time migration if table is empty
    if (areas.length === 0) {
      const [customerAreas, supplierAreas] = await Promise.all([
        prisma.customer.findMany({
          select: { area: true },
          where: { AND: [{ area: { not: null } }, { area: { not: "" } }] },
          distinct: ["area"],
        }),
        prisma.supplier.findMany({
          select: { area: true },
          where: { AND: [{ area: { not: null } }, { area: { not: "" } }] },
          distinct: ["area"],
        }),
      ]);

      const allNames = new Set([
        ...customerAreas.map((c) => c.area),
        ...supplierAreas.map((s) => s.area),
      ]);

      const validNames = Array.from(allNames).filter(
        (n): n is string => !!n && n.trim() !== "",
      );

      if (validNames.length > 0) {
        await prisma.area.createMany({
          data: validNames.map((name) => ({
            id: randomUUID(),
            name: name.trim(),
            status: "active",
          })),
          skipDuplicates: true,
        });

        const migrated = await prisma.area.findMany({
          where: { status: "active" },
          orderBy: { name: "asc" },
        });
        return res.json(migrated.map((a) => a.name));
      }
    }

    res.json(areas.map((a) => a.name));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new area in the master table
router.post("/areas", async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Area name is required" });
    }

    const trimmedName = name.trim();

    // Check if exists
    const existing = await prisma.area.findFirst({
      where: { name: trimmedName },
    });

    if (existing) {
      return res.json(existing);
    }

    const area = await prisma.area.create({
      data: {
        id: randomUUID(),
        name: trimmedName,
        status: "active",
      },
    });

    res.status(201).json(area);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
