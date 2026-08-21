import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, isLoggedIn, clearToken } from '../api/client.js';

const AuthContext = createContext(null);

/** Single GET /auth/me bootstrap for the whole app, replacing the 7
 *  independent per-page checks each HTML page used to make. */
export function AuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isLoggedIn()) {
      setMember(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch('/auth/me');
      setMember(data.member);
    } catch {
      clearToken();
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(() => {
    clearToken();
    setMember(null);
  }, []);

  const value = {
    member,
    isAdmin: Boolean(member && member.is_admin),
    loading,
    isAuthenticated: Boolean(member),
    refresh,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
