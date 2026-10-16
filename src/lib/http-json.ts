/**
 * Reading a JSON response without conflating "the request failed" with "the answer was empty".
 *
 * # The defect this exists to prevent
 *
 * Three list pages used to be written as:
 *
 * ```ts
 * apiFetch('/api/resumes')
 *   .then((res) => res.json())          // ← never checks res.ok
 *   .then((data) => setResumes(data.resumes ?? []))
 *   .catch(() => setResumes([]));       // ← failure renders as "empty"
 * ```
 *
 * Both mistakes produce the same visible outcome: a failed request renders the page's empty state.
 * On `app/my/page.tsx` that is 「还没有简历」, which on a user's own page reads as **「我的简历被删了」**;
 * on the dashboard it is 「还没有人发布公开简历」, a false claim about other people's data; on
 * `admin/users` it was **「0 位用户」**, which an administrator reads as "the user table was wiped".
 *
 * The two are one bug with two halves, and both halves have to be fixed together — checking `res.ok`
 * without surfacing the error still loses the reason, and surfacing an error without checking `res.ok`
 * reports "success" on a 500. So they live in one function rather than being re-derived per call site.
 *
 * # Why a discriminated union rather than a thrown error
 *
 * Callers need to distinguish three outcomes, not two: success, an error worth showing the user, and
 * a successful response whose body is not valid JSON. A throw collapses the last two, and the point
 * of all this is that different failures should not be reported identically. The union forces each
 * call site to handle `ok: false` explicitly, which is what stops "empty on failure" from creeping
 * back in — a bare `catch` cannot be written by accident.
 */

/** What a caller should do with a successfully parsed body. */
export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Response statuses where the session is over and the user must sign in again.
 *
 * Exported so `AuthContext` can use the same definition as everything else: a transient failure must
 * never be treated as an expiry, and the way to guarantee that is to have exactly one list of statuses
 * that mean "expired".
 */
export const AUTH_FAILURE_STATUSES = [401, 403] as const;

export function isAuthFailure(status: number): boolean {
  return (AUTH_FAILURE_STATUSES as readonly number[]).includes(status);
}

/**
 * Reads a failed response's body **once**: the parsed body, and the message it named if any.
 *
 * `Response` is a stream, so two readers means the second finds it consumed and silently falls
 * back — a bug this codebase has had, where the version-conflict parser and the message reader
 * each read for themselves (`resume-api.ts`). Reading once, here, makes that impossible rather
 * than unlikely. `json` is returned for the one caller that has to *interpret* the body rather
 * than describe it.
 *
 * `message` is `null` when the body is not JSON or names no error, so each caller keeps its own
 * wording; `failureText` turns that into the string to show.
 */
export async function readErrorEnvelope(
  res: Response
): Promise<{ json: unknown; message: string | null }> {
  const raw = await res.text().catch(() => '');

  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }

  // A non-string or empty `error` counts as absent: rendering `[object Object]` where a message
  // belongs is worse than falling back to the status.
  const named = (json as { error?: unknown } | null)?.error;
  return { json, message: typeof named === 'string' && named !== '' ? named : null };
}

/**
 * The message to show for a failed response.
 *
 * The server's own `error` text wins when it sent one. Otherwise `fallback` carries the status:
 * a bare 「获取配置失败」 tells the user and the bug report nothing, while 500-versus-404 is the
 * difference between "try again" and "this is gone" — and two pages reporting the same failure
 * must not word it differently, which is exactly what they used to do.
 */
export function failureText(
  envelope: { message: string | null },
  status: number,
  fallback: string
): string {
  return envelope.message ?? `${fallback}（HTTP ${status}）`;
}

/**
 * Parses a response body as JSON, refusing to treat an HTTP error as data.
 *
 * @param res      The response from `apiFetch`.
 * @param fallback Message used when the server sent no usable `error` field. Callers pass their own
 *                 so the user sees which thing failed to load, not a generic "出错了".
 *
 * The message comes from `readErrorEnvelope` + `failureText`, which own the choice between the
 * server's text and the fallback. A body that is not JSON at all (a gateway's HTML error page, a
 * truncated response) must not make the whole thing throw — the *status* is already enough to know
 * the request failed, and the message is a nicety. That ordering is deliberate: a missing message
 * must never turn a known failure into an unhandled rejection, because an unhandled rejection in a
 * `.catch`-less chain is how the failure would go silent all over again.
 */
export async function readJsonBody<T>(
  res: Response,
  fallback: string
): Promise<JsonResult<T>> {
  if (!res.ok) {
    const failure = await readErrorEnvelope(res);
    return { ok: false, error: failureText(failure, res.status, fallback) };
  }

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    // A 2xx with an unparseable body is a real (if rare) failure — a proxy that injects content, a
    // connection cut mid-body. Reported rather than silently yielding `undefined`, which downstream
    // would look exactly like an empty list.
    return { ok: false, error: `${fallback}（响应格式异常）` };
  }
}
