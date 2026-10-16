/**
 * Presentation state → concrete CSS values (ticket 20, ADR-0008).
 *
 * # Why a separate step rather than reading `presentation` in the renderer
 *
 * A renderer needs CSS values, not tokens. `fontFamily: 'serif'` is not something a browser
 * understands; it has to become a font stack. `fontScale: 1.2` is a multiplier, not a size.
 * `pageMargin: '18mm'` is a length in units the screen cannot use directly.
 *
 * Doing that conversion in `buildTheme` means:
 *
 *   - the conversions exist **once**, so two renderers cannot disagree about what `serif` means;
 *   - a renderer is testable against a plain object instead of against the token vocabulary;
 *   - the arithmetic (scale × base size, millimetres → pixels) is in one place to be reasoned
 *     about, which matters because it decides how a resume looks on paper.
 *
 * # Every value here is a literal string
 *
 * Not a Tailwind class and not a `var(--...)`. This is forced by the print path, and it is worth
 * restating because it is the constraint most likely to be violated by accident:
 *
 *   - The print document is a **self-contained iframe**. `buildPrintDocument` writes only
 *     `PRINT_RESUME_CSS` into its `<head>` (print-resume.ts), so no Tailwind stylesheet exists
 *     inside it. A class name there is inert text.
 *   - ADR-0001's phase 4 renderer (headless Chromium or Forme) does not support CSS custom
 *     properties at all.
 *
 * Before ticket 20 the print view already half-honoured this — `ResumePrintView` was all inline
 * styles — but its font stack was `var(--font-serif, "Noto Serif SC", Georgia, serif)`, and the
 * iframe has no `--font-serif`, so the PDF always used the fallback. That worked by luck. The
 * stack is now written out literally, so it does not depend on a variable that is not there.
 *
 * @see ResumeTheme for the shape renderers consume.
 */

import { A4_HEIGHT_PX, A4_WIDTH_PX, mmToPx } from '@/lib/print-resume';
import {
  pageMarginToMillimetres,
  type PresentationFontFamily,
  type ResumePresentation,
} from '@/lib/resume-presentation';

/**
 * The resolved styling a renderer draws with.
 *
 * Deliberately **flat strings with units**, ready to drop into a `style` attribute. Numbers
 * without units were rejected: React appends `px` to a bare number for most properties but not
 * for `lineHeight`, `fontWeight` or `zIndex`, so a theme of numbers would be a theme where three
 * properties silently mean something different from the rest.
 */
export interface ResumeTheme {
  /** A complete CSS font stack, not a family name. */
  fontFamily: string;
  /** Root size in px, already scaled. */
  baseFontSize: string;
  /** Unitless multiplier, as CSS `line-height` expects. */
  lineHeight: string;
  /** The accent, as a literal hex. */
  accentColor: string;
  /**
   * The user's scale multiplier, carried through so a renderer can scale anything it introduces
   * itself. Existing sizes go through `scaledSize`, which applies this to a known ratio.
   */
  fontScale: number;
  /** Page margin as a CSS length (`18mm`). */
  pageMargin: string;
  /**
   * The page margin in pixels, for on-screen preview.
   *
   * Derived through `mmToPx` rather than hard-coded so the preview inset and the printed `@page`
   * margin cannot drift — they are the same physical distance and must look like it.
   */
  pageMarginPx: string;
  /** The printable content box, for anything that has to measure itself. */
  contentBox: { width: number; height: number };
}

/**
 * Base font size in px at `fontScale: 1`.
 *
 * 14px is not a new opinion: it is what `ResumePrintView` hard-coded, and `DEFAULT_PRESENTATION`
 * has `fontScale: 1`, so keeping the base at 14 means an existing resume renders at exactly the
 * size it did before this refactor. Choosing anything else would have silently resized every
 * resume in the product the first time this shipped.
 */
export const BASE_FONT_SIZE_PX = 14;

