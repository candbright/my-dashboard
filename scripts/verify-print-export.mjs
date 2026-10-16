/**
 * Verifies the browser-print export in a real browser.
 *
 * Two things can only be checked here, never in vitest:
 *
 *   1. That the print pipeline yields a PDF with a real, character-correct text
 *      layer (ticket 03).
 *   2. That pagination puts breaks in the right places and repeats the header on
 *      every sheet (ticket 04).
 *
 * Both need a layout engine: Chrome has no programmatic API for the print
 * *dialog*, and real element heights only exist once the browser has laid the
 * document out. This drives the same engine through `page.pdf()`, which uses the
 * identical print stylesheet, so the extracted text and page count are
 * representative.
 *
 * It uses the REAL `buildPrintDocument`, `paginateBlocks` and `extractPdfText`.
 * Height measurement is done in the page (that is the part that needs a browser),
 * everything else is the shipping code.
 *
 * Run:  npm run verify:print
 *
 * Env:
 *   VERIFY_CHROMIUM  path to a Chromium binary, to reuse an existing download
 *
 * Exits non-zero on failure, so it can be used as a gate.
 */

import { chromium } from 'playwright';
import { buildPrintDocument, a4ContentBox, paginateBlocks } from '../src/lib/print-resume.ts';
import { extractPdfText } from '../src/lib/pdf-assert.ts';

/**
 * Optional path to a Chromium executable.
 *
 * Set `VERIFY_CHROMIUM` to reuse an already-downloaded build. This matters in
 * practice: Playwright pins an exact browser revision, and a machine that already
 * has a different one cached (for another tool, say) would otherwise be forced
 * into a ~400 MB download just to run this check.
 */
const CHROMIUM_PATH = process.env.VERIFY_CHROMIUM || undefined;

const PAGE_MARGIN_MM = 18;

/** Strings that must survive extraction for the export to be usable. */
const REQUIRED = ['张三', '后端工程师', '某某科技', 'PostgreSQL', '工作经历', '13800138000'];

/**
 * A resume-shaped document using the same inline-style, no-CSS-variable approach
 * as `ResumePrintView`, including the print classes and roles the stylesheet and
 * pagination rely on.
 *
 * @param entries How many experience entries to emit. 1 gives a one-page resume;
 *   more pushes it to two and three pages.
 */
function buildSampleResumeHtml(entries) {
  const experienceEntries = Array.from({ length: entries }, (_, index) => `
    <div class="resume-entry" style="margin-bottom: 18px;">
      <div style="display: flex; justify-content: space-between;">
        <strong style="font-size: 15px;">某某科技 ${index + 1}</strong>
        <span style="font-size: 13px; color: #78716c;">2021.03 - 至今</span>
      </div>
      <p style="font-size: 14px; margin: 4px 0 6px; color: #57534e;">高级后端工程师</p>
      <ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7;">
        <li>负责简历解析服务，QPS 提升 3 倍，P99 延迟下降 40%，相关经验覆盖 Go 与 PostgreSQL</li>
        <li>主导 PostgreSQL 分库分表改造，支撑日均两千万次查询与峰值每秒八千次写入</li>
        <li>设计中文分词与字段映射管道，解析准确率提升至 96%，并接入 Kubernetes 弹性伸缩</li>
      </ul>
    </div>`).join('');

  return `
<div data-print-role="header" style="text-align: center; margin-bottom: 32px;">
  <h1 style="font-size: 32px; margin: 0 0 6px;">张三</h1>
  <p style="font-size: 15px; margin: 0 0 10px; color: #57534e;">后端工程师</p>
  <p style="font-size: 13px; margin: 0; color: #78716c;">
    zhangsan@example.com · 13800138000 · 上海
  </p>
</div>

<hr style="border: none; border-top: 1.5px solid #d6d3d1; margin: 0 0 28px 0;" />

<section data-print-section="工作经历" style="margin-bottom: 24px;">
  <div class="resume-section-heading" data-print-role="heading" style="font-size: 17px; margin: 0 0 12px; color: #5c4033;">工作经历</div>
  ${experienceEntries}
</section>

<section data-print-section="技能" style="margin-bottom: 24px;">
  <div class="resume-section-heading" data-print-role="heading" style="font-size: 17px; margin: 0 0 12px; color: #5c4033;">技能</div>
  <p style="font-size: 14px; margin: 0; line-height: 1.7;">Go、PostgreSQL、Kubernetes、中文分词、分布式系统、性能调优、可观测性建设</p>
</section>

<section data-print-section="教育经历" style="margin-bottom: 24px;">
  <div class="resume-section-heading" data-print-role="heading" style="font-size: 17px; margin: 0 0 12px; color: #5c4033;">教育经历</div>
  <div class="resume-entry">
    <div style="display: flex; justify-content: space-between;">
      <strong style="font-size: 15px;">某某大学</strong>
      <span style="font-size: 13px; color: #78716c;">2014.09 - 2018.06</span>
    </div>
    <p style="font-size: 14px; margin: 4px 0 0; color: #57534e;">计算机科学与技术 · 本科</p>
  </div>
</section>`;
}

