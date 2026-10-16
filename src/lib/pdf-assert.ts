/**
 * PDF text-layer assertion.
 *
 * See ADR-0007 (render service boundary) and ADR-0005 (ATS report is fact-only).
 *
 * The point of this module is to turn "we think this PDF is ATS-safe" from a
 * marketing claim into an executable assertion. A PDF that renders beautifully in
 * a browser can still be *unreadable* to an applicant tracking system: if the
 * text was never written as text — which is exactly what happens when a page is
 * captured to a bitmap and wrapped in a PDF — then there is nothing for a parser
 * to read, and the resume is silently discarded by the recruiter's software.
 *
 * Layering, deliberately:
 *
 *   extractPdfText(bytes)  → FACTS ONLY. Never throws for a PDF we dislike.
 *   assertPdfText(bytes)   → applies the policy and throws, in Chinese, when the
 *                            document must not be delivered.
 *
 * ADR-0005 requires the ATS surface to report facts rather than a verdict, so the
 * extraction layer stays judgement-free and the ATS report can use it directly.
 *
 * `pdfjs-dist` is imported dynamically so it never enters the first-load bundle.
 */

/** What we found in a PDF's text layer. */
export interface PdfTextStats {
  /** Every character extracted from the text layer, in document order. */
  text: string;
  /**
   * Number of non-whitespace characters extracted.
   *
   * Whitespace is excluded deliberately: a bitmap-only PDF still yields the
   * newline separators we insert between pages, and counting those would make an
   * image-only resume look like it had a text layer — defeating the entire point
   * of this assertion. Verified against an image-only jsPDF fixture.
   */
  charCount: number;
  /** Number of CJK characters extracted. */
  cjkCharCount: number;
  /** Number of U+FFFD replacement characters — the direct signal of text loss. */
  replacementCount: number;
  /**
   * Number of U+FFFD and/or `?` characters that look like lost glyphs rather
   * than deliberate punctuation. Heuristic; see `looksLikeLostText`.
   */
  suspiciousCharCount: number;
  /** How many pages were walked. */
  pageCount: number;
  /**
   * True when the document may be delivered. False when the text layer is
   * missing (`charCount === 0`) or demonstrably damaged.
   */
  ok: boolean;
  /** Chinese, user-facing explanation. Only present when `ok` is false. */
  reason?: string;
}

/**
 * CJK ranges worth counting for a Chinese-first resume product.
 *
 * Included: the BMP unified ideographs, the compatibility ideographs, CJK
 * punctuation (so a Chinese resume's 。、；count too), and the Kangxi/CJK radical
 * blocks — those are a real corruption channel observed from Chromium's print
 * output, so they must be counted before `normalizeRadicals` folds them.
 * Also included are Kana and Hangul, because a resume may contain Japanese or
 * Korean text and those likewise need a subsetted font to survive.
 */
const CJK_PATTERN =
  /[\u2E80-\u2FDF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]|[\u{20000}-\u{2FA1F}]/u;

/** U+FFFD REPLACEMENT CHARACTER — a glyph the producer could not encode. */
const REPLACEMENT_CHAR = '\uFFFD';

/** Characters that are ASCII but appear throughout Japanese/CJK text. */
function isCjk(char: string): boolean {
  return CJK_PATTERN.test(char);
}

/**
 * Decides whether a `?` is a lost glyph rather than a question mark.
 *
 * The renderer's own warning is "was rendered as \"?\"", so a `?` *can* mean loss.
 * But a lone `?` is usually just punctuation, and refusing to export a resume
 * because it asks a question would be worse than the disease. So we only call it
 * loss when the shape of the damage is distinctive:
 *
 *   - two or more `?` in a row (punctuation does not cluster like that), or
 *   - a `?` immediately adjacent to a CJK character, which is where a dropped
 *     Chinese glyph lands.
 *
 * Deliberately conservative: false negatives (a lost glyph we call punctuation)
 * are recoverable, false positives block a legitimate export.
 */
