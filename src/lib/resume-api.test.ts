import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveResume,
  saveResumeMetadata,
  saveResumePresentation,
  fetchResumeDetail,
  listResumeVersions,
  fetchResumeVersion,
  rollbackResumeVersion,
  ResumeConflictError,
} from './resume-api';
import { metadataPatchFromDiff } from './resume-metadata';
import { classifyFailure, errorStatus } from './autosave-failure';
import { DEFAULT_PRESENTATION, parsePresentationError } from './resume-presentation';

/**
 * Tests for the resume save wrapper (ticket 12, ADR-0010).
 *
 * What matters here is the **classification** of a failure, not the transport. The bug
 * being pinned: every non-2xx answer was collapsed into `new Error('保存失败')`, so a
 * refused save looked like a broken save. The user's only sensible response to a broken
 * save is to try again — which would be refused again, forever — whereas a refused save
 * is resolved by reloading.
 *
 * `fetch` is stubbed rather than a network client mocked, so the module's real
 * `Response` handling (including the non-JSON path) is exercised.
 */

const conflictBody = {
  error: '这份简历已在别处被修改（服务端版本 3，最后修改于 2026-10-13 10:56:19）。',
  metadata: {
    current_version: '3',
    expected_version: '1',
    last_modified_at: '2026-10-13T10:56:19+08:00',
    resume_id: 'r1',
  },
  reason: 'VERSION_MISMATCH',
};

// Matches what the server actually answers: `resume`, `markdown`, `permissions`. There is
// deliberately no `parsed` key — the backend never sends one, and a fixture that included
// it is what let callers read a field that was always `undefined` (ticket 18).
const savedBody = {
  resume: { id: 'r1', title: '简历', version: 2 },
  markdown: '# 张三\n',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveResume', () => {
  it('sends the version it was given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResume('r1', { markdown: '# 张三\n', version: 7 });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ markdown: '# 张三\n', version: 7 });
  });

  it('sends version 0 rather than omitting it', async () => {
    // The server refuses a save it cannot check, so an absent version and 0 are the
    // same thing to it. Sending the field explicitly keeps "I read no version" visible
    // in the request rather than implied by a missing key.
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResume('r1', { markdown: '# x\n', version: 0 });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toHaveProperty('version', 0);
  });

  it('omits markdown when only the visibility changed', async () => {
    // Sending an empty markdown would be read as "replace the document with nothing".
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResume('r1', { visibility: 'public', version: 3 });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ visibility: 'public', version: 3 });
    expect(body).not.toHaveProperty('markdown');
  });

  it('sends both fields in one request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResume('r1', { markdown: '# x\n', visibility: 'private', version: 1 });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      markdown: '# x\n',
      visibility: 'private',
      version: 1,
    });
  });

  it('returns the saved resume on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    const result = await saveResume('r1', { markdown: '# x\n', version: 1 });

    expect(result.resume.version).toBe(2);
    expect(result.markdown).toBe('# 张三\n');
  });

  it('escapes the id in the path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResume('a/b?c', { markdown: '# x\n', version: 1 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('a%2Fb%3Fc');
  });

  it('throws a ResumeConflictError for a 409 that carries a reason', async () => {
    fetchMock.mockResolvedValue(jsonResponse(conflictBody, 409));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(ResumeConflictError);
    expect(error.conflict.currentVersion).toBe(3);
    expect(error.conflict.reason).toBe('VERSION_MISMATCH');
  });

  it('puts the displayable notice on the error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(conflictBody, 409));

    const error: ResumeConflictError = await saveResume('r1', {
      markdown: '# x\n',
      version: 1,
    }).catch((e) => e);

    expect(error.message).toContain('已在别处被修改');
    expect(error.message).toContain('3');
    // The property the whole feature turns on.
    expect(error.message).toMatch(/仍保留在编辑框/);
  });

  it('falls back to a plain Error for a 409 it cannot interpret', async () => {
    // A 409 from a proxy is not a version conflict, and telling the user to reload
    // their resume would be advice that cannot work.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Conflict' }, 409));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ResumeConflictError);
    expect(error.message).toBe('Conflict');
  });

  it('is not a conflict when the status is not 409', async () => {
    fetchMock.mockResolvedValue(jsonResponse(conflictBody, 500));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(error).not.toBeInstanceOf(ResumeConflictError);
  });

  it('surfaces the server message for a 403', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '无权编辑此简历' }, 403));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(error.message).toBe('无权编辑此简历');
  });

  it('carries the status so autosave can tell a refusal from an outage', async () => {
    // The regression this pins: the message survived but the status did not, so
    // `classifyFailure` saw every failure as status-less and retried a 403 five times with
    // backoff before telling the user anything. Testing the classifier against hand-built
    // `{ status: 403 }` objects could never catch that — only the real wrapper can, which is
    // why this test goes through `saveResume` rather than `classifyFailure` alone.
    fetchMock.mockResolvedValue(jsonResponse({ error: '无权编辑此简历' }, 403));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(errorStatus(error)).toBe(403);
    expect(classifyFailure(error, false)).toBe('permanent');
  });

  it('keeps a 5xx retryable through the same path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '服务器错误' }, 503));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(errorStatus(error)).toBe(503);
    expect(classifyFailure(error, false)).toBe('retryable');
  });

  it('uses a fallback when the failure body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>500</html>', { status: 500 }));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    // The status rides along: "保存失败" alone tells the user and the bug report nothing, and
    // the same failure must read identically whichever module reports it (see `failureText`).
    expect(error.message).toBe('保存失败（HTTP 500）');
  });

  it('uses a fallback when the error field is not a string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { nested: true } }, 400));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(error.message).toBe('保存失败（HTTP 400）');
  });

  it('uses a fallback when the error field is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '' }, 400));

    const error = await saveResume('r1', { markdown: '# x\n', version: 1 }).catch((e) => e);

    expect(error.message).toBe('保存失败（HTTP 400）');
  });
});

