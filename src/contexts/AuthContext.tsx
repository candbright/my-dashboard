'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch, setToken, clearToken, getToken } from '@/lib/api-client';
import { isAuthFailure } from '@/lib/http-json';

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
  guestLogin: () => Promise<void>;
  register: (username: string, email: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isGuest: boolean;
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

      /*
       * `apiFetch` only rejects on a transport failure. A 401/403 arrives here as a *resolved*
       * response, and `res.json()` on that error body yields no `user` — which used to be treated as
       * "not logged in" and cleared the token. So a transient network blip and a genuine expiry were
       * handled identically: both silently logged the user out, mid-session, with no explanation.
       *
       * Only an explicit authentication rejection should end the session. Anything else — 5xx, a
       * gateway hiccup, a dropped connection — leaves the stored token alone, because there is
       * nothing to suggest it is invalid and discarding it turns a recoverable failure into a
       * forced re-login. The token is stateless, so keeping it costs nothing: if it really is bad,
       * the next API call returns 401 and `apiFetch` sends the user to the login page.
       *
       * The status list lives in `@/lib/http-json` so "expired" is defined once for the whole app.
       */
      if (isAuthFailure(res.status)) {
        clearToken();
        setUser(null);
        return;
      }

      if (!res.ok) {
        // Server-side or gateway error: unknown state. Keep whatever session we had.
        return;
      }

      const data = await res.json();
      setUser(data.user || null);
      if (!data.user) {
        clearToken();
      }
    } catch {
      // Transport failure — the request never got an answer. Explicitly *not* a logout; see above.
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

  const guestLogin = useCallback(async () => {
    const res = await apiFetch('/api/auth/guest-login', {
      method: 'POST',
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '游客登录失败');
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
    guestLogin,
    register,
    logout,
    refresh,
    isAdmin: user?.role === 'admin',
    isGuest: user?.username === 'guest',
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
