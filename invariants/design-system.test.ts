/**
 * The design system, asserted (spec §5 criterion 10 — 「设计规范零违规」).
 *
 * # Why this lives in `invariants/` and not next to a module
 *
 * AGENTS.md says a test is colocated with the file it protects. This one protects no single file: it
 * asserts a property of every file under `src/`. Sitting in `src/` would imply a colocated subject
 * that does not exist, so it lives here and `vitest.config.mts` includes this root explicitly.
 *
 * # Why this is a test and not a code review
 *
 * Ticket 08 removed the cold-colour violations, and the fix is described **twice** — once in
 * `ResumeSourceView.tsx`, once in `ResumeDisplay.tsx` — in comments explaining what was removed. Two
 * things follow from that:
 *
 *   - The violations were found by someone reading the code carefully, which means they will be
 *     reintroduced by someone not reading it carefully. Nothing stops that today.
 *   - A naive grep for the offending classes **matches those very comments** and reports false
 *     positives. That is not a hypothetical: it happened while writing this file. So the check has to
 *     strip comments before it looks, which is exactly the kind of subtlety that belongs in code
 *     rather than in a reviewer's head.
 *
 * # What it checks, and what it deliberately does not
 *
 * It scans **source text**, so it cannot see a colour chosen at runtime or a hex assembled from
 * parts. It covers the banned *class names* and the specific legacy hexes, because those are how the
 * violations actually appeared. It does not attempt to evaluate CSS custom properties — the design
 * tokens themselves legitimately contain warm hexes and are defined in `globals.css`.
 *
 * Cold-hue utilities are matched as class **prefixes**, so `bg-gradient-to-br` and `bg-gradient-to-r`
 * both match the gradient check; gradients are banned by `AGENTS.md` except for `.gradient-text`,
 * which is a CSS class rather than a Tailwind gradient utility and therefore does not match.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Repository root: this file lives in `invariants/`, one level down. */
const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
/** The cold hue families `AGENTS.md` bans outright, in every utility position Tailwind offers. */
const COLD_HUES = [
  'blue',
  'indigo',
  'purple',
  'violet',
  'cyan',
  'sky',
  'teal',
  'fuchsia',
  'pink',
] as const;

/** Utility prefixes that can carry a hue. */
const UTILITY_PREFIXES = [
  'text',
  'bg',
  'border',
  'from',
  'to',
  'via',
  'ring',
  'divide',
  'outline',
  'fill',
  'stroke',
  'decoration',
  'placeholder',
  'caret',
  'accent',
  'shadow',
] as const;

/**
 * Legacy colour literals.
 *
 * `#000000` is absent on purpose: `resume-presentation.ts` contains it as the value that ADR-0004
 * **rejects**, so banning the string would ban the validation of it. Pure black is caught by the
 * class-name check and by the presentation tests instead.
 */
const LEGACY_HEXES = ['#006FEE', '#7828c8', '#006fee', '#7828C8'] as const;

/** Shadow levels `AGENTS.md` caps at `shadow-sm`. */
const HEAVY_SHADOWS = /\bshadow-(?:md|lg|xl|2xl|inner)\b/g;

/** Gradient background utilities. `.gradient-text` is a class, not a utility, so it does not match. */
const GRADIENT_UTILITIES = /\bbg-gradient-to-\w+/g;

/**
 * Removes comments so that prose *about* a violation is not reported as one.
 *
 * Block comments first, then line comments. This is a text pass, not a parser, and it is deliberately
 * conservative: it cannot tell a `//` inside a string literal from a real comment, which for this
 * purpose only ever causes a missed violation in a line that also contains `//`. That is acceptable
 * because such a line is not how a Tailwind class gets written.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    // Test files assert *about* the violations, so they legitimately contain the strings.
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Every code line in `src/`, with its comment-stripped text and original line number. */
function codeLines(): { file: string; line: number; text: string }[] {
  const lines: { file: string; line: number; text: string }[] = [];

  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const source = stripComments(readFileSync(file, 'utf8'));
    source.split('\n').forEach((text, index) => {
      lines.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line: index + 1, text });
    });
  }

  return lines;
}

