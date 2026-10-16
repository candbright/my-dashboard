// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { ResumeRecord } from '@/lib/types';
import type { MetadataKey } from '@/lib/resume-metadata';
import {
  RESUME_TEXT_MIME,
  markdownToPlainText,
  normaliseInlineWhitespace,
  resumeTextBlob,
  resumeTextFileName,
  resumeToPlainText,
  type PlainTextSource,
} from '@/lib/resume-text';

/**
 * Tests for the plain-text export (ticket 06).
 *
 * The acceptance criteria are mostly *absences* — no decoration, no column padding,
 * no control characters — which are exactly the assertions that get skipped when
 * someone tests only the happy path. They are all here.
 */

/** The decorative characters an ATS parser may read as content. */
const DECORATION = ['│', '┃', '═', '━', '─', '▪', '•', '◆', '◼', '★', '┆', '┊', '║', '┌', '└'];

function sample(overrides: Partial<PlainTextSource> = {}): PlainTextSource {
  return {
    frontmatter: {
      name: '张三',
      title: '后端工程师',
      email: 'zhangsan@example.com',
      phone: '13800138000',
      location: '上海',
      github: 'https://github.com/zhangsan',
    },
    sections: [
      {
        title: '工作经历',
        items: [
          {
            title: '高级后端工程师',
            subtitle: '某某科技有限公司',
            date: '2021.03 - 至今',
            details: [
              '负责简历解析服务，QPS 提升 3 倍，P99 延迟下降 40%',
              '主导 PostgreSQL 分库分表改造',
            ],
          },
        ],
      },
      {
        title: '技能',
        content: 'Go、PostgreSQL、Kubernetes、中文分词',
        items: [],
      },
    ],
    ...overrides,
  };
}

describe('resumeToPlainText — structure', () => {
  it('puts the name on its own first line', () => {
    const lines = resumeToPlainText(sample()).split('\n');

    expect(lines[0]).toBe('张三');
  });

  it('puts the job title on its own line, separated from the name', () => {
    // A parser that reads line 1 as the candidate name must not receive
    // "张三 后端工程师" as a single string.
    const text = resumeToPlainText(sample());

    expect(text.startsWith('张三\n\n后端工程师\n')).toBe(true);
  });

  it('puts each contact value on its own line', () => {
    const text = resumeToPlainText(sample());
    const lines = text.split('\n');

    for (const value of ['zhangsan@example.com', '13800138000', '上海', 'https://github.com/zhangsan']) {
      const line = lines.find((l) => l.includes(value));
      expect(line, `${value} should be on a line of its own`).toBe(value);
    }
  });

  it('separates contact values with newlines, not separators', () => {
    const text = resumeToPlainText(sample());

    // The ` · ` separator used by the visual display must not leak into the export.
    expect(text).not.toContain('·');
    expect(text).not.toContain(' | 13800138000');
  });

  it('treats a section title as a plain line', () => {
    const text = resumeToPlainText(sample());

    expect(text).toContain('\n工作经历\n');
    expect(text).toContain('\n技能\n');
    // No Markdown heading markers.
    expect(text).not.toContain('##');
  });

  it('separates sections with a blank line', () => {
    const text = resumeToPlainText(sample());

    expect(text).toMatch(/工作经历\n\n/);
    expect(text).toMatch(/技能\n\n/);
  });

  it('puts the entry headline on one line: title | company | dates', () => {
    const text = resumeToPlainText(sample());

    expect(text).toContain('高级后端工程师 | 某某科技有限公司 | 2021.03 - 至今');
  });

  it('prefixes details with a plain hyphen', () => {
    const text = resumeToPlainText(sample());

    expect(text).toContain('- 负责简历解析服务，QPS 提升 3 倍，P99 延迟下降 40%');
    expect(text).toContain('- 主导 PostgreSQL 分库分表改造');
  });

  it('ends with exactly one trailing newline', () => {
    const text = resumeToPlainText(sample());

    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('emits a section content paragraph before its entries', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', content: '八年后端经验。', items: [{ title: '工程师' }] }],
    });

    expect(text.indexOf('八年后端经验。')).toBeLessThan(text.indexOf('工程师'));
  });

  it('keeps an ordered list ordinal but drops the marker for unordered lists', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '项目', content: '1. 第一项\n2. 第二项\n- 无序项' }],
    });

    expect(text).toContain('1. 第一项');
    expect(text).toContain('2. 第二项');
    expect(text).toContain('无序项');
    expect(text).not.toContain('- 无序项');
  });
});

