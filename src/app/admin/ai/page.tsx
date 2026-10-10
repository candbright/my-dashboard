'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Plug, Plus, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  Chip,
  ConfirmModal,
  Spinner,
  ToastContainer,
  useToast,
} from '@/components/ui';
import {
  ProviderCatalogModal,
  ProviderList,
} from '@/components/ai/ProviderList';
import { ProviderFormModal } from '@/components/ai/ProviderFormModal';
import {
  createProvider,
  deleteProvider,
  discoverModels,
  getGlobalAI,
  listProviderCatalog,
  listProviders,
  saveGlobalAI,
  testConnection,
  updateProvider,
} from '@/lib/api-client';
import type {
  AIProtocol,
  CatalogEntry,
  DiscoveredModel,
  GlobalAIState,
  ProviderDraft,
  ProviderView,
} from '@/lib/ai-providers';

/**
 * API 全局设置 — the administrator's view of the shared AI credential.
 *
 * Two responsibilities sit on this page and they are deliberately separate
 * cards: managing the provider list itself (everyone shares it), and choosing
 * which provider plus key the global API spends. Mixing them was what made the
 * previous design ambiguous — it was never clear whether a form was editing a
 * provider definition or the deployment's active credential.
 *
 * The administrator's *own* AI settings live on the user settings page, the same
 * one everybody else uses, which is why nothing here writes a personal
 * selection.
 */
