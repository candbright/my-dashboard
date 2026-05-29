'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, useState, useId } from 'react';
import { cn } from '@/lib/cn';

type InputVariant = 'flat' | 'bordered' | 'underlined';
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
  bordered: 'bg-transparent border-2 border-default-200 hover:border-default-400',
  underlined: 'bg-transparent border-b-2 border-default-200 hover:border-default-400 rounded-none px-0',
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
        {label && labelPlacement === 'outside' && (
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div
          className={cn(
            'relative flex items-center rounded-xl transition-all duration-200',
            variantMap[variant],
            sizeMap[inputSize],
            hasError && 'border-danger hover:border-danger',
            'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
            hasError && 'focus-within:border-danger focus-within:ring-danger/20',
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
            className={cn(
              'flex-1 bg-transparent outline-none px-3',
              'text-foreground placeholder:text-default-400',
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
          <p className="text-xs text-default-400">{description}</p>
        )}
        {errorMessage && (
          <p className="text-xs text-danger">{errorMessage}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input, type InputProps };