describe('resumeToPlainText — no decoration, no column simulation', () => {
  it('contains no decorative glyphs anywhere', () => {
    const text = resumeToPlainText(sample());

    for (const glyph of DECORATION) {
      expect(text, `${glyph} must not appear`).not.toContain(glyph);
    }
  });

  it('contains no piped-table decoration', () => {
    // ` | ` is allowed on the entry headline as a field separator, but a Markdown
    // table's `|---|` rule must not survive.
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '项目', content: '| 项目 | 年份 |\n| --- | --- |\n| A | 2024 |' }],
    });

    expect(text).not.toContain('---');
    expect(text).not.toContain('|---');
  });

  it('never pads with runs of spaces', () => {
    // A run of two or more spaces is what fakes a two-column layout, and parsers
    // collapse it inconsistently.
    const text = resumeToPlainText(sample());

    expect(text).not.toMatch(/ {2,}/);
  });

  it('never emits a tab', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张\t三' },
      sections: [{ title: '工作经历', items: [{ title: '工\t程师', details: ['负\t责'] }] }],
    });

    expect(text).not.toContain('\t');
  });

  it('strips decoration the author typed into the content', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '技能', content: 'Go ▪ PostgreSQL │ Kubernetes' }],
    });

    for (const glyph of DECORATION) {
      expect(text, `${glyph} must be removed`).not.toContain(glyph);
    }
  });
});

describe('resumeToPlainText — no control characters', () => {
  it('exports no C0 control characters other than newline', () => {
    const text = resumeToPlainText(sample());

    // eslint-disable-next-line no-control-regex
    const offenders = text.match(/[\u0000-\u0009\u000b-\u001f\u007f]/g);
    expect(offenders).toBeNull();
  });

  it('normalises CRLF and CR to LF', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', content: '第一行\r\n第二行\r第三行' }],
    });

    expect(text).not.toContain('\r');
    expect(text).toContain('第一行\n第二行\n第三行');
  });

  it('normalises CRLF in a detail and in the header too, not just in content', () => {
    // The line-level Markdown rules anchor to `$`, which a stray `\r` defeats — so
    // line endings have to be normalised everywhere, not only in `content`.
    const text = resumeToPlainText({
      frontmatter: { name: '张\r\n三' },
      sections: [{ title: '工作经历', items: [{ title: '工程师', details: ['**要点**\r\n第二行'] }] }],
    });

    expect(text).not.toContain('\r');
  });

  it('leaves a zero-width space in place, and that is a known limitation', () => {
    // A ZWSP is not a C0 control character, so it passes through. Asserted rather
    // than described so the behaviour cannot change unnoticed; it is harmless for an
    // ATS (it is invisible and does not break a token) and stripping it would mean
    // normalising Unicode categories, which is a larger change than this ticket.
    const text = resumeToPlainText({ frontmatter: { name: '张\u200b三' }, sections: [] });

    expect(text).toContain('\u200b');
  });
});

describe('resumeToPlainText — Chinese content survives exactly', () => {
  it('keeps the Chinese character count of the source content', () => {
    const chinese = '负责简历解析服务主导分库分表改造';
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [{ title: '工程师', details: [chinese] }] }],
    });

    const count = (value: string) => (value.match(/[\u4e00-\u9fff]/g) ?? []).length;
    // Every CJK character in the output, and nothing more: the detail is preserved
    // verbatim and the only additions are the header and section labels.
    //   张三(2) + 工作经历(4) + 工程师(3) = 9
    // A strict equality (not `>=`) is the point: it catches both loss and insertion.
    expect(count(text)).toBe(count(chinese) + 9);
    expect(text).toContain(`- ${chinese}`);
  });

  it('round-trips through UTF-8 encoding without loss', () => {
    // The acceptance criterion is about what Notepad/VS Code show, which is really
    // about the bytes: encode, decode, compare.
    const text = resumeToPlainText(sample());
    const bytes = new TextEncoder().encode(text);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

    expect(decoded).toBe(text);
  });

  it('encodes CJK as multi-byte UTF-8, not as replacement characters', () => {
    const text = resumeToPlainText(sample());
    const bytes = new TextEncoder().encode(text);

    expect(bytes.length).toBeGreaterThan(text.length);
    expect(new TextDecoder().decode(bytes)).not.toContain('\ufffd');
  });

  it('does not escape or entity-encode Chinese', () => {
    const text = resumeToPlainText(sample());

    expect(text).not.toContain('&#');
    expect(text).not.toContain('&amp;');
  });

  it('preserves full-width punctuation rather than folding it to ASCII', () => {
    // Whole-string NFKC would turn ，into , and （into (, which changes the text an
    // ATS stores. Ticket 03 hit the same class of bug from the other direction.
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [{ details: ['负责服务（高并发），效果良好。'] }] }],
    });

    expect(text).toContain('（高并发），效果良好。');
    expect(text).not.toContain('(高并发),');
  });
});