function looksLikeLostText(text: string): boolean {
  if (text.includes('??')) return true;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '?') continue;
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    if ((prev && isCjk(prev)) || (next && isCjk(next))) return true;
  }

  return false;
}

/** Counts CJK characters in a string. Exported for direct testing. */
export function countCjk(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isCjk(char)) count += 1;
  }
  return count;
}

/**
 * Kangxi Radicals (U+2F00–U+2FDF) and CJK Radicals Supplement (U+2E80–U+2EFF).
 *
 * These blocks exist to *describe* CJK characters; each member is a visually
 * near-identical duplicate of a normal ideograph at a different code point. That
 * makes them a silent corruption channel, observed for real from Chromium's
 * print-to-PDF on a Chinese resume:
 *
 *   extracted: ⼯程师   (U+2F2F, U+7A0B, U+5E08)
 *   expected:  工程师   (U+5DE5, U+7A0B, U+5E08)
 *
 * The text looks perfect on screen and in a PDF reader — the glyphs are the same —
 * but `⼯程师 !== 工程师`, so an ATS searching for 工程师 finds nothing. Without
 * this normalisation the export passes every visual check and still fails the one
 * job it has.
 */
const RADICAL_BLOCK = /[\u2E80-\u2EFF\u2F00-\u2FDF]/;

/**
 * Folds radical-block code points back onto their canonical ideographs.
 *
 * Uses NFKC, which is defined to do exactly this mapping and is therefore more
 * trustworthy than a hand-maintained table of ~300 pairs.
 *
 * Applied per character and only inside the radical blocks, deliberately. Running
 * NFKC over the whole text would also fold full-width punctuation (，→ ,) and
 * ligatures, changing the extracted text in ways a reader would not expect and
 * that `charCount` should keep reporting faithfully. Constraining it keeps the
 * fix proportionate to the defect.
 */
export function normalizeRadicals(text: string): string {
  if (!RADICAL_BLOCK.test(text)) return text;
  return [...text]
    .map((char) => (RADICAL_BLOCK.test(char) ? char.normalize('NFKC') : char))
    .join('');
}

/**
 * Builds the stats object from already-extracted text.
 *
 * Split out from the PDF walk so the counting and damage heuristics can be tested
 * directly, without needing a fixture for every case.
 */
export function analyseText(rawText: string, pageCount: number): PdfTextStats {
  const text = normalizeRadicals(rawText);

  let replacementCount = 0;
  for (const char of text) {
    if (char === REPLACEMENT_CHAR) replacementCount += 1;
  }

  const charCount = [...text].filter((char) => !/\s/.test(char)).length;
  const cjkCharCount = countCjk(text);
  const lostText = looksLikeLostText(text);
  const suspiciousCharCount = replacementCount + (lostText ? countQuestionMarks(text) : 0);

  const base = { text, charCount, cjkCharCount, replacementCount, suspiciousCharCount, pageCount };

  // No text layer at all: the failure mode this module exists to catch.
  if (charCount === 0) {
    return {
      ...base,
      ok: false,
      reason:
        '这份 PDF 没有文字层，招聘系统无法读取其中的内容。' +
        '请改用「浏览器打印」导出（见导出选项），或联系管理员。',
    };
  }

  // A replacement character means the producer emitted a glyph it could not
  // encode. Some of the resume is already gone; do not deliver it.
  if (replacementCount > 0) {
    return {
      ...base,
      ok: false,
      reason:
        `这份 PDF 中有 ${replacementCount} 个字符无法正确编码，招聘系统会读到乱码。` +
        '请更换字体或改用「浏览器打印」导出。',
    };
  }

  // Suspicious "?" clusters: probably dropped glyphs, but not certain, so the
  // wording says so rather than asserting corruption.
  if (lostText) {
    return {
      ...base,
      ok: false,
      reason:
        '这份 PDF 中有字符被渲染成了「?」，说明部分文字可能未被正确写入。' +
        '请确认字体包含这些字符，或改用「浏览器打印」导出。',
    };
  }

  return { ...base, ok: true };
}

