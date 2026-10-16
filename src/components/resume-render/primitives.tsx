/**
 * Shared layout primitives for resume renderers (ticket 20, ADR-0008).
 *
 * # Why these exist
 *
 * `ResumePrintView` and `ResumeDisplay` each implemented their own page shell, section heading and
 * entry markup — the same five ideas written twice, which is why changing a section heading's
 * spacing meant changing it in two files and remembering to. Their heading markup differed in
 * colour token, in whether it carried an icon, and in its spacing scale; nothing caught that.
 *
 * Renderers now build on these. A template chooses **arrangement** (one column or two, where the
 * photo goes, how sections are separated); it does not re-implement a heading.
 *
 * # These carry the DOM contract, deliberately
 *
 * Three hook classes are load-bearing for pagination and for the print stylesheet, and
 * `export-pdf.tsx` / `print-resume.ts` query or style them by name:
 *
 *   - `#resume-print-root` — the element `serializePrintRoot` reads and `PRINT_RESUME_CSS` resizes
 *   - `.resume-section-heading` — `break-after: avoid`, so a heading is not orphaned at a page foot
 *   - `.resume-entry` — `break-inside: avoid` and the `orphans`/`widows` rule, so a job entry is
 *     not split across pages
 *
 * Putting them here rather than in each renderer is the point. A hand-written renderer that
 * forgot `resume-entry` would still produce a PDF; it would just split job entries across pages,
 * intermittently, only for resumes long enough to paginate. That is the kind of defect that
 * reaches a user's job application. A primitive cannot forget.
 *
 * # Every value is an inline literal — see `resume-template-theme.ts`
 *
 * No Tailwind classes and no CSS variables. The print document is a self-contained iframe with
 * only `PRINT_RESUME_CSS` in it, where a class name is inert text.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { ResumeSection, ResumeSectionItem } from '@/lib/resume-model';
import { SIZE_SCALES, scaledSize, type ResumeTheme } from '@/lib/resume-template-theme';

/**
 * The page.
 *
 * `mode` decides two things that genuinely differ between screen and paper, and cannot be
 * expressed as one style:
 *
 *   - **Width.** On screen the page is a fixed 794px column, so the preview is a truthful
 *     impression of A4 at 96dpi. On paper the page box supplies the width and a fixed 794px would
 *     overflow it.
 *   - **Padding.** On screen the padding *is* the page margin, because there is no `@page` rule.
 *     On paper `@page` already indents the content, so keeping the padding would indent twice.
 *
 * `PRINT_RESUME_CSS` also forces width/padding on `#resume-print-root`, so the print values here
 * are belt-and-braces: it means a renderer is correct even if that stylesheet is not applied,
 * which is exactly the case in a unit test.
 */
export function ResumePage({
  theme,
  mode,
  children,
}: {
  theme: ResumeTheme;
  mode: 'print' | 'screen';
  children: ReactNode;
}) {
  const isPrint = mode === 'print';

  const style: CSSProperties = {
    width: isPrint ? '100%' : `${theme.contentBox.width}px`,
    minHeight: isPrint ? undefined : `${theme.contentBox.height}px`,
    padding: isPrint ? 0 : theme.pageMarginPx,
    // Paper is white even though the app's surface is warm cream: a resume is printed, and a
    // tinted background costs ink while rendering unpredictably on a grayscale printer.
    background: '#ffffff',
    color: '#292524',
    fontFamily: theme.fontFamily,
    fontSize: theme.baseFontSize,
    lineHeight: theme.lineHeight,
    boxSizing: 'border-box',
  };

  return (
    <div id="resume-print-root" style={style}>
      {children}
    </div>
  );
}

/**
 * The candidate's name, title and contact details.
 *
 * `data-print-role="header"` is read by `export-pdf.tsx` to keep the header as its own measured
 * block rather than letting it be merged into the first section.
 *
 * `align` exists because it is a real template difference — a centred header and a left-aligned
 * one are visibly different resumes — and it is one prop rather than two wrappers.
 */
export function ResumeHeader({
  align = 'center',
  children,
}: {
  align?: 'center' | 'left';
  children: ReactNode;
}) {
  return (
    <header
      data-print-role="header"
      style={{
        textAlign: align,
        marginBottom: '32px',
      }}
    >
      {children}
    </header>
  );
}

/**
 * The name. The largest thing on the page, so its scale is theme-driven rather than a literal.
 *
 * `color` is a parameter for one reason: a template whose header is a coloured block reverses the
 * name out of it, and the only alternatives were a second `<h1>` in that renderer — a second place
 * for the type scale, the letter-spacing and the `h1` structure to drift — or a token for a colour
 * that exists only inside that block. It defaults to the page's ink so every existing template
 * renders byte-identically.
 */
