import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A leading underscore is the convention for "this parameter is part of the signature
    // and is deliberately unused" — e.g. `handleSaveMetadata(patch, _signal)`, which accepts
    // an `AbortSignal` to honour the panel's contract while `apiFetch` does not yet thread
    // one through. `no-unused-vars` has no inline way to mark an argument as intentional, and
    // deleting the parameter would break the contract, so without this the only options are a
    // warning on every run or a suppression comment at each site.
    //
    // Scoped to `args` **only**. An unused variable, import, or catch binding is still
    // reported, because those are always removable and a genuinely dead binding is worth
    // knowing about — which is how the now-unused `FormField` and `serializeFrontmatter`
    // were caught while finishing ticket 15.
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local scratch: session-only notes, probes and one-off scripts belonging to the active
    // feature under `.scratch/<feature-slug>/`. These are deliberately not part of the product.
    //
    // The reason to exclude them is that the lint count is used as a **gate**: the documented
    // baseline is "24 problems (14 errors, 10 warnings)", and a gate number only means something
    // if unrelated files cannot move it. A throwaway browser probe here raised an
    // `Unused eslint-disable directive` warning and pushed the count to 25, which reads exactly
    // like a product regression when nothing in the product changed.
    ".scratch/**",
  ]),
]);

export default eslintConfig;
