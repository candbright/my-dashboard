// Builds the ADR-0002 CJK test document from the frozen fixture.
//
// Usage:
//   node scripts/build-cjk-fixture.mjs              # write fixture.html next to the fixture
//   node scripts/build-cjk-fixture.mjs --stdout     # print the HTML
//
// The fixture is a real document: modern Chinese resume prose for the human-visible parts,
// plus continuous public-domain classical Chinese that supplies the character diversity the
// ADR requires (>= 2,000 distinct Hanzi). See README.md for provenance and the exact counts.
//
// Deterministic: no randomness, no timestamps, no network. Re-running produces byte-identical
// output, so a rendering change is always attributable to the renderer and not to the input.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives in fixtures/scripts/, so the fixture itself is one level up.
const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '..');

const RESUME = readFileSync(join(fixtureDir, 'cjk-test-document.md'), 'utf8');
const CLASSIC = readFileSync(join(fixtureDir, 'src', 'classic-corpus.txt'), 'utf8');

// The appendix is stored in the fixture under this heading; everything above it is the
// realistic resume.
const APPENDIX_MARKER = '## 附录：用字覆盖语料';

function splitFixture(md) {
  const idx = md.indexOf(APPENDIX_MARKER);
  if (idx === -1) throw new Error(`fixture is missing the appendix heading ${APPENDIX_MARKER}`);
  return { body: md.slice(0, idx), appendix: md.slice(idx) };
}

// Render the markdown to the small HTML subset the engine supports. Deliberately minimal:
// the point of the fixture is text and characters, not layout fidelity.
function toHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let m;
    if ((m = /^###\s+(.*)$/.exec(line))) {
      closeList();
      out.push(`<h3>${esc(m[1])}</h3>`);
    } else if ((m = /^##\s+(.*)$/.exec(line))) {
      closeList();
      out.push(`<h2>${esc(m[1])}</h2>`);
    } else if ((m = /^#\s+(.*)$/.exec(line))) {
      closeList();
      out.push(`<h1>${esc(m[1])}</h1>`);
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${esc(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${esc(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

function build() {
  const { body, appendix } = splitFixture(RESUME);

  // The classical corpus is stored as continuous text; lay it out as paragraphs so it renders
  // as pages of real prose rather than one unbroken block.
  const ideographs = [...CLASSIC].filter((c) => /[\u4E00-\u9FFF]/.test(c)).join('');
  const paras = [];
  const PARA = 300;
  for (let i = 0; i < ideographs.length; i += PARA) paras.push(`<p>${ideographs.slice(i, i + PARA)}</p>`);

  const appendixHeading = appendix.split(/\r?\n/)[0].replace(/^##\s+/, '');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>CJK 渲染回归测试文档</title>
<style>
  @page { size: A4; margin: 18mm; }
  /*
    IMPORTANT (spike finding, ADR-0002): font-family MUST be declared on body.
    The engine treats <body> as a separate layout root, so a declaration on <html> never
    reaches any element — silently, with no warning in warnings[]. The same declaration on
    body behaves correctly.
  */
  body { font-family: "ResumeCJK", sans-serif; font-size: 10.5pt; line-height: 1.6; color: #292524; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 13pt; margin: 14pt 0 6pt; border-bottom: 1px solid #d6d3d1; padding-bottom: 3pt; }
  h3 { font-size: 11pt; margin: 10pt 0 4pt; }
  p { margin: 0 0 6pt; }
  li { margin: 0 0 3pt; }
</style>
</head>
<body>
${toHtml(body)}
<h2>${appendixHeading}</h2>
${paras.join('\n')}
</body>
</html>
`;
}

const html = build();

if (process.argv.includes('--stdout')) {
  process.stdout.write(html);
} else {
  const target = join(fixtureDir, 'fixture.html');
  writeFileSync(target, html, 'utf8');

  const visible = html.replace(/<[^>]+>/g, ' ');
  const hanzi = [...visible].filter((c) => /[\u4E00-\u9FFF]/.test(c));
  const distinct = new Set(hanzi);
  console.log(`wrote ${target}`);
  console.log(`  hanzi total    : ${hanzi.length}`);
  console.log(`  hanzi distinct : ${distinct.size}`);
  console.log(`  html bytes     : ${Buffer.byteLength(html, 'utf8')}`);
}