export function ResumeName({
  theme,
  color = '#292524',
  children,
}: {
  theme: ResumeTheme;
  color?: string;
  children: ReactNode;
}) {
  return (
    <h1
      style={{
        fontSize: scaledSize(theme, SIZE_SCALES.name),
        fontWeight: 700,
        letterSpacing: '-0.02em',
        margin: '0 0 6px 0',
        color,
      }}
    >
      {children}
    </h1>
  );
}

/**
 * The candidate's headline (`求职意向` / job title).
 *
 * `color` defaults to the accent — the accent-coloured headline is this primitive's original design
 * — and exists for the same reason as {@link ResumeName}'s: a coloured header block cannot show
 * accent-on-accent text, so the template supplies a legible tone instead of re-implementing the
 * element.
 */
export function ResumeTitle({
  theme,
  color,
  children,
}: {
  theme: ResumeTheme;
  color?: string;
  children: ReactNode;
}) {
  return (
    <p
      style={{
        fontSize: scaledSize(theme, SIZE_SCALES.title),
        fontWeight: 500,
        color: color ?? theme.accentColor,
        margin: '0 0 16px 0',
      }}
    >
      {children}
    </p>
  );
}

/**
 * A section: its heading and its body.
 *
 * `data-print-section` carries the section title so `export-pdf.tsx` can name the pages a section
 * spans. The heading is wrapped in `.resume-section-heading` and the whole group in nothing —
 * `print-resume.ts` adds the group when it paginates.
 *
 * `icon` is a slot rather than a boolean: a two-column design template puts an icon tile here and
 * an ATS-safe one passes nothing, and ADR-0008 is explicit that decoration is a per-template
 * decision with an ATS cost. The primitive supplies the heading; the template decides whether to
 * decorate it.
 *
 * # `headingVariant`
 *
 * `'rule'` (the default) is the plain heading: ink text with a hairline rule under it. `'accent-bar'`
 * is a design template's heading: the text moves into the accent colour and the rule becomes a short
 * vertical bar at the left edge. It is an option here rather than markup in the renderer because the
 * heading is exactly the element whose class and `data-`hooks the print path depends on, and a
 * second implementation is how one of them eventually stops emitting `resume-section-heading`.
 * Defaulting keeps every existing template byte-identical.
 */
export function ResumeSectionBlock({
  theme,
  section,
  children,
  icon,
  headingVariant = 'rule',
}: {
  theme: ResumeTheme;
  section: ResumeSection;
  children: ReactNode;
  icon?: ReactNode;
  headingVariant?: 'rule' | 'accent-bar';
}) {
  const accentBar = headingVariant === 'accent-bar';

  return (
    <section className="resume-section-block" data-print-section={section.title}>
      <div
        className="resume-section-heading"
        data-print-role="heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: icon ? '10px' : 0,
          marginBottom: '12px',
          borderBottom: accentBar ? undefined : `1px solid ${RULE}`,
          borderLeft: accentBar ? `3px solid ${theme.accentColor}` : undefined,
          paddingBottom: accentBar ? undefined : '8px',
          paddingLeft: accentBar ? '10px' : undefined,
        }}
      >
        {icon}
        <h2
          style={{
            fontSize: scaledSize(theme, SIZE_SCALES.section),
            fontWeight: 700,
            letterSpacing: '-0.01em',
            margin: 0,
            color: accentBar ? theme.accentColor : '#292524',
          }}
        >
          {section.title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** Section prose (the `关于我` paragraph). Rendered as plain text, not Markdown — see below. */
export function ResumeProse({ theme, children }: { theme: ResumeTheme; children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: scaledSize(theme, SIZE_SCALES.body),
        lineHeight: '1.7',
        color: MUTED,
        margin: '0 0 12px 0',
      }}
    >
      {children}
    </p>
  );
}

/**
 * One entry — a job, a degree, a project.
 *
 * This is the element `.resume-entry` exists for, and it must be its own pagination unit: a role
 * split across a page boundary is the most common way a resume looks broken. It may sit inside the
 * `ResumeEntryList` wrapper, which declares `data-print-flatten` so the walk descends through it;
 * an entry nested inside a wrapper that does *not* declare that becomes part of one unbreakable
 * block instead.
 *
 * `subtitleSeparator` is a template choice (`|` reads differently from `·`) and is a prop rather
 * than hardcoded because it is exactly the sort of small typographic decision a visual template
 * is for.
 */
