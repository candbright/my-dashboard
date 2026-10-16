/**
 * Plain-text (.txt) resume export, optimised for ATS parsing rather than for looks.
 *
 * ## Why this exists at all
 *
 * Market research turned up a counter-intuitive pattern among the leading resume
 * products: they put the *ATS-safe* format in the **free** tier. Resume.io, Zety and
 * MyPerfectResume all give away TXT only. The reasoning is that plain text is
 * worthless and design is what people pay for — and, notably, no domestic product
 * treats plain-text export as a first-class feature.
 *
 * The cost is small and the signal is high, so this is a cheap differentiator.
 *
 * ## What "optimised for ATS" actually means
 *
 * Every rule below is a deliberate restraint, and each one is a thing a naive
 * implementation gets wrong:
 *
 *   - **No decorative characters.** `│`, `═`, `▪`, `•`, `◆` look tidy and are read as
 *     content by parsers. Bullets use `- `.
 *   - **No columns, real or simulated.** Padding with spaces to fake a two-column
 *     layout produces runs of whitespace that parsers collapse inconsistently, and
 *     the field-boundary heuristics in some ATS engines then mis-assign values.
 *   - **No tabs.** Same reason; they are also ambiguous on decode.
 *   - **One field per line for contact details.** An ATS extracts `email` and `phone`
 *     by pattern, and a line containing both risks the pattern grabbing a span that
 *     crosses them.
 *   - **Section headings as plain lines**, separated by blank lines, so the
 *     heading→content association is unambiguous.
 *   - **Markdown is stripped.** A resume is authored in Markdown, and `**负责**` in a
 *     TXT file is not emphasis — it is noise the parser has to strip, or worse, text
 *     that ends up in the extracted field verbatim.
 *
 * Deliberately NOT done: any wrapping, alignment, or centring. The file is meant to
 * be read by a machine, and secondarily by a human in a monospace editor.
 *
 * ## Related work
 *
 * Ticket 07 (the ATS preview UI) reuses this module rather than reimplementing it —
 * the whole point being that the preview shows *the bytes that will be exported*.
 */

/**
 * The document shape this renderer consumes.
 *
 * It is declared structurally rather than imported from `@/lib/resume-parser` on
 * purpose. Ticket 18 replaces the client-side parser with a server-authoritative
 * `StructuredContent`, and this module should not have to change when that happens:
 * anything with these fields — `frontmatter` and `sections` — satisfies it, so the
 * parser's `ParsedResume` is accepted today and the future type will be accepted
 * later, with no edit here and no second implementation.
 */
export interface PlainTextContact {
  name?: unknown;
  title?: unknown;
  email?: unknown;
  phone?: unknown;
  location?: unknown;
  website?: unknown;
  github?: unknown;
  linkedin?: unknown;
}

export interface PlainTextSection {
  title: unknown;
  content?: unknown;
  items?: PlainTextItem[];
}

export interface PlainTextItem {
  title?: unknown;
  subtitle?: unknown;
  date?: unknown;
  details?: unknown[];
}

export interface PlainTextSource {
  frontmatter?: PlainTextContact;
  sections?: PlainTextSection[];
}

/**
 * Characters that are decorative to a human and *content* to a parser.
 *
 * These are removed rather than passed through, because an author who typed a `│`
 * or a `▪` into their resume has put a character in the file that an ATS will try to
 * interpret. Box-drawing and bullet glyphs are the two families that most often
 * collide with a parser's field-boundary heuristics.
 *
 * `·` is included: the visual display uses it as a separator, and a middot in a TXT
 * export is exactly the "decoration" the ticket rules out.
 */
const DECORATION_PATTERN = /[│┃║═━─┄┅┆┇┊┋▪▫•‣∙◆◇◼◻★☆·※]/g;

/** Normalises CRLF and lone CR to LF. Text files must not carry a stray CR. */
export function normaliseLineEndings(value: string): string {
  return asText(value).replace(/\r\n?/g, '\n');
}

/**
 * Removes the scaffolding of a Markdown table, keeping its cells.
 *
 * A table cannot survive as a table in plain text — that would *be* the column
 * layout the ticket forbids — so the delimiter row goes and the pipes become spaces.
 * The cell text stays, because a project table's contents are real resume content.
 */
