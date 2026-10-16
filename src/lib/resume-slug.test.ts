/**
 * The slug rules `/resume/[slug]` depends on: decode exactly once, encode exactly once.
 *
 * The bug these pin was invisible for a specific reason, and the reason is worth keeping: the values
 * look identical for ASCII slugs and differ only for the CJK slugs this product actually produces. So
 * the cases below are written in pairs — the encoded shape Next hands over, and the decoded shape a
 * test that builds its own `params` would use — and both must reach the same path.
 */
import { describe, expect, it } from 'vitest';
import { decodeSlugSegment, slugPathSegment } from '@/lib/resume-slug';

const CJK = '王昱皓';
const CJK_ENCODED = '%E7%8E%8B%E6%98%B1%E7%9A%93';

describe('decodeSlugSegment', () => {
  it('decodes the shape the framework hands over', () => {
    expect(decodeSlugSegment(CJK_ENCODED)).toBe(CJK);
  });

  it('leaves an already-decoded slug alone', () => {
    expect(decodeSlugSegment(CJK)).toBe(CJK);
    expect(decodeSlugSegment('li-ming-xyz')).toBe('li-ming-xyz');
  });

  it('is a no-op for ASCII, which is why this went unnoticed', () => {
    expect(decodeSlugSegment('resume')).toBe('resume');
  });

  it('keeps a literal plus, which a query string would have turned into a space', () => {
    expect(decodeSlugSegment('a+b')).toBe('a+b');
  });

  it('treats a malformed escape as a plain slug instead of throwing', () => {
    // `decodeURIComponent('%')` throws. A bad URL should still be looked up — and then 404 honestly —
    // rather than turning the page into a 500.
    expect(decodeSlugSegment('%')).toBe('%');
    expect(decodeSlugSegment('100%')).toBe('100%');
    expect(decodeSlugSegment('%E7%8E')).toBe('%E7%8E');
  });

  it('handles the empty segment', () => {
    expect(decodeSlugSegment('')).toBe('');
  });
});

describe('slugPathSegment', () => {
  it('sends the encoded shape once, not twice', () => {
    // The regression: `encodeURIComponent('%E7%8E%8B…')` is `%25E7%258E%25…`, which the backend
    // answers with RESUME_NOT_FOUND — 「页面不存在」 for a resume that exists.
    expect(slugPathSegment(CJK_ENCODED)).toBe(CJK_ENCODED);
    expect(slugPathSegment(CJK_ENCODED)).not.toContain('%25');
  });

  it('encodes the decoded shape the same way, so both call sites agree', () => {
    expect(slugPathSegment(CJK)).toBe(CJK_ENCODED);
  });

  it('is idempotent, so a value can be passed through without knowing where it came from', () => {
    expect(slugPathSegment(slugPathSegment(CJK))).toBe(CJK_ENCODED);
    expect(slugPathSegment(slugPathSegment('resume'))).toBe('resume');
  });

  it('encodes characters that would otherwise change the path', () => {
    expect(slugPathSegment('a b')).toBe('a%20b');
    expect(slugPathSegment('a/b')).toBe('a%2Fb');
    expect(slugPathSegment('a?b')).toBe('a%3Fb');
    expect(slugPathSegment('a#b')).toBe('a%23b');
  });

  it('round-trips through a URL the way a browser would send it', () => {
    const path = `/resume/${slugPathSegment(CJK)}`;
    expect(path).toBe(`/resume/${CJK_ENCODED}`);
    // What the server component receives back is still encoded — the premise of the whole fix.
    expect(decodeSlugSegment(path.replace('/resume/', ''))).toBe(CJK);
  });
});
