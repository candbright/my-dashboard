/**
 * The contract that stops a failed list request from rendering as an empty list.
 *
 * # The defect this pins
 *
 * The natural way to write a list fetch, and the way this repository wrote three of them, is:
 *
 * ```ts
 * apiFetch(url).then((res) => res.json()).then((d) => setRows(d.rows ?? [])).catch(() => setRows([]));
 * ```
 *
 * That has two independent faults, and fixing either alone leaves the bug visible:
 *
 * 1. `res.ok` is never checked, so a 401/500 body is parsed as if it were a listing.
 * 2. The `catch` renders the empty state, so a failure is **displayed as "you have no data"**.
 *
 * The user-visible consequences were specific and bad enough to be worth naming, because "empty
 * state on error" sounds cosmetic until you read what the string says:
 *
 * - `app/my/page.tsx` → 「还没有简历」, which on your own page reads as **「我的简历被删了」**.
 * - `components/DashboardClient.tsx` → 「还没有人发布公开简历」: a false statement about other
 *   people's data, and precisely the question the user came to have answered.
 * - `app/admin/users/page.tsx` → **「0 位用户」** under the heading "用户管理", which an admin reads
 *   as "the user table has been wiped".
 *
 * So each case here also asserts the *message*, not merely `ok: false`: an error the user cannot
 * understand is barely better than no error, and the previous code's real failure was that it had
 * nothing to say.
 */

import { describe, expect, it } from 'vitest';
import {
  readJsonBody,
  readErrorEnvelope,
  failureText,
  isAuthFailure,
  AUTH_FAILURE_STATUSES,
} from '@/lib/http-json';

/**
 * Minimal stand-in for a `Response`; only `ok`, `status`, `text()` and `json()` are used.
 *
 * `text()` is not decoration: the reader takes the body as text and parses it, so a mock where
 * only `json()` works would keep passing while the real path threw. `raw` overrides the body for
 * the not-JSON cases.
 */
function response(
  status: number,
  body: unknown,
  opts: { jsonRejects?: boolean; raw?: string } = {}
): Response {
  const text = opts.raw ?? (opts.jsonRejects ? '<html>gateway</html>' : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => {
      if (opts.jsonRejects) throw new SyntaxError('Unexpected token < in JSON');
      return body;
    },
  } as unknown as Response;
}

describe('readJsonBody', () => {
  it('returns the parsed body on success', async () => {
    const result = await readJsonBody<{ resumes: number[] }>(
      response(200, { resumes: [1, 2] }),
      '加载失败'
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.resumes).toEqual([1, 2]);
  });

  it('treats a non-2xx response as a failure, never as data', async () => {
    // The first fault: without this check the error body is parsed and rendered as a listing.
    const result = await readJsonBody(response(500, { error: '服务器内部错误' }), '加载简历失败');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('服务器内部错误');
  });

  it("surfaces the server's own error message, because it is usually the actionable part", async () => {
    const result = await readJsonBody(response(403, { error: '没有权限查看该简历' }), '加载失败');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('没有权限查看该简历');
  });

  it('falls back to naming the operation and the status when the body carries no error', async () => {
    // An error the user cannot locate is nearly as useless as no error: the fallback names what
    // failed, and the status makes the failure reportable.
    const result = await readJsonBody(response(502, {}), '加载简历列表失败');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('加载简历列表失败');
      expect(result.error).toContain('502');
    }
  });

  it('does not throw when the error body is not JSON at all', async () => {
    /*
     * A gateway's HTML error page, or a truncated response. The status has already proved the request
     * failed, so failing to read a message must not escalate into an unhandled rejection — that is how
     * a known failure would go silent a second time, in a `.catch`-less chain.
     */
    const result = await readJsonBody(
      response(504, null, { jsonRejects: true }),
      '加载公共简历失败'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('504');
  });

  it('ignores a non-string error field rather than rendering an object to the user', async () => {
    // `{ error: {...} }` would render as "[object Object]" in the UI.
    const result = await readJsonBody(response(400, { error: { code: 42 } }), '加载失败');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('400');
    }
  });

  it('reports a 2xx whose body is unparseable, rather than yielding undefined', async () => {
    /*
     * A subtle one: a successful status with a broken body must be a failure too. Returning
     * `undefined` here would flow into `data.resumes ?? []` at the call site and render — again — as
     * an empty list, which is the exact outcome all of this exists to prevent.
     */
    const result = await readJsonBody(
      response(200, null, { jsonRejects: true }),
      '加载简历列表失败'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('加载简历列表失败');
  });

  it('does not treat a 3xx as success', async () => {
    // `ok` covers 2xx only. A redirect that was not followed is not a listing.
    const result = await readJsonBody(response(302, {}), '加载失败');

    expect(result.ok).toBe(false);
  });
});

describe('readErrorEnvelope + failureText', () => {
  it('leaves the body consumed, which is exactly why it is the only reader', async () => {
    const res = new Response(JSON.stringify({ error: '没有权限' }), { status: 403 });
    const envelope = await readErrorEnvelope(res);

    // `Response` is a stream. Every caller reading for itself is how the same failure ends up
    // worded three different ways, and how a second reader silently degrades to the fallback —
    // the version-conflict parser and the message reader used to do exactly that.
    expect(envelope.message).toBe('没有权限');
    await expect(res.text()).rejects.toThrow();
  });

  it('treats a body that is not JSON as nameless rather than as a failure to read', async () => {
    const envelope = await readErrorEnvelope(
      new Response('<html>502 Bad Gateway</html>', { status: 502 })
    );

    expect(envelope.json).toBeNull();
    expect(envelope.message).toBeNull();
  });

  it('prefers the server wording over the fallback, and the fallback over nothing', () => {
    expect(failureText({ message: '没有权限查看该简历' }, 403, '加载失败')).toBe('没有权限查看该简历');

    // The status is part of the fallback because "加载失败" alone cannot be acted on or reported:
    // 500 and 404 call for different next steps, and the same failure must not read two ways.
    expect(failureText({ message: null }, 404, '加载失败')).toBe('加载失败（HTTP 404）');
  });
});

describe('isAuthFailure', () => {
  it('recognises exactly the statuses that mean the session is over', () => {
    for (const status of AUTH_FAILURE_STATUSES) {
      expect(isAuthFailure(status)).toBe(true);
    }
  });

  it('does not treat a transient server failure as an expiry', () => {
    /*
     * This is the `AuthContext` defect in one assertion. Any exception used to call `clearToken()`,
     * so a 500 or a dropped connection silently logged the user out mid-session. Only an explicit
     * authentication rejection may end a session; "unknown" is not "invalid", and the token is
     * stateless, so keeping it costs nothing — a genuinely bad token still fails the next call.
     */
    for (const status of [500, 502, 503, 504, 408, 429, 0]) {
      expect(isAuthFailure(status)).toBe(false);
    }
  });

  it('does not treat a 404 as an expiry', () => {
    // A deleted resume is not a dead session.
    expect(isAuthFailure(404)).toBe(false);
  });
});
