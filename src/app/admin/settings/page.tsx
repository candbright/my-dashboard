'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Check, ExternalLink, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';

type AIProvider = 'deepseek' | 'openai' | 'qwen' | 'zhipu' | 'moonshot' | 'custom';

interface ProviderPreset {
  name: string;
  defaultBaseUrl: string;
  models: string[];
  keyUrl?: string;
}

const AI_PROVIDERS: Record<AIProvider, ProviderPreset> = {
  deepseek: {
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  openai: {
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  qwen: {
    name: '通义千问',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  zhipu: {
    name: '智谱 GLM',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  moonshot: {
    name: 'Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  custom: {
    name: '自定义',
    defaultBaseUrl: '',
    models: [],
  },
};

const PROVIDER_ORDER: AIProvider[] = ['deepseek', 'openai', 'qwen', 'zhipu', 'moonshot', 'custom'];

interface ProviderState {
  configured: boolean;
  maskedKey: string | null;
  model: string;
  baseUrl: string;
}

function initProviderStates(): Record<AIProvider, ProviderState> {
  const initial = {} as Record<AIProvider, ProviderState>;
  for (const id of PROVIDER_ORDER) {
    initial[id] = {
      configured: false,
      maskedKey: null,
      model: AI_PROVIDERS[id].models[0] || '',
      baseUrl: AI_PROVIDERS[id].defaultBaseUrl,
    };
  }
  return initial;
}

export default function AdminSettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<AIProvider>('deepseek');
  const [selectedTab, setSelectedTab] = useState<AIProvider>('deepseek');
  const [providerStates, setProviderStates] = useState<Record<AIProvider, ProviderState>>(initProviderStates);

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
    reply?: string;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      apiFetch('/api/ai/config')
        .then((res) => {
          if (!res.ok) throw new Error('Unauthorized');
          return res.json();
        })
        .then((data) => {
          if (data.activeProvider) {
            setActiveProvider(data.activeProvider);
            setSelectedTab(data.activeProvider);
          }
          if (data.providers) {
            setProviderStates((prev) => {
              const states = { ...prev };
              for (const id of PROVIDER_ORDER) {
                if (data.providers[id]) {
                  states[id] = data.providers[id];
                }
              }
              return states;
            });
            const activeId = (data.activeProvider || 'deepseek') as AIProvider;
            const initial = data.providers[activeId];
            if (initial) {
              setModel(initial.model || AI_PROVIDERS[activeId].models[0] || '');
              setBaseUrl(initial.baseUrl || AI_PROVIDERS[activeId].defaultBaseUrl);
            }
          }
        })
        .catch(() => setError('加载配置失败'))
        .finally(() => setLoading(false));
    }
  }, [authLoading, isAdmin]);

  const handleSelectTab = (id: AIProvider) => {
    setSelectedTab(id);
    setApiKey('');
    setError(null);
    setSaved(false);
    setTestResult(null);
    const state = providerStates[id];
    const preset = AI_PROVIDERS[id];
    setModel(state.model || preset.models[0] || '');
    setBaseUrl(state.baseUrl || preset.defaultBaseUrl);
    setCustomModel('');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    const resolvedModel = selectedTab === 'custom' ? (customModel || model) : model;

    try {
      const res = await apiFetch('/api/ai/test', {
        method: 'POST',
        // If user has typed a new key, test that; otherwise test saved config
        body: JSON.stringify(
          apiKey.trim()
            ? { provider: selectedTab, apiKey: apiKey.trim(), model: resolvedModel, baseUrl }
            : {}
        ),
      });

      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: data.error || '测试失败' });
      } else {
        setTestResult({
          ok: true,
          message: `连接成功 · ${data.provider} · ${data.model}`,
          latencyMs: data.latencyMs,
          reply: data.reply,
        });
      }
    } catch {
      setTestResult({ ok: false, message: '请求失败，请检查网络' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }

    const resolvedModel = selectedTab === 'custom' ? (customModel || model) : model;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify({
          provider: selectedTab,
          apiKey: apiKey.trim(),
          model: resolvedModel,
          baseUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      setProviderStates((prev) => ({
        ...prev,
        [selectedTab]: {
          configured: true,
          maskedKey: data.maskedKey,
          model: resolvedModel,
          baseUrl,
        },
      }));
      setApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async () => {
    if (!providerStates[selectedTab].configured) {
      setError('请先配置该提供商的 API Key');
      return;
    }

    setSwitching(true);
    setError(null);

    try {
      const res = await apiFetch('/api/ai/config', {
        method: 'PATCH',
        body: JSON.stringify({ activeProvider: selectedTab }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '切换失败');
      setActiveProvider(selectedTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSwitching(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const currentPreset = AI_PROVIDERS[selectedTab];
  const currentState = providerStates[selectedTab];
  const isActive = selectedTab === activeProvider;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <h1 className="text-2xl font-bold tracking-tight mb-6">AI 设置</h1>

      <hr className="border-[var(--border)] mb-6" />

      {/* Provider Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PROVIDER_ORDER.map((id) => {
          const preset = AI_PROVIDERS[id];
          const state = providerStates[id];
          const selected = id === selectedTab;
          const active = id === activeProvider;
          return (
            <button
              key={id}
              onClick={() => handleSelectTab(id)}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${selected
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
            >
              {preset.name}
              {active && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500" />
              )}
              {state.configured && !active && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Provider Config */}
      <div className="max-w-md space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {isActive && (
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
              <Check className="w-3.5 h-3.5" /> 当前使用
            </span>
          )}
          {currentState.configured && (
            <span className="text-[var(--muted-foreground)]">
              Key: {currentState.maskedKey} · 模型: {currentState.model}
            </span>
          )}
          {!currentState.configured && (
            <span className="text-[var(--muted-foreground)]">未配置</span>
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={currentState.configured ? '输入新 Key 以更新' : `${currentPreset.name} API Key`}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
              placeholder:text-[var(--muted-foreground)]"
          />
          {currentPreset.keyUrl && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              <a
                href={currentPreset.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline inline-flex items-center gap-0.5"
              >
                获取 API Key <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium mb-1">模型</label>
          {currentPreset.models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              {currentPreset.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="输入模型名称，如 gpt-4o"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                placeholder:text-[var(--muted-foreground)]"
            />
          )}
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium mb-1">API 地址</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
              placeholder:text-[var(--muted-foreground)]"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Test result */}
        {testResult && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            testResult.ok
              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}>
            {testResult.ok
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className="font-medium">{testResult.message}</p>
              {testResult.latencyMs !== undefined && (
                <p className="text-xs opacity-75 mt-0.5">延迟：{testResult.latencyMs} ms</p>
              )}
              {testResult.reply && (
                <p className="text-xs opacity-75 mt-0.5 truncate">AI 回复：{testResult.reply}</p>
              )}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            className="flex-1 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-sm font-medium
              hover:opacity-90 transition-opacity disabled:opacity-50
              flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <><Check className="w-4 h-4" /> 已保存</>
            ) : (
              '保存'
            )}
          </button>

          {/* Test button: available if a new key is typed OR a config is already saved */}
          {(apiKey.trim() || currentState.configured) && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium
                hover:bg-[var(--muted)] transition-colors disabled:opacity-50
                flex items-center justify-center gap-2"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> 测试连接</>}
            </button>
          )}

          {!isActive && currentState.configured && (
            <button
              onClick={handleSetActive}
              disabled={switching}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium
                hover:bg-[var(--muted)] transition-colors disabled:opacity-50
                flex items-center justify-center gap-2"
            >
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : '设为当前使用'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
