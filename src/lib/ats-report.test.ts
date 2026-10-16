import { describe, expect, it } from 'vitest';
import {
  evaluateFindings,
  extractionReport,
  reportFromExtractedText,
  reportFromStructuredContent,
  sortFindings,
  type AtsFinding,
} from '@/lib/ats-report';

/**
 * Tests for the ATS readability report (ticket 07, ADR-0005).
 *
 * The load-bearing assertions here are the *negative* ones: no score, no grade, no
 * composite number of any kind. ADR-0005 chose to give up the "one number" hook
 * deliberately, and the cheapest way to lose that property is for someone to add a
 * `score` field later. The shape assertions below make that a test failure.
 */

const SAMPLE_ZH = [
  '张三',
  '',
  '后端工程师',
  '',
  'zhangsan@example.com',
  '13800138000',
  '',
  '工作经历',
  '',
  '高级后端工程师 | 某某科技 | 2021.03 - 至今',
  '- 负责简历解析服务',
].join('\n');

describe('ADR-0005 boundary — the report contains no score', () => {
  it('has no score-like field on the report', () => {
    const report = reportFromExtractedText(SAMPLE_ZH, 1);
    const keys = Object.keys(report);

    for (const forbidden of ['score', 'grade', 'rating', 'percentage', 'total', 'overall']) {
      expect(keys, `${forbidden} must not exist`).not.toContain(forbidden);
    }
  });

  it('has no score-like field on a finding', () => {
    const report = reportFromExtractedText('', 1);
    const keys = Object.keys(report.findings[0]);

    for (const forbidden of ['score', 'weight', 'points', 'penalty', 'deduction']) {
      expect(keys, `${forbidden} must not exist`).not.toContain(forbidden);
    }
  });

  it('has no score-like field on the extracted-text payload', () => {
    const report = reportFromExtractedText(SAMPLE_ZH, 1);

    for (const forbidden of ['score', 'quality', 'percentage']) {
      expect(Object.keys(report.extracted)).not.toContain(forbidden);
    }
  });

  it('does not sum findings into any numeric field', () => {
    // A blunt guard: no number in the top-level report except the extraction counts,
    // which are all inside `extracted`.
    const report = reportFromExtractedText(SAMPLE_ZH, 3);

    for (const [key, value] of Object.entries(report)) {
      if (key === 'extracted' || key === 'findings') continue;
      expect(typeof value, `${key} should not be a number`).not.toBe('number');
    }
  });
});

describe('evaluateFindings — no text layer', () => {
  it('reports a blocker for an empty extraction', () => {
    const findings = evaluateFindings(extractionReport('', 1));

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('text-layer-missing');
    expect(findings[0].severity).toBe('blocker');
  });

  it('includes the page count in the evidence so the claim is checkable', () => {
    const findings = evaluateFindings(extractionReport('\n\n\n', 4));

    expect(findings[0].evidence).toContain('4');
    expect(findings[0].evidence).toContain('0');
  });

  it('does not report a missing text layer when text exists', () => {
    const findings = evaluateFindings(extractionReport(SAMPLE_ZH, 1));

    expect(findings.some((f) => f.rule === 'text-layer-missing')).toBe(false);
  });

  it('reports a missing text layer for a whitespace-only extraction', () => {
    // A bitmap PDF still yields the separators we insert between pages; those must
    // not be mistaken for a text layer.
    const findings = evaluateFindings(extractionReport('\n   \n\t\n', 2));

    expect(findings[0].rule).toBe('text-layer-missing');
  });
});

describe('evaluateFindings — glyph loss', () => {
  it('reports a blocker when U+FFFD is present', () => {
    const findings = evaluateFindings(extractionReport('张三\ufffd工程师', 1));
    const glyph = findings.find((f) => f.rule === 'glyph-loss');

    expect(glyph).toBeDefined();
    expect(glyph?.severity).toBe('blocker');
    expect(glyph?.evidence).toContain('1');
  });

  it('counts every replacement character', () => {
    const findings = evaluateFindings(extractionReport('a\ufffdb\ufffdc\ufffd', 1));
    const glyph = findings.find((f) => f.rule === 'glyph-loss');

    expect(glyph?.evidence).toContain('3');
  });

  it('reports no glyph loss for clean CJK text', () => {
    const findings = evaluateFindings(extractionReport(SAMPLE_ZH, 1));

    expect(findings.some((f) => f.rule === 'glyph-loss')).toBe(false);
  });

  it('flags a clustered question mark as suspected loss', () => {
    // `??` does not occur as punctuation, so it is treated as a lost glyph.
    const findings = evaluateFindings(extractionReport('工程师??先生', 1));

    expect(findings.some((f) => f.rule === 'question-mark-cluster')).toBe(true);
  });

  it('does not flag a lone question mark as loss', () => {
    // Refusing to export because a resume asks a question would be worse than the
    // disease, so a single `?` must stay silent.
    const findings = evaluateFindings(extractionReport('Are you available? Yes.', 1));

    expect(findings.some((f) => f.rule === 'question-mark-cluster')).toBe(false);
  });
});

describe('evaluateFindings — no CJK in a CJK-facing product', () => {
  it('reports an info finding for a text layer with no CJK', () => {
    const findings = evaluateFindings(extractionReport('John Smith\nEngineer', 1));
    const cjk = findings.find((f) => f.rule === 'cjk-font-missing');

    expect(cjk).toBeDefined();
    // `info`, not a defect: an English resume is a legitimate document.
    expect(cjk?.severity).toBe('info');
  });

  it('does not report it when CJK is present', () => {
    const findings = evaluateFindings(extractionReport(SAMPLE_ZH, 1));

    expect(findings.some((f) => f.rule === 'cjk-font-missing')).toBe(false);
  });

  it('does not report it for an empty document, which has a worse finding already', () => {
    const findings = evaluateFindings(extractionReport('', 1));

    expect(findings.map((f) => f.rule)).toEqual(['text-layer-missing']);
  });
});

