import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';

const router = express.Router();

// GET /api/roles - Get all roles
router.get('/', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Parse permissions JSON and count users
    const formattedRoles = await Promise.all(
      roles.map(async (role) => {
        let permissions: string[] = [];
        try {
          permissions = JSON.parse(role.permissions || '[]');
        } catch {
          permissions = [];
        }

        const usersCount = await prisma.user.count({
          where: { role: role.name },
        });

        return {
          ...role,
          permissions,
          usersCount,
        };
      })
    );

    res.json({ data: formattedRoles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/roles/:id - Get single role
router.get('/:id', async (req, res) => {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
    });

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    let permissions: string[] = [];
    try {
      permissions = JSON.parse(role.permissions || '[]');
    } catch {
      permissions = [];
    }

    const usersCount = await prisma.user.count({
      where: { role: role.name },
    });

    res.json({ data: { ...role, permissions, usersCount } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/roles - Create new role
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      permissions,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    const role = await prisma.role.create({
      data: {
        id: randomUUID(),
        name,
        description: description || '',
        type: 'Custom',
        permissions: JSON.stringify(permissions || []),
        usersCount: 0,
        updatedAt: new Date(),
      },
    });

    let parsedPermissions: string[] = [];
    try {
      parsedPermissions = JSON.parse(role.permissions || '[]');
    } catch {
      parsedPermissions = [];
    }

    res.status(201).json({ data: { ...role, permissions: parsedPermissions, usersCount: 0 } });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Role with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/roles/:id - Update role
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      permissions,
    } = req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: updateData,
    });

    let parsedPermissions: string[] = [];
    try {
      parsedPermissions = JSON.parse(role.permissions || '[]');
    } catch {
      parsedPermissions = [];
    }

    const usersCount = await prisma.user.count({
      where: { role: role.name },
    });

    res.json({ data: { ...role, permissions: parsedPermissions, usersCount } });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/roles/:id - Delete role
router.delete('/:id', async (req, res) => {
  try {
    await prisma.role.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;

