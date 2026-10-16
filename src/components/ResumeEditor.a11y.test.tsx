/**
 * Accessibility of the editor's section reordering — a defect that **was** unfixed, now fixed and
 * guarded here.
 *
 * # The defect (historical)
 *
 * Sections were reordered by dragging a grip icon. That grip was a plain `<div>` carrying only
 * `onPointerDown`, with no `tabIndex`, no `role`, no accessible name, and no key handler; the
 * `Reorder.Item` around it sets `dragListener={false}` so the grip was the *only* way to start a
 * drag. `framer-motion`'s `Reorder.Item` provides no keyboard fallback — its implementation
 * (`node_modules/framer-motion/dist/es/components/Reorder/Item.mjs`) wires up `drag`, `onDrag`,
 * `onDragEnd` and `onLayoutMeasure` and nothing else. Nothing in this repository added arrow-key
 * handling of its own.
 *
 * So a keyboard-only user could not reorder sections at all, and a screen-reader user was not told
 * the grip was interactive. That is WCAG 2.2 **2.1.1 Keyboard** (Level A) and **2.5.7 Dragging
 * Movements** (Level AA) — the latter exists precisely because pointer-drag-only interactions are
 * the canonical failure it was written for.
 *
 * # The fix
 *
 * The grip is now focusable, named, and answers Arrow/Home/End; and each card carries explicit
 * 「上移」/「下移」 buttons whose accessible names include the section title and its position. Moves
 * are announced through a polite live region, because reordering is a purely visual change — the
 * text is identical, only its position moves — so without an announcement a screen-reader user
 * gets no feedback that the key did anything. `ResumeEditor.moveSection` holds the reasoning.
 *
 * # Why these were `it.fails`, and are not any more
 *
 * Per AGENTS.md, a confirmed-but-unfixed defect is carried by `it.fails`: the case runs, must fail
 * today, and keeps the suite green. That gave the defect a **runnable reproduction** instead of a
 * paragraph in a ticket, and when the fix landed these cases turned red — which is exactly the
 * prompt to convert them back to `it`. That is what happened; they are ordinary cases now.
 *
 * # What is and is not proven here
 *
 * The presence assertions run against `renderToStaticMarkup`. The *behavioural* case at the end
 * mounts the real editor in happy-dom and clicks a move button, because "the button exists and is
 * named" is satisfied by a button that does nothing — the earlier version of this file would have
 * gone green on exactly that. The drag path itself is **not** simulated: happy-dom has no layout, so
 * a meaningful drag test is not possible here, and `framer-motion`'s own `Reorder` handling is the
 * dependency's responsibility rather than ours.
 *
 * This file needs DOM for that last case, so it declares the `happy-dom` environment. The static
 * markup cases are unaffected — happy-dom is a superset of the default `node` environment.
 */
// @vitest-environment happy-dom

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeEditor } from '@/components/ResumeEditor';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import { metadataValuesFromRecord } from '@/lib/resume-metadata';
import type { ResumeRecord } from '@/lib/types';

const DOCUMENT = [
  '## 工作经历',
  '',
  '### 某某科技',
  '',
  '- 做了什么',
  '',
  '## 教育背景',
  '',
  '### 某某大学',
  '',
  '- 读了什么',
  '',
].join('\n');

function renderEditor(): string {
  return renderToStaticMarkup(
    createElement(ResumeEditor, {
      resume: { title: '我的简历', presentation: null } as unknown as ResumeRecord,
      parsed: parseResumeMarkdown(DOCUMENT),
      onSave: async () => {},
      onCancel: () => {},
    })
  );
}

