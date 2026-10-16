/**
 * Convert structured resume data back to markdown string with frontmatter
 *
 * # Frontmatter is an interchange format, not storage (ticket 17, ADR-0003)
 *
 * The server stores a resume document **without** frontmatter; metadata lives in database
 * columns and is the single authority. Frontmatter therefore exists at exactly two
 * boundaries — import (parse it, write the columns) and export (render the columns as
 * frontmatter). This module is the export half.
 *
 * That distinction is what retires the escaping defect rather than patching it. This file
 * used to build the block by string concatenation (`name: ${name}`), which emits invalid
 * YAML for any value containing `: `, `#`, or a leading `&`/`*`/`[`/`{` — and the old code
 * parsed that same block back during normal editing, so one such character in a name would
 * break the user's own resume. Serialising with a real YAML library removes the
 * hand-written escaping *and* the runtime dependency on it.
 */

import { dump as dumpYaml } from 'js-yaml';

import {
  inferSectionBlocksFromBody,
  inferSectionBlocksFromParsed,
  serializeSectionBlocks,
  type InferredBlock,
} from './resume-blocks';
import type { ParsedResume, ResumeMetadataView, ResumeSectionItem } from './resume-model';

export interface EditableFrontmatter {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  github: string;
  linkedin: string;
  avatar: string;
}

/**
 * The frontmatter keys, in output order.
 *
 * An explicit list rather than `Object.entries`: this order is what users see when they
 * open the `.md`, and it is stable across releases. `Record<keyof EditableFrontmatter, …>`
 * makes the compiler reject a metadata field that someone adds to the interface but
 * forgets to export, which a plain array would silently drop.
 */
const FRONTMATTER_KEYS: ReadonlyArray<keyof EditableFrontmatter> = [
  'name',
  'title',
  'email',
  'phone',
  'location',
  'website',
  'github',
  'linkedin',
  'avatar',
];

/** Fully typed so that adding a field to the interface fails compilation until it is listed. */
const FRONTMATTER_KEY_ORDER: Record<keyof EditableFrontmatter, number> = {
  name: 0,
  title: 1,
  email: 2,
  phone: 3,
  location: 4,
  website: 5,
  github: 6,
  linkedin: 7,
  avatar: 8,
};

/**
 * Serialise frontmatter metadata as a YAML block, fence included.
 *
 * Returns `''` when there is nothing to write, so a metadata-free resume exports as a plain
 * document rather than as an empty `---\n---` block that would claim frontmatter exists.
 *
 * `js-yaml`'s `dump` is used rather than the deprecated `safeDump` alias, and rather than a
 * hand-rolled quoter, because it is the **same library `gray-matter` uses to parse**
 * (`node_modules/gray-matter/lib/engines.js` calls into `js-yaml`). Export and import
 * therefore agree by construction instead of by two independent implementations happening
 * to match — which is the failure mode ADR-0003 exists to eliminate.
 */
export function serializeFrontmatter(frontmatter: EditableFrontmatter): string {
  const data: Record<string, string> = {};
  for (const key of FRONTMATTER_KEYS) {
    const value = frontmatter[key];
    // Blank fields are omitted, not written as empty strings: `name: ''` reads as a
    // present-but-empty value, whereas an absent key is genuinely absent, and the parser
    // treats the two differently for "has this resume been filled in".
    if (value) data[key] = value;
  }

  if (Object.keys(data).length === 0) return '';

  // `lineWidth: -1` disables folding, so a long value stays on one line instead of being
  // wrapped into a multi-line scalar that renders oddly in a plain-text editor.
  const body = dumpYaml(data, { lineWidth: -1, sortKeys: (a, b) => FRONTMATTER_KEY_ORDER[a as keyof EditableFrontmatter] - FRONTMATTER_KEY_ORDER[b as keyof EditableFrontmatter] });

  return `---\n${body}---\n`;
}

/**
 * Convert a metadata view into the editable frontmatter shape.
 *
 * The only interesting mapping is the job title, which is `job_title` in the `resumes`
 * column and `title` in the document frontmatter. Choosing the wrong one would export a
 * resume with no job title at all — the same asymmetry that made the read paths lose it
 * (ticket 18).
 */
export function metadataViewToEditableFrontmatter(
  metadata: ResumeMetadataView
): EditableFrontmatter {
  return {
    name: metadata.name ?? '',
    title: metadata.title ?? '',
    email: metadata.email ?? '',
    phone: metadata.phone ?? '',
    location: metadata.location ?? '',
    website: metadata.website ?? '',
    github: metadata.github ?? '',
    linkedin: metadata.linkedin ?? '',
    avatar: metadata.avatar ?? '',
  };
}

