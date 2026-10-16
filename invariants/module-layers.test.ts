/**
 * Module layering, asserted: who may import whom.
 *
 * A colocated test protects a module's behaviour. These rules protect the *shape of the graph*,
 * which has no single file to sit beside — and each one exists because breaking it is possible,
 * silent, and expensive:
 *
 *   - `resume-model.ts` is the leaf the resume vocabulary lives in, so it imports nothing.
 *   - Nothing the parser imports may import the parser back. The cycle that used to exist
 *     (`resume-section.ts` → `resume-parser.ts`, for `ResumeSection`/`SectionKind`) made the
 *     parser impossible to retire: its readers depended on the module that was meant to be
 *     deleted (ADR-0003), so "delete the parser" was an 18-file rewrite.
 *   - A barrel's members may not import the barrel. `ui/ConfirmModal.tsx` did, which is a real
 *     cycle resolved by module evaluation order.
 *   - `src/lib/**` may not import `src/components/**`, with one sanctioned exception (below).
 *     `lib/resume-starters.ts` imported the template registry from `components/resume-render`,
 *     which dragged two `.tsx` renderers into the module graph of the starter catalogue. An
 *     exception is written down here rather than tolerated quietly.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** `src/`, resolved from this file's own location so the test runs from any cwd. */
const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function read(...parts: string[]): string {
  return readFileSync(join(SRC, ...parts), 'utf8');
}

/** Every application `.ts`/`.tsx` under `src/`, as an absolute path. Tests are excluded. */
function applicationSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(SRC);
  return out;
}

/** The file's source, or `null` when there is no file at that path. */
function readIfPresent(...parts: string[]): string | null {
  try {
    return read(...parts);
  } catch {
    return null;
  }
}

/** Every module specifier a file imports, including `export ... from` re-exports. */
function importsOf(source: string): string[] {
  const statements = /(?:^|\n)\s*(?:import|export)\s[\s\S]*?from\s*'([^']+)'/g;
  const bare = /(?:^|\n)\s*import\s*'([^']+)'/g;
  return [...source.matchAll(statements), ...source.matchAll(bare)].map((m) => m[1]);
}

describe('resume-model is the leaf the resume vocabulary lives in', () => {
  it('imports nothing at all', () => {
    // The moment it imports something, its readers inherit that dependency and the module stops
    // being the place a retiring parser can safely leave its types behind.
    expect(importsOf(read('lib', 'resume-model.ts'))).toEqual([]);
  });
});

describe('the frontend parser can be retired by deleting it', () => {
  const parser = read('lib', 'resume-parser.ts');

  it('exports no types, because a reader cannot survive one being deleted', () => {
    // Everything a reader needs from the parser has to be a function; the shapes live in
    // `resume-model.ts`. `export type { … } from './resume-parser'` is the loophole this closes.
    expect(parser).not.toMatch(/^export\s+(?:interface|type)\s/m);
  });

  it('is not imported back by anything it imports', () => {
    const local = importsOf(parser).filter((specifier) => specifier.startsWith('.'));
    expect(local.length).toBeGreaterThan(0);

    for (const specifier of local) {
      const target = `${specifier.slice(2)}.ts`;
      expect(importsOf(read('lib', target)), `${target} imports the parser back`).not.toContain(
        './resume-parser'
      );
    }
  });
});

/**
 * A barrel's own members must not import the barrel.
 *
 * `components/ui/index.ts` exports `ConfirmModal`, and `ConfirmModal` imported `Button` **from that
 * barrel** — a real runtime cycle, resolved by module evaluation order rather than by design. It
 * worked, which is exactly why it survives review; the same shape in a module with a top-level
 * side effect would not.
 *
 * Type-only imports are exempt: they are erased and cannot cycle.
 */
describe('a barrel and its members do not import each other', () => {
  const barrels = [
    ['components', 'ui'],
    ['components', 'layout'],
  ] as const;

  it('re-exports only members that do not import it back', () => {
    let membersChecked = 0;

    for (const [dir, name] of barrels) {
      const source = read(dir, name, 'index.ts');
      const specifier = `@/components/${name}`;
      const members = [...source.matchAll(/from\s*'\.\/([A-Za-z0-9_/-]+)'/g)].map((m) => m[1]);

      for (const member of members) {
        const memberSource =
          readIfPresent(dir, name, `${member}.tsx`) ?? readIfPresent(dir, name, `${member}.ts`);
        // A barrel may re-export a directory or a module this scan cannot read; only what it
        // did read is asserted, and the count below keeps the check from becoming vacuous.
        if (memberSource === null) continue;
        membersChecked += 1;

        const valueImports = memberSource
          .split('\n')
          .filter((line) => line.includes(`from '${specifier}'`) && !line.includes('import type'));
        expect(valueImports, `${name}/${member} imports its own barrel`).toEqual([]);
      }
    }

    expect(membersChecked).toBeGreaterThan(5);
  });
});

/**
 * `src/lib/**` may not import `src/components/**`.
 *
 * `lib` is the layer components depend on, not the other way round: a module in `lib` that imports a
 * component cannot be used by a Node script (`.tsx` cannot be stripped by `node`), cannot be tested
 * without a DOM, and pulls the whole component graph — including React — into whatever imports it.
 *
 * # The exception, and why it is an exception
 *
 * `export-pdf.tsx` is a `'use client'` DOM orchestrator: it is in `lib` for its call sites but by
 * nature it must mount a component. ADR-0001/0007 make that deliberate, so it is listed here rather
 * than silently tolerated — a new entry in this list should have to argue for itself.
 */
describe('lib does not depend on components', () => {
  const SANCTIONED = new Set(['export-pdf.tsx']);

  it('is imported by components, never the reverse', () => {
    const libDir = join(SRC, 'lib');
    const files = applicationSourceFiles().filter((file) => file.startsWith(libDir));
    expect(files.length).toBeGreaterThan(20);

    for (const file of files) {
      const name = relative(libDir, file);
      if (SANCTIONED.has(name)) continue;

      const offenders = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /from\s*'@\/components\//.test(line) || /from\s*'\.\.\/components\//.test(line));
      expect(offenders, `src/lib/${name} imports a component`).toEqual([]);
    }
  });
});
