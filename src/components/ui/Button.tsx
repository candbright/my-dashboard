'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'solid' | 'bordered' | 'flat' | 'ghost' | 'light';
type ButtonColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonRadius = 'sm' | 'md' | 'lg' | 'full' | 'none';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  radius?: ButtonRadius;
  isLoading?: boolean;
  isIconOnly?: boolean;
  isDisabled?: boolean;
  startContent?: ReactNode;
  endContent?: ReactNode;
  fullWidth?: boolean;
}

const colorMap: Record<ButtonColor, Record<ButtonVariant, string>> = {
  default: {
    solid: 'bg-default-100 text-foreground hover:bg-default-200',
    bordered: 'border-2 border-default-300 text-foreground hover:bg-default-100',
    flat: 'bg-default-100/50 text-foreground hover:bg-default-100',
    ghost: 'border-2 border-default-300 text-foreground hover:bg-default-100',
    light: 'text-foreground hover:bg-default-100',
  },
  primary: {
    solid: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25',
    bordered: 'border-2 border-primary text-primary hover:bg-primary/10',
    flat: 'bg-primary/10 text-primary hover:bg-primary/20',
    ghost: 'border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground',
    light: 'text-primary hover:bg-primary/10',
  },
  secondary: {
    solid: 'bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/25',
    bordered: 'border-2 border-secondary text-secondary hover:bg-secondary/10',
    flat: 'bg-secondary/10 text-secondary hover:bg-secondary/20',
    ghost: 'border-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground',
    light: 'text-secondary hover:bg-secondary/10',
  },
  success: {
    solid: 'bg-success text-success-foreground hover:bg-success/90 shadow-lg shadow-success/25',
    bordered: 'border-2 border-success text-success hover:bg-success/10',
    flat: 'bg-success/10 text-success hover:bg-success/20',
    ghost: 'border-2 border-success text-success hover:bg-success hover:text-success-foreground',
    light: 'text-success hover:bg-success/10',
  },
  warning: {
    solid: 'bg-warning text-warning-foreground hover:bg-warning/90 shadow-lg shadow-warning/25',
    bordered: 'border-2 border-warning text-warning hover:bg-warning/10',
    flat: 'bg-warning/10 text-warning hover:bg-warning/20',
    ghost: 'border-2 border-warning text-warning hover:bg-warning hover:text-warning-foreground',
    light: 'text-warning hover:bg-warning/10',
  },
  danger: {
    solid: 'bg-danger text-danger-foreground hover:bg-danger/90 shadow-lg shadow-danger/25',
    bordered: 'border-2 border-danger text-danger hover:bg-danger/10',
    flat: 'bg-danger/10 text-danger hover:bg-danger/20',
    ghost: 'border-2 border-danger text-danger hover:bg-danger hover:text-danger-foreground',
    light: 'text-danger hover:bg-danger/10',
  },
};

const sizeMap: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

const iconSizeMap: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

const radiusMap: Record<ButtonRadius, string> = {
  none: 'rounded-none',
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'solid',
      color = 'default',
      size = 'md',
      radius = 'md',
      isLoading = false,
      isIconOnly = false,
      isDisabled: isDisabledProp,
      startContent,
      endContent,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isDisabledProp || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'active:scale-[0.97]',
          'disabled:opacity-50 disabled:pointer-events-none',
          colorMap[color][variant],
          isIconOnly ? iconSizeMap[size] : sizeMap[size],
          radiusMap[radius],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isLoading && startContent}
        {children}
        {!isLoading && endContent}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
