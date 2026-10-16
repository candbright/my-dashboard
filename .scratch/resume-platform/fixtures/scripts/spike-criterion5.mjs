// Final confirmation for criterion 5, and the artifact the remaining criteria run against.
//
// Two things the earlier runs did not establish:
//   1. Does the heap ever come back DOWN across many renders, or does RSS only climb? (A
//      long-lived render service cares about steady state, not just render 1.)
//   2. A clean, single-process measurement over the real ADR document with the criteria
//      recorded together, so the report is one coherent observation rather than several.
//
// No pdfjs here: extraction is a separate script so this process measures only the engine.

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
const RUNS = Number(process.env.SPIKE_RUNS || 12);
const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'fixture.html'), 'utf8');

function mem() {
  const m = process.memoryUsage();
  return { rss: Number((m.rss / 1024 / 1024).toFixed(1)), heap: Number((m.heapUsed / 1024 / 1024).toFixed(1)) };
}

async function main() {
  const htmlMod = await import(engineUrl());
  await htmlMod.init();
  const fontBytes = fs.readFileSync(FONT);
  const fonts = [{ family: 'ResumeCJK', data: new Uint8Array(fontBytes), weight: 400 }];

  const rows = [];
  let peakRss = mem().rss;
  let pdfBytes = 0;
  const times = [];

  for (let i = 1; i <= RUNS; i++) {
    const t0 = process.hrtime.bigint();
    const res = htmlMod.renderHtml(html, { pageSize: 'A4', lang: 'zh-CN', fonts });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    times.push(ms);
    pdfBytes = Buffer.from(res.pdf).length;
    const m = mem();
    if (m.rss > peakRss) peakRss = m.rss;
    rows.push({ run: i, ms: Number(ms.toFixed(0)), rss: m.rss, heap: m.heap, warns: (res.warnings ?? []).length });
  }

  console.log(`font            = ${path.basename(FONT)} (${(fontBytes.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`renders         = ${RUNS}`);
  console.log(`pdf bytes       = ${pdfBytes} (${(pdfBytes / 1024 / 1024).toFixed(3)} MB)`);
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`render ms       = min ${sorted[0].toFixed(0)} / median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} / p95 ${sorted[Math.ceil(0.95 * sorted.length) - 1].toFixed(0)} / max ${sorted[sorted.length - 1].toFixed(0)}`);
  console.log(`PEAK RSS        = ${peakRss} MB   (criterion: < 512 MB)`);
  console.log('');
  console.log('run   ms    rssMB   heapMB  warns');
  for (const r of rows) {
    console.log(String(r.run).padEnd(6) + String(r.ms).padEnd(6) + String(r.rss).padEnd(8) + String(r.heap).padEnd(8) + r.warns);
  }

  // Did RSS ever fall back to the pre-render baseline after the first render?
  const firstRss = rows[0].rss;
  const minAfterFirst = Math.min(...rows.slice(1).map((r) => r.rss));
  console.log('');
  console.log(`rss after render 1      = ${firstRss} MB`);
  console.log(`lowest rss in renders 2+ = ${minAfterFirst} MB`);
  console.log(`verdict                 = ${peakRss < 512 ? 'PASS' : 'FAIL'} (peak ${peakRss} MB vs limit 512 MB)`);

  fs.writeFileSync(
    path.join(import.meta.dirname, '..', 'evidence', 'criterion5-report.json'),
    JSON.stringify({ font: path.basename(FONT), fontBytes: fontBytes.length, pdfBytes, peakRssMB: peakRss, timesMs: times.map((t) => Number(t.toFixed(1))), rows }, null, 2),
  );
}

main().catch((e) => {
  console.log('FATAL ' + e.stack);
  process.exit(1);
});
