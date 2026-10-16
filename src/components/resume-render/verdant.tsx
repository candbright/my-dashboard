/**
 * The verdant banner template (ticket 48, ADR-0008).
 *
 * # What it is
 *
 * A single-column document whose header is a full-width block of the accent colour with the name,
 * the headline and the contacts reversed out of it, two low-opacity concentric rings bleeding off
 * its right edge, accent-coloured section headings behind a short vertical bar, and entries whose
 * date sits in its own right-aligned column. It is the first template in the registry that is
 * *loud*: the ATS-safe one is a document and the classic one is a document with a centred header,
 * and a gallery whose third card looked like either of those would be the ADR-0008 defect (「模板
 * 看起来不同，实际相同」) one card further along.
 *
 * # Why it is rated 中, against the written table
 *
 * `PARSEABILITY_CRITERIA`'s 「中」 row is 「单栏但含装饰元素」, and this template is single-column with
 * decoration: the heading bar, the accent-coloured headings and the rings. The 「低」 row's traits are
 * 双栏 · 图标 · 证件照 · 版式表格 — all structural — and this document has none of them: it is one
 * column, the marks do not stand in for text, there is no photo slot (@see the photo note below) and
 * there is no layout table.
 *
 * One clause deserves naming rather than dodging: `resume-template.ts`'s long-form 低 criterion also
 * mentions *text over a coloured panel where an image-based extractor may drop it*, and the contacts
 * here do sit on a panel. The clause describes text that **is** dropped; the panel is a CSS
 * background and the characters stay in the text layer, which the browser gate measures
 * (`文字层包含「lijing@example.com」`, `U+FFFD 0`) rather than assumes. What the panel really costs is
 * a *positional* signal, and that is a 中-sized cost — which is why the rating is 中 and not 高:
 *
 *   - the contacts are real DOM text, still labelled (`Email：…`), and they sit in the coloured header
 *     block rather than in body order — so a reader that reconstructs the document linearly has to
 *     trust the block's position to know these are the candidate's contact details;
 *   - the headings are decorated, not replaced: they are still `h2` elements inside
 *     `.resume-section-heading` with their text intact, so section boundaries are still recoverable.
 *
 * A user choosing this template is trading a screening margin for a look, and the badge says so.
 *
 * # The photo, and why it does not change the rating
 *
 * `photo.enabled` is honoured through the shared `resolvePhoto` (ADR-0008 §「`photo` 是合并，不是二选一」:
 * a user's "I turned the photo on" survives a template that says nothing about photos). When it is
 * on and a source resolves, a portrait appears at the right of the banner, framed in the same warm
 * cream; when it is off or source-less, the render is exactly the render above.
 *
 * The 低 row's 证件照 trait is about a template that **builds a photo slot in** — the box is part of
 * the layout and the document is designed around a face. This template has no slot: nothing is
 * reserved, no frame is drawn and no space is left empty when the photo is off, and the structure the
 * parser meets is unchanged when it is on (one column, same order, same headings). So the rating
 * stays 中 either way, and `TEMPLATE_METADATA` says the same thing where a reader looks for it.
 *
 * # What it deliberately does not do
 *
 * **No `<ResumeDivider />`.** The banner's own lower edge is the rule; a hairline a few pixels under
 * a solid colour block reads as a double border.
 *
 * # The pagination contract, which is not negotiable here
 *
 * The sections sit in `ResumeSectionList` and the entries in `ResumeEntryList`, and both declare
 * `data-print-flatten` — so `flattenPrintFlow` descends through them and the unit of pagination
 * stays the **entry**. The banner is `ResumeHeader`'s child, so it is lifted out as the repeating
 * header rather than measured as content, and its rings are absolutely positioned: they contribute
 * nothing to the block's height, so they can never change the page arithmetic.
 */

import { contactEntries, resolvePhoto } from '@/components/resume-render/contact';
import { ResumeSectionBody } from '@/components/resume-render/section-body';
import {
  DATE_MUTED,
  MUTED,
  ResumeHeader,
  ResumeName,
  ResumePage,
  ResumeSectionBlock,
  ResumeSectionList,
  ResumeTitle,
} from '@/components/resume-render/primitives';
import { buildTheme, scaledSize, SIZE_SCALES, type ResumeTheme } from '@/lib/resume-template-theme';
import type { ResumeSectionItem } from '@/lib/resume-model';
import type { TemplateRendererInput } from '@/lib/resume-template';

