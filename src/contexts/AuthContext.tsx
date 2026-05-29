'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch, setToken, clearToken, getToken } from '@/lib/api-client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatar: string | null;
  ai_enabled: boolean;
  created_at: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password?: string, code?: string, method?: 'password' | 'code') => Promise<void>;
  register: (username: string, email: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      if (!getToken()) {
        setUser(null);
        setLoading(false);
        return;
      }
      const res = await apiFetch('/api/auth/me');
      const data = await res.json();
      setUser(data.user || null);
      if (!data.user) {
        clearToken();
      }
    } catch {
      setUser(null);
      clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password?: string, code?: string, method: 'password' | 'code' = 'password') => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, code, method }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '登录失败');
    }

    if (data.token) {
      setToken(data.token);
    }
    setUser(data.user);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string, code: string) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, code }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '注册失败');
    }

    if (data.token) {
      setToken(data.token);
    }
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refresh,
    isAdmin: user?.role === 'admin',
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
