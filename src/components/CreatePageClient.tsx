'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Plus, Sparkles, ArrowLeft, ArrowRight,
  Check, Loader2, Eye, Download,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import type { ParsedResume } from '@/lib/resume-parser';
import { Button, Card, CardBody, Spinner } from '@/components/ui';
import { PageContainer } from '@/components/layout/PageContainer';
import { ResumeEditor } from '@/components/ResumeEditor';
import { ResumeDisplay } from '@/components/ResumeDisplay';
import { TemplateSelector } from '@/components/TemplateSelector';
import type { ResumeRecord } from '@/lib/types';
import type { ResumeTemplate } from '@/lib/resume-templates';

type Step = 'choose' | 'template' | 'upload' | 'edit' | 'preview';
type UploadMode = 'standard' | 'ai';

// ── Upload Sub-step stages ──
type UploadStage = 'input' | 'parsing' | 'ready';

// Session key for AI chat in the upload flow
const AI_UPLOAD_SESSION_KEY = 'rv-create-ai-session';

// ── Helper: read SSE stream ──
async function readSSEStream(
  res: Response,
  onChunk: (text: string) => void
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('未收到响应流');

  const decoder = new TextDecoder();
  let text = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          text += parsed.content;
          onChunk(text);
        }
      } catch { /* skip */ }
    }
  }

  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        if (parsed.content) {
          text += parsed.content;
          onChunk(text);
        }
      } catch { /* skip */ }
    }
  }

  return text;
}

// ── Empty resume template ──
const EMPTY_RESUME_MARKDOWN = `---
name: 
title: 
email: 
phone: 
location: 
---

## 关于我
在此编写个人简介...

## 工作经历
### 职位名称 | 公司名称
*开始时间 - 结束时间*
- 工作描述

## 教育背景
### 学历 专业 | 学校名称
*开始年份 - 结束年份*
- 相关描述

## 技能
- 技能1, 技能2, 技能3
`;

