import { describe, it, expect } from 'vitest';
import {
  applyAutosaveEvent,
  initialAutosaveState,
  isDirty,
  shouldSave,
  type AutosaveEvent,
  type AutosaveState,
} from './autosave-machine';

/**
 * Tests for the autosave state machine (ticket 14, ADR-0010).
 *
 * These carry the weight of the ticket's acceptance criteria that a browser cannot prove
 * on its own — that a conflict stops autosave, that a retryable failure does not, that a
 * concurrent edit is not marked clean, and that a guest issues nothing.
 *
 * The reducer is pure, so each case is a short sequence of events rather than a rendered
 * component: the *policy* is what can silently lose a draft, and it is all here.
 */

/** Runs a sequence of events from the initial state. */
function run(...events: AutosaveEvent[]): AutosaveState {
  return events.reduce(applyAutosaveEvent, initialAutosaveState());
}

/** The common opening: an editor that reported its loaded text. */
function loaded(text = '# 初始内容\n'): AutosaveState {
  return run({ type: 'edit', text });
}

describe('the first reported text is a baseline, not a change', () => {
  it('adopts it as saved rather than treating a fresh page as dirty', () => {
    // Treating the loaded text as a change would fire a pointless write on every page
    // open — and, worse, would offer to "save" text the server already has.
    const state = loaded();
    expect(state.savedText).toBe('# 初始内容\n');
    expect(state.status).toBe('idle');
    expect(isDirty(state, '# 初始内容\n')).toBe(false);
    expect(shouldSave(state, '# 初始内容\n')).toBe(false);
  });

  it('does not treat unknown as empty', () => {
    // Before anything is saved, `savedText` is unknown. If `null` were coerced to "",
    // every resume would look dirty on open.
    const empty = initialAutosaveState();
    expect(isDirty(empty, '')).toBe(false);
    expect(isDirty(empty, 'anything')).toBe(false);
    expect(shouldSave(empty, 'anything')).toBe(false);
  });
});

describe('an edit becomes saveable', () => {
  it('marks the document pending and dirty', () => {
    const state = run({ type: 'edit', text: 'a' }, { type: 'edit', text: 'ab' });
    expect(state.status).toBe('pending');
    expect(isDirty(state, 'ab')).toBe(true);
    expect(shouldSave(state, 'ab')).toBe(true);
  });

  it('returns to saved when the user undoes back to the stored text', () => {
    // The scheduled request for "ab" is cancelled by the hook on this transition; the
    // machine's job is to stop claiming there is something to store.
    const state = run(
      { type: 'edit', text: 'a' },
      { type: 'edit', text: 'ab' },
      { type: 'edit', text: 'a' }
    );
    expect(state.status).toBe('saved');
    expect(isDirty(state, 'a')).toBe(false);
    expect(shouldSave(state, 'a')).toBe(false);
  });

  it('does not ask for a second request for text already in flight', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'base plus' },
      { type: 'saveStarted', text: 'base plus', seq: 1 }
    );
    expect(state.status).toBe('saving');
    expect(shouldSave(state, 'base plus')).toBe(false);
  });

  it('still wants a save when the text changed while a request was in flight', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'one' },
      { type: 'saveStarted', text: 'one', seq: 1 },
      { type: 'edit', text: 'two' }
    );
    expect(shouldSave(state, 'two')).toBe(true);
    expect(state.status).toBe('pending');
  });
});

