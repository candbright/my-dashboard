/**
 * Typed wrappers for the resume endpoints that participate in the optimistic lock.
 *
 * These live here rather than in `api-client.ts` because they take and return a
 * `ResumeRecord`, and `api-client.ts` deliberately knows nothing about resume shapes —
 * it holds the transport and the AI/provider surface.
 *
 * The point of the module is one rule: **a save either succeeds or explains itself in a
 * way the caller can act on.** `saveResume` therefore throws a `ResumeConflictError`
 * carrying the parsed 409 for a version conflict, and an `ApiError` — the server's message
 * plus the HTTP status — for everything else. Callers must be able to tell those apart,
 * because a conflict is recoverable by reloading and the user's draft has to survive it;
 * the status is what lets autosave decide whether retrying could ever work.
 */

import { apiFetch, ApiError } from './api-client';
import { failureText, readErrorEnvelope } from './http-json';
import type { ResumeRecord } from './types';
import type { StructuredContent } from './resume-model';
import { presentationWriteBody, type PresentationWrite } from './resume-presentation';
import {
  isVersionConflictStatus,
  parseVersionConflict,
  conflictNotice,
  type VersionConflict,
} from './version-conflict';

/**
 * A refused save, carrying enough detail to explain it and to reload.
 *
 * Extends `Error` so ordinary `catch (err) { err.message }` code keeps working — the
 * message is the ready-to-display Chinese notice. The structured `conflict` is there
 * for a caller that wants to show the version numbers itself.
 */
export class ResumeConflictError extends Error {
  readonly conflict: VersionConflict;

  constructor(conflict: VersionConflict, message: string) {
    super(message);
    this.name = 'ResumeConflictError';
    this.conflict = conflict;
  }
}

/** What `PUT /api/resumes/{id}` accepts. */
export interface SaveResumeInput {
  /**
   * The version read from the last response.
   *
   * Send the real value, including `0`, rather than omitting it: the server refuses a
   * save it cannot check, and `undefined` here means "this client never read a
   * version" — which is exactly the case the refusal is for.
   */
  version: number;
  /** The full document. Replaces what is stored; this is not a patch. */
  markdown?: string;
  visibility?: 'public' | 'private';
}

/**
 * The shape `PUT /api/resumes/{id}`, `PATCH /api/resumes/{id}/metadata` and
 * `GET /api/resumes/{id}` all answer with.
 *
 * # `parsed` was a lie — the snapshot is not
 *
 * This interface used to declare `parsed` and claim the backend "parses the document
 * server-side and returns the result alongside the raw markdown". At the time it did not:
 * `buildResumeDetail` returned `resume`, `markdown` and `permissions`, and no reply type
 * had a parsed field. The cast in `saveResume`/`fetchResumeDetail` therefore asserted a
 * non-existent field into the type, and callers that read it silently got `undefined`.
 *
 * Ticket 18 made that claim true, but **not** under the old name and not with the old
 * shape. The server now returns a `content` snapshot of the parsed body — sections, items,
 * dates and an explicit section kind — on every reply that carries `markdown`. The invented
 * `parsed` field is gone rather than repurposed, so that no caller can keep reading the
 * wrong name while a cast hides it.
 *
 * @see sectionsFromStructuredContent / parsedFromStructuredContent for the consumer side.
 */
export interface SaveResumeResult {
  resume: ResumeRecord;
  markdown: string;
  /**
   * The server's parsed body (ticket 18, ADR-0003).
   *
   * **Optional on purpose.** A deployment predating ticket 18 sends no such field, and the
   * two cases are different answers:
   *
   *   - `undefined` — this server does not send snapshots; the caller must parse locally.
   *   - present but empty — the server parsed the document and found no sections.
   *
   * Collapsing them (by defaulting to `{}`) would make the fallback parse never fire against
   * an old server, and the page would render no sections at all.
   */
  content?: StructuredContent;
  /**
   * How the resume looks (ticket 19, ADR-0004).
   *
   * **Optional on purpose**, for the same reason as `content`: only
   * `PATCH /presentation` — and `resume.presentation` on a detail read — carries it, and a
   * deployment predating ticket 19 carries it nowhere.
   *
   * Typed as `unknown` and read through `presentationFromApi`, rather than typed as
   * `ResumePresentation` and trusted. The cast in the functions above is what makes this
   * interface cheap to write, and a cast is exactly what asserted the non-existent `parsed` field
   * into existence once before — so the field stays opaque here and the one function that knows
   * the wire shape does the reading.
   */
  presentation?: unknown;
}

