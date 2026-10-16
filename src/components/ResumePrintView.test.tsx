/**
 * The print view resolves the template's tokens (ticket 48, ADR-0008 §1).
 *
 * # The defect this file exists for
 *
 * `ResumePrintView` computed its styling as `presentationFromRecord(resume.presentation)` and stopped
 * there. That function fills **every** field, so its answer never consulted the template — and this
 * component is what `export-pdf` renders *and* what the editor's preview renders. The consequence,
 * measured in Chromium: a resume stored as `{template: 'verdant-banner'}` drew the banner in the
 * product's default stone brown in a serif face. Every template rendered as the same resume, which is
 * precisely the ADR-0008 failure ("每套模板都会渲染成同一种棕色") and the reason the ticket's first
 * criterion — 模板改变的应该是 UI 风格 — was not actually satisfied by choosing one.
 *
 * # Why these assertions are on markup
 *
 * The pure rule is already pinned in `resume-template.test.ts` (`resolveTemplate`, `presentationFor`,
 * `templateForPresentation`, field-level precedence, the unregistered-id fallback). What was missing was
 * the *wiring*: nothing in the app called any of it. So the assertions below go through the real
 * component with a stored column and a real template, and look for the token's own value in the output —
 * a test of the pure function cannot fail when the caller forgets to call it.
 *
 * `renderToStaticMarkup` rather than a mounted tree: the renderer is static by requirement (the export
 * path measures it after a fixed settle), and a happy-dom tree has no layout to give it.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumePrintView } from '@/components/ResumePrintView';
import { RESUME_TEMPLATES } from '@/components/resume-render';
import { DEFAULT_PRESENTATION, type ResumePresentation } from '@/lib/resume-presentation';
import { findTemplate, presentationFor } from '@/lib/resume-template';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

const MARKDOWN = `---
name: 李明
title: 全栈开发工程师
email: liming@example.com
phone: 138-0000-0000
---

## 关于我

5 年全栈开发经验。

## 工作经历

### 高级全栈工程师 | 某某科技

*2022年6月 - 至今*

- 主导前端架构升级

## 技能

TypeScript, React, Go
`;

const PARSED = parseResumeMarkdown(MARKDOWN) as unknown as ParsedResumeWithMetadata;

/** The product default accent — the colour a resume starts in until a swatch is picked. */
const DEFAULT_STONE = DEFAULT_PRESENTATION.accentColor;

/** Renders the real component for a stored presentation column. */
function print(stored: unknown, override?: ResumePresentation): string {
  return renderToStaticMarkup(
    createElement(ResumePrintView, {
      resume: { title: '我的简历', presentation: stored } as unknown as ResumeRecord,
      parsed: PARSED,
      ...(override ? { presentation: override } : {}),
    })
  );
}

