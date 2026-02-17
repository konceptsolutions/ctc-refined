import express from 'express';
import prisma from '../config/database';

const router = express.Router();

// GET /api/activity-logs - Get all activity logs with filters and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search,
      module,
      actionType,
      page = '1',
      limit = '20',
      fromDate,
      toDate,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (module && module !== 'all') {
      where.module = module;
    }

    if (actionType && actionType !== 'all') {
      where.actionType = actionType;
    }

    // Search filter (SQLite doesn't support case-insensitive mode, so we'll search in lowercase)
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      where.OR = [
        { user: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { action: { contains: searchTerm } },
        { module: { contains: searchTerm } },
      ];
    }

    // Date range filter
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate as string);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate as string);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Get stats for all logs (not just current page)
    const [successCount, warningCount, errorCount] = await Promise.all([
      prisma.activityLog.count({ where: { ...where, status: 'success' } }),
      prisma.activityLog.count({ where: { ...where, status: 'warning' } }),
      prisma.activityLog.count({ where: { ...where, status: 'error' } }),
    ]);

    // Parse details JSON and format for frontend
    const formattedLogs = logs.map(log => {
      let details: Record<string, string> | undefined;
      try {
        details = log.details ? JSON.parse(log.details) : undefined;
      } catch {
        details = undefined;
      }

      // Format timestamp from createdAt
      const timestamp = log.timestamp || (log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString());

      return {
        id: log.id,
        timestamp: timestamp,
        user: log.user || '',
        userRole: log.userRole || '',
        action: log.action || '',
        actionType: log.actionType || '',
        module: log.module || '',
        description: log.description || '',
        ipAddress: log.ipAddress || '',
        status: log.status || 'success',
        details,
      };
    });

    res.json({
      data: formattedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      stats: {
        total,
        success: successCount,
        warning: warningCount,
        error: errorCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

