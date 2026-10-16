import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  errorStatus,
  reportedFailureKind,
  retryDelay,
  MAX_AUTOSAVE_RETRIES,
} from './autosave-failure';
import { ApiError } from './api-client';

/**
 * Tests for the autosave failure classifier (ticket 14).
 *
 * The rule under test is the one that decides whether the user's typing gets retried or
 * abandoned. Getting it wrong is asymmetric: classifying a permanent failure as
 * retryable produces a spinner that never resolves, while classifying a retryable failure
 * as permanent throws away a draft over a momentary dropped connection. So both
 * directions are pinned, not just the happy path.
 */

describe('errorStatus', () => {
  it('reads the status the transport attached', () => {
    expect(errorStatus(new ApiError('没有权限', 403))).toBe(403);
    expect(errorStatus({ status: 500 })).toBe(500);
  });

  it('returns null when there is no status to find', () => {
    expect(errorStatus(new TypeError('Failed to fetch'))).toBeNull();
    expect(errorStatus(new Error('boom'))).toBeNull();
    expect(errorStatus(null)).toBeNull();
    expect(errorStatus(undefined)).toBeNull();
    expect(errorStatus('500')).toBeNull();
    expect(errorStatus({ status: '500' })).toBeNull();
  });

  it('ignores a non-finite status', () => {
    expect(errorStatus({ status: Number.NaN })).toBeNull();
    expect(errorStatus({ status: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('classifyFailure', () => {
  it('treats a version conflict as needing a user decision', () => {
    expect(classifyFailure(new Error('anything'), true)).toBe('conflict');
    // Even a 500 is a conflict when the caller says so: the flag is authoritative,
    // because only the caller has the parsed 409 body.
    expect(classifyFailure({ status: 500 }, true)).toBe('conflict');
  });

  it('recognises a 409 by status alone', () => {
    expect(classifyFailure({ status: 409 }, false)).toBe('conflict');
  });

  it('retries a transport failure, where there is no status at all', () => {
    // This is the "断网" acceptance criterion: no network must retry, not fail.
    expect(classifyFailure(new TypeError('Failed to fetch'), false)).toBe('retryable');
    expect(classifyFailure(new Error('NetworkError when attempting to fetch'), false)).toBe(
      'retryable'
    );
  });

  it('retries 5xx responses', () => {
    for (const status of [500, 502, 503, 504, 599]) {
      expect(classifyFailure({ status }, false)).toBe('retryable');
    }
  });

  it('retries the statuses that explicitly ask for it', () => {
    for (const status of [408, 425, 429]) {
      expect(classifyFailure({ status }, false)).toBe('retryable');
    }
  });

  it('does not retry a client mistake that will be repeated verbatim', () => {
    // 400 and 422 mean the request is wrong; 401/403 mean it will never be allowed;
    // 404 means the target is gone. Retrying any of these burns requests and hides the
    // real cause behind a permanent "重试中".
    for (const status of [400, 401, 403, 404, 410, 413, 422]) {
      expect(classifyFailure({ status }, false)).toBe('permanent');
    }
  });

  it('does not retry a 200-range status that somehow surfaced as an error', () => {
    // Defensive: a 2xx should never reach here, but if a caller mis-signals, retrying is
    // the wrong default because the request evidently did not do what was expected.
    expect(classifyFailure({ status: 200 }, false)).toBe('permanent');
  });
});

describe('reportedFailureKind', () => {
  it('keeps a conflict a conflict, whatever the budget says', () => {
    expect(reportedFailureKind('conflict', 0)).toBe('conflict');
    expect(reportedFailureKind('conflict', MAX_AUTOSAVE_RETRIES + 5)).toBe('conflict');
  });

  it('never downgrades a permanent failure', () => {
    expect(reportedFailureKind('permanent', 0)).toBe('permanent');
  });

  it('leaves a retryable failure retryable while the budget lasts', () => {
    expect(reportedFailureKind('retryable', 0)).toBe('retryable');
    expect(reportedFailureKind('retryable', MAX_AUTOSAVE_RETRIES - 1)).toBe('retryable');
  });

  it('reports a spent budget as permanent, so nothing claims a retry is coming', () => {
    // The regression: this used to stay `retryable`, which leaves the machine `pending` with
    // `retries > 0` — exactly the pair `autosaveIndicator` reads as "保存失败，重试中…" — while
    // no retry is scheduled. The user was told to wait for something that would never happen.
    expect(reportedFailureKind('retryable', MAX_AUTOSAVE_RETRIES)).toBe('permanent');
  });
});

describe('retryDelay', () => {
  it('grows with the attempt number', () => {
    const noJitter = () => 0.5;
    const first = retryDelay(1, 2000, 30000, noJitter);
    const second = retryDelay(2, 2000, 30000, noJitter);
    const third = retryDelay(3, 2000, 30000, noJitter);

    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
  });

  it('never exceeds the ceiling, however many attempts have failed', () => {
    for (const attempt of [1, 5, 20, 100]) {
      expect(retryDelay(attempt, 2000, 30000, () => 1)).toBeLessThanOrEqual(30000);
    }
  });

  it('stays within [half, full] of the capped value, so jitter cannot invert the order', () => {
    // Full jitter would let attempt 3 come back sooner than attempt 2, which is fine for a
    // herd but confusing in a UI that says "重试中". Bounded jitter spreads the herd while
    // keeping later attempts later.
    const low = retryDelay(2, 2000, 30000, () => 0);
    const high = retryDelay(2, 2000, 30000, () => 1);
    expect(low).toBe(2000); // cap for attempt 2 is 4000, half is 2000
    expect(high).toBe(4000);
  });

  it('treats a non-positive attempt as the first one', () => {
    expect(retryDelay(0, 2000, 30000, () => 1)).toBe(2000);
    expect(retryDelay(-5, 2000, 30000, () => 1)).toBe(2000);
  });

  it('has a retry budget that is finite', () => {
    // A budget of zero or a huge number would both be defects: the first would never
    // retry a dropped connection, the second would retry all afternoon.
    expect(MAX_AUTOSAVE_RETRIES).toBeGreaterThan(0);
    expect(MAX_AUTOSAVE_RETRIES).toBeLessThanOrEqual(10);
  });
});
