/**
 * A slug as it travels through a URL path — and as it comes back from the framework.
 *
 * # The defect this exists for
 *
 * `/resume/[slug]` built its backend lookup with `encodeURIComponent(params.slug)`. That is right only
 * if the framework hands the segment over **decoded**, and Next hands it over **still percent-encoded**.
 * So a slug of `王昱皓` arrived as `%E7%8E%8B%E6%98%B1%E7%9A%93` and left as
 * `%25E7%258E%258B%25E6%2598%25B1%25E7%259A%2593` — a slug no row has. The backend answered
 * `404 RESUME_NOT_FOUND`, and the page turned that into 「页面不存在」 for a resume that exists and was
 * listed in 我的 a moment earlier. Ticket 47 removed that lie one layer up; an encoding step put it
 * back.
 *
 * Measured against the running stack, with `王昱皓` as the one resume in the database:
 *
 * | `by-slug/…` on the wire | backend |
 * |---|---|
 * | `王昱皓` (raw) | `403 NO_ACCESS` — the row is found; the caller is not its owner |
 * | `%E7%8E%8B%E6%98%B1%E7%9A%93` (once) | `403 NO_ACCESS` — found |
 * | `%25E7%258E%258B…` (twice) | `404 RESUME_NOT_FOUND` — not found, and what the page was sending |
 *
 * The page answered `404` for all three of its own URL spellings, while the backend found the resume
 * for two of them. That gap — found-but-refused versus genuinely-absent — is what made this
 * diagnosable without the owner's session.
 *
 * ASCII slugs hid it: `resume` is its own encoding, so every curated example and every test passed
 * while the product's mainstream input, a Chinese name, was broken. The page's own CJK test made the
 * same assumption the page did — it built `params` decoded — which is why the regression test pins
 * the **shape** the framework really hands over.
 *
 * Decoding first makes these helpers correct for either shape, so a future framework that decodes the
 * segment for us cannot reintroduce the same bug from the other side.
 */

/**
 * The slug a path segment stands for.
 *
 * A segment that is not valid percent-encoding (a lone `%`, say) is taken as an already-plain slug
 * rather than throwing: `decodeURIComponent` is strict, and turning a malformed URL into a 500 would
 * replace an honest lookup — which can 404 — with a crash.
 */
export function decodeSlugSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The segment to put in a path: encoded exactly once, whatever shape `raw` arrived in.
 *
 * Applying it to its own output is a no-op, which is what lets every call site use it without having
 * to know whether the value it holds came from a URL, from the API, or from a previous call.
 */
export function slugPathSegment(raw: string): string {
  return encodeURIComponent(decodeSlugSegment(raw));
}
