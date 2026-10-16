import type { Schema } from 'hast-util-sanitize';

/**
 * The HTML sanitisation policy for user-authored resume content.
 *
 * Kept as its own module, separate from `ResumeMarkdown.tsx`, for one practical
 * reason: it is **plain data**. That lets it be imported and asserted on directly by
 * `node --experimental-strip-types` scripts and by vitest, which cannot import a
 * `.tsx` module, and it keeps the security policy reviewable in isolation from the
 * presentational code.
 *
 * ## Why an allow-list and not "strip all raw HTML"
 *
 * Resume text is user-controlled **and** publicly reachable: any registered user can
 * publish a resume and `/resume/[slug]` renders it to anonymous visitors. Raw HTML is
 * genuinely useful in a resume (a `<br>`, a `sup` for a footnote), so `rehype-raw`
 * stays in the pipeline — but it is never allowed to run without `rehype-sanitize`
 * immediately after it.
 *
 * `rehype-sanitize` works from an allow-list: anything not named in the schema is
 * removed, so a newly invented HTML element cannot become dangerous by default.
 *
 * What this refuses, explicitly:
 *   - `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<base>`,
 *     `<link>`, `<meta>` — none appear in the default `tagNames` list
 *   - every `on*` event attribute (e.g. `onerror`, `onload`)
 *   - `javascript:`, `data:` and `vbscript:` URLs
 *   - `style` attributes, which would bypass the design system entirely (and whose
 *     `url()` form is an exfiltration vector)
 *
 * ⚠️ The `protocols` block below is **load-bearing, and its shape is a trap**. A
 * mis-shaped entry does not merely fail to add a restriction — it *replaces* the
 * sanitiser's built-in dangerous-protocol table with nothing, so
 * `<a href="javascript:alert(1)">` starts surviving. Verified. See the comment on
 * that block.
 */
export const resumeSanitizeSchema = {
  // `tagNames` is deliberately omitted so the widely-vetted default list applies.
  // That list already covers everything a resume needs — headings, lists, tables,
  // `code`, `pre`, `blockquote`, `img`, and `sup`/`sub`/`br` for the raw-HTML case.
  //
  // ⚠️ **Syntax trap, verified against `hast-util-sanitize`:**
  //
  //   `a: ['href', 'title']`             → allow these two attributes, any value
  //   `code: [['className', /^hljs-/]]`  → attribute `className`, value constrained
  //   `a: [['href', 'title']]`           → ⚠️ attribute… nothing. The inner array is
  //                                        read as a list of allowed *values*, so
  //                                        every `href` is dropped silently.
  //
  // The third form is what an earlier revision of this file used, which broke every
  // link on the public page with no error and no warning. Plain attributes therefore
  // use the bare-name form and only constrained attributes use a nested array.
  attributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    // highlight.js adds `hljs` / `hljs-keyword` / `language-*`. Constrained by regex
    // on purpose: an unconstrained `className` would let an author inject arbitrary
    // classes, and without these rules the highlighter's output is stripped back off.
    code: [['className', /^hljs-/, /^language-/, 'hljs']],
    span: [['className', /^hljs-/]],
  },
  // ⚠️ **`protocols` is keyed by ATTRIBUTE NAME, never by tag name.**
  //
  //   `{ href: ['http','https'] }`         → correct: href is protocol-checked
  //   `{ a: { href: ['http','https'] } }`  → ⚠️ **actively harmful.** The key matches
  //                                          no attribute, so the entry is ignored
  //                                          AND it replaces the default protocol
  //                                          table with nothing — which silently
  //                                          turns off `javascript:` stripping.
  //
  // Verified: with the nested form, `<a href="javascript:alert(1)">` survives
  // sanitisation intact. Since `rehype-raw` is in the pipeline, that is a stored-XSS
  // hole, not a cosmetic bug. The regression test in `ResumeMarkdown.test.tsx`
  // pins this down.
  //
  // Relative and fragment URLs (`/path`, `#section`) are kept, which is what we want
  // for in-page navigation.
  protocols: {
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
  },
} satisfies Schema;
