/**
 * The autosave state machine (ticket 14, ADR-0010).
 *
 * The hook that uses this is a thin shell around timers and refs; **every decision** —
 * when a save is worth issuing, whether a failure is retried or reported, when autosave
 * stops — is a pure transition here. That split is deliberate:
 *
 * - The rules are the part that can silently lose a user's work, so they have to be
 *   testable without a DOM, a fake clock, or a React renderer.
 * - A bug in this file is a bug in "did my edit survive", which is not something to
 *   discover in production.
 *
 * ## The invariant
 *
 * `dirty` means the editor's text is not what the server has. It is derived, never
 * assigned, so there is no way to reach a state where the indicator says `已保存` while
 * text is unsaved — the failure mode that makes an autosave feature worse than none,
 * because the user stops checking.
 */

import type { FailureKind } from './autosave-failure';

/** What the indicator shows. Mirrors `AutosaveStatus` in the hook. */
export type AutosaveStatus =
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'conflict';

export interface AutosaveState {
  status: AutosaveStatus;
  /** What the server is known to have. `null` = nothing saved in this session yet. */
  savedText: string | null;
  /**
   * The text the in-flight request is storing, or `null`.
   *
   * Tracked so a retry re-sends the *same* text. Sending newer text on a retry would
   * commit edits whose own request had not been made, and then mark them clean.
   */
  inFlightText: string | null;
  /**
   * Retryable failures on the current text, used for the backoff delay.
   *
   * While this is greater than zero the document is being retried, which is what the
   * indicator reports. It is **not** a status of its own: a distinct `retrying` status
   * would have to answer "is a save allowed right now", and the answer during a backoff
   * is yes — which made `shouldSave` refuse the very retry it existed to permit.
   */
  retries: number;
  /** True once a conflict or a permanent failure has stopped autosave. */
  stopped: boolean;
  /** The current failure's message, or `null`. */
  error: string | null;
  /** Bumped by every accepted edit, so a stale response can be recognised. */
  seq: number;
}

/**
 * Everything that can happen.
 *
 * `edit` carries the text because the reducer must be able to answer "is this different
 * from what the server has" without reaching outside itself.
 */
export type AutosaveEvent =
  /** The editor's text changed (or it reported its initial text). */
  | { type: 'edit'; text: string }
  /** A save was actually issued for this text. */
  | { type: 'saveStarted'; text: string; seq: number }
  /** The server accepted it. */
  | { type: 'saveSucceeded'; text: string; seq: number }
  /** The server refused it, or the request never arrived. */
  | { type: 'saveFailed'; kind: FailureKind; message: string }
  /** The user asked to try again after a stop. */
  | { type: 'retryRequested' }
  /** A conflict was resolved, or the notice dismissed. */
  | { type: 'stopCleared' }
  /** Autosave was switched off (a guest session, or the editor closed). */
  | { type: 'disabled' };

export function initialAutosaveState(): AutosaveState {
  return {
    status: 'idle',
    savedText: null,
    inFlightText: null,
    retries: 0,
    stopped: false,
    error: null,
    seq: 0,
  };
}

/**
 * Whether the editor's text differs from the server's.
 *
 * The `null` case is the important one: before anything has been saved in this session,
 * `savedText` is unknown, not empty. Treating unknown as "empty" would make a
 * freshly-opened resume look dirty and fire a pointless write on every page load.
 */
export function isDirty(state: AutosaveState, text: string): boolean {
  if (state.savedText === null) return false;
  return text !== state.savedText;
}

/** Whether a save should be issued for `text` right now. */
export function shouldSave(state: AutosaveState, text: string): boolean {
  if (state.stopped) return false;
  // The first text an editor reports is what was loaded, so there is nothing to store.
  if (state.savedText === null) return false;
  if (text === state.savedText) return false;
  // Already being stored: a second request for the same text is pure waste, and can
  // arrive out of order and make the version go backwards in the caller's eyes.
  if (text === state.inFlightText && state.status === 'saving') return false;
  return true;
}

export function applyAutosaveEvent(state: AutosaveState, event: AutosaveEvent): AutosaveState {
  switch (event.type) {
    case 'edit': {
      // The first reported text is adopted as the baseline rather than treated as a change.
      if (state.savedText === null) {
        return { ...state, savedText: event.text, status: 'idle' };
      }

      // A conflict outlives further typing. This is the check that matters most in this
      // file: without it, one keystroke after a refusal would drop the `stopped` flag and
      // set the status to `pending`, and the next debounce would overwrite the version the
      // lock had just refused to overwrite. Typing does not resolve somebody else's newer
      // version — only the user, through `stopCleared`, can.
      if (state.status === 'conflict') {
        return { ...state, seq: state.seq + 1 };
      }

      if (event.text === state.savedText) {
        // Undone back to the saved text: nothing to store, and saying "有未保存的修改"
        // would be wrong even though a request may already be scheduled. The hook cancels
        // its timer on this transition.
        return { ...state, status: 'saved', seq: state.seq + 1 };
      }
      if (event.text === state.inFlightText && state.status === 'saving') {
        // The text being saved is the text on screen, so there is nothing pending.
        return state;
      }
      return {
        ...state,
        status: 'pending',
        // A new edit clears a stop from a *permanent* failure: the user may have fixed
        // whatever caused it.
        stopped: false,
        error: null,
        seq: state.seq + 1,
      };
    }

    case 'saveStarted':
      return { ...state, status: 'saving', inFlightText: event.text, error: null };

    case 'saveSucceeded': {
      const next: AutosaveState = {
        ...state,
        savedText: event.text,
        inFlightText: null,
        retries: 0,
        error: null,
      };
      // If the user typed while this was in flight, the document is *not* clean. Saying
      // "已保存" here is the exact lie that stops the next save from ever being scheduled.
      if (state.seq !== event.seq) {
        return { ...next, status: 'pending' };
      }
      return { ...next, status: 'saved' };
    }

    case 'saveFailed': {
      switch (event.kind) {
        case 'conflict':
          // Stop for good until the caller clears it. ADR-0010 forbids a three-way merge,
          // and retrying would either fail forever or overwrite a colleague's work.
          return { ...state, status: 'conflict', stopped: true, error: event.message };
        case 'permanent':
          return { ...state, status: 'failed', stopped: true, error: event.message };
        default:
          // Stays `pending`, because it is: the text is still unsaved and a retry is
          // coming. `retries > 0` is what the indicator reads as "正在重试" — keeping the
          // status pending is what lets `shouldSave` approve the retry.
          return {
            ...state,
            status: 'pending',
            stopped: false,
            retries: state.retries + 1,
            error: event.message,
          };
      }
    }

    case 'retryRequested':
      return { ...state, stopped: false, retries: 0, error: null, status: 'pending' };

    case 'stopCleared':
      return { ...state, stopped: false, error: null, status: 'idle' };

    case 'disabled':
      // Idempotent on purpose. `disabled` is dispatched from an effect that depends on
      // `state` (see the regression test in `autosave-machine.test.ts`), so returning a
      // fresh object here — even when every field is already at its target value — makes
      // that effect re-run forever, which is what produced an infinite render loop on
      // every public resume page. A transition that cannot change anything must return
      // the identical object so React's dependency comparison sees no change.
      if (state.status === 'idle' && state.stopped && state.error === null) {
        return state;
      }
      return { ...state, status: 'idle', stopped: true, error: null };

    default: {
      const never: never = event;
      return never;
    }
  }
}
