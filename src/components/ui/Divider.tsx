'use client';

import { cn } from '@/lib/cn';

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

function Divider({ orientation = 'horizontal', className }: DividerProps) {
  return (
    <div
      className={cn(
        'shrink-0 bg-default-200',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
        className
      )}
    />
  );
}

export { Divider };
