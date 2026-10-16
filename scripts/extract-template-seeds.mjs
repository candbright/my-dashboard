/**
 * One-off migration extractor: pull the 12 content seeds out of `resume-templates.ts`.
 *
 * WHY THIS EXISTS RATHER THAN A HAND EDIT
 *
 * `resume-templates.ts` holds the only copy of the 12 sample documents (tickets 20 / ADR-0008
 * require them preserved as `sampleContent`), and each is 20-50 lines of Chinese prose. Retyping
 * or hand-copying them would risk silent content loss that no type-checker can see — a dropped
 * bullet reads as valid TypeScript and valid Markdown. So the move is mechanical: this script
 * reads the old file, extracts each seed, strips the YAML frontmatter (ADR-0003 moved metadata
 * into columns, so a body must not carry it), and emits the new module.
 *
 * It also prints what it found, so the frontmatter stripping is auditable rather than trusted.
 *
 * Run:
 *   node scripts/extract-template-seeds.mjs            # report only
 *   node scripts/extract-template-seeds.mjs --write    # write the new module
 *
 * This is scratch tooling for one ticket. It is safe to delete once ticket 20 is reviewed — the
 * new module is then the source of truth and this script would only be able to overwrite it with
 * stale content.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'src', 'lib', 'resume-templates.ts');
const target = path.join(repoRoot, 'src', 'lib', 'resume-template-seeds.ts');

const lines = readFileSync(source, 'utf8').split(/\r?\n/);

/** The seed ids and display names, in file order, read from the source rather than typed. */
const ids = [];
for (let i = 0; i < lines.length; i++) {
  const idMatch = /^\s{4}id: '([^']+)',$/.exec(lines[i]);
  if (idMatch) ids.push({ id: idMatch[1], line: i, name: null });
  const nameMatch = /^\s{4}name: '(.+)',$/.exec(lines[i]);
  if (nameMatch && ids.length > 0 && ids[ids.length - 1].name === null) {
    ids[ids.length - 1].name = nameMatch[1];
  }
}

if (ids.length === 0) {
  console.error('No seed ids found — has resume-templates.ts been restructured already?');
  process.exit(1);
}
for (const entry of ids) {
  if (!entry.name) {
    console.error(`Seed ${entry.id} has no name — refusing to invent one.`);
    process.exit(1);
  }
}

/**
 * Extract the body of the `markdown` template literal belonging to the seed starting at `from`.
 * Returns the raw text between the backticks, plus the frontmatter block for reporting.
 */
