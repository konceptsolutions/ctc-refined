import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { getValidPermissionSet, expandPermissionAncestors } from '../permissions/catalog';
import { AuthRequest, requirePermission } from '../middleware/authMiddleware';

const router = express.Router();

function normalizePermissions(input: unknown, roleName?: string): string[] {
  if (roleName && roleName.trim().toLowerCase() === 'admin') {
    return ['*'];
  }
  if (!Array.isArray(input)) return [];
  const valid = getValidPermissionSet();
  const out: string[] = [];
  for (const raw of input) {
    const key = String(raw || '').trim();
    if (!key) continue;
    if (key === '*') continue; // only Admin may use wildcard via name check
    if (valid.has(key)) out.push(key);
  }
  return expandPermissionAncestors([...new Set(out)]);
}

// GET /api/roles - Get all roles
router.get('/', requirePermission('page.settings.roles', 'module.settings'), async (_req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const formattedRoles = await Promise.all(
      roles.map(async (role) => {
        let permissions: string[] = [];
        try {
          permissions = JSON.parse(role.permissions || '[]');
        } catch {
          permissions = [];
        }

        const usersCount = await prisma.user.count({
          where: { roleId: role.id },
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
router.get('/:id', requirePermission('page.settings.roles', 'module.settings'), async (req, res) => {
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
      where: { roleId: role.id },
    });

    res.json({ data: { ...role, permissions, usersCount } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/roles - Create new role
router.post('/', requirePermission('action.settings.roles.create', 'page.settings.roles'), async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      permissions,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    const normalized = normalizePermissions(permissions, name);

    const role = await prisma.role.create({
      data: {
        id: randomUUID(),
        name,
        description: description || '',
        type: 'Custom',
        permissions: JSON.stringify(normalized),
        usersCount: 0,
        updatedAt: new Date(),
      },
    });

    res.status(201).json({ data: { ...role, permissions: normalized, usersCount: 0 } });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Role with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/roles/:id - Update role
router.put('/:id', requirePermission('action.settings.roles.edit', 'page.settings.roles'), async (req, res) => {
  try {
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const {
      name,
      description,
      permissions,
    } = req.body;

    const updateData: any = {};
    const nextName = name !== undefined ? name : existing.name;

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) {
      updateData.permissions = JSON.stringify(normalizePermissions(permissions, nextName));
    } else if (String(nextName).trim().toLowerCase() === 'admin') {
      updateData.permissions = JSON.stringify(['*']);
    }

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
      where: { roleId: role.id },
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
router.delete('/:id', requirePermission('action.settings.roles.delete', 'page.settings.roles'), async (req, res) => {
  try {
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Role not found' });
    }
    if (existing.type === 'System' || existing.name.trim().toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'System roles cannot be deleted' });
    }

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
