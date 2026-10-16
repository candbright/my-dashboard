'use client';

/**
 * The autosave status indicator (ticket 14).
 *
 * The ticket requires four distinguishable states: 未保存 / 保存中 / 已保存于 HH:mm /
 * 保存失败，重试中. The wording and tone for each come from `autosave-indicator.ts`, so
 * they are testable; this component only renders them.
 *
 * ## Why it is not a toast
 *
 * A toast would be wrong for every state here. "有未保存的修改" has to remain true for as
 * long as it is true, and a notification that disappears after three seconds tells the
 * user their work is safe when it is not. This is a persistent, quiet line next to the
 * document — the status of the file, not an event about it.
 *
 * ## Accessibility
 *
 * `role="status"` with `aria-live="polite"` so a screen reader announces a change of state
 * without interrupting typing. The label is the announcement; the spinner is
 * `aria-hidden`, because "loading" adds nothing to "保存中".
 */

import { Loader2, CloudOff, Check, CircleDashed, RefreshCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import { autosaveIndicator, type AutosaveTone } from '@/lib/autosave-indicator';
import type { AutosaveStatus } from '@/lib/autosave-machine';

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error?: string | null;
  /** Whether a retry is currently in flight (the document is still `pending`). */
  retrying?: boolean;
  /** Called by the retry affordance. Omitted for a read-only viewer. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Tone → classes.
 *
 * Written as a lookup rather than inline ternaries so a new tone cannot quietly fall
 * through to the default and render as grey. Every value is a design-system token: the
 * palette bans cool colours (AGENTS.md), so there is no blue and no red-as-alarm — the
 * `danger` tone is the warm brick the system already uses for destructive actions.
 */
const TONE_CLASSES: Record<AutosaveTone, string> = {
  muted: 'text-default-400',
  active: 'text-default-500',
  ok: 'text-success',
  warn: 'text-warning',
  danger: 'text-danger',
};

function StatusIcon({
  status,
  retrying,
  className,
}: {
  status: AutosaveStatus;
  retrying: boolean;
  className: string;
}) {
  // `aria-hidden` on every icon: the label next to it already says what is happening, and
  // an icon read out as "loader circle" is noise.
  switch (status) {
    case 'saving':
      return <Loader2 aria-hidden className={cn(className, 'animate-spin')} />;
    case 'pending':
      // A pending document that is being retried gets the spinner; one merely waiting for
      // the user to stop typing gets the quiet dashed circle.
      return retrying ? (
        <Loader2 aria-hidden className={cn(className, 'animate-spin')} />
      ) : (
        <CircleDashed aria-hidden className={className} />
      );
    case 'saved':
      return <Check aria-hidden className={className} />;
    case 'failed':
      return <TriangleAlert aria-hidden className={className} />;
    case 'conflict':
      return <CloudOff aria-hidden className={className} />;
    default:
      return <CircleDashed aria-hidden className={className} />;
  }
}

export function AutosaveIndicator({
  status,
  lastSavedAt,
  error,
  retrying = false,
  onRetry,
  className,
}: AutosaveIndicatorProps) {
  const { label, tone, actionable } = autosaveIndicator(status, lastSavedAt, error, retrying);

  return (
    <div
      // `status` is a live region; `polite` waits for a pause in typing rather than
      // interrupting it, which matters in an editor.
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2 text-xs', TONE_CLASSES[tone], className)}
    >
      <StatusIcon status={status} retrying={retrying} className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{label}</span>
      {/*
        Only shown when the machine says the state is actionable, so the button and the
        label cannot disagree — a retry offered for a state that is already being retried
        would make the user act on a problem that is being handled.
      */}
      {actionable && onRetry && (
        <Button
          size="sm"
          variant="light"
          radius="full"
          onClick={onRetry}
          startContent={<RefreshCw aria-hidden className="w-3 h-3" />}
          className="text-xs h-6 px-2 min-w-0 flex-shrink-0"
        >
          重试
        </Button>
      )}
    </div>
  );
}
