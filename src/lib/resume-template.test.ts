/**
 * Template registry resolution tests (ticket 20, ADR-0008).
 *
 * The functions here decide which renderer draws a resume and what styling it gets. Both decisions
 * fail quietly when they are wrong — a wrong template renders a valid-looking resume, and a broken
 * token merge renders every template identically — so they are tested directly rather than only
 * through a rendered component.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PARSEABILITY_LABELS,
  PRESENTABLE_FIELD_LABELS,
  PRESENTABLE_FIELD_ORDER,
  TEMPLATE_FACETS,
  findTemplate,
  presentationFor,
  resolveTemplate,
  sameTokens,
  templateForPresentation,
  type ResumeTemplate,
} from '@/lib/resume-template';
import { DEFAULT_PRESENTATION, PRESENTATION_TEMPLATES } from '@/lib/resume-presentation';
import { RESUME_TEMPLATES } from '@/components/resume-render';
import { ResumePrintView } from '@/components/ResumePrintView';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

/** A minimal template, so these tests do not depend on the real renderers' tokens. */
function stub(overrides: Partial<ResumeTemplate> = {}): ResumeTemplate {
  return {
    id: 'ats-safe-single-column',
    name: 'stub',
    description: 'stub',
    facets: [],
    parseability: 'high',
    tokens: {},
    render: () => null as never,
    ...overrides,
  };
}

describe('resolveTemplate (ticket 20)', () => {
  it('applies the template\u2019s tokens when nothing is stored', () => {
    const resolved = resolveTemplate(
      stub({ tokens: { accentColor: '#8b9d77', pageMargin: '25mm', lineHeight: 2 } }),
      null
    );
    expect(resolved.accentColor).toBe('#8b9d77');
    expect(resolved.pageMargin).toBe('25mm');
    expect(resolved.lineHeight).toBe(2);
  });

  it('applies the template\u2019s tokens when the stored value carries no choices', () => {
    // The regression this whole mechanism exists for. `stored` must not win by being *complete* —
    // `presentationFromRecord` fills every field, so a field-by-field `stored.x ?? token.x` merge
    // never reaches the token and every template renders identically while the tokens sit in the
    // registry looking used.
    const resolved = resolveTemplate(
      stub({ tokens: { accentColor: '#8b9d77', pageMargin: '25mm' } }),
      {}
    );
    expect(resolved.accentColor).toBe('#8b9d77');
    expect(resolved.pageMargin).toBe('25mm');
    expect(resolved.accentColor).not.toBe(DEFAULT_PRESENTATION.accentColor);
  });

  it('treats a nullish stored value and an empty object identically', () => {
    // Both mean "nothing saved". A record that round-tripped through JSON can carry `{}` where the
    // column was NULL, and the two must not render differently.
    const template = stub({ tokens: { accentColor: '#8b9d77' } });
    expect(resolveTemplate(template, null)).toEqual(resolveTemplate(template, {}));
    expect(resolveTemplate(template, undefined)).toEqual(resolveTemplate(template, {}));
  });

  it('applies tokens to a stored value that is still entirely at the defaults', () => {
    // This is the payload the read route actually sends for a resume with nothing saved: a *complete*
    // presentation equal to `DEFAULT_PRESENTATION`. It must not block the template, or no template's
    // tokens would ever be reached in production while every test that checked the declaration
    // passed. See the module note on `resolveTemplate`.
    const resolved = resolveTemplate(
      stub({ tokens: { accentColor: '#8b9d77', pageMargin: '25mm' } }),
      { ...DEFAULT_PRESENTATION }
    );
    expect(resolved.accentColor).toBe('#8b9d77');
    expect(resolved.pageMargin).toBe('25mm');
  });

  it('lets a stored value that differs from the defaults win', () => {
    // The other half: a field the user actually changed is a decision, and a template must not
    // silently restyle it.
    const resolved = resolveTemplate(
      stub({ tokens: { accentColor: '#8b9d77', pageMargin: '25mm' } }),
      { ...DEFAULT_PRESENTATION, accentColor: '#557a46', pageMargin: '40mm' }
    );
    expect(resolved.accentColor).toBe('#557a46');
    expect(resolved.pageMargin).toBe('40mm');
  });

  it('resolves per field rather than all-or-nothing', () => {
    // A shallow `stored || tokens` gets this wrong in one direction: it would ignore the token for
    // every field the stored value does not mention. Precedence is per field or it is not precedence.
    const resolved = resolveTemplate(
      stub({ tokens: { accentColor: '#8b9d77', lineHeight: 2 } }),
      { accentColor: '#557a46' }
    );
    expect(resolved.accentColor).toBe('#557a46');
    expect(resolved.lineHeight).toBe(2);
  });

  it('repairs an out-of-range stored field with the template\u2019s value', () => {
    // A corrupt column must degrade to a known-good value, not to a broken page: a 900mm margin would
    // push every block off the paper. `presentationFromRecord` applies the same bounds the server does.
    const resolved = resolveTemplate(stub({ tokens: { pageMargin: '25mm' } }), { pageMargin: '900mm' });
    expect(resolved.pageMargin).toBe('25mm');
  });

  it('always stamps the rendering template\u2019s own id', () => {
    // A stored id naming a removed template must not be able to outvote the registry, or the resume
    // would keep claiming a template nothing can draw.
    const resolved = resolveTemplate(stub(), { ...DEFAULT_PRESENTATION, template: 'classic-centred' });
    expect(resolved.template).toBe('ats-safe-single-column');
  });

  it('keeps sectionOrder from the user even when a template has opinions', () => {
    // `PresentableFields` excludes `sectionOrder` on purpose: reordering a candidate's sections is an
    // editorial act about their content, not a styling decision, and a template able to do it could
    // lose a section off the end of the list.
    const order = ['技能', '工作经历'];
    const resolved = resolveTemplate(stub(), { ...DEFAULT_PRESENTATION, sectionOrder: order });
    expect(resolved.sectionOrder).toEqual(order);
  });

  it('does not mutate the stored value', () => {
    const stored = { ...DEFAULT_PRESENTATION };
    resolveTemplate(stub({ tokens: { accentColor: '#8b9d77' } }), stored);
    expect(stored.accentColor).toBe(DEFAULT_PRESENTATION.accentColor);
  });

  it('produces a valid presentation for every registered template', () => {
    for (const template of RESUME_TEMPLATES) {
      const resolved = resolveTemplate(template, null);
      expect(resolved.template).toBe(template.id);
      expect(PRESENTATION_TEMPLATES).toContain(resolved.template);
      // A template token outside the server's bounds would make every save fail validation.
      expect(resolved.fontScale).toBeGreaterThan(0);
      expect(resolved.lineHeight).toBeGreaterThan(0);
    }
  });
});

