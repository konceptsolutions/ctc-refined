import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '@/utils/auth';
import { canAccessPath, getFirstAllowedPath } from '@/permissions/can';
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
  const { version, canAccessPath: canPath } = usePermissions();

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
  if (!canPath(location.pathname)) {
    const fallback = getFirstAllowedPath();
    if (fallback === '/login') {
      return <Navigate to="/login" replace />;
    }
    if (fallback !== location.pathname) {
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
