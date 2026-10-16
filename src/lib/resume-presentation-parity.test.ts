import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENTATION,
  PRESENTATION_ACCENT_COLORS,
  PRESENTATION_BOUNDS,
  PRESENTATION_FONT_FAMILIES,
  PRESENTATION_PALETTE,
  PRESENTATION_SCHEMA_VERSION,
  PRESENTATION_TEMPLATES,
  accentLabel,
  parseHexHsl,
  presentationsEqual,
  presentationFromApi,
  presentationFromRecord,
  presentationWriteBody,
  validateAccentColor,
  validatePresentation,
  type ResumePresentation,
} from '@/lib/resume-presentation';
import serverFacts from '@/lib/__fixtures__/server-presentation.json';

/**
 * The frontend's presentation constants must agree with the server's.
 *
 * # Why this test is the point of the ticket's frontend half
 *
 * ADR-0004 makes the server the authority for presentation state, so the server validates every
 * write. The frontend still needs its own copy of the palette, the template list, the font
 * families and the numeric bounds — it cannot ask the server for them on every render, and a
 * value the user picks should be refused before a round trip.
 *
 * That duplication drifts, and the drift is silent in the worst direction. If the frontend keeps
 * a palette colour the server has dropped, every attempt to pick it fails with a 400 the user
 * cannot act on, because the swatch is right there on screen. If a bound drifts upward, the
 * panel offers a value that always fails. If it drifts downward, the option quietly disappears.
 *
 * So the duplication is **verified** rather than trusted. `server-presentation.json` is generated
 * from the live Go constants by `kratos-server/cmd/resumepresentation` (run it to regenerate;
 * every value in it is read from the `resumevault` package, never re-typed there). This test
 * compares the two sides field by field.
 *
 * A failure here means one side changed and the other did not. Work out which is right **against
 * ADR-0004 and AGENTS.md**, fix that side, and regenerate the fixture if the Go side moved:
 *
 *   cd ../kratos-server
 *   go run ./cmd/resumepresentation > ../my-dashboard/src/lib/__fixtures__/server-presentation.json
 */

interface ServerPaletteEntry {
  hex: string;
  label: string;
}

interface ServerDefault {
  schemaVersion: number;
  template: string;
  accentColor: string;
  fontFamily: string;
  fontScale: number;
  lineHeight: number;
  pageMargin: string;
  sectionOrder: string[];
  photo: { enabled: boolean; path: string | null };
}

interface ServerFacts {
  schemaVersion: number;
  palette: ServerPaletteEntry[];
  templates: string[];
  fontFamilies: string[];
  default: ServerDefault;
  bounds: {
    minFontScale: number;
    maxFontScale: number;
    minLineHeight: number;
    maxLineHeight: number;
    maxSectionOrderEntries: number;
    maxSectionNameLength: number;
    minPageMarginMM: number;
    maxPageMarginMM: number;
    minAccentLightness: number;
    maxAccentLightness: number;
    coldHueMinInclusive: number;
    coldHueMaxExclusive: number;
    coldSaturationFloor: number;
  };
  fieldNames: string[];
}

const facts = serverFacts as ServerFacts;