describe('a successful save', () => {
  it('records the text and reports saved', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'new' },
      { type: 'saveStarted', text: 'new', seq: 1 },
      { type: 'saveSucceeded', text: 'new', seq: 1 }
    );
    expect(state.status).toBe('saved');
    expect(state.savedText).toBe('new');
    expect(state.inFlightText).toBeNull();
    expect(isDirty(state, 'new')).toBe(false);
  });

  it('does NOT claim saved when the user typed while it was in flight', () => {
    // This is the keystroke-losing bug in its purest form. The request that succeeded
    // stored "one"; the editor now holds "one more". Reporting `saved` would satisfy the
    // indicator and stop the debounce from ever scheduling the newer text.
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'one' },
      { type: 'saveStarted', text: 'one', seq: 1 },
      { type: 'edit', text: 'one more' },
      { type: 'saveSucceeded', text: 'one', seq: 1 }
    );
    expect(state.status).not.toBe('saved');
    expect(state.status).toBe('pending');
    expect(state.savedText).toBe('one');
    expect(isDirty(state, 'one more')).toBe(true);
    expect(shouldSave(state, 'one more')).toBe(true);
  });

  it('clears the retry counter after success', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'new' },
      { type: 'saveStarted', text: 'new', seq: 1 },
      { type: 'saveFailed', kind: 'retryable', message: '网络错误' },
      { type: 'saveStarted', text: 'new', seq: 1 },
      { type: 'saveSucceeded', text: 'new', seq: 1 }
    );
    expect(state.retries).toBe(0);
    expect(state.error).toBeNull();
  });
});

describe('failures', () => {
  it('keeps retrying a retryable failure instead of reporting defeat', () => {
    // The "断网 → 恢复后自动重试成功" acceptance criterion. It stays `pending`, not `failed`:
    // the document is still unsaved and a retry is owed, and the retry counter is what the
    // indicator reads as "正在重试".
    //
    // `pending` rather than a status of its own is deliberate. A distinct `retrying` status
    // had to answer "may a save be issued right now", and answering "no" made `shouldSave`
    // refuse the very retry it existed to permit.
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'new' },
      { type: 'saveStarted', text: 'new', seq: 1 },
      { type: 'saveFailed', kind: 'retryable', message: '网络错误' }
    );
    expect(state.status).toBe('pending');
    expect(state.stopped).toBe(false);
    expect(state.retries).toBe(1);
    expect(isDirty(state, 'new')).toBe(true);
    // The load-bearing assertion: the retry must be allowed through.
    expect(shouldSave(state, 'new')).toBe(true);
  });

  it('stops autosave on a version conflict', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'mine' },
      { type: 'saveStarted', text: 'mine', seq: 1 },
      { type: 'saveFailed', kind: 'conflict', message: '这份简历已在别处被修改' }
    );
    expect(state.status).toBe('conflict');
    expect(state.stopped).toBe(true);
    // Nothing may be written until the user decides: retrying would fail forever, and
    // guessing would overwrite the other tab's work.
    expect(shouldSave(state, 'mine')).toBe(false);
  });

  it('keeps the user draft intact through a conflict', () => {
    // The acceptance criterion "用户输入不丢失": the machine only ever records what the
    // server has, never what the editor should contain.
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'my precious draft' },
      { type: 'saveStarted', text: 'my precious draft', seq: 1 },
      { type: 'saveFailed', kind: 'conflict', message: '冲突' }
    );
    expect(state.savedText).toBe('base');
    expect(isDirty(state, 'my precious draft')).toBe(true);
  });

  it('keeps a conflict sticky while the user keeps typing', () => {
    // Typing does not resolve somebody else's newer version, so an edit must not silently
    // unlock autosave and start overwriting.
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'mine' },
      { type: 'saveFailed', kind: 'conflict', message: '冲突' },
      { type: 'edit', text: 'mine more' }
    );
    expect(state.stopped).toBe(true);
    expect(state.status).toBe('conflict');
    expect(shouldSave(state, 'mine more')).toBe(false);
  });

  it('stops on a permanent failure that retrying cannot fix', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'new' },
      { type: 'saveFailed', kind: 'permanent', message: '没有权限' }
    );
    expect(state.status).toBe('failed');
    expect(state.stopped).toBe(true);
    expect(shouldSave(state, 'new')).toBe(false);
  });

  it('lets a new edit clear a permanent failure', () => {
    // A 403 after a re-login, or a 400 fixed by editing, should not require a reload.
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'new' },
      { type: 'saveFailed', kind: 'permanent', message: '没有权限' },
      { type: 'edit', text: 'newer' }
    );
    expect(state.stopped).toBe(false);
    expect(state.status).toBe('pending');
    expect(state.error).toBeNull();
    expect(shouldSave(state, 'newer')).toBe(true);
  });

  it('counts each retryable failure so the backoff can grow', () => {
    let state = run({ type: 'edit', text: 'base' }, { type: 'edit', text: 'new' });
    for (let i = 1; i <= 3; i++) {
      state = applyAutosaveEvent(state, { type: 'saveFailed', kind: 'retryable', message: 'x' });
      expect(state.retries).toBe(i);
    }
  });
});

