/**
 * The gallery preview and the parseability standard (ticket 22).
 *
 * # What these pin
 *
 * Two things that a gallery is uniquely bad at getting caught doing:
 *
 *   1. **Showing a preview that does not preview anything.** The component's whole justification is
 *      that the renderer draws it, so the test asserts the real template markup is present and that
 *      two different templates produce visibly different previews. A `<div>` with a grey rectangle
 *      would satisfy a screenshot review and fail these.
 *   2. **Labelling templates by feel.** `PARSEABILITY_CRITERIA` is asserted to cover exactly the
 *      ratings the type allows, so a new rating cannot be added to the union and left out of the
 *      written standard — which is the failure ADR-0008 asks for a written table to prevent.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TemplateThumbnail, RESUME_THUMBNAIL_WIDTH } from '@/components/resume-render/TemplateThumbnail';
import { RESUME_TEMPLATES } from '@/components/resume-render';
import {
  PARSEABILITY_CRITERIA,
  PARSEABILITY_ORDER,
  PARSEABILITY_SUMMARY,
} from '@/lib/resume-parseability';
import { PARSEABILITY_LABELS, type TemplateParseability } from '@/lib/resume-template';

/**
 * The scale factor the component should produce: the default preview width over the page width.
 *
 * Derived rather than written as a literal so that changing either number cannot leave the test
 * asserting a value the component no longer produces.
 */
const EXPECTED_SCALE = RESUME_THUMBNAIL_WIDTH / 794;

function render(templateIndex = 0, accent = '#5c4033') {
  return renderToStaticMarkup(
    createElement(TemplateThumbnail, {
      template: RESUME_TEMPLATES[templateIndex],
      accent,
    })
  );
}

describe('TemplateThumbnail', () => {
  it('draws the real template rather than a placeholder', () => {
    const html = render();

    // The ATS-safe template's contact line, joined with the documented middle dot.
    expect(html).toContain('一句话说明你的优势与求职方向');
    expect(html).toContain('技能一');
    // A section heading, which is drawn by a primitive rather than by the page wrapper.
    expect(html).toContain('工作经历');
  });

  it('draws at real page width and scales down, so line breaking matches the printed page', () => {
    const html = render();

    // The page is drawn at its true A4-at-96dpi width and scaled, rather than re-rendered smaller.
    // Re-rendering at a smaller font size would change line breaking and the preview would stop
    // being a preview of the printed document.
    expect(html).toContain('width:794px');
    expect(html).toContain(`scale(${EXPECTED_SCALE})`);
  });

  it('uses the card accent where the template sets no accent token of its own', () => {
    const sage = render(0, '#8b9d77');
    const amber = render(0, '#c28a2e');

    expect(sage).toContain('#8b9d77');
    expect(sage).not.toContain('#c28a2e');
    expect(amber).toContain('#c28a2e');
  });

  it('produces visibly different previews for different templates', () => {
    const atsSafe = render(0);
    const classic = render(1);

    // The distinguishing fact is the header alignment: the ATS-safe template is left-aligned and the
    // classic one is centred. Comparing sizes or colours would pass even if the previews were
    // identical, because both are produced by the same wrapper.
    expect(atsSafe).not.toEqual(classic);
    expect(atsSafe).toContain('text-align:left');
    expect(classic).toContain('text-align:center');
  });

  it('shows 绿野通栏 as a colour block, not as another plain page', () => {
    // The gallery's whole justification (ADR-0008's 模板看起来不同，实际相同 defect): a third card that
    // previewed like the other two would be advertising a design it does not have.
    const verdant = render(2, '#a64b45');

    expect(verdant).toContain('background:#a64b45');
    // The decorative rings are part of the design, so they have to be in the preview.
    expect(verdant).toContain('<svg');
    expect(verdant).not.toEqual(render(0, '#a64b45'));
  });

  it('previews the accent the resume will really have, including the default swatch', () => {
    // No registered template ships an accent token, so the product default is a real colour: the
    // thumbnail must show 石棕 when that is what was passed, and the chosen colour otherwise.
    expect(render(2, '#5c4033')).toContain('background:#5c4033');
    expect(render(2, '#c28a2e')).toContain('background:#c28a2e');
  });

  it('renders the user-supplied content shape the renderers expect', () => {
    const html = render();

    // The sections come from a parsed Markdown sample, so an entry and a skill chip both exist: a
    // preview built from a hand-written object would not prove the parser and renderer agree.
    expect(html).toContain('职位名称');
    expect(html).toContain('公司名称');
    expect(html).toContain('本科 专业');
  });

  it('hides itself from assistive technology', () => {
    // Every fact in the preview is repeated as text in the card, so announcing it would make a
    // screen reader read a fake resume before reaching the card's real name.
    expect(render()).toContain('aria-hidden="true"');
  });
});

describe('parseability standard', () => {
  it('covers exactly the ratings the type permits', () => {
    const rated = PARSEABILITY_CRITERIA.map((row) => row.rating).sort();
    const allowed = (Object.keys(PARSEABILITY_LABELS) as TemplateParseability[]).sort();

    // If this fails, a rating was added to `TemplateParseability` without a written criterion —
    // which is the whole thing the written table exists to stop.
    expect(rated).toEqual(allowed);
  });

  it('has a summary line for every rating', () => {
    for (const rating of PARSEABILITY_ORDER) {
      expect(PARSEABILITY_SUMMARY[rating]).toBeTruthy();
    }
  });

  it('states the column count, because that is the criterion users act on', () => {
    const high = PARSEABILITY_CRITERIA.find((row) => row.rating === 'high');
    expect(high?.traits).toContain('单栏');
    expect(high?.traits).toContain('无版式表格');
  });

  it('labels every registered template with a rating that has a written criterion', () => {
    const rated = new Set(PARSEABILITY_CRITERIA.map((row) => row.rating));

    for (const template of RESUME_TEMPLATES) {
      expect(rated.has(template.parseability)).toBe(true);
    }
  });
});
