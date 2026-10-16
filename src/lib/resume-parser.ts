// ══════════════════════════════════════════════════════════════════════════════
// THIS PARSER IS NOT AUTHORITATIVE.
//
// The authority for resume structure is the server:
//
//     kratos-server/internal/biz/resumevault/structured.go
//         ParseStructuredContent / ClassifySection / SplitSkillList
//
// Those functions decide section boundaries, item boundaries, dates and skill separators for
// every reader of a resume, and the API sends the result as a `content` snapshot
// (`StructuredContent`, ticket 18, ADR-0003). **Anything that has a server response must use
// that snapshot** — `parsedFromStructuredContent` in this file is the consumer for it.
//
// What is left here parses a resume **body** for one purpose: the editor's live preview,
// which cannot round-trip to the server on every keystroke. That is the only reason it still
// exists, and it is a deliberate, documented duplication (ADR-0003), not a second opinion.
//
// Two consequences, both load-bearing:
//
//   1. **This file must not parse metadata.** Metadata lives in database columns and arrives
//      as a `ResumeRecord`; `resumeMetadataView` normalises it. Frontmatter is an
//      import/export exchange format only (ADR-0003), so a value read from it is a fallback
//      for a file that has not been imported yet, never the source of truth.
//   2. **When this disagrees with the Go parser, the Go parser is right and this is the
//      bug.** The rules that decide *structure* live in `resume-section.ts`, which is marked
//      non-authoritative in the same way and pinned against the Go rules by its tests.
//
// See also `src/lib/resume-section.ts` for section classification and skill splitting. The shapes
// this parser produces live in `src/lib/resume-model.ts`, which is a leaf module — so retiring the
// parser is a deletion rather than a rewrite of its readers.
// ══════════════════════════════════════════════════════════════════════════════

import { attachBlocksToSections } from './resume-blocks';
import { classifySectionTitle } from './resume-section';
import matter from 'gray-matter';
import type { MetadataKey } from './resume-metadata';
import type { ResumeRecord } from '@/lib/types';
import type {
  ParsedFrontmatter,
  ParsedResume,
  ParsedResumeWithMetadata,
  ResumeMetadataView,
  ResumeSection,
  ResumeSectionItem,
  SectionKind,
  StructuredContent,
} from './resume-model';

/**
 * The section kinds this build knows, for validating what the server sent.
 */
const KNOWN_SECTION_KINDS: readonly SectionKind[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'other',
];

/**
 * Narrow a wire `kind` to a {@link SectionKind}.
 *
 * An unrecognised value becomes `undefined` rather than being passed through, so a newer
 * server cannot make this client treat an unknown category as a known one. The renderer
 * then falls back to its title test, which is the correct degradation.
 */
function sectionKindFromWire(kind: string | undefined): SectionKind | undefined {
  if (!kind) return undefined;
  return (KNOWN_SECTION_KINDS as readonly string[]).includes(kind)
    ? (kind as SectionKind)
    : undefined;
}

/**
 * Convert the server's snapshot into the section shape every consumer already reads.
 *
 * # Why this exists rather than the client parsing
 *
 * ADR-0003 makes the server parser the sole authority. The client's own parser stays for
 * the editor's instant preview — it cannot round-trip on every keystroke — but every path
 * that *has* a server response should use it, so two clients cannot disagree about the same
 * document.
 *
 * Missing optional fields are normalised here (`subtitle` and `date` to `undefined` rather
 * than `''`, `details` to `[]` rather than `undefined`) because the components branch on
 * truthiness: an empty string is falsy and would work by accident for `subtitle`, but
 * `details.map(...)` on `undefined` throws.
 */
export function sectionsFromStructuredContent(
  content: StructuredContent | null | undefined
): ResumeSection[] {
  const sections = content?.sections;
  if (!sections) return [];

  return sections.map((section) => {
    const title = section.title ?? '';
    return {
      title,
      content: section.content ?? '',
      // The server's answer wins. When it sent none — an unrecognised title classified as
      // `other`, or a server that does not send kinds — the local, explicitly
      // non-authoritative classifier fills in (`resume-section.ts`). Doing it here means no
      // renderer has to decide for itself, which is how the three different skill tests
      // arose.
      kind: sectionKindFromWire(section.kind) ?? classifySectionTitle(title),
      items: (section.items ?? []).map((item) => ({
        title: item.title ?? '',
        subtitle: item.subtitle || undefined,
        date: item.date || undefined,
        details: item.details ?? [],
      })),
    };
  });
}