describe('fetchResumeDetail', () => {
  it('returns the current server state', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    const result = await fetchResumeDetail('r1');

    expect(result.resume.version).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/resumes/r1');
    expect(init?.method).toBeUndefined();
  });

  it('throws with the server message when the resume is gone', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '简历不存在' }, 404));

    const error = await fetchResumeDetail('r1').catch((e) => e);

    expect(error.message).toBe('简历不存在');
  });

  it('uses a fallback for a non-JSON failure', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 502 }));

    const error = await fetchResumeDetail('r1').catch((e) => e);

    expect(error.message).toBe('获取简历失败（HTTP 502）');
  });

  it('escapes the id in the path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await fetchResumeDetail('a/b');

    expect(fetchMock.mock.calls[0][0]).toContain('a%2Fb');
  });
});

/**
 * Tests for the metadata patch wrapper (ticket 15, ADR-0003).
 *
 * The property under test is **not** transport: it is that the absent-versus-empty
 * distinction survives serialisation. `undefined` means "leave this column alone" and `''`
 * means "clear it", and `JSON.stringify` is the only thing making them different on the wire.
 * A wrapper that defaulted missing keys to `''` would wipe every field the user did not touch,
 * and a test that only checked the edited field would still pass.
 */
describe('saveResumeMetadata', () => {
  it('PATCHes the metadata endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumeMetadata('r1', { version: 3, metadata: { name: '张三' } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/resumes/r1/metadata');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ version: 3, metadata: { name: '张三' } });
  });

  it('escapes the id in the path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumeMetadata('a/b', { version: 1, metadata: { name: 'x' } });

    expect(String(fetchMock.mock.calls[0][0])).toContain('a%2Fb');
  });

  it('sends version 0 rather than omitting it', async () => {
    // Same rule as `saveResume`: the server refuses a write it cannot check, and an absent
    // version is indistinguishable from 0 on the wire, so the field is always explicit.
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumeMetadata('r1', { version: 0, metadata: { name: 'x' } });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveProperty('version', 0);
  });

  it('preserves the absent-versus-empty distinction through JSON', async () => {
    // The whole contract in one assertion. `phone: ''` must appear (it is a clear), and
    // `name` and `email` must not (they were not edited) — even though the caller's object
    // contains all three keys.
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    const metadata = metadataPatchFromDiff(
      { name: '张三', email: 'a@b.com', phone: '138' },
      { name: '张三', email: 'a@b.com', phone: '' }
    );
    await saveResumeMetadata('r1', { version: 2, metadata });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.metadata).toEqual({ phone: '' });
    expect('phone' in body.metadata).toBe(true);
    expect('name' in body.metadata).toBe(false);
    expect('email' in body.metadata).toBe(false);
  });

  it('does not add, drop, or default any key', async () => {
    // A wrapper that normalised the patch would be silently changing the request's meaning.
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumeMetadata('r1', { version: 1, metadata: { avatar: '' } });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).metadata).toEqual({ avatar: '' });
  });

  it('returns the updated record when the write succeeds', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    const result = await saveResumeMetadata('r1', { version: 1, metadata: { name: 'x' } });

    expect(result.resume).toEqual(savedBody.resume);
    expect(result.markdown).toBe(savedBody.markdown);
  });

  it('throws a ResumeConflictError for a 409 so the caller can offer a reload', async () => {
    // Metadata shares the version counter with content, so a stale metadata edit is refused
    // with the same shape as a stale content save — and must be classified identically, or
    // the user would get a generic failure instead of the reload prompt.
    fetchMock.mockResolvedValue(jsonResponse(conflictBody, 409));

    const error = await saveResumeMetadata('r1', { version: 1, metadata: { name: 'x' } }).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(ResumeConflictError);
    expect(error.conflict?.currentVersion).toBe(3);
  });

  it("surfaces the server's own message, not a generic fallback", async () => {
    // The domain produces specific Chinese text for a bad email or URL — including which
    // field is at fault. Replacing it with a generic line would discard the useful part.
    fetchMock.mockResolvedValue(
      jsonResponse({ error: '邮箱格式不正确，示例：name@example.com' }, 400)
    );

    const error = await saveResumeMetadata('r1', {
      version: 1,
      metadata: { email: 'bad' },
    }).catch((e) => e);

    expect(error.message).toBe('邮箱格式不正确，示例：name@example.com');
    expect(error).not.toBeInstanceOf(ResumeConflictError);
  });

  it('falls back to a Chinese message for a non-JSON failure', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 502 }));

    const error = await saveResumeMetadata('r1', {
      version: 1,
      metadata: { name: 'x' },
    }).catch((e) => e);

    expect(error.message).toBe('保存基本信息失败（HTTP 502）');
  });
});

