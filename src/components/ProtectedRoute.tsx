import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '@/utils/auth';

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

  return <>{children}</>;
};

export default ProtectedRoute;
