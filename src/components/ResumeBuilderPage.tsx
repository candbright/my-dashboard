'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import type { ParsedResume } from '@/lib/resume-parser';
import type { ResumeTemplate } from '@/lib/resume-templates';
import { PageContainer } from '@/components/layout/PageContainer';
import { ResumeStartScreen } from '@/components/ResumeStartScreen';
import { ResumeSplitEditor } from '@/components/ResumeSplitEditor';

// ── Phase type ──
type Phase = 'start' | 'editor';

// ── Empty resume markdown ──
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

export function ResumeBuilderPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('start');
  const [markdown, setMarkdown] = useState('');
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Start screen handlers ──

  const handleStartWithFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      setMarkdown(text);
      setParsed(parseResumeMarkdown(text));
      setPhase('editor');
    } catch {
      setError('文件读取失败');
    }
  };

  const handleStartWithText = (text: string) => {
    setError(null);
    setMarkdown(text);
    setParsed(parseResumeMarkdown(text));
    setPhase('editor');
  };

  const handleStartWithTemplate = (template: ResumeTemplate) => {
    setError(null);
    const md = template.markdown;
    setMarkdown(md);
    setParsed(parseResumeMarkdown(md));
    setPhase('editor');
  };

  const handleStartBlank = () => {
    setError(null);
    const md = EMPTY_RESUME_MARKDOWN;
    setMarkdown(md);
    setParsed(parseResumeMarkdown(md));
    setPhase('editor');
  };

  const handleStartAI = async (input: File | string) => {
    setError(null);

    try {
      const formData = new FormData();
      if (input instanceof File) {
        formData.append('file', input);
      } else {
        formData.append('text', input);
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

      const md = await readSSEStream(res, () => {
        // Streaming updates are handled by the start screen's own loading state
        // if needed; the builder just waits for completion.
      });

      if (!md.trim()) throw new Error('AI 未返回有效内容');

      setMarkdown(md);
      setParsed(parseResumeMarkdown(md));
      setPhase('editor');
    } catch (err) {
      let message = 'AI 解析失败';
      if (err instanceof Error) {
        message = err.name === 'AbortError' ? 'AI 解析超时，请重试' : err.message;
      }
      setError(message);
    }
  };

  // ── Editor handlers ──

  const handleMarkdownChange = (md: string) => {
    setMarkdown(md);
    setParsed(parseResumeMarkdown(md));
  };

  const handleParsedChange = (newParsed: ParsedResume) => {
    setParsed(newParsed);
  };

  const handleSaveToServer = async () => {
    if (!markdown.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('content', markdown);
      formData.append('filename', 'resume.md');

      const res = await apiFetch('/api/resumes', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      router.push('/my');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

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

  const handleBack = () => {
    setPhase('start');
    setError(null);
  };

  // ── Render ──

  return (
    <PageContainer title="创建" titleAccent="简历">
      {phase === 'start' && (
        <ResumeStartScreen
          onStartWithFile={handleStartWithFile}
          onStartWithText={handleStartWithText}
          onStartWithTemplate={handleStartWithTemplate}
          onStartBlank={handleStartBlank}
          onStartAI={handleStartAI}
        />
      )}

      {phase === 'editor' && parsed && (
        <ResumeSplitEditor
          markdown={markdown}
          parsed={parsed}
          onMarkdownChange={handleMarkdownChange}
          onParsedChange={handleParsedChange}
          onSaveToServer={handleSaveToServer}
          onSaveLocal={handleSaveLocal}
          onBack={handleBack}
          saving={saving}
          error={error}
        />
      )}
    </PageContainer>
  );
}