/**
 * Saves a resume under the optimistic lock, or throws.
 *
 * One request may carry both `markdown` and `visibility`. The server applies both — it
 * used to apply only the visibility and silently drop the content, which is the defect
 * ticket 12 fixed — and advances the version once per change written.
 */
export async function saveResume(
  id: string,
  input: SaveResumeInput
): Promise<SaveResumeResult> {
  const body: Record<string, unknown> = { version: input.version };
  if (input.markdown !== undefined) body.markdown = input.markdown;
  if (input.visibility !== undefined) body.visibility = input.visibility;

  const res = await apiFetch(`/api/resumes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (res.ok) {
    return (await res.json()) as SaveResumeResult;
  }

  // The body is read **once**. `Response` is a stream: calling `readVersionConflict`
  // and then a separate error-message reader leaves the second one reading an already
  // consumed stream, which silently degrades every message to the fallback — a bug this
  // had, caught by a test asserting the server's own text came through.
  const failure = await readErrorEnvelope(res);

  if (isVersionConflictStatus(res.status)) {
    const conflict = parseVersionConflict(failure.json);
    if (conflict) {
      throw new ResumeConflictError(conflict, conflictNotice(conflict));
    }
  }

  throw new ApiError(failureText(failure, res.status, '保存失败'), res.status);
}

/** The latest server state of a resume, for the "reload" half of a conflict. */
export async function fetchResumeDetail(id: string): Promise<SaveResumeResult> {
  const res = await apiFetch(`/api/resumes/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const failure = await readErrorEnvelope(res);
    throw new ApiError(failureText(failure, res.status, '获取简历失败'), res.status);
  }
  return (await res.json()) as SaveResumeResult;
}

/**
 * Patches a resume's metadata columns under the same optimistic lock as the content
 * (ticket 15, ADR-0003).
 *
 * # Why PATCH and not PUT
 *
 * `PUT /api/resumes/{id}` means "replace the document". A metadata edit names individual
 * fields, so it gets its own endpoint and verb. The server applies only the keys present in
 * the patch: an absent key leaves its column untouched, and a key present with an empty
 * value clears it. `metadataPatchFromDiff` in `resume-metadata.ts` builds exactly that shape,
 * and the distinction survives JSON because `JSON.stringify` drops `undefined`.
 *
 * # Why the version is required
 *
 * Metadata and content share one `version` column (ADR-0010). Two counters would let "I
 * edited the body, you edited the email" both succeed and silently lose one of them. A
 * conflict is a `ResumeConflictError`, the same type the content path throws, so a caller
 * handles both identically — reload, then re-apply.
 */
export async function saveResumeMetadata(
  id: string,
  input: SaveResumeMetadataInput
): Promise<SaveResumeResult> {
  const res = await apiFetch(`/api/resumes/${encodeURIComponent(id)}/metadata`, {
    method: 'PATCH',
    // `metadata` carries the patch as-is: this function must not drop or default any key,
    // because the absent-versus-empty distinction is the request's entire meaning.
    body: JSON.stringify({ version: input.version, metadata: input.metadata }),
  });

  if (res.ok) {
    return (await res.json()) as SaveResumeResult;
  }

  // Read once — see the note in `saveResume`: a second reader would find the stream already
  // consumed and silently degrade every message to the fallback.
  const failure = await readErrorEnvelope(res);

  if (isVersionConflictStatus(res.status)) {
    const conflict = parseVersionConflict(failure.json);
    if (conflict) {
      throw new ResumeConflictError(conflict, conflictNotice(conflict));
    }
  }

  // The server's own text is preferred: the domain produces specific Chinese messages for a
  // bad email or URL, and a generic fallback would throw that away.
  throw new ApiError(failureText(failure, res.status, '保存基本信息失败'), res.status);
}

