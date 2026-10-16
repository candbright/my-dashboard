import { analyseText, type PdfTextStats } from '@/lib/pdf-assert';
import { resumeToPlainText, type PlainTextSource } from '@/lib/resume-text';

/**
 * The ATS readability report — **facts only, never a score**.
 *
 * ADR-0005 is explicit about this, and the reasoning is worth restating because the
 * temptation to add a number is strong:
 *
 *   - MyPerfectResume was observed moving a user's score from 89 to 70 when a social
 *     link section was merely *renamed* to "Websites". Once a composite score exists,
 *     it is a pressure device, and we inherit the obligation to defend every
 *     fluctuation line by line.
 *   - Resume Worded was criticised for grading *content quality* without ever opening
 *     the produced file — so it cannot know whether the resume is readable at all.
 *
 * So this module computes two things and nothing else:
 *
 *   1. **What the parser actually read** (level 1) — the extracted text and its
 *      counts. Facts. Impossible to argue with.
 *   2. **A ranked list of file-level risks** (level 2) — each one traceable to a
 *      named rule, with the observed evidence and the rule's reasoning attached.
 *
 * There is deliberately no `score`, no `grade`, no `percentage`, and no summation of
 * the findings. `computeAtsReport` returns findings; a caller that wanted a score
 * would have to invent the weighting itself, which is the point.
 *
 * ## Separation from content-quality analysis
 *
 * Content advice ("your bullets lack metrics") is a *different* product surface
 * (ticket 31) and a different epistemic category. Mixing them would destroy the one
 * property that makes this report valuable: that it cannot be disputed. Nothing here
 * looks at whether the writing is *good*, only at whether the file is *readable*.
 *
 * Terminology follows `CONTEXT.md`: 解析可读性 (this) vs 内容质量 (that).
 */

/**
 * `blocker` means the resume probably cannot be read at all; `warning` means content
 * is likely to be dropped; `info` is a mapper limitation worth knowing about.
 *
 * Ordinals are deliberate so the list can be sorted by severity without a lookup
 * table, and so a future severity is inserted rather than appended by accident.
 */
export type AtsSeverity = 'blocker' | 'warning' | 'info';

/** Every rule this report can cite. Stable ids so a finding stays traceable. */
export type AtsRuleId =
  | 'text-layer-missing'
  | 'glyph-loss'
  | 'cjk-font-missing'
  | 'question-mark-cluster';

export interface AtsFinding {
  rule: AtsRuleId;
  severity: AtsSeverity;
  /** One line, Chinese, user-facing. States what is in the file. */
  title: string;
  /** What was observed, with the numbers. This is the traceability requirement. */
  evidence: string;
  /** Why the rule exists — shown in the UI so the judgement is auditable. */
  rationale: string;
  /**
   * How much content industry data attributes to this class of problem, when a
   * figure exists. Shown as context, never combined into anything.
   */
  reference?: string;
}

/** Level 1: what the parser read, with no interpretation at all. */
export interface AtsExtractedText {
  text: string;
  /** Non-whitespace characters. */
  charCount: number;
  cjkCharCount: number;
  /** U+FFFD count — glyphs the producer could not encode. */
  replacementCount: number;
  suspiciousCharCount: number;
  pageCount: number;
}

export interface AtsReport {
  /** Where the text came from, so the UI never implies more than it knows. */
  source: 'pdf' | 'structured';
  /** False only when the file is demonstrably unreadable. */
  readable: boolean;
  extracted: AtsExtractedText;
  /** Sorted by severity. Never summed — see the module comment. */
  findings: AtsFinding[];
}

const SEVERITY_ORDER: Record<AtsSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

/** Sorts by severity, keeping the declaration order within a severity. */
export function sortFindings(findings: AtsFinding[]): AtsFinding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity];
      return bySeverity !== 0 ? bySeverity : a.index - b.index;
    })
    .map(({ finding }) => finding);
}

/** Builds the level-1 payload from already-extracted text. */
export function extractionReport(text: string, pageCount: number): AtsExtractedText {
  const stats: PdfTextStats = analyseText(text, pageCount);

  return {
    text: stats.text,
    charCount: stats.charCount,
    cjkCharCount: stats.cjkCharCount,
    replacementCount: stats.replacementCount,
    suspiciousCharCount: stats.suspiciousCharCount,
    pageCount: stats.pageCount,
  };
}

/**
 * The level-2 rules, evaluated against the extracted text.
 *
 * Each rule states a fact about the file. None of them consult the resume's content,
 * which is what keeps the report out of content-quality territory.
 */
