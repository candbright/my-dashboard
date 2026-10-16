import { describe, it, expect } from 'vitest';
import {
  VERSION_CONFLICT_STATUS,
  isVersionConflictStatus,
  parseVersionConflict,
  readVersionConflict,
  conflictNotice,
  formatLastModified,
  type VersionConflict,
} from './version-conflict';

/**
 * Tests for the client half of the optimistic lock (ticket 12, ADR-0010).
 *
 * The defect being pinned: the editor sent no version and treated every failure the
 * same way, so a refused save surfaced as "保存失败" and the user's draft was thrown
 * away by the next render. Two properties matter, and they are separate: the response
 * must be classified correctly, and the notice must not read as "your work is gone".
 *
 * The fixture below is the **real** envelope captured from the running server, not a
 * shape invented here. That matters: the reason and metadata keys were being dropped by
 * the error encoder when this module was written, and a made-up fixture would have
 * tested a response the server never sent.
 */

/** A 409 body exactly as `internal/server/http.go` encodes it. */
const realConflictBody = {
  error:
    '这份简历已在别处被修改（服务端版本 3，最后修改于 2026-10-13 10:56:19）。请刷新后重试，以免覆盖他人的改动。',
  metadata: {
    current_version: '3',
    expected_version: '999',
    last_modified_at: '2026-10-13T10:56:19+08:00',
    resume_id: 'd0b07541-7e87-46c1-9d67-7dba1ab2de52',
  },
  reason: 'VERSION_MISMATCH',
};

/** A 409 from a client that sent no version at all. */
const realMissingBody = {
  error:
    '保存失败：本次请求没有携带版本号（服务端当前版本 3，最后修改于 2026-10-13 10:56:19），无法确认你编辑的是最新内容。请刷新页面后重新编辑，以免覆盖他人的改动。',
  metadata: {
    current_version: '3',
    expected_version: '0',
    last_modified_at: '2026-10-13T10:56:19+08:00',
    resume_id: 'd0b07541-7e87-46c1-9d67-7dba1ab2de52',
  },
  reason: 'VERSION_MISSING',
};

function response(body: string, status = 409): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

describe('isVersionConflictStatus', () => {
  it('recognises the conflict status', () => {
    expect(isVersionConflictStatus(VERSION_CONFLICT_STATUS)).toBe(true);
    expect(isVersionConflictStatus(409)).toBe(true);
  });

  it('does not treat other failures as conflicts', () => {
    // 404 and 403 are not recoverable by reloading, and telling the user to reload
    // would be advice that cannot work.
    for (const status of [200, 400, 401, 403, 404, 500, 502]) {
      expect(isVersionConflictStatus(status)).toBe(false);
    }
  });
});

