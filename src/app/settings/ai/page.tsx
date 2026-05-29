'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, ExternalLink, Zap, CheckCircle2, XCircle, Trash2, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { Button, Input, Select, Spinner, Divider, Card, Chip } from '@/components/ui';

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

export default function UserAISettingsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [adminConfigured, setAdminConfigured] = useState(false);
  const [adminProvider, setAdminProvider] = useState<string>('');
  const [hasCustomConfig, setHasCustomConfig] = useState(false);

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
  const [deleting, setDeleting] = useState(false);
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
    if (!authLoading && user) {
      // Check AI config status
      apiFetch('/api/ai/config')
        .then((res) => res.json())
        .then((data) => {
          setAiEnabled(data.ai_enabled || isAdmin);
          setAdminConfigured(data.configured);
        })
        .catch(() => {});

      // Load user's custom AI config
      apiFetch('/api/user/ai-config')
        .then((res) => {
          if (!res.ok) {
            // AI not enabled for user
            setLoading(false);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (!data) return;
          setAdminConfigured(data.adminConfigured ?? false);
          setAdminProvider(data.adminProvider ?? '');
          setHasCustomConfig(data.hasCustomConfig ?? false);

          if (data.hasCustomConfig && data.providers) {
            if (data.activeProvider) {
              setActiveProvider(data.activeProvider);
              setSelectedTab(data.activeProvider);
            }
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
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [authLoading, user, isAdmin]);

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
        body: JSON.stringify({
          provider: selectedTab,
          apiKey: apiKey.trim(),
          model: resolvedModel,
          baseUrl,
        }),
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
      const res = await apiFetch('/api/user/ai-config', {
        method: 'POST',
        body: JSON.stringify({
          provider: selectedTab,
          apiKey: apiKey.trim(),
          model: resolvedModel,
          baseUrl,
          setActive: true,
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
      setActiveProvider(data.activeProvider || selectedTab);
      setHasCustomConfig(true);
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
      const res = await apiFetch('/api/user/ai-config', {
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

  const handleDeleteConfig = async () => {
    if (!confirm('确定要删除自定义 AI 配置吗？删除后将使用管理员全局配置。')) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/user/ai-config', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }
      setHasCustomConfig(false);
      setProviderStates(initProviderStates());
      setActiveProvider('deepseek');
      setSelectedTab('deepseek');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="md" />
      </div>
    );
  }

  // AI not enabled for this user
  if (!aiEnabled && !isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight mb-6">AI-API 设置</h1>
        <Divider className="mb-6" />
        <Card variant="bordered" className="p-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-default-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-default-600">
                AI 功能未启用。请联系管理员开启您的 AI 使用权限。
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  const currentPreset = AI_PROVIDERS[selectedTab];
  const currentState = providerStates[selectedTab];
  const isActive = selectedTab === activeProvider;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <h1 className="text-2xl font-bold tracking-tight mb-2">AI-API 设置</h1>
      <p className="text-sm text-default-500 mb-6">
        自定义 AI 配置以覆盖管理员全局配置。不配置则使用管理员提供的 AI 服务。
      </p>

      <Divider className="mb-6" />

      {/* Admin config status */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <Chip
          variant="flat"
          color={adminConfigured ? 'success' : 'default'}
          size="sm"
        >
          管理员配置: {adminConfigured ? '已配置' : '未配置'}
        </Chip>
        {adminProvider && (
          <Chip variant="flat" size="sm" color="primary">
            管理员当前: {AI_PROVIDERS[adminProvider as AIProvider]?.name || adminProvider}
          </Chip>
        )}
        {hasCustomConfig && (
          <Chip variant="flat" size="sm" color="secondary">
            已自定义配置
          </Chip>
        )}
      </div>

      {/* Provider Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PROVIDER_ORDER.map((id) => {
          const preset = AI_PROVIDERS[id];
          const state = providerStates[id];
          const selected = id === selectedTab;
          const active = id === activeProvider && hasCustomConfig;
          return (
            <button
              key={id}
              onClick={() => handleSelectTab(id)}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${selected
                  ? 'bg-primary text-white'
                  : 'bg-default-100 text-default-500 hover:text-foreground'
                }`}
            >
              {preset.name}
              {active && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-success" />
              )}
              {state.configured && !active && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Provider Config */}
      <div className="max-w-md space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {isActive && hasCustomConfig && (
            <span className="inline-flex items-center gap-1 text-success font-medium">
              <Check className="w-3.5 h-3.5" /> 当前使用
            </span>
          )}
          {currentState.configured && (
            <span className="text-default-500">
              Key: {currentState.maskedKey} · 模型: {currentState.model}
            </span>
          )}
          {!currentState.configured && (
            <span className="text-default-400">未配置</span>
          )}
        </div>

        {/* API Key */}
        <div>
          <Input
            type="password"
            label="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={currentState.configured ? '输入新 Key 以更新' : `${currentPreset.name} API Key`}
            variant="bordered"
          />
          {currentPreset.keyUrl && (
            <p className="text-xs text-default-400 mt-1">
              <a
                href={currentPreset.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                获取 API Key <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}
        </div>

        {/* Model */}
        <div>
          {currentPreset.models.length > 0 ? (
            <Select
              label="模型"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              variant="bordered"
              options={currentPreset.models.map((m) => ({ value: m, label: m }))}
            />
          ) : (
            <Input
              label="模型"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="输入模型名称，如 gpt-4o"
              variant="bordered"
            />
          )}
        </div>

        {/* Base URL */}
        <Input
          label="API 地址"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://..."
          variant="bordered"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Test result */}
        {testResult && (
          <Card
            variant="bordered"
            className={`p-3 ${
              testResult.ok
                ? 'border-success/30 bg-success/5 text-success'
                : 'border-danger/30 bg-danger/5 text-danger'
            }`}
          >
            <div className="flex items-start gap-2 text-sm">
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
          </Card>
        )}

        {/* Buttons */}
        <div className="flex gap-3 flex-wrap">
          <Button
            color="primary"
            className="flex-1"
            onClick={handleSave}
            isLoading={saving}
            isDisabled={!apiKey.trim()}
            startContent={saved ? <Check className="w-4 h-4" /> : undefined}
          >
            {saved ? '已保存' : '保存'}
          </Button>

          {apiKey.trim() && (
            <Button
              variant="bordered"
              onClick={handleTest}
              isLoading={testing}
              startContent={!testing ? <Zap className="w-4 h-4" /> : undefined}
            >
              测试连接
            </Button>
          )}

          {!isActive && currentState.configured && hasCustomConfig && (
            <Button
              variant="bordered"
              onClick={handleSetActive}
              isLoading={switching}
            >
              设为当前使用
            </Button>
          )}
        </div>

        {/* Delete custom config */}
        {hasCustomConfig && (
          <div className="pt-4 border-t border-default-200">
            <Button
              variant="light"
              color="danger"
              size="sm"
              onClick={handleDeleteConfig}
              isLoading={deleting}
              startContent={<Trash2 className="w-4 h-4" />}
            >
              删除自定义配置（恢复使用管理员配置）
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
