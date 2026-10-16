/**
 * Why `/resume/[slug]` can, or cannot, show a resume.
 *
 * # The defect this exists to prevent
 *
 * The page used to reduce every answer it did not like to one outcome:
 *
 * ```ts
 * const res = await serverFetch(`/api/resumes/by-slug/${slug}`, { token });
 * if (!res.ok) return null;   // ← 403, 500 and 404 all become `null`
 * ...
 * if (!data) notFound();      // ← …and `null` is rendered as 「页面不存在」
 * ```
 *
 * The backend distinguishes these cases, and the distinction is the whole answer to what the user
 * should do next:
 *
 * | Answer | Meaning | What the user needs |
 * |---|---|---|
 * | `404 RESUME_NOT_FOUND` | no resume with that slug | 「没有这份简历」 — the link is wrong or it was deleted |
 * | `403 NO_ACCESS` | not signed in, or not this resume's owner | a way to re-authenticate; retrying is meaningful |
 * | `5xx`, unreachable | the server could not answer | 「稍后再试」 — nothing about the resume is known |
 *
 * Collapsing them made the middle row a lie. Its cause is a *session* the server cannot see: the
 * client's token lives in localStorage, the server reads a cookie, and when the two disagree the
 * client lists a resume that the server refuses to hand over. Rendered as 「页面不存在」, that reads
 * as **「我刚保存的简历没了」** — for a resume that exists and is one reload away.
 *
 * So the failure kind is carried through as data rather than sniffed at the call site, and only a
 * genuine `404` is allowed to become a 404. The same mistake in another guise is what ticket 44 and
 * `http-json.ts` are about: an "I don't know" must never be rendered as a "there is none".
 */
import { failureText, isAuthFailure, readErrorEnvelope } from '@/lib/http-json';

/** The three ways a lookup can fail. `missing` is the only one that is really a 404. */
export type ResumeLookupFailure = 'missing' | 'forbidden' | 'unavailable';

/** A lookup's outcome. `data` is whatever the caller asked to read from a successful response. */
export type ResumeLookup<T> =
  | { status: 'found'; data: T }
  | { status: 'missing' }
  | { status: 'forbidden' }
  | { status: 'unavailable'; detail: string };

/**
 * Classifies a `by-slug` response, reading the body at most once.
 *
 * `fallback` names the thing that failed to load, for the case where the server sent no message of
 * its own — see `failureText`.
 */
export async function readResumeLookup<T>(
  res: Response,
  fallback = '无法加载简历'
): Promise<ResumeLookup<T>> {
  if (res.ok) {
    try {
      return { status: 'found', data: (await res.json()) as T };
    } catch {
      // A 2xx whose body is not JSON: a proxy's error page, or a connection cut mid-body. There is
      // no resume in hand, so this is "could not load", never "does not exist".
      return { status: 'unavailable', detail: `${fallback}（响应格式异常）` };
    }
  }

  if (res.status === 404) return { status: 'missing' };

  // 401 and 403 share one outcome on purpose: from here they are the same instruction to the user
  // (prove who you are, then try again), and the list of statuses that mean "session" lives in
  // `http-json.ts` so this cannot drift from `AuthContext`'s idea of an expiry.
  if (isAuthFailure(res.status)) return { status: 'forbidden' };

  const envelope = await readErrorEnvelope(res);
  return { status: 'unavailable', detail: failureText(envelope, res.status, fallback) };
}

/**
 * The lookup for a slug, including the case where the backend never answered.
 *
 * A rejected `fetch` — DNS, a refused connection, a timeout — is not a response and must not be
 * mistaken for one, which is why it is caught here rather than left to escape as an unhandled
 * rejection that Next would render as a generic error page.
 */
export async function lookupResumeBySlug<T>(
  fetcher: () => Promise<Response>,
  fallback = '无法加载简历'
): Promise<ResumeLookup<T>> {
  try {
    return await readResumeLookup<T>(await fetcher(), fallback);
  } catch {
    return { status: 'unavailable', detail: `${fallback}（无法连接到服务器）` };
  }
}
