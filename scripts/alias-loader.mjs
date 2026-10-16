/**
 * A Node module resolver for the `@/*` path alias.
 *
 * The verification scripts import the real application modules, and those modules
 * import each other through the project's `@/` alias (which vitest and Next both
 * resolve natively). Node does not. Rather than rewriting application imports into
 * relative paths purely to suit a test script — which would make the source
 * unidiomatic and drift from `AGENTS.md`'s import convention — the alias is resolved
 * here, in the harness that needs it.
 *
 * Usage:
 *   node --import ./scripts/alias-loader.mjs some-script.mjs
 */
import { register } from 'node:module';

register('./alias-resolver.mjs', import.meta.url);
