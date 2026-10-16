import { describe, expect, it } from 'vitest';
import {
  parseResumeMarkdown,
  parsedFromStructuredContent,
  resumeMetadataView,
  sectionsFromStructuredContent,
  withMetadata,
} from '@/lib/resume-parser';
import type { ResumeRecord } from '@/lib/types';
import type { MetadataKey } from '@/lib/resume-metadata';

/**
 * Regression guard for the resume parser.
 *
 * Why these particular cases: the parser sits on the read path for every resume
 * the product displays. It runs unguarded at eight call sites — including the
 * server render of the public `/resume/[slug]` page — so a parser throw is a 500
 * for the visitor, and a parser mistake is silent data loss in the editor.
 */

const RESUME = [
  '---',
  'name: 李四',
  'title: 后端工程师',
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
  '熟悉 Go、PostgreSQL 与 Kubernetes',
  '',
].join('\n');

describe('parseResumeMarkdown — frontmatter', () => {
  it('reads the known frontmatter keys', () => {
    const { frontmatter } = parseResumeMarkdown(RESUME);

    expect(frontmatter.name).toBe('李四');
    expect(frontmatter.title).toBe('后端工程师');
    expect(frontmatter.email).toBe('lisi@example.com');
  });

  it('leaves absent keys undefined rather than inventing empty strings', () => {
    const { frontmatter } = parseResumeMarkdown(RESUME);

    // The editor distinguishes "not provided" from "explicitly cleared", so this
    // distinction is load-bearing.
    expect(frontmatter.phone).toBeUndefined();
    expect(frontmatter.avatar).toBeUndefined();
  });

  it('keeps the body in rawContent without the frontmatter block', () => {
    const { rawContent } = parseResumeMarkdown(RESUME);

    expect(rawContent).not.toContain('name: 李四');
    expect(rawContent).toContain('## 教育经历');
  });
});

describe('parseResumeMarkdown — sections', () => {
  it('splits on H2 in document order', () => {
    const { sections } = parseResumeMarkdown(RESUME);

    expect(sections.map((s) => s.title)).toEqual(['教育经历', '技能']);
  });

  it('splits an H3 into title and subtitle on the pipe', () => {
    const [education] = parseResumeMarkdown(RESUME).sections;

    expect(education.items).toHaveLength(1);
    expect(education.items[0].title).toBe('清华大学');
    expect(education.items[0].subtitle).toBe('计算机科学与技术');
  });

  it('treats an H3 with no pipe as title-only and leaves subtitle undefined', () => {
    const md = '## 项目\n\n### 简历平台\n\n- 从零搭建\n';
    const [project] = parseResumeMarkdown(md).sections;

    expect(project.items[0].title).toBe('简历平台');
    // undefined, not '', so the serialiser knows to omit the pipe.
    expect(project.items[0].subtitle).toBeUndefined();
  });

  it('reads the italic line immediately after an H3 as the date', () => {
    const [education] = parseResumeMarkdown(RESUME).sections;

    expect(education.items[0].date).toBe('2020.09 - 2024.06');
  });

  it('collects bullets into details in order', () => {
    const [education] = parseResumeMarkdown(RESUME).sections;

    expect(education.items[0].details).toEqual(['GPA 3.9/4.0', '两次国家奖学金']);
  });

  it('accepts * as a bullet as well as -', () => {
    const md = '## 项目\n\n### A\n\n* 第一条\n* 第二条\n';
    const [project] = parseResumeMarkdown(md).sections;

    expect(project.items[0].details).toEqual(['第一条', '第二条']);
  });

  it('keeps prose that belongs to a section but to no item', () => {
    const { sections } = parseResumeMarkdown(RESUME);
    const skills = sections.find((s) => s.title === '技能');

    expect(skills?.content).toBe('熟悉 Go、PostgreSQL 与 Kubernetes');
    expect(skills?.items).toEqual([]);
  });

  it('trims surrounding blank lines out of section prose', () => {
    const md = '## 技能\n\n\n熟悉 Go\n\n\n';
    const [skills] = parseResumeMarkdown(md).sections;

    expect(skills.content).toBe('熟悉 Go');
  });

  it('attaches mixed blocks from the body, without changing content or items', () => {
    const md = [
      '## 技能',
      '补充说明。',
      '',
      '- TypeScript',
      '- CI/CD',
    ].join('\n');
    const [skills] = parseResumeMarkdown(md).sections;

    expect(skills.content).toContain('TypeScript');
    expect(skills.items).toEqual([]);
    expect(skills.blocks).toEqual([
      { type: 'paragraph', text: '补充说明。' },
      { type: 'chips', chips: ['TypeScript', 'CI/CD'] },
    ]);
  });
});

