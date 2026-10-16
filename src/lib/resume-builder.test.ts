import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown, resumeMetadataView } from '@/lib/resume-parser';
import type { MetadataKey } from '@/lib/resume-metadata';
import type { ResumeRecord } from '@/lib/types';
import {
  editableToMarkdown,
  metadataViewToEditableFrontmatter,
  parsedToEditable,
  resumeMarkdownExport,
  type EditableFrontmatter,
  type EditableSection,
} from '@/lib/resume-builder';

/**
 * Regression guard for the markdown serialiser.
 *
 * This is the write path: the editor turns structured state back into the
 * markdown that gets saved. Two things must hold, and both are about conserving
 * the user's data rather than formatting taste:
 *
 *   1. A parse → serialise → parse round trip must be idempotent, or the editor
 *      mutates the resume every time it is opened.
 *   2. Serialised frontmatter must survive a YAML reader, or the save corrupts
 *      the document.
 */

const frontmatter = (over: Partial<EditableFrontmatter> = {}): EditableFrontmatter => ({
  name: '李四',
  title: '后端工程师',
  email: 'lisi@example.com',
  phone: '13800138000',
  location: '上海',
  website: '',
  github: '',
  linkedin: '',
  avatar: '',
  ...over,
});

const RESUME = [
  '---',
  'name: 李四',
  'email: lisi@example.com',
  '---',
  '',
  '## 教育经历',
  '',
  '### 清华大学 | 计算机科学与技术',
  '*2020.09 - 2024.06*',
  '- GPA 3.9/4.0',
  '- 两次国家奖学金',
  '',
  '## 技能',
  '',
  '熟悉 Go、PostgreSQL',
  '',
].join('\n');

/** parse → serialise, the round trip the editor performs on every edit. */
function roundTrip(markdown: string): string {
  const { frontmatter: fm, sections } = parsedToEditable(parseResumeMarkdown(markdown));
  return editableToMarkdown(fm, sections);
}

describe('editableToMarkdown — frontmatter', () => {
  it('emits a fenced block with the known keys', () => {
    const md = editableToMarkdown(frontmatter({ website: '', github: '' }), []);

    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('name: 李四');
    expect(md).toContain('email: lisi@example.com');
  });

  it('omits empty fields rather than writing bare keys', () => {
    const md = editableToMarkdown(frontmatter({ github: '', linkedin: '', avatar: '' }), []);

    // Writing `github:` with no value would parse back as null, which is a
    // different claim from "not provided".
    expect(md).not.toContain('github:');
    expect(md).not.toContain('linkedin:');
    expect(md).not.toContain('avatar:');
  });

  it('closes the block exactly once when there are no sections', () => {
    const md = editableToMarkdown(frontmatter(), []);
    const fences = md.split('\n').filter((l) => l.trim() === '---');

    expect(fences).toHaveLength(2);
  });
});

describe('editableToMarkdown — sections', () => {
  it('writes a pipe only when a subtitle exists', () => {
    const withSub: EditableSection[] = [
      { id: 's1', title: '教育经历', content: '', items: [
        { id: 'i1', title: '清华大学', subtitle: '计算机', date: '', details: [] },
      ] },
    ];
    const withoutSub: EditableSection[] = [
      { id: 's1', title: '教育经历', content: '', items: [
        { id: 'i1', title: '清华大学', subtitle: '', date: '', details: [] },
      ] },
    ];

    expect(editableToMarkdown(frontmatter(), withSub)).toContain('### 清华大学 | 计算机');
    // A trailing pipe would parse back as an empty-string subtitle.
    expect(editableToMarkdown(frontmatter(), withoutSub)).toContain('### 清华大学\n');
    expect(editableToMarkdown(frontmatter(), withoutSub)).not.toContain('清华大学 |');
  });

  it('wraps the date in italics', () => {
    const sections: EditableSection[] = [
      { id: 's1', title: '教育经历', content: '', items: [
        { id: 'i1', title: '清华大学', subtitle: '', date: '2020 - 2024', details: [] },
      ] },
    ];

    expect(editableToMarkdown(frontmatter(), sections)).toContain('*2020 - 2024*');
  });

  it('drops blank details instead of writing empty bullets', () => {
    const sections: EditableSection[] = [
      { id: 's1', title: '项目', content: '', items: [
        { id: 'i1', title: 'A', subtitle: '', date: '', details: ['做了事', '', '   '] },
      ] },
    ];
    const md = editableToMarkdown(frontmatter(), sections);

    expect(md).toContain('- 做了事');
    expect(md).not.toContain('- \n');
  });

  it('preserves inline markdown inside a bullet', () => {
    // Bullets commonly hold links, which must survive the round trip intact.
    const sections: EditableSection[] = [
      { id: 's1', title: '项目', content: '', items: [
        { id: 'i1', title: 'A', subtitle: '', date: '', details: ['见 [主页](https://example.com)'] },
      ] },
    ];
    const md = editableToMarkdown(frontmatter(), sections);

    expect(md).toContain('- 见 [主页](https://example.com)');
  });
});

