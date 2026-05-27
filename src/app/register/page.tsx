'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState(() => searchParams.get('password') ?? '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();

  // Keep state in sync if params change (e.g. browser back/forward)
  useEffect(() => {
    const p = searchParams.get('email');
    if (p) setEmail(p);
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  const goToLogin = () => {
    const params = new URLSearchParams();
    if (email.trim()) params.set('email', email.trim());
    if (password) params.set('password', password);
    router.push(`/login${params.size ? '?' + params.toString() : ''}`);
  };

  if (isAuthenticated) return null;

  const startCooldown = () => {
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
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
        body: JSON.stringify({ email: email.trim(), type: 'register' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发送失败');
      setCodeSent(true);
      startCooldown();
      if (data._devCode) setCode(data._devCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!code.trim()) {
      setError('请输入邮箱验证码');
      return;
    }

    setLoading(true);
    try {
      await register(username.trim() || '', email.trim(), password, code.trim());
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
    focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
    placeholder:text-[var(--muted-foreground)]`;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className="w-full max-w-sm"
      >
        <h1 className="text-xl font-bold tracking-tight mb-6">注册</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Username — optional */}
          <div>
            <input
              type="text"
              minLength={2}
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="用户名（选填，不填则自动生成）"
              autoFocus
            />
          </div>

          {/* Email + send code */}
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setCodeSent(false); }}
              className={`flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                placeholder:text-[var(--muted-foreground)]`}
              placeholder="邮箱"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || cooldown > 0 || !email.trim()}
              className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium
                hover:bg-[var(--muted)] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {sendingCode
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : cooldown > 0 ? `${cooldown}s`
                : codeSent ? '重新发送'
                : '发送验证码'}
            </button>
          </div>

          {/* Verification code */}
          <input
            type="text"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={inputClass}
            placeholder="邮箱验证码（6位）"
          />

          {/* Password */}
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="密码（至少6位）"
          />

          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            placeholder="确认密码"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-sm font-medium
              hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted-foreground)] mt-4">
          已有账号？{' '}
          <button
            type="button"
            onClick={goToLogin}
            className="text-[var(--accent)] hover:underline"
          >
            登录
          </button>
        </p>
      </motion.div>
    </div>
  );
}
