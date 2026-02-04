import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as apiLogin, logout as apiLogout, getToken } from '../api/auth';
import { decodeJwt, isTokenExpired } from '../lib/token';

export interface AuthContextValue {
  isAuthenticated: boolean;
  userName: string | null;
  login: (code: string, name: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthProvider(): AuthContextValue {
  const [token, setToken] = useState<string | null>(() => {
    const t = getToken();
    if (t && isTokenExpired(t)) {
      localStorage.removeItem('token');
      return null;
    }
    return t;
  });

  const userName = token ? decodeJwt(token)?.sub ?? null : null;
  const isAuthenticated = token !== null && !isTokenExpired(token);

  // Check token expiry periodically
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (isTokenExpired(token)) {
        setToken(null);
        localStorage.removeItem('token');
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const login = useCallback(async (code: string, name: string) => {
    const t = await apiLogin(code, name);
    setToken(t);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setToken(null);
  }, []);

  return { isAuthenticated, userName, login, logout };
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
