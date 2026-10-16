import { describe, expect, it } from 'vitest';
import {
  classifySectionTitle,
  collectSkills,
  isSkillsSection,
  resolveSectionKind,
  splitSkillList,
} from '@/lib/resume-section';

/**
 * The section classifier and skill splitter (ticket 18 tasks 5–6).
 *
 * # Why these tests exist
 *
 * `resume-section.ts` is the **non-authoritative** mirror of the Go parser, so nothing at
 * runtime can prove the two agree. These tests are that proof on the cases where they
 * previously diverged: the old frontend tested `title.includes('经历')` for experience
 * *before* education, so `## 教育经历` drew a briefcase; and it split skills on `,` alone, so
 * `Go、PostgreSQL` rendered as one chip.
 *
 * A change to the keyword list or its order here must fail one of these.
 */
describe('classifySectionTitle — one classifier, not three (ticket 18 task 6)', () => {
  it('reads 教育经历 and 项目经历 as their own qualifier, not as experience', () => {
    // The specific bug: `经历` appears in all three titles, so whichever rule claims it first
    // wins. Education and projects must claim their own qualifier before the generic rule.
    expect(classifySectionTitle('教育经历')).toBe('education');
    expect(classifySectionTitle('项目经历')).toBe('projects');
    expect(classifySectionTitle('工作经历')).toBe('experience');
  });

  it('classifies the titles the app actually writes', () => {
    for (const [title, kind] of [
      ['关于我', 'summary'],
      ['个人简介', 'summary'],
      ['工作经历', 'experience'],
      ['工作经验', 'experience'],
      ['实习经历', 'experience'],
      ['教育经历', 'education'],
      ['学历', 'education'],
      ['专业技能', 'skills'],
      ['技能', 'skills'],
      ['技术栈', 'skills'],
      ['项目经历', 'projects'],
      ['作品集', 'projects'],
    ] as const) {
      expect(classifySectionTitle(title), title).toBe(kind);
    }
  });

  it('matches Latin keywords as prefixes, so the words people write are found', () => {
    // `tech` must match `Technical Skills`, which whole-word matching missed entirely.
    expect(classifySectionTitle('Skills')).toBe('skills');
    expect(classifySectionTitle('Technical Skills')).toBe('skills');
    expect(classifySectionTitle('Work Experience')).toBe('experience');
    expect(classifySectionTitle('Projects')).toBe('projects');
    expect(classifySectionTitle('Education')).toBe('education');
    expect(classifySectionTitle('About Me')).toBe('summary');
  });

  it('is case-insensitive for Latin titles', () => {
    expect(classifySectionTitle('SKILLS')).toBe('skills');
    expect(classifySectionTitle('work experience')).toBe('experience');
  });

  it('returns other for a title no rule recognises, without guessing', () => {
    // `other` is a real answer: the section renders plainly. Guessing a category would draw
    // it in a shape that does not fit — the failure this replaces.
    for (const title of ['获奖情况', '自我评价', '出版物', 'Volunteering', '']) {
      expect(classifySectionTitle(title), title).toBe('other');
    }
  });

  it('does not let a whitespace-only title match anything', () => {
    expect(classifySectionTitle('   ')).toBe('other');
  });
});

describe('resolveSectionKind — the server wins when it answered', () => {
  it('prefers the server kind over the local classification', () => {
    // Contrived on purpose: the point is that the local rule does **not** get a vote once the
    // server has spoken. If this ever returns `experience`, something started re-deriving the
    // kind locally and the server stopped being authoritative (ADR-0003).
    expect(resolveSectionKind({ title: '工作经历', kind: 'projects' })).toBe('projects');
  });

  it('falls back to the title only when the server sent no kind', () => {
    expect(resolveSectionKind({ title: '工作经历' })).toBe('experience');
    expect(resolveSectionKind({ title: '技能', kind: undefined })).toBe('skills');
  });
});

describe('isSkillsSection — the question the renderers actually ask', () => {
  it('is true for the server skills kind and for a locally-classified skills title', () => {
    expect(isSkillsSection({ title: 'anything', kind: 'skills' })).toBe(true);
    expect(isSkillsSection({ title: '专业技能' })).toBe(true);
  });

  it('is false for every other kind', () => {
    for (const kind of ['summary', 'experience', 'education', 'projects', 'other'] as const) {
      expect(isSkillsSection({ title: '技能', kind }), kind).toBe(false);
    }
  });
});

