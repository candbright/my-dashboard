/**
 * Maps the project's `@/` alias onto the filesystem, for Node scripts.
 *
 * Next and vitest both resolve `@/*` from `tsconfig.json`'s `paths`. Node does not
 * read tsconfig, so the mapping is repeated here — deliberately hard-coded rather
 * than parsed, because if the alias ever changes, a loud failure in a verification
 * script is better than a clever resolver that silently agrees with itself.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');

/** Extensions to try, in order, when the specifier has none. */
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@' || specifier.startsWith('@/')) {
    const subpath = specifier === '@' ? '' : specifier.slice(2);
    const base = path.join(sourceRoot, subpath);

    for (const extension of EXTENSIONS) {
      const candidate = base + extension;
      try {
        // `nextResolve` on a file URL lets Node decide the format, so a `.ts` file is
        // still loaded through the TypeScript type-stripping path.
        return await nextResolve(pathToFileURL(candidate).href, context);
      } catch {
        // Try the next extension.
      }
    }

    throw new Error(`Could not resolve "${specifier}" under ${sourceRoot}`);
  }

  return nextResolve(specifier, context);
}
