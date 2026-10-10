'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Pressable wraps a non-Button interactive control.
 *
 * The project rule is that pages use the shared atoms rather than a raw
 * `<button>`, but several controls here are not buttons in the Button sense: a
 * filter pill, a segmented option, a provider row acting as a radio, a large
 * clickable card. Forcing those through `Button` would mean fighting its colour
 * map and pill sizing on every use.
 *
 * Pressable supplies what the rule actually protects — one place that owns the
 * focus ring, the disabled treatment and the pointer affordance — while leaving
 * the surface styling to the caller.
 *
 * It also exists to fix a real accessibility mistake: these controls used to be
 * `<button>` elements nested inside a `<label>`. A label wrapping a button
 * associates the button as the label's control, so clicking the text around it
 * activated the control and screen readers announced it twice.
 */
interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  ({ className, type = 'button', disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        'transition-all duration-500 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:pointer-events-none',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);

Pressable.displayName = 'Pressable';
export { Pressable, type PressableProps };
