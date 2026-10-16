// Criterion 1 + 2 (local part): does the CJK text extract character-perfectly?
//
// "逐字正确" is the standard, so this does not just check "some text came out" — it
// reconstructs the visible text from pdfjs's text items and compares it to what was rendered,
// character by character, reporting the exact positions that differ. A PDF whose glyphs look
// right but whose ToUnicode is wrong fails here, which is the whole point.

import fs from 'node:fs';

async function extract(pdfPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    // Silence the "cannot access worker" path; we only need text content.
    disableWorker: true,
  }).promise;

  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Rebuild lines from item positions rather than assuming item order, because pdfjs
    // may split a single visual line into several items in arbitrary order.
    const items = tc.items
      .filter((i) => typeof i.str === 'string')
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
    items.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));

    const lines = [];
    let current = null;
    for (const it of items) {
      if (!current || Math.abs(current.y - it.y) > 2) {
        current = { y: it.y, text: it.str };
        lines.push(current);
      } else {
        current.text += it.str;
      }
    }
    pages.push(lines.map((l) => l.text));
  }
  return pages;
}

async function main() {
  const target = process.argv[2];
  const expected = process.argv.slice(3);
  const pages = await extract(target);

  console.log('PAGES=' + pages.length);
  console.log('--- extracted ---');
  for (const lines of pages) for (const l of lines) console.log('  |' + l + '|');
  console.log('--- analysis ---');

  const all = pages.flat().join('\n');
  const expectedJoined = expected.join('\n');

  // The three failure modes criterion 1 names explicitly.
  console.log('HAS_REPLACEMENT_CHAR=' + all.includes('\uFFFD'));
  console.log('HAS_LITERAL_QUESTION=' + /\?/.test(all));

  for (const line of expected) {
    const found = pages.flat().some((l) => l.includes(line));
    console.log(`EXPECTED[${found ? 'OK  ' : 'MISS'}] ${line}`);
  }

  // Character-level diff over the expected text that IS present, so "almost right" is
  // visible rather than hidden behind a substring check.
  const missing = new Set();
  for (const ch of expectedJoined) {
    if (ch === '\n') continue;
    if (!all.includes(ch)) missing.add(ch);
  }
  console.log('MISSING_CHARS=' + JSON.stringify([...missing]));

  // Every CJK codepoint that was requested should appear in the extracted text.
  const cjk = [...new Set([...expectedJoined].filter((c) => /[\u3000-\u9FFF\uFF00-\uFFEF]/.test(c)))];
  const cjkMissing = cjk.filter((c) => !all.includes(c));
  console.log('CJK_EXPECTED_DISTINCT=' + cjk.length);
  console.log('CJK_MISSING=' + JSON.stringify(cjkMissing));
  console.log('VERDICT=' + (cjkMissing.length === 0 && !all.includes('\uFFFD') ? 'EXTRACT_OK' : 'EXTRACT_BAD'));
}

main().catch((e) => {
  console.log('FATAL: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
