'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Upload, FileText, X, Check, Loader2,
  AlertCircle, Eye, EyeOff, Settings, ClipboardPaste,
  Send, MessageSquare, RotateCcw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { Button, Spinner, Card } from '@/components/ui';
import Link from 'next/link';

type Stage = 'input' | 'parsing' | 'preview' | 'saving' | 'done';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface HistoryEntry {
  id: string;
  version: number;
  markdown: string;
  userPrompt: string;
  msgId: string;
  timestamp: number;
}

interface SavedSession {
  parsedMarkdown: string;
  chatMessages: ChatMsg[];
  history: HistoryEntry[];
  fileName: string | null;
}

const SESSION_KEY = 'rv-ai-session';

type DiffLineType = 'added' | 'removed' | 'unchanged';
interface DiffLine { type: DiffLineType; content: string }

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length, n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const diff: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: 'unchanged', content: oldLines[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', content: newLines[j - 1] }); j--;
    } else {
      diff.unshift({ type: 'removed', content: oldLines[i - 1] }); i--;
    }
  }
  return diff;
}

export function AIUpload() {
  const [stage, setStage] = useState<Stage>('input');
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedMarkdown, setParsedMarkdown] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Version history
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [restoredSession, setRestoredSession] = useState(false);

  // Restore saved session on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved: SavedSession = JSON.parse(raw);
        if (saved.parsedMarkdown) {
          setParsedMarkdown(saved.parsedMarkdown);
          setChatMessages(saved.chatMessages?.map(m => ({ ...m, isStreaming: false })) || []);
          setHistory(saved.history || []);
          setStage('preview');
          setRestoredSession(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-save session when in preview stage
  useEffect(() => {
    if (stage === 'preview' && parsedMarkdown) {
      try {
        const session: SavedSession = {
          parsedMarkdown,
          chatMessages: chatMessages.map(m => ({ ...m, isStreaming: false })),
          history,
          fileName: file?.name || null,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch { /* ignore */ }
    }
  }, [stage, parsedMarkdown, chatMessages, history, file]);

  const clearSession = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  };

  // Check AI config status
  useState(() => {
    apiFetch('/api/ai/config')
      .then((res) => res.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));
  });

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setInputMode('file');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setInputMode('file');
    }
  }, []);

  const removeFile = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper: read SSE stream and return collected markdown
  const readSSEStream = async (
    res: Response,
    onChunk: (markdown: string) => void
  ): Promise<string> => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error('未收到响应流');

    const decoder = new TextDecoder();
    let markdown = '';
    let buffer = '';
    const IDLE_TIMEOUT = 60_000; // 60s no-data timeout
    let lastDataTime = Date.now();

    while (true) {
      // Race between reading and timeout
      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) => {
        const check = () => {
          if (Date.now() - lastDataTime > IDLE_TIMEOUT) {
            reader.cancel();
            reject(new Error('AI 响应超时，请重试'));
          }
        };
        setTimeout(check, IDLE_TIMEOUT);
      });

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([readPromise, timeoutPromise]);
      } catch (err) {
        throw err;
      }

      if (result.done) break;

      lastDataTime = Date.now();
      buffer += decoder.decode(result.value, { stream: true });

      // Split by double newline (SSE event boundary) or single newline
      const lines = buffer.split('\n');
      // Keep last potentially incomplete line
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            markdown += parsed.content;
            onChunk(markdown);
          }
        } catch {
          // Skip malformed JSON (partial line already handled by buffer)
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.content) {
            markdown += parsed.content;
            onChunk(markdown);
          }
        } catch { /* skip */ }
      }
    }

    return markdown;
  };

  const startAIParse = async () => {
    setError(null);
    setParsedMarkdown('');
    setChatMessages([]);
    setStage('parsing');

    try {
      const formData = new FormData();
      if (inputMode === 'file' && file) {
        formData.append('file', file);
      } else if (inputMode === 'text' && pasteText.trim()) {
        formData.append('text', pasteText.trim());
      } else {
        throw new Error('请提供简历文件或文本内容');
      }

      const parseController = new AbortController();
      const parseTimeout = setTimeout(() => parseController.abort(), 90_000);

      const res = await apiFetch('/api/ai/parse', {
        method: 'POST',
        body: formData,
        signal: parseController.signal,
      });

      clearTimeout(parseTimeout);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'AI 解析失败');
      }

      const markdown = await readSSEStream(res, (md) => {
        setParsedMarkdown(md);
      });

      if (!markdown.trim()) {
        throw new Error('AI 未返回有效内容');
      }

      setHistory([{
        id: 'v-0',
        version: 0,
        markdown,
        userPrompt: 'AI 初始解析',
        msgId: '',
        timestamp: Date.now(),
      }]);
      setRestoredSession(false);
      setStage('preview');
    } catch (err) {
      let message = 'AI 解析失败';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          message = 'AI 解析超时，请重试';
        } else {
          message = err.message;
        }
      }
      setError(message);
      setStage('input');
    }
  };

  // Chat with AI to optimize resume
  const sendChatMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    setChatInput('');
    setChatLoading(true);
    setError(null);

    // Reset textarea height
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
    }

    const userMsg: ChatMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
    };

    const assistantMsg: ChatMsg = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      // Build message history for API
      const apiMessages: { role: 'user' | 'assistant'; content: string }[] = [];

      // Always start with the current resume as context
      apiMessages.push({
        role: 'user',
        content: `这是我当前的简历内容：\n\n${parsedMarkdown}`,
      });

      // Add previous chat history
      for (const cm of chatMessages) {
        if (cm.role === 'user') {
          apiMessages.push({ role: 'user', content: cm.content });
        } else if (cm.role === 'assistant' && cm.content.trim()) {
          apiMessages.push({ role: 'assistant', content: cm.content });
        }
      }

      // Add current user message
      apiMessages.push({ role: 'user', content: msg });

      const chatController = new AbortController();
      const chatTimeout = setTimeout(() => chatController.abort(), 90_000);

      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: apiMessages }),
        signal: chatController.signal,
      });

      clearTimeout(chatTimeout);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'AI 对话失败');
      }

      const fullResponse = await readSSEStream(res, (md) => {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: md } : m
          )
        );
      });

      // Mark streaming complete
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: fullResponse, isStreaming: false }
            : m
        )
      );

      // Extract the markdown from the response (strip HTML comments)
      const cleanedMarkdown = fullResponse.replace(/<!--[\s\S]*?-->\s*/g, '').trim();
      if (cleanedMarkdown.includes('---') && cleanedMarkdown.includes('##')) {
        setParsedMarkdown(cleanedMarkdown);
        setHistory(prev => [...prev, {
          id: `v-${Date.now()}`,
          version: prev.length,
          markdown: cleanedMarkdown,
          userPrompt: msg,
          msgId: assistantMsg.id,
          timestamp: Date.now(),
        }]);
      }
    } catch (err) {
      let message = 'AI 对话失败';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          message = 'AI 响应超时，请重试';
        } else {
          message = err.message;
        }
      }
      setError(message);
      // Remove the empty assistant message
      setChatMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setChatLoading(false);
    }
  };

  const rollbackToVersion = (entryIdx: number, msgId: string) => {
    const entry = history[entryIdx];
    if (!entry) return;
    setParsedMarkdown(entry.markdown);
    setHistory(prev => prev.slice(0, entryIdx + 1));
    const msgIdx = chatMessages.findIndex(m => m.id === msgId);
    if (msgIdx >= 0) {
      setChatMessages(prev => prev.slice(0, msgIdx + 1));
    }
    setExpandedDiff(null);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const saveResult = async () => {
    if (!parsedMarkdown.trim()) return;

    setStage('saving');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('content', parsedMarkdown);
      formData.append('filename', file?.name || 'ai-parsed-resume.md');

      const res = await apiFetch('/api/resumes', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      setStage('done');
      clearSession();
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setStage('preview');
    }
  };

  const resetAll = () => {
    setStage('input');
    setFile(null);
    setPasteText('');
    setParsedMarkdown('');
    setChatMessages([]);
    setChatInput('');
    setError(null);
    setHistory([]);
    setExpandedDiff(null);
    setRestoredSession(false);
    clearSession();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Not configured state
  if (aiConfigured === false) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <Card variant="bordered" className="p-8 border-warning/30 bg-warning/5 text-center">
          <div className="w-14 h-14 rounded-[2rem] bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Settings className="w-6 h-6 text-warning" />
          </div>
          <h3 className="text-lg font-semibold mb-2">需要配置 API Key</h3>
          <p className="text-sm text-default-500 mb-5">
            AI 解析功能需要 DeepSeek API Key，请先在设置页面完成配置。
          </p>
          <Link href="/settings">
            <Button
              color="primary"
              startContent={<Settings className="w-4 h-4" />}
            >
              前往设置
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Loading config
  if (aiConfigured === null) {
    return (
      <div className="w-full max-w-xl mx-auto flex justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <AnimatePresence mode="wait">
        {/* Stage: Input */}
        {stage === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-2xl mx-auto"
          >
            {/* Mode toggle */}
            <div className="flex gap-2 mb-5">
              <Button
                variant={inputMode === 'file' ? 'solid' : 'flat'}
                color={inputMode === 'file' ? 'primary' : 'default'}
                className="flex-1"
                onClick={() => setInputMode('file')}
                startContent={<FileText className="w-4 h-4" />}
              >
                上传文件
              </Button>
              <Button
                variant={inputMode === 'text' ? 'solid' : 'flat'}
                color={inputMode === 'text' ? 'primary' : 'default'}
                className="flex-1"
                onClick={() => setInputMode('text')}
                startContent={<ClipboardPaste className="w-4 h-4" />}
              >
                粘贴文本
              </Button>
            </div>

            {inputMode === 'file' ? (
              <>
                {!file ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer border border-dashed rounded-[2rem] p-12 text-center transition-all duration-500
                      ${isDragging
                        ? 'border-primary bg-primary/5 scale-[1.02]'
                        : 'border-default-300 hover:border-primary hover:bg-primary/5'
                      }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,.text,.html,.htm,.json,.csv,.xml,.rtf"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <motion.div
                      animate={isDragging ? { scale: 1.15, y: -5 } : { scale: 1, y: 0 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="w-16 h-16 rounded-[2rem] bg-secondary flex items-center justify-center opacity-80">
                        <Sparkles className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-medium mb-1">
                          {isDragging ? '松开即可上传' : '拖拽简历文件到这里'}
                        </p>
                        <p className="text-sm text-default-500">
                          支持 .md、.txt、.html 等文本格式
                        </p>
                      </div>
                    </motion.div>
                  </div>
                ) : (
                  <div className="border border-default-200 rounded-[2rem] p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-[2rem] bg-primary/10 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.name}</p>
                        <p className="text-sm text-default-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={removeFile}
                        className="p-2 rounded-lg hover:bg-default-100 transition-colors"
                      >
                        <X className="w-4 h-4 text-default-500" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"将简历内容粘贴到这里，支持任意格式的简历文本，AI 会自动识别并转换。"}
                rows={12}
                className="w-full px-4 py-3 rounded-[2rem] border border-default-200 bg-content1 text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-transparent
                  placeholder:text-default-400 transition-all duration-500 resize-none font-mono leading-relaxed"
              />
            )}

            {/* Parse button */}
            <Button
              color="primary"
              size="lg"
              className="w-full mt-5"
              onClick={startAIParse}
              isDisabled={inputMode === 'file' ? !file : !pasteText.trim()}
              startContent={<Sparkles className="w-4 h-4" />}
            >
              AI 智能解析
            </Button>

            <p className="text-xs text-default-400 text-center mt-3">
              使用 DeepSeek API 解析，每次约消耗 0.01-0.05 元
            </p>
          </motion.div>
        )}

        {/* Stage: Parsing (streaming) */}
        {stage === 'parsing' && (
          <motion.div
            key="parsing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-2xl mx-auto"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
              <div>
                <p className="font-medium">AI 正在解析简历...</p>
                <p className="text-sm text-default-500">
                  正在将内容转换为标准简历格式
                </p>
              </div>
            </div>

            <Card variant="bordered" className="p-5 max-h-[500px] overflow-y-auto">
              <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                {parsedMarkdown || '等待 AI 响应...'}
                <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
              </pre>
            </Card>
          </motion.div>
        )}

        {/* Stage: Preview with Chat */}
        {stage === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <Check className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="font-medium">{restoredSession ? '已恢复未完成的会话' : '解析完成'}</p>
                  <p className="text-sm text-default-500">
                    可通过右侧对话继续优化，满意后点击保存
                  </p>
                </div>
              </div>
              <Button
                variant="light"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                startContent={showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              >
                {showPreview ? '编辑源码' : '预览'}
              </Button>
            </div>

            {/* Two column layout: Preview + Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 lg:h-[600px]">
              {/* Left: Resume Preview/Edit */}
              <div className="border border-default-200 rounded-[2rem] overflow-hidden flex flex-col h-[500px] lg:h-auto">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-default-200 bg-content2/30">
                  <FileText className="w-4 h-4 text-default-500" />
                  <span className="text-xs font-medium text-default-500">
                    {showPreview ? '简历预览' : '源码编辑'}
                  </span>
                  {history.length > 1 && (
                    <span className="text-xs text-primary ml-auto font-medium">
                      v{history.length - 1} · {history.filter(h => h.version > 0).length} 次修改
                    </span>
                  )}
                </div>
                {showPreview ? (
                  <div className="p-5 bg-content1 overflow-y-auto flex-1">
                    <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                      {parsedMarkdown}
                    </pre>
                  </div>
                ) : (
                  <textarea
                    value={parsedMarkdown}
                    onChange={(e) => setParsedMarkdown(e.target.value)}
                    className="w-full flex-1 px-5 py-4 bg-content1 text-sm font-mono leading-relaxed
                      focus:outline-none resize-none"
                  />
                )}
              </div>

              {/* Right: Chat Panel */}
              <div className="border border-default-200 rounded-[2rem] overflow-hidden flex flex-col h-[500px] lg:h-auto bg-content1">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-default-200 bg-content2/30">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-default-500">
                    AI 优化助手
                  </span>
                  {chatMessages.length > 0 && (
                    <span className="text-xs text-default-500 ml-auto">
                      {chatMessages.filter((m) => m.role === 'user').length} 轮对话
                    </span>
                  )}
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center py-8">
                      <div className="w-12 h-12 rounded-[2rem] bg-primary/10 flex items-center justify-center mb-4">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium mb-2">AI 优化助手</p>
                      <p className="text-xs text-default-500 max-w-[200px] leading-relaxed">
                        告诉 AI 你想如何优化简历内容，例如：
                      </p>
                      <div className="flex flex-col gap-1.5 mt-3">
                        {[
                          '帮我润色工作经历的描述',
                          '补充一下技能模块',
                          '让个人简介更有吸引力',
                          '把工作经历写得更专业',
                        ].map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => {
                              setChatInput(suggestion);
                              chatInputRef.current?.focus();
                            }}
                            className="text-xs text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors text-left"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMessages.map((msg) => {
                    const entry = msg.role === 'assistant' ? history.find(h => h.msgId === msg.id) : null;
                    const entryIdx = entry ? history.findIndex(h => h.id === entry.id) : -1;
                    const prevEntry = entryIdx > 0 ? history[entryIdx - 1] : null;
                    const isLatest = entry ? entry.id === history[history.length - 1]?.id : false;

                    return (
                      <div key={msg.id} className="space-y-1">
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[90%] rounded-[2rem] px-3.5 py-2.5 text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-primary text-white rounded-br-md'
                                : 'bg-default-100 text-foreground rounded-bl-md'
                            }`}
                          >
                            {msg.role === 'assistant' ? (
                              <AssistantMessage content={msg.content} isStreaming={msg.isStreaming} />
                            ) : (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>
                        </div>

                        {entry && !msg.isStreaming && prevEntry && (
                          <div className="flex items-center gap-2 pl-1">
                            <span className="text-[10px] text-default-400 font-mono">v{entry.version}</span>
                            <button
                              onClick={() => setExpandedDiff(expandedDiff === msg.id ? null : msg.id)}
                              className="text-[10px] text-primary hover:underline"
                            >
                              {expandedDiff === msg.id ? '收起修改' : '查看修改'}
                            </button>
                            {!isLatest && (
                              <button
                                onClick={() => rollbackToVersion(entryIdx, msg.id)}
                                className="text-[10px] text-amber-500 hover:underline"
                              >
                                回退到此步
                              </button>
                            )}
                          </div>
                        )}

                        {expandedDiff === msg.id && entry && prevEntry && (
                          <div className="ml-1 rounded-lg border border-default-200 overflow-hidden text-[11px] font-mono max-h-[200px] overflow-y-auto">
                            {(() => {
                              const changedLines = computeLineDiff(prevEntry.markdown, entry.markdown)
                                .filter(d => d.type !== 'unchanged');
                              if (changedLines.length === 0) {
                                return <div className="px-2 py-1 text-default-400">无文本差异</div>;
                              }
                              return changedLines.map((d, idx) => (
                                <div key={idx} className={`px-2 py-px ${
                                  d.type === 'added'
                                    ? 'bg-success/10 text-success'
                                    : 'bg-danger/10 text-danger line-through'
                                }`}>
                                  <span className="select-none opacity-50 mr-1">{d.type === 'added' ? '+' : '−'}</span>
                                  {d.content || '\u00A0'}
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="border-t border-default-200 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="输入优化需求..."
                      rows={1}
                      className="flex-1 px-3 py-2 rounded-full bg-background border border-default-200 text-sm
                        focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                        placeholder:text-default-400 resize-none transition-colors max-h-[80px]"
                      style={{ minHeight: '38px' }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 80) + 'px';
                      }}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim() || chatLoading}
                      className="p-2 rounded-xl bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
                    >
                      {chatLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-default-400 mt-1.5 text-center">
                    Enter 发送 · Shift+Enter 换行
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="bordered"
                onClick={resetAll}
                startContent={<RotateCcw className="w-4 h-4" />}
              >
                重新解析
              </Button>
              <Button
                color="primary"
                className="flex-1"
                size="lg"
                onClick={saveResult}
                startContent={<Upload className="w-4 h-4" />}
              >
                确认并保存简历
              </Button>
            </div>
          </motion.div>
        )}

        {/* Stage: Saving */}
        {stage === 'saving' && (
          <motion.div
            key="saving"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16"
          >
            <Spinner size="lg" color="primary" className="mb-4" />
            <p className="font-medium">正在保存简历...</p>
          </motion.div>
        )}

        {/* Stage: Done */}
        {stage === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-16"
          >
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="text-lg font-semibold mb-1">保存成功！</p>
            <p className="text-sm text-default-500">
              正在跳转到仪表盘...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-2 text-sm text-danger p-3 rounded-[2rem] bg-danger/10 max-w-2xl mx-auto"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Display AI assistant message with smart summarization.
 * If the response contains a full markdown resume, show a summary instead.
 */
function AssistantMessage({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const hasResume = content.includes('---') && content.includes('##');

  if (!content.trim()) {
    return (
      <span className="flex items-center gap-1.5 text-default-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        思考中...
      </span>
    );
  }

  // If it contains a full resume, show a compact summary
  if (hasResume && !isStreaming) {
    // Extract comment if any
    const commentMatch = content.match(/<!--([\s\S]*?)-->/);
    const comment = commentMatch?.[1]?.trim();

    // Count sections
    const sectionCount = (content.match(/^## /gm) || []).length;

    return (
      <div className="space-y-1.5">
        {comment && (
          <p className="text-foreground">{comment}</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-default-400">
          <Check className="w-3 h-3 text-success" />
          已更新简历（{sectionCount} 个模块），左侧已同步
        </div>
      </div>
    );
  }

  // During streaming, show a condensed progress indicator
  if (isStreaming) {
    const lines = content.split('\n').filter((l) => l.trim());
    const preview = lines.slice(0, 3).join('\n');
    return (
      <div className="space-y-1">
        <p className="whitespace-pre-wrap text-xs opacity-70 line-clamp-3">{preview}</p>
        <span className="inline-block w-1.5 h-3 bg-primary animate-pulse" />
      </div>
    );
  }

  return <p className="whitespace-pre-wrap">{content}</p>;
}
