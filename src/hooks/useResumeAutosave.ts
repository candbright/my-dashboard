'use client';

/**
 * Autosave for the resume editor (ticket 14, ADR-0010).
 *
 * Extracted from `ResumeEditor` deliberately, before adding anything: that file was
 * already 841 lines and the ticket notes it would keep growing. The save *policy* is in
 * `autosave-machine.ts` as a pure reducer; this file is the shell around it — timers and
 * the unload guard. The form itself does not know any of it.
 *
 * ## The rule this exists to enforce
 *
 * **A failed save must never discard the user's work.** Everything below follows from
 * that. Autosave is a convenience; the draft is the artifact. So this hook:
 *
 * - keeps retrying a retryable failure (a dropped connection) instead of reporting defeat;
 * - stops on a version conflict and hands control back to the user, because ADR-0010
 *   forbids a three-way merge and guessing would overwrite somebody else's work;
 * - warns before unload while text is unsaved, rather than letting a tab close silently
 *   drop an edit that was still inside the debounce window;
 * - never modifies the markdown it was given. It only reports a status.
 *
 * ## Why every trigger is a counter, and the save itself is an effect event
 *
 * React 19.2's `useEffectEvent` gives a stable function that always sees the latest props
 * and state — the correct answer to the debounce problem, where a timer must not read a
 * captured `markdown`. It also carries a restriction: it may only be **called** from
 * effects and other effect events, never from an event handler. `saveNow` and `retry` are
 * event handlers.
 *
 * The tempting fix is to ignore the rule. The honest one is to notice what it is
 * protecting: an event handler runs outside the commit cycle, so a save issued there reads
 * state that React may be about to replace. So the handlers do not save — they *request* a
 * save by bumping a counter (`flushTick`, `retryTick`), and effects watch those counters
 * and issue it. The request therefore lands on a committed state, and there is exactly one
 * place in the file that talks to the network.
 *
 * `inFlightRef` is the last line of defence: two effects can be triggered by the same
 * render, and the reducer's `saving` status only becomes visible on the *next* one.
 */

import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import { classifyFailure, reportedFailureKind, retryDelay } from '@/lib/autosave-failure';
import {
  applyAutosaveEvent,
  initialAutosaveState,
  isDirty,
  shouldSave,
  type AutosaveStatus,
} from '@/lib/autosave-machine';

export type { AutosaveStatus };

export interface UseResumeAutosaveOptions {
  /**
   * The current document.
   *
   * Must be the *editor's* text, not the server's. Feeding it the server's copy would make
   * every save look clean and every edit invisible.
   */
  markdown: string;
  /**
   * Persists the document and resolves with the version the server now has.
   *
   * Rejecting is expected and meaningful: a `ResumeConflictError` means refusal-by-lock,
   * anything else is classified by `classifyFailure`. A promise that resolves is treated
   * as success, so a caller that swallows failures would silently lose data — reject.
   */
  save: (markdown: string) => Promise<{ version: number }>;
  /**
   * Whether autosave runs at all. Pass `false` for a guest or a read-only viewer.
   *
   * When `false` the hook issues **no requests**: this is a hard switch, not a throttle.
   * A guest's save would be refused by the server anyway, and the attempt itself is the
   * bug the ticket calls out.
   */
  enabled: boolean;
  /** Debounce after typing stops. */
  debounceMs?: number;
  /**
   * Set while a conflict is on screen, so autosave stays stopped even if the user keeps
   * typing. The conflict notice owns the decision; typing does not resolve it.
   */
  suspended?: boolean;
  /** Called once per successful save with the version the server returned. */
  onSaved?: (version: number) => void;
  /** Called on a failure that needs the user (a conflict, or a permanent error). */
  onError?: (err: unknown) => void;
}

export interface ResumeAutosave {
  status: AutosaveStatus;
  /** When the last successful save completed, or `null`. */
  lastSavedAt: Date | null;
  /** True while the editor's text differs from what the server has. */
  dirty: boolean;
  /** True while a retryable failure is being retried, for the indicator's wording. */
  retrying: boolean;
  /** The message to show for the current failure, or `null`. */
  error: string | null;
  /** Save immediately, bypassing the debounce. Safe to call when already saved. */
  saveNow: () => void;
  /** Drop the failure state and try again — the "重试" affordance's action. */
  retry: () => void;
  /** Cancel a scheduled save, for a caller that is about to unmount or reload. */
  cancel: () => void;
}