describe('sortFindings — ordered by severity', () => {
  it('puts blockers before warnings before info', () => {
    const findings: AtsFinding[] = [
      { rule: 'cjk-font-missing', severity: 'info', title: 'i', evidence: 'e', rationale: 'r' },
      { rule: 'glyph-loss', severity: 'blocker', title: 'b', evidence: 'e', rationale: 'r' },
      { rule: 'question-mark-cluster', severity: 'warning', title: 'w', evidence: 'e', rationale: 'r' },
    ];

    expect(sortFindings(findings).map((f) => f.severity)).toEqual(['blocker', 'warning', 'info']);
  });

  it('is stable within a severity', () => {
    const findings: AtsFinding[] = [
      { rule: 'glyph-loss', severity: 'warning', title: 'first', evidence: 'e', rationale: 'r' },
      { rule: 'question-mark-cluster', severity: 'warning', title: 'second', evidence: 'e', rationale: 'r' },
    ];

    expect(sortFindings(findings).map((f) => f.title)).toEqual(['first', 'second']);
  });
});

describe('every finding is traceable to its rule', () => {
  it('gives every finding a rule id, evidence and rationale', () => {
    // The acceptance criterion is that the UI can show the judgement basis, so a
    // finding without all three is not shippable.
    const combined = [
      ...evaluateFindings(extractionReport('', 1)),
      ...evaluateFindings(extractionReport('a\ufffd??b', 2)),
      ...evaluateFindings(extractionReport('English only', 1)),
    ];

    expect(combined.length).toBeGreaterThanOrEqual(4);
    for (const finding of combined) {
      expect(finding.rule, 'rule id').toBeTruthy();
      expect(finding.evidence.trim(), `${finding.rule} evidence`).not.toBe('');
      expect(finding.rationale.trim(), `${finding.rule} rationale`).not.toBe('');
      expect(finding.rationale, `${finding.rule} rationale should cite its rule`).toContain('判定依据');
    }
  });

  it('uses only the declared rule ids', () => {
    const declared = [
      'text-layer-missing',
      'glyph-loss',
      'cjk-font-missing',
      'question-mark-cluster',
    ];
    const combined = [
      ...evaluateFindings(extractionReport('', 1)),
      ...evaluateFindings(extractionReport('a\ufffd??b', 2)),
      ...evaluateFindings(extractionReport('English only', 1)),
    ];

    for (const finding of combined) {
      expect(declared).toContain(finding.rule);
    }
  });
});

describe('reportFromExtractedText — the produced-file path', () => {
  it('reports a readable file with correct Chinese counts', () => {
    // Acceptance criterion: a PDF with a text layer reports its CJK count correctly.
    const report = reportFromExtractedText(SAMPLE_ZH, 1);

    expect(report.source).toBe('pdf');
    expect(report.readable).toBe(true);
    expect(report.extracted.cjkCharCount).toBeGreaterThan(0);
    expect(report.extracted.charCount).toBeGreaterThan(0);
    expect(report.extracted.pageCount).toBe(1);
  });

  it('exposes the extracted text verbatim so the UI can show it', () => {
    const report = reportFromExtractedText(SAMPLE_ZH, 1);

    expect(report.extracted.text).toContain('张三');
    expect(report.extracted.text).toContain('负责简历解析服务');
  });

  it('reports an unreadable file for a bitmap-only PDF, with no text layer', () => {
    // Acceptance criterion: an old-pipeline image PDF must be reported correctly.
    // The extraction for such a file yields only the per-page separators.
    const report = reportFromExtractedText('\n\n', 1);

    expect(report.readable).toBe(false);
    expect(report.findings[0].rule).toBe('text-layer-missing');
    expect(report.findings[0].severity).toBe('blocker');
  });

  it('treats a file with glyph loss as not readable', () => {
    const report = reportFromExtractedText('张三\ufffd', 1);

    expect(report.readable).toBe(false);
  });
});

describe('reportFromStructuredContent — the pre-export path', () => {
  it('labels its source as structured, not pdf', () => {
    // The distinction matters: this path cannot detect a font or glyph problem in a
    // real PDF, and the UI has to say so rather than imply a file was inspected.
    const report = reportFromStructuredContent({
      frontmatter: { name: '张三', title: '后端工程师' },
      sections: [{ title: '工作经历', items: [{ title: '工程师' }] }],
    });

    expect(report.source).toBe('structured');
  });

  it('reuses the plain-text renderer so the preview matches the .txt export', () => {
    const report = reportFromStructuredContent({
      frontmatter: { name: '张三' },
      sections: [{ title: '技能', content: 'Go' }],
    });

    expect(report.extracted.text).toContain('张三');
    expect(report.extracted.text).toContain('技能');
    // No Markdown residue, exactly as in the exported file.
    expect(report.extracted.text).not.toContain('##');
  });

  it('reports a readable document and counts its Chinese characters', () => {
    const report = reportFromStructuredContent({
      frontmatter: { name: '张三', title: '后端工程师' },
      sections: [{ title: '技能', content: 'Go、PostgreSQL' }],
    });

    expect(report.readable).toBe(true);
    expect(report.extracted.cjkCharCount).toBeGreaterThan(0);
  });

  it('handles empty content without throwing', () => {
    const report = reportFromStructuredContent({});

    expect(report.readable).toBe(false);
    expect(report.findings[0].rule).toBe('text-layer-missing');
  });
});
