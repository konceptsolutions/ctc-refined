/**
 * Authentication utility functions
 * Handles login state with 24-hour expiration
 */

import { clearPermissions, savePermissions, parsePermissions } from "@/permissions/can";
import { getPresetPermissions } from "@/permissions/catalog";

const AUTH_STORAGE_KEY = 'devKonceptsAuth';
const EXPIRATION_HOURS = 24;

export interface AuthData {
  userRole: 'admin' | 'store';
  loginTime: number;
  expirationTime: number;
  token: string;
  loginStartTime?: string | null;
  loginEndTime?: string | null;
  loginAllowedDays?: number[] | null;
  permissions?: string[];
}

const decodeJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

/**
 * Save authentication data with 24-hour expiration
 */
export const saveAuth = (
  userRole: 'admin' | 'store',
  token: string,
  loginHours?: { loginStartTime?: string | null; loginEndTime?: string | null; loginAllowedDays?: number[] | null },
  permissions?: string[],
): void => {
  const loginTime = Date.now();
  const expirationTime = loginTime + (EXPIRATION_HOURS * 60 * 60 * 1000); // 24 hours in milliseconds
  let perms = parsePermissions(permissions);
  if (!perms.length) {
    const roleName = getTokenRoleNameFromToken(token) || (userRole === 'store' ? 'Store User' : '');
    if (roleName) perms = getPresetPermissions(roleName);
  }

  const authData: AuthData = {
    userRole,
    loginTime,
    expirationTime,
    token,
    loginStartTime: loginHours?.loginStartTime || null,
    loginEndTime: loginHours?.loginEndTime || null,
    loginAllowedDays: loginHours?.loginAllowedDays || null,
    permissions: perms,
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
  // Also keep token for easy access
  localStorage.setItem('authToken', token);
  localStorage.setItem('userRole', userRole);
  savePermissions(perms);
};

const getTokenRoleNameFromToken = (token: string): string | null => {
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return typeof role === 'string' ? role : null;
};

export const getStoredLoginHours = (): {
  loginStartTime: string | null;
  loginEndTime: string | null;
  loginAllowedDays: number[] | null;
} => {
  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!authDataStr) {
      return { loginStartTime: null, loginEndTime: null, loginAllowedDays: null };
    }
    const authData: AuthData = JSON.parse(authDataStr);
    return {
      loginStartTime: authData.loginStartTime || null,
      loginEndTime: authData.loginEndTime || null,
      loginAllowedDays: Array.isArray(authData.loginAllowedDays) ? authData.loginAllowedDays : null,
    };
  } catch {
    return { loginStartTime: null, loginEndTime: null, loginAllowedDays: null };
  }
};

/**
 * Check if user is authenticated and session is still valid
 */
export const isAuthenticated = (): boolean => {
  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!authDataStr) {
      return false;
    }

    const authData: AuthData = JSON.parse(authDataStr);
    const now = Date.now();

    // Check if session has expired
    if (now > authData.expirationTime) {
      // Session expired, clear auth data
      clearAuth();
      return false;
    }

    return true;
  } catch (error) {
    clearAuth();
    return false;
  }
};

/**
 * Get current user role
 */
export const getUserRole = (): 'admin' | 'store' | null => {
  if (!isAuthenticated()) {
    return null;
  }

  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authDataStr) {
      const authData: AuthData = JSON.parse(authDataStr);
      return authData.userRole;
    }
  } catch (error) {
  }

  // Fallback to old storage method for backward compatibility
  const role = localStorage.getItem('userRole');
  return (role === 'admin' || role === 'store') ? role : null;
};

export const getTokenRoleName = (): string | null => {
  const token = localStorage.getItem('authToken');
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return typeof role === 'string' ? role : null;
};

export const isStoreUserRole = (): boolean => {
  const roleName = getTokenRoleName()?.trim().toLowerCase();
  return roleName === 'store user';
};

export const isAdminRole = (): boolean => {
  const roleName = getTokenRoleName()?.trim().toLowerCase();
  return roleName === 'admin';
};

export const isManagerRole = (): boolean => {
  const roleName = getTokenRoleName()?.trim().toLowerCase();
  return roleName === 'manager';
};

export const isAccountantRole = (): boolean => {
  const roleName = getTokenRoleName()?.trim().toLowerCase();
  return roleName === 'accountant';
};

export const isSalesRole = (): boolean => {
  const roleName = getTokenRoleName()?.trim().toLowerCase();
  return roleName === 'sales';
};

/** Paths Manager role is allowed to access */
export const MANAGER_ALLOWED_PATHS = [
  '/partentry',
  '/inventory',
  '/pricing-costing',
  '/sales',
  '/manage',
] as const;

/** Paths Accountant role is allowed to access */
export const ACCOUNTANT_ALLOWED_PATHS = [
  '/accounting',
  '/financial-statements',
  '/vouchers',
  '/sales',
] as const;

/** Paths Sales role is allowed to access */
export const SALES_ALLOWED_PATHS = [
  '/sales',
] as const;

export const isManagerAllowedPath = (pathname: string): boolean => {
  return MANAGER_ALLOWED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
};

export const isAccountantAllowedPath = (pathname: string): boolean => {
  return ACCOUNTANT_ALLOWED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
};

export const isSalesAllowedPath = (pathname: string): boolean => {
  return SALES_ALLOWED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
};

export const getManagerHomePath = (): string => '/partentry';

export const getAccountantHomePath = (): string => '/accounting';

export const getSalesHomePath = (): string => '/sales/invoice';

export const getTokenUserName = (): string | null => {
  const token = localStorage.getItem('authToken');
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const name = payload?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
};

/**
 * Clear authentication data
 */
export const clearAuth = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('userRole');
  localStorage.removeItem('authToken');
  clearPermissions();
};

/** Effective permission keys for the logged-in user */
export const getUserPermissions = (): string[] => {
  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authDataStr) {
      const authData: AuthData = JSON.parse(authDataStr);
      if (authData.permissions?.length) return authData.permissions;
    }
  } catch {
    /* ignore */
  }
  const roleName = getTokenRoleName();
  if (roleName) return getPresetPermissions(roleName);
  return [];
};

/**
 * Get current auth token
 */
export const getAuthToken = (): string | null => {
  if (!isAuthenticated()) {
    return null;
  }

  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authDataStr) {
      const authData: AuthData = JSON.parse(authDataStr);
      return authData.token;
    }
  } catch (error) {
  }

  return localStorage.getItem('authToken');
};

/**
 * Get remaining days until expiration
 */
export const getRemainingDays = (): number => {
  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!authDataStr) {
      return 0;
    }

    const authData: AuthData = JSON.parse(authDataStr);
    const now = Date.now();
    const remaining = authData.expirationTime - now;

    if (remaining <= 0) {
      return 0;
    }

    return Math.ceil(remaining / (24 * 60 * 60 * 1000)); // Convert to days
  } catch (error) {
    return 0;
  }
};