/** What `PATCH /api/resumes/{id}/metadata` accepts. */
export interface SaveResumeMetadataInput {
  /**
   * The version read from the last response.
   *
   * Required and sent as the real value, including `0`: the server refuses a write it cannot
   * check, and `undefined` here would mean "this client never read a version".
   */
  version: number;
  /**
   * The patch. Absent key = leave alone; empty string = clear.
   *
   * Typed as `Record<string, string>` rather than the field union so this module does not
   * depend on `resume-metadata.ts`; the typing that matters is enforced where the patch is
   * built.
   */
  metadata: Record<string, string>;
}

// ──────────────────────────────────────────────────────────────
// Content version history (ticket 16, ADR-0010)
// ──────────────────────────────────────────────────────────────

/**
 * One row of the history list: enough to render and to fetch, without the body.
 *
 * The server omits `markdown` from the list on purpose. A 50-entry history of a 10 KB
 * document would otherwise transfer half a megabyte to draw a column of timestamps.
 */
export interface ResumeVersionSummary {
  id: string;
  /** Matches `ResumeRecord.version`, which is how the panel marks the current revision. */
  version: number;
  /** RFC 3339, or `''` when the row has no timestamp (pre-ticket-12 rows). */
  createdAt: string;
  /** The user who triggered the save; `''` for an AI apply or a system task. */
  createdBy: string;
}

export interface ResumeVersionList {
  versions: ResumeVersionSummary[];
  /** How many snapshots are stored. */
  total: number;
  /** The configured cap, for a "12 / 50" label. `0` when the server reports none. */
  limit: number;
}

/**
 * Lists a resume's stored revisions, newest first.
 *
 * # This is a read, so it does not need a version
 *
 * The optimistic lock guards writes. History is append-only, so there is nothing for a
 * reader to conflict with: the worst case is that a save lands while the panel is open and
 * the list is one revision stale, which the next refresh fixes.
 */
export async function listResumeVersions(id: string): Promise<ResumeVersionList> {
  const res = await apiFetch(`/api/resumes/${encodeURIComponent(id)}/versions`);
  if (!res.ok) {
    const failure = await readErrorEnvelope(res);
    throw new ApiError(failureText(failure, res.status, '获取版本历史失败'), res.status);
  }
  const data = (await res.json()) as Partial<ResumeVersionList>;
  // Default the list rather than trusting the field: a `repeated` proto field is omitted
  // entirely when empty, so a resume with no history genuinely sends no `versions` key and
  // `data.versions.map(...)` would throw on the *first* save after the feature ships.
  return {
    versions: data.versions ?? [],
    total: data.total ?? 0,
    limit: data.limit ?? 0,
  };
}

export interface ResumeVersionDetail {
  version: ResumeVersionSummary;
  /** The complete document as it was saved, already stripped of frontmatter. */
  markdown: string;
}

/** Fetches one revision's body, for the preview pane. */
export async function fetchResumeVersion(
  id: string,
  versionId: string
): Promise<ResumeVersionDetail> {
  const res = await apiFetch(
    `/api/resumes/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`
  );
  if (!res.ok) {
    const failure = await readErrorEnvelope(res);
    throw new ApiError(failureText(failure, res.status, '获取该版本失败'), res.status);
  }
  const data = (await res.json()) as Partial<ResumeVersionDetail>;
  return {
    version: data.version ?? {
      id: versionId,
      version: 0,
      createdAt: '',
      createdBy: '',
    },
    markdown: data.markdown ?? '',
  };
}

/**
 * Rolls the resume back to a stored revision, or throws.
 *
 * # Why this is a POST to its own endpoint and not a `saveResume` of the old body
 *
 * ADR-0010 defines a rollback as *a save that appends*: it writes the old text forward as a
 * **new** version and never deletes the history in between, so a mistaken rollback is
 * undone by rolling forward again. Reusing `saveResume` would honour that, but it needs two
 * round trips — fetch the old body, then PUT it — and the version token read in the first
 * is stale by the second if anything autosaves in between. The server-side endpoint does it
 * in one atomic save under the same optimistic lock.
 *
 * A conflict is therefore the **same** `ResumeConflictError` the content and metadata paths
 * throw. That is intentional: "somebody saved while I was looking at the history" is not a
 * new situation, and the panel does not need a second recovery path for it.
 */
