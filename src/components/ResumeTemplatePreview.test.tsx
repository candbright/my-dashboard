/**
 * The template preview: real renderer, real pagination, A4 sheets (ticket 48).
 *
 * # What this replaced
 *
 * The editor's 预览 tab rendered `ResumeDisplay` — the parsed-*document* view, with no template on it. A user
 * who chose 绿野通栏 in step 1 and then opened 预览 saw a plain document, and the only honest reading was
 * "my choice did nothing". The ticket's third criterion is that 预览不是预览 html 解析内容了，而是预览带 ui
 * 模板的简历, so this file asserts what separates the new preview from the old one:
 *
 *   - the markup is the **template's** — its own token colour, at the print geometry — not a document view;
 *   - the personal details are present, as the ticket also requires of a preview, and blank ones are filled
 *     from the form's own placeholders rather than left as a hole;
 *   - several sheets are windows onto **one** flow, moved and clipped rather than re-laid-out, and only the
 *     first copy is read out.
 *
 * # How a multi-page layout is produced here
 *
 * `screenSheets` and the block walk are pinned against `paginateBlocks` in `resume-screen-pages.test.ts`,
 * including a parity gate against the export path — so this file deliberately uses the **real** packer and
 * only fakes the browser's geometry (`getBoundingClientRect`), which is the one thing happy-dom cannot
 * provide. Faking the packer's answer would have tested the fake; faking the measurement lets the real
 * packing rules decide how many pages there are, and the case below asserts the count *changes* with the
 * measurement rather than pinning an arithmetic result that belongs to the packer's own tests.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeTemplatePreview } from '@/components/ResumeTemplatePreview';
import { DEFAULT_PRESENTATION, type ResumePresentation } from '@/lib/resume-presentation';
import { metadataValuesFromRecord, type ResumeMetadataValues } from '@/lib/resume-metadata';

const MARKDOWN = `## 关于我

5 年全栈开发经验。

## 工作经历

### 高级全栈工程师 | 某某科技

*2022年6月 - 至今*

- 主导前端架构升级
`;

const BLANK: ResumeMetadataValues = metadataValuesFromRecord({});

/** The product default accent — no registered template ships a brand colour of its own. */
const STONE = DEFAULT_PRESENTATION.accentColor;