/**
 * Build a parsed resume from the server's snapshot instead of parsing the document.
 *
 * `rawContent` is left empty on purpose: it is the frontend parser's by-product, and it has
 * no server equivalent. Consumers read `sections`, and the raw body is available from the
 * `markdown` the response carries alongside the snapshot — inventing a value here would be a
 * second, unofficial source for it.
 */
export function parsedFromStructuredContent(
  content: StructuredContent | null | undefined,
  record: Partial<Pick<ResumeRecord, MetadataKey>> | null | undefined,
  frontmatter?: ParsedFrontmatter | null,
  /**
   * The stored body, when the caller has it. The snapshot's `content`/`items` flatten mixed
   * order; walking the body recovers paragraph / entry / chip-group as a stream.
   */
  markdown?: string | null,
): ParsedResumeWithMetadata {
  return {
    frontmatter: resumeMetadataView(record, frontmatter),
    sections: attachBlocksToSections(sectionsFromStructuredContent(content), markdown),
    rawContent: '',
  };
}

/**
 * The metadata columns that also name a frontmatter key, column name → the key readers use.
 *
 * Only `job_title` differs; the rest map to themselves. Spelled out rather than derived so a rename
 * has to be written in one visible place. Typed over every {@link MetadataKey} **except** `summary`
 * on purpose: adding a field to the form therefore fails to compile until its frontmatter name is
 * decided here — the drift this file exists to prevent, caught by the type checker instead of by
 * a field that silently stops saving.
 *
 * `summary` is the exception because it has no frontmatter counterpart: it is the dashboard card's
 * blurb (`ResumeRecord.summary`), not part of the document. A resume's own summary is body content
 * (`## 关于我`) and is parsed as an ordinary section.
 */
type FrontmatterBackedColumn = Exclude<MetadataKey, 'summary'>;

const COLUMN_TO_FRONTMATTER_KEY: Record<FrontmatterBackedColumn, keyof ParsedFrontmatter> =
  {
    name: 'name',
    job_title: 'title',
    email: 'email',
    phone: 'phone',
    location: 'location',
    website: 'website',
    github: 'github',
    linkedin: 'linkedin',
    avatar: 'avatar',
  };

/**
 * A non-blank string, or `undefined` for anything else.
 *
 * A column that was cleared through the metadata panel holds `''`, not NULL (ticket 15),
 * so `''` and whitespace-only both count as absent. That matters for the fallback: if a
 * cleared column counted as a value it would shadow a real value from an imported
 * document, making a clear impossible to undo by re-importing.
 */
function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim() === '' ? undefined : value;
}

/**
 * The metadata to render a resume with, as a single view of two sources.
 *
 * Ticket 17 made the database columns the authority and stripped frontmatter from the
 * stored document, which left `parsed.frontmatter` permanently empty — and every render
 * path still read it, so preview and all four exports silently lost their metadata.
 * Rather than teach each consumer about the columns, they keep reading frontmatter and
 * this function makes that frontmatter correct.
 *
 * Precedence: **columns win, the document is the fallback.** The columns are what the
 * editor writes; a document's own frontmatter is only present on an imported `.md`, and
 * letting it shadow the columns would make an import silently revert later edits.
 *
 * @param record The resume record, or `null`/`undefined` when there is none — a public
 *   `.md` view, or the editor's optimistic preview before a save has returned. In that
 *   case the document supplied by `documentFrontmatter` is all there is.
 * @param documentFrontmatter Frontmatter parsed out of the Markdown itself, if any.
 */
export function resumeMetadataView(
  record: Partial<Pick<ResumeRecord, MetadataKey>> | null | undefined,
  documentFrontmatter?: ParsedFrontmatter | null,
): ResumeMetadataView {
  const view: ResumeMetadataView = {};

  for (const column of Object.keys(COLUMN_TO_FRONTMATTER_KEY) as FrontmatterBackedColumn[]) {
    const key = COLUMN_TO_FRONTMATTER_KEY[column];

    const fromColumn = nonBlankString(record?.[column]);
    if (fromColumn !== undefined) {
      view[key] = fromColumn;
      continue;
    }

    // `documentFrontmatter` is keyed by frontmatter name, so a job title arrives under
    // `title` — the same key we are writing.
    const fromDocument = nonBlankString(documentFrontmatter?.[key]);
    if (fromDocument !== undefined) view[key] = fromDocument;
  }

  return view;
}

/**
 * Returns `parsed` with its frontmatter replaced by the metadata view for `record`.
 *
 * Only the metadata is swapped: `sections` and `rawContent` are passed through **by
 * reference**, because the body parse is a separate concern (ticket 18 task 3 moves it to
 * the server) and re-parsing here would be a second parser to keep in step.
 *
 * Pure and idempotent — it returns a new object and never writes to its argument, so
 * calling it again after a save (which the client does) cannot accumulate anything.
 */
