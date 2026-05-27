'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatar: string | null;
  created_at: string;
}

export default function UsersPage() {
  const { user: currentUser, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/');
      return;
    }

    if (!authLoading && isAdmin) {
      apiFetch('/api/admin/users')
        .then((r) => r.json())
        .then((data) => setUsers(data.users || []))
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [authLoading, isAdmin, router]);

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
    if (userId === currentUser?.id) return;
    if (!confirm(newRole === 'admin' ? '设为管理员？' : '降为普通用户？')) return;

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
      }
    } catch {
      // silent
    } finally {
      setUpdating(null);
    }
  };

  if (authLoading || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <h1 className="text-2xl font-bold tracking-tight mb-1">用户管理</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-8">{users.length} 位用户</p>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="px-4 py-2.5">用户</th>
              <th className="px-4 py-2.5">邮箱</th>
              <th className="px-4 py-2.5">角色</th>
              <th className="px-4 py-2.5">注册时间</th>
              <th className="px-4 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--muted)] transition-colors">
                <td className="px-4 py-3">
                  <span className="font-medium">{u.username}</span>
                  {u.id === currentUser?.id && (
                    <span className="ml-1.5 text-[10px] text-[var(--accent)]">你</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={u.role === 'admin' ? 'text-amber-500' : 'text-[var(--muted-foreground)]'}>
                    {u.role === 'admin' ? '管理员' : '用户'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">
                  {formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: zhCN })}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin')}
                      disabled={updating === u.id}
                      className="px-2 py-1 rounded text-xs border border-[var(--border)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
                    >
                      {updating === u.id ? '...' : u.role === 'admin' ? '降为用户' : '设为管理员'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