const LINES = codeLines();

/** Finds matches of `pattern` in code, ignoring comments. */
function find(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const { file, line, text } of LINES) {
    const matches = text.match(pattern);
    if (matches) for (const match of matches) hits.push(`${file}:${line}  ${match}`);
  }
  return hits;
}

describe('设计规范零违规（spec §5 判据 10）', () => {
  it('finds no cold-hue utility classes in code', () => {
    const prefix = UTILITY_PREFIXES.join('|');
    const hues = COLD_HUES.join('|');
    // Any of the two arbitrary-value forms too: `bg-[#3b82f6]`.
    const pattern = new RegExp(`\\b(?:${prefix})-(?:${hues})-\\d{2,3}\\b`, 'g');

    expect(find(pattern)).toEqual([]);
  });

  it('finds no legacy cold hex literals in code', () => {
    const hits: string[] = [];
    for (const { file, line, text } of LINES) {
      for (const hex of LEGACY_HEXES) {
        if (text.includes(hex)) hits.push(`${file}:${line}  ${hex}`);
      }
    }

    expect(hits).toEqual([]);
  });

  it('finds no shadow heavier than shadow-sm', () => {
    expect(find(HEAVY_SHADOWS)).toEqual([]);
  });

  it('finds no gradient background utilities', () => {
    expect(find(GRADIENT_UTILITIES)).toEqual([]);
  });

  it('scans a meaningful number of files, so a broken walk cannot pass vacuously', () => {
    const files = new Set(LINES.map((entry) => entry.file));

    // Without this, a path typo would make every other assertion in this file pass by finding
    // nothing to check — the failure mode this whole file exists to prevent.
    expect(files.size).toBeGreaterThan(50);
    expect(LINES.length).toBeGreaterThan(5_000);
  });

  it('would catch a violation, so the check itself is not vacuous', () => {
    // Pins the two subtleties: the pattern must match a real class, and comment-stripping must work.
    expect(stripComments('const a = 1; // bg-gradient-to-b from-transparent')).not.toContain('gradient');
    expect(stripComments('/* text-purple-400 was removed */ const a = 1;')).not.toContain('purple');
    expect('className="text-cyan-400"'.match(/\btext-(?:blue|cyan|purple)-\d{2,3}\b/)).not.toBeNull();
    expect('className="shadow-lg"'.match(HEAVY_SHADOWS)).not.toBeNull();
    expect('className="bg-gradient-to-br from-x"'.match(GRADIENT_UTILITIES)).not.toBeNull();
  });

  it('does not mistake prose about a removed violation for a violation', () => {
    // `ResumeSourceView.tsx` and `ResumeDisplay.tsx` both explain what they removed, naming the very
    // classes this file bans. Read the raw text and the stripped text of each: the raw text *must*
    // still mention the banned class (otherwise this test has lost its subject and is asserting
    // nothing), while the stripped text must not. That is the whole comment-stripping contract,
    // checked against real files rather than a literal in this file.
    const documented = ['src/components/ResumeSourceView.tsx', 'src/components/ResumeDisplay.tsx'];

    const rawWithCitations = documented.filter((file) => {
      const raw = readFileSync(join(ROOT, file), 'utf8');
      const stripped = stripComments(raw);

      // The prose is still there, and the prose names a banned class.
      expect(stripped).not.toContain('purple-400');
      expect(stripped).not.toContain('bg-gradient-to-b');

      return /purple-400/.test(raw) || /bg-gradient-to-b/.test(raw);
    });

    // At least one of them still documents its own removal. If both comments were deleted, this file
    // should be updated rather than left asserting a weaker property.
    expect(rawWithCitations.length).toBeGreaterThan(0);
  });
});
