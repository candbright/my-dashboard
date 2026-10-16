// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collectPrintBlocks, flattenPrintFlow } from '@/lib/export-pdf';
import { a4ContentBox, paginateBlocks } from '@/lib/print-resume';
import { ResumePrintView } from '@/components/ResumePrintView';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

/**
 * Tests for walking the print view into measured blocks (ticket 04).
 *
 * Height measurement is injected, so these tests cover the traversal decisions —
 * which element is the repeated header, which is a heading, what title a block
 * carries — without needing a layout engine. Real heights and real page breaks are
 * covered by `npm run verify:print` in a browser.
 */

/** Builds a print root from HTML, with a stub measurement of 100 per element. */
function rootFrom(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

const stubMeasure = () => 100;

describe('collectPrintBlocks', () => {
  it('takes the header block out of the flow', () => {
    const root = rootFrom(`
      <div data-print-role="header"><h1>张三</h1></div>
      <hr />
      <section><div class="resume-section-heading">工作经历</div></section>
    `);

    const { headerHtml, blocks } = collectPrintBlocks(root, stubMeasure);

    expect(headerHtml).toContain('张三');
    // The header must not also appear as a body block, or it would print twice on
    // page 1 and be duplicated into the repeated header.
    expect(blocks.some((b) => b.html.includes('data-print-role="header"'))).toBe(false);
  });

  it('keeps the remaining children in document order', () => {
    // Note the divider: it is a real child of the print root, so it becomes a
    // (zero-ish height) block and its position in the sequence must be preserved.
    const root = rootFrom(`
      <div data-print-role="header">head</div>
      <hr />
      <section id="one">first</section>
      <section id="two">second</section>
    `);

    const { blocks } = collectPrintBlocks(root, stubMeasure);

    expect(blocks).toHaveLength(3);
    expect(blocks[0].html).toBe('<hr>');
    expect(blocks[1].html).toContain('first');
    expect(blocks[2].html).toContain('second');
  });

  it('marks a heading block and records its title', () => {
    const root = rootFrom(`
      <div data-print-role="heading">技能</div>
      <p>Go</p>
    `);

    const { blocks } = collectPrintBlocks(root, stubMeasure);

    expect(blocks[0].isHeading).toBe(true);
    expect(blocks[0].title).toBe('技能');
    expect(blocks[1].isHeading).toBe(false);
    expect(blocks[1].title).toBeUndefined();
  });

  it('recognises a heading by its class as well as its data attribute', () => {
    // The class is what the print stylesheet targets, so both must be understood.
    const root = rootFrom('<div class="resume-section-heading">教育经历</div>');

    const { blocks } = collectPrintBlocks(root, stubMeasure);

    expect(blocks[0].isHeading).toBe(true);
    expect(blocks[0].title).toBe('教育经历');
  });

  it('only treats the first child as the header', () => {
    // A later element carrying the same attribute is content, not the header.
    const root = rootFrom(`
      <div data-print-role="header">head</div>
      <section>
        <div data-print-role="header">nested</div>
      </section>
    `);

    const { headerHtml, blocks } = collectPrintBlocks(root, stubMeasure);

    expect(headerHtml).toContain('head');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].html).toContain('nested');
  });

  it('returns no header when the first child is ordinary content', () => {
    const root = rootFrom('<section>just content</section>');

    const { headerHtml, blocks } = collectPrintBlocks(root, stubMeasure);

    expect(headerHtml).toBe('');
    expect(blocks).toHaveLength(1);
  });

  it('uses the injected measurement for every block', () => {
    const root = rootFrom('<div>a</div><div>b</div>');
    const seen: number[] = [];
    const measure = (element: HTMLElement) => {
      seen.push(element.textContent?.length ?? 0);
      return 250;
    };

    const { blocks } = collectPrintBlocks(root, measure);

    expect(blocks.map((b) => b.height)).toEqual([250, 250]);
    expect(seen).toEqual([1, 1]);
  });

  it('survives an empty print root', () => {
    const { headerHtml, blocks } = collectPrintBlocks(rootFrom(''), stubMeasure);

    expect(headerHtml).toBe('');
    expect(blocks).toEqual([]);
  });
});

