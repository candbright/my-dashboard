'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, X, Loader2, RotateCcw, ChevronUp,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface AISectionChatProps {
  /** Unique context key for this chat (e.g. "frontmatter", "section-xxx") */
  contextKey: string;
  /** Current section content as context for AI */
  sectionContent: string;
  /** Section title for display */
  sectionTitle: string;
  /** Called when AI returns optimized content to apply */
  onApplyContent: (newContent: string) => void;
  /** External store for chat history keyed by contextKey */
  chatHistoryMap: React.MutableRefObject<Map<string, ChatMsg[]>>;
}

const PRESET_PROMPTS: Record<string, string[]> = {
  '基本信息': [
    '帮我优化职位头衔，使其更专业',
    '检查联系方式格式是否规范',
  ],
  '关于我': [
    '帮我润色个人简介，使其更有吸引力',
    '精简个人简介，控制在3句话以内',
    '突出我的核心竞争力',
  ],
  '工作经历': [
    '用STAR法则优化每条工作描述',
    '量化工作成果，添加数据支撑',
    '把多条合并的描述拆分为独立条目',
    '让工作描述更专业、更有影响力',
  ],
  '教育背景': [
    '优化教育背景的描述',
    '突出学术成就和荣誉',
  ],
  '技能': [
    '按类别整理技能，分组更清晰',
    '补充当前热门的相关技能',
    '删除过时或不相关的技能',
  ],
  '项目经历': [
    '用STAR法则优化项目描述',
    '量化项目成果',
    '突出技术栈和个人贡献',
    '把多条合并的描述拆分为独立条目',
  ],
};

const DEFAULT_PRESETS = [
  '帮我润色优化这部分内容',
  '把多条合并的内容拆分为独立条目',
  '让描述更专业、更有影响力',
  '精简内容，去掉冗余信息',
];

function getPresets(title: string): string[] {
  for (const [key, presets] of Object.entries(PRESET_PROMPTS)) {
    if (title.includes(key)) return presets;
  }
  return DEFAULT_PRESETS;
}

/** Helper: read SSE stream and return collected text */
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

export function AISectionChat({
  contextKey,
  sectionContent,
  sectionTitle,
  onApplyContent,
  chatHistoryMap,
}: AISectionChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    return chatHistoryMap.current.get(contextKey) || [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Sync messages to the shared history map
  useEffect(() => {
    chatHistoryMap.current.set(contextKey, messages);
  }, [messages, contextKey, chatHistoryMap]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const presets = getPresets(sectionTitle);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    setLoading(true);

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

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      // Build context: current section content + chat history
      const apiMessages: { role: 'user' | 'assistant'; content: string }[] = [];

      apiMessages.push({
        role: 'user',
        content: `以下是我简历中"${sectionTitle}"模块的当前内容（Markdown格式）：\n\n${sectionContent}\n\n请根据我的要求优化这部分内容。注意：\n1. 只返回优化后的该模块内容（Markdown格式），不要返回完整简历\n2. 保持相同的Markdown格式结构\n3. 如果需要拆分条目，请确保每个条目是独立的列表项`,
      });

      // Add previous chat history from this context
      const currentHistory = messages.filter(m => !m.isStreaming);
      for (const cm of currentHistory) {
        apiMessages.push({ role: cm.role, content: cm.content });
      }

      apiMessages.push({ role: 'user', content: msg });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'AI 对话失败');
      }

      const fullResponse = await readSSEStream(res, (text) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id ? { ...m, content: text } : m
          )
        );
      });

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: fullResponse, isStreaming: false }
            : m
        )
      );
    } catch (err) {
      let message = 'AI 对话失败';
      if (err instanceof Error) {
        message = err.name === 'AbortError' ? 'AI 响应超时' : err.message;
      }
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: `❌ ${message}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, sectionContent, sectionTitle]);

  const clearHistory = () => {
    setMessages([]);
    chatHistoryMap.current.delete(contextKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /** Try to extract actionable content from the last AI response */
  const applyLastResponse = () => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.isStreaming && m.content.trim());
    if (!lastAssistant) return;

    // Clean the content - strip HTML comments and code fences
    let content = lastAssistant.content
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^```(?:markdown|md)?\n/gm, '')
      .replace(/\n```$/gm, '')
      .trim();

    onApplyContent(content);
  };

  const hasApplicableResponse = messages.some(m => m.role === 'assistant' && !m.isStreaming && m.content.trim() && !m.content.startsWith('❌'));

  return (
    <div className="relative inline-flex" ref={containerRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${
          isOpen
            ? 'bg-primary/15 text-primary'
            : 'hover:bg-primary/10 text-primary/60 hover:text-primary'
        }`}
        title="AI 润色"
      >
        <Sparkles className="w-4 h-4" />
      </button>

      {/* Inline expandable bubble */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-full right-0 mt-2 w-[380px] bg-content1 border border-default-200 rounded-[2rem] flex flex-col z-30 max-h-[420px]"
          >
            {/* Bubble arrow */}
            <div className="absolute -top-1.5 right-3 w-3 h-3 bg-content1 border-l border-t border-default-200 rotate-45" />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-default-200 relative">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium text-xs">AI 润色</span>
                {messages.length > 0 && (
                  <span className="text-[10px] text-default-400">
                    · {messages.filter(m => m.role === 'user').length} 轮
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {messages.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="p-1 rounded-md hover:bg-default-100 text-default-400 hover:text-default-600 transition-colors"
                    title="清空对话"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md hover:bg-default-100 text-default-400 hover:text-default-600 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[120px]">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-4">
                  <p className="text-xs text-default-500 mb-2.5">选择预设或输入需求</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => sendMessage(preset)}
                        className="text-[11px] text-primary hover:bg-primary/10 px-2.5 py-1.5 rounded-lg border border-primary/20 transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-[2rem] px-3 py-2 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-sm'
                        : 'bg-default-100 text-foreground rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' && !msg.content.trim() ? (
                      <span className="flex items-center gap-1.5 text-default-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        思考中...
                      </span>
                    ) : msg.isStreaming ? (
                      <div>
                        <p className="whitespace-pre-wrap opacity-80 line-clamp-6">{msg.content}</p>
                        <span className="inline-block w-1.5 h-3 bg-primary animate-pulse mt-0.5" />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Apply button */}
            {hasApplicableResponse && (
              <div className="px-3 pb-2">
                <Button
                  color="success"
                  variant="flat"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={() => { applyLastResponse(); setIsOpen(false); }}
                  startContent={<Sparkles className="w-3 h-3" />}
                >
                  应用 AI 建议
                </Button>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-default-200 p-2.5">
              {messages.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {presets.slice(0, 3).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => sendMessage(preset)}
                      disabled={loading}
                      className="text-[10px] text-primary hover:bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 transition-colors disabled:opacity-40"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1.5">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入优化需求..."
                  rows={1}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-default-200 text-xs
                    focus:outline-none focus:ring-1 focus:ring-primary/10 focus:border-primary
                    placeholder:text-default-400 resize-none transition-colors max-h-[60px]"
                  style={{ minHeight: '32px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 60) + 'px';
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="p-1.5 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
