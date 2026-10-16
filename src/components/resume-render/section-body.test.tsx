import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import { DEFAULT_PRESENTATION } from '@/lib/resume-presentation';
import { buildTheme } from '@/lib/resume-template-theme';
import { ResumeSectionBody } from './section-body';
import type { ResumeSectionItem } from '@/lib/resume-model';

const theme = buildTheme({ ...DEFAULT_PRESENTATION });

function renderEntry(item: ResumeSectionItem, key: string) {
  return createElement('div', { key, className: 'resume-entry' }, item.title);
}

function render(markdown: string): string {
  const parsed = parseResumeMarkdown(markdown);
  return renderToStaticMarkup(
    createElement(ResumeSectionBody, {
      section: parsed.sections[0],
      theme,
      renderEntry,
    }),
  );
}

describe('ResumeSectionBody', () => {
  it('renders a mixed section by component, not by kind', () => {
    const html = render([
      '## 工作经历',
      '一段说明。',
      '',
      '### 工程师 | 某公司',
      '*2022年3月 - 至今*',
      '- 做了什么',
      '',
      '- TypeScript',
      '- CI/CD',
    ].join('\n'));

    expect(html).toContain('一段说明');
    expect(html).toContain('工程师');
    expect(html).toContain('TypeScript');
    expect(html).toContain('CI/CD');
    expect(html).not.toContain('TypeScript,');
  });

  it('keeps consecutive entries as siblings so print spacing still applies', () => {
    const html = render([
      '## 工作经历',
      '### 甲 | 公司甲',
      '- 一事',
      '',
      '### 乙 | 公司乙',
      '- 二事',
    ].join('\n'));

    expect(html).toContain('甲');
    expect(html).toContain('乙');
    expect(html.match(/class="resume-entry"/g)?.length).toBe(2);
  });

  it('splits a comma skills line into chips even without a skills kind', () => {
    const html = render('## 随便叫什么\n- TypeScript, React, Go');
    expect(html).toContain('TypeScript');
    expect(html).toContain('React');
    expect(html).toContain('Go');
  });
});
