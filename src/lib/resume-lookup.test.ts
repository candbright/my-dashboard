/**
 * The by-slug lookup's outcomes, and the rule that only one of them is a 404.
 *
 * `403 NO_ACCESS` is what the backend answers when the request carries no usable session — which is
 * the state a page load lands in before the browser's cookie catches up with the client's token, and
 * what `/resume/[slug]` used to render as 「页面不存在」. These cases are the boundary between the
 * three ways that lookup fails; ticket 47.
 */
import { describe, expect, it, vi } from 'vitest';
import { lookupResumeBySlug, readResumeLookup } from '@/lib/resume-lookup';

// Tier: unit. Pure logic — no DOM, no network.

interface StubOptions {
  status: number;
  body?: unknown;
  /** A body that is not JSON at all, e.g. a gateway's HTML error page. */
  raw?: string;
}

function response({ status, body, raw }: StubOptions): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (raw !== undefined) throw new SyntaxError('not json');
      return body;
    },
    text: async () => raw ?? JSON.stringify(body ?? {}),
  } as unknown as Response;
}

describe('readResumeLookup', () => {
  it('reads the body of a successful answer', async () => {
    const lookup = await readResumeLookup<{ resume: { slug: string } }>(
      response({ status: 200, body: { resume: { slug: 'resume' } } })
    );

    expect(lookup).toEqual({ status: 'found', data: { resume: { slug: 'resume' } } });
  });

  it('calls only a 404 missing', async () => {
    // The one case where 「页面不存在」 is the truth.
    const lookup = await readResumeLookup(
      response({ status: 404, body: { error: '简历不存在', reason: 'RESUME_NOT_FOUND' } })
    );

    expect(lookup).toEqual({ status: 'missing' });
  });

  it.each([401, 403])('reports HTTP %i as forbidden, not as missing', async (status) => {
    // `403 NO_ACCESS` is the answer the resume's own owner gets while the server has no usable
    // session for them. Reporting it as 「不存在」 told the user their saved resume was gone.
    const lookup = await readResumeLookup(
      response({ status, body: { error: '无权访问此简历', reason: 'NO_ACCESS' } })
    );

    expect(lookup).toEqual({ status: 'forbidden' });
  });

  it('keeps an unexpected failure separate, with the server’s own message', async () => {
    const lookup = await readResumeLookup(
      response({ status: 500, body: { error: '数据库连接失败' } })
    );

    expect(lookup.status).toBe('unavailable');
    expect(lookup).toMatchObject({ detail: '数据库连接失败' });
  });

  it('names the status when the server sent no message', async () => {
    // A bare 「无法加载简历」 would not tell the user or a bug report whether to retry or to give up.
    const lookup = await readResumeLookup(response({ status: 502, raw: '<html>Bad Gateway</html>' }));

    expect(lookup).toMatchObject({ status: 'unavailable', detail: '无法加载简历（HTTP 502）' });
  });

  it('refuses to call an unparseable 2xx a resume', async () => {
    const lookup = await readResumeLookup(response({ status: 200, raw: '<html>proxy</html>' }));

    expect(lookup).toMatchObject({ status: 'unavailable', detail: '无法加载简历（响应格式异常）' });
  });

  it('reads the body once, so no reader finds it already consumed', async () => {
    // `Response` is a stream: a second reader silently returns nothing, which is a bug this repo
    // has had (`http-json.ts`). Both halves of this one — json for success, text for failure — must
    // not be asked for on the same response.
    const json = vi.fn(async () => ({ resume: {} }));
    const text = vi.fn(async () => '{"error":"nope"}');

    await readResumeLookup({ ok: true, status: 200, json, text } as unknown as Response);

    expect(json).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled();
  });
});

describe('lookupResumeBySlug', () => {
  it('reports an unreachable backend as unavailable, never as missing', async () => {
    // A rejected `fetch` is not a response. Left uncaught it would escape as an unhandled rejection
    // and render as a generic error page; mistaken for a 404 it would claim the resume is gone.
    const lookup = await lookupResumeBySlug(async () => {
      throw new TypeError('fetch failed');
    });

    expect(lookup).toMatchObject({ detail: '无法加载简历（无法连接到服务器）' });
  });

  it('passes a real answer through unchanged', async () => {
    const lookup = await lookupResumeBySlug<{ resume: { slug: string } }>(async () =>
      response({ status: 200, body: { resume: { slug: '张三的简历' } } })
    );

    expect(lookup).toEqual({ status: 'found', data: { resume: { slug: '张三的简历' } } });
  });
});
