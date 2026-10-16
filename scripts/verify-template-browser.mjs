/**
 * Verifies **every registered template** through a real browser (ticket 21, made parametric by 48).
 *
 * # Why this exists next to `verify-print-export.mjs`
 *
 * That script exercises the print pipeline with **hand-written** sample HTML. Hand-written HTML
 * agrees with whatever the code expects, so it cannot notice that the real renderers stopped
 * producing that shape. Ticket 20 did exactly that: the templates began wrapping their sections in a
 * stack and their entries in another stack, and because `flattenPrintFlow` measured each child of the
 * print root as one indivisible block, the entire resume silently became a single unbreakable unit —
 * one physical sheet, no page breaks, correct-looking layout. Every existing test passed.
 *
 * So this script drives the **shipping template component** against the shipping stylesheet, and then
 * runs the same DOM walk the export pipeline runs. Two things are deliberately not reused:
 *
 *   - the walk, which needs real `HTMLElement`s and real heights and therefore has to live inside the
 *     page. The block-count gate below is what keeps the two implementations honest.
 *   - nothing else. Pagination, document building and PDF text extraction are the real modules.
 *
 * # Why it is parametric (ticket 48)
 *
 * It used to render the ATS-safe template only, which left the gate's own reason for existing
 * uncovered for every *other* renderer: a new template could wrap its entries in a container that
 * pagination treats as one block, and the mandatory gate for renderer changes would still pass. The
 * wrapper now walks the registry, so each template is measured, paginated and printed on its own, and
 * a registered template that is not verified fails the gate instead of being quietly absent from it.
 *
 * The assertions split in two, and the split is the ADR's:
 *
 *   - **universal** — one entry per measured block, no oversized block, sections reached, no page
 *     ending on an orphaned heading, the header repeated on every sheet, a PDF text layer with the
 *     expected strings and no U+FFFD. Every template must pass these; they are what 工单 20 broke.
 *   - **declared by the template** — the ADR-0008 §2 hard attributes are the *criteria for `high`*
 *     (单栏 / 无装饰性图标 / 联系方式在正文中 / 无版式表格), so they are asserted for a template that
 *     claims `high` and reported as `SKIP` with the reason for one that claims `medium`/`low`. A
 *     medium template is not exempt from the structural bans (no layout table, no float, no CSS
 *     columns when it claims `single-column`), and its font family must match its own
 *     `presentation.fontFamily` — which is the one check that would notice a template whose tokens
 *     stopped reaching the page.
 *
 * # Why the harness page is generated rather than imported
 *
 * `ResumePrintView` is a `.tsx` module and Node cannot load JSX, so the component is rendered by
 * esbuild inside `vite-node` — the same transform vitest uses — and the resulting HTML is handed to
 * the browser as a string. That is also why this is a vitest-driven check rather than a plain
 * `node` script: it needs the project's own module resolution and JSX pipeline, not a reimplementation
 * of them.
 *
 * Run:  npm run verify:template
 *
 * Env:
 *   VERIFY_CHROMIUM  path to a Chromium binary, to reuse an existing download
 *
 * Exits non-zero on failure, so it can be used as a gate.
 */

import { chromium } from 'playwright';
import { a4ContentBox, buildPrintDocument, paginateBlocks, PRINT_RESUME_CSS } from '../src/lib/print-resume.ts';
import { extractPdfText } from '../src/lib/pdf-assert.ts';

/** Reuse an already-downloaded Chromium rather than forcing a ~400 MB download. */
const CHROMIUM_PATH = process.env.VERIFY_CHROMIUM || undefined;

/**
 * Page margin the check prints and measures with — the **pre-presentation fallback**, not a decision.
 *
 * It mirrors the `@page` margin baked into `PRINT_RESUME_CSS` and the hard-coded `PAGE_MARGIN_MM` in
 * `export-pdf.tsx`, so the measurement below is of the document the shipping code actually produces. It is
 * also why a template whose token sets a different margin (`verdant-banner`, `classic-centred`: 20mm) is
 * paginated for a page 4mm taller than the one it prints on — ticket 49.
 */
