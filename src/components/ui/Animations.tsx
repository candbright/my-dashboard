'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * The four wrappers below are the app's whole entry-animation layer, which is why
 * `prefers-reduced-motion` is honoured here rather than at 202 individual call sites.
 *
 * A note on the shape of the fix, because it is not the obvious one. Passing
 * `initial={false}` when motion is reduced makes the wrapper render **in its final state on
 * the server**, so nothing is hidden. Merely shortening the duration would not: `opacity`
 * would still begin at `0` in the serialised HTML and, with no JavaScript to run the
 * transition, the content would stay invisible forever. `usePrefersReducedMotion`'s doc
 * comment records the full reasoning.
 */

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  className?: string;
}

export function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  duration = 0.5,
  className = '',
}: FadeInProps) {
  const reduced = usePrefersReducedMotion();

  const directionMap = {
    up: { y: 24, x: 0 },
    down: { y: -24, x: 0 },
    left: { y: 0, x: 24 },
    right: { y: 0, x: -24 },
    none: { y: 0, x: 0 },
  };

  const { x, y } = directionMap[direction];

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x, y }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      className={className}
      data-motion-reveal=""
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  className = '',
  staggerDelay = 0.1,
}: StaggerContainerProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : 'hidden'}
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
      data-motion-reveal=""
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  // `StaggerItem` deliberately renders no `initial` and no inline style of its own — it
  // inherits both from the parent `StaggerContainer`, so on its own it is already visible.
  // It still needs the variant targets adjusted for reduced motion, or the parent's
  // instant transition would leave children at `opacity: 0` with nothing to animate them.
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      variants={
        reduced
          ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
          : {
              hidden: { opacity: 0, y: 20 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] },
              },
            }
      }
      className={className}
      data-motion-reveal=""
    >
      {children}
    </motion.div>
  );
}

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
}

export function ScrollReveal({ children, className = '' }: ScrollRevealProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
      data-motion-reveal=""
    >
      {children}
    </motion.div>
  );
}
