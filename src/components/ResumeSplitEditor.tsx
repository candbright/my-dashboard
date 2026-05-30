'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Edit3, Save, Download, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ResumeEditor } from '@/components/ResumeEditor';
import { ResumeDisplay } from '@/components/ResumeDisplay';
import type { ParsedResume } from '@/lib/resume-parser';
import type { ResumeRecord } from '@/lib/types';

interface ResumeSplitEditorProps {
  markdown: string;
  parsed: ParsedResume;
  onMarkdownChange: (md: string) => void;
  onParsedChange: (parsed: ParsedResume) => void;
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
  onSaveToServer,
  onSaveLocal,
  onBack,
  saving = false,
  error = null,
}: ResumeSplitEditorProps) {
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');

  // Build a fake ResumeRecord from parsed frontmatter for the preview
  const fakeResume: ResumeRecord = {
    id: 'preview',
    user_id: null,
    title: parsed.frontmatter?.name || '新简历',
    slug: 'preview',
    filename: 'preview.md',
    visibility: 'private',
    approval_status: 'draft',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    created_at: '',
    updated_at: '',
    name: parsed.frontmatter?.name || null,
    job_title: parsed.frontmatter?.title || null,
    email: parsed.frontmatter?.email || null,
    phone: parsed.frontmatter?.phone || null,
    location: parsed.frontmatter?.location || null,
    website: parsed.frontmatter?.website || null,
    github: parsed.frontmatter?.github || null,
    linkedin: parsed.frontmatter?.linkedin || null,
    avatar: parsed.frontmatter?.avatar || null,
    summary: null,
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Editor / Preview toggle */}
      <div className="sticky top-0 z-30 bg-content1/95 backdrop-blur-md border-b border-default-200 px-4 py-2">
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
            <ResumeDisplay
              resume={fakeResume}
              parsed={parsed}
              hideBackButton={true}
              hideFooter={true}
            />
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

      {/* Bottom floating action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-content1/95 backdrop-blur-md border-t border-default-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Button
            variant="light"
            size="sm"
            startContent={<ArrowLeft className="w-4 h-4" />}
            onClick={onBack}
          >
            返回
          </Button>

          <div className="flex items-center gap-3">
            <Button
              variant="bordered"
              size="sm"
              startContent={<Download className="w-4 h-4" />}
              onClick={onSaveLocal}
            >
              保存到本地
            </Button>
            <Button
              color="primary"
              size="sm"
              isLoading={saving}
              startContent={!saving ? <Save className="w-4 h-4" /> : undefined}
              onClick={onSaveToServer}
            >
              保存到平台
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}