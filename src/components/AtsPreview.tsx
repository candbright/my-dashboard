'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, FileText, FileWarning, Info, ScanSearch, Upload } from 'lucide-react';
import { Card, CardBody, Chip, EmptyState, Spinner, Tabs, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { analysePdfFile } from '@/lib/ats-analyse';
import { reportFromStructuredContent, type AtsReport, type AtsSeverity } from '@/lib/ats-report';
import type { PlainTextSource } from '@/lib/resume-text';

/**
 * ATS 体检 — the parser's-eye view of the resume (ticket 07, ADR-0005).
 *
 * ## What this component is, and what it refuses to be
 *
 * The primary surface is **「提取文本」**: the text a parser actually reads, shown
 * verbatim. That is a fact, and it cannot be argued with. Below it is a ranked list of
 * file-level risks, each one showing the rule it came from, the evidence observed, and
 * the rule's reasoning — so a user can audit the judgement rather than trust it.
 *
 * What is deliberately absent, per ADR-0005:
 *
 *   - **No composite score.** Not a number, not a grade, not a percentage. Industry
 *     precedent (MyPerfectResume moving a user 89 → 70 over a section *rename*) shows
 *     a score becomes an upsell device rather than a diagnosis. A test asserts the
 *     report type has no score-shaped field, so this cannot be added by accident.
 *   - **No content-quality opinion.** Whether the writing is *good* is ticket 31's
 *     job. Mixing the two would destroy the one property that makes this report
 *     valuable: that it is undisputable. The terminology split (解析可读性 vs
 *     内容质量) is from `CONTEXT.md` and is visible in the copy.
 *
 * ## Why the file mode is an upload rather than an automatic inspection
 *
 * Phase 1 of ADR-0001 produces the PDF through the browser's print pipeline, and the
 * browser offers no API to read back the bytes it printed — the user picks "Save as
 * PDF" in a dialog we cannot observe. So the honest flow is: export, then hand the
 * saved file back to be inspected. That is also what a real ATS does — it analyses the
 * file you actually submit, not the document you think you made.
 *
 * The "导出内容预览" mode answers the same question from structured content and is
 * cheaper, but it is a **weaker guarantee**: it cannot see a missing font or a lost
 * glyph in a real PDF. The UI labels which one you are looking at instead of implying
 * a file was inspected.
 */

const SEVERITY_STYLE: Record<AtsSeverity, { label: string; color: 'danger' | 'warning' | 'default'; icon: typeof Info }> = {
  blocker: { label: '阻断', color: 'danger', icon: FileWarning },
  warning: { label: '警告', color: 'warning', icon: AlertTriangle },
  info: { label: '提示', color: 'default', icon: Info },
};

/** Human labels for the rule ids, so the traceability line reads as prose. */
const RULE_LABEL: Record<string, string> = {
  'text-layer-missing': '规则：抽取文本为空',
  'glyph-loss': '规则：抽取文本含 U+FFFD',
  'question-mark-cluster': '规则：问号成串或紧邻中日韩字符',
  'cjk-font-missing': '规则：中日韩字符计数为 0',
};

export interface AtsPreviewProps {
  /** Structured content, used for the pre-export preview mode. */
  source: PlainTextSource;
  /**
   * An already-analysed report for a real file, if the caller has one.
   *
   * Passed in rather than fetched here on purpose: analysing a PDF is async and
   * sets state, and doing that from a mount effect is a cascading render for no
   * benefit. A caller that has a file in hand can derive the report itself via
   * `analysePdfFile` and pass the result — which also keeps this component free of a
   * `useEffect` that fires on every prop identity change.
   */
  initialFileReport?: AtsReport | null;
  /** File name to show alongside `initialFileReport`. */
  initialFileName?: string | null;
  className?: string;
}

type Mode = 'preview' | 'file';

export function AtsPreview({
  source,
  initialFileReport = null,
  initialFileName = null,
  className,
}: AtsPreviewProps) {
  const [mode, setMode] = useState<Mode>(initialFileReport ? 'file' : 'preview');
  const [tab, setTab] = useState('text');
  const [fileReport, setFileReport] = useState<AtsReport | null>(initialFileReport);
  const [fileName, setFileName] = useState<string | null>(initialFileName);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The preview report is pure, so it is derived rather than stored. Recomputing on
  // every render would be wasteful but harmless; `useMemo` keeps the counts stable
  // for the same content.
  const previewReport = useMemo(() => reportFromStructuredContent(source), [source]);

  const analyse = useCallback(async (next: File) => {
    setAnalysing(true);
    setError(null);
    try {
      const result = await analysePdfFile(next);
      setFileReport(result.report);
      setFileName(result.fileName);
      setMode('file');
    } catch (err) {
      // A file that is not a PDF at all is a user error, not a quality signal, so it
      // is reported as an error rather than as a finding.
      setError(err instanceof Error ? err.message : '无法解析这个文件，请确认它是 PDF。');
      setFileReport(null);
      setFileName(next.name);
    } finally {
      setAnalysing(false);
    }
  }, []);

  const report = mode === 'file' ? fileReport : previewReport;
  const findings = report?.findings ?? [];

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];
      if (picked) void analyse(picked);
      // Allow re-picking the same file, which otherwise fires no change event.
      event.target.value = '';
    },
    [analyse]
  );

  return (
    <Card variant="bordered" className={cn('overflow-hidden', className)}>
      <CardBody className="space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight">
              <ScanSearch className="h-5 w-5 text-primary" />
              ATS 体检
            </h3>
            <p className="mt-1 text-sm text-default-500">
              这里显示的是<strong className="font-semibold text-foreground">解析可读性</strong>
              ——招聘系统从文件里实际读到了什么。它只陈述事实，不评价内容好坏，也不给出任何分数。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* UI atoms, not native elements: AGENTS.md forbids raw `<button>`. */}
            <Button
              size="sm"
              radius="full"
              variant="bordered"
              color="default"
              onClick={() => setMode(mode === 'preview' ? 'file' : 'preview')}
            >
              {mode === 'preview' ? '检查已导出的 PDF' : '返回导出内容预览'}
            </Button>

            {mode === 'file' && (
              <Button
                size="sm"
                radius="full"
                variant="bordered"
                color="default"
                isDisabled={analysing}
                startContent={<Upload className="h-3.5 w-3.5" />}
                onClick={() => inputRef.current?.click()}
              >
                选择 PDF
              </Button>
            )}
          </div>
        </div>

        {/* Hidden trigger target for the 选择 PDF button above. */}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={onPick}
        />

        {/* ── Source label: never imply more than we know ── */}
        <p className="rounded-[2rem] bg-content2 px-4 py-2.5 text-xs text-default-500">
          {mode === 'file' ? (
            <>
              正在检查<strong className="font-semibold text-foreground">真实文件</strong>
              {fileName ? `：${fileName}` : ''}。这是最可靠的判定——它读的就是你导出的那份文件。
              {!fileReport && !analysing && ' 请选择一份 PDF。'}
            </>
          ) : (
            <>
              当前是<strong className="font-semibold text-foreground">导出内容预览</strong>
              ：它展示这份简历导出成 .txt 后会是什么内容。
              ⚠️ 它<strong className="font-semibold text-foreground">无法</strong>
              发现真实 PDF 里的字体缺失或字形丢失——那需要检查实际文件。
            </>
          )}
        </p>

        {analysing && (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            正在解析文件…
          </div>
        )}

        {error && (
          <p className="rounded-[2rem] bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
        )}

        {report && (
          <>
            {/* ── Level 1: the extracted text, and its counts ── */}
            <Tabs
              items={[
                { key: 'text', label: '提取文本', icon: <FileText className="h-3.5 w-3.5" /> },
                { key: 'risks', label: `风险清单${findings.length ? `（${findings.length}）` : ''}`, icon: <AlertTriangle className="h-3.5 w-3.5" /> },
              ]}
              selectedKey={tab}
              onSelectionChange={setTab}
              variant="underlined"
              color="primary"
              size="sm"
            />

            {tab === 'text' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Chip size="sm" variant="flat" color="default">
                    非空白字符 {report.extracted.charCount}
                  </Chip>
                  <Chip size="sm" variant="flat" color="secondary">
                    中日韩字符 {report.extracted.cjkCharCount}
                  </Chip>
                  <Chip size="sm" variant="flat" color="default">
                    页数 {report.extracted.pageCount}
                  </Chip>
                  {report.extracted.replacementCount > 0 && (
                    <Chip size="sm" variant="flat" color="danger">
                      替换字符 {report.extracted.replacementCount}
                    </Chip>
                  )}
                </div>

                {report.extracted.text.trim() ? (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-[2rem] bg-content2 p-4 font-mono text-xs leading-relaxed text-foreground">
                    {report.extracted.text}
                  </pre>
                ) : (
                  <EmptyState
                    icon={<FileWarning className="h-6 w-6" />}
                    title="没有读到任何文字"
                    description="这份文件里没有可提取的文字层。以文本为输入的系统读不到内容。"
                  />
                )}
              </motion.div>
            )}

            {tab === 'risks' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                {findings.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="h-6 w-6" />}
                    title="没有检出文件级问题"
                    description="这表示在本次检查的规则范围内没有发现解析风险，不代表内容质量评价。"
                  />
                ) : (
                  findings.map((finding) => {
                    const style = SEVERITY_STYLE[finding.severity];
                    const Icon = style.icon;
                    return (
                      <div
                        key={finding.rule}
                        className="rounded-[2rem] border border-default-200 bg-content1 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip
                            size="sm"
                            variant="flat"
                            color={style.color}
                            startContent={<Icon className="h-3.5 w-3.5" />}
                          >
                            {style.label}
                          </Chip>
                          <span className="text-sm font-semibold text-foreground">{finding.title}</span>
                        </div>

                        {/* Evidence and rule id: this is the traceability requirement. */}
                        <p className="mt-2 text-xs text-default-500">{finding.evidence}</p>
                        <p className="mt-1 font-mono text-[11px] text-default-400">
                          {RULE_LABEL[finding.rule] ?? finding.rule} · {finding.rule}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-default-500">
                          {finding.rationale}
                        </p>
                      </div>
                    );
                  })
                )}

                <p className="text-xs leading-relaxed text-default-400">
                  行业参考数值（仅作背景，本报告不做任何加权或合成）：双栏版式导致约 17.2% 内容丢失，
                  装饰性图标约 10.6%，联系方式置于页眉约 4.1%。
                </p>
              </motion.div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
