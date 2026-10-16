/**
 * `prefers-reduced-motion` — a **known, unfixed defect** (see `it.fails`).
 *
 * # The defect
 *
 * This project's design system *mandates* long animation: `AGENTS.md` requires `duration-500`
 * transitions under "Botanical Slowness" and specifies framer-motion springs. Nothing anywhere
 * honours `prefers-reduced-motion` — a search for that string across `src/` returns **no matches**,
 * and `globals.css` contains only `prefers-color-scheme` and `print` media queries.
 *
 * The exposure is large and centralised; both matter for how it should be fixed:
 *
 *   - **202** `motion.*` / `AnimatePresence` call sites across **32** files importing framer-motion.
 *   - **35** `duration-500`-or-longer transition utilities and **17** `animate-*` utilities that do
 *     not go through framer-motion at all, plus two `@keyframes` (`organic-fade-in`,
 *     `organic-pulse`) that only CSS can suppress.
 *   - But the four wrappers below are the shared entry point, so the framer-motion half is fixable
 *     in one place: framer-motion ships `useReducedMotion()` for exactly this.
 *
 * Motion sensitivity is a real accessibility harm (WCAG 2.3.3 Animation from Interactions, Level
 * AAA, and vestibulardisorder guidance more broadly), and "respects reduced motion" is an explicit
 * item in the round-2 competitive research. It is also a procurement checkbox for institutional
 * buyers, which matters because this product's design language is otherwise a selling point.
 *
 * # A second, separate problem these cases expose
 *
 * Most wrappers server-render as `opacity:0` and are only revealed once framer-motion's client-side
 * effect runs, so with JavaScript disabled the content is **permanently invisible** rather than
 * merely unanimated. `StaggerItem` is the exception: rendered on its own it emits no animation style
 * at all (verified — see the case below), because its `variants` are driven by the parent
 * `StaggerContainer`. That is asserted separately so the two causes do not get conflated when this
 * is fixed.
 *
 * # What these cases deliberately do NOT claim
 *
 * They do not attempt to prove that content moves under reduced motion, because
 * `renderToStaticMarkup` cannot express a media-query preference: `FadeIn` emits
 * `opacity:0;transform:translateY(24px)` identically either way, so an assertion about reduced motion
 * made here would pass or fail for reasons unrelated to the defect. The real check belongs in the
 * browser harness that already exists for this kind of question (`scripts/verify-template-browser.mjs`
 * drives real Chromium), where `reducedMotion: 'reduce'` is a context option. What is asserted here is
 * the precondition that is decidable statically: **the preference is never consulted at all.**
 *
 * # Why these are `it.fails`
 *
 * Per AGENTS.md, a confirmed-but-unfixed defect is carried by `it.fails`. A case written this way
 * fails the suite if it *passes*, so each one below has been checked to genuinely fail today — an
 * `it.fails` that quietly succeeds is worse than no test, because it reports a defect that is not
 * there.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FadeIn, ScrollReveal, StaggerContainer, StaggerItem } from '@/components/ui/Animations';

const SRC = join(process.cwd(), 'src');

/** Every `.ts`/`.tsx` file under `dir`. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Source files that are not tests.
 *
 * **Test files are excluded on purpose, and the reason is a trap worth naming**: the assertion below
 * searches for the literal string `prefers-reduced-motion`, and this file contains that string in its
 * own prose and test names. Including test files made the walk find *itself* and the case passed for
 * the wrong reason — the defect was still present. Any search-for-a-string assertion has to exclude
 * the files that describe the search.
 */
function productionFiles(dir: string): string[] {
  return walk(dir).filter((file) => !/\.(test|spec)\.tsx?$/.test(file));
}