/**
 * Compose the Markdown a user gets when they download or copy a resume.
 *
 * # Why this exists
 *
 * The stored document is deliberately body-only (ADR-0003): metadata lives in database
 * columns so it can be queried, and the file holds content alone. The export therefore has
 * to **re-attach** the metadata, and it has to do so from the columns rather than from the
 * document, because the document no longer carries any.
 *
 * Before this, both the copy and the download buttons handed the user the stored body
 * verbatim, so an exported `.md` had no frontmatter and re-importing it lost every contact
 * detail. That is precisely the round trip ADR-0003 requires to work, and the ADR is
 * explicit that 导出 must emit valid YAML frontmatter through a real serialiser.
 *
 * `serializeFrontmatter` returns `''` when every field is blank, in which case the body is
 * returned untouched rather than prefixed with a stray newline.
 *
 * # Presentation state is deliberately omitted (ticket 19, ADR-0004)
 *
 * The export carries **only** the document and the metadata columns. Template, accent colour,
 * font, scale, line height, page margin, section order and the photo are not written to the
 * `.md`, and that is a decision rather than an oversight — ADR-0004 says 导出时省略.
 *
 * The reasoning, in order of how much it matters:
 *
 * 1. **A round trip cannot restore it anyway.** Re-importing a `.md` sends the server a document
 *    and a set of metadata columns; the presentation columns are not part of the import path, so
 *    anything written into the file would be read and discarded. An exported value the product
 *    cannot read back is worse than no value, because it looks authoritative.
 * 2. **The frontmatter block is a strict, typed envelope.** It is parsed as YAML and mapped onto
 *    the nine metadata columns; a styling object inside it would either collide with the parser's
 *    expectations or need a second, undocumented shape there — the "two sources of truth"
 *    ADR-0004 already names as this design's cost, reintroduced at the file boundary.
 * 3. **A `.md` file is a content artefact.** Its job is to carry résumé *content* between tools
 *    — into an ATS, a text editor, another Markdown résumé site. Styling is not portable content,
 *    and a file that carries it invites the reader to believe a tool will honour it.
 *
 * The consequence to accept: a user who downloads their resume and re-uploads it gets their
 * content and contact details back, and their colours reset to the defaults. The API is the way
 * to move styling between accounts; the file is not, and pretending otherwise would be the
 * silent-loss shape this project rejects elsewhere. {@link resumeMarkdownExport} has no parameter
 * through which presentation state could arrive, so this is enforced by the signature as well as
 * by the paragraph above — `resume-builder.test.ts` asserts the absence.
 */
export function resumeMarkdownExport(metadata: ResumeMetadataView, body: string): string {
  const head = serializeFrontmatter(metadataViewToEditableFrontmatter(metadata));
  if (!head) return body;
  return `${head}\n${body}`;
}

export interface EditableSection {
  id: string;
  title: string;
  /**
   * Legacy buckets. Kept so a caller that builds a section by hand (tests, an older
   * editor path) still serialises. The editor itself writes {@link blocks} and
   * `editableToMarkdown` prefers that when it is present.
   */
  content: string;
  items: EditableSectionItem[];
  /** Mixed components in document order. Present after `parsedToEditable`. */
  blocks?: EditableBlock[];
}

export type EditableBlock =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'entry'; item: EditableSectionItem }
  | { id: string; type: 'chips'; chips: EditableChip[] };

export interface EditableChip {
  id: string;
  text: string;
}

export interface EditableSectionItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  details: string[];
}

export function newEditableId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A frontmatter value as the string the editable form needs.
 *
 * `ParsedResume.frontmatter` is deliberately `unknown` (see `resume-parser.ts`): YAML
 * parses `&张三` as a null anchor and `[张三]` as an array, so a value that presents as a
 * string can be an object. A plain `value || ''` would put that object into a text input
 * and let React render it as a child; `String(...)` at least makes it visible text the
 * user can correct, and keeps the `EditableFrontmatter` contract honest either way.
 */
function frontmatterText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function parsedToEditable(parsed: ParsedResume): {
  frontmatter: EditableFrontmatter;
  sections: EditableSection[];
} {
  const frontmatter: EditableFrontmatter = {
    name: frontmatterText(parsed.frontmatter.name),
    title: frontmatterText(parsed.frontmatter.title),
    email: frontmatterText(parsed.frontmatter.email),
    phone: frontmatterText(parsed.frontmatter.phone),
    location: frontmatterText(parsed.frontmatter.location),
    website: frontmatterText(parsed.frontmatter.website),
    github: frontmatterText(parsed.frontmatter.github),
    linkedin: frontmatterText(parsed.frontmatter.linkedin),
    avatar: frontmatterText(parsed.frontmatter.avatar),
  };

  const sections: EditableSection[] = parsed.sections.map((s, i) => {
    const inferred = s.blocks ?? inferSectionBlocksFromParsed(s);
    const blocks = inferred.map((block, j) => inferredToEditable(block, i, j));
    return {
      id: `section-${i}-${Date.now()}`,
      title: s.title,
      content: s.content,
      items: itemsFromBlocks(blocks),
      blocks,
    };
  });

  return { frontmatter, sections };
}