describe('parseVersionConflict', () => {
  it('reads the real VERSION_MISMATCH envelope', () => {
    const conflict = parseVersionConflict(realConflictBody);

    expect(conflict).not.toBeNull();
    expect(conflict!.reason).toBe('VERSION_MISMATCH');
    expect(conflict!.currentVersion).toBe(3);
    expect(conflict!.expectedVersion).toBe(999);
    expect(conflict!.lastModifiedAt).toBe('2026-10-13T10:56:19+08:00');
    expect(conflict!.missingVersion).toBe(false);
  });

  it('reads the real VERSION_MISSING envelope', () => {
    const conflict = parseVersionConflict(realMissingBody);

    expect(conflict!.reason).toBe('VERSION_MISSING');
    expect(conflict!.missingVersion).toBe(true);
    // 0 is what a client with no version sends, so it must survive as a real value
    // rather than being treated as "absent".
    expect(conflict!.expectedVersion).toBe(0);
  });

  it('returns null for a body with no reason', () => {
    // A 409 from a proxy, or from an endpoint that answers 409 for a different
    // reason. Claiming a version conflict here would show unusable advice.
    expect(parseVersionConflict({ error: 'Conflict' })).toBeNull();
    expect(parseVersionConflict({})).toBeNull();
  });

  it('returns null for a reason it does not know', () => {
    expect(parseVersionConflict({ reason: 'SOMETHING_ELSE' })).toBeNull();
  });

  it('returns null for values that are not objects', () => {
    for (const value of [null, undefined, 'conflict', 409, [], true]) {
      expect(parseVersionConflict(value)).toBeNull();
    }
  });

  it('tolerates numeric metadata, because a metadata map may carry either', () => {
    const conflict = parseVersionConflict({
      reason: 'VERSION_MISMATCH',
      metadata: { current_version: 7, expected_version: 3 },
    });

    expect(conflict!.currentVersion).toBe(7);
    expect(conflict!.expectedVersion).toBe(3);
  });

  it('reports a missing or unusable version as null, never as 0', () => {
    // 0 is meaningful in this protocol ("the client sent nothing"), so defaulting to
    // it would report "you sent version 0" for a field the server never sent.
    const conflict = parseVersionConflict({ reason: 'VERSION_MISMATCH', metadata: {} });

    expect(conflict!.currentVersion).toBeNull();
    expect(conflict!.expectedVersion).toBeNull();
    expect(conflict!.lastModifiedAt).toBeNull();
  });

  it('rejects version values that are not finite numbers', () => {
    const conflict = parseVersionConflict({
      reason: 'VERSION_MISMATCH',
      metadata: { current_version: 'abc', expected_version: '' },
    });

    expect(conflict!.currentVersion).toBeNull();
    expect(conflict!.expectedVersion).toBeNull();
  });

  it('rejects a non-finite numeric version', () => {
    const conflict = parseVersionConflict({
      reason: 'VERSION_MISMATCH',
      metadata: { current_version: Number.POSITIVE_INFINITY },
    });

    expect(conflict!.currentVersion).toBeNull();
  });

  it('ignores metadata that is not an object', () => {
    const conflict = parseVersionConflict({ reason: 'VERSION_MISMATCH', metadata: 'nope' });

    expect(conflict).not.toBeNull();
    expect(conflict!.currentVersion).toBeNull();
  });
});

describe('readVersionConflict', () => {
  it('reads a real JSON 409 response', async () => {
    const conflict = await readVersionConflict(response(JSON.stringify(realConflictBody)));

    expect(conflict!.currentVersion).toBe(3);
    expect(conflict!.reason).toBe('VERSION_MISMATCH');
  });

  it('returns null for a non-JSON body instead of throwing', async () => {
    // A proxy retrying with an HTML error page. `res.json()` would throw here, and a
    // throw would surface to the user as "network error" for a server that answered
    // clearly.
    const conflict = await readVersionConflict(
      response('<html><body>409 Conflict</body></html>', 409)
    );

    expect(conflict).toBeNull();
  });

  it('returns null for an empty body', async () => {
    expect(await readVersionConflict(response('', 409))).toBeNull();
  });

  it('returns null for a JSON body that is not an object', async () => {
    expect(await readVersionConflict(response('"conflict"', 409))).toBeNull();
    expect(await readVersionConflict(response('null', 409))).toBeNull();
  });

  it('reads a body with no space in the metadata values', async () => {
    const conflict = await readVersionConflict(
      response(JSON.stringify({ reason: 'VERSION_MISSING', metadata: { current_version: '12' } }))
    );

    expect(conflict!.missingVersion).toBe(true);
    expect(conflict!.currentVersion).toBe(12);
  });
});