export function evaluateFindings(extracted: AtsExtractedText): AtsFinding[] {
  const findings: AtsFinding[] = [];

  // ── Rule: no text layer ──
  // The blocker. An image-only PDF is invisible to every text-based ATS.
  if (extracted.charCount === 0) {
    findings.push({
      rule: 'text-layer-missing',
      severity: 'blocker',
      title: '这份文件没有文字层',
      evidence: `从 ${extracted.pageCount} 页中抽取到 0 个非空白字符。`,
      rationale:
        '判定依据：抽取文本为空。文件可能由图片构成（截图、位图 PDF 或图片导出），或字体完全没有生成可提取的字符映射。以文本为输入的系统读不到任何内容。',
    });
  }

  // ── Rule: glyph loss ──
  // U+FFFD is unambiguous: the producer emitted it in place of a glyph it could not
  // encode. There is no false-positive story worth worrying about.
  if (extracted.replacementCount > 0) {
    findings.push({
      rule: 'glyph-loss',
      severity: 'blocker',
      title: '有字符在渲染时丢失',
      evidence: `抽取文本含 ${extracted.replacementCount} 个替换字符（U+FFFD）${
        extracted.cjkCharCount > 0 ? `，同时抽到 ${extracted.cjkCharCount} 个中日韩字符` : ''
      }。`,
      rationale:
        '判定依据：抽取文本含 U+FFFD。这是字体缺少字形时的直接信号，读取方看到的是「�」，对应位置的内容等于丢失。',
    });
  }

  // ── Rule: suspicious `?` clusters ──
  // Deliberately separate from U+FFFD because the signal is weaker: a `?` is usually
  // punctuation. `looksLikeLostText` only flags clustered or CJK-adjacent shapes.
  if (extracted.suspiciousCharCount > extracted.replacementCount) {
    const questionMarks = extracted.suspiciousCharCount - extracted.replacementCount;
    findings.push({
      rule: 'question-mark-cluster',
      severity: 'warning',
      title: '有问号呈现为丢失字形的形状',
      evidence: `除 U+FFFD 外，另检出 ${questionMarks} 处「连续问号」或「紧邻中日韩字符的问号」。`,
      rationale:
        '判定依据：`?` 成串出现，或紧邻中日韩字符。单个问号通常是标点，因此只在形状具有区分度时才报告——宁可漏报，也不误伤一份正常的简历。',
    });
  }

  // ── Rule: no CJK in a CJK-facing product ──
  // Not a defect claim about the file: it may legitimately be an English resume. The
  // wording is therefore neutral and the severity is `info`.
  if (extracted.charCount > 0 && extracted.cjkCharCount === 0) {
    findings.push({
      rule: 'cjk-font-missing',
      severity: 'info',
      title: '抽取文本中不含中日韩字符',
      evidence: `${extracted.charCount} 个非空白字符中，中日韩字符为 0 个，页数 ${extracted.pageCount}。`,
      rationale:
        '判定依据：中日韩字符计数为 0。若这份简历本应含中文，说明字体没有被正确嵌入或子集化，中文会在读取方变成缺失字形；若它本来就是英文简历，则此条可以忽略。',
    });
  }

  return sortFindings(findings);
}

/**
 * Builds a report from text already extracted from a produced **file**.
 *
 * This is the path that matters for ADR-0005's whole argument: the report describes a
 * real artifact, not the content the user typed.
 */
export function reportFromExtractedText(text: string, pageCount: number): AtsReport {
  const extracted = extractionReport(text, pageCount);

  return {
    source: 'pdf',
    readable: extracted.charCount > 0 && extracted.replacementCount === 0,
    extracted,
    findings: evaluateFindings(extracted),
  };
}

/**
 * Builds a report from structured content instead of a file.
 *
 * Useful before an export exists — the "what will the parser see" preview — but it is
 * a **weaker guarantee** and the UI must say so: it describes the text this project
 * *would* produce, so it cannot reveal a font-embedding or glyph-loss problem in an
 * actual PDF. Marked `source: 'structured'` so the UI can label it honestly.
 *
 * The text itself comes from ticket 06's `resumeToPlainText`; there is deliberately no
 * second implementation, so the preview and the exported `.txt` cannot disagree.
 */
export function reportFromStructuredContent(source: PlainTextSource): AtsReport {
  const text = resumeToPlainText(source);
  const extracted = extractionReport(text, 1);

  return {
    source: 'structured',
    readable: extracted.charCount > 0,
    extracted,
    // Only the text-dependent rules are meaningful here. `text-layer-missing` and
    // `glyph-loss` would be false by construction, so they are not evaluated.
    findings: evaluateFindings(extracted),
  };
}
