'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export interface ToastData {
  id: string;
  type: 'success' | 'error';
  message: string;
}

/**
 * How long a toast stays up, given its message.
 *
 * A flat 3000 ms was too short for the messages this app actually produces: the
 * export failures carry a paragraph of guidance ("浏览器拦截了打印窗口…"), and a
 * toast that vanishes mid-sentence is worse than no toast. Reading Chinese aloud
 * runs about 5–6 characters per second, so the budget is derived from the message
 * length — floored at 4 s so short confirmations are still readable, and capped at
 * 12 s so a long message cannot pin itself to the screen (ticket 08).
 */
export function toastDuration(message: string): number {
  const MIN_MS = 4000;
  const MAX_MS = 12000;
  const MS_PER_CHAR = 180;

  return Math.min(MAX_MS, Math.max(MIN_MS, message.length * MS_PER_CHAR));
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, toastDuration(message));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

export function ToastContainer({ toasts, removeToast }: { toasts: ToastData[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            className="pointer-events-auto"
          >
            <div
              className={`flex items-center gap-2.5 px-4 py-3 rounded-[1.5rem] shadow-sm backdrop-blur-md border text-sm font-medium ${
                toast.type === 'success'
                  ? 'bg-success/10 border-success/20 text-success'
                  : 'bg-danger/10 border-danger/20 text-danger'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