describe('round trip — idempotence', () => {
  it('is stable on a second pass', () => {
    // If this fails the editor rewrites the document on every open, which shows
    // up as spurious unsaved-changes state.
    const once = roundTrip(RESUME);

    expect(roundTrip(once)).toBe(once);
  });

  it('preserves the user-visible content across a round trip', () => {
    const parsed = parseResumeMarkdown(roundTrip(RESUME));

    expect(parsed.frontmatter.name).toBe('李四');
    expect(parsed.sections.map((s) => s.title)).toEqual(['教育经历', '技能']);
    expect(parsed.sections[0].items[0].title).toBe('清华大学');
    expect(parsed.sections[0].items[0].subtitle).toBe('计算机科学与技术');
    expect(parsed.sections[0].items[0].date).toBe('2020.09 - 2024.06');
    expect(parsed.sections[0].items[0].details).toEqual(['GPA 3.9/4.0', '两次国家奖学金']);
  });

  it('is stable for a resume with no items at all', () => {
    const once = roundTrip('---\nname: 王五\n---\n\n## 技能\n\nGo\n');

    expect(roundTrip(once)).toBe(once);
  });

  it('is stable when the document is empty', () => {
    const once = roundTrip('');

    expect(roundTrip(once)).toBe(once);
  });

  it('does not invent a subtitle from a pipe inside a title', () => {
    // A title that legitimately contains a pipe is ambiguous with the
    // title|subtitle separator; the round trip must at least be stable even
    // though it reinterprets the split.
    const once = roundTrip('## 项目\n\n### A | B | C\n');

    expect(roundTrip(once)).toBe(once);
  });

  it('is stable for the date forms and separators ticket 18 added', () => {
    // The ticket's own acceptance criterion: parse → write → parse must be idempotent. It
    // matters most for exactly these values, because they are the ones the parser just
    // learned to read — a value the parser reads but the writer reformats differently would
    // rewrite the user's document on every open, which is data churn with no edit behind it.
    const docs = [
      // Every date form named in the acceptance criteria.
      '## 工作经历\n\n### 工程师 | 公司\n\n*2022年3月至今*\n\n- 一件事\n',
      '## 工作经历\n\n### 工程师 | 公司\n\n*2022.03 - 2024.06*\n\n- 一件事\n',
      '## 教育经历\n\n### 某某大学\n\n*2022/03*\n',
      '## 教育经历\n\n### 某某大学\n\n*2022 - 2024*\n',
      '## 工作经历\n\n### 工程师 | 公司\n\n*2022年3月—2024年6月*\n',
      // A date written on the heading, which the parser now moves to the date field.
      '## 工作经历\n\n### 后端工程师 | 某某科技 | 2021.03 - 至今\n\n- 一件事\n',
      // Every skill separator, in one line.
      '## 技能\n\nGo、PostgreSQL，Kubernetes；Redis;Docker/CI|Linux\n',
      // A subtitle containing a pipe, which the parser no longer truncates.
      '## 工作经历\n\n### 工程师 | 公司 | 部门\n\n- 一件事\n',
    ];

    for (const doc of docs) {
      const once = roundTrip(doc);
      // Stable on a second pass: this is the property that keeps the editor from seeing a
      // spurious diff.
      expect(roundTrip(once), `not stable for:\n${doc}`).toBe(once);

      // And the parse is stable too — the same document must yield the same structure every
      // time, so a re-render cannot change what the user sees.
      expect(parseResumeMarkdown(once).sections, `unstable parse for:\n${doc}`).toEqual(
        parseResumeMarkdown(roundTrip(once)).sections,
      );
    }
  });
});