/**
 * Tests for the content-history wrappers (ticket 16, ADR-0010).
 *
 * The behaviour worth pinning is not the transport but two asymmetric cases that a naive
 * implementation gets wrong:
 *
 *  1. An **empty** history. A protobuf `repeated` field is omitted from the JSON entirely
 *     when it is empty, so the first save after this feature ships returns a body with no
 *     `versions` key at all. Reading `data.versions.map(...)` would throw on exactly the
 *     resume a user just created.
 *  2. A rollback that **loses the race**. It is a save under the optimistic lock, so it can
 *     be refused with a 409 like any other write. If that did not surface as a
 *     `ResumeConflictError`, the panel would show a generic failure for a situation the user
 *     can actually resolve by reloading.
 */
describe('listResumeVersions', () => {
  it('requests the versions endpoint for the resume', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ versions: [], total: 0, limit: 50 }));

    await listResumeVersions('r1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resumes/r1/versions');
  });

  it('tolerates an omitted versions field, which is what an empty history sends', async () => {
    // No `versions` key: proto3 omits an empty repeated field rather than sending `[]`.
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, limit: 50 }));

    const result = await listResumeVersions('r1');

    expect(result.versions).toEqual([]);
    expect(result.limit).toBe(50);
  });

  it('tolerates an entirely empty body', async () => {
    // The degenerate case of the above: a handler that answers `{}`. Defaulting the list
    // here is what keeps the panel from throwing on a resume with no history.
    fetchMock.mockResolvedValue(jsonResponse({}));

    const result = await listResumeVersions('r1');

    expect(result.versions).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.limit).toBe(0);
  });

  it('returns the rows it was given', async () => {
    const versions = [
      { id: 'v2', version: 3, createdAt: '2026-03-01T12:00:05Z', createdBy: 'u1' },
      { id: 'v1', version: 2, createdAt: '2026-03-01T12:00:00Z', createdBy: '' },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ versions, total: 2, limit: 50 }));

    const result = await listResumeVersions('r1');

    expect(result.versions).toHaveLength(2);
    // Newest first is the server's contract; this asserts the wrapper does not reorder.
    expect(result.versions[0].version).toBe(3);
    expect(result.total).toBe(2);
  });

  it("surfaces the server's refusal, which is how a non-owner is told", async () => {
    // The authorization check lives server-side (owner or admin, ADR-0010 forbids a
    // history-specific permission), so a 403 is the only signal the client gets.
    fetchMock.mockResolvedValue(jsonResponse({ error: '无权编辑此简历' }, 403));

    const error = await listResumeVersions('r1').catch((e) => e);

    expect(error.message).toBe('无权编辑此简历');
  });

  it('falls back to a Chinese message for a non-JSON failure', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    const error = await listResumeVersions('r1').catch((e) => e);

    expect(error.message).toBe('获取版本历史失败（HTTP 502）');
  });
});