describe('parseResumeMarkdown — line endings and edges', () => {
  it('parses CRLF identically to LF', () => {
    const fromLf = parseResumeMarkdown(RESUME);
    const fromCrlf = parseResumeMarkdown(RESUME.replace(/\n/g, '\r\n'));

    expect(fromCrlf.sections).toEqual(fromLf.sections);
    expect(fromCrlf.frontmatter).toEqual(fromLf.frontmatter);
  });

  it('parses a CR-only body', () => {
    // parseSections normalises lone CR itself, so an old-Mac file still yields
    // its sections even though gray-matter cannot read its frontmatter — see the
    // known-defect case directly below.
    const fromCr = parseResumeMarkdown('## 教育经历\r\r### 清华\r\r- GPA\r');

    expect(fromCr.sections.map((s) => s.title)).toEqual(['教育经历']);
    expect(fromCr.sections[0].items[0].details).toEqual(['GPA']);
  });

  it.fails('parses a CR-only document whole, frontmatter included', () => {
    const fromCr = parseResumeMarkdown(RESUME.replace(/\n/g, '\r'));

    expect(fromCr.sections.map((s) => s.title)).toEqual(['教育经历', '技能']);
    expect(fromCr.frontmatter.name).toBe('李四');
  });

  it('returns no sections for an empty document', () => {
    expect(parseResumeMarkdown('').sections).toEqual([]);
  });

  it('returns no sections for a body with no H2', () => {
    expect(parseResumeMarkdown('只有一段没有标题的文字').sections).toEqual([]);
  });

  it('does not treat H1 as a section boundary', () => {
    // A stray H1 must not silently become a section, or the editor would show a
    // phantom module the user never created.
    expect(parseResumeMarkdown('# 简历\n\n## 技能\n\nGo').sections.map((s) => s.title)).toEqual(['技能']);
  });

  it('keeps an empty section rather than dropping it', () => {
    // The user just added this module; dropping it would make the click look
    // like it did nothing.
    const sections = parseResumeMarkdown('## 新模块\n\n## 技能\n\nGo').sections;

    expect(sections.map((s) => s.title)).toEqual(['新模块', '技能']);
    expect(sections[0].items).toEqual([]);
    expect(sections[0].content).toBe('');
  });

  it('attaches a bullet before any H3 to the section, not to a phantom item', () => {
    const md = '## 项目\n\n- 游离的条目\n';
    const [project] = parseResumeMarkdown(md).sections;

    expect(project.items).toEqual([]);
    expect(project.content).toBe('- 游离的条目');
  });
});

/**
 * KNOWN DEFECT — expected to fail until ticket 01's follow-up (ticket 17) lands.
 *
 * `parseResumeMarkdown` delegates YAML parsing to gray-matter and lets it throw.
 * Because eight call sites — including the server render of `/resume/[slug]` —
 * call it unguarded, a resume whose frontmatter happens to be invalid YAML takes
 * down the page that displays it.
 *
 * Marked `it.fail` so the suite stays green while keeping the gap visible and
 * tracked, rather than deleting the assertion and pretending it does not exist.
 * Ticket 17 removes runtime frontmatter parsing entirely (metadata moves to
 * columns), which retires this defect designedly rather than by accident.
 */
