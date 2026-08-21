import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** Route guard — mirrors every HTML page's "no valid token -> Login.html"
 *  behavior, but checked once here instead of independently per page. */
export function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
