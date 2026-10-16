/**
 * Screen pagination for the editor preview (ticket 48).
 *
 * Three layers are covered, deliberately separately:
 *
 *   1. `screenSheets` is pure arithmetic — the packing rules and the window bounds.
 *   2. `measureScreenBlocks` is a traversal — which element becomes which block.
 *   3. The two together against the **real template**, because a hand-built fixture always agrees
 *      with whatever the traversal expects. Ticket 20's silent one-page failure is the reason that
 *      distinction is worth a separate suite (`export-pdf.test.ts` says the same thing at length).
 *
 * The packer is additionally pinned against `paginateBlocks` on identical input: the preview may not
 * paginate a resume differently from the document it is a preview of.
 */
// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  measureScreenBlocks,
  screenSheets,
  type ScreenBlock,
} from '@/lib/resume-screen-pages';
import { a4ContentBox, paginateBlocks, type MeasuredBlock } from '@/lib/print-resume';
import { flattenPrintFlow } from '@/lib/export-pdf';
import { ResumePrintView } from '@/components/ResumePrintView';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

/** The A4 content box the preview draws in, at the default 18mm margin. */
const BOX = a4ContentBox(18);

/** Lays blocks out as a plain stack: each one starts where the previous one's height ended. */
function stack(heights: number[], contentHeight = BOX.height): ScreenBlock[] {
  const blocks: ScreenBlock[] = [];
  let top = 0;

  for (const height of heights) {
    blocks.push({ top, height });
    top += height;
  }

  return blocks;
}

describe('screenSheets — packing rules', () => {
  it('puts an empty resume on one sheet rather than none', () => {
    // A preview with no sheets is a blank area with no explanation, and the editor would look
    // broken for a resume the user has just created and not typed into yet.
    const sheets = screenSheets([], BOX.height);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].firstBlock).toBe(-1);
    expect(sheets[0].lastBlock).toBe(-1);
  });

  it('keeps content that fits on a single sheet', () => {
    const sheets = screenSheets(stack([200, 300, 400]), BOX.height);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].offset).toBe(0);
    expect(sheets[0].firstBlock).toBe(0);
    expect(sheets[0].lastBlock).toBe(2);
  });

  it('adds a second sheet when the content overflows, with no block on both', () => {
    const sheets = screenSheets(stack([600, 600, 100]), BOX.height);

    expect(sheets).toHaveLength(2);
    expect(sheets[0].firstBlock).toBe(0);
    expect(sheets[1].firstBlock).toBe(1);
    expect(sheets[1].offset).toBe(600);
    // No overlap, and neither sheet claims more than one page of the flow.
    expect(sheets[0].offset + sheets[0].height).toBeLessThanOrEqual(sheets[1].offset);
    for (const sheet of sheets) {
      expect(sheet.height).toBeLessThanOrEqual(BOX.height);
    }
  });

  it('moves a heading to the next sheet with the entry that follows it', () => {
    // The heading is 40px tall and would fit in the 86px left on sheet 1; the entry is 400px and
    // does not. Splitting them is how a section title ends up alone at the foot of a page, which is
    // the single most recognisable way a resume looks machine-produced.
    const blocks: ScreenBlock[] = [
      { top: 0, height: 900 },
      { top: 900, height: 40, isHeading: true },
      { top: 940, height: 400 },
    ];

    const sheets = screenSheets(blocks, BOX.height);

    expect(sheets).toHaveLength(2);
    expect(sheets[0].lastBlock).toBe(0);
    expect(sheets[1].firstBlock).toBe(1);
    expect(sheets[1].lastBlock).toBe(2);
  });

  it('places a group taller than a whole sheet alone and flags it', () => {
    // `break-inside: avoid` cannot be honoured for something taller than the paper, so the fact is
    // recorded instead of being silently presented as a normal sheet.
    const blocks: ScreenBlock[] = [
      { top: 0, height: 100 },
      { top: 100, height: BOX.height + 200, isHeading: true },
      { top: 100 + BOX.height + 200, height: 100 },
    ];

    const sheets = screenSheets(blocks, BOX.height);

    // The heading and its successor are one group however tall it is, so the 100px block before it
    // gets a sheet to itself and the flagged group is the last sheet. (Two sheets, not three: the
    // successor is *in* the group rather than following it.)
    expect(sheets).toHaveLength(2);
    expect(sheets[0].hasOversizedBlock).toBeUndefined();
    expect(sheets[1].hasOversizedBlock).toBe(true);
    expect(sheets[1].firstBlock).toBe(1);
    expect(sheets[1].lastBlock).toBe(2);
  });

  it('gives the last sheet the whole content box, so an unmeasurable flow still shows paper', () => {
    // Every offset zero is what a DOM with no layout engine reports, and it is also what a template
    // that failed to render leaves behind. Clamping the last window to the flow's end would make the
    // preview blank instead of approximate; the full box is the harmless direction.
    const blocks: ScreenBlock[] = [
      { top: 0, height: 0 },
      { top: 0, height: 0, isHeading: true },
    ];

    const sheets = screenSheets(blocks, BOX.height);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].height).toBe(BOX.height);
  });

  it('never shows a sheet a sliver of the block that belongs to the next one', () => {
    // Margin collapsing is why this needs its own bound: `height` counts a block's own margins, so
    // the packer can decide a block does not fit while the distance between the two block *tops* is
    // still inside one sheet. Clipping at `contentHeight` alone would then draw the first pixels of
    // the next sheet's block at the foot of this one.
    const blocks: ScreenBlock[] = [
      { top: 0, height: 500 }, // 400px of box plus a 100px margin below it
      { top: 400, height: 500 },
    ];

    const sheets = screenSheets(blocks, BOX.height);

    expect(sheets).toHaveLength(2);
    expect(sheets[0].height).toBe(400);
    expect(sheets[0].offset + sheets[0].height).toBeLessThanOrEqual(sheets[1].offset);
  });
});

