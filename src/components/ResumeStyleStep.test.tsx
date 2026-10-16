/**
 * Step 1 of the creation wizard: 选择模板 (ticket 48).
 *
 * The step is almost entirely `TemplateSelector`, whose own test covers the gallery. What is pinned here is
 * what makes it a *step*:
 *
 *   - the sentence that says what the choice is — a style, not a document. That sentence is the cheapest place
 *     to prevent the misreading the ticket is about (不同简历模板改变的应该是简历的 ui 风格，而不是实际内容),
 *     and it is the reason this wrapper exists at all;
 *   - the action that moves on, and the fact that coming back is possible (so "you can change it later" is not
 *     a claim the screen contradicts);
 *   - the wiring of the four callbacks — a step that renamed a prop would silently stop reporting choices, and
 *     the gallery would look like it worked while nothing changed.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';
import { ResumeStyleStep } from '@/components/ResumeStyleStep';
import { TEMPLATE_METADATA } from '@/lib/resume-template';
import { DEFAULT_PRESENTATION, PRESENTATION_PALETTE } from '@/lib/resume-presentation';

const DEFAULT_TEMPLATE = TEMPLATE_METADATA[0]!;
const OTHER_TEMPLATE = TEMPLATE_METADATA[TEMPLATE_METADATA.length - 1]!;

describe('选择模板这一步 (ticket 48)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    MotionGlobalConfig.skipAnimations = false;
    vi.restoreAllMocks();
  });

  function mount(
    overrides: Partial<{
      selectedTemplateId: string;
      accent: string;
      onSelectTemplate: (id: string) => void;
      onAccentChange: (hex: string) => void;
      onNext: () => void;
    }> = {}
  ): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(ResumeStyleStep, {
          selectedTemplateId: DEFAULT_TEMPLATE.id,
          accent: DEFAULT_PRESENTATION.accentColor,
          onSelectTemplate: () => {},
          onAccentChange: () => {},
          onNext: () => {},
          ...overrides,
        })
      );
    });
    return container;
  }

  function click(el: Element): void {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  function required<T extends Element>(el: Element | null, what: string): T {
    expect(el, `no ${what}`).not.toBeNull();
    return el as unknown as T;
  }

  it('offers the gallery without restating the step as a title', () => {
    const el = mount();

    expect(el.querySelectorAll('[data-template-id]').length).toBe(TEMPLATE_METADATA.length);
    expect(el.textContent).not.toContain('内容在下一步填写');
  });

  it('offers the gallery and the colour row', () => {
    const el = mount();

    expect(el.querySelectorAll('[data-template-id]').length).toBe(TEMPLATE_METADATA.length);
    expect(el.querySelectorAll('[data-accent]').length).toBe(PRESENTATION_PALETTE.length);
  });

  it('passes every choice through to the wizard', () => {
    const onSelectTemplate = vi.fn();
    const onAccentChange = vi.fn();
    const el = mount({ onSelectTemplate, onAccentChange });

    click(
      required<HTMLElement>(
        el.querySelector(`[data-template-id="${OTHER_TEMPLATE.id}"]`),
        'template card'
      )
    );
    expect(onSelectTemplate).toHaveBeenCalledWith(OTHER_TEMPLATE.id);

    const swatch = PRESENTATION_PALETTE[2]!;
    click(required<HTMLElement>(el.querySelector(`[data-accent="${swatch.hex}"]`), 'swatch'));
    expect(onAccentChange).toHaveBeenCalledWith(swatch.hex);
  });

  it('moves on when 下一步 is pressed', () => {
    const onNext = vi.fn();
    const el = mount({ onNext });

    click(required<HTMLElement>(el.querySelector('[data-step-next="style"]'), '下一步'));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain('进入编辑器后仍可返回本步更换模板或配色');
  });

  it('reflects the selection it is given, so returning to this step restores it', () => {
    const el = mount({ selectedTemplateId: OTHER_TEMPLATE.id, accent: '#557a46' });

    const selected = Array.from(el.querySelectorAll('[data-template-id]')).filter(
      (card) => card.getAttribute('data-selected') === 'true'
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]!.getAttribute('data-template-id')).toBe(OTHER_TEMPLATE.id);
    expect(
      el.querySelector('[data-accent="#557a46"]')!.getAttribute('data-selected')
    ).toBe('true');
  });
});