describe('a stored template’s tokens reach the page (ticket 48)', () => {
  it('draws 绿野通栏’s banner in the product default until a colour is chosen', () => {
    const html = print({ ...DEFAULT_PRESENTATION, template: 'verdant-banner' });

    expect(html).toContain(`background:${DEFAULT_STONE}`);
  });

  it('applies the template’s line height, which is dead code without the merge', () => {
    // `classic-centred` differs from the defaults only in its line height and margin, so it is the case
    // where "the tokens were never applied" is invisible in a screenshot of the header and obvious here.
    const classic = print({ ...DEFAULT_PRESENTATION, template: 'classic-centred' });

    expect(classic).toContain('line-height:1.6');
    expect(print({ ...DEFAULT_PRESENTATION, template: 'ats-safe-single-column' })).not.toContain(
      'line-height:1.6'
    );
  });

  it('renders different templates as different documents', () => {
    // The single sentence the ADR-0008 defect is: before the fix these two were the same page with a
    // different name on it.
    const verdant = print({ ...DEFAULT_PRESENTATION, template: 'verdant-banner' });
    const atsSafe = print({ ...DEFAULT_PRESENTATION, template: 'ats-safe-single-column' });

    expect(verdant).not.toEqual(atsSafe);
  });

  it('lets a colour the user actually picked fill the banner', () => {
    const html = print({
      ...DEFAULT_PRESENTATION,
      template: 'verdant-banner',
      accentColor: '#557a46',
    });

    expect(html).toContain('background:#557a46');
    expect(html).not.toContain(`background:${DEFAULT_STONE}`);
  });

  it('resolves an unregistered stored template to the first registered one', () => {
    // Templates get removed (ADR-0008: template count is not a competitive dimension), and a resume
    // stored against one must still open — as the safest layout, with that layout's tokens.
    const removed = print({ ...DEFAULT_PRESENTATION, template: 'a-template-that-was-removed' });
    const first = RESUME_TEMPLATES[0]!;
    const fallback = print({ ...DEFAULT_PRESENTATION, template: first.id });

    expect(removed).toEqual(fallback);
  });

  it('resolves the caller’s override the same way, so the wizard’s preview matches the PDF', () => {
    // The creation wizard and the style panel both pass an unsaved presentation. If the override skipped
    // the merge, the preview would show a colour the saved resume would not keep.
    expect(print(null, { ...DEFAULT_PRESENTATION, template: 'verdant-banner' })).toContain(
      `background:${DEFAULT_STONE}`
    );
    // …and it stays correct when it is passed an already-resolved value, which is what the wizard does.
    const alreadyResolved = presentationFor(findTemplate('verdant-banner', RESUME_TEMPLATES)!, {
      ...DEFAULT_PRESENTATION,
      template: 'verdant-banner',
    });
    expect(print(null, alreadyResolved)).toContain(`background:${DEFAULT_STONE}`);
  });

  it('draws a photo the user explicitly enabled, even on the template that asks for none', () => {
    // The ATS-safe template does not *ask* for a photo — "no photo unless asked" is the safe default
    // ADR-0008 requires of it — but a default is not an override, and an explicit request has to be
    // honoured. This is the merge's user-facing half: without it, enabling a photo would silently do
    // nothing on the template most resumes start from.
    const html = print({
      ...DEFAULT_PRESENTATION,
      template: 'ats-safe-single-column',
      photo: { enabled: true, path: 'https://example.com/me.jpg' },
    });

    expect(html).toContain('https://example.com/me.jpg');
  });

  it('refuses the photo when the flag is off, even though a path is stored', () => {
    // Giving up on a photo must not require deleting it, so the flag is the only thing that decides.
    const html = print({
      ...DEFAULT_PRESENTATION,
      template: 'ats-safe-single-column',
      photo: { enabled: false, path: 'https://example.com/me.jpg' },
    });

    expect(html).not.toContain('https://example.com/me.jpg');
  });
});

describe('the photo is merged rather than replaced (ADR-0008 §1)', () => {
  const template = findTemplate('ats-safe-single-column', RESUME_TEMPLATES)!;

  it('keeps the user’s photo when the template says nothing about photos', () => {
    const resolved = presentationFor(template, {
      ...DEFAULT_PRESENTATION,
      photo: { enabled: true, path: 'https://example.com/me.jpg' },
    });

    expect(resolved.photo).toEqual({ enabled: true, path: 'https://example.com/me.jpg' });
  });

  it('lets a template supply the image without discarding that the user wants one', () => {
    // "The user turned the photo on" and "the template has an image of its own" are independent facts, so
    // a template that enables a photo with no path must inherit the resume's, not erase the choice.
    const wantsPhoto = presentationFor(
      { id: 'ats-safe-single-column', tokens: { photo: { enabled: true, path: 't.jpg' } } },
      { ...DEFAULT_PRESENTATION, photo: { enabled: true, path: null } }
    );

    expect(wantsPhoto.photo).toEqual({ enabled: true, path: 't.jpg' });
  });

  it('passes an enabled photo through on every registered template', () => {
    // Whether a template *draws* a photo is the template's own decision (a 证件照 slot is a facet
    // ADR-0008 rates), so that is not asserted here. What must hold for every template is that the
    // resolution never turns the flag off: a user who enabled a photo would otherwise lose it by
    // choosing a look, with the flag still reading `true` in the database.
    for (const entry of RESUME_TEMPLATES) {
      const resolved = presentationFor(entry, {
        ...DEFAULT_PRESENTATION,
        photo: { enabled: true, path: 'https://example.com/me.jpg' },
      });
      expect(resolved.photo.enabled, `${entry.id} dropped the photo flag`).toBe(true);
    }
  });

  it('honours an explicit "no photo" over a template that wants one', () => {
    // The flag exists so "do not put my photo on this version" is expressible at all; a template's
    // preference must not be able to override it. The path survives, deliberately — giving up on a photo
    // must not mean deleting it (`resolvePhoto` documents the same split).
    const refuses = presentationFor(
      { id: 'ats-safe-single-column', tokens: { photo: { enabled: true, path: 't.jpg' } } },
      { ...DEFAULT_PRESENTATION, photo: { enabled: false, path: 'https://example.com/me.jpg' } }
    );

    expect(refuses.photo.enabled).toBe(false);
    expect(refuses.photo.path).toBe('https://example.com/me.jpg');
  });
});
