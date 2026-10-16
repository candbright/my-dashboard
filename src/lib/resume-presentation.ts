/**
 * Presentation state — how a resume looks (ticket 19, ADR-0004).
 *
 * # Why this module exists
 *
 * ADR-0004 stores styling in `resumes.presentation` as JSONB and makes the **server** the
 * authority: it validates every write, because a JSONB column constrains nothing and a client
 * is not the only writer. The frontend still needs its own copy of the facts, for two reasons
 * that are not negotiable:
 *
 *   1. the style panel has to *offer* the six palette colours, the templates and the font
 *      families, and it cannot ask the server for a list on every render;
 *   2. a value the user picks should be refused before a round trip, not after one.
 *
 * That duplication can drift, and it drifts silently in the worst direction: a palette entry
 * the frontend keeps but the server has dropped is a swatch that is on screen and always fails
 * with a 400 the user cannot act on. So the duplication is **verified** rather than trusted —
 * `resume-presentation-parity.test.ts` compares every table and every bound below against
 * `__fixtures__/server-presentation.json`, which `kratos-server/cmd/resumepresentation`
 * generates from the live Go constants. The same arrangement ADR-0003 uses for the two body
 * parsers.
 *
 * # Why the keys here are camelCase, and why the wire is camelCase too
 *
 * The storage shape ADR-0004 specifies is camelCase (`accentColor`, `fontScale`), and that is
 * what this module uses, because it is what is written into the column and what a dashboard user
 * sees if they open it in a SQL client.
 *
 * The write route and the read route both answer camelCase as well — `accentColor`, not
 * `accent_color`. That is not obvious from the server source, so it is worth recording why:
 * `internal/server/http.go` installs a custom response encoder that would produce snake_case
 * from the generated Go struct tags, but that encoder is only reached by `writeJSON`. Any
 * handler that answers with `ctx.Result` goes through kratos' JSON codec, which uses `protojson`
 * and therefore camelCase — and every resume route does. The frontend already depends on this
 * (`resume.jobTitle`, `resume.approvalStatus`, `resume.version`).
 *
 * {@link presentationFromApi} still accepts both spellings. That is not hedging: the cost is one
 * `??` per field, and the alternative is that a future handler reaching for the wrong encoder
 * makes the panel render defaults forever with no error raised anywhere — which is exactly what
 * happened to the settings pages once already.
 *
 * # The write contract
 *
 * Unlike the metadata patch (ticket 15), presentation is written as a **whole object**. There is
 * no "clear one styling field" case: every field has a default, and a partial write into JSONB
 * would need a merge rule the database does not provide. So a write sends the complete
 * presentation plus the `version` the client holds, and the server either accepts all of it or
 * refuses all of it.
 */

/** The font families the server accepts. A closed set, because font fallback in a PDF is invisible. */
export type PresentationFontFamily = 'serif' | 'sans';

/**
 * The template ids the server accepts. A closed set, shared with the Go constants.
 *
 * Every id here must have a renderer in the registry (`src/components/resume-render/`), and the
 * reverse: an id the server will store but nothing can draw is a resume that silently renders as
 * a different template. `resume-presentation-parity.test.ts` fails if the two lists disagree,
 * because its fixture is generated from the live Go constants — so this union cannot drift from
 * the server without a test going red.
 *
 * The order matches the server's, and is meaningful: the first entry is the fallback for a stored
 * id that is no longer registered, so it is the safest layout (ADR-0008).
 */
export type PresentationTemplate = 'ats-safe-single-column' | 'classic-centred' | 'verdant-banner';

/**
 * One palette entry: the hex the server stores, and the Chinese name a person reads.
 *
 * The label is not decoration. The server's rejection messages name colours in Chinese
 * (「请选暖色」), so a swatch labelled with a different word would leave the user unable to
 * connect the message to the control.
 */
export interface PresentationPaletteEntry {
  hex: string;
  label: string;
}