export function VerdantResume({ content, metadata, presentation, mode, fallbackTitle }: TemplateRendererInput) {
  const theme = buildTheme(presentation);
  const name = metadata.frontmatter.name || fallbackTitle;
  // The photo is the user's setting, not this template's: `resolvePhoto` returns a source only when
  // `photo.enabled` is on, so a resume that never turned it on renders exactly the banner without one.
  const photo = resolvePhoto(metadata.frontmatter, presentation);

  return (
    <ResumePage theme={theme} mode={mode}>
      <ResumeHeader align="left">
        <VerdantBanner
          theme={theme}
          name={name}
          title={metadata.frontmatter.title}
          metadata={metadata}
          photo={photo}
        />
      </ResumeHeader>

      <ResumeSectionList gap="24px">
        {content.sections.map((section) => (
          <ResumeSectionBlock
            key={section.title}
            theme={theme}
            section={section}
            headingVariant="accent-bar"
          >
            <ResumeSectionBody
              section={section}
              theme={theme}
              renderEntry={(item, key) => <VerdantEntry key={key} theme={theme} item={item} />}
            />
          </ResumeSectionBlock>
        ))}
      </ResumeSectionList>
    </ResumePage>
  );
}

// ──────────────────────────────────────────────────────────────
// The banner
// ──────────────────────────────────────────────────────────────

/**
 * The light arm of the banner's ink: the palette's warm cream, never `#ffffff`.
 *
 * `AGENTS.md` forbids pure white outright — it reads as a colder design beside the earth tones — so
 * the lightest warm value in the system is the light foreground, and {@link bannerInk} uses it
 * wherever it actually wins.
 */
const WARM_CREAM = '#faf6f1';

/**
 * The dark arm of the banner's ink: stone-800, the design system's replacement for black.
 *
 * Never `#000000`: the palette rules reject pure black, and a pure-black name on a warm block reads
 * as a printing error rather than as ink.
 */
const STONE_INK = '#292524';