/**
 * YAML escaping on the export path — fixed by ticket 17.
 *
 * These six cases were `it.fails` while `editableToMarkdown` built frontmatter by string
 * concatenation (`name: ${name}`), which emitted invalid YAML for any value containing
 * `: `, `#`, or a leading `&`/`*`/`[`/`{`. The recorded symptoms were:
 *
 *   name: 张: 三   → gray-matter THREW "incomplete explicit mapping pair"
 *   name: &张三    → parsed back as null          (silent data loss)
 *   name: [张三]   → parsed back as ["张三"]       (type change, breaks .trim())
 *   name: {张三}   → parsed back as an object     (ditto)
 *   name: *张三    → gray-matter THREW "unidentified alias"
 *   name: 张\n三   → gray-matter THREW "multiline key may not be an implicit key"
 *
 * The fix was not to patch the concatenation but to delete it: frontmatter is now produced
 * by `js-yaml`'s `dump`, the same library `gray-matter` uses to read it back, so export and
 * import agree by construction. `it.fails` was converted to `it` in the same change, which
 * is what the original comment promised ("修复后该用例会自动变成失败，提醒把它改成普通 it").
 *
 * The assertions are deliberately on the **parsed value**, not on the emitted bytes: the
 * requirement is that the round trip conserves data, and pinning the exact quoting style
 * would make an upstream `js-yaml` formatting change look like a regression.
 */
describe('editableToMarkdown — YAML escaping is preserved (ticket 17)', () => {
  // `String(...)` rather than a cast: `ParsedResume.frontmatter` is typed `unknown` per
  // key, because YAML can yield an object where a string is claimed. The `?? ''` default
  // stays, so a regression that dropped the value still compares as `''` rather than being
  // asserted away by a type assertion.
  const nameRoundTrip = (name: string): string => {
    const { frontmatter: fm } = parseResumeMarkdown(editableToMarkdown(frontmatter({ name }), []));
    return String(fm.name ?? '');
  };

  it('round-trips a value containing ": "', () => {
    expect(nameRoundTrip('张: 三')).toBe('张: 三');
  });

  it('does not silently null out an anchor-like value', () => {
    expect(nameRoundTrip('&张三')).toBe('&张三');
  });

  it('does not turn a bracketed value into an array', () => {
    // The old failure changed the *type*, which is worse than losing it: `.trim()` on an
    // array is a runtime TypeError, so this reached the render path as a crash.
    expect(nameRoundTrip('[张三]')).toBe('[张三]');
  });

  it('does not turn a braced value into a mapping', () => {
    expect(nameRoundTrip('{张三}')).toBe('{张三}');
  });

  it('does not throw on an alias-like value', () => {
    expect(nameRoundTrip('*张三')).toBe('*张三');
  });

  it('does not throw on a multi-line value, and keeps the newline', () => {
    expect(nameRoundTrip('张\n三')).toBe('张\n三');
  });

  it('round-trips every YAML-significant leading character', () => {
    // `&`/`*`/`[`/`{` above are the ones the original defect named; these are the rest of
    // the set that a hand-written quoter is likely to miss.
    for (const value of ['- 张三', '@张三', '%张三', '!张三', '>张三', '|张三', '?张三', '`张三']) {
      expect(nameRoundTrip(value), `value ${JSON.stringify(value)}`).toBe(value);
    }
  });

  it('keeps a trailing space, which YAML would otherwise strip', () => {
    expect(nameRoundTrip('张三 ')).toBe('张三 ');
  });

  it('keeps a value that merely looks like a boolean or a number as a string', () => {
    // `true` and `0123` are here because round-tripping them as a boolean/number would
    // change the type and reintroduce the `.trim()` crash, not merely alter the text.
    expect(nameRoundTrip('true')).toBe('true');
    expect(nameRoundTrip('0123')).toBe('0123');
  });

  it('does not quote a value that needs no quoting', () => {
    // The counterpart to the escaping tests: over-quoting is not a correctness bug but it
    // makes the exported `.md` unreadable, which is the file's whole purpose for a user
    // who opens it in an editor.
    expect(editableToMarkdown(frontmatter({ name: '李四' }), [])).toContain('name: 李四');
    expect(editableToMarkdown(frontmatter({ website: 'https://a.b/p#x' }), [])).toContain(
      'website: https://a.b/p#x'
    );
  });

  it('emits the frontmatter keys in a stable declared order', () => {
    const md = editableToMarkdown(frontmatter(), []);
    const keys = md
      .split('\n')
      .filter((l) => /^[a-z]+:/.test(l))
      .map((l) => l.split(':')[0]);

    expect(keys).toEqual(['name', 'title', 'email', 'phone', 'location']);
  });

  it('omits the block entirely when there is no metadata', () => {
    // An empty `---\n---` block would claim the document has frontmatter. Nothing reads it
    // that way any more, but a document that says it has metadata and then has none is a
    // trap for the next reader.
    const empty: EditableFrontmatter = {
      name: '', title: '', email: '', phone: '',
      location: '', website: '', github: '', linkedin: '', avatar: '',
    };

    expect(editableToMarkdown(empty, [])).toBe('');
  });
});