describe('conflictNotice', () => {
  it('names the current server version and when it changed', () => {
    const notice = conflictNotice(parseVersionConflict(realConflictBody));

    // The two facts the user needs to decide "is the other change newer than mine".
    expect(notice).toContain('3');
    expect(notice).toMatch(/最后修改于/);
    expect(notice).toContain('已在别处被修改');
  });

  it('tells the user their typing is still there', () => {
    // The single most important property: a refusal must not read as data loss.
    const notice = conflictNotice(parseVersionConflict(realConflictBody));

    expect(notice).toMatch(/仍保留在编辑框/);
    expect(notice).not.toMatch(/丢失|已删除|已清空/);
  });

  it('does not claim somebody else edited it when the client sent no version', () => {
    // VERSION_MISSING means nobody else wrote. Saying otherwise sends the user
    // looking for a colleague who does not exist.
    const notice = conflictNotice(parseVersionConflict(realMissingBody));

    expect(notice).not.toContain('已在别处被修改');
    expect(notice).toMatch(/没有携带版本号/);
    expect(notice).toMatch(/仍保留在编辑框/);
  });

  it('still gives usable advice with no parsed detail', () => {
    const notice = conflictNotice(null);

    expect(notice).toMatch(/刷新/);
    expect(notice).toMatch(/仍保留在编辑框/);
  });

  it('omits the timestamp rather than printing an unusable one', () => {
    const conflict: VersionConflict = {
      reason: 'VERSION_MISMATCH',
      currentVersion: 5,
      lastModifiedAt: null,
      expectedVersion: 1,
      missingVersion: false,
    };
    const notice = conflictNotice(conflict);

    expect(notice).toContain('5');
    expect(notice).not.toMatch(/最后修改于/);
    expect(notice).not.toContain('null');
    expect(notice).not.toContain('Invalid Date');
  });

  it('omits the version when the server did not report one', () => {
    const conflict: VersionConflict = {
      reason: 'VERSION_MISMATCH',
      currentVersion: null,
      lastModifiedAt: null,
      expectedVersion: null,
      missingVersion: false,
    };
    const notice = conflictNotice(conflict);

    expect(notice).not.toContain('null');
    expect(notice).toMatch(/刷新/);
  });
});

describe('formatLastModified', () => {
  it('renders an ISO timestamp for a person', () => {
    // Local time, so the string depends on the machine's zone — assert the shape.
    const formatted = formatLastModified('2026-10-13T02:45:06+08:00');

    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('round-trips an unparseable value rather than printing Invalid Date', () => {
    expect(formatLastModified('not a date')).toBe('not a date');
  });

  it('treats a Go zero time as unknown, not as the year 1', () => {
    // This is the exact string a zero `time.Time` serialises to, and it is reachable:
    // a resume whose `updated_at` was never recorded can still be edited. It parses as
    // a valid date, so without this guard the conflict dialog would claim the resume
    // was last modified two thousand years ago — the one fact the dialog exists to
    // report.
    expect(formatLastModified('0001-01-01T00:00:00Z')).toBe('');
  });

  it('does not blank a genuinely old but real date', () => {
    // Asserts the year rather than the full string: this renders in local time, so the
    // date can legitimately shift by a day (and across New Year) by time zone.
    expect(formatLastModified('1999-12-31T12:00:00Z')).toMatch(/^(1999|2000)-\d{2}-\d{2} /);
    expect(formatLastModified('1000-01-01T12:00:00Z')).not.toBe('');
  });

  it('returns empty for nothing', () => {
    expect(formatLastModified(null)).toBe('');
    expect(formatLastModified('')).toBe('');
  });
});

describe('conflictNotice with an unknown modification time', () => {
  it('omits the timestamp when the backend could not report one', () => {
    // The backend sends an empty `last_modified_at` for a row with no timestamp, and
    // the notice must read as "we do not know" rather than inventing a date.
    const conflict = parseVersionConflict({
      reason: 'VERSION_MISMATCH',
      metadata: { current_version: '4', last_modified_at: '' },
    });
    const notice = conflictNotice(conflict);

    expect(notice).toContain('4');
    expect(notice).not.toMatch(/最后修改于/);
    expect(notice).not.toContain('0001');
  });

  it('omits the timestamp when it is the Go zero time', () => {
    const conflict = parseVersionConflict({
      reason: 'VERSION_MISMATCH',
      metadata: { current_version: '4', last_modified_at: '0001-01-01T00:00:00Z' },
    });
    const notice = conflictNotice(conflict);

    expect(notice).not.toMatch(/最后修改于/);
    expect(notice).not.toContain('0001');
  });
});
