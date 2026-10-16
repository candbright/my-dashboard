/**
 * First focusable control on every page. Lets a keyboard user skip the sticky
 * navbar and land on `<main id="main-content">` (WCAG 2.4.1 Bypass Blocks).
 *
 * Off-screen until focused, so pointer users never see it. `rounded-full` and
 * `duration-500` match the rest of the chrome; the copy is Chinese because
 * every other user-facing string is.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="absolute left-4 top-0 z-[100] -translate-y-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform duration-500 ease-in-out focus:translate-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      跳到主要内容
    </a>
  );
}
