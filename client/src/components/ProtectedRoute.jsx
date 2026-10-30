import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PermissionGate } from './PermissionGate.jsx';

/** Route guard — mirrors every HTML page's "no valid token -> Login.html"
 *  behavior, but checked once here instead of independently per page.
 *  Also gates on location + notification permissions, per explicit
 *  instruction: a signed-in member who hasn't granted both can't use any
 *  protected page until they do (PermissionGate renders the explanation/
 *  request screen in that case instead of `children`). */
export function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <PermissionGate>{children}</PermissionGate>;
}
