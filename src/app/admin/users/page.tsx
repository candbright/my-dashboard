'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, grantPermission, revokePermission } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Button, Card, Chip, Spinner, Switch, ConfirmModal, useToast, ToastContainer } from '@/components/ui';

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatar: string | null;
  /**
   * Whether the account holds the `use_global` AI permission.
   *
   * The field is named `aiEnabled` for continuity with the payload the API has
   * always sent, but it is derived from the permission grant, not stored on the
   * user row: an approval and a direct toggle write the same record.
   */
  aiEnabled: boolean;
  createdAt: string;
}

/**
 * Render a timestamp defensively.
 *
 * The payload is camelCase, and reading the wrong field name yields
 * `undefined`; `new Date(undefined)` is an Invalid Date, and date-fns throws
 * "Invalid time value" from inside render, which Next's error boundary turns
 * into "This page couldn't load". A dash keeps a payload mismatch visible
 * without destroying the page.
 */
function relativeTime(value: string): string {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return formatDistanceToNow(parsed, { addSuffix: true, locale: zhCN });
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

  /**
   * Switch a user's global-API permission.
   *
   * Goes through the permission endpoints rather than a bespoke `ai_enabled`
   * flag. The flag used to be the only record of the permission, so a grant made
   * here and one made by approving an application were different things, and
   * revoking here left the approval record claiming the permission still held.
   * Now there is one record, and this is just a direct way to write it.
   */
  const handleGlobalAPIToggle = async (userId: string, enabled: boolean) => {
    setUpdatingAI(userId);
    try {
      const params = { userId, resourceType: 'ai', permission: 'use_global' };
      if (enabled) {
        await grantPermission(params);
      } else {
        await revokePermission(params);
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, aiEnabled: enabled } : u))
      );
      addToast('success', enabled ? '已授予全局 API 使用权限' : '已撤销全局 API 使用权限');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '操作失败');
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
              <th className="px-4 py-2.5">全局 API</th>
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
                    <Switch
                      checked={u.aiEnabled}
                      onChange={(next) => handleGlobalAPIToggle(u.id, next)}
                      disabled={updatingAI === u.id}
                      label={u.aiEnabled ? `撤销 ${u.username} 的全局 API 权限` : `授予 ${u.username} 全局 API 权限`}
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-default-500">
                  {relativeTime(u.createdAt)}
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
