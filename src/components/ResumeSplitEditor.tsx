'use client';

/**
 * Step 3 of the creation wizard: 编辑内容 (ticket 48).
 *
 * Two things changed from the editor this screen used to be, and they are the ticket's third and fourth
 * acceptance criteria:
 *
 *   - **The preview renders the chosen template.** It used to render `ResumeDisplay`, the parsed-document
 *     view, which has no template on it at all — so choosing 绿野通栏 in step 1 and then opening 预览
 *     showed a plain document, and the only honest reading was "my choice did nothing". It is now
 *     `ResumeTemplatePreview`: the real renderer, paginated into A4 sheets.
 *   - **The style is reachable from here.** 更换模板 goes back to step 1 without touching the document or
 *     the metadata, which is what makes "you can change it later" true rather than a round trip through
 *     two 返回 buttons.
 *
 * The editor half is untouched: the same `ResumeEditor`, the same metadata form, the same
 * 下载到本地 / 保存 actions and the same error banner. The mobile 编辑/预览 toggle stays because a
 * 794px sheet next to a textarea is not a layout any phone can show.
 *
 * # Why the preview is allowed to show values the user did not type
 *
 * A blank resume has no name and no contact details, and a template's header treatment is only visible if
 * there is one to draw. `ResumeTemplatePreview` therefore fills the *empty* text fields with the form's
 * own placeholders — and only for the preview. The saved document is built from `metadataValues` as
 * typed, which is the paragraph below the heading's promise: 保存后以你填写的内容为准.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Edit3, Save, Download, ArrowLeft, AlertCircle, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui';
import { WizardActionBar } from '@/components/WizardActionBar';
import { cn } from '@/lib/cn';
import { ResumeEditor } from '@/components/ResumeEditor';
import { ResumeTemplatePreview } from '@/components/ResumeTemplatePreview';
import { creationTemplate } from '@/lib/resume-creation';
import type { ParsedResume } from '@/lib/resume-model';
import type { ResumePresentation } from '@/lib/resume-presentation';
import type { MetadataKey, ResumeMetadataValues } from '@/lib/resume-metadata';

interface ResumeSplitEditorProps {
  markdown: string;
  parsed: ParsedResume;
  onMarkdownChange: (md: string) => void;
  onParsedChange: (parsed: ParsedResume) => void;
  /**
   * Draft metadata, owned by the create page. There is no resume id yet, so the
   * form cannot PATCH columns; these values live in memory until first save.
   */
  metadataValues: ResumeMetadataValues;
  onMetadataChange: (key: MetadataKey, value: string) => void;
  /** The 展示态 chosen in step 1 — what the preview renders and what the create sends. */
  presentation: ResumePresentation;
  /** Returns to step 1, keeping the document and the metadata. */
  onChangeStyle: () => void;
  onSaveToServer: () => Promise<void>;
  onSaveLocal: () => void;
  onBack: () => void;
  saving?: boolean;
  error?: string | null;
}

export function ResumeSplitEditor({
  markdown,
  parsed,
  onMarkdownChange,
  onParsedChange,
  metadataValues,
  onMetadataChange,
  presentation,
  onChangeStyle,
  onSaveToServer,
  onSaveLocal,
  onBack,
  saving = false,
  error = null,
}: ResumeSplitEditorProps) {
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');

  const templateName = creationTemplate(presentation.template).name;

  return (
    <div className="bg-background">
      {/* Editor / Preview toggle */}
      <div className="sticky top-0 z-30 bg-content1/95 backdrop-blur-md px-4 py-2">
        <div className="flex gap-1 bg-default-100 rounded-full p-1">
          <button
            onClick={() => setMobileView('editor')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-colors duration-500',
              mobileView === 'editor'
                ? 'bg-content1 text-primary shadow-sm'
                : 'text-default-500 hover:text-foreground'
            )}
          >
            <Edit3 className="w-4 h-4" />
            编辑
          </button>
          <button
            onClick={() => setMobileView('preview')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-colors duration-500',
              mobileView === 'preview'
                ? 'bg-content1 text-primary shadow-sm'
                : 'text-default-500 hover:text-foreground'
            )}
          >
            <Eye className="w-4 h-4" />
            预览
          </button>
        </div>
      </div>

      {/* Single-panel toggle layout — all screen sizes */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        {mobileView === 'editor' && (
          <motion.div
            key="editor"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <ResumeEditor
              parsed={parsed}
              onContentChange={(md) => onMarkdownChange(md)}
              onSave={async (md) => { onMarkdownChange(md); }}
              onCancel={() => {}}
              hideHeader={true}
              hideBottomBar={true}
              enableAI={true}
              metadataValues={metadataValues}
              onMetadataChange={onMetadataChange}
            />
          </motion.div>
        )}
        {mobileView === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-default-500 leading-relaxed">
                预览按<strong className="font-medium text-foreground">{templateName}</strong>
                模板渲染；空着的基本信息用示例文字占位，保存后以你填写的内容为准。
              </p>
              <Button
                variant="light"
                size="sm"
                startContent={<LayoutTemplate className="w-3.5 h-3.5" />}
                onClick={onChangeStyle}
              >
                更换模板
              </Button>
            </div>

            {/* A 794px sheet does not fit a phone. `min-w-fit` + `mx-auto` rather than a scaled sheet:
                scaling would change where the lines break, and the whole point of the preview is that it
                breaks them where the PDF does. So it scrolls sideways instead. */}
            <div className="overflow-x-auto">
              <div className="mx-auto w-fit">
                <ResumeTemplatePreview
                  markdown={markdown}
                  metadataValues={metadataValues}
                  presentation={presentation}
                />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="fixed bottom-20 left-4 right-4 lg:left-auto lg:right-6 lg:bottom-20 lg:w-auto z-40">
          <div className="max-w-7xl mx-auto lg:px-6">
            <div className="rounded-[2rem] bg-danger/10 text-danger text-sm p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}

      <WizardActionBar
        left={
          <Button
            variant="light"
            size="sm"
            startContent={<ArrowLeft className="w-4 h-4" />}
            onClick={onBack}
            data-step-back="editor"
          >
            上一步
          </Button>
        }
        right={
          <>
            <Button
              variant="bordered"
              size="sm"
              startContent={<Download className="w-4 h-4" />}
              onClick={onSaveLocal}
            >
              下载到本地
            </Button>
            <Button
              color="primary"
              size="sm"
              isLoading={saving}
              startContent={!saving ? <Save className="w-4 h-4" /> : undefined}
              onClick={onSaveToServer}
            >
              保存
            </Button>
          </>
        }
      />
    </div>
  );
}
