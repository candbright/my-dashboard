'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { AuthGuard } from '@/components/layout';

const sidebarItems = [
  { href: '/settings', label: '账号设置' },
  { href: '/settings/ai', label: 'AI-API 设置' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-6 py-10 flex gap-8">
        {/* Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
          className="w-44 shrink-0"
        >
          <h2 className="text-sm font-semibold text-default-500 mb-3 px-3">设置</h2>
          <nav className="space-y-0.5">
            {sidebarItems.map((item) => {
              const isActive = item.href === '/settings'
                ? pathname === '/settings'
                : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative block px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'text-foreground font-medium bg-default-100'
                      : 'text-default-500 hover:text-foreground hover:bg-default-100/50'
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
    </AuthGuard>
  );
}
