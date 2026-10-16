'use client';

import { useReducedMotion } from 'framer-motion';

/**
 * Whether the user has asked their operating system for less motion.
 *
 * ## Why this exists instead of using framer-motion's `reducedMotion` config
 *
 * The obvious fix is `<MotionConfig reducedMotion="user">` at the root, and it is
 * *almost* right: framer then runs each animation to its end value instantly instead of
 * over `duration`. That is correct for movement, and it is not enough here, because this
 * app's wrappers animate **opacity**:
 *
 *     initial={{ opacity: 0 }} animate={{ opacity: 1 }}
 *
 * With reduced motion on, framer still starts at `opacity: 0` and the transition to `1`
 * has zero duration — so the element appears rather than fades. On the server, however,
 * `initial` is serialised into the HTML as `style="opacity:0"`. A user who prefers reduced
 * motion and has JavaScript disabled therefore gets **permanently invisible text**, which
 * is strictly worse than the animation it was trying to suppress.
 *
 * So the preference has to change the *starting state*, not just the timing: when motion
 * is reduced there is no animation at all, so the element must begin in its final state.
 * That is what `initial={false}` means to framer-motion — render at the target, never
 * animate into it — and it is why every wrapper reads this hook.
 *
 * Returning the raw value from framer-motion (rather than a wrapper type) keeps the
 * `null`-while-undetermined case honest: on the first client render the media query may
 * not have been read yet, and callers treat that as "no preference known", which preserves
 * the existing default of animating.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
