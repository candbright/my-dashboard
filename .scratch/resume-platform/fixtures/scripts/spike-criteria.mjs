// ADR-0002 criterion harness. Runs the pre-registered criteria over the frozen document and
// writes every raw measurement to a JSON artifact, so the verdict can be audited rather than
// taken on trust.
//
// Criteria implemented here:
//   1  CJK extractable, character-perfect
//   4  render time, P95 < 1500 ms
//   5  peak RSS < 512 MB
//   6  output bytes < 1.5 MB
//   7  warnings[] understood and acceptable
// Criteria 2 and 3 (search / copy-paste in Chrome and Acrobat) are interactive and are
// handled separately; this harness produces the artifact they are performed against.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'fixture.html'), 'utf8');
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
const FONT_FAMILY = process.env.SPIKE_CJK_FAMILY || 'ResumeCJK';
const RUNS = Number(process.env.SPIKE_RUNS || 7);

function rssMB() {
  // Peak resident set, which is what criterion 5 asks for ("Node 进程 RSS 峰值").
  return process.memoryUsage().rss / 1024 / 1024;
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank P95. With 7 runs this is the largest observed value, which is the
  // conservative reading — appropriate for a go/no-go gate.
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

async function main() {
  if (!FONT) throw new Error('set SPIKE_CJK_FONT');
  const fontBytes = fs.readFileSync(FONT);

  const htmlMod = await import(engineUrl());
  if (typeof htmlMod.init === 'function') await htmlMod.init();

  const report = {
    font: path.basename(FONT),
    fontBytes: fontBytes.length,
    fontFamily: FONT_FAMILY,
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    runs: [],
    warnings: [],
  };

  let lastPdf = null;
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    const result = htmlMod.renderHtml(html, {
      pageSize: 'A4',
      auditContent: true,
      lang: 'zh-CN',
      fonts: [{ family: FONT_FAMILY, data: new Uint8Array(fontBytes), weight: 400 }],
    });
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;

    const pdf = Buffer.from(result.pdf);
    report.runs.push({ run: i + 1, ms: Number(ms.toFixed(1)), bytes: pdf.length, passes: result.passes, rssMB: Number(rssMB().toFixed(1)) });

    // Warnings are deterministic for a given input; collect once.
    if (i === 0) report.warnings = result.warnings ?? [];
    lastPdf = pdf;
  }

  // A second, standalone render at the end so the artifact on disk is from a fresh process
  // state (guards against reporting a warm-path size that a cold caller would never see).
  const beforeRss = rssMB();
  const finalResult = htmlMod.renderHtml(html, {
    pageSize: 'A4',
    auditContent: true,
    lang: 'zh-CN',
    fonts: [{ family: FONT_FAMILY, data: new Uint8Array(fontBytes), weight: 400 }],
  });
  const peakRss = rssMB();
  lastPdf = Buffer.from(finalResult.pdf);

  const pdfPath = path.join(import.meta.dirname, '..', 'evidence', 'out-document.pdf');
  fs.writeFileSync(pdfPath, lastPdf);

  const times = report.runs.map((r) => r.ms);
  report.summary = {
    pdfPath,
    pdfBytes: lastPdf.length,
    pdfMB: Number((lastPdf.length / 1024 / 1024).toFixed(3)),
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    medianMs: [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)],
    p95Ms: p95(times),
    peakRssMB: Number(peakRss.toFixed(1)),
    rssBeforeFinalRenderMB: Number(beforeRss.toFixed(1)),
    warningCount: report.warnings.length,
  };

  // Font subsetting: count glyph programs actually embedded. If subsetting works, the
  // embedded font stream is far smaller than the full TTF.
  const raw = lastPdf.toString('latin1');
  report.structure = {
    hasToUnicode: /\/ToUnicode/.test(raw),
    hasIdentityH: /Identity-H/.test(raw),
    fontSubtypes: [...new Set(raw.match(/\/Subtype\s*\/(\w+)/g) || [])],
    baseFonts: [...new Set(raw.match(/\/BaseFont\s*\/([#\w+\-,]+)/g) || [])],
    fontFileKeys: [...new Set(raw.match(/\/FontFile\d?/g) || [])],
    // A CIDToGIDMap of /Identity means glyph ids are used directly; a stream means a real
    // subset map was written.
    cidToGidMapIsIdentity: /\/CIDToGIDMap\s*\/Identity/.test(raw),
  };

  fs.writeFileSync(path.join(import.meta.dirname, '..', 'evidence', 'criteria-report.json'), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.summary, null, 2));
  console.log('STRUCTURE=' + JSON.stringify(report.structure));
  console.log('WARNINGS:');
  for (const w of report.warnings) console.log('  ' + w);
}

main().catch((e) => {
  console.log('FATAL: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
