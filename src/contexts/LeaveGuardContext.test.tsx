/**
 * The leave guard for an unsaved 草稿 (in-app navigation, not tab close).
 *
 * `beforeunload` is a browser API this environment cannot usefully assert.
 * What is pinned here is the part we own: intercepting a SPA navigation,
 * showing the confirm dialog, staying put on cancel, and leaving on confirm.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const { LeaveGuardProvider, useLeaveGuard } = await import('@/contexts/LeaveGuardContext');

function Probe({ blocked, children }: { blocked: boolean; children?: ReactNode }) {
  const guard = useLeaveGuard();
  const setBlocked = guard?.setBlocked;
  useEffect(() => {
    setBlocked?.(blocked);
  }, [blocked, setBlocked]);
  return createElement(
    'button',
    {
      type: 'button',
      onClick: () => {
        if (!guard?.intercept({ kind: 'href', href: '/my' })) push('/my');
      },
    },
    children ?? '去我的'
  );
}

describe('离开未保存草稿的确认', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    push.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    MotionGlobalConfig.skipAnimations = false;
  });

  function mount(blocked: boolean): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(LeaveGuardProvider, {
          children: createElement(Probe, { blocked }),
        })
      );
    });
    return container;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  function click(el: Element): void {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    const btn = Array.from(el.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === text
    );
    expect(btn, `no button labelled ${text}`).toBeDefined();
    return btn as HTMLButtonElement;
  }

  it('does not prompt when nothing is blocked', async () => {
    const el = mount(false);
    await settle();
    click(buttonByText(el, '去我的'));
    expect(el.textContent).not.toContain('当前内容未保存');
    expect(push).toHaveBeenCalledWith('/my');
  });

  it('prompts and stays when the user cancels', async () => {
    const el = mount(true);
    await settle();
    click(buttonByText(el, '去我的'));
    await settle();

    expect(el.textContent).toContain('当前内容未保存');
    expect(el.textContent).toContain('这份草稿还没有保存到平台');

    click(buttonByText(el, '继续编辑'));
    await settle();

    expect(push).not.toHaveBeenCalled();
  });

  it('leaves on confirm after intercepting the navigation', async () => {
    const el = mount(true);
    await settle();
    click(buttonByText(el, '去我的'));
    await settle();

    click(buttonByText(el, '离开'));
    await settle();

    expect(push).toHaveBeenCalledWith('/my');
  });
});
