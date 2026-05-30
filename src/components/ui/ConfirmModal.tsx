'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

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
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            className="relative z-10 w-full max-w-sm mx-4"
          >
            <div className="bg-content1 border border-default-200 rounded-[2rem] p-6 shadow-lg">
              {/* Icon */}
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold tracking-tight mb-1">
                {title}
              </h3>

              {/* Message */}
              <p className="text-sm text-default-500 mb-6 leading-relaxed">
                {message}
              </p>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="light"
                  size="sm"
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