/**
 * The closed set of accent colours, in the server's order.
 *
 * `as const` so the hex values stay literal types. The parity test compares this table against
 * the server's, entry for entry and in order — the order is the order the swatches are drawn,
 * so a reordering is a visible change and should be a deliberate one.
 */
export const PRESENTATION_PALETTE = [
  { hex: '#5c4033', label: '石棕' },
  { hex: '#8b9d77', label: '鼠尾草绿' },
  { hex: '#d4a373', label: '暖棕' },
  { hex: '#557a46', label: '森林绿' },
  { hex: '#c28a2e', label: '琥珀' },
  { hex: '#a64b45', label: '暗红' },
] as const satisfies readonly PresentationPaletteEntry[];

/** Just the hex values, derived so the two cannot disagree. */
export const PRESENTATION_ACCENT_COLORS: readonly string[] = PRESENTATION_PALETTE.map((c) => c.hex);

/** The templates the server accepts, in the server's order. */
export const PRESENTATION_TEMPLATES: readonly PresentationTemplate[] = [
  'ats-safe-single-column',
  'classic-centred',
  'verdant-banner',
] as const;

/** The font families the server accepts, in the server's order. Serif is first: it is the default. */
export const PRESENTATION_FONT_FAMILIES: readonly PresentationFontFamily[] = ['serif', 'sans'] as const;

/** The schema version this build writes. Compared, not chosen — the server stamps the stored value. */
export const PRESENTATION_SCHEMA_VERSION = 1;

/**
 * The value the server substitutes when a resume has no stored presentation.
 *
 * Every resume created before ticket 19 has a NULL column, so this is not an edge case: it is
 * what the overwhelming majority of records read as. It must therefore be a value the server
 * **accepts**, or the first save of an existing resume would fail. The parity test asserts the
 * fixture's default matches this one field by field.
 *
 * Frozen so a caller cannot mutate the shared default by accident — a panel that did
 * `const draft = DEFAULT_PRESENTATION; draft.fontScale = 2` would silently change what every
 * other caller starts from.
 */
export const DEFAULT_PRESENTATION: Readonly<ResumePresentation> = Object.freeze({
  schemaVersion: PRESENTATION_SCHEMA_VERSION,
  template: 'ats-safe-single-column',
  accentColor: '#5c4033',
  fontFamily: 'serif',
  fontScale: 1,
  lineHeight: 1.5,
  pageMargin: '18mm',
  sectionOrder: ['关于我', '工作经历', '项目经历', '教育背景', '技能'],
  photo: { enabled: false, path: null },
});

/**
 * The server's numeric and structural bounds, mirroring `PresentationLimits` in Go.
 *
 * The panel clamps its controls to these, so the user is not offered a value the server refuses.
 * Restating the numbers here is safe only because the parity test compares them; without that,
 * a slider whose maximum drifted above the server's would be a control that always fails.
 */
export const PRESENTATION_BOUNDS = {
  minFontScale: 0.8,
  maxFontScale: 1.6,
  minLineHeight: 1,
  maxLineHeight: 2.5,
  maxSectionOrderEntries: 30,
  maxSectionNameLength: 60,
  minPageMarginMM: 5,
  maxPageMarginMM: 60,
  minAccentLightness: 0.2,
  maxAccentLightness: 0.85,
  coldHueMinInclusive: 150,
  coldHueMaxExclusive: 300,
  coldSaturationFloor: 0.1,
} as const;

/**
 * The accepted length units, and how many millimetres each is worth.
 *
 * Declared here because the panel has to convert what the user typed to millimetres to check it
 * against the bounds, and the server accepts all four. Accepting only `mm` would refuse
 * `1.8cm`, which is an ordinary way to write the same margin.
 */
const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
};

/**
 * A page margin as a CSS length with an explicit unit.
 *
 * The separator between the number and the unit is optional, matching the server: `18 mm` is how
 * a person writes a margin in prose, and refusing it would be a rule with no lesson in it.
 */
const PAGE_MARGIN_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|pt)\s*$/;