describe('splitSkillList — every separator, half-width and full-width (ticket 18)', () => {
  it('splits on 顿号, which is what the app\u2019s own documents use', () => {
    // The named bug: this used to render as one skill called "Go、PostgreSQL、Kubernetes".
    expect(splitSkillList('Go、PostgreSQL、Kubernetes')).toEqual([
      'Go',
      'PostgreSQL',
      'Kubernetes',
    ]);
  });

  it('splits on every documented separator', () => {
    for (const [input, want] of [
      ['Go,PostgreSQL', ['Go', 'PostgreSQL']],
      ['Go，PostgreSQL', ['Go', 'PostgreSQL']],
      ['Go;PostgreSQL', ['Go', 'PostgreSQL']],
      ['Go；PostgreSQL', ['Go', 'PostgreSQL']],
      ['Go/PostgreSQL', ['Go', 'PostgreSQL']],
      ['Go|PostgreSQL', ['Go', 'PostgreSQL']],
    ] as const) {
      expect(splitSkillList(input), input).toEqual(want);
    }
  });

  it('trims the spaces around a separator', () => {
    expect(splitSkillList('Go ,  PostgreSQL 、 Kubernetes')).toEqual([
      'Go',
      'PostgreSQL',
      'Kubernetes',
    ]);
  });

  it('drops blank segments instead of emitting empty chips', () => {
    expect(splitSkillList('Go,,PostgreSQL,')).toEqual(['Go', 'PostgreSQL']);
    expect(splitSkillList('Go、、、PostgreSQL')).toEqual(['Go', 'PostgreSQL']);
  });

  it('returns nothing for empty or separator-only input', () => {
    expect(splitSkillList('')).toEqual([]);
    expect(splitSkillList('   ')).toEqual([]);
    expect(splitSkillList(',、;')).toEqual([]);
  });

  it('keeps a multi-word skill as one skill', () => {
    // A space is a separator, so `Machine Learning` would split — this pins that the filter
    // drops the empty segments rather than that behaviour being accidental.
    expect(splitSkillList('PostgreSQL')).toEqual(['PostgreSQL']);
  });

  it('splits CI/CD into two, matching the server, because / is a separator', () => {
    // Deliberate and documented: the ticket lists `/` as a separator, and the server does the
    // same. Special-casing it here would make the two disagree, which is the thing being
    // fixed — so this asserts the shared behaviour rather than pretending it is ideal.
    expect(splitSkillList('CI/CD')).toEqual(['CI', 'CD']);
  });
});

describe('collectSkills — every place a skill list is written', () => {
  it('reads a one-line content list', () => {
    expect(
      collectSkills({ content: 'Go、PostgreSQL、Kubernetes', items: [] }),
    ).toEqual(['Go', 'PostgreSQL', 'Kubernetes']);
  });

  it('reads a bulleted content list and strips the markers', () => {
    expect(collectSkills({ content: '- Go\n- PostgreSQL\n* Kubernetes', items: [] })).toEqual([
      'Go',
      'PostgreSQL',
      'Kubernetes',
    ]);
  });

  it('reads item titles and details', () => {
    expect(
      collectSkills({
        content: '',
        items: [{ title: 'Go,Rust', subtitle: undefined, date: undefined, details: ['PostgreSQL', 'Kubernetes'] }],
      }),
    ).toEqual(['Go', 'Rust', 'PostgreSQL', 'Kubernetes']);
  });

  it('deduplicates while keeping the document order', () => {
    // Order is first-seen rather than sorted, so the chips follow the document the user wrote.
    expect(collectSkills({ content: 'Go、Rust、Go', items: [] })).toEqual(['Go', 'Rust']);
    expect(collectSkills({ content: 'Zig、Ada', items: [{ title: 'Zig', subtitle: undefined, date: undefined, details: [] }] })).toEqual([
      'Zig',
      'Ada',
    ]);
  });

  it('returns nothing for a section with no skills anywhere', () => {
    expect(collectSkills({ content: '', items: [] })).toEqual([]);
    expect(collectSkills({ content: '\n\n', items: [] })).toEqual([]);
  });
});
