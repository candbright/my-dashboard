'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Reusable countdown hook for verification code cooldowns.
 * Returns [seconds, startCountdown] where seconds is 0 when idle.
 */
export function useCountdown(duration: number = 60): [number, () => void] {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setSeconds(duration);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [duration]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return [seconds, start];
}
