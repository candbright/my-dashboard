/**
 * The template gallery: what step 1 offers, and what a click means (ticket 48).
 *
 * # Its job changed with the ticket
 *
 * This component used to be the「选择模板」 card of the start screen: a list whose entries were *documents*,
 * so choosing one replaced the resume's content. ADR-0008 separates the two — a 模板 is a renderer plus style
 * tokens, a 内容种子 is prose — and this is now a pure gallery: it renders the registry, reports a choice, and
 * touches nothing else. The ticket's rule (不同简历模板改变的应该是简历的 UI 风格，而不是实际内容) is a property
 * of that contract, so it is asserted here at the component that would break it.
 *
 * # No test counts the templates
 *
 * ADR-0008 is explicit that template count is not a competitive dimension, and 绿野通栏 was appended to the
 * registry while this ticket was in flight. Every case below derives its expectations from `TEMPLATE_METADATA`,
 * so a template added tomorrow appears in the gallery and in these assertions with no edit here. What *is*
 * pinned is the order (the registry's), the default (the first entry, marked 默认), and that the thumbnail's
 * colour is the one the resume will actually render in.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';
import { TemplateSelector } from '@/components/TemplateSelector';
import { PARSEABILITY_LABELS, TEMPLATE_METADATA } from '@/lib/resume-template';
import { DEFAULT_PRESENTATION, PRESENTATION_PALETTE } from '@/lib/resume-presentation';

const DEFAULT_TEMPLATE = TEMPLATE_METADATA[0]!;
const DEFAULT_ACCENT = DEFAULT_PRESENTATION.accentColor;

describe('模板画廊 (ticket 48)', () => {
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
    }> = {}
  ): HTMLDivElement {
    // One gallery at a time: two cases below compare two prop sets, and a leaked root would keep rendering
    // with the old props.
    if (root) {
      act(() => root!.unmount());
      container?.remove();
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(TemplateSelector, {
          selectedTemplateId: DEFAULT_TEMPLATE.id,
          onSelectTemplate: () => {},
          accent: DEFAULT_ACCENT,
          onAccentChange: () => {},
          ...overrides,
        })
      );
    });
    return container;
  }

  function cards(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll('[data-template-id]')) as HTMLElement[];
  }

  function click(el: Element): void {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('offers the registry, in the registry’s order, with the first entry marked 默认', () => {
    const el = mount();
    const shown = cards(el).map((card) => card.getAttribute('data-template-id'));

    expect(shown).toEqual(TEMPLATE_METADATA.map((template) => template.id));

    const badge = Array.from(el.querySelectorAll('span')).find(
      (node) => node.textContent === '默认'
    );
    expect(badge, 'no card is marked 默认').toBeDefined();
    // The badge belongs to the card an undecided user gets, i.e. the first registered template.
    expect(badge!.closest('[data-template-id]')!.getAttribute('data-template-id')).toBe(
      DEFAULT_TEMPLATE.id
    );
    expect(el.textContent).toContain(DEFAULT_TEMPLATE.name);
  });

  it('reports the chosen template by id, and nothing else', () => {
    // The separation the ticket is about: a click changes the *look*. It must not, for instance, hand back a
    // document — the old gallery's entries each carried one.
    const onSelectTemplate = vi.fn();
    const el = mount({ onSelectTemplate });
    const target = TEMPLATE_METADATA[TEMPLATE_METADATA.length - 1]!;

    click(cards(el).find((card) => card.getAttribute('data-template-id') === target.id)!);

    expect(onSelectTemplate).toHaveBeenCalledTimes(1);
    expect(onSelectTemplate).toHaveBeenCalledWith(target.id);
  });

  it('marks exactly the selected card, from props rather than from its own state', () => {
    // The selection lives in the wizard, so back-navigation can restore it; a gallery that kept its own copy
    // would forget which template the document is styled with.
    const el = mount({ selectedTemplateId: TEMPLATE_METADATA[1]!.id });

    const selected = cards(el).filter((card) => card.getAttribute('data-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.getAttribute('data-template-id')).toBe(TEMPLATE_METADATA[1]!.id);
    expect(selected[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('draws every thumbnail in the colour the resume will render in', () => {
    // No registered template ships an accent token, so the product default is what every card shows
    // until the user picks another swatch — and then every card shows that swatch.
    const el = mount();
    const thumbnails = Array.from(el.querySelectorAll('[data-thumbnail-template]'));

    expect(thumbnails).toHaveLength(TEMPLATE_METADATA.length);
    for (const template of TEMPLATE_METADATA) {
      const thumbnail = el.querySelector(`[data-thumbnail-template="${template.id}"]`);
      expect(thumbnail, `no thumbnail for ${template.id}`).not.toBeNull();
      expect(thumbnail!.getAttribute('data-thumbnail-accent')).toBe(DEFAULT_ACCENT);
    }

    const el2 = mount({ accent: '#557a46' });
    for (const thumbnail of Array.from(el2.querySelectorAll('[data-thumbnail-template]'))) {
      expect(thumbnail.getAttribute('data-thumbnail-accent')).toBe('#557a46');
    }
  });

  it('reports a swatch click as a palette hex, and follows the resolved accent', () => {
    const onAccentChange = vi.fn();
    const el = mount({ onAccentChange });

    const swatches = Array.from(el.querySelectorAll('[data-accent]')) as HTMLElement[];
    expect(swatches.map((swatch) => swatch.getAttribute('data-accent'))).toEqual(
      PRESENTATION_PALETTE.map((entry) => entry.hex)
    );

    const pick = PRESENTATION_PALETTE[3]!;
    click(swatches.find((swatch) => swatch.getAttribute('data-accent') === pick.hex)!);

    expect(onAccentChange).toHaveBeenCalledWith(pick.hex);

    // The ring is on the accent the component was *given*, which for a template with tokens of its own is the
    // resolved colour — the swatch that looks chosen is the one that will be used.
    const resolved = mount({ accent: '#557a46' });
    const selectedSwatch = Array.from(resolved.querySelectorAll('[data-accent]')).filter(
      (swatch) => swatch.getAttribute('data-selected') === 'true'
    );
    expect(selectedSwatch).toHaveLength(1);
    expect(selectedSwatch[0]!.getAttribute('data-accent')).toBe('#557a46');
  });

  it('offers the colour row without explaining a template brand colour', () => {
    const el = mount();

    expect(el.textContent).toContain('配色');
    expect(el.textContent).not.toContain('当前配色');
    expect(el.textContent).not.toContain('只影响模板的强调色');
    expect(el.textContent).not.toContain('该模板自带主色');
    expect(el.querySelectorAll('[data-accent]')).toHaveLength(PRESENTATION_PALETTE.length);
  });

  it('states each template’s parseability from the written table, and shows the table', () => {
    // ADR-0008 requires the rating to be visible wherever a template is chosen, and justified against a written
    // standard: a badge whose meaning lives only in the source is the 随口贴标签 outcome the table prevents.
    const el = mount();

    for (const template of TEMPLATE_METADATA) {
      expect(el.textContent).toContain(`解析友好度 ${PARSEABILITY_LABELS[template.parseability]}`);
    }
    expect(el.textContent).not.toContain('undefined');

    const details = el.querySelector('details');
    expect(details, 'the rating standard is not in the document').not.toBeNull();
    expect(details!.textContent).toContain('解析友好度是怎么判定的');
    expect(details!.querySelector('summary svg')).not.toBeNull();
    expect(el.textContent).not.toContain('展开标准');
    expect(el.textContent).not.toContain('目前所有模板都是单栏');
    expect(el.textContent).not.toContain('没有做成筛选项');
  });
});
