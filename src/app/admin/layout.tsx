'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const sidebarItems = [
  { href: '/admin/approvals', label: '审核管理' },
  { href: '/admin/users', label: '用户管理' },
  { href: '/admin/settings', label: 'AI 设置' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (!isAdmin) {
    router.replace('/');
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex gap-8">
      {/* Sidebar */}
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
        className="w-44 shrink-0"
      >
        <h2 className="text-sm font-semibold text-[var(--muted-foreground)] mb-3 px-3">管理后台</h2>
        <nav className="space-y-0.5">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'text-[var(--foreground)] font-medium bg-[var(--muted)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </motion.aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