describe('编辑器模块排序的可访问性', () => {
  it('renders both sections, so the fixture is meaningful', () => {
    const html = renderEditor();

    // A guard on the fixture: if the editor stopped rendering sections, the two cases below
    // would pass vacuously — there would be no grip and no controls to find.
    expect(html).toContain('工作经历');
    expect(html).toContain('教育背景');
  });

  it('gives the drag handle a focusable, named, keyboard-operable control', () => {
    const html = renderEditor();

    // A grip that a keyboard can reach and that announces itself: a `tabindex`, a role or an
    // accessible name, and something to key on.
    const grippable =
      /tabindex="0"[^>]*aria-label=/.test(html) ||
      /aria-label=[^>]*tabindex="0"/.test(html) ||
      /role="button"/.test(html);

    expect(grippable).toBe(true);
  });

  it('offers a non-drag way to change section order', () => {
    const html = renderEditor();

    // The alternative to dragging: explicit move controls whose accessible names say what they do.
    const hasMoveAffordance = /上移|下移|前移|后移|调整顺序|move up|move down/i.test(html);

    expect(hasMoveAffordance).toBe(true);
  });

  it('announces a move, since reordering is invisible to a screen reader', () => {
    // The text of a section is identical before and after a move; only its position changes.
    // Without a live region there is no feedback that the control did anything at all.
    const html = renderEditor();

    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
  });

  it('pins the underlying cause: framer-motion Reorder.Item has no keyboard support of its own', () => {
    // Read the dependency's own implementation rather than trusting its documentation. This is why
    // the editor had to build keyboard reordering itself instead of configuring a prop, and it is
    // the thing to re-check before assuming a future version makes the controls above redundant.
    const source = readFileSync(
      join(process.cwd(), 'node_modules/framer-motion/dist/es/components/Reorder/Item.mjs'),
      'utf8'
    );

    expect(source).not.toMatch(/onKeyDown|tabIndex/);
  });

  /*
   * The behavioural case. Everything above passes for a button that is correctly named and does
   * nothing at all, so this one actually clicks it and checks the order changed.
   *
   * The observable order signal is the `（第 N / M 项）` suffix carried in each control's accessible
   * name — it is rendered from the section's index, so it tracks the real array order rather than
   * merely reflecting the DOM layout that a re-render would produce anyway.
   */
  describe('点击移动按钮真的会改变顺序', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    afterEach(() => {
      act(() => root?.unmount());
      container?.remove();
      container = null;
      root = null;
    });

    function mountEditor(): HTMLDivElement {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root!.render(
          createElement(ResumeEditor, {
            resume: { title: '我的简历', presentation: null } as unknown as ResumeRecord,
            parsed: parseResumeMarkdown(DOCUMENT),
            onSave: async () => {},
            onCancel: () => {},
          })
        );
      });
      return container;
    }

    /** Accessible names of the move controls, in document order. */
    function moveLabels(el: HTMLElement): string[] {
      return Array.from(el.querySelectorAll('[aria-label*="移「"]')).map(
        (n) => n.getAttribute('aria-label') ?? ''
      );
    }

    function clickButtonLabelled(el: HTMLElement, label: string) {
      const btn = Array.from(el.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === label
      );
      expect(btn, `no button labelled ${label}`).toBeDefined();
      act(() => {
        btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    it('moves the first section down one position', () => {
      const el = mountEditor();

      // Precondition: 工作经历 is first, 教育背景 is second.
      expect(moveLabels(el)[0]).toContain('工作经历');
      expect(moveLabels(el)[0]).toContain('第 1 / 2 项');
      expect(moveLabels(el)[2]).toContain('教育背景');
      expect(moveLabels(el)[2]).toContain('第 2 / 2 项');

      clickButtonLabelled(el, '下移「工作经历」（第 1 / 2 项）');

      // The two sections have swapped: 教育背景 is now first and reports position 1.
      expect(moveLabels(el)[0]).toContain('教育背景');
      expect(moveLabels(el)[0]).toContain('第 1 / 2 项');
      expect(moveLabels(el)[2]).toContain('工作经历');
      expect(moveLabels(el)[2]).toContain('第 2 / 2 项');
    });

    it('announces where the section landed', () => {
      const el = mountEditor();

      // Empty before any move, so nothing is read out on mount.
      const live = () => el.querySelector('[role="status"]')?.textContent ?? '';
      expect(live()).toBe('');

      clickButtonLabelled(el, '下移「工作经历」（第 1 / 2 项）');

      expect(live()).toContain('工作经历');
      expect(live()).toContain('第 2 位');
    });

    it('disables the control that would move past the end', () => {
      const el = mountEditor();

      const find = (label: string) =>
        Array.from(el.querySelectorAll('button')).find(
          (b) => b.getAttribute('aria-label') === label
        );

      // The first section cannot move up; the second cannot move down. Disabled rather than
      // silently no-op, so the boundary is discoverable.
      expect(find('上移「工作经历」（第 1 / 2 项）')?.hasAttribute('disabled')).toBe(true);
      expect(find('下移「工作经历」（第 1 / 2 项）')?.hasAttribute('disabled')).toBe(false);
      expect(find('下移「教育背景」（第 2 / 2 项）')?.hasAttribute('disabled')).toBe(true);
      expect(find('上移「教育背景」（第 2 / 2 项）')?.hasAttribute('disabled')).toBe(false);
    });
  });
});

describe('创建草稿的基本信息', () => {
  it('lets the form edit metadata before a resume id exists', () => {
    // The create flow has no PATCH target. Gating the panel on `onSaveMetadata`
    // used to render "基本信息需要先保存简历后才能编辑" over an empty preview —
    // the form itself was unreachable, so the user could not fill the values the
    // preview reads. `onMetadataChange` is the edit contract; save is optional.
    const html = renderToStaticMarkup(
      createElement(ResumeEditor, {
        parsed: parseResumeMarkdown(DOCUMENT),
        onSave: async () => {},
        onCancel: () => {},
        metadataValues: metadataValuesFromRecord({ name: '李四', job_title: '后端工程师' }),
        onMetadataChange: () => {},
      })
    );

    expect(html).toContain('基本信息');
    expect(html).not.toContain('基本信息需要先保存简历后才能编辑');
    expect(html).not.toContain('填写后会出现在预览中');
    expect(html).toContain('李四');
    expect(html).toContain('后端工程师');
    expect(html).not.toContain('保存基本信息');
  });
});
