'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ChipColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
type ChipVariant = 'solid' | 'bordered' | 'flat' | 'dot';
type ChipSize = 'sm' | 'md' | 'lg';

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  color?: ChipColor;
  variant?: ChipVariant;
  size?: ChipSize;
  startContent?: ReactNode;
  endContent?: ReactNode;
}

const colorSolid: Record<ChipColor, string> = {
  default: 'bg-default-100 text-default-600',
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-danger text-danger-foreground',
};

const colorFlat: Record<ChipColor, string> = {
  default: 'bg-default-100 text-default-600',
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

const colorBordered: Record<ChipColor, string> = {
  default: 'border border-default-300 text-default-600',
  primary: 'border border-primary text-primary',
  secondary: 'border border-secondary text-secondary',
  success: 'border border-success text-success',
  warning: 'border border-warning text-warning',
  danger: 'border border-danger text-danger',
};

const dotColor: Record<ChipColor, string> = {
  default: 'bg-default-400',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const sizeMap: Record<ChipSize, string> = {
  sm: 'h-5 text-[10px] px-1.5 gap-1',
  md: 'h-6 text-xs px-2 gap-1.5',
  lg: 'h-7 text-sm px-2.5 gap-1.5',
};

function Chip({
  className,
  color = 'default',
  variant = 'flat',
  size = 'md',
  startContent,
  endContent,
  children,
  ...props
}: ChipProps) {
  const variantClass =
    variant === 'solid'
      ? colorSolid[color]
      : variant === 'bordered'
      ? colorBordered[color]
      : variant === 'dot'
      ? colorFlat[color]
      : colorFlat[color];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full whitespace-nowrap',
        sizeMap[size],
        variantClass,
        className
      )}
      {...props}
    >
      {variant === 'dot' && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[color])} />
      )}
      {startContent}
      {children}
      {endContent}
    </span>
  );
}

export { Chip, type ChipProps };
