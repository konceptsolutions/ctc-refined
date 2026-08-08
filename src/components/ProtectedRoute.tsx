import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '@/utils/auth';
import { canAccessPath, getFirstAllowedPath, getStoredPermissions } from '@/permissions/can';
import { usePermissions } from '@/permissions/PermissionsProvider';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute component
 * Redirects unauthenticated users to login page
 * Enforces module/page permissions from the role matrix
 *
 * Uses sync localStorage permissions (not only React context) so a fresh
 * login is not bounced back to /login while context state is still stale.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation();
  const authenticated = isAuthenticated();
  const { version, loading } = usePermissions();

  useEffect(() => {
    if (!authenticated) {
      localStorage.removeItem('devKonceptsAuth');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userPermissions');
    }
  }, [authenticated, location]);

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  void version;
  // Prefer freshly written localStorage over possibly-stale context after login
  const perms = getStoredPermissions();

  if (loading && perms.length === 0) {
    return null;
  }

  if (!canAccessPath(location.pathname, perms)) {
    const fallback = getFirstAllowedPath(perms);
    // Never trap an authenticated user on /login due to empty perms
    if (fallback === '/login' || fallback === location.pathname) {
      return <>{children}</>;
    }
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
