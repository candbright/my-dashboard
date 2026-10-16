/**
 * Mixed section components: paragraph, entry, chip-group.
 *
 * # Why this exists
 *
 * A section used to be two buckets — `content` (always drawn first) and `items` (always after).
 * That cannot represent "a paragraph, then a job, then a row of skill chips": the document order
 * is lost the moment it is parsed into those two fields.
 *
 * The markdown the user writes *does* have an order. This module is the inference of that order
 * (option 1 of the editor design):
 *
 *   - a `###` heading starts an **entry** (date on the next line, then consecutive bullets as
 *     details). The entry ends at the first blank line, heading, or non-bullet.
 *   - consecutive `- item` / `* item` lines that are *not* inside an entry are a **chip group**;
 *     commas on a chip line split into chips on load, and save writes one chip per line.
 *   - any other non-blank run is a **paragraph**.
 *
 * `content` and `items` stay exactly as the Go parser fills them (ADR-0003). Blocks are an extra
 * reading, used by the editor and the preview, derived from the section body rather than from
 * those two buckets — so a mixed document round-trips through markdown, and the parity tests
 * that pin `content`/`items` keep passing.
 */

import type { ResumeSection, ResumeSectionBlock, ResumeSectionItem } from './resume-model';

export type InferredBlock = ResumeSectionBlock;

const H3 = /^### (.+)$/;
const BULLET = /^[-*] (.+)$/;

/**
 * Separators that split one bullet into several chips on load.
 *
 * Narrower than `splitSkillList`: a chip the user saved as `- CI/CD` must come back as one
 * chip, and `/` is a skill-list separator on the server. Commas (and their CJK / semicolon
 * cousins) are what people actually type when they still put two skills on one line.
 */
const CHIP_LINE_SEPARATORS = /[,，、;；]+/;

