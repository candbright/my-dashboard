'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Loader2, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, isAdmin, isAuthenticated } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const isResumePage = pathname.startsWith('/resume/');
  if (isResumePage) return null;

  const navItems = [
    { href: '/', label: '首页', show: true },
    { href: '/my', label: '我的', show: isAuthenticated },
    { href: '/upload', label: '上传', show: isAuthenticated },
    { href: '/admin', label: '管理', show: isAdmin },
  ];

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push('/');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
      className="sticky top-0 z-50 glass"
    >
      <nav className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          Resume<span className="gradient-text">Vault</span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {navItems.filter((item) => item.show).map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative py-1 transition-colors ${isActive ? 'text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
              >
                {item.label}
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}

          <span className="text-[var(--border)]">|</span>

          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                href="/settings"
                className="text-[var(--muted-foreground)] max-w-[100px] truncate hover:text-[var(--foreground)] transition-colors"
              >
                {user?.username}
              </Link>
              <Link
                href="/settings"
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
            >
              <LogIn className="w-4 h-4" />
              登录
            </Link>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