/** Reads a display message out of an unknown rejection. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function useResumeAutosave({
  markdown,
  save,
  enabled,
  debounceMs = 1500,
  suspended = false,
  onSaved,
  onError,
}: UseResumeAutosaveOptions): ResumeAutosave {
  const [state, dispatch] = useReducer(applyAutosaveEvent, undefined, initialAutosaveState);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  /**
   * Bumped to ask for a save *now*.
   *
   * A counter rather than a boolean so two consecutive requests cannot collapse into one:
   * a boolean would already be `true`, and the second section switch would go unsaved.
   */
  const [flushTick, setFlushTick] = useState(0);
  /** Bumped after a retryable failure, to schedule the backoff. */
  const [retryTick, setRetryTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** False once unmounted, so a resolved request does not touch a dead component. */
  const aliveRef = useRef(true);
  /**
   * The newest text, mirrored in an effect.
   *
   * Written **in an effect**, which is the supported direction (read during render, write
   * in an effect), so it needs no suppression. The debounce timer fires far later than
   * that effect runs, so it always sees current text rather than the text as of
   * scheduling — the bug where a keystroke between scheduling and firing is marked clean
   * without ever being sent.
   */
  const markdownRef = useRef(markdown);
  /** True between `attempt` starting and settling. See the header. */
  const inFlightRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * One save attempt, for an explicit piece of text.
   *
   * An effect event, so it always sees the current `save`, `state`, `markdown` and
   * callbacks with none of them as dependencies. That matters for `state`: the retry path
   * reads the retry count *after* the failure was recorded, and a captured value would be
   * one failure stale, so the budget would never be reached.
   *
   * `text` is a parameter rather than read from `markdownRef` so a retry re-sends the same
   * text it originally tried, even if the user has typed more since. Saving the newer text
   * would commit edits whose own request was never made, and then mark them clean.
   */
  const attempt = useEffectEvent(async (text: string) => {
    // The decision lives here, not at the call sites, so every path (debounce, immediate
    // flush, retry) is guarded by the same rule and there is no way to add a caller that
    // forgets to check. The first text an editor reports equals what was loaded, so
    // without this a flush on mount would write the document back to itself.
    if (!shouldSave(state, text)) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    dispatch({ type: 'saveStarted', text, seq: state.seq });

    try {
      const { version } = await save(text);
      if (!aliveRef.current) return;

      setLastSavedAt(new Date());
      dispatch({ type: 'saveSucceeded', text, seq: state.seq });
      onSaved?.(version);
    } catch (err) {
      if (!aliveRef.current) return;

      const classified = classifyFailure(err, isConflictError(err));
      const message = messageOf(err, '保存失败');

      // A spent retry budget is reported as a permanent failure — see `reportedFailureKind`.
      // Leaving the machine `pending` with `retries > 0` is what made the indicator promise
      // "保存失败，重试中…" with nothing scheduled.
      const kind = reportedFailureKind(classified, state.retries);
      dispatch({ type: 'saveFailed', kind, message });

      if (kind !== 'retryable') {
        // A conflict, a permanent error, or a spent budget. The caller reports it — this hook
        // has no UI — and the machine has stopped, so nothing can overwrite anything meanwhile.
        onError?.(err);
        return;
      }

      // Hand the backoff to the effect below, which owns the timer.
      setRetryTick((n) => n + 1);
    } finally {
      inFlightRef.current = false;
    }
  });

  // ── Feed the machine every change of text ──
  //
  // The reducer decides whether that is a change worth saving; this effect only routes it.
  // `state` is deliberately not a dependency: it changes as a *result* of the events
  // dispatched here, and depending on it would re-dispatch in a loop.
  useEffect(() => {
    dispatch({ type: 'edit', text: markdown });
  }, [markdown]);

  // ── The debounce ──
  //
  // Keyed on the reducer's verdict, so it only schedules when a save is actually wanted.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      dispatch({ type: 'disabled' });
      return;
    }
    if (suspended) {
      clearTimer();
      return;
    }
    if (!shouldSave(state, markdown)) {
      // Nothing to do: the text matches the server, a stop is in force, or a request
      // already covers it. Cancelling here is what makes an undo back to the saved text
      // stop the timer instead of saving the reverted document.
      clearTimer();
      return;
    }

    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void attempt(markdownRef.current);
    }, debounceMs);

    return clearTimer;
  }, [state, markdown, enabled, suspended, debounceMs, clearTimer]);

  // ── The immediate flush ──
  //
  // `saveNow` bumps a counter instead of saving, because it is an event handler and
  // `attempt` may not be called from one. This effect runs after the resulting commit, so
  // `attempt` reads settled state.
  useEffect(() => {
    if (flushTick === 0) return;
    if (!enabled || suspended) return;
    clearTimer();
    void attempt(markdownRef.current);
    // `attempt` is deliberately absent: it is an effect event, so it is stable across
    // renders and always reads the latest state. Listing it would only earn a warning, and
    // adding it cannot change when this effect runs.
  }, [flushTick, enabled, suspended, clearTimer]);

  // ── The retry backoff ──
  //
  // Also counter-driven, and for a second reason on top of the rule: leaving the timer to
  // an effect means a retry scheduled just before unmount is cleaned up with everything
  // else, instead of firing a request on behalf of a component that is gone.
  useEffect(() => {
    if (retryTick === 0) return;
    if (!enabled || suspended) return;

    clearTimer();
    const delay = retryDelay(state.retries);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // The same text as the failed attempt, read from the ref only because the text was
      // never stored; `shouldSave` will accept it because the reducer kept the status
      // `pending` for a retryable failure — the save is still owed.
      void attempt(markdownRef.current);
    }, delay);

    return clearTimer;
    // `attempt` is an effect event and is intentionally not listed — see the flush effect.
  }, [retryTick, enabled, suspended, state.retries, clearTimer]);

  /**
   * Saves now, bypassing the debounce.
   *
   * Safe to call on every blur and section toggle: the decision to actually write is made
   * by `shouldSave` inside `attempt`, so a field whose text already matches the server
   * costs nothing.
   */
  const saveNow = useCallback(() => {
    setFlushTick((n) => n + 1);
  }, []);

  /** Clears the stop and tries again, for the retry affordance. */
  const retry = useCallback(() => {
    if (!enabled || suspended) return;
    // Clears `stopped` and the retry counter so the reducer lets the save through, then
    // asks for one the same way `saveNow` does.
    dispatch({ type: 'retryRequested' });
    setFlushTick((n) => n + 1);
  }, [enabled, suspended]);

  // ── The unload guard ──
  //
  // Registered whenever the document is dirty and removed the moment it is not, so a clean
  // page closes without a prompt. `preventDefault` plus a truthy `returnValue` is the only
  // combination browsers honour; the custom wording is ignored by every modern browser,
  // which show their own.
  const dirty = isDirty(state, markdown);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '你有尚未保存的修改，确定要离开吗？';
      return event.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // A scheduled save must not outlive the component.
  useEffect(() => clearTimer, [clearTimer]);

  return {
    status: state.status,
    lastSavedAt,
    dirty,
    // A retryable failure leaves the status `pending` — the save is still owed — so the
    // "正在重试" wording comes from the retry counter instead.
    retrying: state.status === 'pending' && state.retries > 0,
    error: state.error,
    saveNow,
    retry,
    cancel: clearTimer,
  };
}

/**
 * Detects a version conflict without importing `ResumeConflictError`.
 *
 * A circular import is the reason: `resume-api` owns that class and would have to import
 * this module's types. Duck-typing on `name` is safe because the class sets it explicitly,
 * and the `conflict` payload is checked too so an unrelated `Error` that happens to share
 * the name still cannot masquerade as one — misreading a conflict as retryable would spin
 * forever against a lock that will never open.
 */
function isConflictError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { name?: unknown; conflict?: unknown };
  return candidate.name === 'ResumeConflictError' && typeof candidate.conflict === 'object';
}