/** WCAG relative luminance of a `#rgb`/`#rrggbb` value, or `null` when it is not a colour. */
export function relativeLuminance(hex: string): number | null {
  const value = hex.trim().replace(/^#/, '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;

  const channel = (offset: number): number => {
    const raw = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two colours. Returns 1 for an unparseable value rather than throwing. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return 1;
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The banner's ink: whichever of the two sanctioned warm values contrasts more with the accent.
 *
 * # Why this is arithmetic and not a fixed colour
 *
 * The accent is a user choice from a six-entry palette plus whatever an older record stored, so a
 * *fixed* light foreground is legible on some accents and unreadable on others. Measured against the
 * closed palette, warm cream scores 8.73:1 on 石棕 but 2.10:1 on 暖棕; the ceiling for *any* light
 * foreground on `#d4a373` is 2.26:1 (that is what pure white scores), so no light value can be
 * legible there and the earlier text-shadow was compensating for a constraint that should not exist.
 *
 * Choosing between the two arms fixes it without inventing a seventh colour:
 *
 *   石棕 `#5c4033` 8.73 · 森林绿 `#557a46` 4.58 · 暗红 `#a64b45` 5.26      → warm cream
 *   暖棕 `#d4a373` 6.71 · 鼠尾草绿 `#8b9d77` 5.19 · 琥珀 `#c28a2e` 5.03   → stone-800
 *
 * The **worst case of the branch is 4.58:1** (森林绿, where cream wins), i.e. every palette colour
 * clears WCAG AA for normal text, and the two arms are both reachable — which is asserted as
 * arithmetic in `verdant.test.ts` rather than left to this comment.
 *
 * A hard-coded table of six hexes would be shorter, and would be a rule about the palette's *current*
 * contents baked into a renderer: a seventh colour, or a record holding an off-palette value that
 * `presentationFromRecord` deliberately keeps, would fall through it silently. Two colours and one
 * comparison cannot.
 */
export function bannerInk(accentHex: string): string {
  return contrastRatio(accentHex, WARM_CREAM) >= contrastRatio(accentHex, STONE_INK)
    ? WARM_CREAM
    : STONE_INK;
}

/**
 * The width of the band on the right of the banner that the rings live in, in CSS pixels.
 *
 * The rings are decoration and the text is not, so the separation is done by **reserving space**
 * rather than by hoping: the banner's right padding is this plus a margin, and the text therefore
 * cannot be laid out under the rings at any content length or font scale. Rings that merely sat
 * behind the text at a low opacity would still be "decorative", but a name printed across them stops
 * reading as a name — and the requirement is that they never overlap the text.
 */
const RING_BAND_PX = 150;

/** The ring geometry, in the SVG's own coordinate space. */
const RING_SIZE_PX = 220;

/** Where the rings stick out past the banner's right edge, so they read as arcs rather than circles. */
const RING_OVERHANG_PX = 72;

/**
 * Two concentric rings, drawn as one inline SVG.
 *
 * Literal `stroke` values and a literal opacity rather than a token or a colour-mixed value: the fill
 * behind them is the user's accent, so a ring colour derived from it would be invisible on exactly
 * the accents where a little texture is most wanted, and the print iframe has no CSS variable to read.
 * Warm cream at 16% / 11% reads as a watermark on every palette entry, which is what "restrained" and
 * "hand-made, not tech" mean here: no glow, no scan lines, no second hue.
 *
 * The stroke stays warm cream even on the accents where the *text* is stone-800 ({@link bannerInk}).
 * Deliberate: the ticket asks for literal stroke values, and the decorative layer should read as
 * quieter than the text, not as a second voice competing with it.
 *
 * Absolutely positioned inside the relatively-positioned banner, so it is out of flow: it contributes
 * zero height, and `measureBlockHeight` therefore measures the banner's text and padding only. The
 * banner clips it (`overflow: hidden`), which is what turns the right-hand parts of the circles into
 * the arcs that bleed off the edge. With a photo the same SVG is a child of the text column instead,
 * which clips it the same way one column earlier — see {@link VerdantBanner}.
 */
function BannerRings() {
  const centre = RING_SIZE_PX / 2;

  return (
    <svg
      width={RING_SIZE_PX}
      height={RING_SIZE_PX}
      viewBox={`0 0 ${RING_SIZE_PX} ${RING_SIZE_PX}`}
      // Decoration: every fact in the banner is already text, and a screen reader announcing a shape
      // is noise. `focusable` is the IE-era SVG tab-stop opt-out that survives in Chromium.
      aria-hidden="true"
      focusable="false"
      style={{
        position: 'absolute',
        top: '50%',
        right: `-${RING_OVERHANG_PX}px`,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
      }}
    >
      <circle
        cx={centre}
        cy={centre}
        r={104}
        fill="none"
        stroke={WARM_CREAM}
        strokeOpacity={0.16}
        strokeWidth={1.5}
      />
      <circle
        cx={centre}
        cy={centre}
        r={74}
        fill="none"
        stroke={WARM_CREAM}
        strokeOpacity={0.11}
        strokeWidth={1.5}
      />
    </svg>
  );
}

/**
 * The portrait, when the user has turned the photo on and a source resolves.
 *
 * Framed in the same warm cream the text uses, at a radius between the skill chip's 8px and the design
 * system's 32px card blob — a portrait is neither. Portrait proportions (3:4) rather than square or
 * circular: a circle crops the top of the head off, which is the mistake `classic.tsx` records in the
 * other direction for its own centred circle, and a square ID photo on a banner reads as a passport
 * scan. `flexShrink: 0` so the text column can never squeeze it.
 *
 * Existence is the only thing the layout responds to; there is no empty frame when the photo is off.
 */
function VerdantPortrait({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- self-contained print iframe with no image optimizer and no network guarantees, so next/image cannot serve it. Same reason as ats-safe.tsx.
    <img
      src={src}
      alt={alt}
      crossOrigin="anonymous"
      style={{
        width: '88px',
        height: '116px',
        objectFit: 'cover',
        borderRadius: '18px',
        border: `3px solid ${WARM_CREAM}`,
        flexShrink: 0,
        display: 'block',
      }}
    />
  );
}

/**
 * The colour-block header.
 *
 * The block is filled with `theme.accentColor` — whatever the resolved presentation carries, which is
 * the product default 石棕 until the user picks another swatch — and its text is drawn in
 * {@link bannerInk}'s answer for that accent.
 *
 * "Full width" means the full width of the page's content box, not a bleed past the page margin: the
 * margin is the paper's, and a block that ignored it would print into the printer's non-printable
 * edge. The block is a normal in-flow child of `ResumeHeader`, which is what keeps it out of
 * pagination's way — it is lifted out as the repeating header, so its height never competes with an
 * entry's.
 *
 * # The two arrangements
 *
 * Without a photo the block is exactly what it always was: rings and text, the text kept clear of the
 * rings by the reserved right padding. With one, the block becomes a row of [text column][portrait],
 * and the ring band moves inside the text column — which is what makes the "no decoration over the
 * portrait" claim structural rather than a matter of arithmetic: the rings are clipped by the column
 * that contains them, so they cannot reach the portrait at all, and the portrait sits after that
 * column with a gap. Both claims are measured in the browser gate, not argued here.
 */
function VerdantBanner({
  theme,
  name,
  title,
  metadata,
  photo,
}: {
  theme: ResumeTheme;
  name: string;
  title: string | undefined;
  metadata: TemplateRendererInput['metadata'];
  photo: string | null;
}) {
  const entries = contactEntries(metadata.frontmatter);
  const ink = bannerInk(theme.accentColor);

  const text = (
    <>
      <ResumeName theme={theme} color={ink}>
        {name}
      </ResumeName>
      {title ? (
        <ResumeTitle theme={theme} color={ink}>
          {title}
        </ResumeTitle>
      ) : null}
      {entries.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            // Container-level `gap` is right for a wrapping row (there is no "next sibling" to hang
            // a margin on) and wrong for the entries stack, which is why the entries use
            // `.resume-entry + .resume-entry`. The contacts are one line of the header, not a
            // pagination unit.
            gap: '4px 18px',
            fontSize: scaledSize(theme, SIZE_SCALES.small),
            lineHeight: '1.7',
            color: ink,
          }}
        >
          {entries.map((entry) => (
            // The label is kept (`Email：liming@dev.com`) rather than dropped for a bare address:
            // an unlabelled phone number is the ADR-0008 example of what costs a template its
            // rating, and dropping the labels here is what would move this one from 中 to 低.
            //
            // The label carries a little more weight than its value: that is the one bit of
            // hierarchy a single ink colour leaves available. `classic.tsx` separates the two by
            // painting the label in the accent, which cannot work on a block that *is* the accent.
            <span key={entry.label}>
              <span style={{ fontWeight: 500 }}>{entry.label}</span>
              {'：'}
              {entry.display}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  // `position: relative` on the text wrapper puts it above the rings in paint order as well as
  // keeping it clear of them geometrically. Two guarantees for one requirement, because the
  // geometric one depends on the ring constants and this one does not.
  const textWrapper = <div style={{ position: 'relative' }}>{text}</div>;

  return (
    <div
      style={{
        position: 'relative',
        background: theme.accentColor,
        // `boxSizing` so the reserved ring band is inside the block rather than added to its width,
        // which would make the block overflow the page box on paper.
        boxSizing: 'border-box',
        // With a photo the band is reserved by the text column instead, so the block only needs its
        // own padding — and the same top/bottom rhythm is kept.
        padding: photo ? '26px 26px 24px 26px' : `26px ${RING_BAND_PX + 22}px 24px 26px`,
        // Clips the rings at the block's edges, and stops a long unbroken contact value from
        // widening the block.
        overflow: 'hidden',
      }}
    >
      {photo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              position: 'relative',
              // The ring band, moved inside the column that the rings are clipped by.
              paddingRight: RING_BAND_PX + 22,
              flex: '1 1 auto',
              minWidth: 0,
              // Clips the rings at this column's right edge, which is what keeps them off the
              // portrait. The overhang past that edge is therefore invisible here, where in the
              // no-photo arrangement it is clipped by the block.
              overflow: 'hidden',
            }}
          >
            <BannerRings />
            {textWrapper}
          </div>
          <VerdantPortrait src={photo} alt={name} />
        </div>
      ) : (
        <>
          <BannerRings />
          {textWrapper}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Entries
// ──────────────────────────────────────────────────────────────

/**
 * One entry: title and meta stacked on the left, the date in its own right-aligned column.
 *
 * Written here rather than using the primitives' `ResumeEntry` for the same reason `classic.tsx`
 * writes its own: the arrangement *is* this template's identity. The primitive puts the subtitle
 * beside the title and the date at the end of that same baseline; here the title and its meta are two
 * lines and the date is a column of its own, which is what stops a long company name from pushing the
 * date off the line.
 *
 * `resume-entry` is the one thing a renderer may not vary: `break-inside: avoid` and the
 * `orphans`/`widows` rule hang off it, and the entry spacing comes from the
 * `.resume-entry + .resume-entry` margin in `PRINT_RESUME_CSS` — never from a flex `gap` on the
 * wrapper, which pagination cannot see (it measures entries, not their container).
 */
function VerdantEntry({ theme, item }: { theme: ResumeTheme; item: ResumeSectionItem }) {
  return (
    <div className="resume-entry" style={{ paddingLeft: '4px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '4px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: scaledSize(theme, SIZE_SCALES.entry),
              color: '#292524',
            }}
          >
            {item.title}
          </span>
          {item.subtitle ? (
            <span
              style={{
                marginTop: '2px',
                fontWeight: 500,
                fontSize: scaledSize(theme, SIZE_SCALES.subtitle),
                color: theme.accentColor,
              }}
            >
              {item.subtitle}
            </span>
          ) : null}
        </div>
        {item.date ? (
          <span
            style={{
              fontSize: scaledSize(theme, SIZE_SCALES.small),
              color: DATE_MUTED,
              whiteSpace: 'nowrap',
              textAlign: 'right',
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

// This file is the renderer only. The template's identity and tokens live in `TEMPLATE_METADATA`
// (`lib/resume-template.ts`), where a reader that only lists or describes templates can reach them
// without importing React; `components/resume-render/index.ts` pairs each entry with its renderer.
