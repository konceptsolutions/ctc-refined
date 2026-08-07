import { ReactNode } from "react";
import { can, canAny, canAll } from "./can";

interface PermissionGateProps {
  /** Single required permission key */
  permission?: string;
  /** Any of these keys grants access */
  anyOf?: string[];
  /** All of these keys required */
  allOf?: string[];
  /** If true, render children disabled instead of hiding */
  disableInstead?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally render UI based on role permissions.
 */
export function PermissionGate({
  permission,
  anyOf,
  allOf,
  disableInstead = false,
  fallback = null,
  children,
}: PermissionGateProps) {
  let allowed = true;
  if (permission) allowed = can(permission);
  if (allowed && anyOf?.length) allowed = canAny(anyOf);
  if (allowed && allOf?.length) allowed = canAll(allOf);

  if (allowed) return <>{children}</>;
  if (disableInstead) {
    return (
      <span className="contents opacity-50 pointer-events-none" aria-disabled>
        {children}
      </span>
    );
  }
  return <>{fallback}</>;
}
