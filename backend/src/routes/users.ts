import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logActivity, getClientIp } from '../utils/activityLogger';
import { randomUUID } from 'crypto';

const router = express.Router();

// GET /api/users - Get all users with filters and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search,
      role,
      status,
      page = '1',
      limit = '10',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (role && role !== 'all') {
      where.role = role;
    }

    // Search filter
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      where.OR = [
        { name: { contains: searchTerm } },
        { email: { contains: searchTerm } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          lastLogin: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Format dates
    const formattedUsers = users.map(user => ({
      ...user,
      createdAt: user.createdAt.toISOString().split('T')[0],
    }));

    res.json({
      data: formattedUsers,
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

// GET /api/users/:id - Get single user
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ data: { ...user, createdAt: user.createdAt.toISOString().split('T')[0] } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users - Create new user
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      status,
      password,
    } = req.body;
    
    // Get current user from request (you'll need to implement authentication middleware)
    const currentUser = (req as any).user || { name: 'System', role: 'Admin' };

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required for new users' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        name,
        email,
        role: role || 'Staff',
        status: status || 'active',
        password: hashedPassword,
        lastLogin: '-',
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    // Log activity
    await logActivity({
      user: currentUser.name,
      userRole: currentUser.role,
      action: 'Created User',
      actionType: 'create',
      module: 'Users',
      description: `Created new user: ${name} (${email})`,
      ipAddress: getClientIp(req),
      status: 'success',
      details: { userId: user.id, email: user.email, role: user.role },
    });

    res.status(201).json({ data: { ...user, createdAt: user.createdAt.toISOString().split('T')[0] } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      status,
      password,
    } = req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;

    // Hash password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    res.json({ data: { ...user, createdAt: user.createdAt.toISOString().split('T')[0] } });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req, res) => {
  try {
    // Get user info before deleting
    const deletedUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { name: true, email: true },
    });

    await prisma.user.delete({
      where: { id: req.params.id },
    });

    // Log activity
    const currentUser = (req as any).user || { name: 'System', role: 'Admin' };
    await logActivity({
      user: currentUser.name,
      userRole: currentUser.role,
      action: 'Deleted User',
      actionType: 'delete',
      module: 'Users',
      description: `Deleted user: ${deletedUser?.name || 'Unknown'} (${deletedUser?.email || 'Unknown'})`,
      ipAddress: getClientIp(req),
      status: 'success',
      details: { userId: req.params.id },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;

