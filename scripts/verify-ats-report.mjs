#!/usr/bin/env node
/**
 * Verifies the ATS readability report (ticket 07, ADR-0005) against real PDF bytes.
 *
 * Why a separate script rather than only unit tests: the acceptance criteria are
 * about what the report says about an **actual produced file**, and the interesting
 * failure mode is a real bitmap PDF being misclassified as readable. Unit tests can
 * assert the rules; only real bytes can prove the extraction feeds them correctly.
 *
 * Exit code is the gate: non-zero means a criterion failed.
 *
 *   npm run verify:ats
 */

import { analysePdfBytes } from '../src/lib/ats-analyse.ts';
import { buildCjkPdf, buildImageOnlyPdf, buildTextPdf } from '../src/lib/pdf-fixtures.ts';
import { reportFromStructuredContent } from '../src/lib/ats-report.ts';

const results = [];

function check(description, condition, detail = '') {
  results.push({ description, passed: Boolean(condition), detail });
  const mark = condition ? '✓' : '✗';
  console.log(`  ${mark} ${description}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

/** Field names that would make this report a score rather than a fact list. */
const FORBIDDEN_FIELDS = [
  'score',
  'grade',
  'rating',
  'percentage',
  'overall',
  'points',
  'penalty',
  'deduction',
];

async function main() {
  console.log('\nVerifying ATS readability report (ADR-0005: facts only, no score)\n');

  // ── Case 1: a PDF with a text layer ──
  section('case 1 — PDF with a text layer (Latin)');
  {
    const latin = await analysePdfBytes(buildTextPdf(), 'latin.pdf');
    const { report } = latin;

    console.log(`     charCount        ${report.extracted.charCount}`);
    console.log(`     cjkCharCount     ${report.extracted.cjkCharCount}`);
    console.log(`     replacementCount ${report.extracted.replacementCount}`);
    console.log(`     pageCount        ${report.extracted.pageCount}`);
    console.log(`     readable         ${report.readable}`);
    console.log(`     findings         ${report.findings.map((f) => f.rule).join(', ') || '(none)'}`);

    check('a text-layer PDF reports as readable', report.readable === true);
    check('a text-layer PDF yields a non-zero character count', report.extracted.charCount > 0);
    check(
      'a text-layer PDF reports no missing-text-layer finding',
      !report.findings.some((f) => f.rule === 'text-layer-missing')
    );
    check('the report is labelled as coming from a real file', report.source === 'pdf');
  }

  // ── Case 2: a PDF with a CJK text layer, via /ToUnicode ──
  section('case 2 — PDF with a CJK text layer (Chinese)');
  {
    // 张三 后端工程师 — the acceptance case: CJK must be counted correctly.
    const codePoints = [0x5f20, 0x4e09, 0x540e, 0x7aef, 0x5de5, 0x7a0b, 0x5e08];
    const { report } = await analysePdfBytes(buildCjkPdf(codePoints), 'cjk.pdf');

    console.log(`     charCount        ${report.extracted.charCount}`);
    console.log(`     cjkCharCount     ${report.extracted.cjkCharCount}`);
    console.log(`     text             ${JSON.stringify(report.extracted.text)}`);
    console.log(`     readable         ${report.readable}`);

    check(
      'a CJK text layer reports the correct Chinese character count',
      report.extracted.cjkCharCount === codePoints.length,
      `${report.extracted.cjkCharCount} of ${codePoints.length}`
    );
    check('the extracted text contains the actual Chinese', report.extracted.text.includes('张三'));
    check('the extracted text contains 工程师', report.extracted.text.includes('工程师'));
    check('CJK extraction reports no replacement characters', report.extracted.replacementCount === 0);
    check('a CJK text-layer PDF reports as readable', report.readable === true);
  }

  // ── Case 3: the bitmap pipeline's output — the acceptance case that matters ──
  section('case 3 — bitmap-only PDF (the old pipeline)');
  {
    const { report } = await analysePdfBytes(buildImageOnlyPdf(), 'bitmap.pdf');

    console.log(`     charCount        ${report.extracted.charCount}`);
    console.log(`     pageCount        ${report.extracted.pageCount}`);
    console.log(`     readable         ${report.readable}`);
    console.log(`     findings         ${report.findings.map((f) => f.rule).join(', ')}`);
    if (report.findings[0]) console.log(`     evidence         ${report.findings[0].evidence}`);

    check('a bitmap-only PDF reports as NOT readable', report.readable === false);
    check(
      'a bitmap-only PDF is reported as having no text layer',
      report.findings.some((f) => f.rule === 'text-layer-missing')
    );
    check(
      'the missing text layer is a blocker, not a warning',
      report.findings.some((f) => f.rule === 'text-layer-missing' && f.severity === 'blocker')
    );
    check(
      'the report still states how many pages were walked',
      report.extracted.pageCount >= 1,
      `${report.extracted.pageCount} page(s)`
    );
    check(
      'the finding carries checkable evidence',
      /0\b/.test(report.findings[0]?.evidence ?? ''),
      JSON.stringify(report.findings[0]?.evidence ?? '')
    );
  }

  // ── Case 4: severity ordering ──
  section('case 4 — findings are ordered by severity');
  {
    const { report } = await analysePdfBytes(buildCjkPdf([0x5f20, 0x4e09, 0xfffd]), 'loss.pdf');
    const severities = report.findings.map((f) => f.severity);
    const order = { blocker: 0, warning: 1, info: 2 };
    const sorted = severities.every(
      (value, index) => index === 0 || order[severities[index - 1]] <= order[value]
    );

    console.log(`     findings         ${report.findings.map((f) => `${f.rule}:${f.severity}`).join(', ')}`);

    check('findings come back sorted blocker → warning → info', sorted, severities.join(' → '));
    check(
      'a document containing U+FFFD is reported as not readable',
      report.readable === false
    );
    check(
      'a document containing U+FFFD reports glyph loss',
      report.findings.some((f) => f.rule === 'glyph-loss')
    );
  }

  // ── Case 5: ADR-0005's hard boundary — no score anywhere ──
  section('case 5 — ADR-0005 boundary: the report contains no score');
  {
    const reports = [
      (await analysePdfBytes(buildTextPdf(), 'a.pdf')).report,
      (await analysePdfBytes(buildImageOnlyPdf(), 'b.pdf')).report,
      reportFromStructuredContent({ frontmatter: { name: '张三' }, sections: [] }),
    ];

    for (const report of reports) {
      const reportFields = Object.keys(report);
      const extractedFields = Object.keys(report.extracted);
      const findingFields = report.findings.length ? Object.keys(report.findings[0]) : [];

      const offenders = [
        ...reportFields.filter((f) => FORBIDDEN_FIELDS.includes(f)),
        ...extractedFields.filter((f) => FORBIDDEN_FIELDS.includes(f)),
        ...findingFields.filter((f) => FORBIDDEN_FIELDS.includes(f)),
      ];

      check(
        `no score-like field on the report (source=${report.source})`,
        offenders.length === 0,
        offenders.join(', ')
      );
    }

    check(
      'no top-level numeric field other than the extraction counts',
      reports.every((report) =>
        Object.entries(report).every(
          ([key, value]) => key === 'extracted' || key === 'findings' || typeof value !== 'number'
        )
      )
    );

    check(
      'every finding is traceable to a named rule with evidence and rationale',
      reports.every((report) =>
        report.findings.every(
          (finding) => finding.rule && finding.evidence.trim() && finding.rationale.trim()
        )
      )
    );
  }

  // ── Summary ──
  const failed = results.filter((r) => !r.passed);
  console.log('');
  if (failed.length === 0) {
    console.log(`  ✓ PASSED — ${results.length} checks\n`);
    console.log('    · a text-layer PDF is reported readable, with its counts');
    console.log('    · Chinese text in a text layer is counted and extracted correctly');
    console.log('    · a bitmap-only PDF is reported as having no text layer (blocker)');
    console.log('    · findings are ordered by severity and each one is traceable');
    console.log('    · the report contains no score, grade or composite number\n');
    return 0;
  }

  console.log(`  ✗ FAILED — ${failed.length} of ${results.length} checks failed\n`);
  for (const failure of failed) {
    console.log(`    - ${failure.description}${failure.detail ? ` (${failure.detail})` : ''}`);
  }
  console.log('');
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\n  ✗ verification crashed: ${error?.stack ?? error}\n`);
    process.exit(1);
  });
