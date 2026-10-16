/**
 * The case documents the create flow's 案例参考 step offers (ticket 48).
 *
 * These are **content**, not styling — ADR-0008's whole distinction — so what is asserted here is the
 * shape the content path depends on rather than anything about how a case looks:
 *
 *   - the seed shape `ResumeBuilderPage.openEditor` reads (a body with no frontmatter, ADR-0003);
 *   - card identity (ids and names are unique, or two cases are indistinguishable);
 *   - the derived description the gallery shows.
 *
 * The body's Markdown *structure* is covered by `resume-parser.test.ts`; it is the parser that has to
 * understand it, and a second copy of those expectations here would be a second thing to update.
 */

import { describe, expect, it } from 'vitest';
import {
  BLANK_SEED_ID,
  RESUME_SEEDS,
  findResumeSeed,
  seedSummary,
  type ResumeSeed,
} from '@/lib/resume-template-seeds';
import { parseResumeMarkdown } from '@/lib/resume-parser';

/** A seed with a hand-written body, for the cases the real catalogue may not contain. */
function seed(overrides: Partial<ResumeSeed> = {}): ResumeSeed {
  return { id: 'x', name: '某案例', body: '## 关于我\n一句话。', ...overrides };
}

describe('the case catalogue', () => {
  it('gives every case a unique id', () => {
    const ids = RESUME_SEEDS.map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every case a unique, non-empty name, because a card shows nothing else', () => {
    const names = RESUME_SEEDS.map((s) => s.name);

    expect(names.every((name) => name.trim() !== '')).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves the blank case by id, which 「空白创建」 starts from', () => {
    expect(findResumeSeed(BLANK_SEED_ID)).toBeDefined();
    expect(findResumeSeed('no-such-case')).toBeUndefined();
  });

  it('carries no frontmatter, so a case cannot seed the form with someone else’s details', () => {
    // ADR-0003: metadata lives in columns, and frontmatter is an interchange format. A seed with a
    // `---` block would pre-fill the name and contact fields with the sample person's details — which
    // people forget to replace, and which the user never typed.
    for (const resumeSeed of RESUME_SEEDS) {
      expect(resumeSeed.body.startsWith('---'), `${resumeSeed.id} starts with frontmatter`).toBe(false);
      expect(resumeSeed.body).not.toContain('\n---\n');
    }
  });

  it('parses into sections, which is what the editor and the preview render', () => {
    for (const resumeSeed of RESUME_SEEDS) {
      if (resumeSeed.id === BLANK_SEED_ID) continue;
      expect(parseResumeMarkdown(resumeSeed.body).sections.length, resumeSeed.id).toBeGreaterThan(0);
    }
  });

  it('writes each skill as its own chip line, never a comma list', () => {
    // One `- chip` per line is what the mixed-component editor saves and what the AI
    // prompt asks for. A comma / 顿号 / semicolon on a skill bullet would load as several
    // chips, and `/` is not a chip separator — so `CI/CD` on its own line is one chip.
    const chipSeparators = /[,，、;；]/;
    for (const resumeSeed of RESUME_SEEDS) {
      const skills = parseResumeMarkdown(resumeSeed.body).sections.find((section) =>
        section.title.includes('技能'),
      );
      expect(skills, resumeSeed.id).toBeDefined();
      const chipLines = skills!.content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '));
      expect(chipLines.length, resumeSeed.id).toBeGreaterThan(0);
      for (const line of chipLines) {
        expect(line, `${resumeSeed.id}: ${line}`).not.toMatch(chipSeparators);
      }
    }
  });
});

describe('seedSummary', () => {
  it('reads the case’s own opening line rather than a hand-written description', () => {
    const body = `## 关于我\n3 年行政运营经验，擅长流程优化。\n\n## 工作经历\n### 岗位 | 公司\n`;

    expect(seedSummary(seed({ body }))).toBe('3 年行政运营经验，擅长流程优化。');
  });

  it('skips blank lines and anything that is still a heading', () => {
    const body = `## 关于我\n\n### 小标题\n真正的第一句。\n`;

    expect(seedSummary(seed({ body }))).toBe('真正的第一句。');
  });

  it('cuts a long paragraph at the card’s width', () => {
    const summary = seedSummary(seed({ body: `## 关于我\n${'长'.repeat(200)}\n` }));

    // 52 characters plus the ellipsis: the card shows two lines, and an uncut paragraph would make
    // one card taller than the ones beside it.
    expect(summary).toHaveLength(53);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('says nothing for the blank case, whose 关于我 is scaffolding', () => {
    const blank = findResumeSeed(BLANK_SEED_ID);

    expect(blank).toBeDefined();
    expect(seedSummary(blank!)).toBe('');
  });

  it('says nothing when there is no 关于我 section to read', () => {
    expect(seedSummary(seed({ body: '## 技能\nGo, Rust' }))).toBe('');
  });
});
