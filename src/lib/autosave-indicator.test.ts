import { describe, it, expect } from 'vitest';
import { autosaveIndicator, formatClockTime } from './autosave-indicator';
import type { AutosaveStatus } from '@/lib/autosave-machine';

/**
 * Tests for the autosave indicator (ticket 14).
 *
 * The indicator is the only thing telling a user whether their work is safe, so these
 * tests are about **distinguishability**: every state must produce a different label and an
 * appropriate tone, and exactly the two states that need the user must be marked
 * actionable. A `saved` and a `failed` that read alike would be the whole feature failing
 * quietly.
 *
 * "Retrying" is not a status of its own. A retryable failure leaves the document `pending`
 * — the save is still owed — and the retrying flag is what changes the wording, so both
 * combinations are covered below.
 */

const ALL_STATUSES: AutosaveStatus[] = [
  'idle',
  'pending',
  'saving',
  'saved',
  'failed',
  'conflict',
];

describe('formatClockTime', () => {
  it('zero-pads both fields', () => {
    expect(formatClockTime(new Date(2026, 0, 2, 9, 5))).toBe('09:05');
  });

  it('uses a 24-hour clock', () => {
    expect(formatClockTime(new Date(2026, 0, 2, 13, 45))).toBe('13:45');
    expect(formatClockTime(new Date(2026, 0, 2, 0, 0))).toBe('00:00');
    // 23:59 rather than 11:59, so a late save is not mistaken for a morning one.
    expect(formatClockTime(new Date(2026, 0, 2, 23, 59))).toBe('23:59');
  });
});

describe('autosaveIndicator', () => {
  it('gives every rendered state a distinct label', () => {
    // Six statuses plus the retrying variant of `pending`: seven labels, all different.
    // A duplicate here would mean two different situations look identical to the user.
    const labels = [
      ...ALL_STATUSES.map((s) => autosaveIndicator(s, null).label),
      autosaveIndicator('pending', null, '网络错误', true).label,
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('describes an untouched document as unflagged', () => {
    const result = autosaveIndicator('idle', null);
    expect(result.label).toBe('尚未修改');
    expect(result.tone).toBe('muted');
    expect(result.actionable).toBe(false);
  });

  it('says there are unsaved changes while waiting for the debounce', () => {
    const result = autosaveIndicator('pending', null);
    expect(result.label).toBe('有未保存的修改');
    expect(result.tone).toBe('active');
  });

  it('uses the default save label when no time is known', () => {
    // `saved` with a null timestamp happens when the caller did not thread the time
    // through. Showing "已保存于 --:--" would be worse than showing less.
    const result = autosaveIndicator('saved', null);
    expect(result.label).toBe('已保存');
    expect(result.label).not.toContain('--');
    expect(result.tone).toBe('ok');
  });

  it('includes the time of the last successful save', () => {
    const result = autosaveIndicator('saved', new Date(2026, 0, 2, 14, 7));
    expect(result.label).toBe('已保存于 14:07');
  });

  it('calls a scheduled retry a retry, not a failure', () => {
    // The distinction is load-bearing: telling the user it failed makes them act on a
    // problem that is already being handled, and would train them to ignore the label.
    const result = autosaveIndicator('pending', null, '网络错误', true);
    expect(result.label).toContain('重试中');
    expect(result.label).toContain('网络错误');
    expect(result.tone).toBe('warn');
    // Not actionable: a retry button here would invite a second request for a save that is
    // already on its way.
    expect(result.actionable).toBe(false);
  });

  it('does not offer a retry while one is already in flight', () => {
    // The label and the affordance must not disagree — this is the case where a retry
    // button would be actively harmful.
    expect(autosaveIndicator('pending', null, '网络错误', true).actionable).toBe(false);
    expect(autosaveIndicator('pending', null, '网络错误', false).actionable).toBe(false);
  });

  it('reports a spent retry budget as actionable', () => {
    const result = autosaveIndicator('failed', null, '保存失败');
    expect(result.label).toContain('保存失败');
    expect(result.tone).toBe('danger');
    expect(result.actionable).toBe(true);
  });

  it('explains that a conflict is not a failure to retry', () => {
    const result = autosaveIndicator('conflict', null);
    expect(result.label).toContain('别处被修改');
    expect(result.tone).toBe('danger');
    // Actionable, because the user must choose — but the label must not read like a
    // transient error, or they will press retry and be refused again.
    expect(result.actionable).toBe(true);
  });

  it('marks exactly the two states that need the user as actionable', () => {
    const actionable = ALL_STATUSES.filter((s) => autosaveIndicator(s, null).actionable);
    expect(actionable.sort()).toEqual(['conflict', 'failed']);
  });

  it('only ever uses warm tones', () => {
    // The design system bans cool colours (AGENTS.md); the tone set is what maps onto it,
    // so a new status cannot smuggle in a blue by inventing a tone.
    const tones = new Set(ALL_STATUSES.map((s) => autosaveIndicator(s, null).tone));
    expect([...tones].every((t) => ['muted', 'active', 'ok', 'warn', 'danger'].includes(t))).toBe(
      true
    );
  });

  it('survives a missing error message without a dangling separator', () => {
    for (const retrying of [true, false]) {
      for (const status of ['pending', 'failed'] as const) {
        const result = autosaveIndicator(status, null, null, retrying);
        expect(result.label.endsWith('：')).toBe(false);
        expect(result.label.endsWith('，')).toBe(false);
      }
    }
  });
});