describe('editableToMarkdown — the save path excludes frontmatter (ticket 15)', () => {
  // The opt-out the editor uses when reporting markdown for storage.
  //
  // ADR-0003 makes the database columns the metadata authority and stores the document
  // without frontmatter. Sending a block anyway would put a second, stale copy of the
  // metadata into every autosave — the exact shape of the defect that made a form edit get
  // reverted by the next save. The default stays `true` so the `.md` export remains
  // self-describing.

  it('omits the block when asked to', () => {
    const md = editableToMarkdown(frontmatter(), [], { includeFrontmatter: false });
    // Asserted on the block itself, not on a bare `---` substring: an empty section list
    // still produces separator lines, and a `not.toContain('---')` would be testing those
    // rather than the frontmatter.
    expect(md.startsWith('---')).toBe(false);
    expect(md).not.toContain('name: 李四');
    expect(md).not.toContain('email: lisi@example.com');
  });

  it('still emits the body when the block is omitted', () => {
    // The failure mode this guards against is a flag that drops the whole document rather
    // than just the header — which would silently stop saving the user's writing.
    const sections = [
      {
        id: 's1',
        title: '工作经历',
        content: '负责后端开发',
        items: [
          { id: 'i1', title: '工程师', subtitle: '某公司', date: '2020 - 2024', details: ['做了 A'] },
        ],
      },
    ];
    const md = editableToMarkdown(frontmatter(), sections, { includeFrontmatter: false });

    expect(md).toContain('## 工作经历');
    expect(md).toContain('负责后端开发');
    expect(md).toContain('### 工程师 | 某公司');
    expect(md).toContain('*2020 - 2024*');
    expect(md).toContain('- 做了 A');
  });

  it('includes the block by default, so the export path is unchanged', () => {
    const md = editableToMarkdown(frontmatter(), []);
    expect(md).toContain('---');
    expect(md).toContain('name: 李四');
  });

  it('includes the block when explicitly asked to', () => {
    const md = editableToMarkdown(frontmatter(), [], { includeFrontmatter: true });
    expect(md).toContain('name: 李四');
  });

  it('produces a body-only document the parser reads as having no frontmatter', () => {
    // Pins the round trip the server depends on: what the editor sends is exactly what comes
    // back out with an empty `frontmatter`, so nothing downstream can resurrect the values
    // from the document and disagree with the columns.
    const md = editableToMarkdown(frontmatter({ name: '张三' }), [], {
      includeFrontmatter: false,
    });
    const parsed = parseResumeMarkdown(md);
    expect(parsed.frontmatter.name).toBeUndefined();
  });
});

/**
 * The `.md` export (ticket 18).
 *
 * The stored document is body-only, so the export has to re-attach frontmatter from the
 * columns. Before this the download button handed back the stored body unchanged, and
 * because no test exercised the body-only shape, nothing noticed that the exported file had
 * lost every contact detail.
 */
