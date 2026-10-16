/**
 * One writer for "a record came back from the server".
 *
 * A8: the four-field write-back (row + parse + text + conflict notice) was spelled out by hand
 * at four call sites, and two more updated only the row. The metadata path is the one that
 * proves it was drift rather than a decision — the server returns `content` on that route
 * *specifically* so the parse would not go stale, and the client threw it away. Nothing failed;
 * the page simply showed one version's number beside another version's text.
 *
 * A rendered test cannot see this: it is a property of the file, not of a page. So it is
 * asserted the way the module-layer rules are — by reading the source, and as a ratchet.
 *
 * The row is no longer assigned directly, and that is the second half of the same story. ADR-0004
 * carries presentation *beside* the record, and `PUT` answers without one, so
 * `setResume(data.resume)` replaced a resume's styling with nothing on every content save: a resume
 * saved as 绿野通栏 reopened in the default template. Folding through `resumeWithPresentation` is what
 * keeps the reply's styling when it has any and the styling on screen when it does not.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ResumePageClient.tsx', import.meta.url), 'utf8');

const count = (pattern: RegExp): number => (source.match(pattern) ?? []).length;

describe('ResumePageClient adopts a server record in one place', () => {
  it('writes the row, the parse and the text in exactly one place', () => {
    // A count of 2 means a new write path was written by hand: call `applyServerRecord`
    // instead, so the three cannot drift apart again.
    expect(count(/setResume\(\(current\) => resumeWithPresentation\(data\.resume/g)).toBe(1);
    expect(count(/setParsed\(clientParsed\(/g)).toBe(1);
    expect(count(/setMarkdown\(data\.markdown\)/g)).toBe(1);
  });

  it('never assigns the raw record, which is what dropped the saved styling', () => {
    // The regression as a rule rather than as a scenario: assigning `data.resume` wholesale is the
    // shape that made every content save fall back to the default template.
    expect(count(/setResume\(data\.resume\)/g)).toBe(0);
  });

  it('has that one place, and the write paths go through it', () => {
    expect(count(/const applyServerRecord = useCallback\(/g)).toBe(1);
    // A floor, not a target: save, autosave, rollback, metadata, visibility, reload.
    expect(count(/applyServerRecord\(data\)/g)).toBeGreaterThanOrEqual(6);
  });
});
