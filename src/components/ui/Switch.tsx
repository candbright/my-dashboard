'use client';

import { cn } from '@/lib/cn';

/**
 * Switch is the on/off control used for permissions and preferences.
 *
 * It replaces three hand-rolled copies of the same markup (the global-API
 * permission in the user table, the user's own global-API switch, and the admin
 * page's equivalent) which had drifted apart: one of them hardcoded `bg-white`,
 * which is outside the warm palette this project is built on.
 *
 * The knob uses `default-50`, the lightest warm neutral, which stays legible on
 * both the sage track and the neutral track in either theme.
 */
interface SwitchProps {
  /** Whether the switch is on. */
  checked: boolean;
  /** Called with the requested new state. */
  onChange: (next: boolean) => void;
  /** Disables interaction and dims the control. */
  disabled?: boolean;
  /** Accessible name. Required: the switch has no visible text of its own. */
  label: string;
  className?: string;
}

export function Switch({ checked, onChange, disabled = false, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full',
        'transition-colors duration-500 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:pointer-events-none',
        checked ? 'bg-success' : 'bg-default-200',
        !disabled && 'cursor-pointer',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-default-50',
          'transition-transform duration-500 ease-in-out',
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