describe('resumeMarkdownExport — the .md export carries the metadata (ticket 18)', () => {
  const storedBody = '## 工作经历\n\n### 高级后端工程师 | 某某科技\n';

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

  it('writes the columns as YAML frontmatter and keeps the body', () => {
    const md = resumeMarkdownExport(resumeMetadataView(record), storedBody);

    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('name: 张三');
    // The job title is `job_title` in the column and `title` in the document. Mapping the
    // wrong one exports a resume with no job title, which is the bug this guards.
    expect(md).toContain('title: 后端工程师');
    expect(md).toContain('email: zhangsan@example.com');
    // `js-yaml` quotes an all-digit string so a YAML reader cannot turn a phone number into
    // a number — which would drop the leading zero from `0138...` style numbers.
    expect(md).toContain("phone: '13800138000'");
    expect(md).toContain('location: 北京市朝阳区');
    expect(md).toContain('github: https://github.com/zhangsan');
    expect(md).toContain(storedBody.trimEnd());
  });

  it('round-trips: re-importing the exported file recovers every value', () => {
    // The point of the export. If this fails, the user's metadata is lost the moment they
    // download and re-upload their own resume, which is the ADR-0003 round trip.
    const md = resumeMarkdownExport(resumeMetadataView(record), storedBody);
    const reimported = parseResumeMarkdown(md).frontmatter;

    expect(reimported.name).toBe('张三');
    expect(reimported.title).toBe('后端工程师');
    expect(reimported.email).toBe('zhangsan@example.com');
    // Parsed back as the same string, quoting notwithstanding.
    expect(reimported.phone).toBe('13800138000');
    expect(reimported.location).toBe('北京市朝阳区');
    expect(reimported.website).toBe('https://zhangsan.example.com');
    expect(reimported.github).toBe('https://github.com/zhangsan');
    expect(reimported.linkedin).toBe('https://www.linkedin.com/in/zhangsan');
  });

  it('does not truncate the body — the frontmatter newline is not the separator', () => {
    // Pins that the join between frontmatter and body is a plain newline rather than a
    // separator built from the body's own first character.
    const body = '## 工作经历\n\n- 负责简历解析服务\n- 主导分库分表改造\n';
    const md = resumeMarkdownExport(resumeMetadataView(record), body);

    expect(md).toContain('- 负责简历解析服务');
    expect(md).toContain('- 主导分库分表改造');
    expect(md.endsWith(body)).toBe(true);
    // The body is unchanged and still parses as the original section.
    const parsed = parseResumeMarkdown(md);
    expect(parsed.sections.map((s) => s.title)).toEqual(['工作经历']);
  });

  it('omits the fence entirely when there is no metadata', () => {
    // All columns blank, which is what `resumeMetadataView` yields for a resume whose
    // metadata was never filled in. An empty `---\n---` would claim frontmatter exists.
    const blank: Pick<ResumeRecord, MetadataKey> = {
      name: '',
      job_title: null,
      email: null,
      phone: null,
      location: null,
      website: null,
      github: null,
      linkedin: null,
      avatar: null,
      summary: null,
    };
    const md = resumeMarkdownExport(resumeMetadataView(blank), storedBody);

    expect(md).toBe(storedBody);
    expect(md).not.toContain('---');
  });

  it('maps the frontmatter keys without inventing a job title from the record title', () => {
    // `record.title` is the resume's own name ("后端工程师简历"), not the person's job title.
    // Reading the wrong field would leak the file title into `title`.
    const mapped = metadataViewToEditableFrontmatter(resumeMetadataView(record));
    expect(mapped.title).toBe('后端工程师');
    expect(mapped.title).not.toBe(record.title);
  });

  it('re-attaches draft columns onto a body that already had frontmatter, without nesting', () => {
    // The create flow: the user imported a `.md` (or the AI returned one) that still
    // carries a `---` block, then edited 基本信息 in the form. Saving must emit one
    // fence from the *form*, not wrap the original block in a second one — nested
    // `---` is not YAML and the import parser would lose the draft values.
    const imported = [
      '---',
      'name: 文件里的名字',
      'title: 文件里的职位',
      '---',
      '',
      '## 工作经历',
      '',
      '### 工程师 | 某公司',
      '',
    ].join('\n');
    const parsed = parseResumeMarkdown(imported);
    const draft = resumeMetadataView({
      name: '表单里的名字',
      job_title: '表单里的职位',
      email: 'form@example.com',
    });
    const md = resumeMarkdownExport(draft, parsed.rawContent);

    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('name: 表单里的名字');
    expect(md).toContain('title: 表单里的职位');
    expect(md).toContain('email: form@example.com');
    expect(md).not.toContain('文件里的名字');
    expect(md).toContain('## 工作经历');
    // One fence, not two: the original `---` must not survive inside the body.
    expect(md.split(/^---$/m).length).toBe(3);
  });
});

