// Clean-harness baselines, no pdfjs loaded. Establishes the floor an ordinary resume would
// see, so the verdict distinguishes "this engine is heavy" from "this engine is heavy ONLY on
// pathological glyph counts".
//
// Variants:
//   tiny     - a handful of CJK lines (an ordinary resume page)
//   resume   - the realistic scaffolding only, without the classical diversity appendix
//   full     - the ADR-0002 document (2,256 distinct Hanzi)

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
const VARIANT = process.env.SPIKE_VARIANT || 'tiny';

function mem() {
  const m = process.memoryUsage();
  return { rss: Number((m.rss / 1024 / 1024).toFixed(1)), heap: Number((m.heapUsed / 1024 / 1024).toFixed(1)) };
}

function build(variant) {
  const style = `<style>@page{size:A4;margin:18mm}body{font-family:"ResumeCJK",sans-serif;font-size:10.5pt;line-height:1.6}</style>`;
  if (variant === 'tiny') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>
      <h1>陈嘉禾</h1><p>高级后端工程师，五年工作经验。</p><p>技能：Go、PostgreSQL、Kubernetes</p>
      <p>2022.03 - 2024.06</p></body></html>`;
  }
  if (variant === 'resume') {
    // The full document minus the classical appendix: a realistic multi-page resume.
    const full = fs.readFileSync(path.join(import.meta.dirname, '..', 'fixture.html'), 'utf8');
    return full.replace(/<section class="diversity">[\s\S]*?<\/section>/, '');
  }
  return fs.readFileSync(path.join(import.meta.dirname, '..', 'fixture.html'), 'utf8');
}

async function main() {
  const htmlMod = await import(engineUrl());
  await htmlMod.init();
  const fontBytes = fs.readFileSync(FONT);
  const fonts = [{ family: 'ResumeCJK', data: new Uint8Array(fontBytes), weight: 400 }];
  const html = build(VARIANT);

  const hanzi = [...html].filter((c) => /[\u4E00-\u9FFF]/.test(c));
  const distinct = new Set(hanzi).size;

  console.log(`\n=== variant=${VARIANT}  htmlBytes=${Buffer.byteLength(html)}  hanzi=${hanzi.length}  distinct=${distinct} ===`);
  console.log(`  baseline            rss=${String(mem().rss).padStart(7)} MB  heap=${String(mem().heap).padStart(7)} MB`);

  let peak = mem().rss;
  for (let i = 1; i <= 5; i++) {
    const t0 = process.hrtime.bigint();
    const res = htmlMod.renderHtml(html, { pageSize: 'A4', fonts });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const m = mem();
    if (m.rss > peak) peak = m.rss;
    console.log(
      `  render ${i}`.padEnd(22) +
        `rss=${String(m.rss).padStart(7)} MB  heap=${String(m.heap).padStart(7)} MB  ${ms.toFixed(0).padStart(5)} ms  pdf=${String(Math.round(Buffer.from(res.pdf).length / 1024)).padStart(4)} KB  warns=${(res.warnings ?? []).length}`,
    );
  }
  console.log(`  PEAK RSS = ${peak} MB`);
}

main().catch((e) => {
  console.log('FATAL ' + e.stack);
  process.exit(1);
});
