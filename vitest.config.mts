import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for ResumeVault.
 *
 * Scope: these tests cover PURE logic — parsing, serialising, and PDF text-layer
 * extraction. Frontend tests do not talk to the backend; server behaviour is
 * covered by the Go suite in kratos-server.
 *
 * Path aliases: Vite resolves the `@/*` alias from tsconfig.json natively via
 * `resolve.tsconfigPaths`, so tests import exactly the same specifiers as
 * application code and no plugin is needed.
 *
 * Environment: `node` by default, because the functions this plan needs to
 * protect are pure and a DOM only slows them down. A test that genuinely needs
 * document/window opts in per file with a `// @vitest-environment happy-dom`
 * docblock.
 *
 * No alias is needed for pdf.js's standard fonts: `pdf-assert.ts` resolves that
 * directory at runtime via `import.meta.resolve`.
 *
 * `invariants/` is a second, deliberately separate root. The convention in
 * AGENTS.md is that a test is *colocated* with the file it protects, and that is
 * right for a test of a module. But some rules are properties of the whole tree
 * rather than of any one file — "no cool hues anywhere in `src/`" has no single
 * subject to sit next to. Putting such a test in `src/` would imply it is
 * colocated when it is not, so those live in `invariants/` and say so.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'invariants/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    restoreMocks: true,
    clearMocks: true,
  },
});
