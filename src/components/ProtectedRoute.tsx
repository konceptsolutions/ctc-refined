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
  const perms = getStoredPermissions();

  if (loading && perms.length === 0) {
    return null;
  }

  if (!canAccessPath(location.pathname, perms)) {
    const fallback = getFirstAllowedPath(perms);
    if (fallback && fallback !== location.pathname && fallback !== '/login') {
      return <Navigate to={fallback} replace />;
    }
    if (fallback === '/login') {
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
