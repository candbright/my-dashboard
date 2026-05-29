'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { Button, Input, Card, Divider } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';

export default function SettingsAccountPage() {
  const { user, refresh } = useAuth();

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
  const [emailCooldown, startEmailCooldown] = useCountdown();

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

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

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <h1 className="text-2xl font-bold tracking-tight mb-6">账号设置</h1>
      <Divider className="mb-6" />
      {/* ── Username ── */}
      <Card variant="bordered" className="p-6 mb-6">
        <h2 className="text-sm font-semibold mb-1">用户名</h2>
        <Divider className="my-3" />
        <div className="space-y-3 max-w-sm">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            variant="bordered"
            errorMessage={usernameError ?? undefined}
          />
          <Button
            color="primary"
            onClick={handleSaveUsername}
            isLoading={savingUsername}
            isDisabled={username === user.username}
            startContent={usernameSaved ? <Check className="w-4 h-4" /> : undefined}
          >
            {usernameSaved ? '已保存' : '保存'}
          </Button>
        </div>
      </Card>

      {/* ── Email ── */}
      <Card variant="bordered" className="p-6 mb-6">
        <h2 className="text-sm font-semibold mb-1">绑定邮箱</h2>
        <Divider className="my-3" />
        <div className="space-y-3 max-w-sm">
          <p className="text-sm text-default-500">
            当前邮箱：<span className="text-foreground font-medium">{user.email}</span>
          </p>
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="新邮箱地址"
            variant="bordered"
          />
          <div className="flex gap-2">
            <Input
              type="text"
              maxLength={6}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6位验证码"
              variant="bordered"
              className="flex-1"
            />
            <Button
              variant="bordered"
              onClick={handleSendEmailCode}
              isLoading={sendingEmailCode}
              isDisabled={emailCooldown > 0 || !newEmail.trim()}
              className="shrink-0"
            >
              {emailCooldown > 0 ? `${emailCooldown}s` : '发送验证码'}
            </Button>
          </div>
          {emailError && <p className="text-sm text-danger">{emailError}</p>}
          <Button
            color="primary"
            onClick={handleSaveEmail}
            isLoading={savingEmail}
            isDisabled={!newEmail.trim() || !emailCode.trim()}
            startContent={emailSaved ? <Check className="w-4 h-4" /> : undefined}
          >
            {emailSaved ? '已更新' : '更新邮箱'}
          </Button>
        </div>
      </Card>

      {/* ── Password ── */}
      <Card variant="bordered" className="p-6">
        <h2 className="text-sm font-semibold mb-1">修改密码</h2>
        <Divider className="my-3" />
        <div className="space-y-3 max-w-sm">
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="当前密码"
            variant="bordered"
          />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="新密码（至少6位）"
            variant="bordered"
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="确认新密码"
            variant="bordered"
          />
          {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
          <Button
            color="primary"
            onClick={handleSavePassword}
            isLoading={savingPassword}
            isDisabled={!currentPassword || !newPassword}
            startContent={passwordSaved ? <Check className="w-4 h-4" /> : undefined}
          >
            {passwordSaved ? '已更新' : '修改密码'}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