/**
 * Presentation state is omitted from the `.md` export (ticket 19, ADR-0004).
 *
 * This is the acceptance criterion 导出 `.md` 时展示态的处置已决定并记录, and the decision is
 * "omit". Recording it as a test rather than only as prose is what makes the decision durable:
 * a future change that starts writing styling into the file has to delete an assertion that
 * explains why it should not, instead of quietly contradicting a paragraph nobody re-reads.
 *
 * The keys are listed as literals rather than derived from the presentation module on purpose.
 * A derived list would pass vacuously if the module were renamed, which is the one case where
 * the guarantee matters most — so these strings are pinned, and a rename fails loudly here.
 */
describe('.md export omits presentation state (ticket 19, ADR-0004)', () => {
  const storedBody = '## 工作经历\n\n### 高级后端工程师 | 某某科技\n';

  // A record with distinctive styling values, so if any of them reached the file the assertion
  // below would have to notice. `presentation` is extra to `ResumeRecord`: the export function
  // takes only the metadata view and the body, so the field is here to prove that even a record
  // carrying styling cannot leak it through the export path.
  const recordWithStyling = {
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
    website: null,
    github: null,
    linkedin: null,
    avatar: null,
    summary: null,
    visibility: 'private',
    approval_status: 'pending',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 3,
    presentation: {
      schemaVersion: 1,
      template: 'ats-safe-single-column',
      accentColor: '#8b9d77',
      fontFamily: 'sans',
      fontScale: 1.4,
      lineHeight: 1.9,
      pageMargin: '22mm',
      sectionOrder: ['工作经历', '教育背景'],
      photo: { enabled: true, path: 'avatars/me.png' },
    },
  } as unknown as ResumeRecord;

  it('writes no styling key into the frontmatter', () => {
    const md = resumeMarkdownExport(resumeMetadataView(recordWithStyling), storedBody);

    // Each literal is a key that WOULD appear if presentation state were serialised. Both the
    // camelCase storage spelling and the snake_case wire spelling are checked, because the two
    // have diverged once already in this codebase and either would be the shape an accidental
    // implementation picked.
    for (const key of [
      'accentColor',
      'accent_color',
      'fontFamily',
      'font_family',
      'fontScale',
      'font_scale',
      'lineHeight',
      'line_height',
      'pageMargin',
      'page_margin',
      'sectionOrder',
      'section_order',
      'schemaVersion',
      'schema_version',
      'template',
      'presentation',
      'photo',
    ]) {
      expect(md).not.toContain(key);
    }

    // And no styling *value* either — a key renamed but a colour hard-coded would still be a
    // leak, and a colour is the value most likely to be written by accident.
    expect(md).not.toContain('#8b9d77');
    expect(md).not.toContain('#5c4033');
    expect(md).not.toContain('22mm');
    expect(md).not.toContain('ats-safe-single-column');
  });

  it('still exports the content and the metadata it is supposed to', () => {
    // The counterweight. Asserting only the absence of styling would pass for an export that
    // returned an empty string, which would be a far worse regression than a leaked colour.
    const md = resumeMarkdownExport(resumeMetadataView(recordWithStyling), storedBody);

    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('name: 张三');
    expect(md).toContain('email: zhangsan@example.com');
    expect(md).toContain(storedBody.trimEnd());
  });
});
