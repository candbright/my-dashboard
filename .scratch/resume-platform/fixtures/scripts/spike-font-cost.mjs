// The tiny-document result (342 bytes, 17 Hanzi, 579 MB) says the cost is per-RENDER, not per
// glyph. The remaining question is whether it is the CJK FONT specifically — a large TTF with
// a big cmap/glyf table — or the renderer's baseline.
//
// Predictions:
//   - if a small Latin font costs ~nothing, the cost is parsing/subsetting the large CJK TTF
//   - if a small Latin font ALSO costs hundreds of MB, it is the renderer, and fonts are
//     incidental
//
// This decides whether "use a smaller CJK font" is a viable mitigation.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VARIANT = process.env.SPIKE_FONT_VARIANT;

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
const FONTS = {
  cjk_simhei: { path: process.env.WINDIR + '\\Fonts\\simhei.ttf', family: 'X' },
  latin_arial: { path: process.env.WINDIR + '\\Fonts\\arial.ttf', family: 'X' },
  none: null,
};

function mem() {
  const m = process.memoryUsage();
  return { rss: Number((m.rss / 1024 / 1024).toFixed(1)), heap: Number((m.heapUsed / 1024 / 1024).toFixed(1)) };
}

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:18mm}
  body{font-family:"X",sans-serif;font-size:10.5pt}
</style></head><body><p>张三 高级后端工程师 Hello World 2022.03 - 2024.06</p></body></html>`;

async function main() {
  const htmlMod = await import(engineUrl());
  await htmlMod.init();

  const spec = FONTS[VARIANT];
  let fonts;
  let fontNote = 'no font registered';
  if (spec) {
    const bytes = fs.readFileSync(spec.path);
    fonts = [{ family: spec.family, data: new Uint8Array(bytes), weight: 400 }];
    fontNote = `${path.basename(spec.path)} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`;
  }

  console.log(`\n=== font=${VARIANT} ${fontNote} ===`);
  console.log(`  baseline   rss=${String(mem().rss).padStart(7)} MB  heap=${String(mem().heap).padStart(7)} MB`);

  let peak = mem().rss;
  for (let i = 1; i <= 3; i++) {
    const res = htmlMod.renderHtml(HTML, { pageSize: 'A4', ...(fonts ? { fonts } : {}) });
    const m = mem();
    if (m.rss > peak) peak = m.rss;
    console.log(
      `  render ${i}`.padEnd(13) +
        `rss=${String(m.rss).padStart(7)} MB  heap=${String(m.heap).padStart(7)} MB  pdf=${Math.round(Buffer.from(res.pdf).length / 1024)} KB  warns=${(res.warnings ?? []).length}`,
    );
  }
  console.log(`  PEAK RSS = ${peak} MB`);
}

main().catch((e) => {
  console.log('FATAL ' + e.stack);
  process.exit(1);
});
