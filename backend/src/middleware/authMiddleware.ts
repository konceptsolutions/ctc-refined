import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getLoginHours, isWithinLoginSchedule } from '../utils/loginHours';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        name: string;
        permissions?: string[];
    };
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Authentication token is missing' });
        }

        jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
            if (err) {
                return res.status(403).json({ error: 'Token is invalid or expired' });
            }

            req.user = user as any;
            next();
        });
    } else {
        res.status(401).json({ error: 'Authentication token is required' });
    }
};

export const authorizeRoles = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User is not authenticated' });
        }

        // Role check (case-insensitive for robustness)
        const userRole = req.user.role.toLowerCase();
        const authorized = roles.some(role => role.toLowerCase() === userRole);

        if (!authorized) {
            return res.status(403).json({ error: 'User is not authorized for this action' });
        }

        next();
    };
};

function parseRolePermissions(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.map(String).filter(Boolean);
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        try {
            let parsed: unknown = JSON.parse(trimmed);
            // Handle double-encoded JSON strings
            if (typeof parsed === 'string') {
                const nested = parsed;
                try {
                    parsed = JSON.parse(nested);
                } catch {
                    return nested.trim() ? [nested.trim()] : [];
                }
            }
            return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
        } catch {
            return trimmed ? [trimmed] : [];
        }
    }
    return [];
}

async function resolveUserPermissions(req: AuthRequest): Promise<string[]> {
    if (Array.isArray(req.user?.permissions) && req.user!.permissions!.length > 0) {
        return req.user!.permissions!;
    }
    if (!req.user?.id) return [];

    try {
        const prisma = (await import('../config/database')).default;
        const rows = await prisma.$queryRaw<Array<{ permissions: string | null; role: string }>>`
            SELECT r.permissions, r.name AS role
            FROM "User" u
            JOIN "Role" r ON r.id = u."roleId"
            WHERE u.id = ${req.user.id}
            LIMIT 1
        `;
        const row = rows[0];
        if (!row) return [];

        const {
            looksLikeCatalogPermissions,
            getPresetPermissions,
            ensurePageKeysForGrants,
        } = await import('../permissions/catalog');

        let permissions = parseRolePermissions(row.permissions);
        // Prefer keys saved from Roles & Permissions matrix
        const catalogKeys = permissions.filter(
            (k) =>
                k === '*' ||
                k.startsWith('module.') ||
                k.startsWith('page.') ||
                k.startsWith('action.') ||
                k.startsWith('field.') ||
                k.startsWith('section.'),
        );
        if (catalogKeys.length > 0) {
            permissions = ensurePageKeysForGrants(catalogKeys);
        } else if (!permissions.length || !looksLikeCatalogPermissions(permissions)) {
            // Empty or legacy-only → built-in preset for known roles
            const presets = getPresetPermissions(row.role || req.user.role || '');
            if (presets.length) permissions = presets;
        }
        if (req.user) req.user.permissions = permissions;
        return permissions;
    } catch (err) {
        console.error('Failed to resolve permissions', err);
        try {
            const { getPresetPermissions } = await import('../permissions/catalog');
            return getPresetPermissions(req.user?.role || '');
        } catch {
            return [];
        }
    }
}

/**
 * Require any of the given permission keys (or wildcard *).
 * Uses hierarchical matching so page grants satisfy module API checks.
 */
export const requirePermission = (...keys: string[]) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User is not authenticated' });
        }
        try {
            const permissions = await resolveUserPermissions(req);
            const { hasPermissionKey } = await import('../permissions/catalog');
            if (permissions.includes('*')) return next();
            const ok = keys.length === 0 || keys.some((k) => hasPermissionKey(permissions, k));
            if (!ok) {
                return res.status(403).json({
                    error: 'You do not have permission for this action',
                    required: keys,
                });
            }
            next();
        } catch (error) {
            console.error('requirePermission failed', error);
            return res.status(500).json({ error: 'Permission check failed' });
        }
    };
};

/**
 * Require all of the given permission keys (or wildcard *).
 */
export const requireAllPermissions = (...keys: string[]) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User is not authenticated' });
        }
        try {
            const permissions = await resolveUserPermissions(req);
            const { hasPermissionKey } = await import('../permissions/catalog');
            if (permissions.includes('*')) return next();
            const ok = keys.every((k) => hasPermissionKey(permissions, k));
            if (!ok) {
                return res.status(403).json({
                    error: 'You do not have permission for this action',
                    required: keys,
                });
            }
            next();
        } catch (error) {
            console.error('requireAllPermissions failed', error);
            return res.status(500).json({ error: 'Permission check failed' });
        }
    };
};

export const enforceLoginWindow = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) => {
    try {
        const authUser = req.user;
        if (!authUser?.id) return next();
        if ((authUser.role || '').trim().toLowerCase() === 'admin') return next();

        const dbUser = await getLoginHours(authUser.id);
        if (!dbUser) {
            return res.status(401).json({ error: 'User not found', code: 'LOGIN_WINDOW' });
        }
        if (!isWithinLoginSchedule(dbUser.loginStartTime, dbUser.loginEndTime, dbUser.loginAllowedDays)) {
            return res.status(403).json({
                error: 'Your allowed login schedule has ended. Please sign in again during your scheduled hours.',
                code: 'LOGIN_WINDOW',
            });
        }
        next();
    } catch (error) {
        console.error('Login window check failed:', error);
        next();
    }
};