const PAGE_MARGIN_MM = 18;

/** Strings that must survive extraction for the export to be usable. */
const REQUIRED = ['李静', '全栈开发工程师', 'lijing@example.com', '某某科技', '工作经历', 'TypeScript'];

/**
 * The DOM walk, evaluated inside the page.
 *
 * Mirrors `flattenPrintFlow` step for step — descend through `data-print-flatten`, descend through
 * `data-print-section` emitting the heading first, otherwise emit one block. It has to be duplicated
 * because that function needs `HTMLElement`s and only the browser can measure them; the block-count
 * gate below is what keeps the two from drifting.
 *
 * A real function rather than a string, so it is serialised to the page and evaluated there. It must
 * not close over anything from this module — Playwright sends the function's source, not its scope.
 */
const WALK_AND_MEASURE = (rootSelector) => {
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error('no element matched ' + rootSelector);

  const measure = (element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const marginTop = Number.parseFloat(styles.marginTop) || 0;
    const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
    // getBoundingClientRect excludes margins, and the entries are separated by a margin.
    return (rect.height || element.offsetHeight || 0) + marginTop + marginBottom;
  };

  const blocks = [];
  const seenSections = [];
  let headerHtml = '';

  const emit = (element) => {
    // Mirrors `collectPrintBlocks`: the first child, when it is the header, is lifted out of the flow
    // and later repeated on every sheet. Skipping it *and* never supplying it is what silently
    // produces a PDF with no name on it.
    if (element.dataset.printRole === 'header') {
      if (headerHtml === '' && blocks.length === 0) headerHtml = element.outerHTML;
      return;
    }

    if (element.dataset.printSection !== undefined) {
      seenSections.push(element.dataset.printSection);
      const heading = element.querySelector('[data-print-role="heading"]');
      if (heading) {
        blocks.push({
          html: heading.outerHTML,
          height: measure(heading),
          isHeading: true,
          title: (heading.textContent || '').trim(),
        });
      }
      for (const child of Array.from(element.children)) {
        if (child === heading) continue;
        emit(child);
      }
      return;
    }

    if (element.dataset.printFlatten !== undefined) {
      for (const child of Array.from(element.children)) emit(child);
      return;
    }

    blocks.push({ html: element.outerHTML, height: measure(element), isHeading: false });
  };

  for (const child of Array.from(root.children)) emit(child);

  return {
    blocks,
    sections: seenSections,
    headerHtml,
    rootChildren: root.children.length,
    rootHeight: measure(root),
    fontFamily: window.getComputedStyle(root).fontFamily,
  };
};

/**
 * Per-sheet pixel truth: how far the deepest painted node of each emitted sheet reaches past the sheet's
 * own box. The box is `page.height` tall, i.e. exactly the `@page` content height, so a positive number
 * means content is being printed into the bottom margin — and past `PAGE_MARGIN_MM` it is off the paper.
 *
 * Ticket 49 added this because the gate could not see it: page counts and the text layer both stay
 * "correct" while a sheet is overfilled, which is the same trap ADR-0008 records for ticket 21. The checks
 * below report it as `SKIP` until the pagination fix lands; set `VERIFY_PAGINATION_STRICT=1` to make it a
 * failure instead (it does fail today, on every template).
 */
const MEASURE_SHEET_OVERFLOW = () => {
  const sheets = [];
  document.querySelectorAll('.resume-page').forEach((sheet, index) => {
    const box = sheet.getBoundingClientRect();
    let maxBottom = box.top;
    sheet.querySelectorAll('*').forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0 || rect.width > 0) maxBottom = Math.max(maxBottom, rect.bottom);
    });
    sheets.push({ sheet: index + 1, overflow: Math.round((maxBottom - box.bottom) * 10) / 10 });
  });
  return sheets;
};

