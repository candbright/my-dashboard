// The previous memory numbers are suspect: several harness scripts imported pdfjs-dist, and
// pdfjs is itself a large module. If the harness is the cost, then "peak RSS 1104 MB" says
// nothing about the renderer and criterion 5 would be judged wrongly.
//
// This measures with NOTHING loaded but the engine, and separates:
//   A. bare node                       — floor
//   B. node + pdfjs-dist               — cost of the measuring tool
//   C. node + @formepdf/html (no pdfjs) — cost of the engine, measured honestly

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
const MODE = process.env.SPIKE_MODE;

function mem() {
  const m = process.memoryUsage();
  return { rss: Number((m.rss / 1024 / 1024).toFixed(1)), heap: Number((m.heapUsed / 1024 / 1024).toFixed(1)) };
}
function show(label) {
  const m = mem();
  console.log(`  ${label.padEnd(34)} rss=${String(m.rss).padStart(7)} MB  heap=${String(m.heap).padStart(7)} MB`);
}

async function main() {
  show('bare process');

  if (MODE === 'bare') return;

  if (MODE === 'pdfjs') {
    await import('pdfjs-dist/legacy/build/pdf.mjs');
    show('after pdfjs-dist import');
    return;
  }

  // MODE === 'engine'
  const htmlMod = await import(engineUrl());
  show('after require @formepdf/html');

  await htmlMod.init();
  show('after init()');

  const fontBytes = fs.readFileSync(FONT);
  const fonts = [{ family: 'ResumeCJK', data: new Uint8Array(fontBytes), weight: 400 }];
  show(`after reading font (${(fontBytes.length / 1024 / 1024).toFixed(1)} MB)`);

  const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'fixture.html'), 'utf8');

  let peak = mem().rss;
  for (let i = 1; i <= 5; i++) {
    const res = htmlMod.renderHtml(html, { pageSize: 'A4', fonts });
    const m = mem();
    if (m.rss > peak) peak = m.rss;
    console.log(
      `  render ${i}`.padEnd(36) +
        `rss=${String(m.rss).padStart(7)} MB  heap=${String(m.heap).padStart(7)} MB  pdf=${Math.round(Buffer.from(res.pdf).length / 1024)} KB  warns=${(res.warnings ?? []).length}`,
    );
  }
  console.log(`  ${'PEAK RSS (engine only)'.padEnd(34)} ${peak} MB`);
}

main().catch((e) => {
  console.log('FATAL ' + e.stack);
  process.exit(1);
});
