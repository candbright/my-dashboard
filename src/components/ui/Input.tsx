'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, useState, useId } from 'react';
import { cn } from '@/lib/cn';

type InputVariant = 'flat' | 'bordered' | 'underlined' | 'plain';
type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  variant?: InputVariant;
  inputSize?: InputSize;
  errorMessage?: string;
  description?: string;
  startContent?: ReactNode;
  endContent?: ReactNode;
  isInvalid?: boolean;
  fullWidth?: boolean;
  labelPlacement?: 'inside' | 'outside';
}

const sizeMap: Record<InputSize, string> = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

const variantMap: Record<InputVariant, string> = {
  flat: 'bg-default-100 hover:bg-default-200 border-transparent',
  bordered: 'bg-transparent border border-default-200 hover:border-default-300',
  underlined: 'bg-transparent border-b border-default-200 hover:border-default-300 rounded-none px-0',
  plain: 'bg-transparent border-transparent hover:bg-transparent rounded-none px-0',
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      variant = 'bordered',
      inputSize = 'md',
      errorMessage,
      description,
      startContent,
      endContent,
      isInvalid = false,
      fullWidth = true,
      labelPlacement = 'outside',
      disabled,
      id: propId,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const id = propId || autoId;
    const hasError = isInvalid || !!errorMessage;
    // Derived from `id` so the ids stay unique per instance without a second `useId` call, and so
    // a consumer that passes its own `id` still gets matching describedby targets.
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && labelPlacement === 'outside' && (
          <label
            htmlFor={id}
            className={cn('text-sm font-medium', disabled ? 'text-default-400' : 'text-foreground')}
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            'relative flex items-center rounded-full transition-all duration-500',
            variantMap[variant],
            sizeMap[inputSize],
            hasError && 'border-danger hover:border-danger',
            variant === 'plain'
              ? 'focus-within:border-transparent focus-within:ring-0'
              : 'focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10',
            hasError && 'focus-within:border-danger focus-within:ring-danger/20',
            // A read-only field has to look read-only. The browser's default
            // greying is overridden by the classes above, so without this a
            // disabled input is indistinguishable from an editable one and the
            // user only finds out by trying to type.
            disabled &&
              'cursor-not-allowed border-transparent bg-default-100 hover:border-transparent focus-within:border-transparent focus-within:ring-0'
          )}
        >
          {startContent && (
            <span className="flex items-center pl-3 text-default-400">
              {startContent}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            // A field the user cannot tell is wrong is a field they cannot fix. `aria-invalid`
            // carries that state to assistive tech — colour alone does not — and
            // `aria-describedby` ties the message to the field, so it is announced as the
            // field's own description rather than left as orphaned text elsewhere in the form.
            aria-invalid={hasError || undefined}
            aria-describedby={
              hasError && errorMessage
                ? errorId
                : description
                  ? descriptionId
                  : undefined
            }
            className={cn(
              'flex-1 bg-transparent outline-none px-3',
              'text-foreground placeholder:text-default-400',
              disabled && 'cursor-not-allowed text-default-400',
              startContent && 'pl-1.5',
              endContent && 'pr-1.5',
              className
            )}
            {...props}
          />
          {endContent && (
            <span className="flex items-center pr-3 text-default-400">
              {endContent}
            </span>
          )}
        </div>
        {description && !hasError && (
          <p
            id={descriptionId}
            className={cn('text-xs', disabled ? 'text-default-400/70' : 'text-default-400')}
          >
            {description}
          </p>
        )}
        {errorMessage && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input, type InputProps };