describe('presentationFor (ticket 20)', () => {
  it('delegates to the template when there is one', () => {
    expect(presentationFor(stub({ tokens: { accentColor: '#8b9d77' } }), null).accentColor).toBe(
      '#8b9d77'
    );
  });

  it('returns the plain default when there is no template', () => {
    // Used where a template list came from an API and may not have loaded yet. The result must still
    // be renderable, which is what this checks.
    expect(presentationFor(undefined, null)).toEqual(DEFAULT_PRESENTATION);
  });
});

describe('templateForPresentation (ticket 20)', () => {
  const templates = RESUME_TEMPLATES;

  it('finds the named template', () => {
    const target = templates[1]!;
    const stored = { ...DEFAULT_PRESENTATION, template: target.id };
    expect(templateForPresentation(stored, templates).id).toBe(target.id);
  });

  it('falls back to the first entry for an unregistered id', () => {
    // Templates will be removed: ADR-0008 is explicit that template count is not a competitive
    // dimension. A resume stored against a removed one must still open, and it must open as the
    // *safest* layout rather than an arbitrary one.
    const stored = { ...DEFAULT_PRESENTATION, template: 'a-template-that-was-removed' as never };
    expect(templateForPresentation(stored, templates).id).toBe('ats-safe-single-column');
  });

  it('throws on an empty registry rather than rendering nothing', () => {
    // There is no presentation that renders without a renderer, so this is a programming error and
    // must not be papered over: "forgot to register the ATS-safe template" should surface in
    // development, not as a blank page in front of a user.
    expect(() => templateForPresentation(DEFAULT_PRESENTATION, [])).toThrow(/模板注册表为空/);
  });
});