describe('parseResumeMarkdown — malformed frontmatter (known defect, ticket 17)', () => {
  it.fails('should not throw on unparseable YAML', () => {
    const md = '---\nname: 张: 三\n---\n\n## 技能\n\nGo\n';

    expect(() => parseResumeMarkdown(md)).not.toThrow();
  });

  it.fails('should not return a non-string where the type says string', () => {
    // YAML happily parses `&张三` as a null anchor and `[张三]` as an array, so the
    // declared `name?: string` is a lie at runtime.
    const md = '---\nname: &张三\n---\n\n## 技能\n\nGo\n';
    const { frontmatter } = parseResumeMarkdown(md);

    expect(typeof frontmatter.name === 'string' || frontmatter.name === undefined).toBe(true);
  });
});

/**
 * Ticket 18 task 1: the database columns are the metadata authority.
 *
 * Ticket 17 moved metadata into `resumes` columns and stripped frontmatter from the
 * stored document, which left `parsed.frontmatter` permanently empty. Every metadata
 * **read** path — preview, PDF/image export, plain-text export, resume naming — still
 * read it, so they all silently rendered nothing. These tests pin the merge that fixes
 * it: the columns win, the document is the fallback.
 */
describe('resumeMetadataView — the columns are the metadata authority (ticket 18)', () => {
  /** A record shaped like the API returns it; every column present but null. */
  const emptyRecord: ResumeRecord = {
    id: 'r1',
    user_id: 'u1',
    title: '未命名',
    slug: 'lisi',
    filename: 'r1.body.md',
    name: null,
    job_title: null,
    email: null,
    phone: null,
    location: null,
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
    version: 1,
  };

  it('maps every column onto the frontmatter key a consumer reads', () => {
    const view = resumeMetadataView({
      ...emptyRecord,
      name: '李四',
      job_title: '后端工程师',
      email: 'lisi@example.com',
      phone: '13800138000',
      location: '北京市',
      website: 'https://lisi.example.com',
      github: 'https://github.com/lisi',
      linkedin: 'https://www.linkedin.com/in/lisi',
      avatar: 'https://lisi.example.com/a.png',
    });

    expect(view).toEqual({
      name: '李四',
      // The one asymmetric key: the column is `job_title`, the frontmatter key is `title`.
      // Every consumer reads `frontmatter.title`, so a missing map means no job title.
      title: '后端工程师',
      email: 'lisi@example.com',
      phone: '13800138000',
      location: '北京市',
      website: 'https://lisi.example.com',
      github: 'https://github.com/lisi',
      linkedin: 'https://www.linkedin.com/in/lisi',
      avatar: 'https://lisi.example.com/a.png',
    });
  });

  it('omits null columns rather than emitting null', () => {
    // `frontmatter.name?: string` promises string-or-absent. A literal null would flow
    // into `frontmatter.name && <div>` and render as nothing while still being truthy
    // in a `'name' in frontmatter` check — the type has to stay honest.
    const view = resumeMetadataView(emptyRecord);

    for (const value of Object.values(view)) {
      expect(value).not.toBeNull();
    }
    expect(view).toEqual({});
  });

  it('treats an empty or whitespace-only column as absent, not as a value', () => {
    // Clearing a field through the ticket-15 panel writes `''`, not NULL. Overwriting a
    // real imported value with `''` would make a clear irreversible on re-import.
    const view = resumeMetadataView({ ...emptyRecord, name: '', job_title: '   ' });

    expect(view.name).toBeUndefined();
    expect(view.title).toBeUndefined();
  });

  it("lets the columns win over the document's own frontmatter", () => {
    // An imported `.md` may carry frontmatter. The columns are what the panel edits, so
    // the document must never shadow them.
    const view = resumeMetadataView(
      { ...emptyRecord, name: '列里的名字' },
      { name: '文件里的名字', title: '文件里的职位', email: 'file@example.com' },
    );

    expect(view.name).toBe('列里的名字');
    // Not set as a column, so the document still supplies it.
    expect(view.email).toBe('file@example.com');
    // A column that is NULL must fall through to the document.
    expect(view.title).toBe('文件里的职位');
  });

  it('falls back to the document when no record is available', () => {
    // A guest viewing a shared `.md`, and the editor's optimistic preview before a save
    // returns, both reach this with no record.
    const view = resumeMetadataView(null, { name: '文件里的名字' });

    expect(view).toEqual({ name: '文件里的名字' });
  });
});

