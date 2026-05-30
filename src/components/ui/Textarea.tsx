'use client';

import { forwardRef, type TextareaHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  variant?: 'flat' | 'bordered';
  errorMessage?: string;
  description?: string;
  isInvalid?: boolean;
  fullWidth?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      label,
      variant = 'bordered',
      errorMessage,
      description,
      isInvalid = false,
      fullWidth = true,
      id: propId,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const id = propId || autoId;
    const hasError = isInvalid || !!errorMessage;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-full px-3 py-2.5 text-sm transition-all duration-500',
            'text-foreground placeholder:text-default-400 outline-none',
            'resize-y min-h-[80px]',
            variant === 'bordered'
              ? 'bg-transparent border border-default-200 hover:border-default-300'
              : 'bg-default-100 hover:bg-default-200 border-transparent',
            'focus:border-primary/60 focus:ring-2 focus:ring-primary/10',
            hasError && 'border-danger hover:border-danger focus:border-danger focus:ring-danger/20',
            className
          )}
          {...props}
        />
        {description && !hasError && (
          <p className="text-xs text-default-400">{description}</p>
        )}
        {errorMessage && (
          <p className="text-xs text-danger">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export { Textarea, type TextareaProps };
