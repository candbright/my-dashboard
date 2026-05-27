'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';

type LoginMethod = 'password' | 'code';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState(() => searchParams.get('password') ?? '');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<LoginMethod>('password');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  // Keep state in sync if params change (e.g. browser back/forward)
  useEffect(() => {
    const p = searchParams.get('email');
    if (p) setEmail(p);
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  const goToRegister = () => {
    const params = new URLSearchParams();
    if (email.trim()) params.set('email', email.trim());
    if (password) params.set('password', password);
    router.push(`/register${params.size ? '?' + params.toString() : ''}`);
  };

  if (isAuthenticated) return null;

  const startCooldown = () => {
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }

    setSendingCode(true);
    setError(null);

    try {
      const res = await apiFetch('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), type: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发送失败');

      setCodeSent(true);
      startCooldown();

      // In dev mode, auto-fill the code
      if (data._devCode) {
        setCode(data._devCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (method === 'code') {
        await login(email.trim(), undefined, code.trim(), 'code');
      } else {
        await login(email.trim(), password, undefined, 'password');
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className="w-full max-w-sm"
      >
        <h1 className="text-xl font-bold tracking-tight mb-6">登录</h1>

        {/* Method tabs */}
        <div className="flex gap-4 mb-5 border-b border-[var(--border)]">
          {[
            { id: 'password' as LoginMethod, label: '密码登录' },
            { id: 'code' as LoginMethod, label: '验证码登录' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setMethod(tab.id); setError(null); }}
              className={`relative pb-2 text-sm font-medium transition-colors ${
                method === tab.id
                  ? 'text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab.label}
              {method === tab.id && (
                <motion.span
                  layoutId="login-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
              placeholder:text-[var(--muted-foreground)]"
            placeholder="邮箱"
            autoFocus
          />

          {method === 'password' ? (
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                placeholder:text-[var(--muted-foreground)]"
              placeholder="密码"
            />
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                  placeholder:text-[var(--muted-foreground)]"
                placeholder="6位验证码"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode || cooldown > 0}
                className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium
                  hover:bg-[var(--muted)] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {sendingCode ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : cooldown > 0 ? (
                  `${cooldown}s`
                ) : codeSent ? (
                  '重新发送'
                ) : (
                  '发送验证码'
                )}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-sm font-medium
              hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '登录'}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted-foreground)] mt-4">
          还没有账号？{' '}
          <button
            type="button"
            onClick={goToRegister}
            className="text-[var(--accent)] hover:underline"
          >
            注册
          </button>
        </p>
      </motion.div>
    </div>
  );
}
