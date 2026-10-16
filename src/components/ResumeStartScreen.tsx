'use client';

/**
 * Step 2 of the creation wizard: 填写内容 (ticket 48).
 *
 * # What this screen is now
 *
 * It used to be the whole start screen: three cards (上传文件 / 选择模板 / 空白创建), where 「选择模板」
 * really meant "pick one of twelve sample documents". That conflated the two axes the ticket separates —
 * 模板 is a **style** and a 案例 is **content** — so the style step moved out (step 1, `TemplateSelector`)
 * and this step is now only about where the text comes from.
 *
 * Four ways, per the ticket:
 *
 *   - **上传文件** — a `.md` you already have;
 *   - **空白创建** — the blank document, the same one the old 「空白创建」 card used;
 *   - **案例参考** — a 内容种子 from `RESUME_SEEDS` (`ResumeSeedGallery`), which is prose and not a design;
 *   - **AI 智能解析** — upload or paste anything and let the model structure it.
 *
 * 空白创建 and 案例参考 are *choices*, not commits. Selecting one highlights it; 下一步 is what
 * materialises the 草稿 and opens the editor. Upload still produces a document and waits for
 * 下一步. A finished AI parse opens the editor itself.
 *
 * # What was preserved on purpose
 *
 * The AI path is the most delicate thing on this screen, and every behaviour below is load-bearing
 * (each one is documented at its site): a parse shows progress and the streamed text as evidence, can be
 * cancelled, reports its failures *here* rather than in an editor the user cannot reach, and never leaves
 * the panel in a stuck state. The 上传 / AI panels were previously two modes of one panel; they are now
 * two cards, and the shared state that the old mode toggle needed (`selectedFile` wins over pasted text)
 * is unchanged.
 *
 * # Back-navigation keeps the draft
 *
 * Returning here from the editor must not look like starting over: the buttons are the ways to *replace*
 * the document, so a 继续编辑 action is offered whenever a draft exists, and stepping back to step 1
 * changes nothing but the phase.
 */

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  Plus,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { Button, Chip, Textarea } from '@/components/ui';
import { ResumeSeedGallery } from '@/components/ResumeSeedGallery';
import { WizardActionBar } from '@/components/WizardActionBar';
import { cn } from '@/lib/cn';
import type { ResumeSeed } from '@/lib/resume-template-seeds';

export interface ResumeStartScreenProps {
  onStartWithFile: (file: File) => void;
  /**
   * Highlights a 案例参考. The document is not written until 下一步, so this is a
   * choice, not a 草稿.
   */
  onSelectSeed: (seed: ResumeSeed) => void;
  /** Highlights 空白创建. Same rule: no 草稿 until 下一步. */
  onSelectBlank: () => void;
  /** The case currently highlighted, so the gallery can show the selection. */
  selectedSeedId: string | null;
  /** True while 空白创建 is the highlighted choice. */
  blankSelected: boolean;
  /** Runs the AI `parse` capability on a file or pasted text. One entry point, because the UI offers one button. */
  onStartAI: (input: File | string) => void;
  /**
   * True while an AI parse is in flight.
   *
   * The screen has to answer "is anything happening?" for the whole tens of seconds a parse takes.
   * It used to have no way to know, so the button looked dead until the editor replaced the page.
   */
  parsing: boolean;
  /** Model output accumulated so far — progress feedback, shown while `parsing`. */
  streamedText: string;
  /** Aborts the in-flight parse. */
  onCancelAI: () => void;
  /**
   * A failure worth showing.
   *
   * This screen is where the AI parse is started, so it is where its failures have to appear: they used
   * to be stored on the builder and rendered only in the editor, which is unreachable when the parse
   * fails — so every failure was invisible and the button read as broken.
   */
  error: string | null;
  /** A non-fatal fact about the last request, e.g. that the input was truncated before sending. */
  notice: string | null;
  /** Back to step 1 (风格). */
  onBack: () => void;
  /**
   * True when a draft document already exists, i.e. the user has been to the editor and come back.
   *
   * Without this the only affordances on the screen are the four ways to replace what they wrote.
   */
  hasDraft: boolean;
  /**
   * True when a content way is ready to become a 草稿 (blank/case chosen, or a
   * file/parse already imported). 下一步 is disabled until then.
   */
  canAdvance: boolean;
  /** Returns to the editor with the existing 草稿 untouched. */
  onContinue: () => void;
  /** Commits the highlighted 空白创建 / 案例参考 (if any) and opens the editor. */
  onAdvance: () => void;
}

