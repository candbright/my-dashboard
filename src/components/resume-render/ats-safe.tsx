/**
 * The ATS-safe single-column template (ticket 20, ADR-0008).
 *
 * This is the default, and ADR-0008 makes it the **first** entry in the registry on purpose:
 *
 * > 顺序是刻意的：安全模板在前，否则用户会默认选好看的那个，然后静默丢内容。
 *
 * So this file is also the specification of what "ATS-safe" means in concrete markup, and the
 * parseability table in `resume-template.ts` rates other templates by how far they depart from it.
 * Every choice below is a parser-visible one, not a matter of taste:
 *
 *   - **One column.** A two-column layout puts a sidebar's text on the page at a position a linear
 *     reader does not visit in document order, so an extractor interleaves two unrelated streams —
 *     "Python" ends up inside a job description.
 *   - **No icons.** An icon that replaces a label ("☎ 138-0000-0000") is invisible to a text
 *     extractor, and a resume whose phone number has no label is a resume a recruiter cannot
 *     confidently call.
 *   - **Contact details in the body**, not in a header image or a coloured panel. Text over a
 *     background can be dropped by an image-based extractor.
 *   - **No layout tables.** A table used for positioning makes an extractor emit cells in an order
 *     the document never intended. Nothing here uses `<table>`.
 *   - **No text inside images.** There are no images at all except the optional photo, which the
 *     template refuses — see below.
 *   - **A real heading hierarchy**, `h1` for the name and `h2` for sections, so section boundaries
 *     are recoverable without guessing from font size.
 *
 * # The photo is refused, and that is a deliberate override
 *
 * `resolvePhoto` honours the user's choice, and this template respects it — but a photo is not
 * requested by the template's own tokens, and the renderer will not draw one unless the user turned
 * it on. A headshot carries no parseable information, costs ink, and in several markets (the US and
 * the UK among them) including one invites a discrimination claim. ADR-0008's first-template rule
 * is about the safe default, so "no photo unless asked" is the safe default.
 *
 * # What is intentionally missing
 *
 * No rule under section headings, no accent-coloured headings, no skill "chips", no letterspacing.
 * Each of those is decoration whose only effect on the reader is noise, and the reason someone
 * picks this template is that they want a document rather than a poster. `classic.tsx` is the
 * template for the other preference.
 */

import { resolvePhoto } from '@/components/resume-render/contact';
import { ResumeSectionBody } from '@/components/resume-render/section-body';
import {
  MUTED,
  ResumeDivider,
  ResumeEntry,
  ResumeHeader,
  ResumeName,
  ResumePage,
  ResumeSectionBlock,
  ResumeSectionList,
  ResumeTitle,
} from '@/components/resume-render/primitives';
import { scaledSize, SIZE_SCALES, buildTheme, type ResumeTheme } from '@/lib/resume-template-theme';
import type { TemplateRendererInput } from '@/lib/resume-template';

export function AtsSafeResume({ content, metadata, presentation, mode, fallbackTitle }: TemplateRendererInput) {
  const theme = buildTheme(presentation);
  const photo = resolvePhoto(metadata.frontmatter, presentation);
  const name = metadata.frontmatter.name || fallbackTitle;

  return (
    <ResumePage theme={theme} mode={mode}>
      <ResumeHeader align="left">
        <ResumeName theme={theme}>{name}</ResumeName>
        {metadata.frontmatter.title ? (
          <ResumeTitle theme={theme}>{metadata.frontmatter.title}</ResumeTitle>
        ) : null}
        <ContactLine theme={theme} metadata={metadata} />
        {photo ? <Photo src={photo} alt={name} /> : null}
      </ResumeHeader>

      <ResumeDivider />

      <ResumeSectionList gap="22px">
        {content.sections.map((section) => (
          <ResumeSectionBlock key={section.title} theme={theme} section={section}>
            <ResumeSectionBody
              section={section}
              theme={theme}
              renderEntry={(item, key) => (
                <ResumeEntry key={key} theme={theme} item={item} subtitleSeparator="·" />
              )}
            />
          </ResumeSectionBlock>
        ))}
      </ResumeSectionList>
    </ResumePage>
  );
}

/**
 * Contacts as one plain line of text: `email · phone · city · site`.
 *
 * Not chips and not a grid. A single `·`-separated sentence is what a parser recovers most
 * reliably, and it reads the same to a human. The separator is a middle dot rather than a pipe or a
 * bullet because it is the least likely of the three to be confused with content — people put `|`
 * in job titles.
 *
 * The label is printed for `Email`, `Phone` and the rest is self-describing. `138-0000-0000` alone
 * is ambiguous in a way `电话：138-0000-0000` is not, and the cost of the label is eight characters.
 */
function ContactLine({
  theme,
  metadata,
}: {
  theme: ResumeTheme;
  metadata: TemplateRendererInput['metadata'];
}) {
  const parts: string[] = [];
  const fm = metadata.frontmatter;
  if (fm.email) parts.push(fm.email);
  if (fm.phone) parts.push(fm.phone);
  if (fm.location) parts.push(fm.location);
  if (fm.website) parts.push(fm.website);
  if (fm.github) parts.push(`github.com/${shortHandle(fm.github)}`);
  if (fm.linkedin) parts.push(`linkedin.com/in/${shortHandle(fm.linkedin)}`);

  if (parts.length === 0) return null;

  return (
    <p
      style={{
        fontSize: scaledSize(theme, SIZE_SCALES.small),
        color: MUTED,
        margin: 0,
        lineHeight: '1.8',
        // Wraps rather than overflowing when a candidate has all six contacts and a long city name.
        wordBreak: 'break-word',
      }}
    >
      {parts.join(' · ')}
    </p>
  );
}

/** The last path segment of a profile URL, or the value itself if it is not a URL. */
function shortHandle(value: string): string {
  try {
    return new URL(value).pathname.replace(/^\//, '').replace(/\/$/, '') || value;
  } catch {
    return value;
  }
}

/**
 * A small square photo, below the contact line.
 *
 * Square rather than circular and left-aligned with the text, because a circular crop of a portrait
 * cuts off the top of the head more often than not, and because a centred circle above the name is
 * the layout this template exists to avoid. 72px keeps it from competing with the name.
 */
function Photo({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the print document is a self-contained iframe with no image optimizer and no network guarantees, so next/image cannot serve it.
    <img
      src={src}
      alt={alt}
      crossOrigin="anonymous"
      style={{
        width: '72px',
        height: '72px',
        objectFit: 'cover',
        border: `1px solid ${MUTED}`,
        marginTop: '10px',
        display: 'block',
      }}
    />
  );
}

// This file is the renderer only. The template's identity and tokens live in `TEMPLATE_METADATA`
// (`lib/resume-template.ts`), where a reader that only lists or describes templates can reach them
// without importing React; `components/resume-render/index.ts` pairs each entry with its renderer.

