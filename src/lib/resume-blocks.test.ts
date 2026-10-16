import { describe, expect, it } from 'vitest';
import {
  attachBlocksToSections,
  inferSectionBlocksFromBody,
  inferSectionBlocksFromParsed,
  serializeSectionBlocks,
  splitChipLine,
} from '@/lib/resume-blocks';
import { parseResumeMarkdown, sectionsFromStructuredContent } from '@/lib/resume-parser';
import { editableToMarkdown, parsedToEditable } from '@/lib/resume-builder';

describe('splitChipLine', () => {
  it('splits commas, 顿号 and semicolons, but not a slash', () => {
    expect(splitChipLine('TypeScript, React、Go; Python')).toEqual([
      'TypeScript',
      'React',
      'Go',
      'Python',
    ]);
    expect(splitChipLine('CI/CD')).toEqual(['CI/CD']);
  });

  it('drops empty pieces around separators', () => {
    expect(splitChipLine('  TypeScript， ，Go  ')).toEqual(['TypeScript', 'Go']);
    expect(splitChipLine('')).toEqual([]);
  });
});

describe('inferSectionBlocksFromBody', () => {
  it('reads prose as a paragraph, consecutive bullets as chips, ### as an entry', () => {
    const blocks = inferSectionBlocksFromBody([
      '一段关于我的话。',
      '',
      '### 工程师 | 某公司',
      '*2022年3月 - 至今*',
      '- 做了什么',
      '',
      '- TypeScript',
      '- React',
    ].join('\n'));

    expect(blocks).toEqual([
      { type: 'paragraph', text: '一段关于我的话。' },
      {
        type: 'entry',
        item: {
          title: '工程师',
          subtitle: '某公司',
          date: '2022年3月 - 至今',
          details: ['做了什么'],
        },
      },
      { type: 'chips', chips: ['TypeScript', 'React'] },
    ]);
  });

  it('splits a comma list on one bullet into several chips, but keeps CI/CD together', () => {
    const blocks = inferSectionBlocksFromBody('- TypeScript, React, CI/CD');
    expect(blocks).toEqual([
      { type: 'chips', chips: ['TypeScript', 'React', 'CI/CD'] },
    ]);
  });

  it('does not end an entry on the blank line between heading and details', () => {
    const blocks = inferSectionBlocksFromBody([
      '### 岗位 | 公司',
      '',
      '*2020年1月 - 2021年1月*',
      '',
      '- 职责',
    ].join('\n'));

    expect(blocks).toEqual([
      {
        type: 'entry',
        item: {
          title: '岗位',
          subtitle: '公司',
          date: '2020年1月 - 2021年1月',
          details: ['职责'],
        },
      },
    ]);
  });

  it('ends an entry at a blank after its details so a later bullet can be chips', () => {
    const blocks = inferSectionBlocksFromBody([
      '### 岗位 | 公司',
      '- 职责',
      '',
      '- TypeScript',
    ].join('\n'));

    expect(blocks.map((block) => block.type)).toEqual(['entry', 'chips']);
    expect(blocks[1]).toEqual({ type: 'chips', chips: ['TypeScript'] });
  });
});

describe('inferSectionBlocksFromParsed', () => {
  it('walks content first, then leftover items, when there is no markdown to recover order from', () => {
    const blocks = inferSectionBlocksFromParsed({
      content: '一段话。',
      items: [{ title: '岗位', subtitle: '公司', date: '2022', details: ['职责'] }],
    });

    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'entry']);
  });

  it('treats a skills-style content bullet as chips even without a skills kind', () => {
    const blocks = inferSectionBlocksFromParsed({
      content: '- TypeScript, React, Go',
      items: [],
    });

    expect(blocks).toEqual([
      { type: 'chips', chips: ['TypeScript', 'React', 'Go'] },
    ]);
  });
});

describe('serializeSectionBlocks', () => {
  it('writes one chip per line and omits empty paragraphs and empty chip groups', () => {
    const body = serializeSectionBlocks([
      { type: 'paragraph', text: '  ' },
      { type: 'paragraph', text: '关于我。' },
      { type: 'chips', chips: ['', '  '] },
      { type: 'chips', chips: ['TypeScript', ' CI/CD '] },
      { type: 'entry', item: { title: '', subtitle: undefined, date: undefined, details: [] } },
    ]);

    expect(body).toBe([
      '关于我。',
      '',
      '- TypeScript',
      '- CI/CD',
      '',
      '### ',
    ].join('\n'));
  });

  it('round-trips mixed order through markdown, and is stable on a second pass', () => {
    const original = [
      '一段话。',
      '',
      '### 工程师 | 某公司',
      '*2022年3月 - 至今*',
      '- 做了什么',
      '',
      '- TypeScript',
      '- CI/CD',
    ].join('\n');

    const once = serializeSectionBlocks(inferSectionBlocksFromBody(original));
    const twice = serializeSectionBlocks(inferSectionBlocksFromBody(once));

    expect(once).toBe(original);
    expect(twice).toBe(once);
  });

  it('rewrites a comma list into one chip per line, then stays put', () => {
    const once = serializeSectionBlocks(inferSectionBlocksFromBody('- Go、PostgreSQL'));
    expect(once).toBe('- Go\n- PostgreSQL');
    expect(serializeSectionBlocks(inferSectionBlocksFromBody(once))).toBe(once);
  });
});

describe('attachBlocksToSections', () => {
  it('recovers mixed order from markdown rather than from content-then-items', () => {
    const markdown = [
      '## 技能',
      '',
      '我也会写一点说明。',
      '',
      '- TypeScript',
      '- Go',
    ].join('\n');
    const parsed = parseResumeMarkdown(markdown);
    const snapshot = sectionsFromStructuredContent({
      sections: parsed.sections.map((section) => ({
        title: section.title,
        kind: section.kind,
        content: section.content,
        items: section.items,
      })),
    });

    expect(snapshot[0].blocks).toBeUndefined();

    const withBlocks = attachBlocksToSections(snapshot, markdown);
    expect(withBlocks[0].blocks?.map((block) => block.type)).toEqual(['paragraph', 'chips']);
  });

  it('falls back to content-then-items when there is no markdown to walk', () => {
    const snapshot = sectionsFromStructuredContent({
      sections: [{ title: '技能', content: '- Go', items: [] }],
    });
    expect(snapshot[0].blocks).toBeUndefined();

    const inferred = attachBlocksToSections(snapshot);
    expect(inferred[0].blocks).toEqual([{ type: 'chips', chips: ['Go'] }]);
  });
});

describe('editor parse → serialise of mixed blocks', () => {
  it('is stable on a second pass for a mixed section', () => {
    const markdown = [
      '## 工作经历',
      '',
      '补充说明。',
      '',
      '### 工程师 | 某公司',
      '*2022年3月 - 至今*',
      '- 做了什么',
      '',
      '- TypeScript',
      '- CI/CD',
    ].join('\n');

    const roundTrip = (source: string) => {
      const { frontmatter, sections } = parsedToEditable(parseResumeMarkdown(source));
      return editableToMarkdown(frontmatter, sections, { includeFrontmatter: false });
    };

    const once = roundTrip(markdown);
    expect(roundTrip(once)).toBe(once);
    expect(once).toContain('- TypeScript');
    expect(once).toContain('- CI/CD');
    expect(once).not.toContain('TypeScript,');
  });
});