export function ResumeEntry({
  theme,
  item,
  subtitleSeparator = '|',
}: {
  theme: ResumeTheme;
  item: ResumeSectionItem;
  subtitleSeparator?: string;
}) {
  return (
    <div className="resume-entry" style={{ paddingLeft: '4px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: scaledSize(theme, SIZE_SCALES.entry),
            color: '#292524',
          }}
        >
          {item.title}
          {item.subtitle ? (
            <span
              style={{
                marginLeft: '8px',
                fontWeight: 500,
                fontSize: scaledSize(theme, SIZE_SCALES.subtitle),
                color: theme.accentColor,
              }}
            >
              {subtitleSeparator} {item.subtitle}
            </span>
          ) : null}
        </span>
        {item.date ? (
          <span
            style={{
              fontSize: scaledSize(theme, SIZE_SCALES.small),
              // The lighter of the two greys the old components used. `ResumeDisplay` used
              // --default-500 for this and `ResumePrintView` used --default-400, so the date was a
              // different shade on screen and on paper. One value now; this is the print one,
              // because print has less contrast tolerance.
              color: DATE_MUTED,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {item.date}
          </span>
        ) : null}
      </div>
      {item.details.length > 0 ? (
        <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
          {item.details.map((detail, i) => (
            <li
              key={i}
              style={{
                fontSize: scaledSize(theme, SIZE_SCALES.small),
                lineHeight: '1.7',
                color: MUTED,
                marginBottom: '2px',
              }}
            >
              {detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The items container.
 *
 * `data-print-flatten` is load-bearing, not decoration. Pagination walks the print DOM and treats
 * each element it meets as one indivisible block, so a wrapper that groups the entries would make a
 * whole work-history section unbreakable — the section could then never span two pages, and a long
 * one would occupy a page by itself. The marker says "this element exists only to arrange its
 * children; descend into it". See `flattenPrintFlow` in `export-pdf.tsx`.
 *
 * The `gap` here is for the on-screen preview. On paper the same spacing comes from the
 * `.resume-entry + .resume-entry` rule in `PRINT_RESUME_CSS`, because a flex `gap` contributes
 * nothing to the height of an individual entry and pagination measures entries, not this wrapper.
 */
export function ResumeEntryList({ gap = '14px', children }: { gap?: string; children: ReactNode }) {
  return (
    <div data-print-flatten="" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {children}
    </div>
  );
}

/** One skill chip. */
export function ResumeSkillChip({ theme, children }: { theme: ResumeTheme; children: ReactNode }) {
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: '8px',
        fontSize: scaledSize(theme, SIZE_SCALES.small),
        fontWeight: 500,
        border: `1px solid ${RULE}`,
        background: '#f9fafb',
        color: '#44403c',
      }}
    >
      {children}
    </span>
  );
}

/**
 * The skills row.
 *
 * Marked transparent for the same reason as `ResumeEntryList`: a wrapped chip row must be able to
 * break across a page boundary rather than being one block that cannot. The `gap` stays because a
 * wrapping row's spacing genuinely belongs to the container — unlike a stack, there is no
 * "next sibling" relationship to hang a margin on.
 */
export function ResumeSkillList({ children }: { children: ReactNode }) {
  return (
    <div data-print-flatten="" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {children}
    </div>
  );
}

/**
 * A horizontal rule between the header and the body.
 *
 * A component rather than a bare `<hr style>` because the colour and thickness are part of the
 * page's visual language and every template wants the same one. A template that wants no rule
 * simply does not render it.
 */
export function ResumeDivider({ marginBottom = '28px' }: { marginBottom?: string }) {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: `1.5px solid ${RULE}`,
        margin: `0 0 ${marginBottom} 0`,
      }}
    />
  );
}

/**
 * The section stack. `gap` is the vertical rhythm, which templates vary.
 *
 * This wrapper matters more than the other two, because it is the print root's only child apart from
 * the header and the divider. If the walk measured it as a block, the **entire resume** would be one
 * indivisible unit: no page breaks, one physical sheet, and an oversized-block warning. The
 * `data-print-flatten` marker is what makes the walk step through it to the sections. See
 * `flattenPrintFlow` in `export-pdf.tsx`.
 */
export function ResumeSectionList({
  gap = '24px',
  children,
}: {
  gap?: string;
  children: ReactNode;
}) {
  return (
    <div data-print-flatten="" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Shared literals
// ──────────────────────────────────────────────────────────────

/**
 * The rule colour, used for every divider and border.
 *
 * Was `#d6d3d1` (`--default-300`) on the print path and `--default-200` (`#e7e5e4`) on screen, so
 * the same resume had visibly different rules in the preview and the PDF. One value now: the
 * darker of the two, which survives printing.
 */
export const RULE = '#d6d3d1';

/**
 * Muted body text (`--default-500`, `#78716c`).
 *
 * A literal because the print iframe has no `--default-500`. Kept in sync with `globals.css` by
 * hand; if that token moves, this needs to move with it — the alternative was a `var()` that
 * resolves to nothing in the PDF, which is how the font stack silently fell back before.
 */
export const MUTED = '#78716c';

/** The date grey. See the note in `ResumeEntry`. */
export const DATE_MUTED = '#a8a29e';
