'use client';

/**
 * The creation wizard: 模板 → 内容 → 编辑预览 (ticket 48, ADR-0008, ADR-0004).
 *
 * # The three phases, and why the order is the point
 *
 * This screen used to be two phases — a start screen and an editor — where the start screen offered
 * 「选择模板」 as one of three *content* cards. Picking it filled the editor with somebody else's prose and
 * changed nothing about how the resume looked, which is the confusion the ticket names:
 * 不同简历模板改变的应该是简历的 UI 风格，而不是实际内容.
 *
 * So the style is now a phase of its own, **first**, and the content phase comes after it:
 *
 *   1. `style` — 视觉模板 + 主色 (`TemplateSelector`). Changes nothing but the presentation.
 *   2. `content` — 上传文件 / 空白创建 / 案例参考 / AI 解析 (`ResumeStartScreen`). 空白创建 and
 *      案例参考 are choices until 下一步, which is what writes the 草稿 and opens the editor.
 *      A finished AI parse opens the editor itself.
 *   3. `editor` — edit the content while previewing the chosen template (`ResumeSplitEditor`).
 *
 * # What each phase owns
 *
 * `style` (a `CreationStyle`) and the document (`markdown` + `parsed` + `metadataValues`) are separate
 * pieces of state, and the transitions between phases only ever *read* them. That is what makes
 * back-navigation free: stepping back from the editor to 内容, or from 内容 to 模板, preserves the document,
 * the metadata and the styling, because nothing clears them. Only `error`/`notice` are cleared, since they
 * describe an action that has already finished.
 *
 * The one place the two meet is the save: the document is built from `metadataValues` as typed, and the
 * styling travels as its own `presentation` field (`resume-creation.ts` documents that contract).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { readSSEStream } from '@/lib/sse';
import { failureText, readErrorEnvelope } from '@/lib/http-json';
import { parseResumeMarkdown, resumeMetadataView } from '@/lib/resume-parser';
import type { ParsedResume } from '@/lib/resume-model';
import { BLANK_SEED_ID, findResumeSeed, type ResumeSeed } from '@/lib/resume-template-seeds';
import {
  creationPresentation,
  creationPresentationField,
  defaultCreationStyle,
  selectCreationAccent,
  selectCreationTemplate,
  type CreationStyle,
} from '@/lib/resume-creation';
import { resumeMarkdownExport } from '@/lib/resume-builder';
import {
  collectMetadataErrors,
  invalidMetadataUrlNotice,
  metadataValuesFromRecord,
  metadataValuesFromView,
  metadataValuesWithoutInvalidUrls,
  type MetadataKey,
  type ResumeMetadataValues,
} from '@/lib/resume-metadata';
import { PageContainer } from '@/components/layout';
import { ResumeStyleStep } from '@/components/ResumeStyleStep';
import { ResumeStartScreen } from '@/components/ResumeStartScreen';
import { ResumeSplitEditor } from '@/components/ResumeSplitEditor';
import { useLeaveGuard } from '@/contexts/LeaveGuardContext';
import { cn } from '@/lib/cn';

// ── Phase type ──
type Phase = 'style' | 'content' | 'editor';

/** The steps, in order, with the label the progress indicator shows. */
const STEPS: readonly { phase: Phase; label: string }[] = [
  { phase: 'style', label: '选择模板' },
  { phase: 'content', label: '填写内容' },
  { phase: 'editor', label: '编辑预览' },
];

/** Request state of the AI `parse` capability, so the content step can show progress. */
type AIRequestState = 'idle' | 'parsing';

/**
 * A content choice that is not yet a 草稿.
 *
 * 空白创建 and 案例参考 used to call `openContent` on the click itself, so a draft appeared
 * before 下一步. The click now only records which document *would* be opened.
 */
type PendingSource = { kind: 'blank' } | { kind: 'seed'; id: string; body: string };