export function withMetadata(
  parsed: ParsedResume,
  record: Partial<Pick<ResumeRecord, MetadataKey>> | null | undefined,
): ParsedResumeWithMetadata {
  return {
    ...parsed,
    frontmatter: resumeMetadataView(record, parsed.frontmatter),
  };
}

export function parseResumeMarkdown(markdown: string): ParsedResume {
  const { data: frontmatter, content } = matter(markdown);

  const sections = attachBlocksToSections(parseSections(content), content);

  return {
    frontmatter: {
      name: frontmatter.name,
      title: frontmatter.title,
      email: frontmatter.email,
      phone: frontmatter.phone,
      location: frontmatter.location,
      website: frontmatter.website,
      github: frontmatter.github,
      linkedin: frontmatter.linkedin,
      avatar: frontmatter.avatar,
    },
    sections,
    rawContent: content,
  };
}

/**
 * A date written on its own line: an italic wrapper, or a bare line.
 *
 * Returns the trimmed date, or `undefined` when the line is not one.
 *
 * Mirrors the server's `dateCandidate` **and** its `looksLikeDate` gate, which matters more
 * than it looks: the old code accepted any `*…*` line as a date, so `*一段强调的文字*` under
 * an item became that item's date. The gate below is the server's rule — the candidate must
 * contain a 4-digit year followed by a month, and a range needs a real date (or an
 * open-ended token) on both sides.
 *
 * It is intentionally a faithful copy rather than an approximation: a looser regex here is a
 * new divergence, and the parity test would fail on it.
 */
function dateOnItsOwnLine(line: string): string | undefined {
  // A bullet is a detail, never a date — `- 2022 年做的三件事` must keep its text.
  if (/^[-*] /.test(line)) return undefined;

  const candidate = /^\*(.+)\*$/.exec(line)?.[1]?.trim() ?? line.trim();

  const range = splitDateRange(candidate);
  if (range) {
    const [left, right] = range;
    if (isDateToken(left) && (isOpenEndedDate(right) || isDateToken(right))) {
      return candidate;
    }
    return undefined;
  }

  // A bare year is not a date — `2022` on its own line is a fact, and swallowing it would
  // delete a line of the user's resume.
  if (isBareYear(candidate)) return undefined;
  return isDateToken(candidate) ? candidate : undefined;
}

/** A single date with a month: `2022.03`, `2022/3`, `2022-03`, `2022年3月`, `2022年3`. */
const DATE_WITH_MONTH = /^(?:\d{4}\s*年\s*\d{1,2}\s*月?|\d{4}\s*[./-]\s*\d{1,2})$/;

/** A date with a month at the **start**, used to find where a range can be cut. */
const DATE_HEAD = /^(?:\d{4}\s*年\s*\d{1,2}\s*月|\d{4}\s*[./]\s*\d{1,2})/;

/** An explicit range separator. `至` is absent on purpose: it is inside `至今`. */
const DATE_RANGE_SEPARATOR = /\s*(?:--|—|–|~|～|-)\s*/;

const OPEN_ENDED_DATES = new Set([
  '至今',
  '现在',
  '今',
  'present',
  'now',
  'current',
  'till now',
  'to date',
]);

function isBareYear(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function isDateToken(value: string): boolean {
  const trimmed = value.trim();
  return isBareYear(trimmed) || DATE_WITH_MONTH.test(trimmed);
}

function isOpenEndedDate(value: string): boolean {
  return OPEN_ENDED_DATES.has(value.trim().toLowerCase());
}

/**
 * Split a date range into its two halves, or return `undefined` if it is not a range.
 *
 * An explicit separator splits at its first occurrence. Failing that, a fully formed date at
 * the very start is cut from the remainder — which is the only way `2022年3月至今` can be
 * split, since it contains no separator at all.
 */
function splitDateRange(value: string): [string, string] | undefined {
  const separator = DATE_RANGE_SEPARATOR.exec(value);
  if (separator) {
    const left = value.slice(0, separator.index).trim();
    const right = value.slice(separator.index + separator[0].length).trim();
    return left && right ? [left, right] : undefined;
  }

  const head = DATE_HEAD.exec(value);
  if (head && head[0].length < value.length) {
    const left = head[0].trim();
    const right = value.slice(head[0].length).trim();
    return left && right ? [left, right] : undefined;
  }

  return undefined;
}

/**
 * Parse a `###` heading into an item.
 *
 * Two rules the server has and this did not, both found by the parity test:
 *
 *  1. **Only the first pipe separates.** `### 工程师 | 公司 | 部门` produced the subtitle
 *     `公司`, silently truncating `部门`; the server joins the remainder back, giving
 *     `公司 | 部门`.
 *  2. **A date may be written on the heading**, `### 后端工程师 | 某某科技 | 2021.03 - 至今`,
 *     which people do write. The server moves it to the date field; this left it in the
 *     subtitle, so the item showed a date where its employer belonged.
 */
function parseItemHeading(heading: string): ResumeSectionItem {
  const parts = heading.split('|').map((part) => part.trim());

  let date: string | undefined;
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (dateOnItsOwnLine(last) !== undefined) {
      date = dateOnItsOwnLine(last);
      parts.pop();
    }
  }

  return {
    title: parts[0],
    subtitle: parts.length > 1 ? parts.slice(1).join(' | ') : undefined,
    date,
    details: [],
  };
}