function countQuestionMarks(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '?') count += 1;
  }
  return count;
}

/**
 * Locates a directory inside the installed `pdfjs-dist` package.
 *
 * Two directories matter for correctness:
 *
 *   - `standard_fonts/` — metrics for the standard 14 fonts, without which pdf.js
 *     can under-extract, which would make this assertion lie (an under-count can
 *     turn a readable resume into `charCount === 0`).
 *   - `cmaps/` — the predefined Adobe CMaps. PDFs from other producers routinely
 *     reference CJK CMaps such as `UniGB-UCS2-H` instead of shipping their own
 *     `/ToUnicode`, and without these the text extracts as garbage.
 *
 * `import.meta.resolve` is used because it is independent of where this module lands
 * after bundling, and it works in both Node and the browser.
 *
 * An earlier revision also tried `new URL('pdfjs-dist/<name>/', import.meta.url)` as a
 * fallback. That was removed: it never resolved (a bare specifier is not a valid
 * relative path), and Turbopack reported it as an unresolvable module at build time,
 * which turned a dead branch into a build warning. pdf.js copes with `undefined` by
 * using its own defaults.
 */
function resolvePdfjsAssetDir(name: 'standard_fonts' | 'cmaps'): string | undefined {
  try {
    const resolve = (import.meta as ImportMeta & {
      resolve?: (specifier: string) => string;
    }).resolve;

    const entry = resolve?.('pdfjs-dist/package.json');
    if (entry) return new URL(`${name}/`, entry).href;
  } catch {
    // Not fatal: pdf.js falls back to its own behaviour rather than failing.
  }

  return undefined;
}

/**
 * Walks a PDF's text layer and returns what is actually readable.
 *
 * Never throws for a document that merely looks bad — that is `assertPdfText`'s
 * job. It does throw if the bytes cannot be parsed as a PDF at all, because that
 * is a programming error rather than a quality signal.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextStats> {
  // Legacy build: the modern one assumes browser APIs that are absent in Node,
  // and the legacy build is what pdf.js itself recommends for Node/server use.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // No worker: we run on the main thread in Node and inside the render service,
  // where a worker pool would be pure overhead. Disabling the font face also
  // avoids needing a canvas implementation just to read text.
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    standardFontDataUrl: resolvePdfjsAssetDir('standard_fonts'),
    cMapUrl: resolvePdfjsAssetDir('cmaps'),
    useWorkerFetch: false,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;

  try {
    const parts: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      for (const item of content.items) {
        // TextItem carries `str`; TextMarkedContent does not. Guard rather than
        // cast, so a marked-content entry does not turn into "undefined".
        if (typeof (item as { str?: unknown }).str === 'string') {
          parts.push((item as { str: string }).str);
        }
      }

      // Separate pages so a word split across a page break is not glued together.
      parts.push('\n');
    }

    return analyseText(parts.join(''), doc.numPages);
  } finally {
    // Teardown belongs to the loading task, not the document proxy.
    await loadingTask.destroy();
  }
}

/**
 * The gate. Every export path must call this before handing bytes to the user.
 *
 * Throws a Chinese error when the document must not be delivered. Callers are
 * expected to show `error.message` to the user.
 */
export async function assertPdfText(bytes: Uint8Array): Promise<PdfTextStats> {
  const stats = await extractPdfText(bytes);

  if (!stats.ok) {
    const error = new Error(stats.reason ?? '这份 PDF 无法被招聘系统读取。');
    error.name = 'PdfTextAssertionError';
    // A stable marker so callers can distinguish "the file is bad" from "the
    // renderer crashed" without string-matching the message.
    (error as Error & { cause?: string }).cause = 'pdf-text-loss';
    throw error;
  }

  return stats;
}