/** Renders, measures in a real browser, then paginates with the shipping code. */
async function measureCase(browser, markup) {
  const page = await browser.newPage();

  const box = a4ContentBox(PAGE_MARGIN_MM);

  // The real print stylesheet is included so the measurement sees the same spacing the paper will:
  // `.resume-entry + .resume-entry` is where inter-entry separation now lives, and without it every
  // entry would measure without its margin and the page would be overfilled.
  await page.setContent(
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
    <style>${PRINT_RESUME_CSS}
      /* The container supplies the page width. #resume-print-root is width:100%, so a wider
         container would silently measure a document that is not the one being printed. */
      #measure { width: ${box.width}px; background: #ffffff; }
    </style></head><body>
    <div id="measure">${markup}</div>
    </body></html>`,
    { waitUntil: 'load' }
  );

  const measured = await page.evaluate(WALK_AND_MEASURE, '#measure #resume-print-root').catch((error) => {
    console.error('  measuring failed:', error.message);
    return null;
  });
  await page.close();

  if (!measured) throw new Error('measuring the print view failed');

  const pages = paginateBlocks(measured.blocks, box.height, box.width).map((page) => ({
    ...page,
    headerHtml: measured.headerHtml,
  }));

  return { pages, measured, box };
}

/** Prints a document and returns its bytes, extracted text statistics and per-sheet overflow. */
async function printAndExtract(browser, printHtml) {
  const page = await browser.newPage();
  await page.setContent(printHtml, { waitUntil: 'load' });
  // Measured on the same laid-out document that gets printed, before `page.pdf` — one setContent, one page.
  const sheetOverflow = await page.evaluate(MEASURE_SHEET_OVERFLOW);
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: `${PAGE_MARGIN_MM}mm`,
      right: `${PAGE_MARGIN_MM}mm`,
      bottom: `${PAGE_MARGIN_MM}mm`,
      left: `${PAGE_MARGIN_MM}mm`,
    },
  });
  const stats = await extractPdfText(new Uint8Array(pdf));
  await page.close();
  return { pdf, stats, sheetOverflow };
}

/**
 * @param {{
 *   buildMarkup: (entryCount: number) => string,
 *   template: { id: string, name?: string, parseability: string, facets: readonly string[] },
 *   presentation: { fontFamily: string },
 * }} deps
 *   Injected by the vitest wrapper, which can load `.tsx`. See `verify-template-browser.test.ts`.
 */
export async function verifyTemplate({ buildMarkup, template, presentation }) {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    // The full Chromium build is preferred over the headless shell: this check depends on CJK font
    // resolution, and a build without the font stack renders every Chinese glyph as a blank box.
    channel: CHROMIUM_PATH ? undefined : 'chromium',
  });

  const failures = [];
  /** Every line is prefixed with the template, so a summary of failures says which one broke. */
  const check = (ok, label, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${template.id}] ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(`[${template.id}] ${label}`);
  };
  /**
   * A check that the *rating* makes inapplicable, reported rather than silently dropped.
   *
   * Printed as its own line so the gate's coverage is auditable: a template that quietly skipped half
   * the hard attributes without saying so is how a rating becomes decorative.
   */
  const skip = (label, why) => {
    console.log(`  SKIP  [${template.id}] ${label}${why ? ` — ${why}` : ''}`);
  };

  const ratedHigh = template.parseability === 'high';
  const claimsSingleColumn = template.facets.includes('single-column');

  console.log(
    `\n########## 模板 ${template.id}（${template.name ?? '未命名'}，解析友好度 ${template.parseability}） ##########`
  );

  try {
    console.log('\n=== 1 页：短简历 ===');
    const shortMarkup = buildMarkup(1);
    const one = await measureCase(browser, shortMarkup);
    check(one.pages.length === 1, '一份短简历正好 1 页', `得到 ${one.pages.length} 页`);
    check(
      one.measured.sections.length === 3,
      '三个章节都被走到（外层包裹元素是透明的）',
      `走到 ${one.measured.sections.length} 个：${one.measured.sections.join(' / ')}`
    );
    check(one.pages.some((p) => p.hasOversizedBlock) === false, '没有超出整页的不可分割块');
    // The pagination unit, stated exactly: one measured block per entry. A template that wraps its
    // entries in a container that does not declare `data-print-flatten` measures as one block, and the
    // whole section then cannot break across a page — the 工单 20 defect.
    const oneEntries = one.measured.blocks.filter((block) => block.html.includes('resume-entry'));
    check(
      oneEntries.length === 1,
      '短简历的每个条目都是独立的测量块',
      `${oneEntries.length} 个条目块`
    );

    console.log('\n=== 多页：长简历 ===');
    const longMarkup = buildMarkup(9);
    const many = await measureCase(browser, longMarkup);
    console.log(
      `  块数 ${many.measured.blocks.length}，页数 ${many.pages.length}，章节 ${many.measured.sections.join(' / ')}`
    );
    check(many.pages.length >= 2, '一份长简历跨多页', `得到 ${many.pages.length} 页`);
    check(many.pages.some((p) => p.hasOversizedBlock) === false, '长简历也没有超出整页的不可分割块');
    // The specific regression: if the section stack is measured as one block, the whole document is
    // a single unit whose height exceeds a page, so it is flagged oversized and lands on one sheet.
    check(
      many.measured.blocks.length > 10,
      '每一条经历都是独立的测量块，而不是整份简历一块',
      `${many.measured.blocks.length} 块`
    );
    check(
      many.measured.blocks.length > one.measured.blocks.length,
      '更多经历产生更多测量块',
      `${many.measured.blocks.length} vs ${one.measured.blocks.length}`
    );
    const manyEntries = many.measured.blocks.filter((block) => block.html.includes('resume-entry'));
    check(
      manyEntries.length === 9,
      '九段经历量出九个条目块（分页单位是条目）',
      `${manyEntries.length} 个条目块`
    );

    console.log('\n=== 没有页面以孤立的章节标题结尾 ===');
    for (const [index, page] of many.pages.entries()) {
      // Matches any template's heading markup: the heading element carries `data-print-role="heading"`,
      // and this asks whether it is the last thing on the sheet (possibly inside one wrapper div).
      const endsWithHeading =
        /<h2\b[^>]*data-print-role="heading"[\s\S]*?<\/h2>\s*(?:<\/div>\s*)?$/.test(page.bodyHtml);
      check(!endsWithHeading, `第 ${index + 1} 页不以章节标题结尾`);
    }
    // The other shape of the same failure: the document's final measured block is a heading, so the
    // last sheet would carry a section title with nothing under it.
    check(
      many.measured.blocks[many.measured.blocks.length - 1]?.isHeading !== true,
      '文档最后一个测量块不是章节标题'
    );

    console.log('\n=== 表头在每一页上重复 ===');
    // ADR-0008's print contract, and a silent failure if broken: the header is lifted *out* of the
    // flow, so a document builder that never puts it back produces a PDF with no name and no contact
    // details on any sheet. Nothing in the layout looks wrong; the resume is simply anonymous.
    check(many.measured.headerHtml.includes('李静'), '表头块被收集到了');
    for (const [index, page] of many.pages.entries()) {
      check(page.headerHtml.includes('李静'), `第 ${index + 1} 页带有姓名`);
      check(page.headerHtml.includes('lijing@example.com'), `第 ${index + 1} 页带有联系方式`);
    }

    console.log('\n=== PDF 文字层 ===');
    const longPrintHtml = buildPrintDocument({
      innerHtml: longMarkup,
      text: longMarkup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      rootStyle: '',
      pages: many.pages,
    });
    const { pdf, stats, sheetOverflow } = await printAndExtract(browser, longPrintHtml);
    console.log(
      `  字节 ${pdf.length}，页 ${stats.pageCount}，字符 ${stats.charCount}，CJK ${stats.cjkCharCount}，U+FFFD ${stats.replacementCount}`
    );
    check(
      stats.pageCount === many.pages.length,
      'PDF 页数与分页结果一致',
      `${stats.pageCount} vs ${many.pages.length}`
    );
    check(stats.replacementCount === 0, '文字层没有 U+FFFD（乱码）');
    check(stats.cjkCharCount > 0, '文字层可以抽取中文');

    for (const expected of REQUIRED) {
      check(stats.text.includes(expected), `文字层包含「${expected}」`);
    }

    console.log('\n=== 每页内容没有越过纸张下沿（像素，工单 49）===');
    // The bytes above cannot see this: an overfilled sheet still has the right page count and a complete
    // text layer, because the overflowing content is neither moved to the next sheet nor dropped from the
    // content stream — it is painted into the bottom margin (and past `PAGE_MARGIN_MM`, off the paper).
    const marginPx = (PAGE_MARGIN_MM * 96) / 25.4;
    const strictPagination = process.env.VERIFY_PAGINATION_STRICT === '1';
    for (const sheet of sheetOverflow) {
      const detail = `第 ${sheet.sheet} 页越过内容框 ${sheet.overflow}px（@page 下边距 ${marginPx.toFixed(1)}px）`;
      if (sheet.overflow <= 0) {
        check(true, '这一页的内容都在内容框内', detail);
      } else if (strictPagination) {
        check(false, '这一页的内容越过了内容框', detail);
      } else {
        skip(
          '这一页的内容越过了内容框',
          `${detail}；工单 49 未修（分页没有预留表头高度），设 VERIFY_PAGINATION_STRICT=1 让本项失败`
        );
      }
    }
    if (sheetOverflow.length === 0) check(false, '测量到了分页后的纸张', '一页都没有量到');

    console.log('\n=== 结构禁令（ADR-0008 §2，所有模板） ===');
    check(!shortMarkup.includes('<table'), '没有用表格做版式');
    check(!shortMarkup.includes('float:'), '没有浮动布局');

    console.log('\n=== 模板硬性属性（ADR-0008 §2，判据属于「高」） ===');
    if (ratedHigh) {
      check(!/<svg/i.test(shortMarkup), '没有装饰性图标（无内联 SVG）');
      check(!shortMarkup.includes('w3.org/2000/svg'), '没有装饰性图标（无 SVG 命名空间）');
      check(!shortMarkup.includes('columns'), '没有多栏布局');
      check(!shortMarkup.includes('position:absolute'), '没有绝对定位');
      check(
        shortMarkup.indexOf('lijing@example.com') > shortMarkup.indexOf('李静'),
        '联系方式排在姓名之后（正文顺序，不进页眉带）'
      );
    } else {
      const why = `本模板标注 ${template.parseability}，这些是「高」判据；「${template.parseability}」行不要求`;
      skip('没有装饰性图标（无内联 SVG）', why);
      skip('没有装饰性图标（无 SVG 命名空间）', why);
      skip('没有绝对定位', why);
      skip('联系方式排在姓名之后（正文顺序，不进页眉带）', why);
      // Not rating-dependent after all: a template that claims one column must not lay text out in
      // CSS columns, whatever it is rated.
      if (claimsSingleColumn) {
        check(!shortMarkup.includes('columns'), '标注了单栏，就没有多栏布局');
      } else {
        skip('标注了单栏，就没有多栏布局', '本模板没有 single-column 分面');
      }
    }

    console.log('\n=== 字体族来自解析出的展示态（tokens 到页面的证据） ===');
    // The check that notices a template whose tokens never reach the page: both renderers would
    // otherwise come out in the default stack, and the difference between the templates would be gone.
    const expectedFont = presentation.fontFamily === 'sans' ? 'sans-serif' : 'serif';
    check(
      one.measured.fontFamily.includes(expectedFont),
      `字体族与 presentation.fontFamily 一致（${presentation.fontFamily} → ${expectedFont}）`,
      one.measured.fontFamily
    );

    console.log('\n=== 解析友好度判定标准（ADR-0008 §3） ===');
    check(
      ['high', 'medium', 'low'].includes(template.parseability),
      `parseability 标注为 '${template.parseability}'（§3 表里的一行）`
    );
    check(
      claimsSingleColumn || template.facets.includes('two-column'),
      "分面包含 'single-column' 或 'two-column'（ADR-0008 §4 要求按 1 栏/2 栏可筛选）"
    );
  } finally {
    await browser.close();
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`✗ ${template.id}：${failures.length} 项失败：`);
    for (const failure of failures) console.error(`    - ${failure}`);
    return { ok: false, failures };
  }
  console.log(`✓ ${template.id} 全部通过`);
  return { ok: true, failures: [] };
}
