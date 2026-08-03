import express from "express";
import prisma from "../config/database";
import {
  ActivityActionType,
  getClientIp,
  logActivity,
} from "../utils/activityLogger";

const router = express.Router();

const ALLOWED_ACTION_TYPES = new Set<ActivityActionType>([
  "login",
  "login_failed",
  "create",
  "update",
  "delete",
  "export",
  "print",
  "status_change",
  "approve",
  "backup",
  "restore",
]);

// POST /api/activity-logs - Explicit client-side activity (print / export / etc.)
router.post("/", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      action,
      actionType,
      module,
      description,
      entityType,
      entityId,
      entityLabel,
      status,
      details,
    } = req.body || {};

    const normalizedActionType = String(actionType || "").trim() as ActivityActionType;
    if (!ALLOWED_ACTION_TYPES.has(normalizedActionType)) {
      return res.status(400).json({ error: "Invalid actionType" });
    }
    if (!module || !description) {
      return res.status(400).json({ error: "module and description are required" });
    }

    await logActivity(
      {
        user: user.name || user.email || "Unknown",
        userId: user.id,
        userRole: user.role || "User",
        action: action || String(normalizedActionType),
        actionType: normalizedActionType,
        module: String(module),
        description: String(description),
        entityType: entityType ? String(entityType) : null,
        entityId: entityId ? String(entityId) : null,
        entityLabel: entityLabel ? String(entityLabel) : null,
        ipAddress: getClientIp(req),
        status: status === "warning" || status === "error" ? status : "success",
        details: details && typeof details === "object" ? details : undefined,
      },
      req,
    );

    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/activity-logs - Get all activity logs with filters and pagination
router.get("/", async (req, res) => {
  try {
    const {
      search,
      module,
      actionType,
      userId,
      entityType,
      entityId,
      page = "1",
      limit = "20",
      fromDate,
      toDate,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (module && module !== "all") {
      where.module = module;
    }

    if (actionType && actionType !== "all") {
      where.actionType = actionType;
    }

    if (userId) {
      where.userId = String(userId);
    }

    if (entityType) {
      where.entityType = String(entityType);
    }

    if (entityId) {
      where.entityId = String(entityId);
    }

    if (search) {
      const searchTerm = String(search).trim();
      where.OR = [
        { user: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
        { action: { contains: searchTerm, mode: "insensitive" } },
        { module: { contains: searchTerm, mode: "insensitive" } },
        { entityLabel: { contains: searchTerm, mode: "insensitive" } },
        { entityId: { contains: searchTerm, mode: "insensitive" } },
        { userId: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      // Interpret filter dates in Pakistan time (Asia/Karachi, UTC+5)
      if (fromDate) {
        where.createdAt.gte = new Date(`${String(fromDate).trim()}T00:00:00+05:00`);
      }
      if (toDate) {
        where.createdAt.lte = new Date(`${String(toDate).trim()}T23:59:59.999+05:00`);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.count({ where }),
    ]);

    const [successCount, warningCount, errorCount] = await Promise.all([
      prisma.activityLog.count({ where: { ...where, status: "success" } }),
      prisma.activityLog.count({ where: { ...where, status: "warning" } }),
      prisma.activityLog.count({ where: { ...where, status: "error" } }),
    ]);

    const formattedLogs = logs.map((log) => {
      let details: Record<string, string> | undefined;
      try {
        details = log.details ? JSON.parse(log.details) : undefined;
      } catch {
        details = undefined;
      }

      const timestamp =
        log.timestamp ||
        (log.createdAt
          ? new Date(log.createdAt).toISOString()
          : new Date().toISOString());

      return {
        id: log.id,
        timestamp,
        user: log.user || "",
        userId: log.userId || null,
        userRole: log.userRole || "",
        action: log.action || "",
        actionType: log.actionType || "",
        module: log.module || "",
        description: log.description || "",
        entityType: log.entityType || null,
        entityId: log.entityId || null,
        entityLabel: log.entityLabel || null,
        ipAddress: log.ipAddress || "",
        status: log.status || "success",
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