/** The presentation state of one resume, using the storage (camelCase) key spellings. */
export interface ResumePresentation {
  schemaVersion: number;
  template: PresentationTemplate;
  accentColor: string;
  fontFamily: PresentationFontFamily;
  fontScale: number;
  lineHeight: number;
  pageMargin: string;
  sectionOrder: string[];
  photo: PresentationPhoto;
}

/** The ID-photo slot. `path` is `null` rather than `''` when unset, matching the stored shape. */
export interface PresentationPhoto {
  enabled: boolean;
  path: string | null;
}

/**
 * Fallback values used when a stored presentation is absent or a field is unusable (ticket 20).
 *
 * This is how a template's styling tokens reach the page: `presentationFromRecord(raw, tokens)`
 * consults them wherever it would otherwise consult `DEFAULT_PRESENTATION`.
 *
 * `schemaVersion` and `sectionOrder` are **excluded on purpose**:
 *
 *   - `schemaVersion` is a wire-format marker, not a style. A template defaulting it would be
 *     claiming a storage shape, and the reader always stamps the version this build knows.
 *   - `sectionOrder` names the user's own headings, so no template can know it. It always derives
 *     from `DEFAULT_PRESENTATION`.
 *
 * `ResumePresentation` is assignable to this type, so a caller with a complete presentation can
 * pass it directly.
 */
export type PresentationDefaults = Partial<
  Pick<
    ResumePresentation,
    'template' | 'accentColor' | 'fontFamily' | 'fontScale' | 'lineHeight' | 'pageMargin' | 'photo'
  >
>;

/**
 * A whole-object write: the complete presentation plus the version the client holds.
 *
 * The version is not optional and not defaulted. The server refuses a request without one
 * (`VERSION_MISSING`), because a write that can omit the token has a hole rather than a lock —
 * and a client that sent `undefined` here would be sending exactly that.
 */
export interface PresentationWrite {
  presentation: ResumePresentation;
  version: number;
}

/** Where a validation problem is, and what to tell the user. */
export interface PresentationProblem {
  /** The offending field, using the storage spellings. `''` when the problem is not one field. */
  field: string;
  /** A ready-to-display Chinese message. */
  message: string;
}

/**
 * Convert an HSL hue/saturation/lightness triple from a `#rgb` or `#rrggbb` value.
 *
 * Returns `null` for anything that is not one of those two shapes — including `#rrggbbaa`, which
 * is deliberately unsupported: an alpha channel makes "is this readable" depend on what the
 * colour is composited over, which is a question this validator cannot answer from the value.
 *
 * This is a mirror of the server's `parseHexHSL`, and it is one of the things the parity test
 * cannot verify by comparing tables — so it is exercised directly, against the same colours the
 * server's tests use. A divergence here would mean the panel greys out a colour the server
 * accepts, or offers one it refuses.
 */
