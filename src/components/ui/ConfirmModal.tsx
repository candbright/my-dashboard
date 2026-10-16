'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
// The sibling directly, not the barrel: `ui/index.ts` exports this file, so importing the barrel
// here would close a runtime cycle (index → ConfirmModal → index) and let module evaluation order
// decide whether `Button` exists yet.
import { Button } from './Button';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  loading = false,
}: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);

    // Lock background scrolling, exactly as `Modal` does. Without it the page behind a
    // confirmation could still scroll, which on a short viewport moves the dialog's own
    // buttons relative to the pointer mid-click.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop — decorative, and kept out of the accessibility tree. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            // `bg-stone-900/40`, not `bg-black/40` — AGENTS.md bans pure black.
            // `Modal.tsx` already used the warm-stone backdrop; this brings the
            // confirm dialog in line with it (ticket 08).
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            aria-hidden="true"
            inert
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={panelRef}
            /*
             * `ConfirmModal` had no dialog semantics at all before this: no `role`, so a screen
             * reader announced its title and buttons as ordinary page content with no indication
             * that a decision was being requested. `aria-labelledby` points at the visible heading
             * rather than duplicating the string in `aria-label`.
             */
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-message"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            className="relative z-10 w-full max-w-sm mx-4"
          >
            <div className="bg-content1 border border-default-200 rounded-[2rem] p-6 shadow-sm">
              {/* Icon */}
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>

              {/* Title */}
              <h3 id="confirm-modal-title" className="text-lg font-semibold tracking-tight mb-1">
                {title}
              </h3>

              {/* Message */}
              <p id="confirm-modal-message" className="text-sm text-default-500 mb-6 leading-relaxed">
                {message}
              </p>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="light"
                  size="sm"
                  // Focus lands here on open, not on the confirm button: a destructive
                  // confirmation must not be one stray Enter away from firing.
                  data-autofocus
                  onClick={onClose}
                  isDisabled={loading}
                >
                  {cancelLabel}
                </Button>
                <Button
                  color={danger ? 'danger' : 'primary'}
                  size="sm"
                  onClick={onConfirm}
                  isLoading={loading}
                >
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
