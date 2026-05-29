'use client';

import { cn } from '@/lib/cn';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isBordered?: boolean;
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-28 h-28 text-2xl',
};

const borderColorMap = {
  default: 'ring-default-300',
  primary: 'ring-primary',
  secondary: 'ring-secondary',
  success: 'ring-success',
  warning: 'ring-warning',
  danger: 'ring-danger',
};

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({
  src,
  name,
  size = 'md',
  isBordered = false,
  color = 'default',
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full overflow-hidden',
        'bg-default-200 text-default-600 font-medium',
        sizeMap[size],
        isBordered && `ring-2 ring-offset-2 ring-offset-background ${borderColorMap[color]}`,
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}

export { Avatar };