export default function AdminAIGlobalPage() {
  const { toasts, addToast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [protocols, setProtocols] = useState<{ value: AIProtocol; label: string }[]>([]);
  const [globalState, setGlobalState] = useState<GlobalAIState | null>(null);

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formSeed, setFormSeed] = useState<ProviderDraft | null>(null);
  const [editing, setEditing] = useState<ProviderView | null>(null);
  const [deleting, setDeleting] = useState<ProviderView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const applyList = useCallback(
    (payload: { providers: ProviderView[]; protocols: { value: AIProtocol; label: string }[] }) => {
      setProviders(payload.providers);
      setProtocols(payload.protocols);
    },
    []
  );

  /**
   * Only the providers someone actually added.
   *
   * The server returns the whole directory — the built-in catalogue included —
   * because the picker needs it. Rendering all of it listed thirteen vendors this
   * deployment does not use, which read as "these are configured" and pushed the
   * added ones out of sight. The catalogue belongs in the picker.
   */
  const addedProviders = useMemo(() => providers.filter((p) => p.added), [providers]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, global] = await Promise.all([listProviders(), getGlobalAI()]);
      applyList(list);
      setGlobalState(global);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [applyList]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCatalog = async () => {
    setCatalogOpen(true);
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

  const openCustomForm = () => {
    setCatalogOpen(false);
    setEditing(null);
    setFormSeed(null);
    setFormOpen(true);
  };

  const openCatalogEntry = (entry: CatalogEntry) => {
    setCatalogOpen(false);
    setEditing(null);
    setFormSeed({
      id: entry.id,
      name: entry.name,
      baseUrl: entry.baseUrl,
      protocol: entry.protocol,
      models: entry.models,
      keyUrl: entry.keyUrl ?? '',
    });
    setFormOpen(true);
  };

  const openEdit = (provider: ProviderView) => {
    setEditing(provider);
    setFormSeed({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      protocol: provider.protocol,
      models: provider.models,
      keyUrl: provider.keyUrl ?? '',
    });
    setFormOpen(true);
  };

  const handleSubmitProvider = async (
    draft: ProviderDraft,
    key: { apiKey: string; clearKey: boolean }
  ) => {
    const payload = editing
      ? await updateProvider(editing.id, draft, key)
      : await createProvider(draft);
    applyList(payload);
    // The catalogue's "already added" flags are now stale; drop the cache so the
    // next open reflects reality instead of greying out the wrong entries.
    setCatalog([]);
    addToast('success', editing ? '提供商已更新' : '提供商已添加');
    const refreshed = await getGlobalAI();
    setGlobalState(refreshed);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const payload = await deleteProvider(deleting.id);
      applyList(payload);
      setCatalog([]);
      const cleaned = payload.cleanedUpUserIds?.length ?? 0;
      addToast(
        'success',
        cleaned > 0
          ? `已删除，并清理了 ${cleaned} 位用户的关联配置`
          : '提供商已删除'
      );
      const refreshed = await getGlobalAI();
      setGlobalState(refreshed);
      setDeleting(null);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleSelectGlobal = async (id: string) => {
    if (globalState?.activeProviderId === id) return;
    try {
      const next = await saveGlobalAI({ providerId: id });
      setGlobalState((prev) => (prev ? { ...prev, ...next } : prev));
      const list = await listProviders();
      applyList(list);
      addToast('success', '已切换全局 API 使用的提供商');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '切换失败');
    }
  };

  const handleTest = async () => {
    if (!globalState?.activeProviderId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(globalState.activeProviderId);
      setTestResult(
        `连接成功 · ${result.model}${result.latencyMs ? ` · ${result.latencyMs} ms` : ''}`
      );
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : '连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleDiscover = async (draft: ProviderDraft, apiKey: string): Promise<DiscoveredModel[]> => {
    const result = await discoverModels({
      provider: draft.id,
      baseUrl: draft.baseUrl,
      protocol: draft.protocol,
      apiKey,
      // Any provider with a stored credential can be refreshed without re-entering
      // the key, not just the active one — the key belongs to the provider.
      useStoredKey:
        !apiKey && providers.some((p) => p.id === draft.id && p.keyConfigured),
    });
    return result.models;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="md" />
      </div>
    );
  }

  if (loadError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight mb-1">API 全局设置</h1>
        <p className="text-sm text-default-500 mb-8">配置全体用户共享的 AI 凭据</p>
        <Card variant="bordered" className="p-6">
          <p className="text-sm text-danger">{loadError}</p>
          <Button className="mt-4" variant="bordered" size="sm" onClick={load}>
            重新加载
          </Button>
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
        <h1 className="text-2xl font-bold tracking-tight mb-1">API 全局设置</h1>
        <p className="text-sm text-default-500 mb-8">
          配置全体用户可申请的共享 AI 凭据，以及平台可用的提供商列表
        </p>

        <div className="space-y-6">
          {/* Status */}
          <Card variant="bordered" className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-[2rem] bg-secondary/10 p-3">
                  <ShieldCheck className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-semibold text-foreground">
                    全局 API 状态
                  </h3>
                  <p className="mt-1 text-sm text-default-500">
                    {globalState?.ready
                      ? `当前使用「${globalState.activeProviderName || globalState.activeProviderId}」${
                          globalState.model ? ` · ${globalState.model}` : ''
                        }`
                      : '尚未完成配置：请选择提供商并填写 API Key'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {globalState?.ready ? (
                      <Chip variant="flat" color="success" size="sm">
                        可用
                      </Chip>
                    ) : (
                      <Chip variant="flat" color="warning" size="sm">
                        未就绪
                      </Chip>
                    )}
                    {(globalState?.pendingRequests.length ?? 0) > 0 && (
                      <Chip variant="flat" color="primary" size="sm">
                        {globalState?.pendingRequests.length} 条待审批申请
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
                isDisabled={!globalState?.ready}
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

          {/* Global provider + key */}
          <Card variant="bordered" className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-base font-semibold text-foreground">
                  全局 API 使用的提供商
                </h3>
                <p className="mt-1 text-sm text-default-500">
                  用户开启「使用全局 API」后，请求会走这里选中的提供商。
                </p>
              </div>
              <Button
                variant="bordered"
                size="sm"
                onClick={openCatalog}
                startContent={<Plus className="h-3.5 w-3.5" />}
              >
                添加提供商
              </Button>
            </div>

            <ProviderList
              providers={addedProviders}
              mode="global"
              selectedId={globalState?.activeProviderId ?? ''}
              onSelect={handleSelectGlobal}
              canManage
              onEdit={openEdit}
              onDelete={setDeleting}
              onAdd={openCatalog}
              emptyHint="还没有添加提供商。点击「添加提供商」，从第三方厂商目录中选择，或自行填写。"
            />
          </Card>

          {/* What this page does not do */}
          <Card variant="bordered" className="p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-[2rem] bg-default-100 p-3">
                <AlertTriangle className="h-5 w-5 text-default-500" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-base font-semibold text-foreground">
                  管理员自己的 AI 配置
                </h3>
                <p className="text-sm text-default-500">
                  你自己的提供商与个人密钥在「设置 → API 配置」中设置。
                </p>
              </div>
            </div>
          </Card>
        </div>
      </motion.div>

      <ProviderCatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        catalog={catalog}
        loading={catalogLoading}
        onPick={openCatalogEntry}
        onCustom={openCustomForm}
      />

      <ProviderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        protocols={protocols}
        onSubmit={handleSubmitProvider}
        onDiscover={handleDiscover}
        apiKeyLabel={
          editing ? `「${editing.name}」的全局 API Key` : '临时 API Key（可选）'
        }
        apiKeyPlaceholder={
          editing
            ? editing.keyConfigured
              ? '已保存，重新填写可覆盖'
              : '粘贴 API Key'
            : '用于立即拉取该提供商的模型列表'
        }
      />

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="删除提供商"
        message={`删除「${deleting?.name ?? ''}」后，引用它的全局配置与用户配置会被一并清理。此操作不可撤销。`}
        confirmLabel="删除"
        danger
        loading={deleteBusy}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
