/**
 * Rendering the autosave indicator (ticket 14).
 *
 * Split from the component so the wording is testable: the indicator is the *only* thing
 * telling a user whether their work is safe, so its states need to be provably distinct
 * rather than merely plausible. A user who cannot tell `保存失败` from `已保存` has no way
 * to know their edit is at risk, which is the whole failure this feature prevents.
 *
 * Pure functions only — no React, no clock of its own (`now` is injected so the
 * "已保存于 HH:mm" cases are deterministic).
 */

import type { AutosaveStatus } from '@/lib/autosave-machine';

/** Which colour family the indicator should use. */
export type AutosaveTone = 'muted' | 'active' | 'ok' | 'warn' | 'danger';

export interface AutosaveIndicator {
  label: string;
  tone: AutosaveTone;
  /**
   * Whether the label describes a state the user must act on.
   *
   * The caller uses this to decide whether to show the retry button; keeping the decision
   * here means the label and the affordance cannot disagree.
   */
  actionable: boolean;
}

/** Two-digit zero padding, without depending on the platform's `Intl` data. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Local `HH:mm`, which is what a person compares against their own clock. */
export function formatClockTime(when: Date): string {
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/**
 * Describes the current autosave state for display.
 *
 * `lastSavedAt` is only used for `saved`, and a `saved` status with no timestamp shows
 * `已保存` rather than a nonsensical `已保存于 --:--`.
 *
 * `retrying` says whether a retry is currently in flight. It is a separate argument rather
 * than a status because the document's save state during a backoff is genuinely `pending`
 * — "unsaved, and about to be attempted" — and it is that state, not a distinct one, that
 * has to permit the retry.
 */
export function autosaveIndicator(
  status: AutosaveStatus,
  lastSavedAt: Date | null,
  error?: string | null,
  retrying = false
): AutosaveIndicator {
  switch (status) {
    case 'idle':
      return { label: '尚未修改', tone: 'muted', actionable: false };

    case 'pending':
      if (retrying) {
        // Says "retrying" rather than "failed" on purpose: a retry is in flight, and
        // telling the user it failed would make them act on a problem already being
        // handled. Not `actionable` for the same reason — a retry button here would invite
        // a second request for a save that is already on its way.
        return {
          label: error ? `保存失败，重试中：${error}` : '保存失败，重试中…',
          tone: 'warn',
          actionable: false,
        };
      }
      return { label: '有未保存的修改', tone: 'active', actionable: false };

    case 'saving':
      return { label: '保存中…', tone: 'active', actionable: false };

    case 'saved':
      return {
        label: lastSavedAt ? `已保存于 ${formatClockTime(lastSavedAt)}` : '已保存',
        tone: 'ok',
        actionable: false,
      };

    case 'failed':
      return {
        label: error ? `保存失败：${error}` : '保存失败',
        tone: 'danger',
        actionable: true,
      };

    case 'conflict':
      // The wording matters: this is not a failure the user caused, and the fix is the
      // separate conflict notice, which offers to load the server's copy while keeping the
      // draft. Pointing at it avoids the user retrying a save that must not succeed.
      return {
        label: '保存已暂停：这份简历在别处被修改，请先处理冲突',
        tone: 'danger',
        actionable: true,
      };

    default: {
      // Exhaustiveness: a new status must be handled here rather than silently rendering
      // an empty indicator, which would look like "everything is fine".
      const never: never = status;
      return { label: String(never), tone: 'muted', actionable: false };
    }
  }
}
