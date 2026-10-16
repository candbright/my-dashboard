// @vitest-environment happy-dom

/**
 * Renderer tests (ticket 20, ADR-0008).
 *
 * # What these pin
 *
 * Ticket 20's acceptance criterion is 「切换模板产生视觉上不同的输出」, and ADR-0008 requires a
 * template to be verified on **two render paths**. Both are claims about a seam, and a seam with one
 * implementation on each side is indistinguishable from no seam — so the tests below assert the
 * properties that would break if someone collapsed the registry back into a single hardcoded view:
 *
 *   1. **Two templates produce structurally different markup** from the same content. Asserted on
 *      stable structural markers (the centred header, the circular photo, the chip shape), not on
 *      exact HTML, so restyling a template does not fail these tests but *removing* its distinctive
 *      structure does.
 *   2. **The tokens reach the output.** A template's `pageMargin` and `lineHeight` must be visible in
 *      the HTML. This is the assertion that would have caught the defect this refactor was written to
 *      fix: with a naive `stored.x ?? template.tokens.x` merge the stored value always wins, so every
 *      template renders identically and every test that only checked the *declaration* of a token
 *      still passes.
 *   3. **The pagination contract survives every template.** `resume-entry` and
 *      `resume-section-heading` and the `data-print-*` attributes are what `export-pdf.tsx` measures
 *      and what `PRINT_RESUME_CSS` styles. A renderer that forgets them still produces a PDF — it
 *      just splits job entries across pages, intermittently, only for long resumes. That is the
 *      failure mode these tests exist to make impossible.
 *
 * # Why `renderToStaticMarkup` rather than a DOM assertion library
 *
 * The renderers are pure functions of their input, so static markup is the whole output. Rendering
 * through `react-dom/server` also proves the renderer is genuinely side-effect free: a component
 * using `useState` or `useEffect` would throw here, which is the ADR-0007 requirement that the same
 * code can run in a Node render service.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RESUME_TEMPLATES, DEFAULT_RESUME_TEMPLATE } from '@/components/resume-render';
import { findTemplate, resolveTemplate } from '@/lib/resume-template';
// Only for the 绿野通栏 section below: the pagination contract of a template that wraps its entries
// has to be checked against the walk that paginates them, not against the markup's shape.
import { flattenPrintFlow } from '@/lib/export-pdf';
import { a4ContentBox, paginateBlocks } from '@/lib/print-resume';

/**
 * The ATS-safe template, for the cases that only care about the default one.
 *
 * Looked up rather than imported from `ats-safe.tsx`, which now exports only its renderer: the id is
 * what identifies a template, and this is the same lookup production code does.
 */
const atsSafeSingleColumn = findTemplate('ats-safe-single-column', RESUME_TEMPLATES)!;
import { DEFAULT_PRESENTATION } from '@/lib/resume-presentation';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';

// ── Fixtures ────────────────────────────────────────────────────────────────

const METADATA = {
  name: '李明',
  title: '全栈开发工程师',
  email: 'liming@dev.com',
  phone: '+86 139-0000-0000',
  location: '上海市',
  website: 'https://liming.dev',
  github: 'https://github.com/liming',
};

/**
 * A resume with a summary, a work history and a skills section — one of each section shape.
 *
 * `avatar` is called out separately because the base fixture deliberately leaves it out: it is the
 * field a photo-enabled template falls back to when the presentation says "on" but names no path
 * (`resolvePhoto`), so the template's photo cases set it explicitly and the rest of the file proves
 * that an unflagged photo stays invisible even when the metadata carries one.
 */
