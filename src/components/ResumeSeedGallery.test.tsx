/**
 * The 案例参考 gallery (ticket 48).
 *
 * # Why this file is mostly about what the cards do *not* show
 *
 * ADR-0008 splits a 模板 (a renderer plus style tokens) from a 内容种子 (a document), and `CONTEXT.md` is
 * explicit that calling a seed a 模板 is what made the old gallery look like it chose a design when it only
 * chose text. So the assertions that matter here are:
 *
 *   - every seed is offered, minus `blank` — which is 空白创建's scaffolding, and offering it here too would
 *     put two cards on one screen that do the same thing;
 *   - a card shows a name and the document's own 关于我 line, and **no layout preview**: a rendered thumbnail on
 *     a content card would be judged as a design, and it would be a design the user already chose in step 1;
 *   - the whole seed is handed over, so the caller never has to look one up by id.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumeSeedGallery } from '@/components/ResumeSeedGallery';
import { BLANK_SEED_ID, RESUME_SEEDS, seedSummary } from '@/lib/resume-template-seeds';

const OFFERED = RESUME_SEEDS.filter((seed) => seed.id !== BLANK_SEED_ID);

function staticMarkup(): string {
  return renderToStaticMarkup(createElement(ResumeSeedGallery, { onPick: () => {} }));
}

describe('案例参考画廊 (ticket 48)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it('offers every case, and not the blank document', () => {
    const html = staticMarkup();

    for (const seed of OFFERED) {
      expect(html, `missing ${seed.name}`).toContain(seed.name);
    }
    // The blank seed has no name of its own to show, and 空白创建 is where it belongs.
    expect(html).not.toContain(`data-seed-id="${BLANK_SEED_ID}"`);
    expect(new Set(OFFERED.map((seed) => seed.id)).size).toBe(OFFERED.length);
  });

  it('summarises each case with a line read out of the document itself', () => {
    // A hand-written description would drift from the document it describes; `seedSummary` cannot.
    const html = staticMarkup();

    for (const seed of OFFERED) {
      const summary = seedSummary(seed);
      if (summary !== '') expect(html, `missing the summary of ${seed.name}`).toContain(summary);
    }
  });

  it('shows no layout preview, because these are documents and not templates', () => {
    const html = staticMarkup();

    expect(html).not.toContain('data-thumbnail-template');
    expect(html).not.toContain('data-preview-template');
    expect(html).not.toContain('resume-print-root');
    // Nor does it offer a colour, which is the other half of what a 模板 owns.
    expect(html).not.toContain('data-accent');
  });

  it('hands the whole case to the caller', () => {
    const onPick = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(createElement(ResumeSeedGallery, { onPick }));
    });

    const target = OFFERED[0]!;
    act(() => {
      container!
        .querySelector(`[data-seed-id="${target.id}"]`)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(target);
  });

  it('marks the chosen case as selected without committing a draft', () => {
    const html = renderToStaticMarkup(
      createElement(ResumeSeedGallery, { onPick: () => {}, selectedId: OFFERED[0]!.id })
    );
    expect(html).toContain(`data-seed-id="${OFFERED[0]!.id}"`);
    expect(html).toContain('data-selected="true"');
  });
});