export function stripMarkdownTables(markdown: string): string {
  return normaliseLineEndings(markdown)
    // The `| --- | --- |` rule row carries no content at all.
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{2,}:?[ \t]*\|)+[ \t]*:?-{2,}:?[ \t]*\|?[ \t]*$/gm, '')
    // Remaining row pipes: a separator between cells becomes a space, so the cells do
    // not run together into one word.
    .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_match, row: string) => row.replace(/\|/g, ' | '))
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * Strips Markdown syntax down to its visible text.
 *
 * This is *not* a general Markdown renderer and does not try to be: it exists so an
 * exported TXT does not carry `**` markers or `[text](url)` cruft into an ATS field.
 * It is exported because the ATS preview (ticket 07) must show exactly the same text,
 * and two implementations would drift.
 *
 * An empty string is returned for undefined input rather than `undefined`, so callers
 * can concatenate results without guards.
 */
export function markdownToPlainText(markdown: unknown): string {
  const source = asText(markdown);
  if (!source) return '';

  // Line endings first: every rule below anchors to `^` or `$`, and a `\r` before the
  // `\n` makes `$` fail to match, which silently disables the whole line-level set.
  let text = normaliseLineEndings(source);

  text = stripMarkdownTables(text);

  // Fenced code blocks: drop the fence and the language tag, keep the code. Resume
  // text rarely has these, but the fence characters themselves must never survive.
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*$/gm, '');

  // Images before links, or the link rule would consume `[alt]` and leave `(url)`
  // plus a stray `!`.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Bare autolinks, so an address is not wrapped in angle brackets.
  text = text.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1');

  // ATX headings. Runs before the emphasis rules so a `#` in a heading is handled
  // once, and so `# ` cannot be mistaken for list content later.
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');

  // Blockquote and list markers at line start. Ordered lists keep their number: the
  // ordinal carries meaning an ATS may use, while `- ` does not.
  text = text.replace(/^[ \t]*>[ \t]?/gm, '');
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  text = text.replace(/^[ \t]*(\d{1,3})[.)][ \t]+/gm, '$1. ');

  // Thematic breaks become blank lines: `---` in an exported field is junk.
  text = text.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '');

  // Emphasis and strikethrough, longest delimiters first so `***x***` resolves
  // rather than leaving a stray marker behind.
  text = text.replace(/(\*{3}|_{3})(?=\S)([\s\S]*?\S)\1/g, '$2');
  text = text.replace(/(\*{2}|_{2})(?=\S)([\s\S]*?\S)\1/g, '$2');
  text = text.replace(/(?<!~)~~(?=\S)([\s\S]*?\S)~~/g, '$1');
  text = text.replace(/(\*|_)(?=\S)([^*_\n]*?\S)\1/g, '$2');

  // Inline code last: `code` spans may legitimately contain `*` or `_`, and removing
  // the backticks after the emphasis pass avoids mangling them.
  text = text.replace(/`([^`\n]+)`/g, '$1');

  // Any leftover backslashes were escaping punctuation for Markdown, not for text.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');

  // Decoration and whitespace last, so the rules above see the original structure.
  text = text.replace(DECORATION_PATTERN, ' ');

  return text.trim();
}

/** `*2021.03 - 至今*` → `2021.03 - 至今`. */
function stripDateEmphasis(date: unknown): string {
  return asText(date).replace(/^\*+|\*+$/g, '').trim();
}

/** Joins the parts of an entry's first line, dropping the empty ones. */
function entryHeadline(item: PlainTextItem): string {
  return [item.title, item.subtitle, stripDateEmphasis(item.date)]
    .map((part) => normaliseInlineWhitespace(markdownToPlainText(asText(part))))
    .filter((part) => part !== '')
    .join(' | ');
}

/**
 * Renders a resume as ATS-friendly plain text.
 *
 * A single trailing newline is appended: it is the convention for text files, and
 * every POSIX tool copes with it better than a file that ends mid-line.
 */
export function resumeToPlainText(source: PlainTextSource): string {
  const contact = source.frontmatter ?? {};
  const lines: string[] = [];

  // ── Header ──
  // Name and job title get a blank line between them so a parser that treats the
  // first line as the candidate name is not handed "张三 后端工程师" as one string.
  const name = headerValue(contact.name);
  const title = headerValue(contact.title);
  if (name) lines.push(name);
  if (title) {
    if (name) lines.push('');
    lines.push(title);
  }

  // ── Contact ── one value per line, no separators, no decoration.
  const contactValues = [
    contact.email,
    contact.phone,
    contact.location,
    contact.website,
    contact.github,
    contact.linkedin,
  ]
    .map((value) => headerValue(value))
    .filter((value) => value !== '');

  if (contactValues.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(...contactValues);
  }

  // ── Sections ──
  for (const section of source.sections ?? []) {
    const body: string[] = [];

    // A section's own prose comes first, then its entries. `content` is Markdown and
    // may hold several paragraphs, so each is emitted separately.
    const content = markdownToPlainText(section.content);
    if (content) {
      for (const paragraph of content.split(/\n{2,}/)) {
        const cleaned = paragraph
          .split('\n')
          .map((line) => normaliseInlineWhitespace(line))
          .filter((line) => line !== '')
          .join('\n');
        if (cleaned) body.push(cleaned);
      }
    }

    for (const item of section.items ?? []) {
      const headline = entryHeadline(item);
      if (headline) body.push(headline);

      for (const detail of item.details ?? []) {
        // `- ` and nothing else: a glyph here would be read as content.
        const text = markdownToPlainText(detail);
        if (text) body.push(`- ${normaliseInlineWhitespace(text)}`);
      }
    }

    const heading = headerValue(section.title);
    // An empty section would export a heading with nothing under it, which reads as a
    // parser error rather than as content.
    if (!heading || body.length === 0) continue;

    if (lines.length > 0) lines.push('');
    lines.push(heading, '', ...body);
  }

  let output = normaliseLineEndings(lines.join('\n'))
    // Collapse runs of blank lines; the section loop can leave two adjacent.
    .replace(/\n{3,}/g, '\n\n')
    // Last line of defence for the no-columns rule: any run of spaces that survived
    // the per-line normalisation is padding, not content.
    .replace(/[ \t]{2,}/g, ' ')
    .trimEnd();

  if (output) output += '\n';
  return output;
}

/**
 * Coerces a frontmatter value to a string, tolerating what YAML actually produces.
 *
 * `phone: 13800138000` in YAML parses to a **number**, not a string, and
 * `ResumeRecord.name`/`phone` etc. are typed `string | null` by mirroring the API but
 * are not enforced at runtime. An earlier revision called `.replace()` on those
 * values directly and threw `value.replace is not a function`, which aborted the
 * whole export for any resume whose phone number was not quoted.
 *
 * Declared as `unknown` on purpose: the point is that the runtime value cannot be
 * trusted to match the declared type.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/** Header-ish single values: strip Markdown, collapse whitespace, drop decoration. */
function headerValue(value: unknown): string {
  return normaliseInlineWhitespace(markdownToPlainText(asText(value)));
}

/**
 * Collapses internal runs of whitespace inside a single value.
 *
 * Markdown source is often wrapped or indented, and a tab, a double space or a
 * non-breaking space inside one bullet would make the bullet look like a fake-column
 * layout to a parser. Tabs are turned into a single space rather than preserved:
 * a tab in an exported field is exactly what the ticket rules out, but deleting it
 * outright would join two words.
 *
 * Newlines are preserved — a bullet spanning lines is still one bullet, and the
 * caller decides how to join them.
 */
export function normaliseInlineWhitespace(value: string): string {
  return value.replace(/[ \t\u00a0]+/g, ' ').trim();
}

/**
 * A file name for the plain-text export: `{姓名}-{职位}.txt`.
 *
 * Unlike `resumeFileName` (which appends `-简历` for the PDF), the ATS-oriented
 * export names the candidate and the role, because that is what a recruiter's
 * document folder and many ATS upload dialogs display.
 */
export function resumeTextFileName(contact: PlainTextContact, fallback = 'resume'): string {
  const parts = [contact.name, contact.title]
    .map((part) => asText(part).trim())
    .filter((part) => part !== '');

  const base = parts.join('-') || asText(fallback).trim() || 'resume';
  // Strip characters that are illegal in Windows file names, plus characters that
  // are illegal in a Content-Disposition filename.
  const safe = base.replace(/[\\/:*?"<>|\r\n\t]/g, '-').replace(/\s+/g, ' ').trim();

  return `${safe || 'resume'}.txt`;
}

/**
 * The exact MIME type used for the download.
 *
 * `charset=utf-8` is not optional. Without it some Windows editors and older
 * browsers guess the encoding, and a UTF-8 file full of Chinese then opens as
 * mojibake — which is precisely the acceptance criterion about Notepad and VS Code.
 */
export const RESUME_TEXT_MIME = 'text/plain;charset=utf-8';

/**
 * Builds the downloadable blob for a plain-text export.
 *
 * Separate from the DOM download so the bytes are testable: this is where the UTF-8
 * encoding guarantee lives, and a test can encode, decode and compare without a
 * browser. No BOM is prepended — it is unnecessary with an explicit charset, and it
 * would be the first characters of the candidate's name to any parser that reads the
 * file as raw bytes.
 */
export function resumeTextBlob(source: PlainTextSource): Blob {
  return new Blob([resumeToPlainText(source)], { type: RESUME_TEXT_MIME });
}