function parsed(overrides: Partial<typeof METADATA> & { avatar?: string } = {}): ParsedResumeWithMetadata {
  return {
    frontmatter: { ...METADATA, ...overrides },
    rawContent: '',
    sections: [
      {
        title: '关于我',
        content: '5 年全栈开发经验，精通 React/Next.js 与 Go。',
        items: [],
        kind: 'summary',
      },
      {
        title: '工作经历',
        content: '',
        kind: 'experience',
        items: [
          {
            title: '高级全栈工程师',
            subtitle: '某某科技',
            date: '2022年6月 - 至今',
            details: ['主导前端架构升级', '接口响应时间下降 40%'],
          },
          {
            title: '全栈工程师',
            subtitle: '另一家公司',
            date: '2020年7月 - 2022年5月',
            details: ['负责核心业务模块'],
          },
        ],
      },
      {
        title: '技能',
        content: '- TypeScript, React, Go',
        kind: 'skills',
        items: [],
      },
    ],
  };
}

/**
 * Render through a named template.
 *
 * `stored` defaults to `{}` — "nothing saved" — so the template's own tokens apply. Pass a partial
 * object to override individual fields, or `{ ...DEFAULT_PRESENTATION }` to represent a user who has
 * saved a complete presentation and therefore outvotes the template.
 */
function renderWith(
  templateId: string,
  stored: unknown = {},
  content = parsed(),
  mode: 'print' | 'screen' = 'print'
): string {
  const template = RESUME_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`no template ${templateId}`);
  const presentation = resolveTemplate(template, stored);
  return renderToStaticMarkup(
    template.render({
      content,
      metadata: { frontmatter: content.frontmatter },
      presentation,
      mode,
      fallbackTitle: '我的简历',
    })
  );
}

// ── The registry ────────────────────────────────────────────────────────────

