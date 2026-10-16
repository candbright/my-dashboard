/**
 * `/resume/[slug]`, as a user meets it: what the page renders for each answer the backend can give.
 *
 * # The defect this file exists for
 *
 * This page reduced every unsuccessful lookup to `null` and rendered `null` as 「页面不存在」:
 *
 * ```ts
 * if (!res.ok) return null;      // 403 NO_ACCESS, 500 and 404 alike
 * if (!data) notFound();         // …and a 404 is a claim about the resume
 * ```
 *
 * `403 NO_ACCESS` is what the backend answers when the request arrives without a usable session —
 * which is the state a page load lands in while the browser's cookie lags the client's token. So the
 * user's own resume, listed in 我的 a moment earlier, was reported as non-existent. Ticket 47.
 *
 * `resume-lookup.test.ts` pins the classification. This file pins the **call site**, because that is
 * where the decision was discarded: ticket 44's lesson is that a pinned decision function plus an
 * unasserted call site is exactly how the two drift apart again.
 *
 * It is the first test under `src/app/`: colocation is the house rule, and the call site is here. The
 * directory only has to avoid the route filenames Next treats as entries (`page`, `layout`, …).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { DEFAULT_PRESENTATION } from '@/lib/resume-presentation';

const { notFound, serverFetch } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  serverFetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound }));

// A signed-in browser: the token reached the server as a cookie, which is the only half a server
// component can read.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'auth_token' ? { value: 'cookie-token' } : undefined),
  }),
}));

vi.mock('@/lib/server-api', () => ({ serverFetch }));

const { default: ResumePage, generateMetadata } = await import('@/app/resume/[slug]/page');
const { ResumePageClient } = await import('@/components/ResumePageClient');

/** A `Response` the lookup can consume without the environment's stream support. */
function response(status: number, body?: unknown, raw?: string): Response {
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

/** The record the backend sends for the user's own resume. Only the parser's inputs matter here. */
const RECORD = {
  id: '7a855f96-428c-4f87-918e-03984462b9b0',
  slug: 'resume',
  title: 'resume',
  name: '张三',
  job_title: '前端工程师',
  visibility: 'private',
  approval_status: 'draft',
  version: 1,
} as unknown as Record<string, unknown>;

const FOUND_BODY = {
  resume: RECORD,
  markdown: '# 张三\n\n前端工程师\n',
  permissions: { can_edit: true, can_publish: false },
  content: { sections: [] },
};

/**
 * The read reply of a resume saved with a style, in the shape the server really sends it.
 *
 * `presentation` is a **sibling** of `resume` (the proto's `ResumeInfo` has no styling field) and its
 * keys are `protojson`-spelled, so a fixture with the styling nested in the record would test a
 * contract the backend does not have — which is how the page came to drop it.
 */
const FOUND_WITH_STYLING = {
  ...FOUND_BODY,
  presentation: {
    schema_version: 1,
    template: 'verdant-banner',
    accent_color: '#8b9d77',
    font_family: 'sans',
    font_scale: 1,
    line_height: 1.6,
    page_margin: '20mm',
    section_order: ['关于我', '工作经历'],
    photo: { enabled: false, path: null },
  },
};

/** Renders the page for a slug, as the framework would. */
async function render(slug = 'resume') {
  const element = await ResumePage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(element as ReactElement);
}

beforeEach(() => {
  notFound.mockClear();
  serverFetch.mockReset();
});

describe('the lookup it performs', () => {
  it('asks the backend by slug, with the cookie’s token', async () => {
    serverFetch.mockResolvedValue(response(200, FOUND_BODY));

    // The page itself, not its rendering: a 200 returns the client component, which needs providers
    // the framework supplies and a unit test should not have to stand up.
    await ResumePage({ params: Promise.resolve({ slug: 'resume' }) });

    expect(serverFetch).toHaveBeenCalledWith('/api/resumes/by-slug/resume', {
      token: 'cookie-token',
    });
  });

  it('encodes a CJK slug, which is this product’s mainstream input', async () => {
    // Slugs keep their CJK (work order 13), so the path is not ASCII by default.
    serverFetch.mockResolvedValue(response(404, { error: '简历不存在' }));

    await expect(render('张三的简历')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(serverFetch).toHaveBeenCalledWith(
      `/api/resumes/by-slug/${encodeURIComponent('张三的简历')}`,
      { token: 'cookie-token' }
    );
  });

  it('encodes it exactly once, because that is the shape that actually arrives', async () => {
    // The returned defect, at the shape the framework really passes: for `/resume/王昱皓`,
    // `params.slug` is `%E7%8E%8B%E6%98%B1%E7%9A%93` — not `王昱皓`. Encoding *that* asked the backend
    // for `%25E7%258E%258B…`, which no row can match, so the backend's honest
    // `404 RESUME_NOT_FOUND` was rendered as 「页面不存在」 for a resume 我的 listed a moment earlier.
    //
    // The case above does not catch this: it builds `params` the way the page wished the framework
    // behaved, so the test and the code shared one wrong assumption. This one is the framework's.
    serverFetch.mockResolvedValue(
      response(403, { error: '无权访问此简历', reason: 'NO_ACCESS' })
    );

    const encoded = encodeURIComponent('王昱皓');
    const html = await render(encoded);

    expect(serverFetch).toHaveBeenCalledWith(`/api/resumes/by-slug/${encoded}`, {
      token: 'cookie-token',
    });
    // Found-but-refused, which is what an existing, private resume must report here.
    expect(html).toContain('无法访问这份简历');
  });
});

describe('404 — the slug really does not exist', () => {
  it('is the only answer that becomes 页面不存在', async () => {
    serverFetch.mockResolvedValue(
      response(404, { error: '简历不存在', reason: 'RESUME_NOT_FOUND' })
    );

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('says so in the tab title as well', async () => {
    serverFetch.mockResolvedValue(response(404, { error: '简历不存在' }));

    await expect(generateMetadata({ params: Promise.resolve({ slug: 'resume' }) })).resolves.toEqual(
      { title: '页面不存在 — Resume' }
    );
  });
});

describe('403 NO_ACCESS — the server was not given the session that owns this resume', () => {
  it('does not claim the resume is gone', async () => {
    // The reported defect. The resume exists, is the user's own, and is one reload away.
    serverFetch.mockResolvedValue(
      response(403, { error: '无权访问此简历', reason: 'NO_ACCESS' })
    );

    const html = await render();

    expect(notFound).not.toHaveBeenCalled();
    expect(html).not.toContain('页面不存在');
    expect(html).toContain('无法访问这份简历');
  });

  it('offers a retry that asks the server again, rather than the client router', async () => {
    // The cookie is written when the client module loads, so by the time this button can be pressed
    // the session the server needs exists. A document request is what carries it — `<Link>` may be
    // answered from the router's cache without asking the backend at all.
    serverFetch.mockResolvedValue(response(403, { error: '无权访问此简历' }));

    const html = await render();

    expect(html).toContain('href="/resume/resume"');
    expect(html).toContain('重新登录');
  });

  it('retries at a URL a browser will send once-encoded', async () => {
    // The retry link has the same encoding rule as the lookup, and for the same reason: it holds the
    // segment the framework handed over. Encoded twice, the retry would ask for a slug that cannot
    // exist — a retry that can only ever confirm 「页面不存在」.
    serverFetch.mockResolvedValue(response(403, { error: '无权访问此简历' }));

    const html = await render(encodeURIComponent('王昱皓'));

    expect(html).toContain(`href="/resume/${encodeURIComponent('王昱皓')}"`);
    expect(html).not.toContain('%25');
  });

  it('does not conflate being refused with the server being unable to answer', async () => {
    // The two states send the user to different actions — retry the session versus wait — so a
    // refusal must not borrow the other explanation.
    serverFetch.mockResolvedValue(response(403, { error: '无权访问此简历' }));

    const html = await render();

    expect(html).toContain('这份简历只对它的所有者可见');
    expect(html).not.toContain('暂时无法加载这份简历');
  });
});

describe('5xx and unreachable — nothing about the resume is known', () => {
  it('reports a failure to load, and shows the status so a bug report can name it', async () => {
    serverFetch.mockResolvedValue(response(500, undefined, '<html>Internal Server Error</html>'));

    const html = await render();

    expect(notFound).not.toHaveBeenCalled();
    expect(html).toContain('暂时无法加载这份简历');
    expect(html).toContain('HTTP 500');
  });

  it('offers reloading rather than re-authenticating', async () => {
    serverFetch.mockResolvedValue(response(503, { error: '服务暂不可用' }));

    const html = await render();

    expect(html).toContain('重新加载');
    expect(html).not.toContain('重新登录');
  });

  it('treats a refused connection as a failure to load, not as a 404', async () => {
    serverFetch.mockRejectedValue(new TypeError('fetch failed'));

    const html = await render();

    expect(notFound).not.toHaveBeenCalled();
    expect(html).toContain('暂时无法加载这份简历');
    expect(html).toContain('无法连接到服务器');
  });
});

describe('200 — the resume is shown', () => {
  it('hands the record and its parsed body to the client page', async () => {
    serverFetch.mockResolvedValue(response(200, FOUND_BODY));

    const element = (await ResumePage({
      params: Promise.resolve({ slug: 'resume' }),
    })) as ReactElement<{ resume: { slug: string }; markdown: string }>;

    expect(notFound).not.toHaveBeenCalled();
    expect(element.type).toBe(ResumePageClient);
    expect(element.props.resume.slug).toBe('resume');
    expect(element.props.markdown).toBe(FOUND_BODY.markdown);
  });

  it('titles the tab with the resume, not with a failure', async () => {
    serverFetch.mockResolvedValue(response(200, FOUND_BODY));

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: 'resume' }) })
    ).resolves.toEqual({ title: '张三 — Resume', description: '张三 — 前端工程师' });
  });
});

