'use client';

import { cn } from '@/lib/cn';
import { forwardRef, type SelectHTMLAttributes, useId } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  errorMessage?: string;
  fullWidth?: boolean;
  variant?: 'flat' | 'bordered' | 'underlined';
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, errorMessage, fullWidth = true, variant = 'flat', options, id: propId, ...props }, ref) => {
    const autoId = useId();
    const id = propId || autoId;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            'h-10 rounded-full px-3 text-sm transition-all duration-500',
            'bg-transparent border border-default-200 hover:border-default-300',
            'text-foreground outline-none',
            'focus:border-primary/60 focus:ring-2 focus:ring-primary/10',
            errorMessage && 'border-danger',
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errorMessage && (
          <p className="text-xs text-danger">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
export { Select };