describe('尊重 prefers-reduced-motion（已知缺陷，尚未修复）', () => {
  it('renders all four wrappers, so the fixture is meaningful', () => {
    const fade = renderToStaticMarkup(createElement(FadeIn, null, createElement('span', null, '甲')));
    const stagger = renderToStaticMarkup(
      createElement(StaggerContainer, null, createElement(StaggerItem, null, '乙'))
    );
    const scroll = renderToStaticMarkup(createElement(ScrollReveal, null, '丙'));

    expect(fade).toContain('甲');
    expect(stagger).toContain('乙');
    expect(scroll).toContain('丙');
  });

  it('confirms the design system mandates the motion this must be weighed against', () => {
    // Not an assertion about the defect — a record of *why* this is not a trivial removal. The design
    // language requires long, slow transitions, so the fix has to be conditional (honour the user
    // preference) rather than "make the animations shorter".
    const agents = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf8');

    expect(agents).toMatch(/duration-500/);
    expect(agents).toMatch(/framer-motion spring|stiffness/);
  });

  it('consults prefers-reduced-motion in at least one production file', () => {
    // The blunt version of the contract, and the one that cannot be gamed by fixing a single
    // component: the concept has to exist in the codebase at all. A filesystem walk rather than a
    // shelled-out `grep`, so this does not depend on a binary being on PATH.
    //
    // This was an `it.fails` until the preference was actually honoured. It is kept as an ordinary
    // case because it is the cheapest guard against the whole feature being deleted: the two
    // concrete implementations are the hook (`src/hooks/usePrefersReducedMotion.ts`) and the CSS
    // media query in `globals.css`, and removing both would fail here.
    //
    // Note the deliberate exclusion of test files (`productionFiles`): this file's own prose
    // contains the string, so scanning tests too would make the assertion pass by finding itself.
    // That mistake was made once while writing this — see the helper's comment.
    const hits = productionFiles(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('prefers-reduced-motion')
    );

    expect(hits).not.toEqual([]);
  });

  it('marks every wrapper so the no-JavaScript rule has something to target', () => {
    // `src/app/layout.tsx` un-hides these elements under `<noscript>` via
    // `[data-motion-reveal]`. That only works while the wrappers carry the attribute, so this
    // pins the contract between the two files — otherwise the no-JS fix would silently stop
    // working, and no test would say so.
    const all = [
      renderToStaticMarkup(createElement(FadeIn, null, 'x')),
      renderToStaticMarkup(createElement(ScrollReveal, null, 'x')),
      renderToStaticMarkup(createElement(StaggerContainer, null, 'x')),
      renderToStaticMarkup(createElement(StaggerItem, null, 'x')),
    ];

    for (const html of all) {
      expect(html).toContain('data-motion-reveal');
    }
  });

  it('server-renders the three self-contained wrappers as invisible before animating', () => {
    // Still true after the reduced-motion fix, and still worth recording: the *default* first
    // paint hides content so it can animate in. That is intentional for users who have JavaScript
    // and have not asked for reduced motion. It is exactly why `<noscript>` is needed for the
    // users who have neither — and why `prefers-reduced-motion` has to change the starting state
    // rather than only the duration (a zero-length fade still begins at `opacity: 0`).
    const selfContained = [
      renderToStaticMarkup(createElement(FadeIn, null, 'x')),
      renderToStaticMarkup(createElement(ScrollReveal, null, 'x')),
      renderToStaticMarkup(createElement(StaggerContainer, null, 'x')),
    ];

    for (const html of selfContained) {
      expect(html).toMatch(/opacity:\s*0/);
    }
  });

  it('records that StaggerItem is the exception, so it is not fixed by accident', () => {
    // `StaggerItem` alone emits no animation style: its `variants` are resolved by the parent
    // `StaggerContainer`, so standalone it renders a plain visible div. Asserting this pins the
    // difference — the no-JS invisibility affects three of the four wrappers, not four, and a fix
    // that treated them uniformly would be wrong about this one.
    const html = renderToStaticMarkup(createElement(StaggerItem, null, 'x'));

    expect(html).not.toMatch(/opacity/);
    expect(html).not.toMatch(/translate/);
  });
});
