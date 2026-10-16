import { describe, expect, it } from 'vitest';
import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  PRINT_RESUME_CSS,
  a4ContentBox,
  buildPrintDocument,
  extractVerificationPayload,
  mmToPx,
  paginateBlocks,
  readPrintRootText,
  serializePrintRoot,
  type MeasuredBlock,
  type PrintPage,
} from '@/lib/print-resume';

/**
 * Tests for the browser-print export document (ticket 03, ADR-0001 Phase 1).
 *
 * What can be asserted here is the *document*: that it is self-contained, that it
 * keeps app chrome off the page, and that it carries the resume's text through to
 * the PDF. What cannot be asserted here is the bytes a browser produces from
 * `print()` — Chrome exposes no programmatic print-to-PDF. The acceptance check
 * for that is a driven browser, recorded in the ticket's Comments.
 */

const parts = (over: Partial<Parameters<typeof buildPrintDocument>[0]> = {}) => ({
  innerHtml: '<h1>张三</h1><p>后端工程师</p>',
  text: '张三\n后端工程师',
  rootStyle: 'width: 794px; background: #ffffff;',
  ...over,
});

describe('PRINT_RESUME_CSS', () => {
  it('sets an A4 page with a visible margin', () => {
    expect(PRINT_RESUME_CSS).toContain('size: A4');
    expect(PRINT_RESUME_CSS).toMatch(/margin:\s*18mm/);
  });

  it('hides app chrome', () => {
    expect(PRINT_RESUME_CSS).toContain('.no-print');
    expect(PRINT_RESUME_CSS).toContain('display: none !important');
  });

  it('keeps an entry from breaking across pages', () => {
    expect(PRINT_RESUME_CSS).toContain('.resume-entry');
    expect(PRINT_RESUME_CSS).toContain('break-inside: avoid');
  });

  it('keeps a section heading off the bottom of a page', () => {
    expect(PRINT_RESUME_CSS).toContain('.resume-section-heading');
    expect(PRINT_RESUME_CSS).toContain('break-after: avoid');
  });

  it('uses no CSS custom properties', () => {
    // ADR-0001: the Phase 4 renderer does not support CSS variables, so print
    // styles must not depend on them. Writing them out now avoids doing it twice.
    expect(PRINT_RESUME_CSS).not.toContain('var(--');
  });

  it('overrides the on-screen fixed pixel width so the page box decides', () => {
    // The preview is a fixed 794px column (A4 at 96dpi); on paper that would
    // overflow the printable area.
    expect(PRINT_RESUME_CSS).toMatch(/#resume-print-root\s*\{[^}]*width:\s*100%\s*!important/);
  });
});

describe('buildPrintDocument', () => {
  it('produces a complete, self-contained HTML document', () => {
    const html = buildPrintDocument(parts());

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('</html>');
  });

  it('inlines the print stylesheet rather than referencing one', () => {
    // An iframe does not inherit the parent document's stylesheet, so a <link>
    // would print an unstyled resume.
    const html = buildPrintDocument(parts());

    expect(html).toContain(PRINT_RESUME_CSS);
    expect(html).not.toContain('<link');
  });

  it('re-creates the print root with the id the CSS targets', () => {
    expect(buildPrintDocument(parts())).toContain('id="resume-print-root"');
  });

  it('preserves the resume markup', () => {
    const html = buildPrintDocument(parts());

    expect(html).toContain('<h1>张三</h1>');
    expect(html).toContain('<p>后端工程师</p>');
  });

  it('preserves the root inline style', () => {
    expect(buildPrintDocument(parts())).toContain('style="width: 794px; background: #ffffff;"');
  });

  it('sets lang for correct CJK font selection', () => {
    expect(buildPrintDocument(parts())).toContain('lang="zh-CN"');
  });
});

describe('buildPrintDocument — injection safety', () => {
  it('escapes a double quote in the root style attribute', () => {
    const html = buildPrintDocument(parts({ rootStyle: 'font-family: "Noto Sans SC";' }));

    expect(html).toContain('&quot;Noto Sans SC&quot;');
    // The attribute must not be terminated early by the quote.
    expect(html).not.toContain('style="font-family: "Noto');
  });

  it('escapes markup in the embedded verification payload', () => {
    // Resume text is user-controlled. A raw `</div>` would break out of the
    // hidden element and land in the printed document.
    const html = buildPrintDocument(parts({ text: 'a</div><script>alert(1)</script>b' }));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('round-trips the payload through its escaping', () => {
    const text = '张三 <b>粗体</b> & 符号';
    const html = buildPrintDocument(parts({ text }));
    const payload = extractVerificationPayloadFromHtml(html);

    expect(payload?.text).toBe(text);
  });
});

describe('extractVerificationPayload', () => {
  it('reads the payload back out of extracted PDF text', () => {
    const payload = JSON.stringify({ v: 1, text: '张三\n后端工程师' });
    const pdfText = `some pdf noise ${payload} more noise`;

    expect(extractVerificationPayload(pdfText)?.text).toBe('张三\n后端工程师');
  });

  it('tolerates whitespace inside the payload', () => {
    const pdfText = '{"v": 1, "text": "简历"}';

    expect(extractVerificationPayload(pdfText)?.text).toBe('简历');
  });

  it('unescapes quotes and newlines', () => {
    const pdfText = '{"v":1,"text":"line1\\nline2 \\"quoted\\""}';

    expect(extractVerificationPayload(pdfText)?.text).toBe('line1\nline2 "quoted"');
  });

  it('returns undefined when there is no payload', () => {
    // A PDF produced elsewhere, or by an older version, must not crash the check.
    expect(extractVerificationPayload('Zhang San\nBackend Engineer')).toBeUndefined();
  });

  it('returns undefined for a malformed payload', () => {
    expect(extractVerificationPayload('{"v":1,"text":}')).toBeUndefined();
  });
});

describe('readPrintRootText', () => {
  it('reads textContent when innerText is unavailable', () => {
    // happy-dom does not implement innerText, and neither do some SSR shims, so
    // the fallback is the path that actually runs in tests.
    const element = {
      textContent: '张三 后端工程师',
    } as unknown as HTMLElement;

    expect(readPrintRootText(element)).toBe('张三 后端工程师');
  });

  it('returns an empty string for an empty element', () => {
    expect(readPrintRootText({ textContent: '' } as unknown as HTMLElement)).toBe('');
  });
});

describe('serializePrintRoot', () => {
  it('takes the inner markup, not the root element itself', () => {
    // buildPrintDocument re-creates the root so it can own the id; taking the
    // outerHTML here would nest one #resume-print-root inside another.
    const root = {
      innerHTML: '<h1>张三</h1>',
      textContent: '张三',
      getAttribute: (name: string) => (name === 'style' ? 'color: #292524;' : null),
    } as unknown as HTMLElement;

    const result = serializePrintRoot(root);

    expect(result.innerHtml).toBe('<h1>张三</h1>');
    expect(result.innerHtml).not.toContain('resume-print-root');
    expect(result.rootStyle).toBe('color: #292524;');
    expect(result.text).toBe('张三');
  });

  it('copes with a root that has no style attribute', () => {
    const root = {
      innerHTML: '<h1>x</h1>',
      textContent: 'x',
      getAttribute: () => null,
    } as unknown as HTMLElement;

    expect(serializePrintRoot(root).rootStyle).toBe('');
  });
});

describe('A4 geometry', () => {
  it('converts millimetres to CSS pixels at 96dpi', () => {
    expect(Math.round(mmToPx(25.4))).toBe(96);
  });

  it('uses the A4 page size', () => {
    expect(A4_WIDTH_PX).toBe(794);
    expect(A4_HEIGHT_PX).toBe(1123);
  });

  it('subtracts the margin from both dimensions', () => {
    const box = a4ContentBox(18);

    // 18mm is ~68px, so both sides together remove ~136px.
    expect(box.width).toBeLessThan(A4_WIDTH_PX);
    expect(box.height).toBeLessThan(A4_HEIGHT_PX);
    expect(box.width).toBe(Math.floor(A4_WIDTH_PX - 2 * mmToPx(18)));
    expect(box.height).toBe(Math.floor(A4_HEIGHT_PX - 2 * mmToPx(18)));
  });

  it('leaves a content box tall enough to hold an entry', () => {
    // Guards against a margin typo silently making every page fit nothing, which
    // would put one block per sheet.
    expect(a4ContentBox(18).height).toBeGreaterThan(900);
  });

  it('returns the full page for a zero margin', () => {
    expect(a4ContentBox(0)).toEqual({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });
  });
});

describe('paginateBlocks — fitting', () => {
  const block = (height: number, extra: Partial<MeasuredBlock> = {}): MeasuredBlock => ({
    html: `<div style="height:${height}px">h${height}</div>`,
    height,
    ...extra,
  });

  it('puts everything on one page when it fits', () => {
    const pages = paginateBlocks([block(100), block(200)], 1000, 645);

    expect(pages).toHaveLength(1);
    expect(pages[0].height).toBe(1000);
    expect(pages[0].width).toBe(645);
  });

  it('starts a new page when the next block does not fit', () => {
    const pages = paginateBlocks([block(600), block(600)], 1000, 645);

    expect(pages).toHaveLength(2);
    expect(pages[0].bodyHtml).toContain('h600');
  });

  it('fills a page before breaking rather than breaking early', () => {
    // 3 x 300 = 900, fits in 1000; a fourth would overflow.
    const pages = paginateBlocks([block(300), block(300), block(300), block(300)], 1000, 645);

    expect(pages).toHaveLength(2);
    expect(countOccurrences(pages[0].bodyHtml, 'style="height:300px"')).toBe(3);
    expect(countOccurrences(pages[1].bodyHtml, 'style="height:300px"')).toBe(1);
  });

  it('preserves document order across pages', () => {
    const blocks = [block(600, { html: '<div>A</div>' }), block(600, { html: '<div>B</div>' })];

    const pages = paginateBlocks(blocks, 1000, 645);

    expect(pages[0].bodyHtml).toContain('A');
    expect(pages[1].bodyHtml).toContain('B');
  });

  it('always returns at least one page', () => {
    // An empty resume still has to print a sheet.
    const pages = paginateBlocks([], 1000, 645);

    expect(pages).toHaveLength(1);
    expect(pages[0].bodyHtml).toBe('');
  });
});

describe('paginateBlocks — heading stays with its first entry', () => {
  const heading = (title: string, height = 40): MeasuredBlock => ({
    html: `<h2>${title}</h2>`,
    height,
    isHeading: true,
    title,
  });
  const entry = (name: string, height: number): MeasuredBlock => ({
    html: `<div class="resume-entry">${name}</div>`,
    height,
  });

  it('does not leave a heading as the last thing on a page', () => {
    // 700 of 1000 used; the heading (40) fits but its entry (400) does not. Without
    // the glue rule the heading would be orphaned at the bottom of page 1.
    const pages = paginateBlocks(
      [
        { html: '<div class="filler">filler</div>', height: 700 },
        heading('工作经历'),
        entry('某某科技', 400),
      ],
      1000,
      645
    );

    expect(pages).toHaveLength(2);
    expect(pages[0].bodyHtml).not.toContain('工作经历');
    expect(pages[1].bodyHtml).toContain('工作经历');
    expect(pages[1].bodyHtml).toContain('某某科技');
  });

  it('wraps heading and entry in an unbreakable group', () => {
    // The wrapper is what actually keeps them together on paper; adjacency alone
    // is not enough for Chrome.
    const pages = paginateBlocks([heading('技能'), entry('Go、PostgreSQL', 100)], 1000, 645);

    expect(pages[0].bodyHtml).toContain('resume-section-group');
    const groupStart = pages[0].bodyHtml.indexOf('resume-section-group');
    const groupEnd = pages[0].bodyHtml.indexOf('</div>', groupStart);
    expect(pages[0].bodyHtml.slice(groupStart, groupEnd)).toContain('技能');
  });

  it('does not emit a glued entry twice', () => {
    const pages = paginateBlocks([heading('技能'), entry('Go', 100)], 1000, 645);
    const all = pages.map((p) => p.bodyHtml).join('');

    expect(countOccurrences(all, '>Go<')).toBe(1);
  });

  it('records the section titles each page carries', () => {
    const pages = paginateBlocks(
      [heading('工作经历'), entry('A', 400), heading('教育经历'), entry('B', 400)],
      500,
      645
    );

    expect(pages.flatMap((p) => p.sectionTitles)).toEqual(['工作经历', '教育经历']);
  });

  it('emits a trailing heading on its own rather than dropping it', () => {
    // Degenerate input: a heading with nothing after it. It must still appear.
    const pages = paginateBlocks([heading('孤零零的标题')], 1000, 645);

    expect(pages).toHaveLength(1);
    expect(pages[0].bodyHtml).toContain('孤零零的标题');
  });
});

describe('paginateBlocks — oversized block', () => {
  it('flags an entry taller than a whole page instead of splitting it silently', () => {
    // `break-inside: avoid` cannot be honoured here, so the honest response is to
    // record it rather than pretend the entry was kept whole.
    const pages = paginateBlocks(
      [{ html: '<div class="resume-entry">huge</div>', height: 5000 }],
      1000,
      645
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].hasOversizedBlock).toBe(true);
  });

  it('gives an oversized block its own page', () => {
    const pages = paginateBlocks(
      [
        { html: '<div class="filler">filler</div>', height: 300 },
        { html: '<div class="resume-entry">huge</div>', height: 5000 },
        { html: '<div>after</div>', height: 100 },
      ],
      1000,
      645
    );

    expect(pages).toHaveLength(3);
    expect(pages[1].bodyHtml).toContain('huge');
    expect(pages[1].hasOversizedBlock).toBe(true);
    expect(pages[2].bodyHtml).toContain('after');
  });

  it('does not flag ordinary pages', () => {
    const pages = paginateBlocks([{ html: '<div>x</div>', height: 100 }], 1000, 645);

    expect(pages[0].hasOversizedBlock).toBeUndefined();
  });
});

describe('buildPrintDocument — paginated output', () => {
  const pages: PrintPage[] = [
    { headerHtml: '', bodyHtml: '<h1>张三</h1>', width: 645, height: 950, sectionTitles: [] },
    {
      headerHtml: '<div>张三 · 13800138000</div>',
      bodyHtml: '<div class="resume-entry">某某科技</div>',
      width: 645,
      height: 950,
      sectionTitles: ['工作经历'],
    },
  ];

  it('emits one sheet per page', () => {
    const html = buildPrintDocument(parts({ pages }));

    expect(countOccurrences(html, 'class="resume-page"')).toBe(2);
  });

  it('sizes each sheet to the content box', () => {
    const html = buildPrintDocument(parts({ pages }));

    expect(html).toContain('width: 645px');
    expect(html).toContain('height: 950px');
  });

  it('places the header wherever the page carries one', () => {
    // The builder renders a header when a page has one; deciding *which* pages get
    // it is the caller's job (`paginatePrintRoot` puts it on all of them). This
    // guards the rendering, not the policy.
    const withHeader: PrintPage[] = [
      { headerHtml: '<div>张三</div>', bodyHtml: '<div>a</div>', width: 645, height: 950, sectionTitles: [] },
      { headerHtml: '', bodyHtml: '<div>b</div>', width: 645, height: 950, sectionTitles: [] },
    ];

    const html = buildPrintDocument(parts({ pages: withHeader }));
    const [first, second] = html.split('class="resume-page"').slice(1);

    expect(first).toContain('resume-page-header');
    expect(second).not.toContain('resume-page-header');
  });

  it('renders a headerless page without an empty header element', () => {
    const headerless: PrintPage[] = [
      { headerHtml: '', bodyHtml: '<div>a</div>', width: 645, height: 950, sectionTitles: [] },
    ];

    const html = buildPrintDocument(parts({ pages: headerless }));
    const [onlyPage] = html.split('class="resume-page"').slice(1);

    expect(onlyPage).not.toContain('resume-page-header');
    expect(onlyPage).toContain('<div>a</div>');
  });

  it('includes every page body', () => {
    const html = buildPrintDocument(parts({ pages }));

    expect(html).toContain('张三');
    expect(html).toContain('某某科技');
  });

  it('keeps the verification payload even when paginated', () => {
    // Pagination must not cost us the ability to check the produced file.
    const html = buildPrintDocument(parts({ pages, text: '张三\n某某科技' }));

    expect(extractVerificationPayloadFromHtml(html)?.text).toBe('张三\n某某科技');
  });

  it('falls back to a single flowing block when no pages are given', () => {
    const html = buildPrintDocument(parts());

    expect(html).toContain('id="resume-print-root"');
    expect(html).not.toContain('class="resume-page"');
  });
});

describe('PRINT_RESUME_CSS — pagination rules', () => {
  it('breaks between sheets', () => {
    expect(PRINT_RESUME_CSS).toMatch(/\.resume-page\s*\+\s*\.resume-page\s*\{[^}]*break-before:\s*page/);
  });

  it('never splits a sheet it was told the size of', () => {
    expect(PRINT_RESUME_CSS).toMatch(/\.resume-page\s*\{[^}]*break-inside:\s*avoid/);
  });

  it('keeps heading and first entry together via a wrapper', () => {
    expect(PRINT_RESUME_CSS).toMatch(/\.resume-section-group\s*\{[^}]*break-inside:\s*avoid/);
  });

  it('sets orphans and widows', () => {
    expect(PRINT_RESUME_CSS).toContain('orphans: 2');
    expect(PRINT_RESUME_CSS).toContain('widows: 2');
  });

  it('zeroes the preview padding so at-page margins do not double up', () => {
    expect(PRINT_RESUME_CSS).toMatch(/#resume-print-root\s*\{[^}]*padding:\s*0\s*!important/);
  });
});

/** Counts non-overlapping occurrences of a literal needle. */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Pulls the hidden payload out of a generated document, for round-trip tests. */
function extractVerificationPayloadFromHtml(html: string): { text: string } | undefined {
  const match = html.match(
    /<div id="resume-text-payload"[^>]*>([\s\S]*?)<\/div>/
  );
  if (!match) return undefined;

  const unescaped = match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  try {
    return JSON.parse(unescaped) as { text: string };
  } catch {
    return undefined;
  }
}
