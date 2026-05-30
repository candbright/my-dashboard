'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Button, Card, Chip, Spinner, ConfirmModal, useToast, ToastContainer } from '@/components/ui';

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatar: string | null;
  ai_enabled: boolean;
  created_at: string;
}

export default function UsersPage() {
  const { user: currentUser, isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [updatingAI, setUpdatingAI] = useState<string | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ userId: string; newRole: 'admin' | 'user' } | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    if (!authLoading && isAdmin) {
      apiFetch('/api/admin/users')
        .then((r) => r.json())
        .then((data) => setUsers(data.users || []))
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [authLoading, isAdmin]);

  const handleRoleChange = (userId: string, newRole: 'admin' | 'user') => {
    if (userId === currentUser?.id) return;
    setRoleChangeTarget({ userId, newRole });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeTarget) return;
    const { userId, newRole } = roleChangeTarget;
    setRoleChangeTarget(null);

    setUpdating(userId);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'PUT',
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: data.user.role } : u))
        );
        addToast('success', newRole === 'admin' ? '已设为管理员' : '已降为普通用户');
      } else {
        addToast('error', '操作失败');
      }
    } catch {
      addToast('error', '网络错误');
    } finally {
      setUpdating(null);
    }
  };

  const handleAIToggle = async (userId: string, enabled: boolean) => {
    setUpdatingAI(userId);
    try {
      const res = await apiFetch('/api/admin/users/ai', {
        method: 'PUT',
        body: JSON.stringify({ userId, aiEnabled: enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ai_enabled: data.user.ai_enabled } : u))
        );
      }
    } catch {
      // silent
    } finally {
      setUpdatingAI(null);
    }
  };

  if (authLoading || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="md" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <h1 className="text-2xl font-bold tracking-tight mb-1">用户管理</h1>
      <p className="text-sm text-default-500 mb-8">{users.length} 位用户</p>

      <Card variant="bordered" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default-200 text-left text-xs text-default-500">
              <th className="px-4 py-2.5">用户</th>
              <th className="px-4 py-2.5">邮箱</th>
              <th className="px-4 py-2.5">角色</th>
              <th className="px-4 py-2.5">AI</th>
              <th className="px-4 py-2.5">注册时间</th>
              <th className="px-4 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-200">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-default-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-medium">{u.username}</span>
                  {u.id === currentUser?.id && (
                    <Chip size="sm" color="primary" variant="flat" className="ml-1.5 scale-75 origin-left">你</Chip>
                  )}
                </td>
                <td className="px-4 py-3 text-default-500">{u.email}</td>
                <td className="px-4 py-3">
                  <Chip
                    size="sm"
                    color={u.role === 'admin' ? 'warning' : 'default'}
                    variant="flat"
                  >
                    {u.role === 'admin' ? '管理员' : '用户'}
                  </Chip>
                </td>
                <td className="px-4 py-3">
                  {u.role === 'admin' ? (
                    <Chip size="sm" color="success" variant="flat">始终开启</Chip>
                  ) : (
                    <button
                      onClick={() => handleAIToggle(u.id, !u.ai_enabled)}
                      disabled={updatingAI === u.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        u.ai_enabled ? 'bg-success' : 'bg-default-200'
                      } ${updatingAI === u.id ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          u.ai_enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-default-500">
                  {formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: zhCN })}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    <Button
                      variant="bordered"
                      size="sm"
                      onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin')}
                      isLoading={updating === u.id}
                    >
                      {u.role === 'admin' ? '降为用户' : '设为管理员'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </motion.div>
    <ConfirmModal
      open={roleChangeTarget !== null}
      onClose={() => setRoleChangeTarget(null)}
      onConfirm={confirmRoleChange}
      title={roleChangeTarget?.newRole === 'admin' ? '设为管理员' : '降为普通用户'}
      message={roleChangeTarget?.newRole === 'admin' ? '确定要将此用户设为管理员吗？' : '确定要将此管理员降为普通用户吗？'}
      confirmLabel="确认"
      cancelLabel="取消"
      loading={updating === roleChangeTarget?.userId}
    />
    <ToastContainer toasts={toasts} removeToast={removeToast} />
  </>);
}