function log(step, detail = '') {
  console.log(`  ${step}${detail ? ` — ${detail}` : ''}`);
}

/**
 * The tree of things to measure, in document order.
 *
 * `measureTree` is evaluated **inside the page**. It mirrors
 * `flattenPrintFlow`'s structural rules — the entry is the unit, a section's
 * heading travels with it — but takes only measurements. The decisions that turn
 * those measurements into pages are then made in Node by the real library, so the
 * logic under test is the shipping logic.
 */
const MEASURE_TREE = (selector) => {
  const root = document.querySelector(selector);
  if (!root) throw new Error(`no element matches ${selector}`);

  const measure = (element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const marginTop = Number.parseFloat(styles.marginTop) || 0;
    const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
    // getBoundingClientRect excludes margins, and the sections rely on them.
    return (rect.height || element.offsetHeight || 0) + marginTop + marginBottom;
  };

  const describe = (element) => {
    const isHeading = element.dataset.printRole === 'heading' ||
      element.classList.contains('resume-section-heading');
    return {
      tag: element.tagName,
      html: element.outerHTML,
      title: isHeading ? (element.textContent || '').trim() : undefined,
      isHeading,
      isSection: element.dataset.printSection !== undefined,
      isEntry: element.dataset.printEntry !== undefined,
    };
  };

  const out = { header: '', blocks: [] };
  for (const child of Array.from(root.children)) {
    const info = describe(child);

    if (child.dataset.printRole === 'header') {
      out.header = info.html;
      continue;
    }

    if (info.isSection) {
      const children = [];
      for (const entry of Array.from(child.children)) {
        const entryInfo = describe(entry);
        if (entryInfo.isHeading) {
          children.push({ ...entryInfo, kind: 'heading', height: measure(entry) });
          continue;
        }
        // The heading is handled above; every other child of a section is an entry.
        children.push({ ...entryInfo, kind: 'entry', height: measure(entry) });
      }
      out.blocks.push({ ...info, kind: 'section', height: measure(child), children });
      continue;
    }

    out.blocks.push({ ...info, kind: 'block', height: measure(child) });
  }

  return out;
};

/**
 * Turns the measured tree into `MeasuredBlock[]`, mirroring `flattenPrintFlow`:
 * a section contributes its heading and then each entry as separate breakable
 * blocks, so a section taller than a page can span pages instead of monopolising
 * one. Root order is preserved.
 */
function treeToBlocks(measured) {
  const blocks = [];

  for (const node of measured.blocks) {
    if (node.kind === 'section') {
      for (const child of node.children) {
        blocks.push({
          html: child.html,
          height: child.height,
          isHeading: child.isHeading,
          title: child.isHeading ? child.title : undefined,
        });
      }
      continue;
    }

    blocks.push({
      html: node.html,
      height: node.height,
      isHeading: node.isHeading,
      title: node.isHeading ? node.title : undefined,
    });
  }

  return blocks;
}

/**
 * Measures the sample resume in a real layout, then paginates it with the real
 * shipping functions and builds the real document.
 *
 * Measurement and pagination both run inside the page: heights only exist after a
 * layout, and the measuring callback is a DOM function, so keeping the flow
 * (`flattenPrintFlow` → `paginateBlocks`) on the same side of the boundary avoids
 * shipping a closure across it.
 */
