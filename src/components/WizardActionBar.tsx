'use client';

/**
 * The wizard's step actions — 上一步 on the left, 下一步 (or the step's primary actions) on the right.
 *
 * Every phase used to draw its own bar: step 1 was sticky with a hint on the left, step 2 was sticky
 * with 上一步 on the left and a draft notice on the right, step 3 was `fixed` with 返回 on the left
 * and the save buttons on the right. The three bars did not share a slot, so "next" and "back" jumped
 * around, and the hints in the bar were a second copy of what the step already said. One component,
 * one layout, no copy in the bar.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function WizardActionBar({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 border-t border-default-200 bg-content1/95 backdrop-blur-md',
        className
      )}
    >
      <div className="mx-auto flex min-h-[4.25rem] max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-h-10 min-w-0 items-center">{left}</div>
        <div className="flex min-h-10 min-w-0 items-center justify-end gap-3">{right}</div>
      </div>
    </div>
  );
}
