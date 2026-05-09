import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logActivity, getClientIp } from '../utils/activityLogger';
import { randomUUID } from 'crypto';

const router = express.Router();

const DEFAULT_ROLE_ID = 'role_store_user';

async function resolveIncomingRole(role: unknown): Promise<string> {
  if (typeof role !== 'string' || !role.trim()) {
    return DEFAULT_ROLE_ID;
  }
  const trimmed = role.trim();
  const found = await prisma.role.findFirst({
    where: {
      OR: [
        { id: trimmed },
        { name: { equals: trimmed, mode: 'insensitive' as const } },
      ],
    },
  });
  return found?.id ?? DEFAULT_ROLE_ID;
}

async function roleNamesForUserRows(roleIds: string[]) {
  const unique = [...new Set(roleIds.filter(Boolean))];
  if (!unique.length) return {} as Record<string, string>;
  const roles = await prisma.role.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(roles.map((r) => [r.id, r.name]));
}

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
      const rl = typeof role === 'string' ? role.trim() : '';
      if (rl) {
        const found = await prisma.role.findFirst({
          where: {
            OR: [{ id: rl }, { name: { equals: rl, mode: 'insensitive' as const } }],
          },
        });
        if (found) where.roleId = found.id;
      }
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
          roleId: true,
          status: true,
          lastLogin: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const roleNames = await roleNamesForUserRows(users.map((u) => u.roleId));

    // Format dates
    const formattedUsers = users.map((user) => {
      const { roleId, ...rest } = user;
      return {
        ...rest,
        role: roleNames[roleId] ?? roleId,
        createdAt: user.createdAt.toISOString().split('T')[0],
      };
    });

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
        roleId: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const rn = await roleNamesForUserRows([user.roleId]);
    const { roleId, ...rest } = user;
    res.json({
      data: {
        ...rest,
        role: rn[roleId] ?? roleId,
        createdAt: user.createdAt.toISOString().split('T')[0],
      },
    });
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

    const roleIdResolved = await resolveIncomingRole(role);

    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        name,
        email,
        roleId: roleIdResolved,
        status: status || 'active',
        password: hashedPassword,
        lastLogin: '-',
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
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
      details: { userId: user.id, email: user.email, roleId: user.roleId },
    });

    const rn = await roleNamesForUserRows([user.roleId]);
    const { roleId: rid, ...rest } = user;
    res.status(201).json({
      data: {
        ...rest,
        role: rn[rid] ?? rid,
        createdAt: user.createdAt.toISOString().split('T')[0],
      },
    });
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
    if (role !== undefined) updateData.roleId = await resolveIncomingRole(role);
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
        roleId: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    const rn = await roleNamesForUserRows([user.roleId]);
    const { roleId: urid, ...rest } = user;
    res.json({
      data: {
        ...rest,
        role: rn[urid] ?? urid,
        createdAt: user.createdAt.toISOString().split('T')[0],
      },
    });
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

