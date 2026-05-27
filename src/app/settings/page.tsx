'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';

export default function UserSettingsPage() {
  const { user, isAuthenticated, loading: authLoading, refresh } = useAuth();
  const router = useRouter();

  // Username state
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Email state
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

  const startEmailCooldown = () => {
    setEmailCooldown(60);
    const timer = setInterval(() => {
      setEmailCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendEmailCode = async () => {
    if (!newEmail.trim()) {
      setEmailError('请输入新邮箱地址');
      return;
    }

    setSendingEmailCode(true);
    setEmailError(null);

    try {
      const res = await apiFetch('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim(), type: 'bind_email' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发送失败');

      startEmailCooldown();

      if (data._devCode) {
        setEmailCode(data._devCode);
      }
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSendingEmailCode(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!username.trim()) {
      setUsernameError('请输入用户名');
      return;
    }

    setSavingUsername(true);
    setUsernameError(null);
    setUsernameSaved(false);

    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update_username', username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      await refresh();
      setUsernameSaved(true);
      setTimeout(() => setUsernameSaved(false), 3000);
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !emailCode.trim()) {
      setEmailError('请填写新邮箱和验证码');
      return;
    }

    setSavingEmail(true);
    setEmailError(null);
    setEmailSaved(false);

    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update_email', email: newEmail.trim(), code: emailCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      await refresh();
      setNewEmail('');
      setEmailCode('');
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 3000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword) {
      setPasswordError('请填写当前密码和新密码');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码长度至少 6 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSaved(false);

    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update_password', currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingPassword(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const inputClass = `w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
    focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
    placeholder:text-[var(--muted-foreground)]`;

  const btnPrimary = `py-2 px-4 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-sm font-medium
    hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      className="max-w-lg mx-auto px-6 py-12"
    >
      <h1 className="text-2xl font-bold tracking-tight mb-8">账号设置</h1>

      {/* ── Username ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3">用户名</h2>
        <hr className="border-[var(--border)] mb-4" />
        <div className="space-y-3 max-w-sm">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
            placeholder="用户名"
            minLength={2}
            maxLength={50}
          />
          {usernameError && <p className="text-sm text-red-500">{usernameError}</p>}
          <button onClick={handleSaveUsername} disabled={savingUsername || username === user.username} className={btnPrimary}>
            {savingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : usernameSaved ? <><Check className="w-4 h-4" /> 已保存</> : '保存'}
          </button>
        </div>
      </section>

      {/* ── Email ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3">绑定邮箱</h2>
        <hr className="border-[var(--border)] mb-4" />
        <div className="space-y-3 max-w-sm">
          <p className="text-sm text-[var(--muted-foreground)]">
            当前邮箱：<span className="text-[var(--foreground)] font-medium">{user.email}</span>
          </p>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={inputClass}
            placeholder="新邮箱地址"
          />
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
              className={`flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                placeholder:text-[var(--muted-foreground)]`}
              placeholder="6位验证码"
            />
            <button
              type="button"
              onClick={handleSendEmailCode}
              disabled={sendingEmailCode || emailCooldown > 0 || !newEmail.trim()}
              className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium
                hover:bg-[var(--muted)] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {sendingEmailCode ? <Loader2 className="w-4 h-4 animate-spin" /> : emailCooldown > 0 ? `${emailCooldown}s` : '发送验证码'}
            </button>
          </div>
          {emailError && <p className="text-sm text-red-500">{emailError}</p>}
          <button onClick={handleSaveEmail} disabled={savingEmail || !newEmail.trim() || !emailCode.trim()} className={btnPrimary}>
            {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : emailSaved ? <><Check className="w-4 h-4" /> 已更新</> : '更新邮箱'}
          </button>
        </div>
      </section>

      {/* ── Password ── */}
      <section>
        <h2 className="text-sm font-semibold mb-3">修改密码</h2>
        <hr className="border-[var(--border)] mb-4" />
        <div className="space-y-3 max-w-sm">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            placeholder="当前密码"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            placeholder="新密码（至少6位）"
            minLength={6}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            placeholder="确认新密码"
          />
          {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
          <button onClick={handleSavePassword} disabled={savingPassword || !currentPassword || !newPassword} className={btnPrimary}>
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : passwordSaved ? <><Check className="w-4 h-4" /> 已更新</> : '修改密码'}
          </button>
        </div>
      </section>
    </motion.div>
  );
}
