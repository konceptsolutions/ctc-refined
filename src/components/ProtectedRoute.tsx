import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated, getUserRole, isStoreUserRole, isManagerRole, isManagerAllowedPath, getManagerHomePath, isAccountantRole, isAccountantAllowedPath, getAccountantHomePath, isSalesRole, isSalesAllowedPath, getSalesHomePath, isAdminRole } from '@/utils/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute component
 * Redirects unauthenticated users to login page
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation();
  const authenticated = isAuthenticated();

  useEffect(() => {
    // Check authentication on mount and when location changes
    if (!authenticated) {
      // Clear any stale auth data
      localStorage.removeItem('devKonceptsAuth');
      localStorage.removeItem('userRole');
    }
  }, [authenticated, location]);

  if (!authenticated) {
    // Redirect to login with return URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isStoreUser = getUserRole() === 'store' || isStoreUserRole();
  if (isStoreUser) {
    const path = location.pathname;
    const allowedForStoreUser =
      path.startsWith('/store') || path === '/inventory/current-stock';
    if (!allowedForStoreUser) {
      return <Navigate to="/inventory/current-stock" replace />;
    }
  }

  if (isManagerRole() && !isManagerAllowedPath(location.pathname)) {
    return <Navigate to={getManagerHomePath()} replace />;
  }

  if (isAccountantRole()) {
    const path = location.pathname;
    const allowedAccountantSales =
      path === '/sales' ||
      path === '/sales/invoice' ||
      path.startsWith('/sales/invoice/') ||
      path === '/sales/returns' ||
      path.startsWith('/sales/returns/');
    if (path.startsWith('/sales') && !allowedAccountantSales) {
      return <Navigate to={getSalesHomePath()} replace />;
    }
    if (!isAccountantAllowedPath(path)) {
      return <Navigate to={getAccountantHomePath()} replace />;
    }
  }

  if (isSalesRole()) {
    const path = location.pathname;
    const blockedSalesTabs =
      path === '/sales/inquiry' ||
      path.startsWith('/sales/inquiry/') ||
      path === '/sales/distributor-aging' ||
      path.startsWith('/sales/distributor-aging/') ||
      path === '/sales/receivable-reminders' ||
      path.startsWith('/sales/receivable-reminders/');
    if (!isSalesAllowedPath(path) || blockedSalesTabs) {
      return <Navigate to={getSalesHomePath()} replace />;
    }
  }

  // Settings / user administration is Admin-only
  if (location.pathname.startsWith('/settings') && !isAdminRole()) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
