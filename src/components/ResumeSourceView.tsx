'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, ArrowLeft, Download } from 'lucide-react';

interface ResumeSourceViewProps {
  markdown: string;
  onBack: () => void;
}

export function ResumeSourceView({ markdown, onBack }: ResumeSourceViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple syntax highlighting for Markdown
  const highlightedLines = markdown.split('\n').map((line, i) => {
    let className = 'text-[var(--foreground)]';
    let prefix = '';

    if (line.startsWith('---')) {
      className = 'text-purple-400';
    } else if (line.match(/^##\s/)) {
      className = 'text-blue-400 font-semibold';
    } else if (line.match(/^###\s/)) {
      className = 'text-cyan-400 font-medium';
    } else if (line.match(/^\*[^*]+\*$/)) {
      className = 'text-amber-400 italic';
    } else if (line.match(/^[-*]\s/)) {
      className = 'text-green-400';
      prefix = '';
    } else if (line.match(/^[a-z_]+:/)) {
      className = 'text-orange-400';
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
            className="p-2 rounded-xl hover:bg-[var(--muted)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">源文件</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Markdown 格式</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
          >
            <Download className="w-4 h-4" />
            下载
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制
              </>
            )}
          </button>
        </div>
      </div>

      {/* Source code view */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
          <span className="ml-3 text-xs text-[var(--muted-foreground)]">resume.md</span>
        </div>
        <div className="overflow-hidden">
          <pre className="p-5 text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
            <code>
              {highlightedLines.map(({ text, className, key }) => (
                <div key={key} className="flex">
                  <span className="w-8 shrink-0 text-right pr-4 text-[var(--muted-foreground)]/50 select-none text-xs leading-relaxed">
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
      </motion.div>
    </div>
  );
}