describe('resumeToPlainText — Markdown is stripped', () => {
  it('removes bold markers', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [{ details: ['**提升了** 3 倍'] }] }],
    });

    expect(text).toContain('- 提升了 3 倍');
    expect(text).not.toContain('**');
  });

  it('keeps link text and drops the target', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '项目', content: '参见 [我的主页](https://example.com) 了解详情' }],
    });

    expect(text).toContain('我的主页');
    expect(text).not.toContain('https://example.com');
    expect(text).not.toContain('](');
  });

  it('keeps an image alt text without the image syntax', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '项目', content: '![架构图](https://example.com/a.png)' }],
    });

    expect(text).toContain('架构图');
    expect(text).not.toContain('![');
    expect(text).not.toContain('.png');
  });

  it('removes heading markers from section content', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '项目', content: '### 子标题\n\n正文' }],
    });

    expect(text).toContain('子标题');
    expect(text).not.toContain('###');
  });

  it('removes inline code backticks but keeps the code', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '技能', content: '熟悉 `PostgreSQL` 调优' }],
    });

    expect(text).toContain('PostgreSQL 调优');
    expect(text).not.toContain('`');
  });

  it('removes strikethrough markers', () => {
    // A left-to-right operator is correct here: the non-greedy body stops at the
    // first `~~`, which is the delimiter that closes the span.
    expect(markdownToPlainText('~~旧~~新')).toBe('旧新');
  });

  it('strips the asterisks the parser leaves around a date', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [{ title: '工程师', date: '*2021.03 - 至今*' }] }],
    });

    expect(text).toContain('工程师 | 2021.03 - 至今');
    expect(text).not.toContain('*');
  });

  it('removes fenced code fences', () => {
    const text = markdownToPlainText('```go\nfunc main() {}\n```');

    expect(text).toContain('func main() {}');
    expect(text).not.toContain('```');
  });

  it('unwraps an autolink instead of leaving angle brackets', () => {
    expect(markdownToPlainText('<https://example.com>')).toBe('https://example.com');
  });

  it('leaves plain text untouched', () => {
    expect(markdownToPlainText('负责简历解析服务，QPS 提升 3 倍。')).toBe(
      '负责简历解析服务，QPS 提升 3 倍。'
    );
  });

  it('handles undefined and empty input without producing "undefined"', () => {
    expect(markdownToPlainText(undefined)).toBe('');
    expect(markdownToPlainText(null)).toBe('');
    expect(markdownToPlainText('')).toBe('');
  });
});

describe('resumeToPlainText — degenerate input', () => {
  it('handles a resume with no sections', () => {
    const text = resumeToPlainText({ frontmatter: { name: '张三' }, sections: [] });

    expect(text).toBe('张三\n');
  });

  it('handles completely empty input', () => {
    expect(resumeToPlainText({})).toBe('');
  });

  it('omits a section that has a title but no body', () => {
    // A heading with nothing under it reads as a parser error, not as content.
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [] }],
    });

    expect(text).not.toContain('工作经历');
  });

  it('omits an entry with no headline', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [{ details: ['只有要点'] }] }],
    });

    expect(text).toContain('工作经历');
    expect(text).toContain('- 只有要点');
  });

  it('omits an empty detail rather than emitting a bare hyphen', () => {
    const text = resumeToPlainText({
      frontmatter: { name: '张三' },
      sections: [{ title: '工作经历', items: [{ title: '工程师', details: ['', '  '] }] }],
    });

    expect(text).not.toMatch(/^- $/m);
  });

  it('drops an absent contact field instead of printing a placeholder', () => {
    const text = resumeToPlainText(sample({ frontmatter: { name: '张三', email: 'a@b.c' } }));

    expect(text).toContain('a@b.c');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });

  it('works when frontmatter is missing entirely', () => {
    const text = resumeToPlainText({ sections: [{ title: '工作经历', items: [{ title: '工程师' }] }] });

    expect(text.startsWith('工作经历')).toBe(true);
  });

  it('survives a YAML number where a string is declared', async () => {
    // Regression: `phone: 13800138000` parses to a *number*, not a string. An earlier
    // revision called `.replace()` on it directly and threw
    // `value.replace is not a function`, aborting the entire export for any resume
    // whose phone number was not quoted. The declared type `string | null` is a
    // mirror of the API and is not enforced at runtime.
    const { parseResumeMarkdown } = await import('@/lib/resume-parser');
    const parsed = parseResumeMarkdown('---\nname: 张三\nphone: 13800138000\n---\n\n## 技能\n\nGo\n');

    const text = resumeToPlainText(parsed);

    expect(text).toContain('13800138000');
  });

  it('coerces any non-string frontmatter value instead of throwing', () => {
    const text = resumeToPlainText({
      frontmatter: { name: 123, title: true, phone: 13800138000 },
      sections: [],
    });

    expect(text).toContain('123');
    expect(text).toContain('true');
    expect(text).toContain('13800138000');
  });
});