describe('fetchResumeVersion', () => {
  it('addresses the single-version endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ version: { id: 'v1' }, markdown: '# x\n' }));

    const detail = await fetchResumeVersion('r1', 'v1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resumes/r1/versions/v1');
    expect(detail.markdown).toBe('# x\n');
  });

  it('encodes ids that need it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ markdown: '' }));

    await fetchResumeVersion('r 1', 'v/1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resumes/r%201/versions/v%2F1');
  });

  it('defaults a missing version object rather than leaving it undefined', async () => {
    // A body with only `markdown` would otherwise make `detail.version.id` throw at the
    // call site, which is inside a render path.
    fetchMock.mockResolvedValue(jsonResponse({ markdown: '# x\n' }));

    const detail = await fetchResumeVersion('r1', 'v1');

    expect(detail.version.id).toBe('v1');
    expect(detail.markdown).toBe('# x\n');
  });

  it('reports a stale history list as the server words it', async () => {
    // A 404 here means the revision is gone, which is a different problem from a version
    // conflict: nothing is recoverable by reloading the token.
    fetchMock.mockResolvedValue(jsonResponse({ error: '该历史版本不存在' }, 404));

    const error = await fetchResumeVersion('r1', 'gone').catch((e) => e);

    expect(error.message).toBe('该历史版本不存在');
    expect(error).not.toBeInstanceOf(ResumeConflictError);
  });
});

describe('rollbackResumeVersion', () => {
  it('posts the current version to the rollback endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await rollbackResumeVersion('r1', 'v1', 4);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resumes/r1/versions/v1/rollback');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ version: 4 });
  });

  it('returns the save result so the page can refresh its token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    const result = await rollbackResumeVersion('r1', 'v1', 1);

    // A rollback advances the version. Without reading it the next autosave would send a
    // stale token and be refused, which would look like the rollback broke saving.
    expect(result.resume.version).toBe(2);
    expect(result.markdown).toBe('# 张三\n');
  });

  it('surfaces a lost race as a conflict, not a generic failure', async () => {
    // The rollback runs the ordinary locked write, so it can be refused. Classifying this
    // as anything but a conflict would hide the fact that the user's fix is to reload.
    fetchMock.mockResolvedValue(jsonResponse(conflictBody, 409));

    const error = await rollbackResumeVersion('r1', 'v1', 1).catch((e) => e);

    expect(error).toBeInstanceOf(ResumeConflictError);
    expect(error.conflict?.currentVersion).toBe(3);
    expect(error.conflict?.reason).toBe('VERSION_MISMATCH');
  });

  it('falls back to a Chinese message for a non-JSON failure', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));

    const error = await rollbackResumeVersion('r1', 'v1', 1).catch((e) => e);

    expect(error.message).toBe('回滚失败（HTTP 500）');
  });
});

