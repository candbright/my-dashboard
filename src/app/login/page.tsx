'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { useCountdown } from '@/hooks/useCountdown';
import { Button, Input, Card, CardBody, Tabs, Divider } from '@/components/ui';
import { Send, UserRound } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState(() => searchParams.get('password') ?? '');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, startCooldown] = useCountdown(60);
  const [guestLoading, setGuestLoading] = useState(false);
  const { login, guestLogin, isAuthenticated } = useAuth();
  const router = useRouter();

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
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-[2rem] bg-secondary flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">欢迎回来</h1>
          <p className="text-sm text-default-500 mt-1">登录你的 ResumeVault 账号</p>
        </div>

        <Card variant="bordered">
          <CardBody className="p-6 space-y-5">
            {/* Method tabs */}
            <Tabs
              variant="solid"
              size="sm"
              fullWidth
              items={[
                { key: 'password', label: '密码登录' },
                { key: 'code', label: '验证码登录' },
              ]}
              selectedKey={method}
              onSelectionChange={(k) => {
                setMethod(k as 'password' | 'code');
                setError(null);
              }}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm text-danger bg-danger/10 rounded-[2rem] px-4 py-2.5">
                  {error}
                </div>
              )}

              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱地址"
                label="邮箱"
                autoFocus
              />

              <AnimatePresence mode="wait">
                <div className="overflow-hidden" style={{ minHeight: '4.5rem' }}>
                {method === 'password' ? (
                  <motion.div
                    key="password"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-1.5"
                  >
                    <label className="text-sm font-medium text-foreground">密码</label>
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入密码"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="code"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-1.5"
                  >
                    <label className="text-sm font-medium text-foreground">验证码</label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        required
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6位验证码"
                      />
                      <Button
                        type="button"
                        variant="bordered"
                        size="md"
                        onClick={handleSendCode}
                        disabled={sendingCode || cooldown > 0}
                        isLoading={sendingCode}
                        className="shrink-0 whitespace-nowrap"
                        startContent={!sendingCode && cooldown === 0 ? <Send className="w-3.5 h-3.5" /> : undefined}
                      >
                        {cooldown > 0
                          ? `${cooldown}s`
                          : codeSent
                          ? '重新发送'
                          : '发送'}
                      </Button>
                    </div>
                  </motion.div>
                )}
                </div>
              </AnimatePresence>

              <Button
                type="submit"
                color="primary"
                variant="solid"
                fullWidth
                isLoading={loading}
              >
                登录
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <Divider className="flex-1" />
              <span className="text-xs text-default-400 whitespace-nowrap">或</span>
              <Divider className="flex-1" />
            </div>

            <Button
              type="button"
              variant="bordered"
              fullWidth
              isLoading={guestLoading}
              startContent={!guestLoading ? <UserRound className="w-4 h-4" /> : undefined}
              onClick={async () => {
                setError(null);
                setGuestLoading(true);
                try {
                  await guestLogin();
                  router.push('/');
                } catch (err) {
                  setError(err instanceof Error ? err.message : '游客登录失败');
                } finally {
                  setGuestLoading(false);
                }
              }}
            >
              游客登录
            </Button>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-default-500 mt-5">
          还没有账号？{' '}
          <button
            type="button"
            onClick={goToRegister}
            className="text-primary font-medium hover:underline"
          >
            立即注册
          </button>
        </p>
      </motion.div>
    </div>
  );
}