async function renderCase(browser, entryCount) {
  const page = await browser.newPage();

  // The measuring container must be laid out with the same usable width as the
  // printed page, or every measured height would be wrong.
  const box = a4ContentBox(PAGE_MARGIN_MM);
  const innerHtml = buildSampleResumeHtml(entryCount);

  await page.setContent(
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 0; background: #fff; }
      #measure { width: ${box.width}px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
        font-size: 14px; line-height: 1.6; color: #292524; }
      p, li { orphans: 2; widows: 2; }
    </style></head><body>
    <div id="measure">${innerHtml}</div>
    </body></html>`,
    { waitUntil: 'load' }
  );

  // Measure inside the page: heights only exist after a layout, and computeStyles
  // is a DOM function. Every decision that turns measurements into pages is then
  // made in Node by the real library.
  const measured = await page.evaluate(MEASURE_TREE, '#measure').catch((error) => {
    console.error('  measuring failed:', error.message);
    return null;
  });
  await page.close();

  if (!measured) {
    throw new Error('measuring the sample resume failed');
  }

  const blocks = treeToBlocks(measured);
  const sourceText = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // The real packing rules, on real measurements.
  const pages = paginateBlocks(blocks, box.height, box.width).map((page) => ({
    ...page,
    headerHtml: measured.header,
  }));

  const printHtml = buildPrintDocument({
    innerHtml,
    text: sourceText,
    rootStyle: '',
    pages,
  });

  return { printHtml, sourceText, pages, measured, blocks };
}

/** Prints a document and returns its bytes plus extracted text statistics. */
async function printAndExtract(browser, printHtml) {
  const page = await browser.newPage();
  await page.setContent(printHtml, { waitUntil: 'load' });

  // Confirm the print-only rules hide app chrome under the print media, which is
  // the "no navbar/footer/editor UI" acceptance criterion.
  await page.emulateMedia({ media: 'print' });
  const chromeHidden = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'no-print';
    probe.textContent = 'SHOULD NOT PRINT';
    document.body.appendChild(probe);
    const hidden = getComputedStyle(probe).display === 'none';
    probe.remove();
    return hidden;
  });

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: `${PAGE_MARGIN_MM}mm`,
      bottom: `${PAGE_MARGIN_MM}mm`,
      left: `${PAGE_MARGIN_MM}mm`,
      right: `${PAGE_MARGIN_MM}mm`,
    },
  });

  await page.close();

  const stats = await extractPdfText(new Uint8Array(pdf));
  return { pdf, stats, chromeHidden };
}

/** Per-page text, so the repeated header can be checked sheet by sheet. */
async function pageTexts(pdfBytes, pageCount) {
  // pdf.js returns per-page text directly, so no extra dependency is needed for
  // what is really just "which text landed on which sheet".
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const texts = [];

  try {
    const count = Math.min(doc.numPages, pageCount ?? doc.numPages);
    for (let i = 1; i <= count; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      texts.push(
        content.items
          .map((item) => (typeof item.str === 'string' ? item.str : ''))
          .join('')
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  return texts;
}

function report(label, stats) {
  console.log(`\n  ── ${label} ──`);
  console.log(`     charCount        ${stats.charCount}`);
  console.log(`     cjkCharCount     ${stats.cjkCharCount}`);
  console.log(`     replacementCount ${stats.replacementCount}`);
  console.log(`     pageCount        ${stats.pageCount}`);
  console.log(`     ok               ${stats.ok}`);
  if (stats.reason) console.log(`     reason           ${stats.reason}`);
  console.log(
    `     text sample      ${JSON.stringify(stats.text.replace(/\s+/g, ' ').trim().slice(0, 100))}`
  );
}

async function main() {
  console.log('\nVerifying browser-print export');
  console.log(`  chromium: ${CHROMIUM_PATH ?? '(playwright default)'}\n`);

  const browser = await chromium.launch(
    CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : undefined
  );
  const failures = [];
  const box = a4ContentBox(PAGE_MARGIN_MM);

  try {
    console.log(`  content box: ${box.width} x ${box.height} px (A4, ${PAGE_MARGIN_MM}mm margin)`);

    // ── Case A: a one-page resume must stay one page ──
    const short = await renderCase(browser, 1);
    log('case A: 1 entry', `${short.pages.length} sheet(s) after pagination`);
    const shortPrint = await printAndExtract(browser, short.printHtml);
    report('case A — short resume', shortPrint.stats);

    if (!shortPrint.chromeHidden) {
      failures.push('.no-print is not hidden under print media — the app shell would print');
    }
    if (short.pages.length !== 1) {
      failures.push(`a one-page resume paginated to ${short.pages.length} sheets`);
    }
    if (shortPrint.stats.pageCount !== 1) {
      failures.push(
        `a one-page resume printed as ${shortPrint.stats.pageCount} PDF pages (blank page?)`
      );
    }
    for (const expected of REQUIRED) {
      if (!shortPrint.stats.text.includes(expected)) {
        failures.push(`case A text is missing ${JSON.stringify(expected)}`);
      }
    }
    if (shortPrint.stats.replacementCount > 0) {
      failures.push(`case A has ${shortPrint.stats.replacementCount} replacement characters`);
    }

    // ── Case B: a long resume must paginate, repeat its header, and stay readable ──
    const long = await renderCase(browser, 8);
    log('case B: 8 entries', `${long.pages.length} sheet(s) after pagination`);

    if (process.env.VERIFY_DEBUG) {
      console.log('\n  measured blocks (heading?, height, label):');
      for (const block of long.blocks) {
        console.log(
          `    ${String(Math.round(block.height)).padStart(5)}px  ` +
            `${block.isHeading ? 'HEADING' : '       '}  ${block.title ?? ''}`
        );
      }
    }

    const longPrint = await printAndExtract(browser, long.printHtml);
    report('case B — long resume', longPrint.stats);

    if (long.pages.length < 2) {
      failures.push(`a long resume paginated to only ${long.pages.length} sheet(s)`);
    }
    if (longPrint.stats.pageCount !== long.pages.length) {
      failures.push(
        `paginated to ${long.pages.length} sheets but printed as ${longPrint.stats.pageCount} PDF pages`
      );
    }
    for (const expected of ['张三', '工作经历', '某某科技 1', '某某科技 8']) {
      if (!longPrint.stats.text.includes(expected)) {
        failures.push(`case B text is missing ${JSON.stringify(expected)}`);
      }
    }

    // Per-page assertions: the repeated header, and no heading alone at the bottom.
    const texts = await pageTexts(longPrint.pdf, long.pages.length);
    log('per-page text lengths', texts.map((t) => t.replace(/\s+/g, '').length).join(', '));

    for (let i = 1; i < texts.length; i += 1) {
      if (!texts[i].includes('张三') || !texts[i].includes('13800138000')) {
        failures.push(`page ${i + 1} does not repeat the name/contact header`);
      }
    }
    if (texts[0].includes('13800138000') === false) {
      failures.push('page 1 is missing the contact details');
    }

    // A section heading must not be the last thing on a page. Compare the trailing
    // characters of each page against the known heading titles.
    const headingTitles = long.blocks
      .filter((block) => block.isHeading)
      .map((block) => block.title);
    for (let i = 0; i < texts.length - 1; i += 1) {
      const tail = texts[i].replace(/\s+/g, '').slice(-12);
      for (const title of headingTitles) {
        if (tail.endsWith(title.replace(/\s+/g, ''))) {
          failures.push(`page ${i + 1} ends with the section heading ${JSON.stringify(title)}`);
        }
      }
    }

    // ── Case C: negative control — the extractor is not always saying yes ──
    const controlPage = await browser.newPage();
    await controlPage.setContent(
      `<!DOCTYPE html><html><head><style>@page{size:A4;margin:18mm}canvas{display:block}</style></head>
       <body><canvas id="c" width="595" height="842"></canvas><script>
         const ctx = document.getElementById('c').getContext('2d');
         ctx.fillStyle='#fff'; ctx.fillRect(0,0,595,842);
         ctx.fillStyle='#292524'; ctx.font='32px serif';
         ctx.fillText('Zhang San', 40, 90);
       </script></body></html>`,
      { waitUntil: 'load' }
    );
    const controlPdf = await controlPage.pdf({ format: 'A4' });
    await controlPage.close();
    const controlStats = await extractPdfText(new Uint8Array(controlPdf));
    report('negative control (canvas page)', controlStats);

    if (controlStats.ok) {
      failures.push('the extractor accepted a PDF with no text layer — it cannot be trusted');
    }

    console.log('');
    if (failures.length > 0) {
      console.error('  ✗ FAILED');
      for (const failure of failures) console.error(`      - ${failure}`);
      console.error('');
      process.exitCode = 1;
      return;
    }

    console.log('  ✓ PASSED');
    console.log('    · print pipeline yields a searchable, selectable CJK text layer');
    console.log('    · 1-page resume stays 1 sheet; long resume paginates to '
      + `${long.pages.length} sheets with no extra blank sheet`);
    console.log('    · the name/contact header repeats on every sheet, including the first');
    console.log('    · no section heading is stranded at the bottom of a page');
    console.log('    · app chrome is hidden under print media');
    console.log('    · the extractor rejects a PDF with no text layer\n');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('\n  ✗ verification crashed:', error);
  process.exitCode = 1;
});
