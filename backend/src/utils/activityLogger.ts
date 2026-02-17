import { randomUUID } from 'crypto';
import prisma from '../config/database';

interface LogActivityParams {
  user: string;
  userRole: string;
  action: string;
  actionType: 'login' | 'create' | 'update' | 'delete' | 'export' | 'approve' | 'login_failed' | 'backup' | 'restore';
  module: string;
  description: string;
  ipAddress?: string;
  status?: 'success' | 'warning' | 'error';
  details?: Record<string, any>;
}

/**
 * Log an activity to the activity logs table
 * Use this function throughout the application to log real user activities
 */
export async function logActivity(params: LogActivityParams) {
  try {
    await prisma.activityLog.create({
      data: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        user: params.user,
        userRole: params.userRole,
        action: params.action,
        actionType: params.actionType,
        module: params.module,
        description: params.description,
        ipAddress: params.ipAddress || '127.0.0.1',
        status: params.status || 'success',
        details: params.details ? JSON.stringify(params.details) : null,
      },
    });
  } catch (error) {
    // Don't throw errors for logging - just log to console
  }
}

/**
 * Helper function to get IP address from Express request
 */
export function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