describe('模板预览 (ticket 48)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  /** The height every measured block reports. 0 is happy-dom's own answer; a page-sized value forces overflow. */
  let blockHeight = 0;

  beforeEach(() => {
    blockHeight = 0;
    // A block's offset down the flow. Each *distinct* element gets the next slot, which is what the real
    // browser reports for a column of blocks — without it every block would overlap at 0 and a sheet's window
    // could only ever start at 0.
    let slots = 0;
    const slotOf = new WeakMap<Element, number>();
    // happy-dom lays nothing out, so every rect is zero and a resume can never overflow — which is the correct
    // answer for an unmeasured flow (and is asserted as such below), but cannot exercise the windowing. This
    // replaces the browser's measurement only: the block order and the packing rules stay the real ones.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      let top = slotOf.get(this);
      if (top === undefined) {
        top = slots * 600;
        slots += 1;
        slotOf.set(this, top);
      }
      const height = blockHeight;
      return {
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 100,
        width: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  function render(
    presentation: ResumePresentation = DEFAULT_PRESENTATION,
    metadataValues: ResumeMetadataValues = BLANK,
    markdown = MARKDOWN
  ): void {
    root!.render(
      createElement(ResumeTemplatePreview, { markdown, metadataValues, presentation })
    );
  }

  function mount(
    presentation: ResumePresentation = DEFAULT_PRESENTATION,
    metadataValues: ResumeMetadataValues = BLANK
  ): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      render(presentation, metadataValues);
    });
    return container;
  }

  function rerender(
    el: HTMLElement,
    presentation: ResumePresentation,
    metadataValues: ResumeMetadataValues = BLANK,
    markdown = MARKDOWN
  ): void {
    act(() => {
      render(presentation, metadataValues, markdown);
    });
    expect(el).toBeDefined();
  }

  function pages(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll('[data-preview-page]')) as HTMLElement[];
  }

  it('renders one A4 sheet at the print geometry', () => {
    const el = mount();

    const sheet = pages(el);
    expect(sheet).toHaveLength(1);
    expect(sheet[0]!.getAttribute('style')).toContain('794px');
    expect(sheet[0]!.getAttribute('style')).toContain('1123px');
    // The template renderer's own root: this really is the print path's markup, not a document view.
    expect(el.querySelector('#resume-print-root')).not.toBeNull();
    expect(el.querySelector('#resume-print-root')!.textContent).toContain('工作经历');
  });

  it('renders the template that was chosen, with its own tokens', () => {
    const el = mount();
    const view = el.querySelector('[data-preview-template]')!;

    expect(view.getAttribute('data-preview-template')).toBe('ats-safe-single-column');
    expect(el.innerHTML).toContain(STONE);

    // The same document, a different look — and the difference is the template's own token, which is what
    // `ResumeDisplay` could not have produced and what the defect report measured in Chromium.
    rerender(el, { ...DEFAULT_PRESENTATION, template: 'verdant-banner' });

    expect(el.querySelector('[data-preview-template]')!.getAttribute('data-preview-template')).toBe(
      'verdant-banner'
    );
    expect(el.innerHTML).toContain(STONE);
    expect(pages(el)).toHaveLength(1);
  });

  it('follows a colour change without remounting', () => {
    // "The preview updates live" is an acceptance criterion of step 1's swatches; the same has to hold here,
    // where the colour can still be changed before saving.
    const el = mount();

    rerender(el, { ...DEFAULT_PRESENTATION, accentColor: '#557a46' });

    expect(el.innerHTML).toContain('#557a46');
    expect(el.innerHTML).not.toContain(STONE);
  });

  it('fills blank personal details with the form’s own placeholders', () => {
    // A blank resume has no name and no contact details, and a template's header treatment is only visible if
    // there is something to draw. The placeholders come from `METADATA_FIELDS` — the labels the form itself
    // shows — so the preview cannot invent a value the form would not suggest for that field.
    const el = mount(DEFAULT_PRESENTATION, BLANK);

    expect(el.textContent).toContain('张三');
    expect(el.textContent).toContain('name@example.com');
  });

  it('shows what the user typed in preference to the placeholder', () => {
    const el = mount(DEFAULT_PRESENTATION, {
      ...BLANK,
      name: '李明',
      email: 'liming@example.com',
    });

    expect(el.textContent).toContain('李明');
    expect(el.textContent).toContain('liming@example.com');
    expect(el.textContent).not.toContain('张三');
  });

  it('windows an overflowing document into several sheets, and only the first is read out', () => {
    // A block taller than the page, three sections of them: the document no longer fits on one sheet.
    blockHeight = 1200;
    const el = mount();

    const sheet = pages(el);
    expect(sheet.length).toBeGreaterThan(1);

    // One flow, moved and clipped: sheet *n* shows the same markup translated up by its window's offset. A
    // preview that re-laid the flow out per page would wrap the lines differently from the PDF.
    expect(sheet[0]!.getAttribute('aria-hidden')).toBeNull();
    for (const later of sheet.slice(1)) {
      expect(later.getAttribute('aria-hidden')).toBe('true');
    }

    const clipOf = (page: HTMLElement) => page.firstElementChild as HTMLElement;
    const flowOf = (page: HTMLElement) => clipOf(page).firstElementChild as HTMLElement;
    const offsetOf = (page: HTMLElement) =>
      Number(/translateY\(-(\d+(?:\.\d+)?)px\)/.exec(flowOf(page)!.getAttribute('style') ?? '')?.[1] ?? 0);

    // The windows are copies of *one* flow, not per-page re-renders: byte-identical markup, moved.
    expect(flowOf(sheet[1]!).innerHTML).toBe(flowOf(sheet[0]!).innerHTML);

    // The windows advance down the flow, in order. The absolute offsets are the packer's arithmetic (pinned in
    // its own tests); what matters here is that each sheet is shifted from the one before and never back.
    for (let index = 1; index < sheet.length; index += 1) {
      expect(offsetOf(sheet[index]!)).toBeGreaterThan(offsetOf(sheet[index - 1]!));
    }
    // …and no clip window is taller than the printable box (A4 minus the 18mm margins), so a sheet never
    // shows the unprintable edge.
    const heightOf = (page: HTMLElement) =>
      Number(/height:\s*(\d+(?:\.\d+)?)px/.exec(clipOf(page).getAttribute('style') ?? '')?.[1] ?? NaN);
    for (const page of sheet) {
      expect(heightOf(page)).toBeGreaterThan(0);
      expect(heightOf(page)).toBeLessThanOrEqual(1123 - 2 * 18 * (96 / 25.4));
    }
  });

  it('re-measures when the document changes', () => {
    // The editor's whole loop: type, and the pages follow. The measurement is the trigger, so the assertion is
    // that the *page count* follows a change in the measurement.
    blockHeight = 1200;
    const el = mount();
    expect(pages(el).length).toBeGreaterThan(1);

    blockHeight = 0;
    rerender(el, DEFAULT_PRESENTATION, BLANK, `${MARKDOWN}\n- 又写了一行\n`);

    expect(pages(el)).toHaveLength(1);
  });
});