describe('screenSheets agrees with the print packer', () => {
  /** The same list in the shape `paginateBlocks` takes, so the two pack the identical input. */
  function asMeasured(blocks: ScreenBlock[]): MeasuredBlock[] {
    return blocks.map((block, index) => ({
      html: `<!-- block ${index} -->`,
      height: block.height,
      isHeading: block.isHeading,
      title: block.isHeading ? `标题 ${index}` : undefined,
    }));
  }

  /** Which headings landed on each sheet, computed the same way `paginateBlocks` reports them. */
  function titlesPerSheet(blocks: ScreenBlock[], sheetOf: (index: number) => number | null) {
    const bySheet = new Map<number, string[]>();
    blocks.forEach((block, index) => {
      if (!block.isHeading) return;
      const sheet = sheetOf(index);
      if (sheet === null) return;
      bySheet.set(sheet, [...(bySheet.get(sheet) ?? []), `标题 ${index}`]);
    });
    return bySheet;
  }

  const CASES: { name: string; blocks: ScreenBlock[] }[] = [
    { name: 'everything fits', blocks: stack([100, 200, 300]) },
    { name: 'a clean two-sheet split', blocks: stack([600, 600]) },
    { name: 'a heading moved off a full sheet', blocks: [
      { top: 0, height: 900 },
      { top: 900, height: 40, isHeading: true },
      { top: 940, height: 400 },
    ] },
    { name: 'an oversized group', blocks: [
      { top: 0, height: 100 },
      { top: 100, height: BOX.height + 100, isHeading: true },
      { top: 100 + BOX.height + 100, height: 100 },
    ] },
    { name: 'three sheets of entries', blocks: stack([500, 500, 500, 500, 500]) },
  ];

  for (const testCase of CASES) {
    it(`produces the same partition as paginateBlocks: ${testCase.name}`, () => {
      const mine = screenSheets(testCase.blocks, BOX.height);
      const print = paginateBlocks(asMeasured(testCase.blocks), BOX.height, BOX.width);

      expect(mine).toHaveLength(print.length);

      const sheetOf = (index: number): number | null => {
        const sheet = mine.findIndex((s) => index >= s.firstBlock && index <= s.lastBlock);
        return sheet === -1 ? null : sheet;
      };

      const expected = titlesPerSheet(testCase.blocks, sheetOf);
      print.forEach((page, sheet) => {
        expect(expected.get(sheet) ?? []).toEqual(page.sectionTitles);
      });

      const oversizedMine = mine.map((sheet) => sheet.hasOversizedBlock === true);
      const oversizedPrint = print.map((page) => page.hasOversizedBlock === true);
      expect(oversizedMine).toEqual(oversizedPrint);
    });
  }
});