function extractSeed(from, to) {
  const limit = to ?? lines.length;
  let start = -1;
  for (let i = from; i < limit; i++) {
    if (/^\s{4}markdown: `/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) throw new Error(`No markdown literal after line ${from + 1}`);

  // The literal opens on the `markdown: ` line and closes on a line that is exactly `` `, ``.
  const firstLine = lines[start].replace(/^\s{4}markdown: `/, '');
  const collected = [firstLine];
  let end = -1;
  if (firstLine.includes('`')) {
    // Single-line literal (not the shape here, but do not silently mis-parse one).
    end = start;
  } else {
    for (let i = start + 1; i < limit; i++) {
      if (/^`,$/.test(lines[i])) {
        end = i;
        break;
      }
      collected.push(lines[i]);
    }
  }
  if (end === -1) throw new Error(`Unterminated markdown literal at line ${start + 1}`);

  let text = collected.join('\n');
  if (text.endsWith('`')) text = text.slice(0, -1);

  // Strip the YAML frontmatter: a leading `---` line through the next `---`, plus the blank
  // separator line that follows it.
  let frontmatter = null;
  let body = text;
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (fmMatch) {
    frontmatter = fmMatch[1];
    body = text.slice(fmMatch[0].length);
    // Drop exactly one leading blank line so the body starts at the first heading.
    body = body.replace(/^\r?\n/, '');
  } else {
    throw new Error('Seed has no frontmatter block — unexpected shape, refusing to guess');
  }

  return { raw: text, frontmatter, body: body.replace(/\r\n/g, '\n') };
}

const seeds = ids.map((entry, index) => {
  const next = ids[index + 1];
  const { frontmatter, body } = extractSeed(entry.line, next ? next.line : undefined);
  const keys = frontmatter
    .split(/\r?\n/)
    .map((l) => /^([A-Za-z_]+):/.exec(l)?.[1])
    .filter(Boolean);
  return { ...entry, frontmatter, keys, body };
});

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`Extracted ${seeds.length} seeds from ${path.relative(repoRoot, source)}\n`);
for (const s of seeds) {
  const headingCount = (s.body.match(/^## /gm) ?? []).length;
  console.log(
    `  ${s.id.padEnd(18)} ${s.name.padEnd(10)} frontmatter keys: ${String(s.keys.length).padStart(2)} ` +
      `[${s.keys.join(', ')}]`
  );
  console.log(
    `  ${''.padEnd(18)} ${''.padEnd(10)} body: ${String(s.body.split('\n').length).padStart(3)} lines, ` +
      `${headingCount} sections, ${s.body.length} chars`
  );
}

// A sanity check that catches the failure mode this whole script exists to prevent: a body that
// lost its content to a bad slice would still be valid output, so assert the obvious invariants.
let failed = false;
for (const s of seeds) {
  if (!s.body.includes('## ')) {
    console.error(`  FAIL: ${s.id} body has no section headings`);
    failed = true;
  }
  if (/^---/m.test(s.body)) {
    console.error(`  FAIL: ${s.id} body still contains a --- fence`);
    failed = true;
  }
  if (s.body.trim().length < 80) {
    console.error(`  FAIL: ${s.id} body is suspiciously short (${s.body.trim().length} chars)`);
    failed = true;
  }
}
console.log(failed ? '\nSANITY CHECK FAILED — not writing.' : '\nSanity checks passed.');
if (failed) process.exit(1);

// ── Emit ────────────────────────────────────────────────────────────────────

const escape = (text) =>
  text
    // Backticks and `${` would terminate or interpolate the template literal we emit.
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

const entries = seeds
  .map(
    (s) => `  {
    id: '${s.id}',
    name: '${s.name}',
    body: \`${escape(s.body)}\`,
  },`
  )
  .join('\n');

// Named `output` rather than `module`: `module` is a CommonJS global, and shadowing it trips
// `@next/next/no-assign-module-variable` — which is how this was caught rather than shipped.
const output = `/**
 * The 12 starter documents, as Markdown bodies (ticket 20).
 *
 * # Where these came from
 *
 * They are the \`markdown\` fields of the old \`RESUME_TEMPLATES\` entries, moved mechanically by
 * \`scripts/extract-template-seeds.mjs\` rather than retyped. That matters: this file holds the only
 * copy of the prose, and a hand-copy that dropped a bullet would produce valid TypeScript and
 * valid Markdown — nothing would fail, the sample resume would just be quietly poorer.
 *
 * # Why they carry no YAML frontmatter
 *
 * ADR-0003 moved candidate metadata out of the document and into database columns, so a body must
 * not carry a \`---\` block. The old seeds all did, and the extractor stripped it. Two consequences
 * worth knowing:
 *
 *   - The metadata those blocks held (\`name\`, \`title\`, \`email\`, \`phone\`, \`location\`, \`github\`,
 *     \`website\`, \`linkedin\`) is **not** lost from the product — it is exactly what
 *     \`METADATA_FIELDS\` covers and what the metadata panel edits. A user starting from a starter
 *     gets an empty metadata form rather than pre-filled sample contact details, which is the
 *     better default anyway: pre-filled fake contact details are a thing people forget to replace.
 *   - Note the old key \`title\` maps to the \`job_title\` column (\`COLUMN_TO_FRONTMATTER_KEY\` in
 *     \`resume-parser.ts\`), so nothing about that mapping is implied by these bodies.
 *
 * \`blank\` is the exception in spirit: it is placeholder scaffolding ("在此编写个人简介..."), which
 * is why \`ResumeBuilderPage\` used it for the "start blank" path too. That duplicate constant is
 * gone — see \`BLANK_SEED_ID\`.
 */

/** One starter document. \`body\` is Markdown with no frontmatter. */
export interface ResumeSeed {
  id: string;
  name: string;
  body: string;
}

/**
 * The seed id used for "start from scratch".
 *
 * Named because two call sites need to agree on it: the starter gallery's blank card and the
 * builder's "start blank" button. Before ticket 20 the same document was written out twice — once
 * as the \`blank\` template's \`markdown\` and once as \`EMPTY_RESUME_MARKDOWN\` in
 * \`ResumeBuilderPage\` — and the two copies were byte-identical, so they would have drifted
 * silently. Being able to name it is the fix; the constant is the evidence it was needed.
 */
export const BLANK_SEED_ID = 'blank';

/** All starter documents, in the order the gallery shows them. */
export const RESUME_SEEDS: readonly ResumeSeed[] = [
${entries}
];

/** Look a starter document up by id. */
export function findResumeSeed(id: string): ResumeSeed | undefined {
  return RESUME_SEEDS.find((s) => s.id === id);
}
`;

if (process.argv.includes('--write')) {
  writeFileSync(target, output, 'utf8');
  console.log(`\nWrote ${path.relative(repoRoot, target)} (${output.length} chars)`);
} else {
  console.log('\n(report only — pass --write to emit the module)');
}