describe('withMetadata — swaps the metadata view into a parsed resume (ticket 18)', () => {
  const record = {
    name: '李四',
    job_title: '后端工程师',
    email: 'lisi@example.com',
  } as unknown as ResumeRecord;

  it('replaces frontmatter while leaving the body untouched', () => {
    const parsed = parseResumeMarkdown('## 技能\n\n熟悉 Go、PostgreSQL\n');
    const merged = withMetadata(parsed, record);

    expect(merged.frontmatter.name).toBe('李四');
    expect(merged.frontmatter.title).toBe('后端工程师');
    // The body is not re-parsed or mutated: sections and rawContent must be identical
    // objects, so this cannot drift from what the parser produced.
    expect(merged.sections).toBe(parsed.sections);
    expect(merged.rawContent).toBe(parsed.rawContent);
  });

  it('does not mutate the parsed value it is given', () => {
    const parsed = parseResumeMarkdown('## 技能\n\nGo\n');
    const before = { ...parsed.frontmatter };

    withMetadata(parsed, record);

    // `page.tsx` holds `parsed` in a server render and `ResumePageClient` keeps it in
    // state; an in-place write would make the result depend on render order.
    expect(parsed.frontmatter).toEqual(before);
  });

  it('is idempotent, so applying it twice equals applying it once', () => {
    // The client normalises again after every save; without idempotence the second pass
    // would have to be guarded by hand at each call site.
    const parsed = parseResumeMarkdown('## 技能\n\nGo\n');

    expect(withMetadata(withMetadata(parsed, record), record)).toEqual(
      withMetadata(parsed, record),
    );
  });
});

/**
 * Consuming the server's snapshot (ticket 18 task 3, ADR-0003).
 *
 * The server now returns the parsed body, so the client no longer derives structure from the
 * bytes. These tests pin the conversion — including the normalisations the components depend
 * on — because a wrong conversion here is invisible: the page renders, just with sections or
 * details quietly missing.
 */