export function ResumeBuilderPage() {
  const router = useRouter();
  const leaveGuard = useLeaveGuard();
  const [phase, setPhase] = useState<Phase>('style');
  /** The style chosen in step 1. Its `accentColor` is the user's choice; `creationPresentation` resolves it. */
  const [style, setStyle] = useState<CreationStyle>(defaultCreationStyle);
  const [markdown, setMarkdown] = useState('');
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [metadataValues, setMetadataValues] = useState<ResumeMetadataValues>(() =>
    metadataValuesFromRecord({})
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Non-fatal advisory, e.g. the content exceeded the limit and was truncated. */
  const [notice, setNotice] = useState<string | null>(null);
  const [aiState, setAiState] = useState<AIRequestState>('idle');
  /** Model output accumulated so far — the progress indicator's content, not the document. */
  const [aiDraft, setAiDraft] = useState('');
  /** Highlighted 空白创建 / 案例参考 that has not yet become a 草稿. */
  const [pendingSource, setPendingSource] = useState<PendingSource | null>(null);
  const savedRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  /**
   * Why the in-flight parse was aborted, so the message names the real cause.
   *
   * A user cancellation is not a failure and must not be reported as one, but it arrives as the same
   * `AbortError` a timeout does — without this, cancelling would claim "解析超时".
   */
  const aiAbortKindRef = useRef<'user' | 'timeout' | null>(null);

  // A parse in flight when the user navigates away must not keep running: it would hold the connection
  // open and then open an editor on a screen that no longer exists.
  useEffect(() => () => aiAbortRef.current?.abort(), []);

  /**
   * The 展示态 the whole wizard works in: the template's tokens, the user's colour, the template id.
   *
   * Resolved once per style change rather than per render of a child, so the preview, the editor's
   * 「更换模板」 label and the create payload cannot disagree about what is being rendered.
   */
  const presentation = useMemo(() => creationPresentation(style), [style]);

  /** True once a document exists, which is what makes 继续编辑 possible on the content step. */
  const hasDraft = markdown.trim() !== '' && parsed !== null;
  /** 下一步 is available once a 草稿 exists *or* a blank/case is highlighted. */
  const canAdvance = hasDraft || pendingSource !== null;

  const openContent = (md: string) => {
    const next = parseResumeMarkdown(md);
    setMarkdown(md);
    setParsed(next);
    // Seed the form from any imported frontmatter. Seeds are body-only (ADR-0003), so this is a no-op
    // for a blank/case start and the only source for a pasted `.md` or an AI parse that still carries a
    // `---` block.
    //
    // Links go through `metadataValuesWithoutInvalidUrls` first: a model asked for a 简历 usually echoes
    // one out of the source document's own media folder (`images/X13.png`), which is not a URL, cannot be
    // resolved by anyone, and — because a malformed field blocks the whole save — would leave 保存到平台
    // refusing to run over a field the user never filled in. What was ignored is reported, so the field
    // is not simply missing.
    const seeded = metadataValuesFromView(resumeMetadataView(null, next.frontmatter));
    const { values, dropped } = metadataValuesWithoutInvalidUrls(seeded);
    setMetadataValues(values);
    setNotice(invalidMetadataUrlNotice(dropped));
    setError(null);
    setPendingSource(null);
    // Stay on 填写内容. The bar's 下一步 is what opens the editor, so picking a way does not skip a step.
  };

  const handleMetadataChange = useCallback((key: MetadataKey, value: string) => {
    setMetadataValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Step 1 handlers ──

  const handleSelectTemplate = useCallback((templateId: string) => {
    // The colour resets to the new template's own — see `selectCreationTemplate`. The document is not
    // touched: a template is a style, and this is where that promise is kept.
    setStyle((prev) => selectCreationTemplate(prev, templateId));
  }, []);

  const handleAccentChange = useCallback((accentColor: string) => {
    setStyle((prev) => selectCreationAccent(prev, accentColor));
  }, []);

  // ── Step 2 handlers ──

  const handleStartWithFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      openContent(text);
    } catch {
      setError('文件读取失败');
    }
  };

  const handleSelectSeed = (seed: ResumeSeed) => {
    setError(null);
    // Choice only. The body is stored so 下一步 can open it without looking the seed up again.
    setPendingSource({ kind: 'seed', id: seed.id, body: seed.body });
  };

  const handleSelectBlank = () => {
    setError(null);
    setPendingSource({ kind: 'blank' });
  };

  /**
   * The AI `parse` capability: text → 简历文档.
   *
   * Four things here are load-bearing for what the user sees, and each of them was missing:
   *
   * - **Progress.** A parse takes tens of seconds, and this handler used to report none of it: no loading
   *   state, no streamed text, no disabled button. Pressing the button looked like pressing nothing at
   *   all, so the honest reading of the screen was "the button is broken".
   * - **A stall must be a failure.** The wall-clock timer below is cleared as soon as the response
   *   *headers* arrive, so it covers connecting only. Nothing bounded the stream itself, and a provider
   *   that stopped mid-answer left this screen waiting forever with no error and no timeout.
   *   `idleTimeoutMs` is what actually ends that wait.
   * - **An in-band `error` frame must be raised.** The shared reader reports a mid-stream provider
   *   failure through `onError`; with no handler the failure was dropped and a truncated answer opened in
   *   the editor as if it had succeeded — exactly the defect `sse.ts` exists to prevent.
   * - **The failure text comes from one owner.** `readErrorEnvelope` + `failureText` read the body once
   *   and decide "server's message versus fallback"; `res.json()` on a gateway's HTML error page used to
   *   throw a parse error whose English message was the only thing left to show.
   */
  const handleStartAI = async (input: File | string) => {
    // One request at a time: a second press while parsing would bill a second parse and then race two
    // answers into the same editor.
    if (aiState === 'parsing') return;

    setError(null);
    setNotice(null);
    setAiDraft('');
    setAiState('parsing');

    const controller = new AbortController();
    aiAbortRef.current = controller;
    aiAbortKindRef.current = null;

    const connectTimeout = setTimeout(() => {
      aiAbortKindRef.current = 'timeout';
      controller.abort();
    }, 90_000);

    /** Written from the stream callbacks; an object holder because a closure assignment would be
     *  narrowed away by TypeScript's control-flow analysis at the `if` below. */
    const outcome: { streamError: string | null } = { streamError: null };

    try {
      const formData = new FormData();
      if (input instanceof File) {
        formData.append('file', input);
      } else {
        formData.append('text', input);
      }

      const res = await apiFetch('/api/ai/parse', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(connectTimeout);

      if (!res.ok) {
        throw new Error(
          failureText(await readErrorEnvelope(res), res.status, 'AI 解析失败')
        );
      }

      const { text } = await readSSEStream(res, {
        onChunk: (accumulated) => setAiDraft(accumulated),
        onNotice: (noticeText) => setNotice(noticeText),
        onError: (message) => {
          outcome.streamError = message;
        },
        idleTimeoutMs: 60_000,
      });

      if (outcome.streamError) throw new Error(outcome.streamError);
      if (!text.trim()) throw new Error('AI 未返回有效内容');

      setPendingSource(null);
      openContent(text);
      setPhase('editor');
    } catch (err) {
      // A cancellation is the user's own action and needs no alarm: the screen returning to its input
      // state *is* the confirmation. Everything else must be said out loud.
      if (aiAbortKindRef.current !== 'user') {
        const message =
          aiAbortKindRef.current === 'timeout'
            ? 'AI 解析超时，请重试'
            : err instanceof Error
              ? err.message
              : 'AI 解析失败';
        setError(message);
      }
    } finally {
      clearTimeout(connectTimeout);
      aiAbortRef.current = null;
      aiAbortKindRef.current = null;
      setAiState('idle');
    }
  };

  /** Aborts the in-flight parse; `aiAbortKindRef` makes the outcome read as a cancellation. */
  const handleCancelAI = useCallback(() => {
    aiAbortKindRef.current = 'user';
    aiAbortRef.current?.abort();
  }, []);

  // ── Step 3 handlers ──

  const handleMarkdownChange = (md: string) => {
    setMarkdown(md);
    setParsed(parseResumeMarkdown(md));
  };

  const handleParsedChange = (newParsed: ParsedResume) => {
    setParsed(newParsed);
  };

  /**
   * The interchange document the create endpoint (and a local download) accept.
   *
   * Create is an import: YAML frontmatter is parsed into columns and the body is stored without it
   * (ADR-0003). Re-attaching the draft metadata is what makes a first save keep the name/email the user
   * just typed. `rawContent` is the body with any imported `---` stripped, so a file that already carried
   * frontmatter is not wrapped in a second block.
   *
   * It reads `metadataValues`, **not** the preview's placeholder-filled copy: the placeholders exist so
   * the preview has a name to draw, and a placeholder that reached the stored record would put 张三's
   * contact details on somebody's resume (`resume-preview-metadata.ts`).
   */
  const draftDocument = () =>
    resumeMarkdownExport(
      resumeMetadataView(metadataValues),
      parsed?.rawContent ?? markdown
    );

  const handleSaveToServer = async () => {
    if (!markdown.trim()) return;

    const problems = collectMetadataErrors(metadataValues);
    if (Object.keys(problems).length > 0) {
      const first = Object.values(problems)[0];
      setError(first ?? '基本信息格式不正确');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const content = draftDocument();
      const formData = new FormData();
      formData.append('content', content);
      formData.append('filename', 'resume.md');
      // The styling, as the whole object in one form field — nine camelCase keys and no `version`. The Go
      // create route documents the same contract (`decodeCreatePresentation`); sending the PATCH body
      // instead would be refused with 400 INVALID_PRESENTATION. See `creationPresentationField`.
      formData.append('presentation', creationPresentationField(style));

      const res = await apiFetch('/api/resumes', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      // The reply carries the created resume (`CreateResumeReply.resume`), so the user lands on the
      // resume they just made rather than on the list. A reply without a slug — an older server, or a
      // shape change — falls back to the list rather than pushing an empty slug into a 404.
      const created = (await res.json()) as { resume?: { slug?: string } };
      const slug = created.resume?.slug;

      savedRef.current = true;
      leaveGuard?.setBlocked(false);
      router.push(slug ? `/resume/${slug}` : '/my');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocal = () => {
    if (!markdown.trim()) return;
    const name = metadataValues.name.trim() || '简历';
    const filename = `${name}.md`;
    const blob = new Blob([draftDocument()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Editor → 内容. Keeps the draft: the four cards *replace* it, and 继续编辑 returns to it. */
  const handleBackToContent = () => {
    setPhase('content');
    setError(null);
  };

  /** 内容 → 模板. Keeps the draft as well: nothing about the document is a function of the style. */
  const handleBackToStyle = () => {
    setPhase('style');
    setError(null);
    // The advisory beside the editor or the content step describes the document that was just imported;
    // the style step has no document in hand, so it would be a fact about nothing.
    setNotice(null);
  };

  /** 内容 → editor, with the existing 草稿 untouched. */
  const handleContinueEditing = () => {
    if (!hasDraft) return;
    setPhase('editor');
    setError(null);
  };

  /**
   * 下一步. A highlighted 空白创建 / 案例参考 becomes a 草稿 here and nowhere else.
   * An already-imported file or AI parse is left as it is.
   */
  const handleAdvanceFromContent = () => {
    if (pendingSource?.kind === 'blank') {
      openContent(findResumeSeed(BLANK_SEED_ID)?.body ?? '');
    } else if (pendingSource?.kind === 'seed') {
      openContent(pendingSource.body);
    } else if (!hasDraft) {
      return;
    }
    setPhase('editor');
    setError(null);
  };

  const setLeaveBlocked = leaveGuard?.setBlocked;
  useEffect(() => {
    setLeaveBlocked?.(hasDraft && !savedRef.current);
    return () => setLeaveBlocked?.(false);
  }, [hasDraft, setLeaveBlocked]);

  /**
   * Jump to a named step from the indicator.
   *
   * Later steps that need a document (编辑预览) stay unreachable until one exists, so a click
   * cannot land on an empty editor. An in-flight AI parse also blocks the jump: the content
   * step's 上一步 used to be the only guard, and a stepper that skipped it would leave the
   * stream with nowhere to report.
   */
  const handleStepSelect = (next: Phase) => {
    if (next === phase) return;
    if (aiState === 'parsing') return;
    if (next === 'editor') {
      handleAdvanceFromContent();
      return;
    }
    setError(null);
    if (next === 'style') setNotice(null);
    setPhase(next);
  };

  return (
    <PageContainer className="pb-28">
      <StepIndicator
        phase={phase}
        hasDraft={canAdvance}
        parsing={aiState === 'parsing'}
        onSelect={handleStepSelect}
      />

      {phase === 'style' && (
        <ResumeStyleStep
          selectedTemplateId={style.templateId}
          onSelectTemplate={handleSelectTemplate}
          accent={presentation.accentColor}
          onAccentChange={handleAccentChange}
          onNext={() => {
            setError(null);
            setPhase('content');
          }}
        />
      )}

      {phase === 'content' && (
        <ResumeStartScreen
          onStartWithFile={handleStartWithFile}
          onSelectSeed={handleSelectSeed}
          onSelectBlank={handleSelectBlank}
          selectedSeedId={pendingSource?.kind === 'seed' ? pendingSource.id : null}
          blankSelected={pendingSource?.kind === 'blank'}
          onStartAI={handleStartAI}
          parsing={aiState === 'parsing'}
          streamedText={aiDraft}
          onCancelAI={handleCancelAI}
          error={error}
          notice={notice}
          onBack={handleBackToStyle}
          hasDraft={hasDraft}
          canAdvance={canAdvance}
          onContinue={handleContinueEditing}
          onAdvance={handleAdvanceFromContent}
        />
      )}

      {phase === 'editor' && parsed && (
        <>
          {notice && (
            <div
              role="status"
              className="mb-4 p-3 rounded-[2rem] bg-warning/10 text-sm text-warning leading-relaxed"
            >
              {notice}
            </div>
          )}
          <ResumeSplitEditor
            markdown={markdown}
            parsed={parsed}
            onMarkdownChange={handleMarkdownChange}
            onParsedChange={handleParsedChange}
            metadataValues={metadataValues}
            onMetadataChange={handleMetadataChange}
            presentation={presentation}
            onChangeStyle={handleBackToStyle}
            onSaveToServer={handleSaveToServer}
            onSaveLocal={handleSaveLocal}
            onBack={handleBackToContent}
            saving={saving}
            error={error}
          />
        </>
      )}
    </PageContainer>
  );
}

/**
 * Where the user is in the wizard — and a way to go there.
 *
 * The page no longer carries a title or a subtitle that restates the step. The indicator *is*
 * the orientation: centred, numbered, labelled with the step name only. A click is the same
 * transition the named 上一步 / 下一步 / 继续编辑 buttons perform, including the two guards
 * those buttons already apply (no jump into an empty editor; no jump away from an in-flight
 * parse).
 *
 * `aria-current="step"` rather than a colour alone: the current step is information, and a
 * screen reader gets none of it from a filled circle.
 */
function StepIndicator({
  phase,
  hasDraft,
  parsing,
  onSelect,
}: {
  phase: Phase;
  hasDraft: boolean;
  parsing: boolean;
  onSelect: (phase: Phase) => void;
}) {
  const current = STEPS.findIndex((step) => step.phase === phase);

  return (
    <ol className="mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const reachable = step.phase !== 'editor' || hasDraft;
        const locked = parsing || !reachable;

        return (
          <li key={step.phase} className="flex items-center gap-2">
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              data-wizard-step={step.phase}
              disabled={locked && !active}
              onClick={() => {
                if (!locked) onSelect(step.phase);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-colors duration-500',
                active && 'bg-primary text-primary-foreground',
                done && 'bg-secondary/15 text-secondary hover:bg-secondary/25',
                !active && !done && reachable && 'bg-default-100 text-default-500 hover:bg-default-200 hover:text-foreground',
                !reachable && 'bg-default-100 text-default-300',
                locked && !active && 'cursor-not-allowed opacity-60',
                !locked && !active && 'cursor-pointer'
              )}
            >
              <span className="font-medium">{index + 1}</span>
              {step.label}
            </button>
            {index < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-default-300">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
