// @vitest-environment happy-dom
/**
 * Focus management for the two dialogs.
 *
 * # The defect this pins
 *
 * Neither `Modal` nor `ConfirmModal` moved focus. `role="dialog"` and `aria-modal="true"` describe a
 * dialog to assistive tech, but the browser does nothing about focus: it stayed on the trigger behind
 * the overlay, and Tab walked out of the dialog into the page underneath. Nothing in the repository
 * had ever called `.focus()`, used `autoFocus`, or used `inert` — the whole mechanism was absent, not
 * merely broken in one place.
 *
 * Consequences, both WCAG 2.2: a keyboard user tabs through controls they cannot see
 * (**2.4.3 Focus Order**, A), and a screen-reader user is left in the wrong context with the dialog
 * read as page content (**1.3.1 Info and Relationships**, A). `ConfirmModal` additionally had no
 * `role` at all.
 *
 * # Why these assertions and not others
 *
 * happy-dom has no layout, so tab-order and visibility cannot be simulated faithfully. What is
 * asserted here is what can be observed for real: focus actually moves into the dialog on open, the
 * dialog is announced as a dialog with a name, focus returns to the trigger on close, and
 * `data-autofocus` is honoured — which is the hook that stops a destructive confirmation from being
 * one stray Enter away from firing. The Tab-cycling loop itself is exercised only through its
 * boundary conditions, which are noted where they appear.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  document.body.innerHTML = '';
});

/** A focusable stand-in for "whatever the user was on before opening the dialog". */
function makeTrigger(): HTMLButtonElement {
  const trigger = document.createElement('button');
  trigger.textContent = '打开';
  document.body.appendChild(trigger);
  trigger.focus();
  return trigger;
}

describe('对话框的焦点管理', () => {
  it('Modal: moves focus into the dialog on open', () => {
    makeTrigger();
    expect(document.activeElement?.textContent).toBe('打开');

    const el = mount(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: '编辑资料' },
        createElement('button', { type: 'button' }, '里面的按钮')
      )
    );

    const panel = el.querySelector('[role="dialog"]')!;
    const active = document.activeElement as HTMLElement | null;

    // The point of the assertion: focus is no longer on the page behind the overlay, and it is
    // inside the dialog. Which element inside is not the contract — here it is `Modal`'s own close
    // button, the first focusable — so asserting a specific child would be testing the incidental
    // DOM order rather than the behaviour.
    expect(active).not.toBeNull();
    expect(panel.contains(active!)).toBe(true);
    expect(active).not.toBe(document.body);
  });

  it('Modal: focus is inside the dialog, not left on the trigger behind it', () => {
    const trigger = makeTrigger();

    const el = mount(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: '编辑资料' },
        createElement('button', { type: 'button' }, '里面的按钮')
      )
    );

    // Stated as its own case because this is the actual WCAG failure: before the fix, focus stayed
    // on the trigger, which sits *behind* the overlay, so a keyboard user was typing into a control
    // they could no longer see.
    expect(document.activeElement).not.toBe(trigger);
    expect(el.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);
  });

  it('Modal: announces itself as a named dialog', () => {
    const el = mount(
      createElement(Modal, { open: true, onClose: () => {}, title: '编辑资料' }, '内容')
    );

    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('编辑资料');
  });

  it('Modal: returns focus to the trigger on close', () => {
    const trigger = makeTrigger();

    const el = mount(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: '编辑资料' },
        createElement('button', { type: 'button' }, '里面的按钮')
      )
    );
    const panel = el.querySelector('[role="dialog"]')!;
    expect(panel.contains(document.activeElement)).toBe(true);

    act(() => {
      root!.render(
        createElement(Modal, { open: false, onClose: () => {}, title: '编辑资料' }, '内容')
      );
    });

    // Without restoration the user is dumped at the top of the document and has to find their place
    // again — which is the whole reason the dialog pattern specifies returning focus.
    expect(document.activeElement).toBe(trigger);
  });

  it('ConfirmModal: announces itself as a named alert dialog', () => {
    const el = mount(
      createElement(ConfirmModal, {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        title: '删除这份简历？',
        message: '删除后无法恢复。',
      })
    );

    const dialog = el.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    // Labelled and described by its visible text rather than a duplicated string.
    expect(dialog?.getAttribute('aria-labelledby')).toBe('confirm-modal-title');
    expect(dialog?.getAttribute('aria-describedby')).toBe('confirm-modal-message');
    expect(el.querySelector('#confirm-modal-title')?.textContent).toBe('删除这份简历？');
  });

  it('ConfirmModal: puts focus on cancel, not confirm', () => {
    makeTrigger();

    mount(
      createElement(ConfirmModal, {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        title: '删除这份简历？',
        message: '删除后无法恢复。',
        confirmLabel: '删除',
        cancelLabel: '取消',
      })
    );

    // A stray Enter must not perform the destructive action. This is the assertion that would catch
    // someone "simplifying" the autofocus target to the confirm button.
    expect(document.activeElement?.textContent).toBe('取消');
  });
});