describe('retry and stop-clearing', () => {
  it('resumes from a stop when the user asks', () => {
    const state = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'new' },
      { type: 'saveFailed', kind: 'permanent', message: '没有权限' },
      { type: 'retryRequested' }
    );
    expect(state.stopped).toBe(false);
    expect(state.status).toBe('pending');
    expect(state.retries).toBe(0);
    expect(shouldSave(state, 'new')).toBe(true);
  });

  it('clears a conflict stop only through an explicit signal', () => {
    // The conflict notice owns this decision. Nothing the user types may clear it.
    const conflicted = run(
      { type: 'edit', text: 'base' },
      { type: 'edit', text: 'mine' },
      { type: 'saveFailed', kind: 'conflict', message: '冲突' }
    );
    expect(conflicted.stopped).toBe(true);

    const cleared = applyAutosaveEvent(conflicted, { type: 'stopCleared' });
    expect(cleared.stopped).toBe(false);
    expect(cleared.error).toBeNull();
  });

  it('re-enables after a guest session ends', () => {
    const disabled = run({ type: 'edit', text: 'base' }, { type: 'disabled' });
    expect(disabled.status).toBe('idle');
    expect(disabled.stopped).toBe(true);

    const reenabled = run(
      { type: 'edit', text: 'base' },
      { type: 'disabled' },
      { type: 'edit', text: 'changed' }
    );
    // `disabled` leaves `savedText` alone, so the baseline survives and the edit is
    // correctly seen as a change once autosave is switched back on.
    expect(reenabled.savedText).toBe('base');
    expect(reenabled.status).toBe('pending');
  });

  /**
   * The regression guard for the infinite render loop on `/resume/<slug>`.
   *
   * `disabled` used to return a freshly-spread object on every dispatch, so its identity
   * changed even when no field did. That alone is harmless — it becomes a loop because
   * `useResumeAutosave`'s debounce effect depends on `state`
   * (`src/hooks/useResumeAutosave.ts:267`) *and* dispatches `{ type: 'disabled' }` from
   * inside itself (`:245`) whenever `enabled` is false: every dispatch changed `state`
   * identity, which re-ran the effect, which dispatched again, forever.
   *
   * The trigger was not an edge case: `enabled` is `autosaveEnabled`, computed at
   * `ResumePageClient.tsx:427` as `mode === 'edit' && can_edit && !isGuest`, and `mode`
   * initialises to `'view'` (`:202`). So **every visitor and guest** looped; an editor
   * only escaped after entering edit mode.
   *
   * Why the cases above missed it — the lesson worth keeping: they assert `status` and
   * `savedText`, and **both values were correct**. The reducer was right in isolation and
   * wrong under React. What went unasserted is the *identity* contract that makes a
   * reducer safe to depend on: **a transition that cannot change anything must come back
   * as the same object.** That is why 51 green autosave tests coexisted with a live loop.
   *
   * Keep this test even though the fix looks obvious. Its value is not the assertion, it
   * is the rule: any reducer whose state feeds a `useEffect` dependency array needs one
   * of these, because field-level assertions cannot catch an identity loop.
   */
  it('returns the same object when `disabled` cannot change anything', () => {
    const disabled = applyAutosaveEvent(initialAutosaveState(), { type: 'disabled' });

    // The first dispatch may legitimately allocate. The second must not: by then every
    // field is already at its target value, so a new object would be a change with no
    // difference — and React's dependency comparison only looks at identity.
    expect(applyAutosaveEvent(disabled, { type: 'disabled' })).toBe(disabled);
  });

  it('still applies `disabled` when it does change something', () => {
    // The guard against "fix the loop by making the transition a no-op". From a state that
    // is *not* already idle-and-stopped, `disabled` must still take effect, or autosave
    // would keep running after it was switched off.
    //
    // `loaded()` establishes the baseline, because the first text an editor reports is
    // adopted rather than treated as a change (`autosave-machine.ts:122`) — without it this
    // would be testing the initial state, which is already idle-and-stopped.
    const dirty = applyAutosaveEvent(loaded(), { type: 'edit', text: '# 改过了\n' });
    expect(dirty.status).toBe('pending');

    const disabled = applyAutosaveEvent(dirty, { type: 'disabled' });
    expect(disabled).not.toBe(dirty);
    expect(disabled.status).toBe('idle');
    expect(disabled.stopped).toBe(true);
  });
});

