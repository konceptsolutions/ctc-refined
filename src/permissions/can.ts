import {
  findModuleByPath,
  findPageByPath,
  getPresetPermissions,
  expandPermissionAncestors,
  hasPermissionKey,
} from "./catalog";

const PERMS_STORAGE_KEY = "userPermissions";
const PERMS_VERSION_KEY = "userPermissionsVersion";

type PermissionsListener = () => void;
const listeners = new Set<PermissionsListener>();

export function subscribePermissions(listener: PermissionsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bumpPermissionsVersion(): void {
  const next = String(Date.now());
  localStorage.setItem(PERMS_VERSION_KEY, next);
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
  // Cross-tab / same-tab components listening to storage
  try {
    window.dispatchEvent(new CustomEvent("permissions-updated"));
  } catch {
    /* ignore */
  }
}

export function getPermissionsVersion(): number {
  const raw = localStorage.getItem(PERMS_VERSION_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return raw.trim() ? [raw.trim()] : [];
    }
  }
  return [];
}

export function savePermissions(permissions: string[]): void {
  const expanded = expandPermissionAncestors(permissions || []);
  localStorage.setItem(PERMS_STORAGE_KEY, JSON.stringify(expanded));
  bumpPermissionsVersion();
}

export function clearPermissions(): void {
  localStorage.removeItem(PERMS_STORAGE_KEY);
  bumpPermissionsVersion();
}

function readRawStoredPermissions(): string[] {
  try {
    const raw = localStorage.getItem(PERMS_STORAGE_KEY);
    if (raw) {
      const parsed = parsePermissions(JSON.parse(raw));
      if (parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }

  try {
    const token = localStorage.getItem("authToken");
    if (!token) return [];
    const parts = token.split(".");
    if (parts.length < 2) return [];
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    const fromJwt = parsePermissions(payload?.permissions);
    if (fromJwt.length) return fromJwt;

    const role = typeof payload?.role === "string" ? payload.role : "";
    if (role) return getPresetPermissions(role);
  } catch {
    /* ignore */
  }
  return [];
}

/** Effective permissions (always includes parent module/page keys). */
export function getStoredPermissions(): string[] {
  return expandPermissionAncestors(readRawStoredPermissions());
}

export function hasWildcard(permissions: string[] = getStoredPermissions()): boolean {
  return permissions.includes("*");
}

export function can(
  key: string | undefined | null,
  permissions: string[] = getStoredPermissions(),
): boolean {
  if (!key) return true;
  return hasPermissionKey(permissions, key);
}

export function canAny(
  keys: Array<string | undefined | null>,
  permissions: string[] = getStoredPermissions(),
): boolean {
  const effective = expandPermissionAncestors(permissions);
  if (effective.includes("*")) return true;
  return keys.some((k) => k && hasPermissionKey(effective, k));
}

export function canAll(
  keys: Array<string | undefined | null>,
  permissions: string[] = getStoredPermissions(),
): boolean {
  const effective = expandPermissionAncestors(permissions);
  if (effective.includes("*")) return true;
  return keys.every((k) => !k || hasPermissionKey(effective, k));
}

export function hasModule(
  moduleKey: string,
  permissions: string[] = getStoredPermissions(),
): boolean {
  return can(moduleKey, permissions);
}

export function hasPage(
  pageKey: string,
  permissions: string[] = getStoredPermissions(),
): boolean {
  return can(pageKey, permissions);
}

export function canAccessPath(
  pathname: string,
  permissions: string[] = getStoredPermissions(),
): boolean {
  const effective = expandPermissionAncestors(permissions);
  if (effective.includes("*")) return true;
  const mod = findModuleByPath(pathname);
  if (!mod) return true;
  if (!hasPermissionKey(effective, mod.key)) return false;
  const page = findPageByPath(pathname);
  if (page && !hasPermissionKey(effective, page.key)) return false;
  return true;
}

function roleHomeFromJwt(): string | null {
  try {
    const token = localStorage.getItem("authToken");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    const role = String(payload?.role || "")
      .trim()
      .toLowerCase();
    if (role === "store user") return "/inventory/current-stock";
    if (role === "manager") return "/partentry";
    if (role === "accountant") return "/accounting";
    if (role === "sales") return "/sales/invoice";
    if (role === "admin") return "/";
  } catch {
    /* ignore */
  }
  return null;
}

export function getFirstAllowedPath(
  permissions: string[] = getStoredPermissions(),
): string {
  let effective = expandPermissionAncestors(permissions);
  // If stored/JWT perms are empty, fall back to role presets so login can proceed
  if (!effective.length) {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const parts = token.split(".");
        if (parts.length >= 2) {
          const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
          const payload = JSON.parse(atob(padded));
          const role = typeof payload?.role === "string" ? payload.role : "";
          if (role) {
            effective = expandPermissionAncestors(getPresetPermissions(role));
            if (effective.length) {
              savePermissions(effective);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (effective.includes("*")) return "/";
  const candidates = [
    "/",
    "/partentry",
    "/inventory/purchase-inquiry",
    "/inventory/current-stock",
    "/transfer/transfer-in",
    "/store/orders",
    "/pricing-costing",
    "/sales/inquiry",
    "/sales/invoice",
    "/purchase-import/inquiry",
    "/accounting",
    "/financial-statements",
    "/vouchers",
    "/employees/staff",
    "/manage/suppliers",
    "/settings/users",
  ];
  for (const path of candidates) {
    if (canAccessPath(path, effective)) return path;
  }
  return roleHomeFromJwt() || "/login";
}