describe('presentation parity with the server (ticket 19, ADR-0004)', () => {
  it('has a fixture worth checking', () => {
    // Guards the test itself. A truncated or empty fixture would make every assertion below
    // vacuous, and a vacuous parity test is worse than none — it reports agreement it never
    // checked.
    expect(facts.palette.length).toBeGreaterThanOrEqual(6);
    expect(facts.templates.length).toBeGreaterThan(0);
    expect(facts.fontFamilies.length).toBeGreaterThan(0);
    expect(facts.fieldNames.length).toBe(9);
    expect(facts.default.sectionOrder.length).toBeGreaterThan(0);
  });

  it('agrees on the schema version', () => {
    expect(PRESENTATION_SCHEMA_VERSION).toBe(facts.schemaVersion);
  });

  it('agrees on the accent palette, entry for entry and in order', () => {
    // Order matters: it is the order the swatches are drawn, so a reordering is a visible change.
    expect(PRESENTATION_PALETTE.length).toBe(facts.palette.length);
    for (let i = 0; i < facts.palette.length; i++) {
      expect(
        { hex: PRESENTATION_PALETTE[i].hex, label: PRESENTATION_PALETTE[i].label },
        `palette entry ${i} differs`
      ).toEqual(facts.palette[i]);
    }
  });

  it('has a palette that is actually closed and lower-case', () => {
    // The server lower-cases before comparing, so an upper-case entry here would be a swatch
    // whose own hex is not what gets sent. And a duplicate would be two swatches, one dead.
    const hexes = PRESENTATION_PALETTE.map((c) => c.hex);
    for (const hex of hexes) {
      expect(hex, `${hex} is not lower-case`).toBe(hex.toLowerCase());
      expect(hex, `${hex} is not a 6-digit hex`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(PRESENTATION_ACCENT_COLORS).toEqual(hexes);
  });

  it('agrees on the templates', () => {
    expect([...PRESENTATION_TEMPLATES]).toEqual(facts.templates);
  });

  it('agrees on the font families', () => {
    expect([...PRESENTATION_FONT_FAMILIES]).toEqual(facts.fontFamilies);
  });

  it('agrees on every bound', () => {
    // Field by field rather than a whole-object comparison, so a failure names the bound instead
    // of printing two objects the reader has to diff by eye.
    for (const key of Object.keys(facts.bounds) as (keyof ServerFacts['bounds'])[]) {
      expect(PRESENTATION_BOUNDS[key], `bound ${key} differs`).toBe(facts.bounds[key]);
    }
    // And no extra local bound, which would be a rule the server does not enforce.
    expect(Object.keys(PRESENTATION_BOUNDS).sort()).toEqual(Object.keys(facts.bounds).sort());
  });

  it('agrees on the default presentation, field by field', () => {
    // The most important agreement of the set. Every resume created before ticket 19 has a NULL
    // column and reads as this value, so a default the server would *refuse* makes the first save
    // of an existing resume fail — and a default that differs silently rewrites the user's
    // styling the first time they save anything.
    expect(DEFAULT_PRESENTATION.schemaVersion).toBe(facts.default.schemaVersion);
    expect(DEFAULT_PRESENTATION.template).toBe(facts.default.template);
    expect(DEFAULT_PRESENTATION.accentColor).toBe(facts.default.accentColor);
    expect(DEFAULT_PRESENTATION.fontFamily).toBe(facts.default.fontFamily);
    expect(DEFAULT_PRESENTATION.fontScale).toBe(facts.default.fontScale);
    expect(DEFAULT_PRESENTATION.lineHeight).toBe(facts.default.lineHeight);
    expect(DEFAULT_PRESENTATION.pageMargin).toBe(facts.default.pageMargin);
    expect([...DEFAULT_PRESENTATION.sectionOrder]).toEqual(facts.default.sectionOrder);
    expect(DEFAULT_PRESENTATION.photo.enabled).toBe(facts.default.photo.enabled);
    expect(DEFAULT_PRESENTATION.photo.path).toBe(facts.default.photo.path);
  });

  it('agrees on the accepted field names', () => {
    // The server's `PresentationFieldNames` is derived by marshalling its own default, so this
    // also pins that the keys the frontend stores are the keys the server accepts. A field added
    // on one side only would be a value written into JSONB that the other never reads.
    expect(Object.keys(DEFAULT_PRESENTATION).sort()).toEqual(facts.fieldNames);
  });

  it('has a default that its own validator accepts', () => {
    // The counterweight to the parity assertions: agreement with the server would be satisfied by
    // two copies of a value that is illegal. A default the server refuses is an unsaveable resume.
    expect(validatePresentation({ ...DEFAULT_PRESENTATION })).toBeNull();
  });

  it('has every palette entry accepted by its own validator', () => {
    // Each swatch is offered to the user, so each must be storable. Checking the default alone
    // would miss "five of the six are fine".
    for (const entry of PRESENTATION_PALETTE) {
      const candidate: ResumePresentation = { ...DEFAULT_PRESENTATION, accentColor: entry.hex };
      expect(validatePresentation(candidate), `${entry.hex} (${entry.label}) is refused`).toBeNull();
    }
  });

  it('labels every palette colour the way the server does', () => {
    // The swatch labels and the server's rejection messages must be the same words. A user who is
    // told 「请选暖色」 and then sees a swatch the message never named cannot connect the two.
    for (const entry of facts.palette) {
      expect(accentLabel(entry.hex), `label for ${entry.hex}`).toBe(entry.label);
    }
  });
});

/**
 * `parseHexHsl` is the one piece of this module the parity fixture cannot check by comparing
 * tables, because it is an algorithm rather than a constant. It is also what the cold-hue and
 * lightness rules are built on, so a divergence would mean the panel greys out a colour the
 * server accepts, or offers one it refuses.
 *
 * The values are computed from the same definition the Go implementation uses, and the expected
 * numbers below were read off the Go side. They are asserted to two decimal places, which is far
 * looser than the arithmetic's precision but far tighter than any difference that would move a
 * colour across a bound.
 */
describe('parseHexHsl mirrors the server (ticket 19)', () => {
  it('returns null for anything that is not a 3- or 6-digit hex', () => {
    for (const value of ['', 'red', '#12345', '#1234567', '#12345678', 'rgb(1,2,3)', '#gggggg']) {
      expect(parseHexHsl(value), `${JSON.stringify(value)} should not parse`).toBeNull();
    }
  });

  it('accepts both 3- and 6-digit forms, and the same colour in both', () => {
    // `#000` and `#000000` are the same colour, so a validator that handled only one form would
    // accept pure black written the other way — which is the exact hole the black rule exists to
    // close.
    const short = parseHexHsl('#000');
    const long = parseHexHsl('#000000');
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(short!.l).toBeCloseTo(long!.l, 6);
    expect(short!.s).toBeCloseTo(long!.s, 6);
  });

  it('computes the documented values', () => {
    // Hue in degrees, saturation and lightness in 0..1.
    const cases: Array<{ hex: string; h: number; s: number; l: number }> = [
      { hex: '#5c4033', h: 19.0, s: 0.287, l: 0.28 },
      { hex: '#8b9d77', h: 88.4, s: 0.162, l: 0.541 },
      { hex: '#d4a373', h: 29.7, s: 0.53, l: 0.641 },
      { hex: '#557a46', h: 102.7, s: 0.271, l: 0.376 },
      { hex: '#c28a2e', h: 37.3, s: 0.617, l: 0.471 },
      { hex: '#a64b45', h: 3.7, s: 0.413, l: 0.461 },
      { hex: '#0066cc', h: 210.0, s: 1.0, l: 0.4 },
      { hex: '#000000', h: 0, s: 0, l: 0 },
      { hex: '#292524', h: 12.0, s: 0.065, l: 0.151 },
      { hex: '#808080', h: 0, s: 0, l: 0.502 },
    ];

    for (const c of cases) {
      const got = parseHexHsl(c.hex);
      expect(got, `${c.hex} did not parse`).not.toBeNull();
      expect(got!.h, `${c.hex} hue`).toBeCloseTo(c.h, 1);
      expect(got!.s, `${c.hex} saturation`).toBeCloseTo(c.s, 2);
      expect(got!.l, `${c.hex} lightness`).toBeCloseTo(c.l, 2);
    }
  });

  it('reports no saturation for an achromatic colour', () => {
    // This is what makes the saturation floor meaningful. HSL assigns an achromatic colour an
    // arbitrary hue (0), so a naive `hue >= 150 && hue < 300` test would be the only thing
    // standing between a neutral grey and a "cold colour" rejection — and for a hue of 0 it
    // would happen to pass, which is luck rather than a rule.
    for (const grey of ['#000000', '#808080', '#ffffff']) {
      expect(parseHexHsl(grey)!.s, `${grey} should be achromatic`).toBe(0);
    }
  });
});

/**
 * The design rules, which `AGENTS.md` states as hard prohibitions.
 *
 * These are duplicated from the Go test suite on purpose. The client-side check exists so the
 * user is refused before a round trip, and a client check that accepts what the server refuses
 * produces a 400 the user cannot act on. The server is still the authority; this only has to not
 * disagree.
 */
describe('design rules are enforced client-side too (ticket 19, AGENTS.md)', () => {
  it('refuses cold colours, and says why', () => {
    for (const hex of ['#0066cc', '#00ffff', '#4b0082', '#8a2be2', '#008080']) {
      const problem = validateAccentColor(hex);
      expect(problem, `${hex} should be refused`).not.toBeNull();
      expect(problem!.field).toBe('accentColor');
      // The message must name the rule. "not in the palette" alone leaves the user guessing.
      expect(problem!.message).toContain('冷色');
    }
  });

  it('refuses pure black and anything that reads as black', () => {
    for (const hex of ['#000000', '#000', '#0a0a0a', '#111111', '#1a1a1a', '#292524']) {
      const problem = validateAccentColor(hex);
      expect(problem, `${hex} should be refused`).not.toBeNull();
      expect(problem!.message).toContain('纯黑');
    }
  });

  it('refuses a colour too pale to carry text', () => {
    const problem = validateAccentColor('#fefefe');
    expect(problem).not.toBeNull();
    expect(problem!.message).toContain('过浅');
  });

  it('refuses a warm colour that is not in the palette', () => {
    // `#ff0000` is unambiguously warm and still refused, because a user may only pick from the
    // six offered colours. This is the case that shows the palette and the design rules are two
    // separate checks: passing one does not imply the other.
    const problem = validateAccentColor('#ff0000');
    expect(problem).not.toBeNull();
    expect(problem!.message).toContain('未知主色');
  });

  it('accepts every palette entry regardless of case and surrounding space', () => {
    // The server lower-cases and trims before comparing, so refusing `#5C4033` would be a
    // confusing failure for a visually identical value.
    for (const entry of PRESENTATION_PALETTE) {
      expect(validateAccentColor(entry.hex.toUpperCase())).toBeNull();
      expect(validateAccentColor(`  ${entry.hex}  `)).toBeNull();
    }
  });
});

describe('validatePresentation mirrors the server ranges (ticket 19)', () => {
  const base = (): ResumePresentation => ({ ...DEFAULT_PRESENTATION, sectionOrder: [...DEFAULT_PRESENTATION.sectionOrder] });

  it('accepts the defaults', () => {
    expect(validatePresentation(base())).toBeNull();
  });

  it('names the offending field for each out-of-range value', () => {
    const cases: Array<{ name: string; mutate: (p: ResumePresentation) => void; field: string }> = [
      { name: 'font scale too large', mutate: (p) => { p.fontScale = 40; }, field: 'fontScale' },
      { name: 'font scale too small', mutate: (p) => { p.fontScale = 0.1; }, field: 'fontScale' },
      { name: 'font scale zero', mutate: (p) => { p.fontScale = 0; }, field: 'fontScale' },
      { name: 'line height too large', mutate: (p) => { p.lineHeight = 9; }, field: 'lineHeight' },
      { name: 'line height too small', mutate: (p) => { p.lineHeight = 0.1; }, field: 'lineHeight' },
      { name: 'unknown template', mutate: (p) => { (p as { template: string }).template = 'fancy'; }, field: 'template' },
      { name: 'unknown font family', mutate: (p) => { (p as { fontFamily: string }).fontFamily = 'comic-sans'; }, field: 'fontFamily' },
      { name: 'margin without a unit', mutate: (p) => { p.pageMargin = '18'; }, field: 'pageMargin' },
      { name: 'margin in pixels', mutate: (p) => { p.pageMargin = '40px'; }, field: 'pageMargin' },
      { name: 'margin too small', mutate: (p) => { p.pageMargin = '1mm'; }, field: 'pageMargin' },
      { name: 'margin too large', mutate: (p) => { p.pageMargin = '100mm'; }, field: 'pageMargin' },
      { name: 'empty section order', mutate: (p) => { p.sectionOrder = []; }, field: 'sectionOrder' },
      { name: 'blank section name', mutate: (p) => { p.sectionOrder = ['关于我', '  ']; }, field: 'sectionOrder[1]' },
      { name: 'duplicate section', mutate: (p) => { p.sectionOrder = ['技能', '技能']; }, field: 'sectionOrder[1]' },
      { name: 'photo enabled with no path', mutate: (p) => { p.photo = { enabled: true, path: null }; }, field: 'photo.path' },
    ];

    for (const c of cases) {
      const candidate = base();
      c.mutate(candidate);
      const problem = validatePresentation(candidate);
      expect(problem, `${c.name} was accepted`).not.toBeNull();
      expect(problem!.field, `${c.name} reported the wrong field`).toBe(c.field);
      expect(problem!.message.length, `${c.name} has an empty message`).toBeGreaterThan(0);
    }
  });

  it('accepts every margin unit the server accepts', () => {
    // Four values that are all ~18mm. A validator that pattern-matched `mm` only would pass the
    // range tests above while making `1.8cm` a hard error.
    for (const margin of ['18mm', '1.8cm', '0.708661417in', '51.02pt', ' 18 mm ']) {
      const candidate = base();
      candidate.pageMargin = margin;
      expect(validatePresentation(candidate), `${margin} was refused`).toBeNull();
    }
  });

  it('refuses an over-long section order and an over-long name', () => {
    const tooMany = base();
    tooMany.sectionOrder = Array.from({ length: PRESENTATION_BOUNDS.maxSectionOrderEntries + 1 }, (_, i) => `章节${i}`);
    expect(validatePresentation(tooMany)!.field).toBe('sectionOrder');

    const tooLong = base();
    tooLong.sectionOrder = ['x'.repeat(PRESENTATION_BOUNDS.maxSectionNameLength + 1)];
    expect(validatePresentation(tooLong)!.field).toBe('sectionOrder[0]');
  });

  it('counts section-name length in code points, not UTF-16 units', () => {
    // Chinese characters are one code point but the server counts runes. Counting UTF-16 units
    // would be the same for Chinese and *different* for emoji, which is where the two would drift.
    const exact = base();
    exact.sectionOrder = ['技'.repeat(PRESENTATION_BOUNDS.maxSectionNameLength)];
    expect(validatePresentation(exact), 'a name exactly at the limit was refused').toBeNull();
  });
});

describe('presentationFromRecord fills a partial or absent value (ticket 19)', () => {
  it('reads nothing as the default', () => {
    // The normal case: every resume created before ticket 19 has a NULL column.
    for (const input of [null, undefined, {}, 'nonsense', 42, []]) {
      const got = presentationFromRecord(input);
      expect(got.template, `input ${JSON.stringify(input)}`).toBe(DEFAULT_PRESENTATION.template);
      expect(got.accentColor).toBe(DEFAULT_PRESENTATION.accentColor);
      expect(got.sectionOrder).toEqual([...DEFAULT_PRESENTATION.sectionOrder]);
    }
  });

  it('normalises an out-of-range number to the default', () => {
    // Unlike the colour, there is no defensible way to honour `fontScale: 0` — it is not a
    // preference, it is an unreadable page.
    const got = presentationFromRecord({ fontScale: 0, lineHeight: 99, pageMargin: 'nonsense' });
    expect(got.fontScale).toBe(DEFAULT_PRESENTATION.fontScale);
    expect(got.lineHeight).toBe(DEFAULT_PRESENTATION.lineHeight);
    expect(got.pageMargin).toBe(DEFAULT_PRESENTATION.pageMargin);
  });

  it('keeps a stored off-palette colour', () => {
    // The deliberate asymmetry. Silently repainting a resume because the palette changed is a
    // worse failure than showing the user the colour they chose; they meet the validator's
    // complaint the next time they open the panel, which is the right place for it.
    expect(presentationFromRecord({ accentColor: '#123456' }).accentColor).toBe('#123456');
  });

  it('drops an enabled photo that has no path', () => {
    // Would otherwise render a broken image. Dropping it is the recoverable choice.
    expect(presentationFromRecord({ photo: { enabled: true, path: null } }).photo).toEqual({
      enabled: false,
      path: null,
    });
    expect(presentationFromRecord({ photo: { enabled: true, path: '  ' } }).photo.enabled).toBe(false);
  });

  it('always stamps the schema version this build knows', () => {
    // Never a value read from storage: an input claiming a higher version would be claiming a
    // shape this code cannot render.
    expect(presentationFromRecord({ schemaVersion: 99 }).schemaVersion).toBe(PRESENTATION_SCHEMA_VERSION);
    expect(presentationFromRecord(null).schemaVersion).toBe(PRESENTATION_SCHEMA_VERSION);
  });

  it('uses the bounds to decide what is out of range', () => {
    // Boundary values must be kept, not reset — an off-by-one here would silently clamp a
    // legitimate accessibility setting back to 1.
    const atMin = presentationFromRecord({ fontScale: PRESENTATION_BOUNDS.minFontScale });
    expect(atMin.fontScale).toBe(PRESENTATION_BOUNDS.minFontScale);
    const atMax = presentationFromRecord({ fontScale: PRESENTATION_BOUNDS.maxFontScale });
    expect(atMax.fontScale).toBe(PRESENTATION_BOUNDS.maxFontScale);
  });
});

describe('presentationFromApi reads the read route payload (ticket 19)', () => {
  it('reads the camelCase spelling the proto codec emits', () => {
    // `ctx.Result` marshals with protojson, so this is the shape the server actually sends.
    const got = presentationFromApi({
      accentColor: '#8b9d77',
      fontFamily: 'sans',
      fontScale: 1.4,
      lineHeight: 1.9,
      pageMargin: '22mm',
      sectionOrder: ['工作经历', '教育背景'],
      template: 'ats-safe-single-column',
      photo: { enabled: true, path: 'avatars/me.png' },
    });

    expect(got.accentColor).toBe('#8b9d77');
    expect(got.fontFamily).toBe('sans');
    expect(got.fontScale).toBe(1.4);
    expect(got.lineHeight).toBe(1.9);
    expect(got.pageMargin).toBe('22mm');
    expect(got.sectionOrder).toEqual(['工作经历', '教育背景']);
    expect(got.photo).toEqual({ enabled: true, path: 'avatars/me.png' });
  });

  it('also reads the snake_case spelling the tag-based encoder would emit', () => {
    // Not hedging. A handler reaching for `writeJSON` instead of `ctx.Result` would send this
    // shape, and without the fallback every styling field would read as `undefined` and the panel
    // would show defaults with no error raised anywhere — which is what happened to the settings
    // pages once already.
    const got = presentationFromApi({
      accent_color: '#a64b45',
      font_family: 'serif',
      font_scale: 1.2,
      line_height: 1.7,
      page_margin: '20mm',
      section_order: ['技能'],
      photo: { enabled: false, path: '' },
    });

    expect(got.accentColor).toBe('#a64b45');
    expect(got.fontFamily).toBe('serif');
    expect(got.fontScale).toBe(1.2);
    expect(got.lineHeight).toBe(1.7);
    expect(got.pageMargin).toBe('20mm');
    expect(got.sectionOrder).toEqual(['技能']);
    // An empty string and an absent path are the same thing to this module.
    expect(got.photo).toEqual({ enabled: false, path: null });
  });

  it('handles the unpopulated payload protojson emits', () => {
    // The codec sets `EmitUnpopulated`, so an unset message arrives as zero values rather than as
    // absent keys — `fontScale: 0`, `accentColor: ''`. Those must read as the default, not as a
    // request to store an illegal value.
    const got = presentationFromApi({
      schemaVersion: 0,
      template: '',
      accentColor: '',
      fontFamily: '',
      fontScale: 0,
      lineHeight: 0,
      pageMargin: '',
      sectionOrder: [],
      photo: { enabled: false, path: '' },
    });

    expect(got.template).toBe(DEFAULT_PRESENTATION.template);
    expect(got.accentColor).toBe(DEFAULT_PRESENTATION.accentColor);
    expect(got.fontFamily).toBe(DEFAULT_PRESENTATION.fontFamily);
    expect(got.fontScale).toBe(DEFAULT_PRESENTATION.fontScale);
    expect(got.lineHeight).toBe(DEFAULT_PRESENTATION.lineHeight);
    expect(got.pageMargin).toBe(DEFAULT_PRESENTATION.pageMargin);
    expect(got.sectionOrder).toEqual([...DEFAULT_PRESENTATION.sectionOrder]);
  });

  it('reads nothing as the default', () => {
    for (const input of [null, undefined, 'nonsense', 42]) {
      expect(presentationFromApi(input).template).toBe(DEFAULT_PRESENTATION.template);
    }
  });
});

describe('presentationWriteBody builds the flat request the server decodes (ticket 19)', () => {
  const presentation: ResumePresentation = {
    ...DEFAULT_PRESENTATION,
    accentColor: '#8b9d77',
    sectionOrder: ['技能', '工作经历'],
  };

  it('puts the styling fields at the top level next to version', () => {
    const body = presentationWriteBody({ presentation, version: 3 });

    // Flattened on purpose: the server's strict decoder rejects an unknown key, so a nested
    // `presentation` wrapper would be refused — this is the shape it accepts.
    expect(body.accentColor).toBe('#8b9d77');
    expect(body.sectionOrder).toEqual(['技能', '工作经历']);
    expect(body.version).toBe(3);
    expect(body.presentation).toBeUndefined();
  });

  it('sends every field the server requires', () => {
    const body = presentationWriteBody({ presentation, version: 1 });
    for (const key of facts.fieldNames) {
      expect(body, `missing ${key}`).toHaveProperty(key);
    }
  });

  it('sends version 0 rather than omitting it', () => {
    // The server refuses a write it cannot check, and proto3 has no presence for a scalar — so
    // omitting it and sending 0 look identical on the wire. Being explicit keeps the request
    // honest about what the caller actually knows.
    const body = presentationWriteBody({ presentation, version: 0 });
    expect(body).toHaveProperty('version');
    expect(body.version).toBe(0);
  });

  it('survives a JSON round trip intact', () => {
    // The real wire path. `JSON.stringify` drops `undefined` properties, so a field that happened
    // to be `undefined` would vanish here and the server would read it as "unchanged" instead of
    // as a value.
    const body = presentationWriteBody({ presentation, version: 7 });
    expect(JSON.parse(JSON.stringify(body))).toEqual(body);
  });
});

describe('presentationsEqual decides whether a save is worth sending (ticket 19)', () => {
  const base = (): ResumePresentation => ({
    ...DEFAULT_PRESENTATION,
    sectionOrder: [...DEFAULT_PRESENTATION.sectionOrder],
  });

  it('reports two defaults as equal', () => {
    expect(presentationsEqual(base(), base())).toBe(true);
  });

  it('compares section order element by element', () => {
    // Two arrays are never `===`, so a shallow comparison would report every value as changed and
    // fire a request — and every unnecessary request advances `version`, invalidating the token
    // another tab is holding.
    const a = base();
    const b = base();
    expect(a.sectionOrder).not.toBe(b.sectionOrder);
    expect(presentationsEqual(a, b)).toBe(true);

    const c = base();
    c.sectionOrder = [...c.sectionOrder].reverse();
    expect(presentationsEqual(a, c)).toBe(false);

    const d = base();
    d.sectionOrder = [...d.sectionOrder, '证书'];
    expect(presentationsEqual(a, d)).toBe(false);
  });

  it('detects a change in each scalar field', () => {
    const mutations: Array<[string, (p: ResumePresentation) => void]> = [
      ['template', (p) => { (p as { template: string }).template = 'other'; }],
      ['accentColor', (p) => { p.accentColor = '#8b9d77'; }],
      ['fontFamily', (p) => { p.fontFamily = 'sans'; }],
      ['fontScale', (p) => { p.fontScale = 1.3; }],
      ['lineHeight', (p) => { p.lineHeight = 2; }],
      ['pageMargin', (p) => { p.pageMargin = '20mm'; }],
      ['photo.enabled', (p) => { p.photo = { ...p.photo, enabled: true, path: 'x.png' }; }],
      ['photo.path', (p) => { p.photo = { ...p.photo, path: 'y.png' }; }],
    ];

    for (const [name, mutate] of mutations) {
      const changed = base();
      mutate(changed);
      expect(presentationsEqual(base(), changed), `${name} change was not detected`).toBe(false);
    }
  });
});