export function parseHexHsl(value: string): { h: number; s: number; l: number } | null {
  const hex = value.trim().replace(/^#/, '').toLowerCase();

  let r: number;
  let g: number;
  let b: number;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (/^[0-9a-f]{6}$/.test(hex)) {
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
  } else {
    return null;
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic. The hue is arbitrary — HSL gives it 0 — which is exactly why the cold-hue rule
    // has a saturation floor. Without it, a neutral grey would be judged "cold" on a hue it does
    // not meaningfully have.
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = 60 * (((g - b) / d) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / d + 2);
  } else {
    h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;

  return { h, s, l };
}

/** Convert a page margin to millimetres, or `null` if it is not a length the server accepts. */
export function pageMarginToMillimetres(value: string): number | null {
  const match = PAGE_MARGIN_PATTERN.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return amount * UNIT_TO_MM[match[2]];
}

/**
 * Validate one presentation value, returning the first problem or `null`.
 *
 * # Why this duplicates the server's validation
 *
 * The server is the authority and re-validates everything — this is convenience, so the user is
 * told before a round trip. It is not enforcement, and it must not be treated as such: any path
 * that skips this function is still safe, because the server would refuse the write.
 *
 * # Why the messages are not the server's messages
 *
 * Some are close, and they should be, but the goal is a message that makes sense next to the
 * control the user is touching. The server's message arrives with a field name attached and
 * describes the same rule; a user who somehow gets past this check sees a message that is
 * consistent in meaning, if not word for word.
 *
 * The order of the checks matches the server's, so the first problem reported is the topmost
 * control on screen.
 */
export function validatePresentation(value: ResumePresentation): PresentationProblem | null {
  const limits = PRESENTATION_BOUNDS;

  if (!containsString(PRESENTATION_TEMPLATES as readonly string[], value.template)) {
    return { field: 'template', message: '不支持的模板，请重新选择' };
  }

  const colourProblem = validateAccentColor(value.accentColor);
  if (colourProblem) return colourProblem;

  if (!containsString(PRESENTATION_FONT_FAMILIES as readonly string[], value.fontFamily)) {
    return { field: 'fontFamily', message: '不支持的字体，请重新选择' };
  }

  if (
    !Number.isFinite(value.fontScale) ||
    value.fontScale < limits.minFontScale ||
    value.fontScale > limits.maxFontScale
  ) {
    return {
      field: 'fontScale',
      message: `字号缩放须在 ${limits.minFontScale}–${limits.maxFontScale} 之间`,
    };
  }

  if (
    !Number.isFinite(value.lineHeight) ||
    value.lineHeight < limits.minLineHeight ||
    value.lineHeight > limits.maxLineHeight
  ) {
    return {
      field: 'lineHeight',
      message: `行距须在 ${limits.minLineHeight}–${limits.maxLineHeight} 之间`,
    };
  }

  const marginMM = pageMarginToMillimetres(value.pageMargin);
  if (marginMM === null) {
    return {
      field: 'pageMargin',
      message: `页边距须是 ${limits.minPageMarginMM}–${limits.maxPageMarginMM}mm 之间带单位的长度（mm/cm/in/pt）`,
    };
  }
  if (marginMM < limits.minPageMarginMM || marginMM > limits.maxPageMarginMM) {
    return {
      field: 'pageMargin',
      message: `页边距须在 ${limits.minPageMarginMM}–${limits.maxPageMarginMM}mm 之间`,
    };
  }

  if (value.sectionOrder.length === 0) {
    return { field: 'sectionOrder', message: '章节顺序不能为空，至少保留一个章节' };
  }
  if (value.sectionOrder.length > limits.maxSectionOrderEntries) {
    return {
      field: 'sectionOrder',
      message: `章节数量不能超过 ${limits.maxSectionOrderEntries} 个`,
    };
  }
  const seen = new Set<string>();
  for (let i = 0; i < value.sectionOrder.length; i++) {
    const name = value.sectionOrder[i];
    if (name.trim() === '') {
      return { field: `sectionOrder[${i}]`, message: '章节名不能为空' };
    }
    if ([...name].length > limits.maxSectionNameLength) {
      return {
        field: `sectionOrder[${i}]`,
        message: `章节名不能超过 ${limits.maxSectionNameLength} 字`,
      };
    }
    if (seen.has(name)) {
      return { field: `sectionOrder[${i}]`, message: `章节「${name}」重复了` };
    }
    seen.add(name);
  }

  if (value.photo.enabled && (value.photo.path === null || value.photo.path.trim() === '')) {
    return { field: 'photo.path', message: '启用证件照后需要先上传照片' };
  }

  return null;
}

/**
 * Validate an accent colour against the design rules, then against the palette.
 *
 * # Why the design rule is reported first
 *
 * When a colour is both cold and off-palette, the design rule is the actionable half: 「请选暖色」
 * tells the user what to do, while 「不在可选范围内」 does not. `AGENTS.md` forbids cold colours and
 * pure black outright, so a user who picked blue has made a mistake worth naming — not merely
 * chosen something absent from a list.
 *
 * The lightness floor is what rejects pure black, and it is deliberately a floor rather than an
 * equality test: `#0a0a0a` is the same mistake with a fig leaf, and `#292524` (stone-800, the
 * design system's black replacement for *text*) is also below it, because at L ≈ 0.15 it reads as
 * black. A string comparison against `#000000` would accept both.
 *
 * Exported for testing; prefer {@link validatePresentation}.
 */
export function validateAccentColor(value: string): PresentationProblem | null {
  const hex = value.trim().toLowerCase();
  if (hex === '') {
    return { field: 'accentColor', message: '主色不能为空' };
  }

  if (containsString(PRESENTATION_ACCENT_COLORS, hex)) return null;

  const hsl = parseHexHsl(hex);
  if (hsl) {
    const limits = PRESENTATION_BOUNDS;
    // The saturation floor travels with the hue test. Above it the colour has a real hue; below
    // it the colour is neutral and its hue is arbitrary.
    if (
      hsl.h >= limits.coldHueMinInclusive &&
      hsl.h < limits.coldHueMaxExclusive &&
      hsl.s > limits.coldSaturationFloor
    ) {
      return {
        field: 'accentColor',
        message: '不允许使用冷色（蓝/紫/青），请选暖色或中性色',
      };
    }
    if (hsl.l < limits.minAccentLightness) {
      return {
        field: 'accentColor',
        message: '不允许使用纯黑或近黑色，请选 stone-800（#292524）一类暖黑或更亮的颜色',
      };
    }
    if (hsl.l > limits.maxAccentLightness) {
      return { field: 'accentColor', message: '主色过浅会看不清，请选深一些的颜色' };
    }
  }

  return {
    field: 'accentColor',
    message: `未知主色 ${value}，请从可选颜色中选择`,
  };
}

/**
 * Fill a partial or absent stored value out to a complete, usable presentation.
 *
 * # Lenient on purpose
 *
 * Every caller of this function is loading a resume to render, list or edit, and the column is
 * nullable — so the *normal* input is "nothing stored". Raising would turn one resume with an odd
 * style value into a resume that cannot be opened, which is a far worse outcome than rendering it
 * with defaults.
 *
 * # What is filled and what is kept
 *
 * Absent fields become the default. An out-of-range number becomes the default, because
 * `fontScale: 0` is not a preference — it is an unreadable page, and there is no defensible way
 * to honour it.
 *
 * An **off-palette colour is kept**, though, and the asymmetry is deliberate. Silently repainting
 * a resume because the palette changed is worse than showing the user the colour they chose; they
 * will meet the validator's complaint the next time they open the panel, which is the right place
 * for it. The server's `NormalisePresentation` makes the same choice.
 *
 * # `defaults`: why this takes template tokens (ticket 20)
 *
 * A template supplies styling defaults (ADR-0008), and they have to reach the page *somewhere*.
 * The obvious place — merging them in at the call site — does not work, because this function
 * already fills every field: by the time a caller has a `ResumePresentation`, nothing is absent
 * and a merge has nothing left to fill. A template's accent would be dead code that looked live.
 *
 * So the fallback is a parameter. `defaults` replaces `DEFAULT_PRESENTATION` as the value used
 * when a field is absent or unusable. That is precisely where a template's opinion belongs: the
 * template is the baseline, and the user's stored value overrides it field by field (ADR-0008 §1).
 * Everything else about the function is unchanged, including validation — a token that is out of
 * range falls back to `DEFAULT_PRESENTATION`'s value for that field, not to the token.
 *
 * `undefined` means "no template", and the behaviour is then identical to before ticket 20.
 */
export function presentationFromRecord(
  value: unknown,
  defaults?: PresentationDefaults
): ResumePresentation {
  const raw = (value ?? {}) as Partial<ResumePresentation>;
  const limits = PRESENTATION_BOUNDS;

  // The fallbacks, resolved once. `DEFAULT_PRESENTATION` is the baseline; a caller's `defaults`
  // win over it field by field. Spread rather than `??` per field so an explicit `0`/`''` in
  // `defaults` is honoured rather than treated as absent — the caller is code, not user input,
  // and it is not this function's job to second-guess it. `sectionOrder` and `photo` are spread
  // by reference; both are always read through a copy below, so no caller can mutate them.
  const base = defaults ? { ...DEFAULT_PRESENTATION, ...defaults } : DEFAULT_PRESENTATION;

  // A default's `sectionOrder` is only usable if it is a non-empty string array; a template that
  // supplied `[]` would otherwise render no sections at all, which looks like data loss.
  const baseSectionOrder =
    Array.isArray(base.sectionOrder) && base.sectionOrder.length > 0
      ? base.sectionOrder
      : DEFAULT_PRESENTATION.sectionOrder;

  // Only `enabled` is checked, deliberately. An earlier version also required `path` to be a string
  // and thereby discarded "this template wants a photo, the user has not picked one yet" — a state
  // that must survive, because the field's whole purpose is to let the user turn a template's photo
  // on and off. Dropping it silently made a template's photo preference unreachable. A template that
  // enables a photo with no path of its own inherits whatever photo the resume already had, and the
  // `photo` value returned below drops an enabled-but-pathless result rather than rendering a broken
  // image.
  const basePhoto =
    base.photo && base.photo.enabled === true ? base.photo : DEFAULT_PRESENTATION.photo;

  const template = containsString(PRESENTATION_TEMPLATES as readonly string[], raw.template)
    ? (raw.template as PresentationTemplate)
    : (base.template as PresentationTemplate);

  const fontFamily = containsString(PRESENTATION_FONT_FAMILIES as readonly string[], raw.fontFamily)
    ? (raw.fontFamily as PresentationFontFamily)
    : base.fontFamily;

  const fontScale =
    typeof raw.fontScale === 'number' &&
    Number.isFinite(raw.fontScale) &&
    raw.fontScale >= limits.minFontScale &&
    raw.fontScale <= limits.maxFontScale
      ? raw.fontScale
      : base.fontScale;

  const lineHeight =
    typeof raw.lineHeight === 'number' &&
    Number.isFinite(raw.lineHeight) &&
    raw.lineHeight >= limits.minLineHeight &&
    raw.lineHeight <= limits.maxLineHeight
      ? raw.lineHeight
      : base.lineHeight;

  // Validated and converted through millimetres rather than pattern-matched, so `1.8cm` survives.
  const pageMargin =
    typeof raw.pageMargin === 'string' && isWithinMarginBounds(raw.pageMargin)
      ? raw.pageMargin
      : base.pageMargin;

  const sectionOrder =
    Array.isArray(raw.sectionOrder) &&
    raw.sectionOrder.length > 0 &&
    raw.sectionOrder.length <= limits.maxSectionOrderEntries &&
    raw.sectionOrder.every((s) => typeof s === 'string')
      ? [...raw.sectionOrder]
      : [...baseSectionOrder];

  const photoEnabled = raw.photo?.enabled === true;
  const photoPath = typeof raw.photo?.path === 'string' && raw.photo.path.trim() !== ''
    ? raw.photo.path
    : null;

  return {
    // Always the version this build knows, never a value read from storage. The server tolerates
    // speech about a *higher* version only by refusing to read it at all, so echoing one back
    // would be claiming a shape this code cannot render — and the server would refuse the write
    // that carried it. The stored version is an upgrade marker, not a user preference.
    //
    // Not taken from `defaults` either: `PresentationDefaults` excludes it, because a template
    // claiming a storage shape is exactly the confusion this field exists to prevent.
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    template,
    // Kept as-is when it is a non-empty string, even if off-palette — see the doc comment.
    accentColor:
      typeof raw.accentColor === 'string' && raw.accentColor.trim() !== ''
        ? raw.accentColor
        : base.accentColor,
    fontFamily,
    fontScale,
    lineHeight,
    pageMargin,
    sectionOrder,
    // An enabled photo with no path would render a broken image, so it is dropped rather than
    // honoured. The resume still renders and the user can re-pick, which is the recoverable
    // choice. `basePhoto` has already been checked for the same defect.
    photo: {
      enabled: photoEnabled && photoPath !== null ? true : basePhoto.enabled,
      path: photoPath ?? basePhoto.path,
    },
  };
}

/**
 * Normalise the `presentation` payload from `GET /api/resumes/{id}` into this module's shape.
 *
 * # Why this exists as its own function
 *
 * The read route answers the generated proto message through `ctx.Result`, which marshals with
 * `protojson` — so the keys arrive **camelCase** (`accentColor`, `fontScale`), matching the
 * storage spellings this module uses. The server also has a second encoder in play
 * (`internal/server/http.go` replaces the default one with `encoding/json` over the generated
 * struct tags, which are snake_case) and that one is reached by any handler written with the
 * `writeJSON` helper.
 *
 * So this function accepts both spellings. The reason is not tidiness: a handler that reached
 * for the wrong encoder would send `accent_color` where this module expects `accentColor`, every
 * styling field would read as `undefined`, and the panel would show defaults with **no error
 * raised anywhere** — the exact failure that made the settings pages render blank for so long.
 * Two `??` operators are a cheap price for closing that off.
 *
 * A `null` or absent `photo.path` becomes `null`, not `''`: the two would otherwise be two
 * representations of "no photo" and every caller would have to handle both.
 */
export function presentationFromApi(value: unknown): ResumePresentation {
  if (value === null || value === undefined || typeof value !== 'object') {
    return presentationFromRecord(null);
  }
  const api = value as Record<string, unknown>;

  const photoRaw = (api.photo ?? null) as Record<string, unknown> | null;
  const photoPath = photoRaw?.path;

  return presentationFromRecord({
    template: api.template,
    accentColor: api.accentColor ?? api.accent_color,
    fontFamily: api.fontFamily ?? api.font_family,
    fontScale: api.fontScale ?? api.font_scale,
    lineHeight: api.lineHeight ?? api.line_height,
    pageMargin: api.pageMargin ?? api.page_margin,
    sectionOrder: api.sectionOrder ?? api.section_order,
    photo: {
      enabled: photoRaw?.enabled,
      path: typeof photoPath === 'string' && photoPath !== '' ? photoPath : null,
    },
  });
}

/**
 * Fold a reply's styling into the record it travelled with.
 *
 * # Why the record needs folding at all
 *
 * ADR-0004 puts presentation **beside** the record, not inside it: `ResumeInfo` has no styling field
 * (`api/resumevault/v1/resume.proto`, fields 1–23), and a read reply or `PATCH /presentation` answer
 * carries it as a sibling. The components read `resume.presentation` — `ResumeDisplay` and
 * `ResumePrintView` both do — and **no production code called `presentationFromApi`**, so the sibling
 * was dropped at the boundary and every stored style rendered as the product default: a resume saved
 * as 绿野通栏 opened in the ATS-safe template, with no error anywhere to say so.
 *
 * That silence is the reason this is a named function with its own test rather than one line at each
 * call site: `presentationFromRecord(undefined)` is a documented default, so the wrong answer looks
 * exactly like a resume that never chose a style.
 *
 * `presentationFromApi` accepts either key spelling, so the value can be handed over verbatim however
 * the server encoded it (see its note on the two encoders in play), and a `null`/absent value becomes
 * the default rather than a crash.
 */
export function resumeWithPresentation<T extends object>(
  record: T,
  replyPresentation: unknown
): T & { presentation: ResumePresentation } {
  // The cast is the point of the function: it *adds* the field, so requiring callers to already
  // declare it would be backwards — and a record type that declares only an optional
  // `presentation` is a weak type, which TypeScript refuses to match against a record that carries
  // other fields.
  const stored = (record as { presentation?: unknown }).presentation;
  return {
    ...record,
    presentation: presentationFromApi(replyPresentation ?? stored),
  };
}

/**
 * Build the request body for `PATCH /api/resumes/{id}/presentation`.
 *
 * Flattens the presentation alongside `version`, which is the shape the handler decodes: the
 * styling fields sit at the top level next to `version` rather than nested under a
 * `presentation` key. That is not an arbitrary choice — it makes the request body and the stored
 * column **the same object plus a version**, so the `DisallowUnknownFields` decoder on the server
 * rejects a misspelled styling key and a misspelled `version` with the same rule, and this module
 * cannot send a shape the server does not accept without the parity test noticing.
 */
export function presentationWriteBody(write: PresentationWrite): Record<string, unknown> {
  return { ...write.presentation, version: write.version };
}

/**
 * Whether two presentations differ in any way that would change what is stored.
 *
 * # Why a comparison rather than "always send"
 *
 * Firing a request because the user opened the panel and closed it advances `version` for no
 * reason, and every unnecessary version bump invalidates the token another tab is holding. So the
 * panel asks first. `sectionOrder` is compared element by element, since two arrays are never
 * `===` and a shallow comparison would report every value as changed.
 */
export function presentationsEqual(a: ResumePresentation, b: ResumePresentation): boolean {
  return (
    a.schemaVersion === b.schemaVersion &&
    a.template === b.template &&
    a.accentColor === b.accentColor &&
    a.fontFamily === b.fontFamily &&
    a.fontScale === b.fontScale &&
    a.lineHeight === b.lineHeight &&
    a.pageMargin === b.pageMargin &&
    a.photo.enabled === b.photo.enabled &&
    a.photo.path === b.photo.path &&
    a.sectionOrder.length === b.sectionOrder.length &&
    a.sectionOrder.every((name, i) => name === b.sectionOrder[i])
  );
}

/**
 * Parse the server's `INVALID_PRESENTATION` response into a field and a message.
 *
 * The server answers a refused styling value with `400 INVALID_PRESENTATION` and a message of the
 * form `展示态字段 <field> 不合法：<reason>`, or the bare reason when the problem is not one field.
 * This recovers the field so the panel can mark the offending control rather than showing a
 * banner with no location.
 *
 * Returns `null` when the error is not a presentation validation failure, so a caller can fall
 * back to a generic message instead of mislabelling a 409 or a 500 as a styling problem.
 */
export function parsePresentationError(
  error: unknown
): { field: string; message: string } | null {
  if (typeof error !== 'string') return null;
  const marker = '展示态字段 ';
  const start = error.indexOf(marker);
  if (start < 0) return null;

  const rest = error.slice(start + marker.length);
  const sep = rest.indexOf('不合法：');
  if (sep < 0) return null;

  return { field: rest.slice(0, sep).trim(), message: rest.slice(sep + '不合法：'.length).trim() };
}

/** The Chinese label for a palette colour, falling back to the hex for a non-member. */
export function accentLabel(hex: string): string {
  const normalised = hex.trim().toLowerCase();
  return PRESENTATION_PALETTE.find((c) => c.hex === normalised)?.label ?? hex;
}

/**
 * Whether a margin string is a legal length within the server's bounds.
 *
 * Shares {@link pageMarginToMillimetres} with the validator on purpose: a second regex here would
 * be a second answer to "what is a valid margin", and the panel would grey out a value the
 * validator accepts.
 */
function isWithinMarginBounds(value: string): boolean {
  const mm = pageMarginToMillimetres(value);
  if (mm === null) return false;
  return mm >= PRESENTATION_BOUNDS.minPageMarginMM && mm <= PRESENTATION_BOUNDS.maxPageMarginMM;
}

/** Membership by value, mirroring the server's `containsString`. */
function containsString(haystack: readonly string[], needle: unknown): boolean {
  return typeof needle === 'string' && haystack.includes(needle);
}
