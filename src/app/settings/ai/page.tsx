'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  KeyRound,
  Plus,
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
import { ProviderFormModal } from '@/components/ai/ProviderFormModal';
import { cn } from '@/lib/cn';
import {
  clearUserAI,
  createProvider,
  deleteProvider,
  discoverModels,
  getUserAI,
  listProviderCatalog,
  listProviders,
  saveUserAI,
  setUserGlobalAI,
  submitApproval,
  testConnection,
  updateProvider,
} from '@/lib/api-client';
import type {
  AIProtocol,
  CatalogEntry,
  ProviderDraft,
  ProviderView,
  UserAIState,
} from '@/lib/ai-providers';

/**
 * API 配置 — the AI settings page every signed-in account sees.
 *
 * Administrators and ordinary users get the identical page: the provider list,
 * a personal provider plus key, and the global-API switch. Users add providers
 * with the same form the administrator uses globally — but what they create is
 * THEIR configuration: personal providers are visible to nobody else and never
 * touch the shared list. The scopes differ in where they take effect, not in
 * how they are created.
 */
export default function UserAISettingsPage() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<UserAIState | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [protocols, setProtocols] = useState<{ value: AIProtocol; label: string }[]>([]);

  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  const [globalBusy, setGlobalBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyReason, setApplyReason] = useState('');

  const [testingId, setTestingId] = useState<string | null>(null);

  const [showClear, setShowClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  // Personal provider management — the same add/edit flow as the admin page,
  // scoped to the caller.
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderView | null>(null);
  const [deleting, setDeleting] = useState<ProviderView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [config, list] = await Promise.all([getUserAI(), listProviders()]);
      setState(config);
      setProviders(list.providers);
      setProtocols(list.protocols);
      // Only providers someone added are selectable. The server also returns the
      // built-in catalogue, but that belongs in the add-provider picker: listing
      // it would offer thirteen vendors this deployment has no key for.
      const added = list.providers.filter((p) => p.added);
      setSelectedProvider(config.personalProviderId || added[0]?.id || '');
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

  /** The providers this user may pick: the shared list plus their own. */
  const addedProviders = useMemo(() => providers.filter((p) => p.added), [providers]);

  /** Refresh list + state after a personal-scope mutation. */
  const refreshAfterMutation = useCallback(
    async (payload: { providers: ProviderView[]; protocols: { value: AIProtocol; label: string }[] }) => {
      setProviders(payload.providers);
      setProtocols(payload.protocols);
      const config = await getUserAI();
      setState(config);
    },
    []
  );

  /** Open the add form, lazily loading the vendor catalogue for its dropdown. */
  const openAdd = async () => {
    setEditing(null);
    setFormOpen(true);
    if (catalog.length > 0) return;
    setCatalogLoading(true);
    try {
      const payload = await listProviderCatalog();
      setCatalog(payload.catalog);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '获取目录失败');
    } finally {
      setCatalogLoading(false);
    }
  };

  const openEdit = (provider: ProviderView) => {
    setEditing(provider);
    setFormOpen(true);
  };

  /** Create/update a PERSONAL provider — same form as the admin's, own config. */
  const handleSubmitProvider = async (
    draft: ProviderDraft,
    key: { apiKey: string; clearKey: boolean }
  ) => {
    const payload = editing
      ? await updateProvider(editing.id, draft, key, 'personal')
      : await createProvider(draft, { apiKey: key.apiKey }, 'personal');
    await refreshAfterMutation(payload);
    setCatalog([]);
    addToast('success', editing ? '提供商已更新' : '提供商已添加');
  };

  const handleDeleteProvider = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const payload = await deleteProvider(deleting.id, 'personal');
      await refreshAfterMutation(payload);
      setCatalog([]);
      if (selectedProvider === deleting.id) setSelectedProvider('');
      addToast('success', '提供商已删除');
      setDeleting(null);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteBusy(false);
    }
  };

  /** Switch the one enabled model — only allowed on the caller's own entries. */
  const handleSetActiveModel = async (provider: ProviderView, next: string) => {
    if (!provider.manageable || (provider.activeModel || provider.models[0]) === next) return;
    setModelBusy(`${provider.id}:${next}`);
    try {
      const payload = await updateProvider(provider.id, {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        protocol: provider.protocol,
        models: provider.models,
        activeModel: next,
        keyUrl: provider.keyUrl ?? '',
      }, undefined, 'personal');
      setProviders(payload.providers);
      setProtocols(payload.protocols);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '切换模型失败');
    } finally {
      setModelBusy(null);
    }
  };

  /**
   * The personal section is read-only while the global API is on.
   *
   * This mirrors what the resolver actually does: with the switch on, AI requests
   * go to the shared credential and the personal record is not consulted at all.
   * Leaving the fields editable invited the user to "fix" settings that had no
   * effect.
   */
  const personalLocked = Boolean(state?.globalApiEnabled && state?.holdsGrant);

  const selected = useMemo(
    () => addedProviders.find((p) => p.id === selectedProvider) ?? null,
    [addedProviders, selectedProvider]
  );

  // An empty list is itself a selectable option: it means "use the provider's
  // own default model", which is what the backend falls back to. Only the one
  // enabled model is usable, so it is the only real choice.
  const modelOptions = useMemo(() => {
    const opts = [{ value: '', label: '使用提供商默认模型' }];
    const active = selected?.activeModel || selected?.models[0];
    if (active) opts.push({ value: active, label: active });
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

  const handleTest = async (provider: ProviderView) => {
    if (!provider.keyConfigured) return;
    setTestingId(provider.id);
    try {
      const result = await testConnection(provider.id);
      addToast(
        'success',
        `连接成功 · ${result.model}${result.latencyMs ? ` · ${result.latencyMs} ms` : ''}`
      );
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '连接测试失败');
    } finally {
      setTestingId(null);
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
      // The stored credential may be reused when the user already filed one for
      // this provider; the server never lends them the shared key.
      useStoredKey:
        !key &&
        providers.some((p) => p.id === draft.id && p.scope === 'personal' && p.keyConfigured),
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
        <h1 className="text-2xl font-bold tracking-tight font-serif mb-1">API 配置</h1>
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
        <h1 className="text-2xl font-bold tracking-tight font-serif mb-1">API 配置</h1>
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
                  由管理员统一配置，需要申请后使用。
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
                    </>
                  ) : state?.hasPendingRequest ? (
                    <div className="rounded-[2rem] border border-default-200 bg-content2 p-4">
                      <p className="text-sm text-default-600">
                        申请已提交，等待管理员审批。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-[2rem] border border-default-200 bg-content2 p-4">
                      <Textarea
                        value={applyReason}
                        onChange={(e) => setApplyReason(e.target.value)}
                        placeholder="说明使用用途，便于管理员审批（可选）"
                        rows={2}
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
          <Card variant="bordered" className={cn('p-6', personalLocked && 'opacity-60')}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-base font-semibold text-foreground">
                  个人 API 配置
                </h3>
                <p className="mt-1 text-sm text-default-500">
                  {personalLocked
                    ? '全局 API 已开启，以下配置暂不生效。关闭全局 API 后即可修改。'
                    : '全局 API 未开启时，AI 请求使用这里选择的提供商与你的密钥。'}
                </p>
              </div>
              <Button
                variant="bordered"
                size="sm"
                onClick={openAdd}
                isDisabled={personalLocked}
                startContent={<Plus className="h-3.5 w-3.5" />}
              >
                添加提供商
              </Button>
            </div>

            <ProviderList
              providers={addedProviders}
              mode="personal"
              selectedId={selectedProvider}
              onSelect={personalLocked ? undefined : setSelectedProvider}
              canManage={!personalLocked}
              onEdit={openEdit}
              onDelete={setDeleting}
              onAdd={openAdd}
              onSetActiveModel={handleSetActiveModel}
              modelBusy={modelBusy}
              onTest={handleTest}
              testingId={testingId}
              emptyHint="还没有可用的提供商。点击「添加提供商」，从第三方厂商目录中选择，或自行填写。"
            />

            <div className="mt-5 space-y-4 rounded-[2rem] border border-default-200 bg-content2 p-4">
              <Input
                label="个人 API Key"
                type="password"
                autoComplete="off"
                disabled={personalLocked}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  selected?.scope === 'personal' && selected.keyConfigured
                    ? '已保存，留空则保持不变'
                    : state?.hasPersonalKey && selected?.id === state.personalProviderId
                      ? '已保存，留空则保持不变'
                      : `粘贴「${selected?.name ?? '所选提供商'}」的 API Key`
                }
              />

              <Select
                label="默认模型"
                options={modelOptions}
                value={model}
                disabled={personalLocked}
                onChange={(e) => setModel(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  color="primary"
                  size="sm"
                  onClick={() => handleSave(false)}
                  isLoading={saving}
                  isDisabled={personalLocked}
                >
                  保存配置
                </Button>
                {state?.hasPersonalKey && !personalLocked && (
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
              标有「个人」的提供商只有你自己可见；其余由管理员维护。
            </p>
          </Card>
        </div>
      </motion.div>

      <ProviderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        catalog={catalog}
        catalogLoading={catalogLoading}
        protocols={protocols}
        onSubmit={handleSubmitProvider}
        onDiscover={handleDiscover}
        apiKeyLabel={editing ? `「${editing.name}」的个人 API Key` : 'API Key（可选）'}
        apiKeyPlaceholder={
          editing
            ? editing.keyConfigured
              ? '已保存，重新填写可覆盖'
              : '粘贴 API Key'
            : '粘贴厂商的 API Key，保存后立即生效'
        }
      />

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDeleteProvider}
        title="删除提供商"
        message={`删除「${deleting?.name ?? ''}」后，其密钥与选择状态会一并清除。此操作不可撤销。`}
        confirmLabel="删除"
        danger
        loading={deleteBusy}
      />

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
