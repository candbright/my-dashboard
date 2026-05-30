'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface PageContainerProps {
  title?: string;
  subtitle?: string;
  titleAccent?: string;
  action?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  children: ReactNode;
}

const maxWidthMap = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
};

/**
 * Standard page container with animated entry, optional header, and consistent max-width.
 */
function PageContainer({
  title,
  subtitle,
  titleAccent,
  action,
  maxWidth = 'lg',
  className,
  children,
}: PageContainerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'mx-auto px-6 pt-20 pb-6',
        maxWidthMap[maxWidth],
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-5">
          <div>
            {title && (
              <h1 className="text-2xl font-bold tracking-tight font-serif text-foreground">
                {titleAccent ? (
                  <>
                    {title}
                    <span className="gradient-text">
                      {titleAccent}
                    </span>
                  </>
                ) : (
                  title
                )}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm text-default-500 font-serif mt-1">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </motion.div>
  );
}

export { PageContainer };
