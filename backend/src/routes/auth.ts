import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logActivity, getClientIp } from '../utils/activityLogger';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user by email with role name via roleId foreign key.
        const users = await prisma.$queryRaw<Array<{
            id: string;
            name: string;
            email: string;
            password: string | null;
            status: string;
            role: string;
        }>>`
            SELECT u.id, u.name, u.email, u.password, u.status, r.name AS role
            FROM "User" u
            JOIN "Role" r ON r.id = u."roleId"
            WHERE u.email = ${email}
            LIMIT 1
        `;
        const user = users[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare password
        if (!user.password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user is active (handle both 'active' and 'Active' casing)
        const userStatus = user.status.toLowerCase();
        if (userStatus !== 'active') {
            return res.status(403).json({ error: 'User account is deactivated' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET as jwt.Secret,
            { expiresIn: JWT_EXPIRY as any }
        );

        // Update last login
        await prisma.$executeRaw`
            UPDATE "User"
            SET "lastLogin" = ${new Date().toISOString()}, "updatedAt" = NOW()
            WHERE id = ${user.id}
        `;

        // Log activity
        await logActivity({
            user: user.name,
            userRole: user.role,
            action: 'User Login',
            actionType: 'login',
            module: 'Auth',
            description: `User ${user.email} logged in successfully`,
            ipAddress: getClientIp(req),
            status: 'success',
            details: { userId: user.id, email: user.email },
        });

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            }
        });
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
