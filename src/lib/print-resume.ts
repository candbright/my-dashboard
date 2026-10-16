/**
 * Browser print export — Phase 1 of ADR-0001.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANSITIONAL IMPLEMENTATION.
 *
 * The contract is defined by ADR-0007 (`RenderResume(结构化内容, 展示态) →
 * (文件字节, 渲染告警[])`). Phase 1 satisfies it with the browser's own print
 * pipeline, which is the cheapest way to obtain a real text layer. Phase 4
 * replaces this module with a real render service (Forme or headless Chromium,
 * per the ADR-0002 spike) without changing the call site's shape.
 *
 * Do not build new features on top of the iframe mechanism below; build them on
 * the `exportResumePdf` / `buildPrintDocument` shape.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Why not `html2canvas` + `jsPDF` (the previous implementation): it rasterises the
 * page, so the resulting PDF has no text layer at all and every applicant
 * tracking system fails to parse it. The browser's own print path emits real text
 * operators, which `assertPdfText` can then verify.
 *
 * Why an iframe rather than `window.print()` on the live page: the live page has
 * the navigation bar, editor chrome and toasts in it. Printing the document
 * wholesale would put all of that on the user's resume.
 */

/**
 * Print stylesheet, shared by the global `@media print` block and the iframe
 * document.
 *
 * Deliberately free of Tailwind classes and CSS custom properties. Two reasons:
 * the print document must be self-contained (an iframe does not inherit the
 * parent's stylesheet), and ADR-0001's Phase 4 renderer explicitly does not
 * support CSS variables — so writing print styles without them now avoids doing
 * the work twice.
 */
export const PRINT_RESUME_CSS = `
@page {
  size: A4;
  /* 18mm keeps a printable margin on every edge; mirrors @page margin below. */
  margin: 18mm;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}

body {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* App shell and any interactive chrome must never reach paper. */
.no-print {
  display: none !important;
}

/*
 * Keep an entry on one page. A job or degree split across a page boundary is the
 * single most common way a resume looks broken; ticket 04 extends this to
 * headings and widows/orphans.
 *
 * The margin is what separates consecutive entries, and it lives here rather than in a
 * flex gap on their container. Reason: pagination measures each entry on its own, and
 * a flex gap belongs to the container, so it contributes nothing to any individual
 * entry's measured height. The page would then be packed with entries that do not
 * actually fit. An entry margin is included in that entry's measurement, so the
 * arithmetic and the rendering agree.
 */
.resume-entry {
  break-inside: avoid;
  page-break-inside: avoid;
}

.resume-entry + .resume-entry {
  margin-top: 14px;
}

/*
 * The same correction at the section level. Consecutive sections are emitted as
 * siblings when paginated (and sit inside a flex stack when not), so their spacing must
 * survive both arrangements. In the flex case the stack gap supplies it and this rule
 * would add to it; in the paginated case nothing else supplies it at all. Sections are
 * coarser than entries, so the doubled spacing in the preview is the lesser cost — and
 * the preview is not what the user submits.
 */
.resume-section-block + .resume-section-block {
  margin-top: 22px;
}

/* A section heading should not be the last thing on a page. */
.resume-section-heading {
  break-after: avoid;
  page-break-after: avoid;
}

/*
 * No single dangling line at the top or bottom of a page (orphans/widows). Chrome
 * supports both on block containers; two is the conventional minimum for prose.
 */
p,
li,
.resume-entry,
.resume-page {
  orphans: 2;
  widows: 2;
}

/*
 * The on-screen preview is a fixed 794px (A4 at 96dpi) column. On paper the page
 * box already provides the width, so let it fill instead of overflowing — and drop
 * its built-in padding, because the at-page margin already indents the content.
 * Leaving both in place would indent twice.
 */
#resume-print-root {
  width: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
  background: #ffffff !important;
  box-shadow: none !important;
}

/*
 * Paginated output. Each .resume-page is a pre-measured sheet; the break rules
 * below stop the browser from adding a break of its own inside one.
 */
.resume-page {
  background: #ffffff;
  box-sizing: content-box;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Only the last sheet may be the final element; the rest must start a new page. */
.resume-page + .resume-page {
  break-before: page;
  page-break-before: always;
}

/* Repeated on every sheet but the first. */
.resume-page-header {
  break-after: avoid;
  page-break-after: avoid;
}

/*
 * Heading and its first entry must move together. Bare break-after: avoid on the
 * heading is not enough on its own — Chrome honours it inconsistently when the
 * next element is also unbreakable — so the heading and first entry are wrapped in
 * .resume-section-group and the whole group is kept intact.
 */
.resume-section-group {
  break-inside: avoid;
  page-break-inside: avoid;
}
`;

/** A4 in CSS pixels at 96dpi. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

/** Millimetres to CSS pixels at 96dpi, the conversion `@page` margins imply. */
export function mmToPx(mm: number): number {
  return (mm * 96) / 25.4;
}

