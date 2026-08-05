import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getLoginHours, isWithinLoginWindow } from '../utils/loginHours';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        name: string;
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
        if (!isWithinLoginWindow(dbUser.loginStartTime, dbUser.loginEndTime)) {
            return res.status(403).json({
                error: 'Your allowed login time has ended. Please sign in again during your scheduled hours.',
                code: 'LOGIN_WINDOW',
            });
        }
        next();
    } catch (error) {
        console.error('Login window check failed:', error);
        next();
    }
};
