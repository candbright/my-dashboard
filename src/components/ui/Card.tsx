'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'bordered' | 'shadow' | 'flat';
  isHoverable?: boolean;
  isPressable?: boolean;
  isBlurred?: boolean;
  fullWidth?: boolean;
}

function Card({
  className,
  variant = 'bordered',
  isHoverable = false,
  isPressable = false,
  isBlurred = false,
  fullWidth = false,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[2rem] transition-all duration-500',
        variant === 'bordered' && 'bg-content1 border border-stone-200',
        variant === 'shadow' && 'bg-content1 shadow-sm',
        variant === 'flat' && 'bg-content2',
        isBlurred && 'backdrop-blur-xl bg-content1/70',
        isHoverable && 'hover:shadow-sm hover:bg-content2',
        isPressable && 'cursor-pointer active:scale-[0.99]',
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pt-5 pb-0 flex flex-col gap-1', className)} {...props}>
      {children}
    </div>
  );
}

function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pb-5 pt-0 flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardBody, CardFooter };
