'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Plus, Sparkles, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { Textarea } from '@/components/ui';
import { TemplateSelector } from '@/components/TemplateSelector';
import { cn } from '@/lib/cn';
import type { ResumeTemplate } from '@/lib/resume-templates';

interface ResumeStartScreenProps {
  onStartWithFile: (file: File) => void;
  onStartWithText: (text: string) => void;
  onStartWithTemplate: (template: ResumeTemplate) => void;
  onStartBlank: () => void;
  onStartAI: (input: File | string) => void;
}

type ExpandedView = 'upload' | 'template' | null;
type UploadMode = 'standard' | 'ai';

export function ResumeStartScreen({
  onStartWithFile,
  onStartWithText,
  onStartWithTemplate,
  onStartBlank,
  onStartAI,
}: ResumeStartScreenProps) {
  const [expanded, setExpanded] = useState<ExpandedView>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('standard');
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplate | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ──

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
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

  const handleStartAI = useCallback(() => {
    if (selectedFile) {
      onStartAI(selectedFile);
    } else if (pastedText.trim()) {
      onStartAI(pastedText.trim());
    }
  }, [selectedFile, pastedText, onStartAI]);

  const handleStartWithText = useCallback(() => {
    if (pastedText.trim()) {
      onStartWithText(pastedText.trim());
    }
  }, [pastedText, onStartWithText]);

  const handleTemplateSelect = useCallback((template: ResumeTemplate) => {
    setSelectedTemplate(template);
  }, []);

  const handleUseTemplate = useCallback(() => {
    if (selectedTemplate) {
      onStartWithTemplate(selectedTemplate);
    }
  }, [selectedTemplate, onStartWithTemplate]);

  const collapse = useCallback(() => {
    setExpanded(null);
    setSelectedFile(null);
    setPastedText('');
    setSelectedTemplate(null);
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

  const cards = [
    {
      key: 'upload' as const,
      icon: Upload,
      title: '上传文件',
      description: '上传 Markdown 文件，快速开始编辑',
    },
    {
      key: 'template' as const,
      icon: FileText,
      title: '选择模板',
      description: '从预设模板中选择，快速填充内容',
    },
    {
      key: 'blank' as const,
      icon: Plus,
      title: '空白创建',
      description: '从空白简历开始，自由发挥',
    },
  ];

  // ── Render ──

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className="text-center mb-10"
      >
        <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">
          创建<span className="gradient-text">简历</span>
        </h1>
        <p className="text-default-500 mt-2 text-sm">选择一种方式开始</p>
      </motion.div>

      {/* Expanded view or card grid */}
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
              <UploadExpanded
                uploadMode={uploadMode}
                setUploadMode={setUploadMode}
                isDragging={isDragging}
                selectedFile={selectedFile}
                pastedText={pastedText}
                setPastedText={setPastedText}
                fileInputRef={fileInputRef}
                aiFileInputRef={aiFileInputRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileInputChange={handleFileInputChange}
                onStartStandard={handleStartStandard}
                onStartAI={handleStartAI}
                onStartWithText={handleStartWithText}
                onBack={collapse}
              />
            )}

            {expanded === 'template' && (
              <TemplateExpanded
                selectedTemplate={selectedTemplate}
                onSelectTemplate={handleTemplateSelect}
                onUseTemplate={handleUseTemplate}
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
            className="grid grid-cols-1 md:grid-cols-3 gap-5"
          >
            {cards.map((card, index) => (
              <motion.button
                key={card.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.1 + index * 0.1,
                  ease: [0.25, 0.4, 0.25, 1],
                }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (card.key === 'blank') {
                    onStartBlank();
                  } else {
                    setExpanded(card.key);
                  }
                }}
                className={cn(
                  'rounded-[2rem] bg-content1 border border-default-200 p-6',
                  'cursor-pointer text-left',
                  'transition-colors duration-500 ease-in-out',
                  'hover:border-primary hover:bg-content2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                )}
              >
                {/* Icon container */}
                <div className="w-14 h-14 rounded-[2rem] bg-secondary/10 flex items-center justify-center mb-4">
                  <card.icon className="w-6 h-6 text-secondary" />
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {card.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-default-500 leading-relaxed">
                  {card.description}
                </p>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Upload Expanded View
// ─────────────────────────────────────────────────────

interface UploadExpandedProps {
  uploadMode: UploadMode;
  setUploadMode: (mode: UploadMode) => void;
  isDragging: boolean;
  selectedFile: File | null;
  pastedText: string;
  setPastedText: (text: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  aiFileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onStartStandard: () => void;
  onStartAI: () => void;
  onStartWithText: () => void;
  onBack: () => void;
}

function UploadExpanded({
  uploadMode,
  setUploadMode,
  isDragging,
  selectedFile,
  pastedText,
  setPastedText,
  fileInputRef,
  aiFileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInputChange,
  onStartStandard,
  onStartAI,
  onStartWithText,
  onBack,
}: UploadExpandedProps) {
  return (
    <div className="rounded-[2rem] bg-content1 border border-default-200 p-6">
      {/* Back link */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-default-500 hover:text-foreground transition-colors duration-500 mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={uploadMode === 'standard' ? 'solid' : 'flat'}
          color={uploadMode === 'standard' ? 'primary' : 'default'}
          size="sm"
          onClick={() => setUploadMode('standard')}
        >
          标准上传
        </Button>
        <Button
          variant={uploadMode === 'ai' ? 'solid' : 'flat'}
          color={uploadMode === 'ai' ? 'primary' : 'default'}
          size="sm"
          startContent={<Sparkles className="w-3.5 h-3.5" />}
          onClick={() => setUploadMode('ai')}
        >
          AI 解析
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {uploadMode === 'standard' ? (
          <motion.div
            key="standard"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
          >
            {/* Standard upload dropzone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'rounded-[2rem] border-2 border-dashed p-8 text-center cursor-pointer',
                'transition-colors duration-500 ease-in-out',
                isDragging
                  ? 'border-secondary bg-secondary/5'
                  : 'border-default-300 hover:border-primary/50 hover:bg-content2'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt"
                className="hidden"
                onChange={onFileInputChange}
              />
              <Upload className="w-8 h-8 text-default-400 mx-auto mb-3" />
              <p className="text-sm text-default-500">
                {selectedFile
                  ? selectedFile.name
                  : '拖拽文件到此处，或点击选择文件'}
              </p>
              {!selectedFile && (
                <p className="text-xs text-default-400 mt-1">
                  支持 .md 文件
                </p>
              )}
            </div>

            {/* Action button */}
            {selectedFile && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-4 flex items-center justify-between"
              >
                <span className="text-sm text-default-500 truncate mr-4">
                  {selectedFile.name}
                </span>
                <Button
                  color="primary"
                  size="sm"
                  onClick={onStartStandard}
                >
                  开始编辑
                </Button>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="ai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
          >
            {/* AI upload dropzone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => aiFileInputRef.current?.click()}
              className={cn(
                'rounded-[2rem] border-2 border-dashed p-6 text-center cursor-pointer',
                'transition-colors duration-500 ease-in-out',
                isDragging
                  ? 'border-secondary bg-secondary/5'
                  : 'border-default-300 hover:border-primary/50 hover:bg-content2'
              )}
            >
              <input
                ref={aiFileInputRef}
                type="file"
                accept=".md,.txt,.html"
                className="hidden"
                onChange={onFileInputChange}
              />
              <Sparkles className="w-8 h-8 text-secondary mx-auto mb-2" />
              <p className="text-sm text-default-500">
                {selectedFile
                  ? selectedFile.name
                  : '拖拽文件到此处，或点击选择文件'}
              </p>
              {!selectedFile && (
                <p className="text-xs text-default-400 mt-1">
                  支持 .md / .txt / .html 文件
                </p>
              )}
            </div>

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

            {/* AI action button */}
            <div className="mt-4 flex justify-end">
              <Button
                color="primary"
                size="sm"
                startContent={<Sparkles className="w-4 h-4" />}
                isDisabled={!selectedFile && !pastedText.trim()}
                onClick={selectedFile ? onStartAI : onStartWithText}
              >
                AI 智能解析
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Template Expanded View
// ─────────────────────────────────────────────────────

interface TemplateExpandedProps {
  selectedTemplate: ResumeTemplate | null;
  onSelectTemplate: (template: ResumeTemplate) => void;
  onUseTemplate: () => void;
  onBack: () => void;
}

function TemplateExpanded({
  selectedTemplate,
  onSelectTemplate,
  onUseTemplate,
  onBack,
}: TemplateExpandedProps) {
  return (
    <div className="rounded-[2rem] bg-content1 border border-default-200 p-6">
      {/* Back link */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-default-500 hover:text-foreground transition-colors duration-500 mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      {/* Template selector */}
      <TemplateSelector
        onSelect={onSelectTemplate}
        selectedId={selectedTemplate?.id}
      />

      {/* Use template button */}
      <div className="mt-6 flex justify-end">
        <Button
          color="primary"
          isDisabled={!selectedTemplate}
          onClick={onUseTemplate}
        >
          使用此模板
        </Button>
      </div>
    </div>
  );
}