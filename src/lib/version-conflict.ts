/**
 * Version conflicts — the client half of the optimistic lock (ADR-0010).
 *
 * When two tabs hold the same resume, the server refuses the save that lost the race
 * and answers 409 with the version now stored and when it changed. That refusal is the
 * feature: without it the loser's work is silently discarded.
 *
 * The rule this module exists to enforce is that a refusal must be **recoverable**.
 * The user's draft is the only copy of what they just wrote, so nothing here decides
 * to reload, discard or retry — it only classifies the response and describes it, and
 * the caller keeps the draft on screen.
 *
 * Kept free of React and of `fetch` so it can be tested directly. The pieces that read
 * a `Response` take it as an argument rather than reaching for a global.
 */

/** The status a stale save comes back as. */
export const VERSION_CONFLICT_STATUS = 409;

/**
 * The reason codes the server uses for a refused save.
 *
 * Two codes, one user problem: `VERSION_MISMATCH` means somebody else saved first,
 * `VERSION_MISSING` means the client did not send a version at all (an old build, or a
 * request that never read the resume). Both are fixed by reloading, but only the first
 * means anybody else is involved, and saying "somebody else changed this" when nobody
 * did is a confusing lie.
 */
export type VersionConflictReason = 'VERSION_MISMATCH' | 'VERSION_MISSING';

export interface VersionConflict {
  reason: VersionConflictReason;
  /** The version currently stored on the server. */
  currentVersion: number | null;
  /** When the stored version was last written, as an ISO 8601 string. */
  lastModifiedAt: string | null;
  /** The version the client sent, for the "which one am I" part of the message. */
  expectedVersion: number | null;
  /** True when nobody else wrote — the client simply did not send a version. */
  missingVersion: boolean;
}

/**
 * True when a response is a refused save rather than a failure worth retrying.
 *
 * Checks the status only. The body is a separate question because a proxy or an error
 * page can answer 409 with something that is not our envelope, and treating that as a
 * conflict would show a "reload" hint for a problem reloading cannot fix.
 */
export function isVersionConflictStatus(status: number): boolean {
  return status === VERSION_CONFLICT_STATUS;
}

/**
 * Parses the error envelope of a 409 into a `VersionConflict`.
 *
 * Returns null when the body is not one of ours. That is a deliberate outcome rather
 * than a thrown error: the caller falls back to a generic message, which is the right
 * behaviour for a 409 that came from somewhere else.
 *
 * Tolerant about types on purpose. The metadata values arrive as strings (kratos
 * metadata is a string map), a hand-written server or a test fixture may use numbers,
 * and `null` is possible if the backend ever adds a field it cannot fill.
 */
export function parseVersionConflict(body: unknown): VersionConflict | null {
  if (!isRecord(body)) return null;

  const metadata = isRecord(body.metadata) ? body.metadata : {};
  const reason = coerceReason(body.reason);
  if (!reason) return null;

  return {
    reason,
    currentVersion: coerceVersion(metadata.current_version),
    lastModifiedAt: coerceString(metadata.last_modified_at),
    expectedVersion: coerceVersion(metadata.expected_version),
    missingVersion: reason === 'VERSION_MISSING',
  };
}

/**
 * Reads a 409 response into a `VersionConflict`, or null when it is not one.
 *
 * **Consumes the response body.** A `Response` is a stream and can only be read once,
 * so a caller that also needs the error message must read the body itself and use
 * `parseVersionConflict` instead — calling both leaves the second reader with an empty
 * stream and silently degrades its message to a fallback.
 *
 * Reads the body as text and parses it by hand rather than calling `json()`: a
 * non-JSON body (an HTML error page from a proxy) would make `json()` throw, and a
 * throw here would surface to the user as "network error" for a server that answered
 * perfectly clearly.
 */
export async function readVersionConflict(res: Response): Promise<VersionConflict | null> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    return parseVersionConflict(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * The notice shown to the user when their save was refused.
 *
 * Two rules, both learned from the feature this protects:
 *
 *  1. Say what to do, not what happened to the computer. "版本冲突" is accurate and
 *     useless; the user needs to know that reloading is safe and that their typing is
 *     still on screen.
 *  2. Include the times. "已在别处被修改" without a timestamp gives the user no way to
 *     judge whether they are looking at the same thing, and the whole decision they
 *     face is "is the other change newer than mine".
 *
 * Never says the draft was lost, because the caller must not lose it.
 */
export function conflictNotice(conflict: VersionConflict | null): string {
  if (!conflict) {
    return '保存失败：这份简历的版本与服务端不一致。请刷新页面查看最新内容，你刚才的修改仍保留在编辑框中。';
  }

  if (conflict.missingVersion) {
    return '保存失败：本次请求没有携带版本号，无法确认你编辑的是最新内容。请刷新页面后重新编辑，你刚才的修改仍保留在编辑框中。';
  }

  const when = formatLastModified(conflict.lastModifiedAt);
  const version = conflict.currentVersion === null ? '' : `（服务端版本 ${conflict.currentVersion}）`;
  const time = when ? `，最后修改于 ${when}` : '';

  return `保存失败：这份简历已在别处被修改${version}${time}，为避免覆盖对方的修改，本次保存未被写入。请刷新页面查看最新内容，你刚才的修改仍保留在编辑框中。`;
}

/**
 * Renders a server timestamp for a person.
 *
 * Falls back to the raw string when it cannot be parsed. Showing
 * `2026-10-13T02:45:06Z` is worse than showing `2026-10-13 10:45:06`, but it is much
 * better than showing `Invalid Date`, which tells the user nothing and looks broken.
 *
 * Returns empty for a timestamp in the year 1, which is what a Go `time.Time` zero value
 * serialises to (`0001-01-01T00:00:00Z`). It parses as a valid date, so it would render
 * happily and tell the user their resume was last edited two thousand years ago — the
 * one fact this function exists to report accurately. Treating it as "unknown" is
 * correct and is also what the backend means by it.
 */
export function formatLastModified(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (date.getFullYear() < 1000) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the reason the server reported.
 *
 * The two codes are the only reasons this endpoint answers 409 for, so a 409 that
 * carries neither is not a version conflict we can act on. Returning null lets the
 * caller fall back to a generic message, which is right: a 409 from a proxy or from a
 * future endpoint has nothing to say about reloading a resume.
 */
function coerceReason(value: unknown): VersionConflictReason | null {
  if (value === 'VERSION_MISMATCH' || value === 'VERSION_MISSING') return value;
  return null;
}

/**
 * Reads a version from metadata, which is a string map but may hold numbers.
 *
 * Returns null rather than NaN or 0 for anything unusable. 0 is a meaningful value in
 * this protocol — it is what a client that sent no version sends — so defaulting to it
 * would report "you sent version 0" for a response that simply omitted the field.
 */
function coerceVersion(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