/**
 * The printable content box for A4 with the given uniform margin.
 *
 * Derived rather than hard-coded so the pagination maths and the `@page` rule
 * cannot drift apart.
 */
export function a4ContentBox(marginMm: number): { width: number; height: number } {
  return {
    width: Math.floor(A4_WIDTH_PX - 2 * mmToPx(marginMm)),
    height: Math.floor(A4_HEIGHT_PX - 2 * mmToPx(marginMm)),
  };
}

/** One measured block of the resume, in document order. */
export interface MeasuredBlock {
  /** Outer HTML of the block. */
  html: string;
  /** Rendered height in CSS pixels, including margins. */
  height: number;
  /**
   * Set when this block is a section heading. It is kept with the block that
   * follows so a heading never becomes the last thing on a page.
   */
  isHeading?: boolean;
  /** Section title, when known. */
  title?: string;
}

/**
 * Groups a flat measurement into pages.
 *
 * Pure arithmetic, deliberately: the packing rules are the part worth testing, and
 * they should not require a layout engine or a browser to exercise.
 *
 * Rules, in order:
 *   1. A heading is glued to the block after it, forming one indivisible group.
 *   2. A group that does not fit in the remaining space starts a new page.
 *   3. A group taller than an entire page cannot be honoured, so it is placed
 *      alone and flagged rather than silently split.
 *
 * @param blocks Measured blocks in document order.
 * @param contentHeight Usable height of one page, in the same unit as `height`.
 * @param width Sheet width to emit.
 */
export function paginateBlocks(
  blocks: MeasuredBlock[],
  contentHeight: number,
  width: number
): PrintPage[] {
  // Rule 1: glue each heading to its successor.
  const groups: MeasuredBlock[][] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.isHeading && i + 1 < blocks.length) {
      groups.push([block, blocks[i + 1]]);
      i += 1;
    } else {
      groups.push([block]);
    }
  }

  const pages: PrintPage[] = [];
  let current: MeasuredBlock[] = [];
  let used = 0;
  let currentGroups: MeasuredBlock[][] = [];

  const flush = () => {
    if (current.length === 0) return;
    pages.push(makePage(current, width, contentHeight, currentGroups));
    current = [];
    currentGroups = [];
    used = 0;
  };

  for (const group of groups) {
    const groupHeight = group.reduce((sum, block) => sum + block.height, 0);

    // Rule 3: cannot ever fit. Place it on its own page and flag it.
    if (groupHeight > contentHeight) {
      flush();
      pages.push({
        ...makePage(group, width, contentHeight, [group]),
        hasOversizedBlock: true,
      });
      continue;
    }

    // Rule 2: does not fit in what is left.
    if (used + groupHeight > contentHeight) {
      flush();
    }

    current.push(...group);
    currentGroups.push(group);
    used += groupHeight;
  }

  flush();

  // An empty resume still needs one sheet, or there is nothing to print at all.
  if (pages.length === 0) {
    pages.push({ headerHtml: '', bodyHtml: '', width, height: contentHeight, sectionTitles: [] });
  }

  return pages;
}

/**
 * Builds a page's markup.
 *
 * A heading and its first entry are emitted inside a `.resume-section-group`
 * wrapper. That matters: the wrapper carries `break-inside: avoid`, which is what
 * actually keeps them together on paper. Emitting a bare heading followed by a
 * sibling entry would only place them adjacently in the DOM, and Chrome does not
 * reliably honour `break-after: avoid` on the heading when the next element is
 * itself unbreakable.
 */
function makePage(
  blocks: MeasuredBlock[],
  width: number,
  height: number,
  groups: MeasuredBlock[][]
): PrintPage {
  // Deduplicate by identity, never by markup. Two entries can legitimately have
  // identical HTML — someone with the same job title at two companies, or two
  // empty role descriptions — and keying on the string silently dropped one.
  const emitted = new Set<MeasuredBlock>();

  const parts: string[] = [];
  for (const group of groups) {
    if (group.length > 1 && group[0].isHeading) {
      for (const block of group) emitted.add(block);
      parts.push(
        `<div class="resume-section-group">${group.map((b) => b.html).join('\n')}</div>`
      );
      continue;
    }

    const block = group[0];
    // Guarded against a block reaching two groups, which must not happen; the
    // page's own `blocks` list stays authoritative for anything that did.
    if (emitted.has(block)) continue;
    emitted.add(block);
    parts.push(block.html);
  }

  // Anything on the page that no group claimed — defensive, so a future change to
  // the grouping cannot silently omit a block from the printed output.
  for (const block of blocks) {
    if (emitted.has(block)) continue;
    emitted.add(block);
    parts.push(block.html);
  }

  return {
    headerHtml: '',
    bodyHtml: parts.join('\n'),
    width,
    height,
    sectionTitles: blocks.map((block) => block.title).filter((t): t is string => Boolean(t)),
  };
}


