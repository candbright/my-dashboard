import { describe, expect, it } from 'vitest';
import {
  analyseText,
  assertPdfText,
  countCjk,
  extractPdfText,
  normalizeRadicals,
} from '@/lib/pdf-assert';
import { buildCjkPdf, buildImageOnlyPdf, buildTextPdf } from '@/lib/pdf-fixtures';

/**
 * Tests for the PDF text-layer assertion (ADR-0007).
 *
 * The assertion's whole value is that it fails on a document a human would call
 * fine but an ATS cannot read. So both directions are covered with real PDF
 * bytes, not mocks:
 *
 *   - a document with a text layer  → passes, with CJK counted
 *   - the bitmap pipeline's output  → fails, with charCount === 0
 *
 * Fixtures live in `@/lib/pdf-fixtures` so the ATS verification script drives the
 * same bytes; see that module for why they are generated rather than committed.
 */

describe('normalizeRadicals', () => {
  /**
   * Real output captured from Chromium's print-to-PDF on a Chinese resume. The
   * glyphs look identical, but `⼯程师 !== 工程师`, so an ATS searching for
   * 工程师 silently finds nothing.
   */
  it('folds Kangxi radicals onto their canonical ideographs', () => {
    expect(normalizeRadicals('⼯程师')).toBe('工程师');
    expect(normalizeRadicals('⾄今')).toBe('至今');
    expect(normalizeRadicals('⾼级')).toBe('高级');
  });

  it('changes the code points, not just the appearance', () => {
    const before = '⼯'.codePointAt(0);
    const after = normalizeRadicals('⼯').codePointAt(0);

    expect(before).toBe(0x2f2f);
    expect(after).toBe(0x5de5);
  });

  it('leaves ordinary ideographs untouched', () => {
    expect(normalizeRadicals('后端工程师')).toBe('后端工程师');
  });

  it('does not fold full-width punctuation', () => {
    // NFKC over the whole string would turn ，into a comma. That changes the text
    // a reader sees and the count we report, so it is deliberately out of scope.
    expect(normalizeRadicals('你好，世界。')).toBe('你好，世界。');
  });

  it('leaves ASCII, Kana and Hangul untouched', () => {
    expect(normalizeRadicals('Go 1.26 ひらがな 한글')).toBe('Go 1.26 ひらがな 한글');
  });

  it('returns the same string when there is nothing to fold', () => {
    const text = '后端工程师';
    expect(normalizeRadicals(text)).toBe(text);
  });
});

describe('analyseText — radical folding', () => {
  it('reports folded text so an ATS search term matches', () => {
    const stats = analyseText('⼯作经历', 1);

    expect(stats.text).toContain('工作经历');
    expect(stats.text).not.toContain('⼯');
  });

  it('counts radical-block characters as CJK', () => {
    // Before folding, these occupy U+2E80–U+2FDF. If countCjk ignored that block
    // a heavily affected document could report zero CJK and look Latin-only.
    expect(analyseText('⼯程师', 1).cjkCharCount).toBe(3);
  });
});

describe('countCjk', () => {
  it('counts Han characters', () => {
    expect(countCjk('简历中文')).toBe(4);
  });

  it('does not count Latin letters or digits', () => {
    expect(countCjk('Go 1.26')).toBe(0);
  });

  it('counts CJK punctuation, which also needs a subsetted font', () => {
    expect(countCjk('你好，世界。')).toBe(6);
  });

  it('counts supplementary-plane ideographs', () => {
    // U+20000, outside the BMP — a surrogate pair in UTF-16, so a naive
    // charCodeAt-based counter would get this wrong.
    expect(countCjk('\u{20000}')).toBe(1);
  });

  it('returns 0 for the empty string', () => {
    expect(countCjk('')).toBe(0);
  });

  it('counts the Kangxi radical block', () => {
    // countCjk does not fold; folding is analyseText's job. But this block must
    // still be *counted*, or a document full of radicals looks Latin-only.
    expect(countCjk('⼯')).toBe(1);
  });
});