describe('findTemplate (ticket 20)', () => {
  it('finds by id', () => {
    expect(findTemplate('classic-centred', RESUME_TEMPLATES)?.id).toBe('classic-centred');
  });

  it('returns undefined rather than throwing on a miss', () => {
    expect(findTemplate('nope', RESUME_TEMPLATES)).toBeUndefined();
  });
});

describe('the template vocabulary (ticket 20)', () => {
  it('labels every parseability level', () => {
    // ADR-0008 requires the label to be shown wherever a template is chosen. A missing label would
    // render as `解析友好度 undefined`.
    expect(Object.keys(PARSEABILITY_LABELS).sort()).toEqual(['high', 'low', 'medium']);
    for (const label of Object.values(PARSEABILITY_LABELS)) {
      expect(label).toMatch(/[高中低]/);
    }
  });

  it('lists facets without duplicates', () => {
    const keys = TEMPLATE_FACETS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every presentable field in both the order and the labels', () => {
    // Both are typed as total records/lists over `PresentableFields`, so adding a field to the type
    // fails the build if it is forgotten here. This asserts they agree with each other too.
    const ordered = [...PRESENTABLE_FIELD_ORDER].sort();
    const labelled = Object.keys(PRESENTABLE_FIELD_LABELS).sort();
    expect(ordered).toEqual(labelled);
  });

  it('does not let a template declare sectionOrder', () => {
    // Enforced by the `PresentableFields` type; asserted here because a `Partial<ResumePresentation>`
    // would silently allow it and the consequence — a template hiding a section — is severe.
    expect(PRESENTABLE_FIELD_ORDER).not.toContain('sectionOrder' as never);
   expect(PRESENTABLE_FIELD_ORDER).not.toContain('schemaVersion' as never);
  });
});

describe('the registered templates (ticket 48)', () => {
  it('keeps the ATS-safe template first and appends 绿野通栏 last', () => {
    // Position is load-bearing at both ends. First is the fallback for a stored id that is no longer
    // registered (ADR-0008: safe first), and the closed set's order is the server's order — so a new
    // template appended in one place and inserted in the other is a mismatch nothing else notices.
    expect(RESUME_TEMPLATES[0]?.id).toBe('ats-safe-single-column');
    expect(RESUME_TEMPLATES[RESUME_TEMPLATES.length - 1]?.id).toBe('verdant-banner');
    expect(RESUME_TEMPLATES.map((template) => template.id)).toEqual([...PRESENTATION_TEMPLATES]);
  });

  it('gives 绿野通栏 a sans face, and the product default accent', () => {
    // Layout tokens still distinguish the template. Accent is the wizard's, so a resume that has
    // never picked a colour renders in 石棕 — including this one, which used to ship sage.
    const verdant = findTemplate('verdant-banner', RESUME_TEMPLATES);
    expect(verdant).toBeDefined();

    const resolved = resolveTemplate(verdant!, null);
    expect(resolved.accentColor).toBe(DEFAULT_PRESENTATION.accentColor);
    expect(resolved.fontFamily).toBe('sans');
    expect(resolved.template).toBe('verdant-banner');
  });

  it('lets a stored accent that differs from the default stay on 绿野通栏', () => {
    const verdant = findTemplate('verdant-banner', RESUME_TEMPLATES)!;
    const resolved = resolveTemplate(verdant, {
      ...DEFAULT_PRESENTATION,
      accentColor: '#a64b45',
    });
    expect(resolved.accentColor).toBe('#a64b45');
  });

  it('rates 绿野通栏 中, the same rating its own written criteria describe', () => {
    // ADR-0008 requires the rating to come from the table. 高 would be wrong — the header is a
    // coloured panel and the headings are decorated — and 低 would claim the contacts are inside a
    // graphic, which they are not: they are DOM text with their labels intact.
    const verdant = findTemplate('verdant-banner', RESUME_TEMPLATES)!;
    expect(verdant.parseability).toBe('medium');
    expect(verdant.facets).toContain('single-column');
  });
});