describe('normaliseInlineWhitespace', () => {
  it('collapses a run of spaces to one', () => {
    expect(normaliseInlineWhitespace('a    b')).toBe('a b');
  });

  it('collapses a non-breaking space, which looks like padding but is not', () => {
    expect(normaliseInlineWhitespace('a\u00a0\u00a0b')).toBe('a b');
  });

  it('trims the ends', () => {
    expect(normaliseInlineWhitespace('  a  ')).toBe('a');
  });
});

describe('resumeTextFileName', () => {
  it('names the file after the candidate and the role', () => {
    expect(resumeTextFileName({ name: '张三', title: '后端工程师' })).toBe('张三-后端工程师.txt');
  });

  it('drops the role when it is missing', () => {
    expect(resumeTextFileName({ name: '张三' })).toBe('张三.txt');
  });

  it('uses the fallback when nothing is known', () => {
    expect(resumeTextFileName({}, 'my-resume')).toBe('my-resume.txt');
  });

  it('strips characters that are illegal in a file name', () => {
    expect(resumeTextFileName({ name: '张:三', title: 'a/b' })).toBe('张-三-a-b.txt');
  });

  it('never produces an empty base name', () => {
    expect(resumeTextFileName({ name: '   ' })).toBe('resume.txt');
  });
});

