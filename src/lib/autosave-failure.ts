/**
 * Classifying a failed request, for the one caller that has to decide whether retrying
 * is worth anything: autosave.
 *
 * The distinction is not cosmetic. Autosave keeps retrying a **retryable** failure and
 * stops on a **permanent** one, because those two need opposite treatment:
 *
 * - A retryable failure (no network, a 5xx, a timeout) will very likely succeed in a few
 *   seconds. Giving up would discard the user's work, and retrying costs one request.
 * - A permanent failure (403, 404, a malformed request, a version conflict) will fail
 *   identically forever. Retrying it burns requests, delays the truth, and hides the
 *   cause behind a generic "保存失败，重试中" that never resolves.
 *
 * A version conflict is singled out rather than left to the caller because it is the one
 * failure that needs a *user decision*: ADR-0010 forbids a three-way merge, so autosave
 * must stop and let the person choose. `ResumeConflictError` already carries the details.
 */

/** What a caller should do about a failure. */
export type FailureKind =
  /** Worth retrying: the same request will probably succeed soon. */
  | 'retryable'
  /** Never worth retrying automatically. */
  | 'permanent'
  /** Needs a user decision (a version conflict). */
  | 'conflict';

/**
 * HTTP statuses that justify a retry.
 *
 * `408` and `429` are included because both are explicitly transient — the server is
 * telling us to come back — and `425` ("too early", a replay guard) is the same shape.
 * Every other 4xx is the client's own mistake and will be repeated verbatim.
 */
const RETRYABLE_STATUSES = new Set([408, 425, 429]);

/** A 5xx is the server's problem, so the same request may well work shortly. */
function isServerError(status: number): boolean {
  return status >= 500 && status <= 599;
}

/**
 * The HTTP status off a failure, when it has one.
 *
 * The contract is `ApiError` (`api-client.ts`), which is what `resume-api` raises as soon as a
 * response comes back non-ok. A `TypeError` from `fetch` (no network, DNS, a blocked request)
 * has no status, and that is not a gap to paper over: "we could not find out what happened" is
 * the one case where retrying is cheap and giving up is expensive, so `classifyFailure` reads
 * it as retryable.
 */
export function errorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { status } = err as { status?: unknown };
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

/**
 * Decides what to do about a failure.
 *
 * `isConflict` is injected rather than imported so this module does not have to depend on
 * `resume-api` (which imports this one), and so the rule is testable without constructing
 * a real `ResumeConflictError`.
 */
export function classifyFailure(err: unknown, isConflict: boolean): FailureKind {
  if (isConflict) return 'conflict';

  const status = errorStatus(err);
  // No status at all: a transport failure, a timeout, or a DNS problem. Retryable.
  if (status === null) return 'retryable';

  if (status === 409) return 'conflict';
  if (RETRYABLE_STATUSES.has(status)) return 'retryable';
  if (isServerError(status)) return 'retryable';
  return 'permanent';
}

/**
 * Backoff before retry number `attempt` (1-based), in milliseconds.
 *
 * Grows to a ceiling rather than unbounded: a resume editor that retries once a minute
 * still recovers on its own, while one that backs off to an hour has effectively stopped.
 * `jitter` spreads the retries of several open tabs so they do not resynchronise into a
 * burst, and is injectable so tests are deterministic.
 */
export function retryDelay(
  attempt: number,
  base = 2000,
  max = 30000,
  random: () => number = Math.random
): number {
  const bounded = Math.max(1, attempt);
  const raw = base * 2 ** (bounded - 1);
  const capped = Math.min(raw, max);
  // Full jitter over [half, full] keeps the ordering while avoiding a lockstep herd.
  const half = capped / 2;
  return Math.round(half + random() * half);
}

/** How many times autosave retries a retryable failure before waiting for the user. */
export const MAX_AUTOSAVE_RETRIES = 5;

/**
 * The kind to *report* for a failure, given how many retries are already spent.
 *
 * A spent budget turns a retryable failure into a permanent one, because the only question
 * downstream is "is another attempt coming", and after the budget the answer is no. Reporting
 * it as retryable is what left the indicator saying "保存失败，重试中…" indefinitely with
 * nothing scheduled: `retrying` is derived from `status === 'pending' && retries > 0`, and a
 * retryable failure keeps the status `pending` by design.
 *
 * A conflict is never downgraded — it already means "no automatic retry" and the notice that
 * renders it is the user's next step.
 */
export function reportedFailureKind(
  kind: FailureKind,
  retriesSpent: number,
  maxRetries = MAX_AUTOSAVE_RETRIES
): FailureKind {
  if (kind !== 'retryable') return kind;
  return retriesSpent + 1 > maxRetries ? 'permanent' : 'retryable';
}