/**
 * The presentation save path (ticket 19, ADR-0004).
 *
 * What matters here is the **shape of the request** and the **classification of a failure**, not
 * the transport. Two things are pinned that a component test could not see:
 *
 *   1. the body is **flat** — styling fields at the top level next to `version`, not nested under
 *      a `presentation` key. The server decodes it strictly (`DisallowUnknownFields`), so a
 *      nested body is rejected as an unknown field rather than silently ignored. Getting this
 *      wrong would produce a 400 whose message names a field the caller never sent.
 *   2. a refused styling value arrives as a plain `Error` carrying the server's text, while a
 *      stale token arrives as a `ResumeConflictError`. The panel branches on those differently:
 *      the first points at a control, the second offers a reload.
 */
describe('saveResumePresentation', () => {
  const presentation = {
    ...DEFAULT_PRESENTATION,
    accentColor: '#8b9d77',
    sectionOrder: ['技能', '工作经历'],
  };

  it('PATCHes the presentation endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumePresentation('r1', { presentation, version: 3 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resumes/r1/presentation');
    expect(init.method).toBe('PATCH');
  });

  it('sends the styling fields flat, next to version', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumePresentation('r1', { presentation, version: 3 });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    // The server's strict decoder refuses an unknown key, so a nested `presentation` wrapper is
    // not a stylistic difference — it is a rejected request.
    expect(body.presentation).toBeUndefined();
    expect(body.accentColor).toBe('#8b9d77');
    expect(body.sectionOrder).toEqual(['技能', '工作经历']);
    expect(body.version).toBe(3);
  });

  it('encodes the id in the path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    await saveResumePresentation('a/b', { presentation, version: 1 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resumes/a%2Fb/presentation');
  });

  it('returns the save result so the page can refresh its token', async () => {
    // A style change advances `version`, so the client's next content save must present the new
    // one. Not reading it here would make the next autosave fail with a conflict that looks like
    // the colour change broke saving.
    fetchMock.mockResolvedValue(jsonResponse(savedBody));

    const result = await saveResumePresentation('r1', { presentation, version: 1 });

    expect(result.resume.version).toBe(2);
  });

  it('surfaces a lost race as a conflict, not a generic failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(conflictBody, 409));

    const error = await saveResumePresentation('r1', { presentation, version: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(ResumeConflictError);
    expect(error.conflict?.currentVersion).toBe(3);
    expect(error.conflict?.reason).toBe('VERSION_MISMATCH');
  });

  it('passes a refused styling value through as the server words it', async () => {
    // The panel parses the field name out of this text with `parsePresentationError`, so
    // replacing it with a generic message would leave the user with a banner and no location.
    const refusal = { error: '展示态字段 accentColor 不合法：不允许使用冷色（蓝/紫/青），请选暖色或中性色' };
    fetchMock.mockResolvedValue(jsonResponse(refusal, 400));

    const error = await saveResumePresentation('r1', { presentation, version: 1 }).catch((e) => e);

    expect(error).not.toBeInstanceOf(ResumeConflictError);
    expect(error.message).toBe(refusal.error);
    expect(parsePresentationError(error.message)?.field).toBe('accentColor');
  });

  it('falls back to a Chinese message for a non-JSON failure', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));

    const error = await saveResumePresentation('r1', { presentation, version: 1 }).catch((e) => e);

    expect(error.message).toBe('保存展示设置失败（HTTP 500）');
  });
});