export async function rollbackResumeVersion(
  id: string,
  versionId: string,
  version: number
): Promise<SaveResumeResult> {
  const res = await apiFetch(
    `/api/resumes/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/rollback`,
    { method: 'POST', body: JSON.stringify({ version }) }
  );

  if (res.ok) {
    return (await res.json()) as SaveResumeResult;
  }

  const failure = await readErrorEnvelope(res);

  if (isVersionConflictStatus(res.status)) {
    const conflict = parseVersionConflict(failure.json);
    if (conflict) {
      throw new ResumeConflictError(conflict, conflictNotice(conflict));
    }
  }

  // The server distinguishes "that revision is gone" (404) from a conflict, and its wording
  // for it is better than anything generic: the user needs to know their history list is
  // stale, not that their token is.
  throw new ApiError(failureText(failure, res.status, '回滚失败'), res.status);
}

/**
 * Saves a resume's presentation state under the same optimistic lock as its content
 * (ticket 19, ADR-0004).
 *
 * # Why this is its own endpoint and its own function
 *
 * Styling does not change what the resume *says*, so routing it through the content save would
 * mean either rewriting the whole document to change a colour — the defect ADR-0004 exists to
 * remove — or teaching the content path to leave the document alone. `PATCH
 * /api/resumes/{id}/presentation` writes one column instead.
 *
 * # Why the version is required
 *
 * ADR-0004 gives content and styling **one** `version` column. Two counters would let "I edited
 * the body, you changed the theme" both succeed and silently lose one of them. So a conflict here
 * is the same `ResumeConflictError` the content and metadata paths throw, and a caller handles
 * all three identically: reload, then re-apply.
 *
 * # Why the body is flat
 *
 * The request puts the styling fields at the top level next to `version` rather than nesting them
 * under a `presentation` key, which is what `presentationWriteBody` builds. That makes the
 * request body the stored column plus a version, so the server's `DisallowUnknownFields` decoder
 * rejects a misspelled styling key and a misspelled `version` by the same rule — see
 * `presentationRequest` in the server.
 */
export async function saveResumePresentation(
  id: string,
  write: PresentationWrite
): Promise<SaveResumeResult> {
  const res = await apiFetch(`/api/resumes/${encodeURIComponent(id)}/presentation`, {
    method: 'PATCH',
    // Flattened deliberately — see the doc comment. Sending `{ presentation: {...} }` would be
    // rejected as an unknown field, which is the server working as intended.
    body: JSON.stringify(presentationWriteBody(write)),
  });

  if (res.ok) {
    return (await res.json()) as SaveResumeResult;
  }

  // Read once — see the note in `saveResume`: a second reader would find the stream already
  // consumed and silently degrade every message to the fallback.
  const failure = await readErrorEnvelope(res);

  if (isVersionConflictStatus(res.status)) {
    const conflict = parseVersionConflict(failure.json);
    if (conflict) {
      throw new ResumeConflictError(conflict, conflictNotice(conflict));
    }
  }

  // The server's own text is preferred. For a refused styling value it is shaped
  // `展示态字段 <field> 不合法：<reason>`, and the panel parses the field out with
  // `parsePresentationError` so it can mark the offending control rather than show a banner with
  // no location. Throwing the raw message keeps that recoverable.
  throw new ApiError(failureText(failure, res.status, '保存展示设置失败'), res.status);
}

/**
 * Reads a failed response's body once and exposes both things a caller might want.
 *
 * Delegates to `readErrorEnvelope` (`http-json.ts`), which is where the rule about the
 * server's own text versus the fallback lives — this module needs the same read as every
 * other caller, plus the parsed `json` so a 409 can be interpreted rather than described.
 */