export function CreatePageClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [markdown, setMarkdown] = useState('');
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplate | null>(null);

  // Upload sub-step state
  const [uploadMode, setUploadMode] = useState<UploadMode>('standard');
  const [uploadStage, setUploadStage] = useState<UploadStage>('input');
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedStreamText, setParsedStreamText] = useState('');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);

  // Check AI config
  useEffect(() => {
    apiFetch('/api/ai/config')
      .then((res) => res.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));
  }, []);

  // ── Step 1: Choose creation method ──

  const handleChooseUpload = () => {
    setStep('upload');
    setUploadStage('input');
  };

  const handleChooseTemplate = () => {
    setStep('template');
  };

  const handleSelectTemplate = (template: ResumeTemplate) => {
    setSelectedTemplate(template);
  };

  const handleConfirmTemplate = () => {
    if (!selectedTemplate) return;
    const md = selectedTemplate.markdown;
    setMarkdown(md);
    setParsed(parseResumeMarkdown(md));
    setStep('edit');
  };

  const handleChooseBlank = () => {
    const md = EMPTY_RESUME_MARKDOWN;
    setMarkdown(md);
    setParsed(parseResumeMarkdown(md));
    setStep('edit');
  };

  // ── Step 2a: Upload flow ──

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Standard .md upload
  const handleMdDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.md')) {
      setFile(droppedFile);
    } else {
      setError('请上传 .md（Markdown）格式的文件');
    }
  }, []);

  const handleMdFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.endsWith('.md')) {
      setFile(selectedFile);
    } else {
      setError('请上传 .md（Markdown）格式的文件');
    }
  }, []);

  /** Standard upload: read .md file content and go to edit step */
  const handleStandardUpload = async () => {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setMarkdown(text);
      setParsed(parseResumeMarkdown(text));
      setStep('edit');
    } catch {
      setError('文件读取失败');
    }
  };

  // AI upload
  const handleAiDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setInputMode('file');
    }
  }, []);

  const handleAiFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setInputMode('file');
    }
  }, []);

  const startAIParse = async () => {
    setError(null);
    setParsedStreamText('');
    setUploadStage('parsing');

    try {
      const formData = new FormData();
      if (inputMode === 'file' && file) {
        formData.append('file', file);
      } else if (inputMode === 'text' && pasteText.trim()) {
        formData.append('text', pasteText.trim());
      } else {
        throw new Error('请提供简历文件或文本内容');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      const res = await apiFetch('/api/ai/parse', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'AI 解析失败');
      }

      const md = await readSSEStream(res, (text) => {
        setParsedStreamText(text);
      });

      if (!md.trim()) throw new Error('AI 未返回有效内容');

      setMarkdown(md);
      setParsed(parseResumeMarkdown(md));
      setUploadStage('ready');
    } catch (err) {
      let message = 'AI 解析失败';
      if (err instanceof Error) {
        message = err.name === 'AbortError' ? 'AI 解析超时，请重试' : err.message;
      }
      setError(message);
      setUploadStage('input');
    }
  };

  const confirmAIResult = () => {
    setStep('edit');
  };

  // ── Step 2b: Edit ──
  const handleEditorSave = async (newMarkdown: string) => {
    setMarkdown(newMarkdown);
    setParsed(parseResumeMarkdown(newMarkdown));
    setStep('preview');
  };

  // Track content changes from editor
  const handleContentChange = useCallback((md: string) => {
    // Keep markdown in sync for preview
    setMarkdown(md);
  }, []);

  // ── Step 3: Preview ──
  const handleSaveResume = async () => {
    if (!markdown.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('content', markdown);
      formData.append('filename', file?.name || 'resume.md');

      const res = await apiFetch('/api/resumes', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      // Redirect to /my
      router.push('/my');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Save locally (download as .md file)
  const handleSaveLocal = () => {
    if (!markdown.trim()) return;
    const name = parsed?.frontmatter?.name || '简历';
    const filename = `${name}.md`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (mdFileInputRef.current) mdFileInputRef.current.value = '';
  };

  // ── Build a fake ResumeRecord for ResumeDisplay ──
  const fakeResume: ResumeRecord = {
    id: 'new',
    user_id: null,
    title: parsed?.frontmatter.name || '新简历',
    slug: 'new',
    filename: 'resume.md',
    name: parsed?.frontmatter.name || null,
    job_title: parsed?.frontmatter.title || null,
    email: parsed?.frontmatter.email || null,
    phone: parsed?.frontmatter.phone || null,
    location: parsed?.frontmatter.location || null,
    website: parsed?.frontmatter.website || null,
    github: parsed?.frontmatter.github || null,
    linkedin: parsed?.frontmatter.linkedin || null,
    avatar: parsed?.frontmatter.avatar || null,
    summary: null,
    visibility: 'private',
    approval_status: 'draft',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // ── Step indicator ──
  const steps = [
    { key: 'choose', label: '选择方式' },
    { key: 'edit', label: '编辑内容' },
    { key: 'preview', label: '预览确认' },
  ];

  const currentStepIdx = step === 'choose' || step === 'upload' || step === 'template' ? 0 : step === 'edit' ? 1 : 2;

  return (
    <PageContainer title="创建" titleAccent="简历">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              i < currentStepIdx
                ? 'bg-success/10 text-success'
                : i === currentStepIdx
                  ? 'bg-primary/10 text-primary'
                  : 'bg-default-100 text-default-400'
            }`}>
              {i < currentStepIdx ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold border-current">
                  {i + 1}
                </span>
              )}
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px transition-colors duration-300 ${
                i < currentStepIdx ? 'bg-success' : 'bg-default-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ────────── Step 1: Choose ────────── */}
        {step === 'choose' && (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-2xl mx-auto"
          >
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold mb-2">选择创建方式</h2>
              <p className="text-default-500 text-sm">上传已有简历、选择模板或从空白开始</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Upload option */}
              <motion.button
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleChooseUpload}
                className="group bg-content1 border border-default-200 rounded-2xl p-8 text-left hover:border-primary hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">上传简历</h3>
                <p className="text-sm text-default-500 leading-relaxed">
                  上传已有的简历文件，支持 Markdown 直传或 AI 智能解析
                </p>
              </motion.button>

              {/* Template option */}
              <motion.button
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleChooseTemplate}
                className="group bg-content1 border border-default-200 rounded-2xl p-8 text-left hover:border-secondary hover:shadow-lg hover:shadow-secondary/5 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mb-5 group-hover:bg-secondary/20 transition-colors">
                  <FileText className="w-7 h-7 text-secondary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">选择模板</h3>
                <p className="text-sm text-default-500 leading-relaxed">
                  从专业模板开始，涵盖程序员、法律、金融等行业
                </p>
              </motion.button>

              {/* Blank option */}
              <motion.button
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleChooseBlank}
                className="group bg-content1 border border-default-200 rounded-2xl p-8 text-left hover:border-success hover:shadow-lg hover:shadow-success/5 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mb-5 group-hover:bg-success/20 transition-colors">
                  <Plus className="w-7 h-7 text-success" />
                </div>
                <h3 className="text-lg font-semibold mb-2">空白创建</h3>
                <p className="text-sm text-default-500 leading-relaxed">
                  从空白模板开始，自由编辑
                </p>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ────────── Step 1.5a: Template selection ────────── */}
        {step === 'template' && (
          <motion.div
            key="template"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-4xl mx-auto"
          >
            <button
              onClick={() => { setStep('choose'); setSelectedTemplate(null); }}
              className="flex items-center gap-1.5 text-sm text-default-500 hover:text-primary transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              返回选择
            </button>

            <div className="text-center mb-5">
              <h2 className="text-xl font-semibold mb-2">选择简历模板</h2>
              <p className="text-default-500 text-sm">选择一个适合你行业的模板，快速开始</p>
            </div>

            <div className="flex justify-center mb-5">
              <Button
                color="primary"
                size="lg"
                onClick={handleConfirmTemplate}
                isDisabled={!selectedTemplate}
                startContent={<ArrowRight className="w-4 h-4" />}
              >
                使用此模板
              </Button>
            </div>

            <TemplateSelector
              onSelect={handleSelectTemplate}
              selectedId={selectedTemplate?.id}
            />
          </motion.div>
        )}

        {/* ────────── Step 1.5: Upload sub-flow ────────── */}
        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-2xl mx-auto"
          >
            {/* Back to choose */}
            <button
              onClick={() => { setStep('choose'); setUploadStage('input'); setFile(null); setPasteText(''); setError(null); setParsedStreamText(''); }}
              className="flex items-center gap-1.5 text-sm text-default-500 hover:text-primary transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              返回选择
            </button>

            {/* Upload mode tabs */}
            <div className="flex gap-2 mb-6">
              <Button
                variant={uploadMode === 'standard' ? 'solid' : 'flat'}
                color={uploadMode === 'standard' ? 'primary' : 'default'}
                className="flex-1"
                onClick={() => { setUploadMode('standard'); setFile(null); setError(null); setParsedStreamText(''); setUploadStage('input'); }}
                startContent={<FileText className="w-4 h-4" />}
              >
                标准上传
              </Button>
              <Button
                variant={uploadMode === 'ai' ? 'solid' : 'flat'}
                color={uploadMode === 'ai' ? 'primary' : 'default'}
                className="flex-1"
                onClick={() => { setUploadMode('ai'); setFile(null); setError(null); setParsedStreamText(''); setUploadStage('input'); }}
                startContent={<Sparkles className="w-4 h-4" />}
              >
                AI 解析
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {/* ── Standard Upload ── */}
              {uploadMode === 'standard' && (
                <motion.div key="std" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {!file ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleMdDrop}
                      onClick={() => mdFileInputRef.current?.click()}
                      className={`cursor-pointer border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300
                        ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-default-300 hover:border-primary hover:bg-primary/5'}
                      `}
                    >
                      <input ref={mdFileInputRef} type="file" accept=".md" onChange={handleMdFileSelect} className="hidden" />
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-default-100 flex items-center justify-center">
                          <Upload className="w-7 h-7 text-default-500" />
                        </div>
                        <div>
                          <p className="text-lg font-medium mb-1">
                            {isDragging ? '松开鼠标即可上传' : '将简历文件拖拽到这里'}
                          </p>
                          <p className="text-sm text-default-500">或点击选择文件 — 支持 .md 格式</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-default-200 rounded-2xl p-6">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.name}</p>
                          <p className="text-sm text-default-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button onClick={removeFile} className="p-2 rounded-lg hover:bg-default-100 transition-colors">
                          <span className="text-default-500">✕</span>
                        </button>
                      </div>
                      <Button color="primary" className="w-full" size="lg" onClick={handleStandardUpload}
                        startContent={<ArrowRight className="w-4 h-4" />}>
                        继续编辑
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── AI Upload ── */}
              {uploadMode === 'ai' && (
                <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {aiConfigured === false && (
                    <Card variant="bordered" className="p-8 border-warning/30 bg-warning/5 text-center">
                      <h3 className="text-lg font-semibold mb-2">需要配置 API Key</h3>
                      <p className="text-sm text-default-500 mb-5">AI 解析功能需要先在管理后台完成 AI 配置。</p>
                    </Card>
                  )}

                  {aiConfigured === null && (
                    <div className="flex justify-center py-12"><Spinner size="md" /></div>
                  )}

                  {aiConfigured && uploadStage === 'input' && (
                    <>
                      {/* File/text mode toggle */}
                      <div className="flex gap-2 mb-5">
                        <Button variant={inputMode === 'file' ? 'solid' : 'flat'} color={inputMode === 'file' ? 'primary' : 'default'}
                          className="flex-1" onClick={() => setInputMode('file')} startContent={<FileText className="w-4 h-4" />}>
                          上传文件
                        </Button>
                        <Button variant={inputMode === 'text' ? 'solid' : 'flat'} color={inputMode === 'text' ? 'primary' : 'default'}
                          className="flex-1" onClick={() => setInputMode('text')} startContent={<FileText className="w-4 h-4" />}>
                          粘贴文本
                        </Button>
                      </div>

                      {inputMode === 'file' ? (
                        !file ? (
                          <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleAiDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`cursor-pointer border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300
                              ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-default-300 hover:border-primary hover:bg-primary/5'}`}>
                            <input ref={fileInputRef} type="file" accept=".md,.txt,.text,.html,.htm,.json,.csv,.xml,.rtf" onChange={handleAiFileSelect} className="hidden" />
                            <div className="flex flex-col items-center gap-4">
                              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center opacity-80">
                                <Sparkles className="w-7 h-7 text-white" />
                              </div>
                              <div>
                                <p className="text-lg font-medium mb-1">{isDragging ? '松开即可上传' : '拖拽简历文件到这里'}</p>
                                <p className="text-sm text-default-500">支持 .md、.txt、.html 等文本格式</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-default-200 rounded-2xl p-5">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{file.name}</p>
                                <p className="text-sm text-default-500">{(file.size / 1024).toFixed(1)} KB</p>
                              </div>
                              <button onClick={removeFile} className="p-2 rounded-lg hover:bg-default-100 transition-colors">
                                <span className="text-default-500">✕</span>
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                        <textarea
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          placeholder="将简历内容粘贴到这里，支持任意格式，AI 会自动识别并转换。"
                          rows={10}
                          className="w-full px-4 py-3 rounded-2xl border border-default-200 bg-content1 text-sm
                            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                            placeholder:text-default-400 resize-none font-mono leading-relaxed"
                        />
                      )}

                      <Button color="primary" size="lg" className="w-full mt-5" onClick={startAIParse}
                        isDisabled={inputMode === 'file' ? !file : !pasteText.trim()}
                        startContent={<Sparkles className="w-4 h-4" />}>
                        AI 智能解析
                      </Button>
                      <p className="text-xs text-default-400 text-center mt-3">
                        使用 AI 解析，每次约消耗 0.01-0.05 元
                      </p>
                    </>
                  )}

                  {aiConfigured && uploadStage === 'parsing' && (
                    <div>
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">AI 正在解析简历...</p>
                          <p className="text-sm text-default-500">正在将内容转换为标准简历格式</p>
                        </div>
                      </div>
                      <Card variant="bordered" className="p-5 max-h-[500px] overflow-y-auto">
                        <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                          {parsedStreamText || '等待 AI 响应...'}
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        </pre>
                      </Card>
                    </div>
                  )}

                  {aiConfigured && uploadStage === 'ready' && (
                    <div>
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                          <Check className="w-4 h-4 text-success" />
                        </div>
                        <div>
                          <p className="font-medium">解析完成</p>
                          <p className="text-sm text-default-500">确认后进入编辑器调整内容</p>
                        </div>
                      </div>
                      <Card variant="bordered" className="p-5 max-h-[400px] overflow-y-auto mb-5">
                        <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                          {markdown}
                        </pre>
                      </Card>
                      <div className="flex gap-3">
                        <Button variant="bordered" onClick={() => { setUploadStage('input'); setFile(null); setPasteText(''); setError(null); }}
                          startContent={<ArrowLeft className="w-4 h-4" />}>
                          重新解析
                        </Button>
                        <Button color="primary" className="flex-1" size="lg" onClick={confirmAIResult}
                          startContent={<ArrowRight className="w-4 h-4" />}>
                          继续编辑
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ────────── Step 2: Edit ────────── */}
        {step === 'edit' && parsed && (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <ResumeEditor
              parsed={parsed}
              onSave={handleEditorSave}
              onCancel={() => setStep('choose')}
              headerTitle="编辑"
              headerSubtitle="编辑各模块内容，添加或删除模块"
              saveLabel="下一步：预览"
              cancelLabel="上一步"
              enableAI={true}
              onContentChange={handleContentChange}
              hideHeader
              hideBottomBar
            />
          </motion.div>
        )}

        {/* ────────── Step 3: Preview ────────── */}
        {step === 'preview' && parsed && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Resume display (same as detail page) */}
            <ResumeDisplay resume={fakeResume} parsed={parsed} hideBackButton />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating bottom-right navigation bar ── */}
      {(step === 'edit' || step === 'preview') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 shadow-xl border border-default-200">
            <Button
              variant="light"
              size="sm"
              onClick={() => {
                if (step === 'edit') {
                  setStep('choose');
                } else {
                  setParsed(parseResumeMarkdown(markdown));
                  setStep('edit');
                }
              }}
              startContent={<ArrowLeft className="w-4 h-4" />}
            >
              上一步
            </Button>
            <div className="w-px h-5 bg-default-200" />
            {step === 'edit' && (
              <Button
                color="primary"
                size="sm"
                onClick={async () => {
                  // Sync markdown and go to preview
                  setParsed(parseResumeMarkdown(markdown));
                  setStep('preview');
                }}
                startContent={<Eye className="w-4 h-4" />}
              >
                下一步：预览
              </Button>
            )}
            {step === 'preview' && (
              <>
                <Button
                  variant="bordered"
                  size="sm"
                  onClick={handleSaveLocal}
                  startContent={<Download className="w-4 h-4" />}
                >
                  保存到本地
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  onClick={handleSaveResume}
                  isLoading={saving}
                  startContent={!saving ? <Check className="w-4 h-4" /> : undefined}
                >
                  保存到服务器
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex items-center gap-2 text-sm text-danger p-3 rounded-xl bg-danger/10 max-w-2xl mx-auto"
        >
          {error}
        </motion.div>
      )}
    </PageContainer>
  );
}
