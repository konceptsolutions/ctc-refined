import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import apiClient from "@/lib/api";
import { isAuthenticated } from "@/utils/auth";
import {
  can as canKey,
  canAccessPath,
  getPermissionsVersion,
  getStoredPermissions,
  savePermissions,
  subscribePermissions,
} from "@/permissions/can";
import { expandPermissionAncestors } from "@/permissions/catalog";

interface PermissionsContextValue {
  permissions: string[];
  version: number;
  loading: boolean;
  refresh: () => Promise<void>;
  can: (key?: string | null) => boolean;
  canAccessPath: (pathname: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(getPermissionsVersion);
  const [permissions, setPermissions] = useState<string[]>(() => getStoredPermissions());
  const [loading, setLoading] = useState(false);

  const applyLocal = useCallback(() => {
    setPermissions(getStoredPermissions());
    setVersion(getPermissionsVersion());
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated()) {
      applyLocal();
      return;
    }
    setLoading(true);
    try {
      const response: any = await apiClient.getMe();
      const next = expandPermissionAncestors(
        response?.data?.permissions || response?.permissions || [],
      );
      // Never wipe good local/login permissions with an empty /me payload
      if (next.length > 0) {
        savePermissions(next);
        setPermissions(next);
        setVersion(getPermissionsVersion());
      } else {
        applyLocal();
      }
    } catch {
      applyLocal();
    } finally {
      setLoading(false);
    }
  }, [applyLocal]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = subscribePermissions(applyLocal);
    const onFocus = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("permissions-updated", applyLocal as EventListener);
    return () => {
      unsub();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("permissions-updated", applyLocal as EventListener);
    };
  }, [applyLocal, refresh]);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      permissions,
      version,
      loading,
      refresh,
      can: (key) => canKey(key, permissions),
      canAccessPath: (pathname) => canAccessPath(pathname, permissions),
    }),
    [permissions, version, loading, refresh],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    // Safe fallback when used outside provider (e.g. login page)
    const permissions = getStoredPermissions();
    return {
      permissions,
      version: getPermissionsVersion(),
      loading: false,
      refresh: async () => undefined,
      can: (key) => canKey(key, permissions),
      canAccessPath: (pathname) => canAccessPath(pathname, permissions),
    };
  }
  return ctx;
}