/** What the exported document contains, for verification purposes. */
export interface PrintDocumentParts {
  /** Serialised inner markup of the print root. */
  innerHtml: string;
  /** Plain text of the document, used to verify the text layer. */
  text: string;
  /** The print root's own inline style attribute, preserved as-is. */
  rootStyle: string;
  /**
   * Pre-paginated sheets. When present these replace `innerHtml` and produce one
   * physical page each, with a repeated header. See `paginatePrintContent`.
   */
  pages?: PrintPage[];
}

/** One physical sheet of the exported document. */
export interface PrintPage {
  /** Repeated header markup (name and contact details), or empty on page 1. */
  headerHtml: string;
  /** The blocks that landed on this sheet. */
  bodyHtml: string;
  /** Content-box width in CSS pixels. */
  width: number;
  /** Content-box height in CSS pixels. */
  height: number;
  /**
   * Titles of the sections this sheet carries. Useful for asserting that a
   * heading was not left alone at the bottom of a page.
   */
  sectionTitles: string[];
  /**
   * True when a single block was taller than the whole content box and had to be
   * broken anyway. `break-inside: avoid` cannot help in that case, so it is
   * recorded instead of silently producing a split entry.
   */
  hasOversizedBlock?: boolean;
}

/**
 * Builds a self-contained HTML document that prints as the resume.
 *
 * A pure string function on purpose: it can be asserted in a unit test without a
 * browser, and it makes the "what actually reaches the printer" question
 * inspectable.
 *
 * The full text is also embedded in a `display: none` element. It contributes
 * nothing to the printed page, but it means the produced PDF carries the exact
 * text the document intended to render. `assertPdfText` can therefore compare the
 * PDF's real text layer against what was supposed to be there, instead of only
 * checking that *something* is non-empty — which would miss a font that silently
 * dropped every Chinese glyph.
 *
 * `pages` is already-paginated content (see `paginatePrintContent`). When supplied
 * it is used instead of `innerHtml`, and each page becomes its own sheet with a
 * repeated header. When omitted, the content is emitted as a single flowing block
 * and the browser's own break rules apply — the fallback path.
 */
export function buildPrintDocument(parts: PrintDocumentParts): string {
  const payload = JSON.stringify({ v: 1, text: parts.text });
  const body =
    parts.pages && parts.pages.length > 0
      ? parts.pages.map(renderPage).join('\n')
      : `<div id="resume-print-root" style="${escapeAttribute(parts.rootStyle)}">${parts.innerHtml}</div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>简历</title>
<style>${PRINT_RESUME_CSS}</style>
</head>
<body>
${body}
<div id="resume-text-payload" style="display: none" aria-hidden="true">${escapeForTextElement(payload)}</div>
</body>
</html>`;
}

/** Renders one paginated sheet. */
function renderPage(page: PrintPage): string {
  const header = page.headerHtml
    ? `<div class="resume-page-header">${page.headerHtml}</div>`
    : '';

  return `<div class="resume-page" style="width: ${page.width}px; height: ${page.height}px;">${header}${page.bodyHtml}</div>`;
}

/**
 * Escapes a payload for inclusion in a text element.
 *
 * `&` and `<` are escaped so the JSON cannot be reinterpreted as markup — resume
 * text is user-controlled, so this is a real injection path.
 *
 * Note this is a *text* element now, not a `<style>` element, which removes the
 * `</style` termination hazard entirely. The JSON escaping that remains is what
 * `extractVerificationPayload` reverses.
 */
function escapeForTextElement(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes a string for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Reads the verification payload back out of an exported PDF's text.
 *
 * Returns undefined when the PDF was produced by something else (or by an older
 * version of this app), in which case callers fall back to `assertPdfText`'s own
 * heuristics.
 */
export function extractVerificationPayload(pdfText: string): { text: string } | undefined {
  // Whitespace inside the payload is not guaranteed to survive PDF text
  // extraction, so the pattern tolerates it around the structural punctuation.
  const match = pdfText.match(/\{"v":\s*1\s*,\s*"text":\s*"((?:[^"\\]|\\.)*)"\}/);
  if (!match) return undefined;

  // PDF text extraction may hand back the raw HTML entities rather than the
  // decoded characters, so accept either form.
  for (const candidate of [match[1], decodeHtmlEntities(match[1])]) {
    try {
      return { text: JSON.parse(`"${candidate}"`) as string };
    } catch {
      // Try the next form.
    }
  }

  return undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The text a document intends to render, taken from the live print root. */
export function readPrintRootText(root: HTMLElement): string {
  return root.innerText ?? root.textContent ?? '';
}

/**
 * Serialises the live print root for use in the print document.
 *
 * Only the root's *inner* markup is taken: `buildPrintDocument` re-creates the
 * root element itself so it can place the `id` the print CSS targets. Nothing is
 * mutated, so the on-screen preview is unaffected.
 */
export function serializePrintRoot(root: HTMLElement): PrintDocumentParts {
  return {
    innerHtml: root.innerHTML,
    text: readPrintRootText(root),
    rootStyle: root.getAttribute('style') ?? '',
  };
}
