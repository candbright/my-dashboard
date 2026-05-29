'use client';

import { cn } from '@/lib/cn';

type SpinnerSize = 'sm' | 'md' | 'lg';
type SpinnerColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'current';

interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  label?: string;
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

const colorMap: Record<SpinnerColor, string> = {
  default: 'border-default-400',
  primary: 'border-primary',
  secondary: 'border-secondary',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
  current: 'border-current',
};

function Spinner({ size = 'md', color = 'primary', label, className }: SpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-2 border-t-transparent',
          sizeMap[size],
          colorMap[color]
        )}
      />
      {label && <span className="text-sm text-default-500">{label}</span>}
    </div>
  );
}

export { Spinner };