describe('sectionsFromStructuredContent — the server snapshot is the structure (ticket 18)', () => {
  it('maps a full section, item, date and detail set', () => {
    const sections = sectionsFromStructuredContent({
      sections: [
        {
          title: '工作经历',
          kind: 'experience',
          content: '',
          items: [
            {
              title: '高级后端工程师',
              subtitle: '某某科技',
              date: '2021.03 - 2024.06',
              details: ['一件事', '另一件事'],
            },
          ],
        },
      ],
    });

    expect(sections).toEqual([
      {
        title: '工作经历',
        kind: 'experience',
        content: '',
        items: [
          {
            title: '高级后端工程师',
            subtitle: '某某科技',
            date: '2021.03 - 2024.06',
            details: ['一件事', '另一件事'],
          },
        ],
      },
    ]);
  });

  it('normalises the optional fields the components branch on', () => {
    // `details.map(...)` throws on `undefined`, and the components test `item.date` for
    // truthiness — so `''` and absent must both become `undefined`, and details must always
    // be an array. Getting this wrong is a blank page or a crash, not a subtle difference.
    const [section] = sectionsFromStructuredContent({
      sections: [{ title: '关于我', kind: 'summary', content: '一段话', items: [{ title: 'x' }] }],
    });

    expect(section.content).toBe('一段话');
    expect(section.items[0].details).toEqual([]);
    expect(section.items[0].subtitle).toBeUndefined();
    expect(section.items[0].date).toBeUndefined();
  });

  it('treats an empty string subtitle as absent', () => {
    const [section] = sectionsFromStructuredContent({
      sections: [{ items: [{ title: 'x', subtitle: '', date: '' }] }],
    });

    expect(section.items[0].subtitle).toBeUndefined();
    expect(section.items[0].date).toBeUndefined();
  });

  it('ignores an unknown kind from a newer server and classifies locally instead', () => {
    // A future server may invent a category. Passing the value through would make this build
    // treat an unknown kind as known, and the renderer would draw it in a shape that does not
    // fit. Falling back to the local classifier draws it correctly (`other` here), and the
    // unrecognised wire value never reaches a renderer.
    const [section] = sectionsFromStructuredContent({
      sections: [{ title: '获奖情况', kind: 'awards-v2' }],
    });

    expect(section.kind).toBe('other');
  });

  it('keeps every kind this build knows', () => {
    const kinds = ['summary', 'experience', 'education', 'skills', 'projects', 'other'] as const;
    for (const kind of kinds) {
      const [section] = sectionsFromStructuredContent({ sections: [{ title: 't', kind }] });
      expect(section.kind, kind).toBe(kind);
    }
  });

  it('classifies locally when the server sent no kind', () => {
    // The server always sends a kind, including `other` for an unrecognised title — so this
    // path is reached by a snapshot from a server that omits the field. Every section still
    // ends up with *a* kind, so no renderer has to run a fallback of its own, which is how
    // the three divergent skill tests arose.
    const sections = sectionsFromStructuredContent({
      sections: [{ title: '教育经历' }, { title: '技能' }, { title: '完全未知的小节' }],
    });

    expect(sections.map((s) => s.kind)).toEqual(['education', 'skills', 'other']);
  });

  it('returns nothing for an absent or empty snapshot, without throwing', () => {
    // This is the fallback path: an older server sends no `content` field at all, and the
    // caller must be able to detect that (empty array) instead of crashing.
    expect(sectionsFromStructuredContent(undefined)).toEqual([]);
    expect(sectionsFromStructuredContent(null)).toEqual([]);
    expect(sectionsFromStructuredContent({})).toEqual([]);
    expect(sectionsFromStructuredContent({ sections: [] })).toEqual([]);
  });

  it('tolerates a section with no title or items', () => {
    // Defensive: the server always fills these, but a malformed payload must not produce
    // `undefined` where a consumer expects a string or an array. An empty title classifies
    // as `other` rather than accidentally matching a keyword.
    const [section] = sectionsFromStructuredContent({ sections: [{}] });
    expect(section.title).toBe('');
    expect(section.content).toBe('');
    expect(section.kind).toBe('other');
    expect(section.items).toEqual([]);
  });
});

describe('parsedFromStructuredContent — snapshot plus column metadata (ticket 18)', () => {
  // A complete metadata record, as the API sends it: absent columns come through as `null`,
  // not as missing keys. `resumeMetadataView` takes the full set on purpose — a partial
  // record cannot be told apart from one whose fields were omitted in transit.
  const record: Pick<ResumeRecord, MetadataKey> = {
    name: '李四',
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

  it('takes the structure from the snapshot and the metadata from the columns', () => {
    const parsed = parsedFromStructuredContent(
      { sections: [{ title: '技能', kind: 'skills', content: 'Go、Rust' }] },
      record,
    );

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].kind).toBe('skills');
    // Columns win, and `job_title` maps to the frontmatter key `title`.
    expect(parsed.frontmatter.name).toBe('李四');
    expect(parsed.frontmatter.title).toBe('后端工程师');
  });

  it('leaves rawContent empty rather than inventing one', () => {
    // `rawContent` is the client parser's by-product with no server equivalent. The real body
    // travels alongside as `markdown`; fabricating a value here would create a second,
    // unofficial source for it.
    const parsed = parsedFromStructuredContent({ sections: [] }, record);
    expect(parsed.rawContent).toBe('');
  });

  it('falls back to the document frontmatter when a column is empty', () => {
    const parsed = parsedFromStructuredContent(
      { sections: [] },
      { ...record, name: '', job_title: null },
      { name: '文件里的名字' },
    );

    expect(parsed.frontmatter.name).toBe('文件里的名字');
  });
});