function parseSections(content: string): ResumeSection[] {
  const sections: ResumeSection[] = [];
  // Normalize line endings to LF
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let currentSection: ResumeSection | null = null;
  let currentItem: ResumeSectionItem | null = null;
  let contentBuffer: string[] = [];

  for (const line of lines) {
    // H2 = section header
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        if (currentItem) {
          currentSection.items.push(currentItem);
          currentItem = null;
        }
        currentSection.content = stripDateOnlyLines(contentBuffer);
        sections.push(currentSection);
      }
      const title = h2Match[1].trim();
      currentSection = {
        title,
        content: '',
        items: [],
        // Classified here too, so the editor's live preview draws a section the same way the
        // saved view will. Without this the preview would fall back to `other` for every
        // section and the skills chips would disappear until the user saved — which is
        // exactly the "two readers disagree" shape this ticket removes. It is the *local*
        // classifier (`resume-section.ts`), so the saved view still takes the server's answer
        // as soon as it has one.
        kind: classifySectionTitle(title),
      };
      contentBuffer = [];
      continue;
    }

    // H3 = section item (e.g., job title, degree)
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match && currentSection) {
      if (currentItem) {
        currentSection.items.push(currentItem);
      }
      currentItem = parseItemHeading(h3Match[1].trim());
      continue;
    }

    // Date line (italic, or bare).
    //
    // Deliberately **not** conditional on `currentItem`: the old `dateMatch && currentItem`
    // meant a date standing alone under a section with no `###` fell through to the content
    // buffer, so the section's own text began with a stray `*2022.03 - 2024.06*` — a
    // divergence the parity test caught against the server, which drops such a line because
    // there is no item for it to describe.
    //
    // The same `looksLikeDate`-equivalent guard the server uses is applied here, so that a
    // line of ordinary prose wrapped in asterisks is not mistaken for a date.
    if (currentItem) {
      const date = dateOnItsOwnLine(line);
      if (date !== undefined) {
        currentItem.date = date;
        continue;
      }
    }

    // List item
    const listMatch = line.match(/^[-*] (.+)$/);
    if (listMatch && currentItem) {
      currentItem.details.push(listMatch[1].trim());
      continue;
    }

    // Regular content
    if (currentSection) {
      contentBuffer.push(line);
    }
  }

  // Save last section and item
  if (currentSection) {
    if (currentItem) {
      currentSection.items.push(currentItem);
    }
    currentSection.content = stripDateOnlyLines(contentBuffer);
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Join buffered prose, dropping lines that are **only** a date.
 *
 * Such a line lands in the buffer when a section has no `###` to attach it to — the user
 * wrote `## 工作经历`, then a date, then nothing else yet. Keeping it would put a raw
 * `*2022.03 - 2024.06*` into `content`, and for a skills section that is worse than untidy:
 * `collectSkills` would render "2022.03" as a skill the user claims to have.
 *
 * Lossless in the sense that matters: the document is untouched, and as soon as an `###`
 * exists the date is read into that item. Mirrors `stripDateOnlyLines` in the Go parser.
 */
function stripDateOnlyLines(lines: string[]): string {
  return lines
    .filter((line) => dateOnItsOwnLine(line.trim()) === undefined)
    .join('\n')
    .trim();
}

// There is deliberately no `generateSlug` here.
//
// One existed and had no callers anywhere in the repository. The slug is generated
// server-side, stored, and immutable — it is part of a resume's public URL — so a second
// implementation in the frontend could only ever be dead code that drifts out of step
// with the real one. Ticket 13 deleted it rather than fixing it, because "fixing" it
// would have produced two disagreeing slug algorithms and made the drift harder to spot.