describe('the indicator cannot lie', () => {
  it('is never `saved` while the text differs from the stored one', () => {
    // The invariant worth pinning: a user who is told "已保存" while text is unsaved stops
    // checking, which makes autosave worse than not having it.
    const paths: AutosaveEvent[][] = [
      [{ type: 'edit', text: 'a' }],
      [{ type: 'edit', text: 'a' }, { type: 'edit', text: 'b' }],
      [
        { type: 'edit', text: 'a' },
        { type: 'edit', text: 'b' },
        { type: 'saveStarted', text: 'b', seq: 1 },
      ],
      [
        { type: 'edit', text: 'a' },
        { type: 'edit', text: 'b' },
        { type: 'saveStarted', text: 'b', seq: 1 },
        { type: 'saveSucceeded', text: 'b', seq: 1 },
      ],
      [
        { type: 'edit', text: 'a' },
        { type: 'edit', text: 'b' },
        { type: 'saveStarted', text: 'b', seq: 1 },
        { type: 'saveFailed', kind: 'retryable', message: 'x' },
      ],
      [
        { type: 'edit', text: 'a' },
        { type: 'edit', text: 'b' },
        { type: 'saveFailed', kind: 'conflict', message: 'x' },
      ],
    ];

    for (const path of paths) {
      const state = path.reduce(applyAutosaveEvent, initialAutosaveState());
      const onScreen = (path[path.length - 1] as { text?: string }).text ?? 'b';
      if (state.status === 'saved') {
        expect(isDirty(state, onScreen)).toBe(false);
      }
    }
  });

  it('never schedules a save for an unchanged document in any status', () => {
    const statuses = ['idle', 'pending', 'saving', 'saved', 'failed', 'conflict'] as const;
    for (const status of statuses) {
      const state: AutosaveState = { ...loaded('same'), status };
      expect(shouldSave(state, 'same')).toBe(false);
    }
  });

  it('still allows a retry for an unchanged document while retrying', () => {
    // The exception that the removed `retrying` status used to break: a retryable failure
    // leaves the text unchanged *and* unsaved, so "unchanged" must not by itself veto the
    // retry. Only the text-versus-server comparison may, and here it agrees there is work.
    const state = run(
      { type: 'edit', text: 'same' },
      { type: 'edit', text: 'changed' },
      { type: 'saveStarted', text: 'changed', seq: 1 },
      { type: 'saveFailed', kind: 'retryable', message: '断网' }
    );
    expect(state.status).toBe('pending');
    expect(state.retries).toBeGreaterThan(0);
    expect(shouldSave(state, 'changed')).toBe(true);
  });
});