describe('analyseText — verdict', () => {
  it('passes a document that has text', () => {
    const stats = analyseText('Zhang San', 1);

    expect(stats.ok).toBe(true);
    expect(stats.reason).toBeUndefined();
    expect(stats.charCount).toBe(8);
  });

  it('fails a document with no text layer and explains why, in Chinese', () => {
    const stats = analyseText('', 1);

    expect(stats.ok).toBe(false);
    expect(stats.charCount).toBe(0);
    expect(stats.reason).toContain('没有文字层');
    // The user must be told what to do, not just that something broke.
    expect(stats.reason).toContain('浏览器打印');
  });

  it('fails a document whose only content is whitespace', () => {
    // This is the real bitmap case: the page separators we insert are the only
    // characters present. Counting them would make an image-only resume pass.
    const stats = analyseText('\n', 1);

    expect(stats.ok).toBe(false);
    expect(stats.charCount).toBe(0);
  });

  it('fails a document containing a replacement character', () => {
    const stats = analyseText('张三\uFFFD李四', 1);

    expect(stats.ok).toBe(false);
    expect(stats.replacementCount).toBe(1);
    expect(stats.reason).toContain('乱码');
  });

  it('fails a document with a run of question marks', () => {
    const stats = analyseText('Zhang ??? San', 1);

    expect(stats.ok).toBe(false);
    expect(stats.reason).toContain('?');
  });

  it('fails a question mark adjacent to a CJK character', () => {
    // Where a dropped Chinese glyph lands.
    const stats = analyseText('简历?中文', 1);

    expect(stats.ok).toBe(false);
  });

  it('passes ordinary Latin text that happens to contain one question mark', () => {
    // Refusing to export because a resume asks a question would be worse than
    // the disease, so a lone "?" surrounded by Latin is punctuation.
    const stats = analyseText('Are you hiring? Yes.', 1);

    expect(stats.ok).toBe(true);
    expect(stats.suspiciousCharCount).toBe(0);
  });

  it('passes a Chinese sentence ending in a question mark', () => {
    const stats = analyseText('您好吗。', 1);

    expect(stats.ok).toBe(true);
  });

  it('counts CJK characters in the text', () => {
    // 简历中的 = 4, 技术栈 = 3; the embedded "Go" contributes nothing.
    const stats = analyseText('简历中的 Go 技术栈', 1);

    expect(stats.cjkCharCount).toBe(7);
  });

  it('reports the page count it was given', () => {
    expect(analyseText('x', 3).pageCount).toBe(3);
  });
});

describe('extractPdfText — real PDFs', () => {
  it('extracts the text layer of a text-writing PDF', async () => {
    const stats = await extractPdfText(buildTextPdf());

    expect(stats.ok).toBe(true);
    expect(stats.charCount).toBeGreaterThan(0);
    expect(stats.text).toContain('Zhang San');
    expect(stats.text).toContain('Backend Engineer');
  });

  it('extracts CJK text through the ToUnicode CMap and counts it', async () => {
    const expected = '简历中文张三';
    const codePoints = [...expected].map((c) => c.codePointAt(0)!);

    const stats = await extractPdfText(buildCjkPdf(codePoints));

    expect(stats.text.trim()).toBe(expected);
    expect(stats.cjkCharCount).toBe(6);
    expect(stats.ok).toBe(true);
  });

  it('reports a single page for a one-page document', async () => {
    expect((await extractPdfText(buildTextPdf())).pageCount).toBe(1);
  });

  /**
   * The acceptance criterion this whole ticket exists for: the current bitmap
   * pipeline produces a PDF with no readable text, and the assertion must say so.
   */
  it('fails the bitmap pipeline output with charCount === 0', async () => {
    const stats = await extractPdfText(buildImageOnlyPdf());

    expect(stats.charCount).toBe(0);
    expect(stats.ok).toBe(false);
    expect(stats.reason).toBeTruthy();
  });
});

describe('assertPdfText — the gate', () => {
  it('resolves for a PDF that can be read', async () => {
    const stats = await assertPdfText(buildTextPdf());

    expect(stats.ok).toBe(true);
  });

  it('throws a Chinese, user-facing error for the bitmap output', async () => {
    await expect(assertPdfText(buildImageOnlyPdf())).rejects.toThrow(/没有文字层/);
  });

  it('marks the error so callers need not match on the message', async () => {
    // Callers must be able to tell "this file is unreadable" (show the user a
    // fix) from "the renderer crashed" (a bug) without parsing prose.
    await expect(assertPdfText(buildImageOnlyPdf())).rejects.toMatchObject({
      cause: 'pdf-text-loss',
      name: 'PdfTextAssertionError',
    });
  });

  it('keeps the CJK count available to the caller on success', async () => {
    const expected = '张三';
    const codePoints = [...expected].map((c) => c.codePointAt(0)!);

    const stats = await assertPdfText(buildCjkPdf(codePoints));

    expect(stats.cjkCharCount).toBe(2);
  });
});