/** Font stacks. Written out literally — see the module note about CSS variables. */
const FONT_STACKS: Record<PresentationFontFamily, string> = {
  // The stack `ResumePrintView` used, minus the `var()` it could never resolve inside the print
  // iframe. Noto Serif SC is loaded by next/font in the app shell, so on screen this resolves to
  // the real face; in the phase 4 render service it depends on the font being installed or
  // embedded, which ADR-0008 requires anyway.
  serif: '"Noto Serif SC", Georgia, "Times New Roman", serif',
  // Mirrors `--font-sans` in globals.css, again without the variable.
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
};

/**
 * Every size in the document, expressed as a multiple of the base size.
 *
 * Derived from the values `ResumePrintView` hard-coded, so at `fontScale: 1` a resume renders at
 * exactly the sizes it did before this refactor. 14 is `BASE_FONT_SIZE_PX`, so e.g. the name's
 * 32px becomes `32 / 14`.
 *
 * These are multipliers rather than pixel sizes because that is what makes `fontScale` work: the
 * user asks for everything 15% larger and each ratio is applied to the scaled base. Storing them
 * as pixels would mean multiplying each one by the scale at every call site, which is the same
 * arithmetic written out repeatedly and bound to be got wrong once.
 */
export const SIZE_SCALES = {
  /** The candidate's name (`h1`). */
  name: 32 / 14,
  /** The candidate's headline. */
  title: 16 / 14,
  /** A section heading (`h2`). */
  section: 18 / 14,
  /** An entry heading — a job title or degree (`h3`). */
  entry: 15 / 14,
  /** Body prose and entry details. */
  body: 1,
  /** Dates, chips and other secondary text. */
  small: 13 / 14,
  /** An entry's subtitle. */
  subtitle: 1,
} as const;

/** A scaled size in px, as a CSS length. */
export function scaledSize(theme: ResumeTheme, scale: number): string {
  return `${Math.round(BASE_FONT_SIZE_PX * theme.fontScale * scale * 100) / 100}px`;
}

/**
 * Build the theme for a presentation.
 *
 * `presentation` must already be resolved — the template's tokens merged with the user's stored
 * values by `resolveTemplate`. This function does not consult a template; it only converts.
 *
 * Every branch is total: an unparseable `pageMargin` falls back to the default rather than
 * producing `NaNpx`, because this feeds a render path and a broken margin would push content off
 * the page. `presentationFromRecord` has already validated the value, so the fallback is a second
 * line of defence rather than the primary one.
 */
export function buildTheme(presentation: ResumePresentation): ResumeTheme {
  const marginMm = pageMarginToMillimetres(presentation.pageMargin);

  // A resume with no margin at all is a resume printed to the paper edge. The bound is enforced
  // upstream; this is the guard for a value that got here some other way.
  const hasUsableMargin = marginMm !== null && marginMm > 0;
  const safeMarginMm = hasUsableMargin ? (marginMm as number) : 18;
  const safeMargin = hasUsableMargin ? presentation.pageMargin.trim() : '18mm';

  return {
    fontFamily: FONT_STACKS[presentation.fontFamily] ?? FONT_STACKS.serif,
    baseFontSize: `${round(BASE_FONT_SIZE_PX * presentation.fontScale)}px`,
    lineHeight: String(presentation.lineHeight),
    accentColor: presentation.accentColor,
    // The multiplier itself, so a renderer can scale anything it introduces without having to
    // know the base. Sizes that exist today go through `scaledSize`, which is the same value
    // applied to a known ratio.
    fontScale: presentation.fontScale,
    pageMargin: safeMargin,
    pageMarginPx: `${round(mmToPx(safeMarginMm))}px`,
    contentBox: contentBoxFor(safeMarginMm),
  };
}

/**
 * The A4 content box in CSS pixels for a margin in millimetres.
 *
 * A thin wrapper over `a4ContentBox` that exists to keep this module's callers from importing two
 * places for their geometry. The arithmetic lives in `print-resume.ts` beside the `@page` rule it
 * has to agree with.
 */
export function contentBoxFor(marginMm: number): { width: number; height: number } {
  return {
    width: Math.floor(A4_WIDTH_PX - 2 * mmToPx(marginMm)),
    height: Math.floor(A4_HEIGHT_PX - 2 * mmToPx(marginMm)),
  };
}

/** Two decimal places, which is finer than any sub-pixel difference a font engine resolves. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
