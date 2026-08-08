import { can } from "./can";
import { usePermissions } from "./PermissionsProvider";

/** Standard CRUD / row-action suffixes from the permission catalog. */
export type PageAction =
  | "create"
  | "edit"
  | "delete"
  | "status"
  | "export"
  | "print"
  | "approve"
  | "menu.more";

/** Normalize `sales.invoice` or `page.sales.invoice` → `sales.invoice`. */
export function normalizePageId(pageId: string): string {
  const id = String(pageId || "").trim();
  return id.startsWith("page.") ? id.slice(5) : id;
}

export function pageActionKey(pageId: string, action: PageAction): string {
  const id = normalizePageId(pageId);
  return `action.${id}.${action}`;
}

export function canPageAction(
  pageId: string,
  action: PageAction,
  permissions?: string[],
): boolean {
  return can(pageActionKey(pageId, action), permissions);
}

export interface PageActions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Change status (pending/approved/etc.) */
  canStatus: boolean;
  /** Approve button — approve key OR status key */
  canApprove: boolean;
  canExport: boolean;
  canPrint: boolean;
  /** Overflow / more actions menu */
  canMenuMore: boolean;
  can: (action: PageAction) => boolean;
  key: (action: PageAction) => string;
}

/** Resolve standard page actions for a catalog page id (e.g. `sales.invoice`). */
export function getPageActions(
  pageId: string,
  permissions?: string[],
): PageActions {
  const check = (action: PageAction) => canPageAction(pageId, action, permissions);
  const canStatus = check("status");
  return {
    canCreate: check("create"),
    canEdit: check("edit"),
    canDelete: check("delete"),
    canStatus,
    canApprove: check("approve") || canStatus,
    canExport: check("export"),
    canPrint: check("print"),
    canMenuMore: check("menu.more"),
    can: check,
    key: (action) => pageActionKey(pageId, action),
  };
}

/** Hook: re-renders when permissions version changes. */
export function usePageActions(pageId: string): PageActions {
  const { version } = usePermissions();
  void version;
  return getPageActions(pageId);
}