describe('the styling it hands to the client', () => {
  /** The record as the client component receives it, styling included. */
  async function recordFor(body: unknown) {
    serverFetch.mockResolvedValue(response(200, body));
    const element = (await ResumePage({ params: Promise.resolve({ slug: 'resume' }) })) as ReactElement<{
      resume: { presentation: { template: string; accentColor: string; sectionOrder: string[] } };
    }>;
    return element.props.resume.presentation;
  }

  it('folds the reply’s sibling presentation into the record', async () => {
    // The defect: nothing folded it, so `ResumeDisplay` read `resume.presentation` as `undefined`,
    // resolved the product default, and a resume saved as 绿野通栏 opened in the ATS-safe template —
    // with no error to say so.
    const presentation = await recordFor(FOUND_WITH_STYLING);

    expect(presentation.template).toBe('verdant-banner');
    expect(presentation.accentColor).toBe('#8b9d77');
    expect(presentation.sectionOrder).toEqual(['关于我', '工作经历']);
  });

  it('gives a resume with no stored style the product default', async () => {
    // A resume saved before styling existed, or a server predating ticket 19. This is the *only*
    // case that may fall back, which is why it is asserted next to the fold.
    expect((await recordFor(FOUND_BODY)).template).toBe(DEFAULT_PRESENTATION.template);
  });
});
