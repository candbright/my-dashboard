/**
 * The banner's ink branch (ticket 48).
 *
 * # Why this is arithmetic rather than a snapshot of a colour
 *
 * The template has to set its name, headline and contacts on a block whose fill the *user* chose, and
 * the palette's entries are not equally dark: warm cream scores 8.73:1 on 石棕 and 2.10:1 on 暖棕, and
 * 2.26:1 is the ceiling for *any* light foreground on `#d4a373` — pure white included. So a single
 * fixed foreground cannot be legible on every accent, and `bannerInk` picks between the two sanctioned
 * warm values instead.
 *
 * That makes the legibility claim a computation, so it is asserted as one: for every colour the server
 * accepts, the chosen ink clears WCAG AA for normal text, is one of the two warm constants, and both
 * arms are actually reachable. A future palette entry that no warm ink can carry fails here rather
 * than shipping as unreadable contact details.
 *
 * # Why it renders as well
 *
 * The arithmetic could be right while the renderer ignored it — the same "dead code that looks alive"
 * shape the template registry was rewritten to remove. So each palette colour is also rendered and the
 * markup is checked for the ink the branch chose, and for the absence of `#000000`/`#ffffff`
 * (`AGENTS.md` forbids both; `#ffffff` survives only as the *paper* colour).
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RESUME_TEMPLATES } from '@/components/resume-render';
import { bannerInk, contrastRatio, relativeLuminance } from '@/components/resume-render/verdant';
import {
  DEFAULT_PRESENTATION,
  PRESENTATION_PALETTE,
  presentationFromRecord,
} from '@/lib/resume-presentation';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';

/** The two sanctioned arms. Never `#ffffff`, never `#000000`. */
const WARM_CREAM = '#faf6f1';
const STONE_INK = '#292524';
const INKS = [WARM_CREAM, STONE_INK];

const verdant = RESUME_TEMPLATES.find((template) => template.id === 'verdant-banner')!;

const CONTENT = {
  frontmatter: {
    name: '李明',
    title: '全栈开发工程师',
    email: 'liming@dev.com',
    phone: '+86 139-0000-0000',
  },
  rawContent: '',
  sections: [{ title: '关于我', content: '5 年全栈开发经验。', items: [], kind: 'summary' }],
} as unknown as ParsedResumeWithMetadata;

function render(presentation: ReturnType<typeof presentationFromRecord>): string {
  return renderToStaticMarkup(
    verdant.render({
      content: CONTENT,
      metadata: { frontmatter: CONTENT.frontmatter },
      presentation,
      mode: 'print',
      fallbackTitle: '我的简历',
    })
  );
}

/**
 * The banner with one accent, passed through **without** the token merge.
 *
 * On purpose: `#5c4033` is also `DEFAULT_PRESENTATION.accentColor`, so `resolveTemplate` deliberately
 * lets the template's sage outvote it — that precedence is pinned in `resume-template.test.ts`, and
 * this case is about the ink the renderer chooses for a given fill. Merging here would silently test
 * the sage six times.
 */
function renderWithAccent(accentColor: string): string {
  return render(
    presentationFromRecord({ ...DEFAULT_PRESENTATION, template: 'verdant-banner', accentColor })
  );
}

