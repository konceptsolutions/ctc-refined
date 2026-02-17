import express, { Request, Response } from 'express';
import prisma from '../config/database';

const router = express.Router();

// Get all kits with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      search,
      status,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { badge: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status as string;
    }

    // Get kits with items
    const [kits, total] = await Promise.all([
      prisma.kit.findMany({
        where,
        include: {
          KitItem: {
            include: {
              Part: {
                select: {
                  id: true,
                  partNo: true,
                  description: true,
                  cost: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.kit.count({ where }),
    ]);

    // Transform data for response
    const transformedKits = kits.map((kit) => ({
      id: kit.id,
      badge: kit.badge,
      name: kit.name,
      description: kit.description,
      sellingPrice: kit.sellingPrice,
      totalCost: kit.totalCost,
      itemsCount: kit.itemsCount,
      status: kit.status,
      createdAt: kit.createdAt,
      updatedAt: kit.updatedAt,
      items: kit.KitItem.map((item) => ({
        id: item.id,
        partId: item.partId,
        partNo: item.partNo,
        partName: item.partName,
        quantity: item.quantity,
        cost: item.costPerUnit,
        costPerUnit: item.costPerUnit,
      })),
    }));

    res.json({
      data: transformedKits,
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

// Get a single kit by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const kit = await prisma.kit.findUnique({
      where: { id },
      include: {
        KitItem: {
          include: {
            Part: {
              select: {
                id: true,
                partNo: true,
                description: true,
                cost: true,
              },
            },
          },
        },
      },
    });

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    // Transform data for response
    const transformedKit = {
      id: kit.id,
      badge: kit.badge,
      name: kit.name,
      description: kit.description,
      sellingPrice: kit.sellingPrice,
      totalCost: kit.totalCost,
      itemsCount: kit.itemsCount,
      status: kit.status,
      createdAt: kit.createdAt,
      updatedAt: kit.updatedAt,
      items: kit.KitItem.map((item) => ({
        id: item.id,
        partId: item.partId,
        partNo: item.partNo,
        partName: item.partName,
        quantity: item.quantity,
        cost: item.costPerUnit,
        costPerUnit: item.costPerUnit,
      })),
    };

    res.json({ data: transformedKit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new kit
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      badge,
      name,
      description,
      sellingPrice,
      status = 'Active',
      items = [],
    } = req.body;

    // Validate required fields
    if (!badge || !name) {
      return res.status(400).json({ error: 'Badge and name are required' });
    }

    // Check if badge already exists
    const existingKit = await prisma.kit.findUnique({
      where: { badge },
    });

    if (existingKit) {
      return res.status(400).json({ error: 'Kit with this badge already exists' });
    }

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Calculate total cost and validate parts
    let totalCost = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.partId || !item.partNo || !item.partName || !item.quantity || item.costPerUnit === undefined) {
        return res.status(400).json({ error: 'Each item must have partId, partNo, partName, quantity, and costPerUnit' });
      }

      // Verify part exists
      const part = await prisma.part.findUnique({
        where: { id: item.partId },
        select: { id: true, partNo: true, cost: true },
      });

      if (!part) {
        return res.status(400).json({ error: `Part with ID ${item.partId} not found` });
      }

      const itemCost = item.costPerUnit * item.quantity;
      totalCost += itemCost;

      validatedItems.push({
        partId: item.partId,
        partNo: item.partNo,
        partName: item.partName,
        quantity: parseInt(item.quantity),
        costPerUnit: parseFloat(item.costPerUnit),
      });
    }

    // Create kit with items
    const kit = await prisma.kit.create({
      data: {
        badge,
        name,
        description: description || null,
        sellingPrice: parseFloat(sellingPrice) || 0,
        totalCost,
        itemsCount: validatedItems.length,
        status,
        updatedAt: new Date(),
        KitItem: {
          create: validatedItems,
        },
      } as any,
      include: {
        KitItem: {
          include: {
            Part: {
              select: {
                id: true,
                partNo: true,
                description: true,
                cost: true,
              },
            },
          },
        },
      },
    });

    // Transform data for response
    const transformedKit = {
      id: kit.id,
      badge: kit.badge,
      name: kit.name,
      description: kit.description,
      sellingPrice: kit.sellingPrice,
      totalCost: kit.totalCost,
      itemsCount: kit.itemsCount,
      status: kit.status,
      createdAt: kit.createdAt,
      updatedAt: kit.updatedAt,
      KitItem: kit.KitItem.map((item) => ({
        id: item.id,
        partId: item.partId,
        partNo: item.partNo,
        partName: item.partName,
        quantity: item.quantity,
        cost: item.costPerUnit,
        costPerUnit: item.costPerUnit,
      })),
    };

    res.status(201).json({ data: transformedKit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a kit
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      badge,
      name,
      description,
      sellingPrice,
      status,
      items,
    } = req.body;

    // Check if kit exists
    const existingKit = await prisma.kit.findUnique({
      where: { id },
    });

    if (!existingKit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    // If badge is being changed, check if new badge already exists
    if (badge && badge !== existingKit.badge) {
      const badgeExists = await prisma.kit.findUnique({
        where: { badge },
      });

      if (badgeExists) {
        return res.status(400).json({ error: 'Kit with this badge already exists' });
      }
    }

    // If items are provided, update them
    if (items && Array.isArray(items)) {
      // Validate items
      if (items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
      }

      // Calculate total cost and validate parts
      let totalCost = 0;
      const kitItems = [];

      for (const item of items) {
        if (!item.partId || !item.partNo || !item.partName || !item.quantity || item.costPerUnit === undefined) {
          return res.status(400).json({ error: 'Each item must have partId, partNo, partName, quantity, and costPerUnit' });
        }

        // Verify part exists
        const part = await prisma.part.findUnique({
          where: { id: item.partId },
          select: { id: true, partNo: true, cost: true },
        });

        if (!part) {
          return res.status(400).json({ error: `Part with ID ${item.partId} not found` });
        }

        const itemCost = item.costPerUnit * item.quantity;
        totalCost += itemCost;

        kitItems.push({
          partId: item.partId,
          partNo: item.partNo,
          partName: item.partName,
          quantity: parseInt(item.quantity),
          costPerUnit: parseFloat(item.costPerUnit),
        });
      }

      // Delete existing items and create new ones
      await prisma.kitItem.deleteMany({
        where: { kitId: id },
      });

      // Update kit with new items
      const kit = await prisma.kit.update({
        where: { id },
        data: {
          ...(badge && { badge }),
          ...(name && { name }),
          ...(description !== undefined && { description: description || null }),
          ...(sellingPrice !== undefined && { sellingPrice: parseFloat(sellingPrice) || 0 }),
          ...(status && { status }),
          totalCost,
          itemsCount: kitItems.length,
          KitItem: {
            create: kitItems.map(item => ({
              partId: item.partId,
              partNo: item.partNo,
              partName: item.partName,
              quantity: item.quantity,
              costPerUnit: item.costPerUnit,
            })) as any,
          },
        },
        include: {
          KitItem: {
            include: {
              Part: {
                select: {
                  id: true,
                  partNo: true,
                  description: true,
                  cost: true,
                },
              },
            },
          },
        },
      });

      // Transform data for response
      const transformedKit = {
        id: kit.id,
        badge: kit.badge,
        name: kit.name,
        description: kit.description,
        sellingPrice: kit.sellingPrice,
        totalCost: kit.totalCost,
        itemsCount: kit.itemsCount,
        status: kit.status,
        createdAt: kit.createdAt,
        updatedAt: kit.updatedAt,
        KitItem: kit.KitItem.map((item) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          partName: item.partName,
          quantity: item.quantity,
          cost: item.costPerUnit,
          costPerUnit: item.costPerUnit,
        })),
      };

      return res.json({ data: transformedKit });
    } else {
      // Update kit without changing items
      const updateData: any = {};
      if (badge) updateData.badge = badge;
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description || null;
      if (sellingPrice !== undefined) updateData.sellingPrice = parseFloat(sellingPrice) || 0;
      if (status) updateData.status = status;

      const kit = await prisma.kit.update({
        where: { id },
        data: updateData,
        include: {
          KitItem: {
            include: {
              Part: {
                select: {
                  id: true,
                  partNo: true,
                  description: true,
                  cost: true,
                },
              },
            },
          },
        },
      });

      // Transform data for response
      const transformedKit = {
        id: kit.id,
        badge: kit.badge,
        name: kit.name,
        description: kit.description,
        sellingPrice: kit.sellingPrice,
        totalCost: kit.totalCost,
        itemsCount: kit.itemsCount,
        status: kit.status,
        createdAt: kit.createdAt,
        updatedAt: kit.updatedAt,
        KitItem: kit.KitItem.map((item) => ({
          id: item.id,
          partId: item.partId,
          partNo: item.partNo,
          partName: item.partName,
          quantity: item.quantity,
          cost: item.costPerUnit,
          costPerUnit: item.costPerUnit,
        })),
      };

      return res.json({ data: transformedKit });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a kit
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if kit exists
    const kit = await prisma.kit.findUnique({
      where: { id },
    });

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    // Delete kit (items will be deleted automatically due to CASCADE)
    await prisma.kit.delete({
      where: { id },
    });

    res.json({ message: 'Kit deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