describe('flattenPrintFlow', () => {
  it('splits a section into its heading and each entry', () => {
    // The entry is the unit of pagination. Treating the whole section as one block
    // would make a section taller than a page unbreakable.
    const root = rootFrom(`
      <div data-print-role="header">head</div>
      <section data-print-section="工作经历">
        <div data-print-role="heading">工作经历</div>
        <div class="resume-entry">A</div>
        <div class="resume-entry">B</div>
        <div class="resume-entry">C</div>
      </section>
    `);

    const flow = flattenPrintFlow(root, stubMeasure);

    expect(flow).toHaveLength(4);
    expect(flow[0].isHeading).toBe(true);
    expect(flow.slice(1).map((b) => b.html)).toEqual([
      expect.stringContaining('>A<'),
      expect.stringContaining('>B<'),
      expect.stringContaining('>C<'),
    ]);
  });

  it('leaves the header out of the flow', () => {
    // The header is emitted on every sheet, so it must not also flow as content.
    const root = rootFrom(`
      <div data-print-role="header">张三</div>
      <section data-print-section="技能">
        <div data-print-role="heading">技能</div>
        <p>Go</p>
      </section>
    `);

    const flow = flattenPrintFlow(root, stubMeasure);

    expect(flow.some((b) => b.html.includes('张三'))).toBe(false);
  });

  it('preserves root order, keeping the divider before the sections', () => {
    const root = rootFrom(`
      <div data-print-role="header">head</div>
      <hr />
      <section data-print-section="技能">
        <div data-print-role="heading">技能</div>
        <p>Go</p>
      </section>
    `);

    const flow = flattenPrintFlow(root, stubMeasure);

    expect(flow[0].html).toBe('<hr>');
    expect(flow[1].isHeading).toBe(true);
  });

  it('treats a section without the marker as a single block', () => {
    // Right for a short prose section: there is nothing useful to split.
    const root = rootFrom(`
      <div data-print-role="header">head</div>
      <section><p>一段不分页的简介</p></section>
    `);

    const flow = flattenPrintFlow(root, stubMeasure);

    expect(flow).toHaveLength(1);
    expect(flow[0].html).toContain('一段不分页的简介');
  });

  it('handles a marked section that has no heading', () => {
    const root = rootFrom(`
      <section data-print-section="无标题">
        <p>only content</p>
      </section>
    `);

    const flow = flattenPrintFlow(root, stubMeasure);

    expect(flow).toHaveLength(1);
    expect(flow[0].html).toContain('only content');
  });

  it('lets a section taller than a page span pages instead of taking one alone', () => {
    // The bug this replaced: with the section as one block, its height exceeded the
    // page, so it was flagged oversized and occupied a page by itself.
    //
    // Heights are chosen so the heading-plus-first-entry group still fits on a page
    // (300 + 300 < 986); otherwise the oversized-block rule would fire legitimately
    // and the test would be asserting the wrong thing.
    const root = rootFrom(`
      <div data-print-role="header">head</div>
      <section data-print-section="工作经历">
        <div data-print-role="heading">工作经历</div>
        <div class="resume-entry">A</div>
        <div class="resume-entry">B</div>
        <div class="resume-entry">C</div>
      </section>
    `);

    const box = a4ContentBox(18);
    const measured: Record<string, number> = { 工作经历: 300, A: 300, B: 300, C: 300 };
    const flow = flattenPrintFlow(root, (element) => {
      const text = element.textContent?.trim() ?? '';
      return measured[text] ?? 300;
    });
    const pages = paginateBlocks(flow, box.height, box.width);

    expect(flow).toHaveLength(4);
    // 1200px of content in a 986px page box: must span two sheets, and no single
    // block is oversized, so nothing gets flagged.
    expect(pages.length).toBe(2);
    expect(pages.some((page) => page.hasOversizedBlock)).toBe(false);
  });

  it('survives an empty print root', () => {
    expect(flattenPrintFlow(rootFrom(''), stubMeasure)).toEqual([]);
  });
});

/**
 * The traversal, driven by the markup a template actually produces.
 *
 * The tests above build print roots by hand, and every one of them put sections directly under the
 * print root and entries directly under a section. The renderers stopped doing that in ticket 20 —
 * they wrap sections in a stack and entries in another stack, because flex `gap` is how the
 * spacing is expressed — and the hand-built fixtures kept passing while the real path collapsed
 * the whole resume into a single unbreakable block.
 *
 * So these tests render the real components. That is the only way this class of defect is visible:
 * the layout was correct, the types were correct, and the page count was wrong.
 */
