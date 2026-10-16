/**
 * Runs the browser template verification (ticket 21).
 *
 * Thin wrapper so `npm run verify:template` works on Windows, where `VAR=1 cmd` is not valid shell
 * syntax. It sets the flag the test checks for and runs that one file.
 *
 * The verification itself lives in two places, split by what each can do:
 *
 *   src/lib/verify-template-browser.test.ts   renders the real `.tsx` component — only vitest's
 *                                             transform can load JSX, Node cannot
 *   scripts/verify-template-browser.mjs       drives Chromium, measures, paginates, prints the PDF
 *
 * Env:
 *   VERIFY_CHROMIUM  path to a Chromium binary, to reuse an existing download
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'src/lib/verify-template-browser.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, VERIFY_TEMPLATE: '1' },
    shell: process.platform === 'win32',
  }
);

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