export function splitChipLine(value: string): string[] {
  if (!value) return [];
  return value
    .split(CHIP_LINE_SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * A date written on its own line, copied in spirit from `resume-parser.ts`.
 *
 * Used only to skip stray date lines that do not belong to an entry, and to read the date
 * immediately under a `###`. A looser check than the parser's `looksLikeDate` is fine here:
 * a line we skip is not deleted from the document, it is simply not a block of its own.
 */
function dateOnItsOwnLine(line: string): string | undefined {
  if (/^[-*] /.test(line)) return undefined;
  const candidate = /^\*(.+)\*$/.exec(line)?.[1]?.trim() ?? line.trim();
  if (!candidate) return undefined;
  if (!/\d{4}/.test(candidate)) return undefined;
  if (!/[./\-年]/.test(candidate) && !/(至今|现在|present|now|current)/i.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function parseItemHeading(heading: string): ResumeSectionItem {
  const parts = heading.split('|').map((part) => part.trim());

  let date: string | undefined;
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const asDate = dateOnItsOwnLine(last);
    if (asDate !== undefined) {
      date = asDate;
      parts.pop();
    }
  }

  return {
    title: parts[0] ?? '',
    subtitle: parts.length > 1 ? parts.slice(1).join(' | ') : undefined,
    date,
    details: [],
  };
}

/**
 * Infer a component stream from the lines of one section (no `##` header).
 */
export function inferSectionBlocks(lines: string[]): InferredBlock[] {
  const blocks: InferredBlock[] = [];
  let i = 0;

  const skipBlanks = () => {
    while (i < lines.length && lines[i].trim() === '') i += 1;
  };

  while (i < lines.length) {
    skipBlanks();
    if (i >= lines.length) break;

    const line = lines[i];
    const h3 = H3.exec(line);
    if (h3) {
      const item = parseItemHeading(h3[1].trim());
      i += 1;
      skipBlanks();
      if (i < lines.length) {
        const date = dateOnItsOwnLine(lines[i]);
        if (date !== undefined) {
          item.date = date;
          i += 1;
          skipBlanks();
        }
      }
      // Consecutive bullets are this entry's details. A blank line ends the run so a
      // later `- chip` can start a chip group; blanks *before* the first detail are
      // just markdown spacing and are skipped above.
      while (i < lines.length && BULLET.test(lines[i])) {
        const text = BULLET.exec(lines[i])?.[1]?.trim();
        if (text) item.details.push(text);
        i += 1;
      }
      blocks.push({ type: 'entry', item });
      continue;
    }

    if (BULLET.test(line)) {
      const chips: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        const raw = BULLET.exec(lines[i])?.[1]?.trim() ?? '';
        chips.push(...splitChipLine(raw));
        i += 1;
      }
      if (chips.length > 0) blocks.push({ type: 'chips', chips });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      if (current.trim() === '') break;
      if (H3.test(current) || BULLET.test(current)) break;
      if (dateOnItsOwnLine(current.trim()) !== undefined) {
        i += 1;
        continue;
      }
      para.push(current);
      i += 1;
    }
    const text = para.join('\n').trim();
    if (text) blocks.push({ type: 'paragraph', text });
  }

  return blocks;
}

export function inferSectionBlocksFromBody(body: string): InferredBlock[] {
  const normalised = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return inferSectionBlocks(normalised.split('\n'));
}

/**
 * Fallback when only the parsed buckets exist (a server snapshot with no body to re-walk).
 *
 * Order is content-then-items, which is what those buckets can represent. Mixed order that
 * lived only in the markdown is recovered by walking the markdown instead — see
 * `attachBlocksFromMarkdown`.
 */
export function inferSectionBlocksFromParsed(section: {
  content?: string;
  items?: ResumeSectionItem[];
}): InferredBlock[] {
  const fromContent = inferSectionBlocksFromBody(section.content ?? '');
  const fromItems: InferredBlock[] = (section.items ?? []).map((item) => ({
    type: 'entry' as const,
    item: {
      title: item.title,
      subtitle: item.subtitle,
      date: item.date,
      details: item.details ?? [],
    },
  }));
  return [...fromContent, ...fromItems];
}

export function blocksOf(section: Pick<ResumeSection, 'content' | 'items'> & { blocks?: InferredBlock[] }): InferredBlock[] {
  if (section.blocks) return section.blocks;
  return inferSectionBlocksFromParsed(section);
}

/**
 * Write blocks back to a section body, in document order.
 *
 * Chip groups emit one `- chip` line each, never a comma list. Empty paragraphs and empty
 * chip groups are omitted. Empty entries still emit their heading, matching the previous
 * writer so a job the user has not filled in yet is not deleted on save.
 */
export function serializeSectionBlocks(blocks: InferredBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const text = block.text.trim();
      if (text) parts.push(text);
      continue;
    }

    if (block.type === 'chips') {
      const chips = block.chips.map((chip) => chip.trim()).filter((chip) => chip !== '');
      if (chips.length === 0) continue;
      parts.push(chips.map((chip) => `- ${chip}`).join('\n'));
      continue;
    }

    const title = block.item.subtitle
      ? `### ${block.item.title} | ${block.item.subtitle}`
      : `### ${block.item.title}`;
    const lines = [title];
    if (block.item.date) lines.push(`*${block.item.date}*`);
    for (const detail of block.item.details) {
      if (detail.trim()) lines.push(`- ${detail.trim()}`);
    }
    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * Split a full resume body into per-section inner lines (no `##` header).
 *
 * Used to attach inferred blocks onto a snapshot whose `content`/`items` have lost order.
 */
export function sectionBodiesFromMarkdown(markdown: string): { title: string; body: string }[] {
  const normalised = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Drop a frontmatter block if present — same fence the parser recognises.
  const withoutFrontmatter = normalised.startsWith('---')
    ? normalised.replace(/^---\n[\s\S]*?\n---\n?/, '')
    : normalised;

  const sections: { title: string; body: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of withoutFrontmatter.split('\n')) {
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join('\n') });
      }
      current = { title: h2[1].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) {
    sections.push({ title: current.title, body: current.lines.join('\n') });
  }
  return sections;
}

export function attachBlocksToSections<T extends ResumeSection>(
  sections: T[],
  markdown?: string | null,
): T[] {
  const bodies = markdown ? sectionBodiesFromMarkdown(markdown) : [];
  return sections.map((section, index) => {
    const body = bodies[index]?.title === section.title
      ? bodies[index].body
      : bodies.find((entry) => entry.title === section.title)?.body;
    const blocks = body !== undefined
      ? inferSectionBlocksFromBody(body)
      : inferSectionBlocksFromParsed(section);
    return { ...section, blocks };
  });
}