describe('flattenPrintFlow against the real print view', () => {
  const MARKDOWN = `---
name: 李明
title: 全栈开发工程师
email: liming@dev.com
---

## 关于我

5 年全栈开发经验。

## 工作经历

### 高级全栈工程师 | 某某科技

*2022年6月 - 至今*

- 主导前端架构升级

### 全栈工程师 | 另一家公司

*2020年7月 - 2022年5月*

- 负责核心业务模块

## 技能

- TypeScript
- React
- Go
`;

  function realPrintRoot(): HTMLElement {
    // `createElement` rather than JSX: this file is `.ts`, and vitest's esbuild will not parse JSX
    // in a `.ts` extension (and renaming it would make it the only `.tsx` test in `src/lib`).
    //
    // The cast is the boundary between the two parser shapes, and it is honest rather than lazy:
    // `parseResumeMarkdown` types frontmatter values as `unknown` because they come from YAML, and
    // normalising them to strings is a separate step this test does not exercise. The traversal
    // under test reads section structure and `data-print-*` attributes, neither of which depends on
    // the frontmatter type. The alternative — building a `ParsedResumeWithMetadata` by hand — would
    // stop this from being a test of the *real* markup, which is the entire point of the suite.
    const parsed = parseResumeMarkdown(MARKDOWN) as unknown as ParsedResumeWithMetadata;
    const html = renderToStaticMarkup(
      createElement(ResumePrintView, {
        resume: { title: '我的简历', presentation: null } as unknown as ResumeRecord,
        parsed,
      })
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    const root = host.querySelector('#resume-print-root');
    if (!root) throw new Error('the print view no longer emits #resume-print-root');
    return root as HTMLElement;
  }

  it('sees one block per entry, not one block for the whole resume', () => {
    // THE regression. A section stack that is not descended into makes this 1 block (plus the
    // divider), because the stack is the print root's only child apart from the header.
    const flow = flattenPrintFlow(realPrintRoot(), stubMeasure);

    // 3 headings + 2 work entries + the prose of 关于我 + 3 skill chips = 9, plus the divider.
    expect(flow.length).toBeGreaterThanOrEqual(9);

    // Every heading is present, and each is followed by something, so `paginateBlocks` can glue
    // them together and none can be stranded at the foot of a page.
    const headings = flow.filter((b) => b.isHeading);
    expect(headings.map((b) => b.title)).toEqual(['关于我', '工作经历', '技能']);
  });

  it('makes each entry its own measured block', () => {
    // Without descending into the entries wrapper, both jobs are one block and a long section can
    // never span pages.
    const flow = flattenPrintFlow(realPrintRoot(), stubMeasure);
    const entries = flow.filter((b) => b.html.includes('resume-entry'));

    expect(entries).toHaveLength(2);
    // Each block holds exactly one entry, so no two roles are welded together.
    for (const block of entries) {
      expect(block.html.match(/class="resume-entry"/g)).toHaveLength(1);
    }
  });

  it('paginates the real markup without flagging an oversized block', () => {
    // The end-to-end consequence: with a uniform 120px measurement and a 986px page box, the
    // content must span pages and no single unit may exceed a page.
    const box = a4ContentBox(18);
    const flow = flattenPrintFlow(realPrintRoot(), () => 120);
    const pages = paginateBlocks(flow, box.height, box.width);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.some((page) => page.hasOversizedBlock)).toBe(false);
    // Nothing is lost between the flow and the pages.
    expect(pages.reduce((sum, page) => sum + page.sectionTitles.length, 0)).toBeGreaterThanOrEqual(3);
  });
});

describe('collectPrintBlocks + paginateBlocks — end to end', () => {
  it('moves a heading to the next page with its entry rather than orphaning it', () => {
    // A realistic shape: a filler tall enough to nearly fill page 1, then a section.
    const root = rootFrom(`
      <div data-print-role="header"><h1>张三</h1></div>
      <div style="height: 1px">filler</div>
      <div class="resume-section-heading">工作经历</div>
      <div class="resume-entry">某某科技</div>
    `);

    const box = a4ContentBox(18);
    const heights = new Map<string, number>([
      ['filler', box.height - 60],
      ['工作经历', 40],
      ['某某科技', 400],
    ]);

    const { headerHtml, blocks } = collectPrintBlocks(root, (element) => {
      const text = element.textContent?.trim() ?? '';
      return heights.get(text) ?? 40;
    });
    const pages = paginateBlocks(blocks, box.height, box.width);

    expect(pages.length).toBeGreaterThan(1);
    // The heading must not be the last thing on page 1.
    expect(pages[0].bodyHtml).not.toContain('工作经历');
    expect(pages[1].bodyHtml).toContain('工作经历');
    expect(pages[1].bodyHtml).toContain('某某科技');
    expect(headerHtml).toContain('张三');
  });

  it('repeats the header on every page including the first', () => {
    // The header block is lifted out of the flow, so page 1 would otherwise show no
    // name and no contact details at all.
    const root = rootFrom(`
      <div data-print-role="header"><h1>张三</h1><p>13800138000</p></div>
      <div class="resume-entry">A</div>
      <div class="resume-entry">B</div>
      <div class="resume-entry">C</div>
    `);

    const box = a4ContentBox(18);
    const { headerHtml, blocks } = collectPrintBlocks(root, () => 600);
    const pages = paginateBlocks(blocks, box.height, box.width);

    // Mirror `paginatePrintRoot`.
    const withHeaders = pages.map((page) => ({ ...page, headerHtml }));

    expect(withHeaders.length).toBeGreaterThan(1);
    for (const page of withHeaders) {
      expect(page.headerHtml).toContain('张三');
      expect(page.headerHtml).toContain('13800138000');
    }
  });
});