describe('bannerInk picks the readable arm for every accepted accent (ticket 48)', () => {
  it('clears WCAG AA on all six palette colours, and always returns a sanctioned ink', () => {
    for (const { hex, label } of PRESENTATION_PALETTE) {
      const ink = bannerInk(hex);
      const ratio = contrastRatio(hex, ink);

      expect(INKS, `${hex} ${label} got an ink outside the palette rules`).toContain(ink);
      expect(ratio, `${hex} ${label} → ${ink} is only ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      // And it is genuinely the better of the two, not merely an acceptable one.
      const other = INKS.find((candidate) => candidate !== ink)!;
      expect(ratio).toBeGreaterThanOrEqual(contrastRatio(hex, other));
    }
  });

  it('uses both arms, so neither is dead code', () => {
    const chosen = new Set(PRESENTATION_PALETTE.map(({ hex }) => bannerInk(hex)));
    expect([...chosen].sort()).toEqual([WARM_CREAM, STONE_INK].sort());
  });

  it('states its worst case as a number a reader can check', () => {
    // 森林绿 `#557a46`, where warm cream wins at 4.58:1. The value in the renderer's comment; asserted
    // here so the comment cannot drift away from the behaviour it describes.
    const worst = PRESENTATION_PALETTE.map(({ hex }) => contrastRatio(hex, bannerInk(hex))).reduce(
      (lowest, ratio) => Math.min(lowest, ratio),
      Number.POSITIVE_INFINITY
    );

    expect(worst).toBeCloseTo(4.58, 1);
    expect(bannerInk('#557a46')).toBe(WARM_CREAM);
  });

  it('keeps the light accent on the dark ink, which no light foreground could carry', () => {
    // The measurement that forced the branch: `#d4a373` is 2.10:1 from cream, and its ceiling with any
    // light foreground is 2.26:1 — so this is not a preference, it is the only legible answer.
    expect(contrastRatio('#d4a373', WARM_CREAM)).toBeCloseTo(2.1, 1);
    expect(bannerInk('#d4a373')).toBe(STONE_INK);
    expect(contrastRatio('#d4a373', STONE_INK)).toBeCloseTo(6.71, 1);
  });

  it('falls back to the light ink for a value it cannot parse, rather than throwing', () => {
    // `presentationFromRecord` keeps an off-palette colour on purpose, so a renderer can be handed a
    // value that is not a hex at all. A render must not depend on that being impossible.
    for (const value of ['', 'not-a-colour', 'rgb(1, 2, 3)', '#12345', '#1234567']) {
      expect(relativeLuminance(value)).toBeNull();
      expect(bannerInk(value)).toBe(WARM_CREAM);
    }
  });

  it('accepts the three-digit form the server also accepts', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#abc')).toBeCloseTo(relativeLuminance('#aabbcc')!, 10);
  });

  it('reports the well-known extremes correctly, so the maths itself is pinned', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#faf6f1', '#faf6f1')).toBeCloseTo(1, 5);
    // Sanity on the luminance formula: stone-800 is a dark warm grey, not black.
    expect(relativeLuminance(STONE_INK)!).toBeGreaterThan(0.01);
    expect(relativeLuminance(STONE_INK)!).toBeLessThan(0.06);
  });
});

describe('the rendered banner carries the ink the branch chose (ticket 48)', () => {
  it('sets the name in a sanctioned ink for every palette colour, never pure white or black', () => {
    for (const { hex, label } of PRESENTATION_PALETTE) {
      const html = renderWithAccent(hex);
      const ink = bannerInk(hex);

      // The `<h1>` is the name: the largest text on the block and the one the branch exists for.
      expect(html, `${hex} ${label}: the name is not in ${ink}`).toMatch(
        new RegExp(`<h1[^>]*color:${ink}`)
      );
      expect(html, `${hex} ${label} rendered pure white text`).not.toContain('color:#ffffff');
      expect(html, `${hex} ${label} rendered pure black`).not.toContain('#000000');
      // The shadow that used to compensate for the fixed light ink is gone, not merely unused.
      expect(html, `${hex} ${label} still carries a text-shadow`).not.toContain('text-shadow');
    }
  });

  it('shows the branch working: dark ink on the light accent, light ink on the dark one', () => {
    // The two ends of the palette, in one assertion, because "it picks per accent" is the claim.
    expect(renderWithAccent('#d4a373')).toMatch(/<h1[^>]*color:#292524/);
    expect(renderWithAccent('#a64b45')).toMatch(/<h1[^>]*color:#faf6f1/);
  });
});