function inferredToEditable(block: InferredBlock, _sectionIndex: number, _blockIndex: number): EditableBlock {
  const id = newEditableId('block');
  if (block.type === 'paragraph') {
    return { id, type: 'paragraph', text: block.text };
  }
  if (block.type === 'chips') {
    return {
      id,
      type: 'chips',
      chips: block.chips.map((text) => ({
        id: newEditableId('chip'),
        text,
      })),
    };
  }
  return {
    id,
    type: 'entry',
    item: editableItemFromParsed(block.item, newEditableId('item')),
  };
}

function editableItemFromParsed(item: ResumeSectionItem, id: string): EditableSectionItem {
  return {
    id,
    title: item.title,
    subtitle: item.subtitle || '',
    date: item.date || '',
    details: item.details.length > 0 ? [...item.details] : [''],
  };
}

function itemsFromBlocks(blocks: EditableBlock[]): EditableSectionItem[] {
  return blocks.filter((block): block is Extract<EditableBlock, { type: 'entry' }> => block.type === 'entry')
    .map((block) => block.item);
}

/** Keep the legacy buckets in sync so a caller that still reads `items` sees the stream. */
export function sectionWithBlocks(section: EditableSection, blocks: EditableBlock[]): EditableSection {
  return {
    ...section,
    blocks,
    items: itemsFromBlocks(blocks),
  };
}

export function editableBlocksFromBody(body: string): EditableBlock[] {
  return inferSectionBlocksFromBody(body).map((block, j) => inferredToEditable(block, 0, j));
}

function inferredFromEditable(blocks: EditableBlock[]): InferredBlock[] {
  return blocks.map((block) => {
    if (block.type === 'paragraph') return { type: 'paragraph', text: block.text };
    if (block.type === 'chips') {
      return {
        type: 'chips',
        chips: block.chips.map((chip) => chip.text),
      };
    }
    return {
      type: 'entry',
      item: {
        title: block.item.title,
        subtitle: block.item.subtitle || undefined,
        date: block.item.date || undefined,
        details: block.item.details,
      },
    };
  });
}

export interface EditableToMarkdownOptions {
  /**
   * Whether to emit the frontmatter block. Defaults to `true`.
   *
   * Pass `false` on the save path: the stored document has no frontmatter and the database
   * columns are the authority (ADR-0003), so emitting one would send the server a stale
   * second copy of the metadata. Keep the default for a downloaded `.md`, where the block is
   * what makes the file self-describing.
   */
  includeFrontmatter?: boolean;
}

export function editableToMarkdown(
  frontmatter: EditableFrontmatter,
  sections: EditableSection[],
  options: EditableToMarkdownOptions = {}
): string {
  const lines: string[] = [];

  // Serialised, not concatenated. See the module doc comment: this is the export boundary,
  // and it is the only place frontmatter is produced for a stored document.
  //
  // `includeFrontmatter: false` skips it, which is what the **save** path uses (ticket 15):
  // the server stores a document without frontmatter and is the sole metadata authority, so
  // sending a frontmatter block would be sending a second, stale copy of the columns — the
  // exact shape of the defect ADR-0003 removed. The export path keeps the default, because a
  // downloaded `.md` is meant to be self-describing.
  if (options.includeFrontmatter !== false) {
    const head = serializeFrontmatter(frontmatter);
    if (head) {
      lines.push(head);
    }
  }

  // Build sections
  for (const section of sections) {
    lines.push(`## ${section.title}`);

    if (section.blocks) {
      const body = serializeSectionBlocks(inferredFromEditable(section.blocks));
      if (body) lines.push(body);
      lines.push('');
      continue;
    }

    if (section.content.trim()) {
      lines.push(section.content.trim());
    }

    for (const item of section.items) {
      const itemTitle = item.subtitle
        ? `### ${item.title} | ${item.subtitle}`
        : `### ${item.title}`;
      lines.push(itemTitle);

      if (item.date) {
        lines.push(`*${item.date}*`);
      }

      for (const detail of item.details) {
        if (detail.trim()) {
          lines.push(`- ${detail.trim()}`);
        }
      }

      lines.push('');
    }

    if (section.items.length === 0) {
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function createEmptySection(): EditableSection {
  return {
    id: newEditableId('section-new'),
    title: '新模块',
    content: '',
    items: [],
    blocks: [],
  };
}

export function createEmptyItem(): EditableSectionItem {
  return {
    id: newEditableId('item-new'),
    title: '',
    subtitle: '',
    date: '',
    details: [''],
  };
}

export function createEmptyParagraphBlock(): Extract<EditableBlock, { type: 'paragraph' }> {
  return { id: newEditableId('block'), type: 'paragraph', text: '' };
}

export function createEmptyEntryBlock(): Extract<EditableBlock, { type: 'entry' }> {
  return { id: newEditableId('block'), type: 'entry', item: createEmptyItem() };
}

export function createEmptyChipGroupBlock(initial = ''): Extract<EditableBlock, { type: 'chips' }> {
  return {
    id: newEditableId('block'),
    type: 'chips',
    chips: [{ id: newEditableId('chip'), text: initial }],
  };
}

export function createEmptyChip(text = ''): EditableChip {
  return { id: newEditableId('chip'), text };
}
