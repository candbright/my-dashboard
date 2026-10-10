'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  /** Action row, rendered at the bottom right. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Prevent closing by backdrop click or Escape. Used while a submit is in
   * flight, so a stray click cannot discard the work in progress.
   */
  isDismissable?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

/**
 * Modal — a surface that hosts arbitrary content.
 *
 * `ConfirmModal` already existed, but its `message` is a plain string, so it
 * cannot carry a form. Rather than widening that component until "confirm" and
 * "edit" are the same thing, this one takes children and leaves confirmation to
 * callers that want it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  isDismissable = true,
  className,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDismissable) onClose();
    },
    [onClose, isDismissable]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);

    // Lock background scrolling while the modal is up, and restore whatever the
    // page had before rather than assuming it was `visible`.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            onClick={() => isDismissable && onClose()}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className={cn(
              'relative z-10 my-auto w-full',
              sizeMap[size],
              className
            )}
          >
            <div className="rounded-[2rem] border border-default-200 bg-content1 shadow-sm">
              {(title || description) && (
                <div className="flex items-start justify-between gap-4 border-b border-default-200 px-6 py-5">
                  <div className="min-w-0">
                    {title && (
                      <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">
                        {title}
                      </h3>
                    )}
                    {description && (
                      <p className="mt-1 text-sm leading-relaxed text-default-500">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭"
                    className="shrink-0 rounded-full p-2 text-default-500 transition-colors duration-500 ease-in-out hover:bg-default-100 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="px-6 py-5">{children}</div>

              {footer && (
                <div className="flex flex-wrap justify-end gap-3 border-t border-default-200 px-6 py-4">
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
