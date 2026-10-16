'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, ArrowLeft, Download } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { resumeMarkdownExport } from '@/lib/resume-builder';
import type { ResumeMetadataView } from '@/lib/resume-model';

interface ResumeSourceViewProps {
  markdown: string;
  /**
   * The resume's metadata, so the **download** can re-attach frontmatter (ticket 18).
   *
   * Optional because the builder (`ResumeBuilderPage`) also renders this view and has no
   * saved record yet — the draft's metadata is already in its own Markdown. When it is
   * absent the download falls back to the document as given.
   */
  metadata?: ResumeMetadataView;
  onBack: () => void;
}

export function ResumeSourceView({ markdown, metadata, onBack }: ResumeSourceViewProps) {
  const [copied, setCopied] = useState(false);

  // The document on the server is body-only by design (ADR-0003), so the on-screen source
  // shows exactly what is stored — including that it has no frontmatter. The **download**
  // is the portable artefact, and ADR-0003 requires it to carry valid YAML frontmatter, so
  // the metadata is re-attached from the columns there and only there.
  const exportText = metadata ? resumeMarkdownExport(metadata, markdown) : markdown;

  // Copy matches what the user is looking at (the stored document). Handing them different
  // text than the pane they just read is its own kind of lie, and the download button is
  // right beside it for the portable form.
  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple syntax highlighting for Markdown, in design tokens only.
  //
  // This used to use `text-purple-400` / `text-blue-400` / `text-cyan-400` /
  // `text-green-400` — cool hues that `AGENTS.md` bans outright (ticket 08). The
  // mapping below keeps each line class visually distinct using only sanctioned
  // tokens, and deliberately leans on weight as well as colour so it still reads
  // in a monochrome or low-vision context.
  const highlightedLines = markdown.split('\n').map((line, i) => {
    let className = 'text-foreground';

    if (line.startsWith('---')) {
      // Frontmatter fence.
      className = 'text-default-400';
    } else if (line.match(/^##\s/)) {
      className = 'text-primary font-semibold';
    } else if (line.match(/^###\s/)) {
      className = 'text-secondary font-medium';
    } else if (line.match(/^\*[^*]+\*$/)) {
      className = 'text-warning italic';
    } else if (line.match(/^[-*]\s/)) {
      className = 'text-success';
    } else if (line.match(/^[a-z_]+:/)) {
      // A frontmatter key.
      className = 'text-secondary';
    } else if (line.trim() === '') {
      className = 'text-transparent';
    }

    return { text: line, className, key: i };
  });

  return (
    <div className="max-w-4xl mx-auto px-6 pt-20 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-default-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-serif">源文件</h1>
            <p className="text-sm text-default-500">Markdown 格式</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="bordered"
            onClick={handleDownload}
            startContent={<Download className="w-4 h-4" />}
          >
            下载
          </Button>
          <Button
            variant="bordered"
            onClick={handleCopy}
            startContent={
              copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />
            }
          >
            {copied ? '已复制' : '复制'}
          </Button>
        </div>
      </div>

      {/* Source code view */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card variant="bordered" className="overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-default-200 bg-content2/30">
            <div className="w-3 h-3 rounded-full bg-danger/60" />
            <div className="w-3 h-3 rounded-full bg-warning/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
            <span className="ml-3 text-xs text-default-500">resume.md</span>
          </div>
          <div className="overflow-hidden">
            <pre className="p-5 text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
              <code>
                {highlightedLines.map(({ text, className, key }) => (
                  <div key={key} className="flex">
                    <span className="w-8 shrink-0 text-right pr-4 text-default-300 select-none text-xs leading-relaxed">
                      {key + 1}
                    </span>
                    <span className={`${className} break-all`}>
                      {text || '\u00A0'}
                    </span>
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
