import { randomUUID } from "crypto";
import prisma from "../config/database";

export type ActivityActionType =
  | "login"
  | "login_failed"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "print"
  | "status_change"
  | "approve"
  | "backup"
  | "restore";

export interface LogActivityParams {
  user: string;
  userId?: string | null;
  userRole: string;
  action: string;
  actionType: ActivityActionType;
  module: string;
  description: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  ipAddress?: string;
  status?: "success" | "warning" | "error";
  details?: Record<string, any>;
}

/**
 * Log an activity to the activity logs table.
 * Prefer passing userId + entityType/entityId for reliable filtering.
 * Pass `req` when available so the audit middleware skips a duplicate row.
 */
export async function logActivity(params: LogActivityParams, req?: any) {
  try {
    await prisma.activityLog.create({
      data: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        user: params.user,
        userId: params.userId || null,
        userRole: params.userRole,
        action: params.action,
        actionType: params.actionType,
        module: params.module,
        description: params.description,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        entityLabel: params.entityLabel || null,
        ipAddress: params.ipAddress || "127.0.0.1",
        status: params.status || "success",
        details: params.details ? JSON.stringify(params.details) : null,
      },
    });
    if (req) {
      markActivityLogged(req);
    }
  } catch (error) {
    // Don't throw errors for logging - just log to console
    console.error("Failed to write activity log:", error);
  }
}

export function markActivityLogged(req: any) {
  if (req) req._activityLogged = true;
}

export function wasActivityLogged(req: any): boolean {
  return Boolean(req && req._activityLogged);
}

/**
 * Prefer store operator password attribution from the request body;
 * fall back to the JWT user on the session.
 */
export function resolveStorePerformer(req: any): {
  user: string;
  userId: string | null;
  userRole: string;
  sessionUser: string | null;
  sessionUserId: string | null;
  sessionUserRole: string | null;
  attributedViaPassword: boolean;
} {
  const u = req?.user;
  const sessionUser = u?.name || u?.email || null;
  const sessionUserId = u?.id ? String(u.id) : null;
  const sessionUserRole = u?.role ? String(u.role) : null;
  const body = req?.body || {};

  if (body.performedById || body.performedBy) {
    return {
      user: String(body.performedBy || "Unknown"),
      userId: body.performedById ? String(body.performedById) : null,
      userRole: String(body.performedByRole || "Store Operator"),
      sessionUser,
      sessionUserId,
      sessionUserRole,
      attributedViaPassword: true,
    };
  }

  return {
    user: sessionUser || "Unknown",
    userId: sessionUserId,
    userRole: sessionUserRole || "Unknown",
    sessionUser,
    sessionUserId,
    sessionUserRole,
    attributedViaPassword: false,
  };
}

/** Append "by Operator from session Admin" when password attribution differs from login. */
export function withOperatorAttribution(
  description: string,
  performer: ReturnType<typeof resolveStorePerformer>,
): string {
  if (!performer.attributedViaPassword) return description;
  const op = `${performer.user}${
    performer.userRole ? ` (${performer.userRole})` : ""
  }`;
  const sessionDiffers =
    performer.sessionUser &&
    performer.sessionUserId &&
    performer.sessionUserId !== performer.userId;
  if (sessionDiffers) {
    return `${description} by ${op} from session ${performer.sessionUser} (${performer.sessionUserRole || "user"})`;
  }
  return `${description} by ${op}`;
}

/**
 * Helper function to get IP address from Express request
 */
export function getClientIp(req: any): string {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "127.0.0.1"
  );
}