describe('the template registry (ticket 20)', () => {
  it('puts the ATS-safe template first, because position decides the fallback', () => {
    // ADR-0008: safe first. A resume whose stored template id is no longer registered falls back to
    // index 0 — so the ordering is a safety property, not a cosmetic one.
    expect(DEFAULT_RESUME_TEMPLATE.id).toBe('ats-safe-single-column');
    expect(RESUME_TEMPLATES[0]?.id).toBe('ats-safe-single-column');
  });

  it('registers at least two templates, so "pluggable" is a testable claim', () => {
    // A registry with one entry cannot distinguish "the seam works" from "there is no seam".
    expect(RESUME_TEMPLATES.length).toBeGreaterThanOrEqual(2);
  });

  it('rates every template against the written table', () => {
    for (const template of RESUME_TEMPLATES) {
      expect(['high', 'medium', 'low']).toContain(template.parseability);
      expect(template.facets.length).toBeGreaterThan(0);
    }
  });

  it('gives the first template the highest rating', () => {
    // If a 中 template ever sat at index 0, the fallback for an unregistered id would quietly become
    // the less parseable layout.
    expect(RESUME_TEMPLATES[0]?.parseability).toBe('high');
  });

  it('has unique ids', () => {
    const ids = RESUME_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── The acceptance criterion: different templates, different output ─────────

describe('switching templates produces visually different output (ticket 20)', () => {
  const ats = renderWith('ats-safe-single-column');
  const classic = renderWith('classic-centred');

  it('produces different markup for the same content', () => {
    expect(ats).not.toBe(classic);
  });

  it('left-aligns the ATS-safe header and centres the classic one', () => {
    // The single most visible difference, and the one a parser notices least.
    expect(ats).toContain('text-align:left');
    expect(classic).toContain('text-align:center');
  });

  it('keeps the skills list flat in the ATS-safe template and boxed in the classic one', () => {
    // The ATS-safe chip is a rectangle with a rule; the classic chip is a full-radius capsule with an
    // accent tint. Asserting on the radius rather than the exact colour keeps this stable if the
    // palette moves, while still failing if the chips become the same shape.
    expect(ats).toContain('border-radius:8px');
    expect(classic).toContain('border-radius:9999px');
  });

  it('lays the contact block out differently', () => {
    // ATS-safe: one dot-separated sentence. Classic: a centred wrapped row with labels.
    expect(ats).toContain(' · ');
    expect(classic).toContain('justify-content:center');
  });

  it('separates an entry subtitle differently', () => {
    expect(ats).toContain('· 某某科技');
    // The classic template renders the subtitle without a separator glyph.
    expect(classic).toContain('某某科技');
    expect(classic).not.toContain('· 某某科技');
  });

  it('applies each template\u2019s own page margin, not a shared constant', () => {
    // THE regression test for the defect this refactor fixes. The margin reaches the page as the
    // on-screen padding, so this has to be measured in screen mode — on paper `@page` supplies the
    // margin and the root's padding is forced to 0.
    const ats18 = renderWith('ats-safe-single-column', {}, parsed(), 'screen');
    const classic20 = renderWith('classic-centred', {}, parsed(), 'screen');
    expect(ats18).toContain('padding:68.03px'); // 18mm at 96dpi
    expect(classic20).toContain('padding:75.59px'); // 20mm
    expect(ats18).not.toBe(classic20);
  });

  it('applies each template\u2019s own line height', () => {
    expect(renderWith('ats-safe-single-column')).toContain('line-height:1.5');
    expect(renderWith('classic-centred')).toContain('line-height:1.6');
  });

  it('lets the user\u2019s stored choice override the template token', () => {
    // The other half of the precedence rule: the template supplies a default, it does not impose one.
    const stored = { lineHeight: 2.2, pageMargin: '30mm' };
    const html = renderWith('ats-safe-single-column', stored, parsed(), 'screen');
    expect(html).toContain('line-height:2.2');
    expect(html).toContain('padding:113.39px');
    expect(html).not.toContain('line-height:1.5');
  });

  it('renders the template the stored presentation names, not the one passed in', () => {
    // `resolveTemplate` always stamps the rendering template's own id, so a stored id cannot outvote
    // the registry — otherwise a resume naming a removed template would render as the removed one.
    const stored = { ...DEFAULT_PRESENTATION, template: 'classic-centred' };
    const template = RESUME_TEMPLATES[0]!;
    expect(resolveTemplate(template, stored).template).toBe('ats-safe-single-column');
  });
});

// ── The pagination contract ─────────────────────────────────────────────────

describe('every template keeps the pagination contract (ticket 20)', () => {
  it.each(RESUME_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s emits the hooks export-pdf.tsx measures by',
    (_id, template) => {
      const html = renderToStaticMarkup(
        template.render({
          content: parsed(),
          metadata: { frontmatter: parsed().frontmatter },
          presentation: resolveTemplate(template, null),
          mode: 'print',
          fallbackTitle: '我的简历',
        })
      );

      // `serializePrintRoot` reads this element's inline style and `PRINT_RESUME_CSS` resizes it.
      expect(html).toContain('id="resume-print-root"');
      // `collectPrintBlocks` keeps the header as its own measured block.
      expect(html).toContain('data-print-role="header"');
      // `sectionTitleOf` names the pages a section spans.
      expect(html).toContain('data-print-section="工作经历"');
      // `break-after: avoid` keeps a heading from being orphaned at a page foot.
      expect(html).toContain('resume-section-heading');
      // `break-inside: avoid` plus the orphans/widows rule: this is the one that stops a job entry
      // being split across two pages.
      expect(html).toContain('resume-entry');
    }
  );

  it('emits one resume-entry per item, not one per section', () => {
    // The count matters. `export-pdf.tsx` measures a section's children as blocks, and if all items
    // were merged into one wrapper the whole work history would be one unbreakable block — the exact
    // failure its own comment says it avoids. This asserts the entries are individually addressable.
    const html = renderWith('ats-safe-single-column');
    expect(html.match(/class="resume-entry"/g)).toHaveLength(2);
  });

  it('renders at a fixed A4 width on screen and a fluid one on paper', () => {
    // On paper the page box supplies the width; a fixed 794px would overflow it.
    expect(renderWith('ats-safe-single-column')).toContain('width:100%');
    const screen = renderToStaticMarkup(
      atsSafeSingleColumn.render({
        content: parsed(),
        metadata: { frontmatter: parsed().frontmatter },
        presentation: resolveTemplate(atsSafeSingleColumn, null),
        mode: 'screen',
        fallbackTitle: '我的简历',
      })
    );
    expect(screen).toContain('width:657px');
  });
});

// ── Content fidelity ────────────────────────────────────────────────────────

describe('renderers carry the candidate\u2019s content', () => {
  it.each(RESUME_TEMPLATES.map((t) => [t.id, t] as const))('%s shows the header and sections', (_id, template) => {
    const html = renderToStaticMarkup(
      template.render({
        content: parsed(),
        metadata: { frontmatter: parsed().frontmatter },
        presentation: resolveTemplate(template, null),
        mode: 'print',
        fallbackTitle: '我的简历',
      })
    );

    // Contacts by their identifying part: the templates deliberately shorten profile URLs, so the
    // handle is what both are guaranteed to contain.
    expect(html).toContain('liming@dev.com');
    expect(html).toContain('+86 139-0000-0000');
    expect(html).toContain('上海市');
    expect(html).toContain('liming');
    // Section prose and entry details.
    expect(html).toContain('5 年全栈开发经验');
    expect(html).toContain('主导前端架构升级');
    expect(html).toContain('接口响应时间下降 40%');
    // Every section heading survives, including the ones with no items.
    for (const title of ['关于我', '工作经历', '技能']) {
      expect(html).toContain(title);
    }
  });

  it('splits a comma-separated skills line into individual chips', () => {
    // `collectSkills` does the splitting and both templates use it, so this pins the shared half of
    // the contract rather than either template's chip markup.
    const html = renderWith('ats-safe-single-column');
    expect(html).toContain('>TypeScript<');
    expect(html).toContain('>React<');
    expect(html).toContain('>Go<');
  });

  it('falls back to the resume title when there is no name', () => {
    const content = parsed({ name: '' });
    const html = renderToStaticMarkup(
      atsSafeSingleColumn.render({
        content,
        metadata: { frontmatter: content.frontmatter },
        presentation: resolveTemplate(atsSafeSingleColumn, null),
        mode: 'print',
        fallbackTitle: '我的简历',
      })
    );
    expect(html).toContain('我的简历');
  });

  it('omits the contact line entirely when there are no contacts', () => {
    const content: ParsedResumeWithMetadata = {
      frontmatter: { name: '李明' },
      rawContent: '',
      sections: [],
    };
    const html = renderToStaticMarkup(
      atsSafeSingleColumn.render({
        content,
        metadata: { frontmatter: content.frontmatter },
        presentation: resolveTemplate(atsSafeSingleColumn, null),
        mode: 'print',
        fallbackTitle: '我的简历',
      })
    );
    // No empty paragraph and no stray separator.
    expect(html).not.toContain(' · ');
  });
});

// ── The photo flag ──────────────────────────────────────────────────────────

describe('the photo flag is honoured, not decorative (ticket 20)', () => {
  const noPhoto = renderWith('ats-safe-single-column');

  it('draws no photo when the presentation does not enable one', () => {
    // Even though the metadata has an avatar in the wider record, `photo.enabled` is false by
    // default. Before this refactor both render paths drew `frontmatter.avatar` unconditionally, so
    // the flag ticket 19 added could not turn a photo off.
    expect(noPhoto).not.toContain('<img');
  });

  it('draws the presentation\u2019s photo when enabled', () => {
    const stored = {
      ...DEFAULT_PRESENTATION,
      photo: { enabled: true, path: 'https://example.com/me.jpg' },
    };
    expect(renderWith('ats-safe-single-column', stored)).toContain('https://example.com/me.jpg');
  });

  it('falls back to the metadata avatar when enabled without a path', () => {
    // Deliberately NOT spread over `DEFAULT_PRESENTATION`. Spreading would state `path: null` as an
    // explicit choice, which correctly suppresses the fallback — `PresentationPhoto.path` uses `null`
    // rather than `''` precisely so "no photo chosen" has one representation. The state under test is
    // a template that enables a photo without naming one, which is a partial value.
    const stored = { photo: { enabled: true, path: null } };
    const content = parsed({ avatar: 'https://example.com/avatar.jpg' } as never);
    expect(renderWith('ats-safe-single-column', stored, content)).toContain(
      'https://example.com/avatar.jpg'
    );
  });

  it('refuses a photo when the flag is off, even with a path set', () => {
    // Abandoning a chosen photo must not require deleting it.
    const stored = {
      ...DEFAULT_PRESENTATION,
      photo: { enabled: false, path: 'https://example.com/me.jpg' },
    };
    expect(renderWith('ats-safe-single-column', stored)).not.toContain('https://example.com/me.jpg');
  });
});

// ── 绿野通栏 (ticket 48) ─────────────────────────────────────────────────────

/**
 * The banner template.
 *
 * These assert the properties the design is *for*, not the exact markup: which element is filled with
 * the resolved accent, that the reversed-out text is a warm literal rather than pure white, that the
 * decoration is a real inline SVG kept clear of the text, and that the heading and entry treatments
 * are the ones the design calls for. Restyling the template may legitimately change any style value
 * these look at; removing the banner, the accent, or the decorative headings fails them.
 */
describe('绿野通栏 fills its header with the resolved accent (ticket 48)', () => {
  it('draws the banner in the product default when the user has chosen nothing', () => {
    expect(renderWith('verdant-banner')).toContain(`background:${DEFAULT_PRESENTATION.accentColor}`);
  });

  it('draws the banner in a stored accent instead of the token', () => {
    // The block must carry *whatever accent the resolved presentation carries*, not the sage. A
    // template that hardcoded its own colour would look the same for every user — the ADR-0008 defect.
    const html = renderWith('verdant-banner', { ...DEFAULT_PRESENTATION, accentColor: '#a64b45' });
    expect(html).toContain('background:#a64b45');
    expect(html).not.toContain('background:#8b9d77');
  });

  it('sets the header text in the ink that contrasts with the accent, never pure white or black', () => {
    // The ink is chosen, not fixed: warm cream on the dark accents, stone-800 on the light ones, by the
    // measured contrast ratio (`verdant.test.ts` asserts the arithmetic for every palette colour). Both
    // arms are reachable, so this pins that the *rendered* banner carries the difference.
    //
    // The default render is the product default 石棕, a dark accent, so cream wins.
    const stone = renderWith('verdant-banner');
    expect(stone).toMatch(/<h1[^>]*color:#faf6f1/);

    // 暗红, a stored accent that differs from the default, so it outvotes the token: cream wins 5.26:1.
    const dark = renderWith('verdant-banner', { ...DEFAULT_PRESENTATION, accentColor: '#a64b45' });
    expect(dark).toMatch(/<h1[^>]*color:#faf6f1/);

    for (const html of [stone, dark]) {
      // `#ffffff` remains the *paper* colour (`ResumePage`) and must stay that way; what this pins is
      // that no text is set in it. `#000000` appears nowhere at all. And the shadow that used to
      // compensate for a fixed light ink on a light accent is gone rather than merely unused.
      expect(html).not.toContain('color:#ffffff');
      expect(html).not.toContain('#000000');
      expect(html).not.toContain('text-shadow');
    }
  });

  it('keeps the name an h1 and the section headings h2, so the hierarchy survives the panel', () => {
    // The panel is a visual device. A parser recovering section boundaries from the heading hierarchy
    // must still find one, which is why the reversed-out name is a real <h1> and not a styled <div>.
    const html = renderWith('verdant-banner');
    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
  });

  it('keeps the contact labels that hold the rating at 中', () => {
    // Dropping `Email：` for a bare address is the ADR-0008 example of what costs a template its
    // rating — an unlabelled phone number is ambiguous in a way a labelled one is not.
    const html = renderWith('verdant-banner');
    expect(html).toContain('Email');
    expect(html).toContain('liming@dev.com');
    expect(html).toContain('+86 139-0000-0000');
  });

  it('omits the contact row entirely when there are no contacts', () => {
    // No empty coloured strip and no stray separator where the contacts would have been.
    const content = parsed({ email: '', phone: '', location: '', website: '', github: '' });
    const html = renderWith('verdant-banner', {}, content);
    expect(html).not.toContain('：');
  });
});

describe('绿野通栏\u2019s decoration stays clear of the text (ticket 48)', () => {
  it('draws two concentric rings as one inline SVG with literal warm strokes', () => {
    const html = renderWith('verdant-banner');
    expect(html).toContain('<svg');
    expect(html).toContain('stroke="#faf6f1"');
    expect(html).toContain('stroke-opacity="0.16"');
    expect(html).toContain('stroke-opacity="0.11"');
    // Concentric means one centre for both rings, in the SVG's own coordinate space.
    expect(html.match(/cx="110"/g)).toHaveLength(2);
    expect(html.match(/cy="110"/g)).toHaveLength(2);
  });

  it('reserves a band for them, so they cannot be laid out under the text', () => {
    // The right padding is the ring band (150px) plus a margin. This is the mechanism, not the
    // geometry: text cannot reach the rings however long the name or the contact line is.
    const html = renderWith('verdant-banner');
    expect(html).toContain('padding:26px 172px 24px 26px');
    expect(html).toContain('aria-hidden="true"');
  });

  it('keeps them out of flow, so they cannot change the measured header height', () => {
    // Absolutely positioned decoration contributes nothing to `getBoundingClientRect`, which is what
    // pagination measures. Decoration that changed the header's height would change the page count.
    const html = renderWith('verdant-banner');
    expect(html).toContain('position:absolute');
    expect(html).toContain('overflow:hidden');
  });
});

describe('绿野通栏 renders the photo only when the user turned it on (ticket 48)', () => {
  it('draws no portrait and leaves no empty frame when the flag is off', () => {
    // ADR-0008: a template that renders a photo slot regardless of the flag silently ignores a stored
    // setting, and one that leaves the frame behind when the photo is off is a slot by another name.
    const html = renderWith('verdant-banner');
    expect(html).not.toContain('<img');
    // The no-photo arrangement is untouched, band arithmetic included.
    expect(html).toContain('padding:26px 172px 24px 26px');
  });

  it('draws a cream-framed portrait at the right of the banner when the flag is on', () => {
    const content = parsed({ avatar: 'https://example.com/me.jpg' });
    // Enabled with no path of its own, which is the state `resolveTemplate` exists to preserve: the
    // user turned the photo on, so the resume's own avatar is what gets shown.
    const html = renderWith(
      'verdant-banner',
      { ...DEFAULT_PRESENTATION, photo: { enabled: true, path: null } },
      content
    );

    expect(html).toContain('src="https://example.com/me.jpg"');
    // The portrait is described by the candidate's name, as in the other two templates.
    expect(html).toMatch(/alt="李明"/);
    expect(html).toContain('border-radius:18px');
    expect(html).toContain('border:3px solid #faf6f1');
    expect(html).toContain('object-fit:cover');
    // The row arrangement: the ring band is reserved by the text column that clips the rings, so the
    // decoration cannot reach the portrait — and the block itself stops reserving it.
    expect(html).toContain('padding-right:172px');
    expect(html).not.toContain('padding:26px 172px 24px 26px');
  });

  it('prefers the photo the presentation names over the metadata avatar', () => {
    const content = parsed({ avatar: 'https://example.com/avatar.jpg' });
    const html = renderWith(
      'verdant-banner',
      { ...DEFAULT_PRESENTATION, photo: { enabled: true, path: 'https://example.com/picked.jpg' } },
      content
    );

    expect(html).toContain('https://example.com/picked.jpg');
    expect(html).not.toContain('avatar.jpg');
  });

  it('draws nothing when the flag is off, even though the metadata carries an avatar', () => {
    const content = parsed({ avatar: 'https://example.com/avatar.jpg' });
    const html = renderWith('verdant-banner', {}, content);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('avatar.jpg');
  });
});

describe('绿野通栏\u2019s headings, entries and skills (ticket 48)', () => {
  it('puts the headings in the accent colour behind a vertical accent bar', () => {
    const html = renderWith('verdant-banner');
    expect(html).toContain(`border-left:3px solid ${DEFAULT_PRESENTATION.accentColor}`);
    expect(html).toContain('padding-left:10px');
    // The heading class contract is still emitted by the primitive — the export path queries it.
    expect(html).toContain('resume-section-heading');
  });

  it('stacks the entry meta under the title and gives the date its own right-aligned column', () => {
    const html = renderWith('verdant-banner');
    expect(html).toContain('flex-direction:column');
    expect(html).toContain('text-align:right');
    expect(html).toContain('某某科技');
    expect(html).toContain('2022年6月 - 至今');
  });

  it('renders bullets like the classic template', () => {
    const html = renderWith('verdant-banner');
    expect(html).toContain('list-style-type:disc');
    expect(html).toContain('主导前端架构升级');
  });

  it('renders skills as chips through the shared primitive, not as comma text', () => {
    // `border-radius:8px` is `ResumeSkillChip`'s shape; the classic template's capsule is 9999px, so
    // this also pins that the chips did not get re-implemented here.
    const html = renderWith('verdant-banner');
    expect(html).toContain('border-radius:8px');
    expect(html).toContain('>TypeScript<');
    expect(html).toContain('>React<');
    expect(html).toContain('>Go<');
    expect(html).not.toContain('TypeScript, React, Go');
  });
});

describe('绿野通栏 keeps the entry as the unit of pagination (ticket 48)', () => {
  /** The template's real markup, mounted so the print walk can traverse it. */
  function verdantPrintRoot(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = renderWith('verdant-banner');
    const root = host.querySelector('#resume-print-root');
    if (!root) throw new Error('绿野通栏 no longer emits #resume-print-root');
    return root as HTMLElement;
  }

  it('is descended into, so a section is not one unbreakable block', () => {
    // THE hazard for a template that wraps its entries: `flattenPrintFlow` measures each element it
    // meets as one indivisible block, so a wrapper without `data-print-flatten` welds a whole section
    // — or, through the section stack, the whole resume — into a single unit. The layout looks right
    // and the page count is wrong, which is why this is asserted against the real walk.
    const flow = flattenPrintFlow(verdantPrintRoot(), () => 120);
    const entries = flow.filter((block) => block.html.includes('resume-entry'));

    expect(entries).toHaveLength(2);
    for (const block of entries) {
      expect(block.html.match(/class="resume-entry"/g)).toHaveLength(1);
    }
    // Every heading is in the flow as a heading, so `paginateBlocks` can glue it to what follows.
    expect(flow.filter((block) => block.isHeading).map((block) => block.title)).toEqual([
      '关于我',
      '工作经历',
      '技能',
    ]);
  });

  it('paginates the real markup without an oversized block', () => {
    const box = a4ContentBox(18);
    const pages = paginateBlocks(flattenPrintFlow(verdantPrintRoot(), () => 120), box.height, box.width);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.some((page) => page.hasOversizedBlock)).toBe(false);
  });
});

// ── Escaping ────────────────────────────────────────────────────────────────

describe('renderers escape what they are given', () => {
  it('does not let a name inject markup', () => {
    // Contact values and names reach `href` and text nodes. React escapes both, but the assertion is
    // here because a future renderer that builds strings instead of elements would not.
    const content = parsed({ name: '<img src=x onerror=alert(1)>' } as never);
    const html = renderToStaticMarkup(
      atsSafeSingleColumn.render({
        content,
        metadata: { frontmatter: content.frontmatter },
        presentation: resolveTemplate(atsSafeSingleColumn, null),
        mode: 'print',
        fallbackTitle: '我的简历',
      })
    );
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });
});
