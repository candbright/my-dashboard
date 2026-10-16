/**
 * The classic centred template (ticket 20, ADR-0008).
 *
 * # Why this exists at all
 *
 * ADR-0008 requires verifying a new template on **two render paths**, and ticket 20's acceptance
 * criterion is that switching templates produces visually different output. Neither is checkable
 * with one renderer — "the renderer is pluggable" is a claim about a seam, and a seam with one thing
 * on each side of it is indistinguishable from no seam. This template is the second thing.
 *
 * It is also not invented for the test. It is the design the product already shipped: the centred
 * name, the accent-coloured headline, the ruled section headings, the right-aligned dates and the
 * skill chips are all what `ResumePrintView` drew before this refactor, ported onto the shared
 * primitives. So the comparison is honest in both directions — the ATS-safe template is genuinely a
 * different document, and no user loses the layout they had.
 *
 * # Why it is rated 中 and not 高
 *
 * Two things cost it a point against the written table in `resume-template.ts`:
 *
 *   - The name and headline are **centred**. Centring is not itself a parseability problem, but it
 *     is the first step of the visual tradition this template belongs to, and it is what makes the
 *     next template (a sidebar) look like a small change when it is not: a parser sees no centring,
 *     only the absence of the structural cues the ATS-safe template provides.
 *   - Skill "chips" put each skill in its own bordered box. Extractors handle this by luck rather
 *     than by design — a box is a visual grouping, and a linear reader sees the skills as one run of
 *     text or as one line each depending on how they were laid out.
 *
 * Neither is a defect. A user choosing this template is choosing a look over a marginal screening
 * advantage, and the rating is exactly the information that lets them make that choice knowingly.
 * That is the whole purpose of ADR-0008's label requirement.
 *
 * # What is deliberately still safe
 *
 * One column, contacts as labelled text in the body, no icons standing in for text, no layout
 * tables, no text in images. This template is *less* safe than the ATS-safe one; it is not unsafe.
 * If it dropped the contact labels or moved the contacts into a sidebar it would be rated 低, and
 * the difference between those two judgements is worth keeping visible.
 */

import { contactEntries, resolvePhoto } from '@/components/resume-render/contact';
import { ResumeSectionBody } from '@/components/resume-render/section-body';
import {
  DATE_MUTED,
  MUTED,
  ResumeDivider,
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

export function ClassicResume({ content, metadata, presentation, mode, fallbackTitle }: TemplateRendererInput) {
  const theme = buildTheme(presentation);
  const photo = resolvePhoto(metadata.frontmatter, presentation);
  const name = metadata.frontmatter.name || fallbackTitle;

  return (
    <ResumePage theme={theme} mode={mode}>
      <ResumeHeader align="center">
        {photo ? <ClassicPhoto src={photo} alt={name} /> : null}
        <ResumeName theme={theme}>{name}</ResumeName>
        {metadata.frontmatter.title ? (
          <ResumeTitle theme={theme}>{metadata.frontmatter.title}</ResumeTitle>
        ) : null}
        <ContactRow theme={theme} metadata={metadata} />
      </ResumeHeader>

      <ResumeDivider />

      <ResumeSectionList gap="24px">
        {content.sections.map((section) => (
          <ResumeSectionBlock key={section.title} theme={theme} section={section}>
            <ResumeSectionBody
              section={section}
              theme={theme}
              renderEntry={(item, key) => <ClassicEntry key={key} theme={theme} item={item} />}
              renderChips={(chips, key) => <ClassicSkillRow key={key} theme={theme} chips={chips} />}
            />
          </ResumeSectionBlock>
        ))}
      </ResumeSectionList>
    </ResumePage>
  );
}

/**
 * A centred circular photo above the name — the layout this template is named for.
 *
 * Distinct from the ATS-safe template's square, left-aligned photo on purpose. Two templates that
 * both place a photo the same way would be leaving the clearest visual difference between them
 * unused.
 */
function ClassicPhoto({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- self-contained print iframe; see the note in ats-safe.tsx.
    <img
      src={src}
      alt={alt}
      crossOrigin="anonymous"
      style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        objectFit: 'cover',
        border: `3px solid ${ACCENT_RING}`,
        margin: '0 auto 16px auto',
        display: 'block',
      }}
    />
  );
}

/**
 * Contacts as a centred wrapped row, each preceded by its label.
 *
 * Keeps the label the ATS-safe template also prints — `邮箱：` rather than a bare address — because
 * dropping it is what would move this template from 中 to 低. The visual difference from the
 * ATS-safe version is arrangement (a wrapped flex row with a wider gap) rather than information.
 */
function ContactRow({
  theme,
  metadata,
}: {
  theme: ResumeTheme;
  metadata: TemplateRendererInput['metadata'];
}) {
  const entries = contactEntries(metadata.frontmatter);
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '6px 20px',
        fontSize: scaledSize(theme, SIZE_SCALES.small),
        color: MUTED,
      }}
    >
      {entries.map((entry) => (
        <span key={entry.label}>
          <span style={{ color: theme.accentColor, fontWeight: 500 }}>{entry.label}</span>
          {'：'}
          {entry.display}
        </span>
      ))}
    </div>
  );
}

/**
 * A job entry with the date right-aligned on its own line above the title block.
 *
 * Structured differently from `ResumeEntry` in the primitives rather than reusing it, because the
 * header layout is the visible difference: here the date gets its own right-aligned span below the
 * title row, so a long company name cannot push it off the line. It still carries `resume-entry`,
 * so pagination treats it exactly as it treats every other entry — that hook is the one thing a
 * renderer is not free to vary.
 */
function ClassicEntry({ theme, item }: { theme: ResumeTheme; item: ResumeSectionItem }) {
  return (
    <div className="resume-entry" style={{ paddingLeft: '4px' }}>
      <div style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
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
                fontSize: scaledSize(theme, SIZE_SCALES.subtitle),
                fontWeight: 500,
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
 * Skill chips: an accent-tinted capsule each.
 *
 * The tint is what the parseability note is about. A tinted box groups a skill visually, and how a
 * given extractor linearises a row of boxes is not specified anywhere — so the same document can
 * read as `Python Java Go` or as three separate skills depending on the tool. The skills are all
 * present either way, which is why this is 中 and not 低.
 */
function ClassicSkillRow({ theme, chips }: { theme: ResumeTheme; chips: string[] }) {
  return (
    <div data-print-flatten="" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {chips.map((skill) => (
        <span
          key={skill}
          style={{
            padding: '3px 12px',
            borderRadius: '9999px',
            fontSize: scaledSize(theme, SIZE_SCALES.small),
            fontWeight: 500,
            border: `1px solid ${theme.accentColor}33`,
            background: `${theme.accentColor}0f`,
            color: theme.accentColor,
          }}
        >
          {skill}
        </span>
      ))}
    </div>
  );
}

/**
 * The 20% alpha ring around the photo.
 *
 * A literal rather than a token because it is not a design token — it is the neutral rule colour
 * used at a fixed alpha, and inventing a token for one border would put a value in the token set
 * that nothing else can use.
 */
const ACCENT_RING = '#d6d3d1';

// This file is the renderer only. The template's identity and tokens live in `TEMPLATE_METADATA`
// (`lib/resume-template.ts`), where a reader that only lists or describes templates can reach them
// without importing React; `components/resume-render/index.ts` pairs each entry with its renderer.