/**
 * The tokens reaching a page through the **real** print path, not through `resolveTemplate` directly.
 *
 * # Why this case exists
 *
 * Everything above tests the merge as a function. That is not the same claim as "a resume that picked
 * a template looks like that template", and the difference is the ADR-0008 defect exactly
 * (「模板看起来不同，实际相同」): the merge can be correct while no call site calls it. It was, briefly —
 * `ResumePrintView` computed `presentationFromRecord(resume.presentation)` and stopped, so the sage and
 * the sans face below were dead on the editor preview and on the PDF export, and `classic-centred`'s
 * `lineHeight`/`pageMargin` tokens were dead the same way. The gallery thumbnail *did* resolve them,
 * which is why nothing in the UI looked wrong.
 *
 * This case was written as `it.fails` while that was true (`AGENTS.md` §「记录已知缺陷」: a confirmed
 * defect gets a reproducible failing case, and the case turns red when someone fixes it — which is the
 * reminder to convert it). It then did exactly that: the preview workstream wired `presentationFor`
 * into `ResumePrintView`, the body started passing, and the marker became this ordinary `it`.
 *
 * Keeping it here rather than only in the renderer tests is the point: it is the one case that fails
 * if the call site ever regresses to the bare `presentationFromRecord`.
 */
describe('the render path resolves a template’s tokens (ticket 48)', () => {
  const MARKDOWN = `---
name: 李静
title: 全栈开发工程师
---

## 工作经历

### 高级全栈工程师 | 某某科技

*2022年6月 - 至今*

- 主导前端架构升级
`;

  /** `ResumePrintView` with a record that names a template and has chosen nothing else. */
  function printViewHtml(template: string): string {
    return renderToStaticMarkup(
      createElement(ResumePrintView, {
        resume: {
          title: '我的简历',
          presentation: { schemaVersion: 1, template },
        } as unknown as ResumeRecord,
        parsed: parseResumeMarkdown(MARKDOWN) as unknown as ParsedResumeWithMetadata,
      })
    );
  }

  it('paints 绿野通栏’s banner in the product default, from a record that only names the template', () => {
    const html = printViewHtml('verdant-banner');

    // No accent token on this template: the banner still exists, but it is filled with 石棕 until
    // the user picks another swatch. The sans face below is what still proves the merge ran.
    expect(html).toContain(DEFAULT_PRESENTATION.accentColor);
  });

  it('gives 绿野通栏 its sans face and 经典居中 its serif one, on the same path', () => {
    // Font family is the second half of the same claim, and it is the half a *failing* merge cannot
    // fake: both templates would otherwise come out in the default serif stack.
    expect(printViewHtml('verdant-banner')).toContain(
      'ui-sans-serif, system-ui, -apple-system, &quot;Segoe UI&quot;, &quot;PingFang SC&quot;, &quot;Microsoft YaHei&quot;, sans-serif'
    );
    expect(printViewHtml('classic-centred')).toContain('&quot;Noto Serif SC&quot;, Georgia');
  });
});

describe('sameTokens (ticket 20)', () => {
  it('treats two empty token sets as equal', () => {
    expect(sameTokens({}, {})).toBe(true);
  });

  it('compares photo by value, not by reference', () => {
    // `photo` is the one member that is an object, and a style panel diffing a template's tokens
    // against the user's choices would otherwise always see a change.
    const a = { photo: { enabled: true, path: 'https://x/y.jpg' } };
    const b = { photo: { enabled: true, path: 'https://x/y.jpg' } };
    expect(a.photo).not.toBe(b.photo);
    expect(sameTokens(a, b)).toBe(true);
  });

  it('detects a difference inside photo', () => {
    expect(sameTokens({ photo: { enabled: true, path: 'a' } }, { photo: { enabled: true, path: 'b' } })).toBe(
      false
    );
    expect(sameTokens({ photo: { enabled: true, path: null } }, { photo: { enabled: false, path: null } })).toBe(
      false
    );
  });

  it('detects a difference in a scalar', () => {
    expect(sameTokens({ lineHeight: 1.5 }, { lineHeight: 1.6 })).toBe(false);
  });

  it('does not confuse an absent photo with a disabled one', () => {
    // `undefined` means "this template says nothing about the photo"; `{enabled:false}` means "this
    // template turns it off". Treating them as equal would make a template unable to opt out.
    expect(sameTokens({ photo: { enabled: false, path: null } }, {})).toBe(false);
  });
});
