'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  KeyRound,
  Plug,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Button,
  Card,
  Chip,
  ConfirmModal,
  Input,
  Select,
  Spinner,
  Switch,
  Textarea,
  ToastContainer,
  useToast,
} from '@/components/ui';
import { ProviderList } from '@/components/ai/ProviderList';
import {
  clearUserAI,
  discoverModels,
  getUserAI,
  listProviders,
  saveUserAI,
  setUserGlobalAI,
  submitApproval,
  testConnection,
} from '@/lib/api-client';
import type { ProviderView, UserAIState } from '@/lib/ai-providers';

/**
 * API 配置 — the AI settings page every signed-in account sees.
 *
 * Administrators and ordinary users get the identical page: the shared provider
 * list, a personal provider plus key, and the global-API switch. Nothing here is
 * privileged, which is deliberate — an administrator's personal AI settings are
 * personal, and keeping them on this page is what stops the global configuration
 * page from silently doubling as somebody's private settings.
 */
export default function UserAISettingsPage() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<UserAIState | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);

  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  const [globalBusy, setGlobalBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyReason, setApplyReason] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [showClear, setShowClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [config, list] = await Promise.all([getUserAI(), listProviders()]);
      setState(config);
      setProviders(list.providers);
      setSelectedProvider(config.personalProviderId || config.providers[0]?.id || '');
      setModel(config.model || '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && !isGuest) void load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, user, isGuest, load]);

  const selected = useMemo(
    () => providers.find((p) => p.id === selectedProvider) ?? null,
    [providers, selectedProvider]
  );

  // An empty list is itself a selectable option: it means "use the provider's
  // own default model", which is what the backend falls back to.
  const modelOptions = useMemo(() => {
    const opts = [{ value: '', label: '使用提供商默认模型' }];
    for (const m of selected?.models ?? []) opts.push({ value: m, label: m });
    return opts;
  }, [selected]);

  const handleSave = async (clearKey = false) => {
    if (!selectedProvider) {
      addToast('error', '请先选择一个提供商');
      return;
    }
    setSaving(true);
    try {
      const result = await saveUserAI({
        providerId: selectedProvider,
        apiKey: apiKey.trim() || undefined,
        model,
        clearKey,
      });
      setApiKey('');
      const [config, list] = await Promise.all([getUserAI(), listProviders()]);
      setState(config);
      setProviders(list.providers);
      addToast('success', result.hasPersonalKey ? '配置已保存' : '配置已保存，但尚未填写 API Key');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearBusy(true);
    try {
      await clearUserAI();
      setApiKey('');
      setModel('');
      await load();
      setShowClear(false);
      addToast('success', '已清除个人 AI 配置');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '清除失败');
    } finally {
      setClearBusy(false);
    }
  };

  const handleToggleGlobal = async (enabled: boolean) => {
    setGlobalBusy(true);
    try {
      await setUserGlobalAI(enabled);
      const config = await getUserAI();
      setState(config);
      addToast('success', enabled ? '已开启全局 API' : '已关闭全局 API');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '切换失败');
    } finally {
      setGlobalBusy(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await submitApproval({
        resourceType: 'ai',
        permission: 'use_global',
        reason: applyReason.trim(),
      });
      setApplyReason('');
      const config = await getUserAI();
      setState(config);
      addToast('success', '申请已提交，等待管理员审批');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '提交申请失败');
    } finally {
      setApplying(false);
    }
  };

  const handleTest = async () => {
    const target = state?.resolvedSource === 'global' ? state.globalProviderId : selectedProvider;
    if (!target) {
      addToast('error', '请先选择要测试的提供商');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(target);
      setTestResult(
        `连接成功 · ${result.model}${result.latencyMs ? ` · ${result.latencyMs} ms` : ''}`
      );
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : '连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleDiscover = async (
    draft: { id: string; baseUrl: string; protocol: ProviderView['protocol'] },
    key: string
  ) => {
    const result = await discoverModels({
      provider: draft.id,
      baseUrl: draft.baseUrl,
      protocol: draft.protocol,
      apiKey: key,
      // Only this account's own credential may be reused; the global key is not
      // this page's to spend on discovery.
      useStoredKey: !key && draft.id === state?.personalProviderId,
    });
    return result.models;
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="md" />
      </div>
    );
  }

  if (isGuest) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight mb-1">API 配置</h1>
        <Card variant="bordered" className="mt-6 p-6">
          <p className="text-sm text-default-500">
            访客账号无法配置 AI。请注册或登录后再设置。
          </p>
        </Card>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight mb-1">API 配置</h1>
        <p className="text-sm text-default-500 mb-8">
          选择用于 AI 功能的提供商与密钥
        </p>

        {loadError && (
          <Card variant="bordered" className="mb-6 p-6">
            <p className="text-sm text-danger">{loadError}</p>
            <Button className="mt-4" variant="bordered" size="sm" onClick={load}>
              重新加载
            </Button>
          </Card>
        )}

        <div className="space-y-6">
          {/* Current effective source */}
          <Card variant="bordered" className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-[2rem] bg-primary/10 p-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-semibold text-foreground">
                    当前生效的 AI 来源
                  </h3>
                  <p className="mt-1 text-sm text-default-500">
                    {state?.resolvedSource === 'global'
                      ? '正在使用管理员配置的全局 API'
                      : state?.resolvedSource === 'personal'
                        ? '正在使用你自己的 API Key'
                        : '尚未配置可用的 AI 来源，请在下方选择提供商并填写 API Key，或申请使用全局 API'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip
                      variant="flat"
                      color={state?.resolvedSource ? 'success' : 'warning'}
                      size="sm"
                    >
                      {state?.resolvedSource === 'global'
                        ? '全局 API'
                        : state?.resolvedSource === 'personal'
                          ? '个人 API Key'
                          : '未配置'}
                    </Chip>
                    {state?.holdsGrant && (
                      <Chip variant="flat" color="secondary" size="sm">
                        已获得全局 API 使用权限
                      </Chip>
                    )}
                    {state?.hasPersonalKey && (
                      <Chip variant="flat" color="default" size="sm">
                        已保存个人密钥
                      </Chip>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="bordered"
                size="sm"
                onClick={handleTest}
                isLoading={testing}
                isDisabled={!state?.resolvedSource}
                startContent={<Plug className="h-3.5 w-3.5" />}
              >
                测试连接
              </Button>
            </div>
            {testResult && (
              <p className="mt-4 rounded-full bg-default-100/60 px-4 py-2 text-sm text-default-600">
                {testResult}
              </p>
            )}
          </Card>

          {/* Global API */}
          <Card variant="bordered" className="p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-[2rem] bg-secondary/10 p-3">
                <ShieldCheck className="h-5 w-5 text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-base font-semibold text-foreground">
                  全局 API
                </h3>
                <p className="mt-1 text-sm text-default-500">
                  由管理员统一配置密钥。这是一项需要审批的权限：申请通过后可以直接
                  使用共享密钥，无需自己申请 Key。
                </p>

                <div className="mt-4 space-y-3">
                  {state?.holdsGrant ? (
                    <>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={state.globalApiEnabled}
                          onChange={handleToggleGlobal}
                          disabled={globalBusy || !state.globalReady}
                          label={state.globalApiEnabled ? '关闭全局 API' : '开启全局 API'}
                        />
                        <span className="text-sm text-foreground">
                          {state.globalApiEnabled ? '已开启，AI 请求使用全局 API' : '已关闭'}
                        </span>
                      </div>
                      {!state.globalReady && (
                        <p className="flex items-center gap-2 rounded-full bg-warning/10 px-4 py-2 text-sm text-warning">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          全局 API 尚未配置完成，请联系管理员。
                        </p>
                      )}
                      <p className="text-xs text-default-400">
                        开启后一律使用全局 API，你保存的个人配置会保留但暂时不生效。
                      </p>
                    </>
                  ) : state?.hasPendingRequest ? (
                    <div className="rounded-[2rem] border border-default-200 bg-content2 p-4">
                      <p className="text-sm text-default-600">
                        你的申请正在等待管理员审批。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-[2rem] border border-default-200 bg-content2 p-4">
                      <p className="text-sm text-default-600">
                        你还没有全局 API 的使用权限，可以提交申请：
                      </p>
                      <Textarea
                        value={applyReason}
                        onChange={(e) => setApplyReason(e.target.value)}
                        placeholder="说明使用用途，便于管理员审批（可选）"
                        rows={3}
                      />
                      <Button color="primary" size="sm" onClick={handleApply} isLoading={applying}>
                        申请使用全局 API
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Personal provider */}
          <Card variant="bordered" className="p-6">
            <div className="mb-4">
              <h3 className="font-serif text-base font-semibold text-foreground">
                个人 API 配置
              </h3>
              <p className="mt-1 text-sm text-default-500">
                未使用全局 API 时，AI 请求使用这里选择的提供商与你的密钥。
              </p>
            </div>

            <ProviderList
              providers={providers}
              mode="personal"
              selectedId={selectedProvider}
              onSelect={setSelectedProvider}
            />

            <div className="mt-5 space-y-4 rounded-[2rem] border border-default-200 bg-content2 p-4">
              <Input
                label="个人 API Key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  state?.hasPersonalKey && selected?.id === state.personalProviderId
                    ? '已保存，留空则保持不变'
                    : `粘贴「${selected?.name ?? '所选提供商'}」的 API Key`
                }
                description="密钥仅用于服务端调用模型，保存后不会再回显"
              />

              <Select
                label="默认模型"
                options={modelOptions}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <Button color="primary" size="sm" onClick={() => handleSave(false)} isLoading={saving}>
                  保存配置
                </Button>
                {state?.hasPersonalKey && (
                  <Button
                    variant="light"
                    color="danger"
                    size="sm"
                    onClick={() => setShowClear(true)}
                    startContent={<Trash2 className="h-3.5 w-3.5" />}
                  >
                    清除个人配置
                  </Button>
                )}
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 text-xs text-default-400">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              提供商列表由管理员统一维护；如需新增厂商，请联系管理员。
            </p>
          </Card>
        </div>
      </motion.div>

      <ConfirmModal
        open={showClear}
        onClose={() => setShowClear(false)}
        onConfirm={handleClear}
        title="清除个人配置"
        message="清除后，未开启全局 API 时 AI 功能将不可用。确定继续吗？"
        confirmLabel="清除"
        danger
        loading={clearBusy}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
