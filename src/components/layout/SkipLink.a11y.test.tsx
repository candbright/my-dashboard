/**
 * Skip-to-content, a single document `<main>`, and Chinese 404 — chrome
 * consistency that used to be missing.
 *
 * # Why these live together
 *
 * A skip link that points at `#main-content` is useless if the target is missing,
 * duplicated, or nested inside another `<main>`. The 404 page is the other
 * user-facing chrome surface that used to fall outside the design system
 * (Next.js's English overlay). Pinning them in one file keeps the contract in
 * one place: keyboard users can skip the navbar, land on one landmark, and a
 * missing route still speaks Chinese in the same serif title as every other page.
 *
 * Assertions read source rather than rendered markup where a `'use client'`
 * boundary would otherwise force happy-dom. The skip link itself is a server
 * component, so that one is rendered.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkipLink } from '@/components/layout/SkipLink';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('跳过导航与单一 main 地标', () => {
  it('SkipLink is the first focusable control and points at #main-content', () => {
    const html = renderToStaticMarkup(createElement(SkipLink));

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('跳到主要内容');
    // Off-screen until focused: a permanently visible skip link is chrome noise,
    // a permanently hidden one is unreachable. Both halves of the pair are required.
    expect(html).toContain('-translate-y-full');
    expect(html).toContain('focus:translate-y-4');
  });

  it('root layout mounts SkipLink and a single main#main-content', () => {
    const src = read('src/app/layout.tsx');

    expect(src).toContain('SkipLink');
    expect(src).toMatch(/<main[^>]*id="main-content"/);
    expect(src).toMatch(/<main[^>]*tabIndex=\{-1\}/);
    // tabIndex={-1} is what lets the fragment identifier actually move keyboard
    // focus. Without it, some browsers scroll the landmark into view but leave
    // focus on the skip link, so the next Tab goes back to the navbar.
  });

  it('admin and settings layouts do not nest a second <main>', () => {
    // Nested landmarks make "skip to main" and a screen-reader's main shortcut
    // disagree about where content starts. These two used to wrap their column
    // in <main> while the root layout already had one.
    //
    // JSX comments are stripped first: the files explain *why* they are not a
    // `<main>`, and that prose would otherwise match the same pattern.
    for (const rel of ['src/app/admin/layout.tsx', 'src/app/settings/layout.tsx']) {
      const src = read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      expect(src, rel).not.toMatch(/<main[\s>/]/);
    }
  });
});

describe('规范内的标题与数字一致性', () => {
  it('chrome page titles that are not PageContainer still set font-serif', () => {
    // PageContainer already carries font-serif. These pages roll their own h1
    // and used to inherit the body sans, so the login/settings/admin titles
    // looked like a different product from 「公共简历」.
    const files = [
      'src/app/login/page.tsx',
      'src/app/register/page.tsx',
      'src/app/settings/page.tsx',
      'src/app/settings/ai/page.tsx',
      'src/app/admin/users/page.tsx',
      'src/app/admin/approvals/page.tsx',
      'src/app/admin/ai/page.tsx',
      'src/components/ResumeSourceView.tsx',
      'src/components/ResumeEditor.tsx',
    ];
    for (const rel of files) {
      const src = read(rel);
      const headings = src.match(/<h1 className="[^"]*"/g) ?? [];
      expect(headings.length, `${rel} should have at least one h1`).toBeGreaterThan(0);
      for (const tag of headings) {
        expect(tag, `${rel}: ${tag}`).toContain('font-serif');
      }
    }
  });

  it('body uses tabular figures so dates and counts do not shift', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('font-variant-numeric: tabular-nums');
  });
});

describe('中文 404', () => {
  it('replaces Next.js English overlay with a Chinese page in PageContainer', () => {
    const src = read('src/app/not-found.tsx');

    expect(src).toContain('页面不存在');
    expect(src).toContain('PageContainer');
    expect(src).toContain('回到首页');
    expect(src).not.toContain('Not Found');
    expect(src).not.toContain("This page could not be found");
  });
});
