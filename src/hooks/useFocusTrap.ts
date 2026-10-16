'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focus management for a modal dialog.
 *
 * # The defect this fixes
 *
 * Neither `Modal` nor `ConfirmModal` moved focus anywhere. `role="dialog"` and `aria-modal="true"`
 * tell a screen reader that a dialog is open, but the *browser* does nothing about it: focus stayed
 * on whatever was behind the overlay, and Tab walked straight out of the dialog into the page
 * underneath. Nothing in the repository had ever called `.focus()` or used `inert` — so this was not
 * one broken dialog, it was the absence of the whole mechanism.
 *
 * The two visible consequences, both WCAG 2.2 failures:
 *
 * - A keyboard user opening a dialog keeps tabbing through the page *behind* it, and can activate
 *   controls they cannot see (**2.4.3 Focus Order**, A; **2.1.2 No Keyboard Trap** is the mirror
 *   image — this is the "not trapped *in*" failure the dialog pattern depends on).
 * - A screen-reader user is left in the wrong context, with the dialog's content announced as if it
 *   were part of the page (**1.3.1 Info and Relationships**, A).
 *
 * # What it does
 *
 * 1. Moves focus into the dialog when it opens — the first focusable element, or an element marked
 *    `data-autofocus`, or the panel itself as a fallback.
 * 2. Keeps Tab and Shift+Tab cycling inside the dialog.
 * 3. Returns focus to whatever was focused before, so closing a dialog does not dump the user back
 *    at the top of the document.
 *
 * Restoring focus to the *previously focused element* rather than a caller-named target is
 * deliberate: it is correct for every dialog without any call site having to know about it.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Whether an element is actually rendered.
 *
 * `checkVisibility()` is the modern, honest answer and is used where present. The `offsetParent`
 * fallback is the older proxy for it; note that it reads as "hidden" for any `position: fixed`
 * element, and — relevant here — happy-dom reports it as null for everything, which would make the
 * focus trap find nothing and silently stop working. Preferring `checkVisibility()` avoids
 * depending on a layout engine the test environment does not have.
 */
function isRendered(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  return el.offsetParent !== null || el === document.activeElement;
}

function focusableWithin(panel: HTMLElement): HTMLElement[] {
  // Hidden controls — chiefly the `className="hidden"` file inputs in this app — must not be
  // tabbable, so they are filtered out rather than left in the cycle.
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isRendered);
}

/**
 * @param open   Whether the dialog is currently rendered.
 * @param panelRef The dialog surface itself. Must be the element carrying `role="dialog"`.
 */
export function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement | null>): void {
  /** Set to true while the trap is deliberately moving focus, so the focus listener stands down. */
  const movingFocus = useRef(false);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    // Remember where focus came from *before* we move it.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      const target = preferred ?? focusableWithin(panel)[0] ?? panel;
      movingFocus.current = true;
      target.focus();
      movingFocus.current = false;
    };

    focusFirst();

    const handleFocusIn = (event: FocusEvent) => {
      // A click on the backdrop, or a stray programmatic focus, can land outside the panel. Pull it
      // back rather than leaving the user stranded in the page behind the dialog.
      if (movingFocus.current) return;
      const target = event.target as Node | null;
      if (target && !panel.contains(target)) focusFirst();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const items = focusableWithin(panel);
      if (items.length === 0) {
        // Nothing focusable inside: hold focus on the panel rather than letting Tab escape.
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
      // Guard against the element having been unmounted while the dialog was open — focusing a
      // detached node silently does nothing, and `isConnected` says so honestly.
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [open, panelRef]);
}
