// Narrow the boundary: is the root <html> element the problem, or is it that a declaration on
// an ANCESTOR of <body> does not inherit? Those are different bugs with different severity.
//
// Also checks the actionable question for this project: does our own print stylesheet put
// font-family on <html>? If so, that is the exact configuration this defect breaks.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The isolated @formepdf install lives outside the repo (the repo must not depend on it).
// Point SPIKE_ENGINE_DIR at that install's node_modules; default is a sibling spike dir.
function engineUrl(pkg) {
  const dir = process.env.SPIKE_ENGINE_DIR;
  if (!dir) {
    throw new Error('set SPIKE_ENGINE_DIR to the node_modules dir holding @formepdf/*');
  }
  // Resolve the entry from the package's own `main`: the packages do not share a layout
  // (@formepdf/html is ./index.js while the others are ./dist/index.js).
  const pkgDir = path.join(dir, '@formepdf', pkg || 'html');
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const main = (manifest.main || 'index.js').replace(/^\.\//, '');
  return pathToFileURL(path.join(pkgDir, main)).href;
}
const FONT = process.env.SPIKE_CJK_FONT;
const fontBytes = fs.readFileSync(FONT);
const CJK = '张三';

const cases = {
  'on html': `<html><head><style>html{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`,
  'on body': `<html><head><style>body{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`,
  'on div wrapper': `<html><head><style>div{font-family:"ResumeCJK"}</style></head><body><div><p>${CJK}</p></div></body></html>`,
  'on html>body': `<html><head><style>html > body{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`,
  'on :root': `<html><head><style>:root{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`,
  'on p directly': `<html><head><style>p{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`,
  'class on body': `<html><head><style>.r{font-family:"ResumeCJK"}</style></head><body class="r"><p>${CJK}</p></body></html>`,
  'inline on p': `<html><body><p style="font-family:'ResumeCJK'">${CJK}</p></body></html>`,
};

async function main() {
  const htmlMod = await import(engineUrl());
  await htmlMod.init();

  for (const [name, html] of Object.entries(cases)) {
    const res = htmlMod.renderHtml(html, {
      fonts: [{ family: 'ResumeCJK', data: new Uint8Array(fontBytes), weight: 400 }],
    });
    const raw = Buffer.from(res.pdf).toString('latin1');
    const subset = /Identity-H/.test(raw);
    const w = (res.warnings ?? []).length;
    console.log(`${name.padEnd(18)} subset=${String(subset).padEnd(5)} warnings=${w}`);
  }

  // Does the project's own print view rely on <html>-level font-family?
  // Resolved from this script's location (fixtures/scripts/ -> repo root is three levels up),
  // so the check works from any checkout rather than one absolute path.
  console.log('\n--- project print stylesheet: where is font-family declared? ---');
  const repoRoot = path.join(import.meta.dirname, '..', '..', '..', '..');
  const roots = [
    'src/lib/print-resume.ts',
    'src/components/ResumePrintView.tsx',
    'src/app/globals.css',
  ].map((rel) => path.join(repoRoot, rel));
  for (const f of roots) {
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/font-family/.test(l)) console.log(`  ${path.basename(f)}:${i + 1}: ${l.trim()}`);
    });
  }
}

main().catch((e) => {
  console.log('FATAL ' + e.stack);
  process.exit(1);
});