describe('measureScreenBlocks', () => {
  /** Builds a print root from HTML, measuring each element at 100 and stacking the offsets. */
  function rootFrom(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  /** The injected measurement: fixed height, offsets laid out as a stack in visit order. */
  function stackingMeasure(): (element: HTMLElement) => { top: number; height: number } {
    let top = 0;
    return () => {
      const block = { top, height: 100 };
      top += 100;
      return block;
    };
  }

  it('keeps the header in the flow, because the preview shows one document', () => {
    const root = rootFrom(`
      <div data-print-role="header"><h1>张三</h1></div>
      <hr />
      <section data-print-section="技能">
        <div data-print-role="heading">技能</div>
        <p>Go</p>
      </section>
    `);

    const blocks = measureScreenBlocks(root, stackingMeasure());

    // header, divider, the section's heading, the section's prose — in that order, so the flow the
    // preview windows is the document as written.
    expect(blocks).toHaveLength(4);
    expect(blocks[0].top).toBe(0);
    expect(blocks[1].top).toBe(100);
    expect(blocks[2].isHeading).toBe(true);
    expect(blocks[3].top).toBe(300);
  });

  it('descends through a section stack and an entry list', () => {
    // Both containers exist only to carry flex `gap`. Measuring either as one block is exactly the
    // ticket 20 failure: the whole resume becomes a single unbreakable unit and every existing test
    // still passes.
    const root = rootFrom(`
      <div data-print-flatten>
        <section data-print-section="工作经历">
          <div data-print-role="heading">工作经历</div>
          <div data-print-flatten>
            <div class="resume-entry">A</div>
            <div class="resume-entry">B</div>
          </div>
        </section>
      </div>
    `);

    const blocks = measureScreenBlocks(root, stackingMeasure());

    expect(blocks).toHaveLength(3);
    expect(blocks[0].isHeading).toBe(true);
    expect(blocks[1].isHeading).toBeUndefined();
  });

  it('takes the heading out of its section only once', () => {
    const root = rootFrom(`
      <section data-print-section="教育背景">
        <div data-print-role="heading">教育背景</div>
        <div class="resume-entry">某大学</div>
      </section>
    `);

    const blocks = measureScreenBlocks(root, stackingMeasure());

    expect(blocks.map((b) => b.isHeading)).toEqual([true, undefined]);
  });

  it('recognises a heading by its class as well as its attribute', () => {
    const root = rootFrom('<div class="resume-section-heading">技能</div>');

    const blocks = measureScreenBlocks(root, stackingMeasure());

    expect(blocks[0].isHeading).toBe(true);
  });
});

/**
 * The traversal, driven by the markup a template actually produces.
 *
 * `measureScreenBlocks` duplicates `flattenPrintFlow`'s walk in order to obtain offsets, so the two
 * must be shown to see the same document. This is the gate: same units, plus the one the print path
 * lifts out.
 */
describe('measureScreenBlocks against the real print view', () => {
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

  const stub = (element: HTMLElement) => ({ top: 0, height: element.textContent?.length ?? 0 });

  it('sees the same units as the export walk, plus the header', () => {
    const root = realPrintRoot();

    const screen = measureScreenBlocks(root, stub);
    const flow = flattenPrintFlow(root, () => 100);

    expect(screen).toHaveLength(flow.length + 1);
    // The extra one is the header, and it is first — the preview's sheet 1 has to carry the name
    // and the contact details or it is not a resume.
    expect(root.firstElementChild?.getAttribute('data-print-role')).toBe('header');
    expect(screen.filter((block) => block.isHeading)).toHaveLength(
      flow.filter((block) => block.isHeading).length
    );
  });

  it('sees one block per entry, not one for the whole resume', () => {
    const root = realPrintRoot();

    // 3 headings + 2 work entries + the prose of 关于我 + 3 skill chips + the divider + the header.
    expect(measureScreenBlocks(root, stub).length).toBeGreaterThanOrEqual(10);
  });

  it('paginates real markup into sheets whose windows do not overlap', () => {
    const root = realPrintRoot();
    // A uniform height that forces several sheets; the offsets themselves come from the stub, so
    // this asserts the arithmetic on the shape the renderer really produces.
    let top = 0;
    const blocks = measureScreenBlocks(root, () => {
      const block = { top, height: 120 };
      top += 120;
      return block;
    });

    const sheets = screenSheets(blocks, BOX.height);

    expect(sheets.length).toBeGreaterThan(1);
    for (let i = 1; i < sheets.length; i += 1) {
      expect(sheets[i - 1].offset + sheets[i - 1].height).toBeLessThanOrEqual(sheets[i].offset);
      expect(sheets[i].offset).toBeGreaterThan(sheets[i - 1].offset);
    }
  });
});
