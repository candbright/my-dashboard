'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { useCountdown } from '@/hooks/useCountdown';
import { Button, Input, Card, CardBody } from '@/components/ui';
import { Send } from 'lucide-react';

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState(() => searchParams.get('password') ?? '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, startCooldown] = useCountdown(60);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">创建账号</h1>
          <p className="text-sm text-default-500 mt-1">注册一个新的 ResumeVault 账号</p>
        </div>

        <Card variant="bordered">
          <CardBody className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm text-danger bg-danger/10 rounded-[2rem] px-4 py-2.5">
                  {error}
                </div>
              )}

              <Input
                type="text"
                minLength={2}
                maxLength={50}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="选填，不填则自动生成"
                label="用户名"
                autoFocus
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">邮箱</label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setCodeSent(false);
                    }}
                    placeholder="邮箱地址"
                  />
                  <Button
                    type="button"
                    variant="bordered"
                    size="md"
                    onClick={handleSendCode}
                    disabled={sendingCode || cooldown > 0 || !email.trim()}
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
              </div>

              <Input
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6位验证码"
                label="验证码"
              />

              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位"
                label="密码"
              />

              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                label="确认密码"
              />

              <Button
                type="submit"
                color="primary"
                variant="solid"
                fullWidth
                isLoading={loading}
              >
                注册
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-default-500 mt-5">
          已有账号？{' '}
          <button
            type="button"
            onClick={goToLogin}
            className="text-primary font-medium hover:underline"
          >
            登录
          </button>
        </p>
      </motion.div>
    </div>
  );
}
