'use client';

/**
 * In-app leave confirmation for an unsaved 草稿.
 *
 * `beforeunload` only covers closing the tab. Navbar `<Link>` clicks are SPA
 * navigations and never fire it (the audit's D2). Next.js 16 has no App Router
 * `useBlocker`; `Link.onNavigate` + `preventDefault` is the supported way to
 * stop those clicks, and this context is the one place that owns the prompt.
 *
 * The prompt is `ConfirmModal`, not `window.confirm`: the rest of the product
 * already uses that dialog for destructive choices, and a native confirm would
 * be the one screen that ignored the design system.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

export type LeaveIntent =
  | { kind: 'href'; href: string }
  | { kind: 'run'; run: () => void };

interface LeaveGuardContextValue {
  /**
   * Queue a leave and return true when the guard intercepted it.
   * Callers that received true must not navigate themselves.
   */
  intercept: (intent: LeaveIntent) => boolean;
  setBlocked: (blocked: boolean) => void;
}

const LeaveGuardContext = createContext<LeaveGuardContextValue | null>(null);

function hrefOf(href: ComponentProps<typeof Link>['href']): string {
  if (typeof href === 'string') return href;
  return href.pathname ?? '';
}

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [blocked, setBlockedState] = useState(false);
  const blockedRef = useRef(false);
  const [intent, setIntent] = useState<LeaveIntent | null>(null);

  const setBlocked = useCallback((next: boolean) => {
    blockedRef.current = next;
    setBlockedState(next);
    if (!next) setIntent(null);
  }, []);

  const intercept = useCallback((next: LeaveIntent) => {
    if (!blockedRef.current) return false;
    if (next.kind === 'href') {
      const here = typeof window !== 'undefined' ? window.location.pathname : '';
      if (next.href === here) return false;
    }
    setIntent(next);
    return true;
  }, []);

  const execute = useCallback((next: LeaveIntent) => {
    blockedRef.current = false;
    setBlockedState(false);
    setIntent(null);
    if (next.kind === 'href') {
      router.push(next.href);
    } else {
      next.run();
    }
  }, [router]);

  useEffect(() => {
    if (!blocked) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [blocked]);

  const value = useMemo(
    () => ({ setBlocked, intercept }),
    [setBlocked, intercept]
  );

  return (
    <LeaveGuardContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={intent !== null}
        onClose={() => setIntent(null)}
        onConfirm={() => {
          if (intent) execute(intent);
        }}
        title="当前内容未保存"
        message="这份草稿还没有保存到平台，离开后无法恢复。确定要离开吗？"
        confirmLabel="离开"
        cancelLabel="继续编辑"
        danger
      />
    </LeaveGuardContext.Provider>
  );
}

/**
 * Optional on purpose: the create wizard's tests mount the page without the
 * provider, and a missing guard must not throw — it must simply not block.
 */
export function useLeaveGuard(): LeaveGuardContextValue | null {
  return useContext(LeaveGuardContext);
}

/**
 * A `Link` that asks before leaving a blocked page.
 *
 * `onNavigate` runs only when the guard lets the navigation through, so a
 * mobile menu can close on a real leave and stay open when the prompt appears.
 */
export function GuardedLink({
  href,
  onNavigate,
  ...props
}: ComponentProps<typeof Link>) {
  const guard = useLeaveGuard();

  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        const target = hrefOf(href);
        if (target && guard?.intercept({ kind: 'href', href: target })) {
          event.preventDefault();
          return;
        }
        onNavigate?.(event);
      }}
    />
  );
}
