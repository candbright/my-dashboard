'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Settings, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { Button, Spinner, Avatar, Divider } from '@/components/ui';
import { cn } from '@/lib/cn';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, isAdmin, isAuthenticated } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hide on resume display pages
  if (pathname.startsWith('/resume/')) return null;

  const navItems = [
    { href: '/', label: '首页', show: true },
    { href: '/my', label: '我的', show: isAuthenticated },
    { href: '/upload', label: '创建', show: isAuthenticated },
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
      className="sticky top-0 z-50 glass border-b border-default-200"
    >
      <nav className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <span className="text-white text-sm font-bold">R</span>
          </div>
          <span>
            Resume<span className="gradient-text">Vault</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const isActive =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'text-primary bg-primary/10'
                      : 'text-default-500 hover:text-foreground hover:bg-default-100'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

          <Divider orientation="vertical" className="h-6 mx-2" />

          {/* Auth section */}
          {loading ? (
            <Spinner size="sm" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-default-100 transition-colors"
              >
                <Avatar name={user?.username} size="sm" />
                <span className="text-sm font-medium text-default-600 max-w-[100px] truncate">
                  {user?.username}
                </span>
              </Link>
              <Button
                variant="light"
                isIconOnly
                size="sm"
                onClick={() => router.push('/settings')}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="light"
                isIconOnly
                size="sm"
                onClick={handleLogout}
                disabled={loggingOut}
                isLoading={loggingOut}
              >
                {!loggingOut && <LogOut className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="light"
                size="sm"
                onClick={() => router.push('/login')}
                startContent={<LogIn className="w-4 h-4" />}
              >
                登录
              </Button>
              <Button
                variant="solid"
                color="primary"
                size="sm"
                radius="full"
                onClick={() => router.push('/register')}
              >
                注册
              </Button>
            </div>
          )}
        </div>

        {/* Mobile menu toggle */}
        <Button
          variant="light"
          isIconOnly
          size="sm"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden border-t border-default-200 bg-content1"
        >
          <div className="px-6 py-4 space-y-1">
            {navItems
              .filter((item) => item.show)
              .map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-default-500 hover:text-foreground hover:bg-default-100'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}

            <Divider className="my-2" />

            {loading ? (
              <div className="py-2 flex justify-center">
                <Spinner size="sm" />
              </div>
            ) : isAuthenticated ? (
              <div className="space-y-1">
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm hover:bg-default-100 transition-colors"
                >
                  <Avatar name={user?.username} size="sm" />
                  <span className="font-medium">{user?.username}</span>
                </Link>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-danger hover:bg-danger/10 transition-colors w-full"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            ) : (
              <div className="flex gap-2 px-4 py-2">
                <Button
                  variant="bordered"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setMobileOpen(false);
                    router.push('/login');
                  }}
                >
                  登录
                </Button>
                <Button
                  variant="solid"
                  color="primary"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setMobileOpen(false);
                    router.push('/register');
                  }}
                >
                  注册
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