/** Which panel is open; `null` is the card grid. */
type ExpandedView = 'upload' | 'seed' | 'ai' | null;

export function ResumeStartScreen({
  onStartWithFile,
  onSelectSeed,
  onSelectBlank,
  selectedSeedId,
  blankSelected,
  onStartAI,
  parsing,
  streamedText,
  onCancelAI,
  error,
  notice,
  onBack,
  hasDraft,
  canAdvance,
  onContinue,
  onAdvance,
}: ResumeStartScreenProps) {
  const [expanded, setExpanded] = useState<ExpandedView>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  /** Which of the two file inputs opened the picker, so a chosen file is cleared from the right one. */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ──

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  /**
   * Drops the chosen file.
   *
   * The file wins over pasted text when both are present, so without a way to clear it a user who picked
   * the wrong input had no route back to the text they had just pasted.
   */
  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (aiFileInputRef.current) aiFileInputRef.current.value = '';
  }, []);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleStartStandard = useCallback(() => {
    if (selectedFile) {
      onStartWithFile(selectedFile);
    }
  }, [selectedFile, onStartWithFile]);

  /**
   * AI-parses whichever input the user supplied.
   *
   * The file wins when both are present, because choosing a file is the more deliberate act. This is the
   * only handler the "AI 智能解析" button uses: it used to fall back to the non-AI text path, so pasting
   * text and pressing a button labelled AI silently did local parsing instead — same button, different
   * feature, nothing to indicate which.
   */
  const handleStartAI = useCallback(() => {
    if (selectedFile) {
      onStartAI(selectedFile);
    } else if (pastedText.trim()) {
      onStartAI(pastedText.trim());
    }
  }, [selectedFile, pastedText, onStartAI]);

  const collapse = useCallback(() => {
    setExpanded(null);
    setSelectedFile(null);
    setPastedText('');
  }, []);

  // ── Animation variants ──

  const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  const expandVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  };

  // ── Cards config ──

  const featuredCard = {
    key: 'ai' as const,
    icon: Sparkles,
    title: 'AI 智能解析',
    description: '上传或粘贴任意文本，由 AI 整理成结构完整的简历',
  };

  const cards = [
    {
      key: 'upload' as const,
      icon: Upload,
      title: '上传文件',
      description: '上传已有的 Markdown 文件，保留其中的内容',
    },
    {
      key: 'blank' as const,
      icon: Plus,
      title: '空白创建',
      description: '从空白简历开始，自己写内容',
    },
    {
      key: 'seed' as const,
      icon: FileText,
      title: '案例参考',
      description: '选一份同类岗位的样例，改成自己的经历',
    },
  ];

  // ── Render ──

  return (
    <div className="mx-auto max-w-3xl pb-4">
      {/* The page's own header (PageContainer) already titles this screen. A second, larger, centred
          copy of the same heading used to sit here — two `h1`s with identical text, which is both a
          duplicated landmark for assistive tech and a redundant block on screen. */}
      <StartFeedback error={error} notice={notice} />

      {hasDraft && (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-default-200 bg-content1 p-4"
        >
          <p className="text-sm text-default-500 leading-relaxed">已有一份草稿，继续编辑？</p>
          <Button
            color="primary"
            size="sm"
            endContent={<ArrowRight className="w-4 h-4" />}
            onClick={onContinue}
          >
            继续编辑
          </Button>
        </div>
      )}

      {/* Expanded panel or card grid */}
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key={expanded}
            variants={expandVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
          >
            {expanded === 'upload' && (
              <UploadPanel
                isDragging={isDragging}
                selectedFile={selectedFile}
                fileInputRef={fileInputRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileInputChange={handleFileInputChange}
                onClearFile={handleClearFile}
                onStartStandard={handleStartStandard}
                onBack={collapse}
              />
            )}

            {expanded === 'seed' && (
              <SeedPanel
                onPick={onSelectSeed}
                selectedId={selectedSeedId}
                onBack={collapse}
              />
            )}

            {expanded === 'ai' && (
              <AIPanel
                isDragging={isDragging}
                selectedFile={selectedFile}
                pastedText={pastedText}
                setPastedText={setPastedText}
                aiFileInputRef={aiFileInputRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileInputChange={handleFileInputChange}
                onClearFile={handleClearFile}
                onStartAI={handleStartAI}
                parsing={parsing}
                streamedText={streamedText}
                onCancelAI={onCancelAI}
                onBack={collapse}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="cards"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
            className="flex flex-col gap-4"
          >
            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: [0.25, 0.4, 0.25, 1] }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setExpanded(featuredCard.key)}
              data-way={featuredCard.key}
              className={cn(
                'rounded-[2rem] border border-primary/30 bg-primary/5 p-6 sm:p-7',
                'cursor-pointer text-left',
                'transition-colors duration-500 ease-in-out',
                'hover:border-primary hover:bg-primary/10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
              )}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[2rem] bg-primary/15">
                  <featuredCard.icon className="h-7 w-7 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-xl font-semibold text-foreground">
                      {featuredCard.title}
                    </h3>
                    <Chip variant="flat" color="primary" size="sm">
                      推荐
                    </Chip>
                  </div>
                  <p className="text-sm leading-relaxed text-default-500">
                    {featuredCard.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary sm:shrink-0">
                  开始整理
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </motion.button>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {cards.map((card, index) => (
                <motion.button
                  key={card.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.18 + index * 0.08,
                    ease: [0.25, 0.4, 0.25, 1],
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (card.key === 'blank') {
                      onSelectBlank();
                    } else {
                      setExpanded(card.key);
                    }
                  }}
                  data-way={card.key}
                  data-selected={
                    (card.key === 'blank' && blankSelected) ||
                    (card.key === 'seed' && selectedSeedId)
                      ? 'true'
                      : undefined
                  }
                  className={cn(
                    'rounded-[2rem] bg-content1 p-6',
                    'cursor-pointer text-left',
                    'transition-colors duration-500 ease-in-out',
                    'hover:border-primary hover:bg-content2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    (card.key === 'blank' && blankSelected) ||
                      (card.key === 'seed' && selectedSeedId)
                      ? 'border border-primary bg-content2'
                      : 'border border-default-200'
                  )}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[2rem] bg-secondary/10">
                    <card.icon className="h-5 w-5 text-secondary" />
                  </div>
                  <h3 className="mb-1 text-base font-semibold text-foreground">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-default-500">{card.description}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step actions. 下一步 stays in the same slot as step 1 even with no draft: it is disabled
          rather than missing, so the bar does not jump. Disabled while a parse is running too —
          stepping away would leave the stream with nowhere to report (`取消解析` is the way out). */}
      <WizardActionBar
        left={
          <Button
            variant="light"
            size="sm"
            startContent={<ArrowLeft className="w-4 h-4" />}
            isDisabled={parsing}
            onClick={onBack}
            data-step-back="content"
          >
            上一步
          </Button>
        }
        right={
          <Button
            color="primary"
            size="sm"
            endContent={<ArrowRight className="w-4 h-4" />}
            isDisabled={parsing || !canAdvance}
            onClick={onAdvance}
            data-step-next="content"
          >
            下一步
          </Button>
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Feedback banners
// ─────────────────────────────────────────────────────

/**
 * The only place this screen reports a failure or an advisory.
 *
 * It sits outside the expanding panel on purpose: a failure has to be visible whichever view is open, and
 * it must survive the panel collapsing. `role="alert"` is what makes it heard rather than merely drawn —
 * a message that appears without being announced is the same silent failure in a different costume.
 */
function StartFeedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;

  return (
    <div className="mb-5 space-y-3">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[2rem] bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[2rem] bg-warning/10 p-3 text-sm text-warning"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="leading-relaxed">{notice}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// AI parse progress
// ─────────────────────────────────────────────────────

/**
 * What the screen shows for the tens of seconds an AI parse takes.
 *
 * A spinner says the request is alive; the streamed text is evidence that the model is producing
 * something. Extra status copy ("正在解析…", "正在等待…") was noise on top of those two signals.
 *
 * The streamed text is deliberately `aria-live="off"` territory: announcing every token would make the
 * live region unusable. The polite live region is the spinner's sr-only label.
 */
function AIParseProgress({
  streamedText,
  onCancel,
}: {
  streamedText: string;
  onCancel: () => void;
}) {
  const receiving = streamedText.length > 0;

  return (
    <div>
      <div className="flex items-start gap-3" role="status" aria-live="polite">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[2rem] bg-secondary/10">
          <Loader2 className="h-4 w-4 animate-spin text-secondary" />
        </span>
        <span className="sr-only">解析中</span>
        {receiving && (
          <pre className="max-h-[280px] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-default-500">
            {streamedText}
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-secondary align-middle"
            />
          </pre>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="bordered"
          size="sm"
          startContent={<X className="h-3.5 w-3.5" />}
          onClick={onCancel}
        >
          取消解析
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// File dropzone
// ─────────────────────────────────────────────────────

/**
 * The file chooser both file-based ways use.
 *
 * It is a `role="button"` div rather than a `<button>` because it has to contain the `<input type="file">`
 * it triggers, and a button may not contain form controls.
 *
 * **Why it is not a bare `<div onClick>` any more.** The input is `className="hidden"`, so this div was
 * the *only* route to the file picker — and a div offers no keyboard affordance whatsoever: Tab skipped
 * it, Enter and Space did nothing. Picking a file was impossible without a mouse, on the primary path of
 * this screen (WCAG 2.1.1 Keyboard, Level A). `role`, `tabIndex` and the key handler are the minimum that
 * closes it.
 *
 * One copy for both ways: the two panes had byte-identical markup except for the icon, the accepted
 * extensions and the padding, which is exactly how the keyboard gap survived in one place while being
 * noticed in the other.
 */
interface ResumeFileDropzoneProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  /** Supported-format line, shown only while nothing is selected. */
  hint: string;
  icon: ReactNode;
  padding: 'p-6' | 'p-8';
  isDragging: boolean;
  selectedFile: File | null;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function ResumeFileDropzone({
  inputRef,
  accept,
  hint,
  icon,
  padding,
  isDragging,
  selectedFile,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
}: ResumeFileDropzoneProps) {
  const openPicker = () => inputRef.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        selectedFile
          ? `已选择文件 ${selectedFile.name}，点击或按回车可重新选择`
          : `选择文件，${hint}`
      }
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
      className={cn(
        'rounded-[2rem] border-2 border-dashed text-center cursor-pointer',
        'transition-colors duration-500 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        padding,
        isDragging
          ? 'border-secondary bg-secondary/5'
          : 'border-default-300 hover:border-primary/50 hover:bg-content2'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onInputChange}
      />
      {icon}
      <p className="text-sm text-default-500">
        {selectedFile ? selectedFile.name : '拖拽文件到此处，或点击选择文件'}
      </p>
      {!selectedFile && <p className="text-xs text-default-400 mt-1">{hint}</p>}
    </div>
  );
}

/** The back link every panel starts with, so the card grid is always one click away. */
function PanelBack({
  onBack,
  disabled = false,
}: {
  onBack: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-5">
      <Button
        variant="light"
        size="sm"
        startContent={<ArrowLeft className="w-4 h-4" />}
        isDisabled={disabled}
        onClick={onBack}
      >
        返回
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 上传文件
// ─────────────────────────────────────────────────────

interface UploadPanelProps {
  isDragging: boolean;
  selectedFile: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onStartStandard: () => void;
  onBack: () => void;
}

function UploadPanel({
  isDragging,
  selectedFile,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInputChange,
  onClearFile,
  onStartStandard,
  onBack,
}: UploadPanelProps) {
  return (
    <div className="rounded-[2rem] bg-content1 border border-default-200 p-6">
      <PanelBack onBack={onBack} />

      {/* Standard upload dropzone */}
      <ResumeFileDropzone
        inputRef={fileInputRef}
        accept=".md,.markdown,.txt"
        hint="支持 .md 文件"
        icon={<Upload className="w-8 h-8 text-default-400 mx-auto mb-3" />}
        padding="p-8"
        isDragging={isDragging}
        selectedFile={selectedFile}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onInputChange={onFileInputChange}
      />

      {/* Action button */}
      {selectedFile && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
          className="mt-4 flex items-center justify-between gap-3"
        >
          <span className="text-sm text-default-500 truncate mr-4">{selectedFile.name}</span>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              variant="light"
              size="sm"
              startContent={<X className="w-3.5 h-3.5" />}
              onClick={onClearFile}
            >
              移除
            </Button>
            <Button color="primary" size="sm" onClick={onStartStandard}>
              开始编辑
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 案例参考
// ─────────────────────────────────────────────────────

interface SeedPanelProps {
  onPick: (seed: ResumeSeed) => void;
  selectedId: string | null;
  onBack: () => void;
}

function SeedPanel({ onPick, selectedId, onBack }: SeedPanelProps) {
  return (
    <div className="rounded-[2rem] bg-content1 border border-default-200 p-6">
      <PanelBack onBack={onBack} />

      <p className="text-sm text-default-500 leading-relaxed mb-4">
        案例数据仅供参考，请根据自己的经历合理修改。
      </p>

      <ResumeSeedGallery onPick={onPick} selectedId={selectedId ?? undefined} />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// AI 智能解析
// ─────────────────────────────────────────────────────

interface AIPanelProps {
  isDragging: boolean;
  selectedFile: File | null;
  pastedText: string;
  setPastedText: (text: string) => void;
  aiFileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onStartAI: () => void;
  parsing: boolean;
  streamedText: string;
  onCancelAI: () => void;
  onBack: () => void;
}

function AIPanel({
  isDragging,
  selectedFile,
  pastedText,
  setPastedText,
  aiFileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInputChange,
  onClearFile,
  onStartAI,
  parsing,
  streamedText,
  onCancelAI,
  onBack,
}: AIPanelProps) {
  return (
    <div className="rounded-[2rem] bg-content1 border border-default-200 p-6">
      {/* Disabled during a parse so this panel cannot be collapsed out from under a request that is
          still running — "取消解析" is the way out. */}
      <PanelBack onBack={onBack} disabled={parsing} />

      {/* Note: no `AnimatePresence` around these two views, and that is deliberate.
       *
       * `mode="wait"` holds the incoming view back until the outgoing one has finished leaving. A parse
       * can flip `parsing` back well inside that window — an unconfigured AI source answers in
       * milliseconds — and when it does, the outgoing progress view's exit never resolves and the
       * incoming one is never mounted. The user is left looking at a frozen "AI 正在解析…" with no inputs
       * to retry from: a dead end, and the exact silent non-response this work set out to remove.
       * Swapping the views outright (each still fades in on mount) cannot get stuck that way, and the
       * wait is already covered by the progress view rather than by a transition. */}
      {parsing ? (
        <motion.div
          key="ai-parsing"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        >
          <AIParseProgress streamedText={streamedText} onCancel={onCancelAI} />
        </motion.div>
      ) : (
        <motion.div
          key="ai"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        >
          {/* AI upload dropzone */}
          <ResumeFileDropzone
            inputRef={aiFileInputRef}
            accept=".md,.txt,.html"
            hint="支持 .md / .txt / .html 文件"
            icon={<Sparkles className="w-8 h-8 text-secondary mx-auto mb-2" />}
            padding="p-6"
            isDragging={isDragging}
            selectedFile={selectedFile}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onInputChange={onFileInputChange}
          />

          {/* The chosen file wins, so it must be removable from here: before this the only way to change
              your mind was to pick a different file. */}
          {selectedFile && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="light"
                size="sm"
                startContent={<X className="w-3.5 h-3.5" />}
                onClick={onClearFile}
              >
                移除文件
              </Button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-default-200" />
            <span className="text-xs text-default-400">或粘贴文本内容</span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {/* Text paste area */}
          <Textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="在此粘贴简历文本内容..."
            variant="bordered"
            fullWidth
            className="min-h-[120px] !rounded-[1.5rem]"
          />

          {/* Saying which input will be used, because only one can be and the file wins. A user who
              pasted text *and* had a file selected used to get the file with no indication why. */}
          {selectedFile && pastedText.trim() && (
            <p className="mt-2 text-xs leading-relaxed text-default-400">
              本次将解析已选择的文件，下方文本不会生效。移除文件后即可改为解析文本。
            </p>
          )}

          {/* One button for both inputs, and it always goes through `onStartAI`: the two readings of
              "解析" must not be selected by which input happens to be filled. */}
          <div className="mt-4 flex justify-end">
            <Button
              color="primary"
              size="sm"
              startContent={<Sparkles className="w-4 h-4" />}
              isDisabled={!selectedFile && !pastedText.trim()}
              onClick={onStartAI}
            >
              AI 智能解析
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