describe('resumeTextBlob', () => {
  it('declares UTF-8 in the MIME type', () => {
    // Not decoration: without `charset=utf-8`, some Windows editors guess the
    // encoding and open the Chinese as mojibake.
    expect(RESUME_TEXT_MIME).toBe('text/plain;charset=utf-8');
    expect(resumeTextBlob(sample()).type).toBe(RESUME_TEXT_MIME);
  });

  it('produces bytes that decode back to the same text', async () => {
    const blob = resumeTextBlob(sample());
    const decoded = await blob.text();

    expect(decoded).toBe(resumeToPlainText(sample()));
    expect(decoded).toContain('张三');
  });

  it('prepends no BOM', async () => {
    // A BOM would become the first characters of the candidate's name to a parser
    // reading the file as raw bytes, and is unnecessary with an explicit charset.
    const bytes = new Uint8Array(await resumeTextBlob(sample()).arrayBuffer());

    expect([bytes[0], bytes[1], bytes[2]]).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it('writes CJK as multi-byte sequences, not as escapes', async () => {
    const blob = resumeTextBlob({ frontmatter: { name: '张三' }, sections: [] });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // 张三 is 6 bytes in UTF-8, and must not appear as `\u5f20` text.
    expect(bytes.length).toBe(7); // 6 + trailing newline
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe('张三\n');
  });
});

describe('resumeToPlainText — integration with the real parser', () => {
  it('renders a parsed Markdown resume with no residual Markdown syntax', async () => {
    // The end-to-end shape that matters: author writes Markdown, file comes out clean.
    const { parseResumeMarkdown } = await import('@/lib/resume-parser');

    const markdown = [
      '---',
      'name: 张三',
      'title: 后端工程师',
      'email: zhangsan@example.com',
      '---',
      '',
      '## 工作经历',
      '',
      '### 高级后端工程师 | 某某科技',
      '',
      '*2021.03 - 至今*',
      '',
      '- 负责**简历解析服务**，QPS 提升 3 倍',
      '- 主导 [分库分表](https://example.com) 改造',
      '',
      '## 技能',
      '',
      'Go、PostgreSQL、`Kubernetes`',
    ].join('\n');

    const text = resumeToPlainText(parseResumeMarkdown(markdown));

    expect(text).toContain('张三');
    expect(text).toContain('后端工程师');
    expect(text).toContain('高级后端工程师 | 某某科技 | 2021.03 - 至今');
    expect(text).toContain('- 负责简历解析服务，QPS 提升 3 倍');
    expect(text).toContain('- 主导 分库分表 改造');
    expect(text).toContain('Kubernetes');

    // Nothing Markdown-ish left behind.
    for (const residue of ['##', '**', '](', '`', '*2021']) {
      expect(text, `${residue} must not survive`).not.toContain(residue);
    }
  });

  /**
   * Ticket 18 task 1 — the regression guard for the shape the server actually sends.
   *
   * The case above feeds frontmatter inside the Markdown, which is what an *imported*
   * file looks like. The server stopped sending that at ticket 17: the stored document is
   * body-only and the metadata lives in `resumes` columns. So the case above kept passing
   * while the real export quietly lost every contact detail, because no test exercised
   * the body-only shape.
   *
   * This is also the highest-consequence path: the recipient of this file is an applicant
   * tracking system, and there is nothing on screen to suggest contact details went
   * missing.
   */
  it('keeps the contact block when the document is body-only and the metadata is in columns', async () => {
    const { parseResumeMarkdown, withMetadata } = await import('@/lib/resume-parser');

    // A document as stored since ticket 17: no frontmatter at all.
    const storedDocument = [
      '## 工作经历',
      '',
      '### 高级后端工程师 | 某某科技',
      '',
      '*2021.03 - 至今*',
      '',
      '- 负责简历解析服务，QPS 提升 3 倍',
    ].join('\n');

    // The columns, as the API returns them. `job_title` is the asymmetric one.
    const record: ResumeRecord = {
      id: 'r1',
      user_id: 'u1',
      title: '后端工程师简历',
      slug: 'zhangsan',
      filename: 'r1.body.md',
      name: '张三',
      job_title: '后端工程师',
      email: 'zhangsan@example.com',
      phone: '13800138000',
      location: '北京市朝阳区',
      website: 'https://zhangsan.example.com',
      github: 'https://github.com/zhangsan',
      linkedin: 'https://www.linkedin.com/in/zhangsan',
      avatar: null,
      summary: null,
      visibility: 'private',
      approval_status: 'pending',
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      version: 1,
    };

    const parsed = withMetadata(parseResumeMarkdown(storedDocument), record);
    const text = resumeToPlainText(parsed);

    // Every column must reach the file. A silently-empty export is the defect.
    expect(text).toContain('张三');
    expect(text).toContain('后端工程师');
    expect(text).toContain('zhangsan@example.com');
    expect(text).toContain('13800138000');
    expect(text).toContain('北京市朝阳区');
    expect(text).toContain('https://zhangsan.example.com');
    expect(text).toContain('https://github.com/zhangsan');
    expect(text).toContain('https://www.linkedin.com/in/zhangsan');

    // The body still comes through, so the fix did not trade one for the other.
    expect(text).toContain('高级后端工程师 | 某某科技 | 2021.03 - 至今');

    // The filename comes from the name column rather than falling back, since the caller
    // passes `parsed.frontmatter` to `resumeTextFileName`.
    expect(resumeTextFileName(parsed.frontmatter, 'resume')).toContain('张三');
  });

  it('falls back to the document when a column was cleared', async () => {
    // A cleared column is `''`, not NULL, and must not shadow a value that an imported
    // document still carries — otherwise clearing a field could not be undone by
    // re-importing, and an export after any clear would lose the value permanently.
    const { parseResumeMarkdown, withMetadata } = await import('@/lib/resume-parser');

    const documentWithFrontmatter = '---\nname: 文件里的名字\n---\n\n## 技能\n\nGo\n';
    // A complete record: the other metadata columns are explicitly null (not omitted),
    // which is what the API sends and what makes the fallback observable.
    const record: Pick<ResumeRecord, MetadataKey> = {
      name: '',
      job_title: '后端工程师',
      email: null,
      phone: null,
      location: null,
      website: null,
      github: null,
      linkedin: null,
      avatar: null,
      summary: null,
    };

    const text = resumeToPlainText(
      withMetadata(parseResumeMarkdown(documentWithFrontmatter), record),
    );

    expect(text).toContain('文件里的名字');
    expect(text).toContain('后端工程师');
  });
});
