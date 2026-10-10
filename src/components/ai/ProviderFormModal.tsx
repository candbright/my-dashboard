'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, GripVertical, Loader2, Plus, X } from 'lucide-react';
import {
  Button,
  Input,
  Modal,
  Pressable,
  Select,
} from '@/components/ui';
import {
  AI_PROTOCOLS,
  AI_PROTOCOL_LABELS,
  type AIProtocol,
  type CatalogEntry,
  type DiscoveredModel,
  type ProviderDraft,
  type ProviderView,
} from '@/lib/ai-providers';
import { cn } from '@/lib/cn';

/** Models are held as a list of rows so each one can be edited on its own. */
type ModelRows = { key: string; value: string }[];

let rowSeq = 0;
const newRow = (value = ''): { key: string; value: string } => ({
  key: `m${rowSeq++}`,
  value,
});

function toRows(models: string[]): ModelRows {
  return models.length > 0 ? models.map((m) => newRow(m)) : [newRow()];
}

/** Rows in, trimmed non-empty model names out, duplicates dropped. */
function fromRows(rows: ModelRows): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const model = row.value.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

/** A provider id becomes a URL path segment, so it is constrained here too. */
function isValidProviderId(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,39}$/.test(id);
}

/** Derive an id from a vendor name, so the common case needs no typing. */
function deriveId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+$/, '')
    .slice(0, 40);
}

/** The vendor-select value meaning "none of the catalogue entries". */
const CUSTOM_VENDOR = '__custom__';

interface ProviderFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The provider being edited, or null when adding. */
  editing: ProviderView | null;
  /** The built-in vendor catalogue, for the add-mode dropdown. */
  catalog: CatalogEntry[];
  catalogLoading?: boolean;
  protocols: { value: AIProtocol; label: string }[];
  /**
   * Submit the definition plus the credential intent.
   *
   * The key rides along because it belongs to the provider: the add form saves
   * it so a provider works the moment it appears, and the edit form is where a
   * key gets rotated or removed.
   */
  onSubmit: (draft: ProviderDraft, key: { apiKey: string; clearKey: boolean }) => Promise<void>;
  /**
   * Fetch the model list for a draft.
   *
   * Injected rather than implemented here: the credential that may be used
   * differs by caller — the administrator has the global key, a user has a
   * personal one — and this form should not know which page opened it.
   */
  onDiscover: (draft: ProviderDraft, apiKey: string) => Promise<DiscoveredModel[]>;
  /** Optional credential field label/placeholder overrides. */
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
}

/**
 * The add/edit provider form — one modal, DSH-style.
 *
 * Adding starts from a vendor dropdown. Picking a catalogue vendor pre-fills
 * everything except the key; the endpoint, protocol and model list sit behind a
 * collapsed "自定义设置" section because the catalogue values are almost always
 * the right ones. Picking "自定义提供商" expands the same section with blank
 * fields. Editing skips the dropdown — the vendor choice is the entry itself.
 */
export function ProviderFormModal({
  open,
  onClose,
  editing,
  catalog,
  catalogLoading = false,
  protocols,
  onSubmit,
  onDiscover,
  apiKeyLabel,
  apiKeyPlaceholder,
}: ProviderFormModalProps) {
  const [vendorId, setVendorId] = useState(CUSTOM_VENDOR);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [id, setId] = useState('');
  /** True once the id has been auto-derived and may be rewritten by the name. */
  const [idDerived, setIdDerived] = useState(true);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [protocol, setProtocol] = useState<AIProtocol>(AI_PROTOCOLS[0]);
  const [rows, setRows] = useState<ModelRows>([newRow()]);
  const [keyUrl, setKeyUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  /** Edit mode only: the administrator asked to delete the stored credential. */
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editing !== null;
  const isCustom = vendorId === CUSTOM_VENDOR;

  // Reset on open so a cancelled edit cannot leak into the next one.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDiscovered([]);
    setApiKey('');
    setClearKey(false);
    if (editing) {
      setVendorId(CUSTOM_VENDOR);
      setAdvancedOpen(true);
      setId(editing.id);
      setIdDerived(false);
      setName(editing.name);
      setBaseUrl(editing.baseUrl);
      setProtocol(editing.protocol);
      setKeyUrl(editing.keyUrl ?? '');
      setRows(toRows(editing.models));
    } else {
      // Default to the first catalogue vendor: the common case is "add a known
      // vendor and paste its key", which then needs no other field.
      const first = catalog[0];
      if (first) {
        setVendorId(first.id);
        setAdvancedOpen(false);
        setId(first.id);
        setIdDerived(false);
        setName(first.name);
        setBaseUrl(first.baseUrl);
        setProtocol(first.protocol);
        setKeyUrl(first.keyUrl ?? '');
        setRows(toRows(first.models));
      } else {
        setVendorId(CUSTOM_VENDOR);
        setAdvancedOpen(true);
        setId('');
        setIdDerived(true);
        setName('');
        setBaseUrl('');
        setProtocol(protocols[0]?.value ?? AI_PROTOCOLS[0]);
        setKeyUrl('');
        setRows([newRow()]);
      }
    }
  }, [open, editing, catalog, protocols]);

  const vendorOptions = useMemo(
    () => [
      ...catalog.map((entry) => ({
        value: entry.id,
        // Already-added vendors stay visible but marked: the answer to "I want
        // to change it" is the edit button on its row, not a second copy.
        label: entry.alreadyAdded ? `${entry.name}（已添加）` : entry.name,
      })),
      { value: CUSTOM_VENDOR, label: '自定义提供商' },
    ],
    [catalog]
  );

  /** Switching vendor reseeds the whole form from the catalogue entry. */
  const handleVendorChange = (value: string) => {
    setVendorId(value);
    setError(null);
    setDiscovered([]);
    if (value === CUSTOM_VENDOR) {
      setAdvancedOpen(true);
      setId('');
      setIdDerived(true);
      setName('');
      setBaseUrl('');
      setProtocol(protocols[0]?.value ?? AI_PROTOCOLS[0]);
      setKeyUrl('');
      setRows([newRow()]);
      return;
    }
    const entry = catalog.find((e) => e.id === value);
    if (!entry) return;
    setAdvancedOpen(false);
    setId(entry.id);
    setIdDerived(false);
    setName(entry.name);
    setBaseUrl(entry.baseUrl);
    setProtocol(entry.protocol);
    setKeyUrl(entry.keyUrl ?? '');
    setRows(toRows(entry.models));
  };

  const models = fromRows(rows);

  const handleNameChange = (value: string) => {
    setName(value);
    if (idDerived) setId(deriveId(value));
  };

  const setRow = (key: string, value: string) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, value } : row)));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length === 1 ? [newRow()] : prev.filter((row) => row.key !== key)));

  const buildDraft = useCallback(
    (): ProviderDraft => ({
      id: id.trim(),
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      protocol,
      models,
      // The enabled-model choice is managed from the list's radio switches,
      // not from this form, so a save carries the current value through
      // unchanged.
      activeModel: isEditing ? (editing?.activeModel ?? '') : '',
      keyUrl: keyUrl.trim(),
    }),
    [id, name, baseUrl, protocol, models, keyUrl, isEditing, editing]
  );

  const validate = useCallback((): string | null => {
    if (!isEditing && !isValidProviderId(id.trim())) {
      return '提供商 ID 需为小写字母、数字、点、下划线或短横线，且以字母或数字开头';
    }
    if (!isEditing && !isCustom && catalog.find((e) => e.id === vendorId)?.alreadyAdded) {
      return '该厂商已在列表中，如需修改请使用编辑';
    }
    if (!name.trim()) return '请填写显示名称';
    if (!/^https?:\/\//i.test(baseUrl.trim())) return 'API 地址需以 http:// 或 https:// 开头';
    if (models.length === 0) return '请至少填写一个模型名称';
    return null;
  }, [baseUrl, catalog, id, isCustom, isEditing, models.length, name, vendorId]);

  const handleDiscover = async () => {
    setError(null);
    const draft = buildDraft();
    if (!/^https?:\/\//i.test(draft.baseUrl)) {
      setError('请先填写有效的 API 地址');
      return;
    }
    setDiscovering(true);
    try {
      const found = await onDiscover(draft, apiKey);
      setDiscovered(found);
      if (found.length === 0) setError('该地址没有返回任何模型，请手动填写模型名称');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取模型列表失败');
    } finally {
      setDiscovering(false);
    }
  };

  /** Append a discovered model that is not already a row. */
  const handleAddDiscovered = (modelId: string) => {
    if (models.includes(modelId)) return;
    setRows((prev) => {
      const blank = prev.findIndex((row) => row.value.trim() === '');
      const next = blank >= 0
        ? prev.map((row, i) => (i === blank ? { ...row, value: modelId } : row))
        : [...prev, newRow(modelId)];
      return next;
    });
    setDiscovered((prev) => prev.filter((m) => m.id !== modelId));
  };

  const handleSubmit = async () => {
    const message = validate();
    if (message) {
      setError(message);
      // A validation failure about a hidden field is unactionable — expand the
      // section so the administrator can see what the error refers to.
      if (!advancedOpen) setAdvancedOpen(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(buildDraft(), {
        apiKey: apiKey.trim(),
        clearKey: isEditing && clearKey,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const pending = discovered.filter((d) => !models.includes(d.id));

  /** The model row editor, shared by the expanded section in every mode. */
  const modelEditor = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">模型</span>
        <Button
          variant="bordered"
          size="sm"
          onClick={handleDiscover}
          isDisabled={discovering}
          startContent={
            discovering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )
          }
        >
          {discovering ? '获取中' : '从接口获取'}
        </Button>
      </div>

      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-2">
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-default-300" aria-hidden />
            <Input
              value={row.value}
              onChange={(e) => setRow(row.key, e.target.value)}
              placeholder={`模型 ${index + 1}`}
              inputSize="sm"
            />
            <Button
              variant="light"
              size="sm"
              isIconOnly
              aria-label={`移除第 ${index + 1} 个模型`}
              onClick={() => removeRow(row.key)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        variant="light"
        size="sm"
        onClick={addRow}
        startContent={<Plus className="h-3.5 w-3.5" />}
      >
        添加模型
      </Button>

      {pending.length > 0 && (
        <div className="space-y-2 rounded-[2rem] border border-default-200 bg-content2 px-4 py-3">
          <p className="text-xs text-default-500">点击加入：</p>
          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
            {pending.slice(0, 40).map((model) => (
              <Pressable
                key={model.id}
                onClick={() => handleAddDiscovered(model.id)}
                className="rounded-full border border-default-200 px-3 py-1 text-xs text-default-600 hover:border-primary/40 hover:text-foreground"
              >
                + {model.id}
              </Pressable>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const keyField = apiKeyLabel ? (
    <div className="space-y-2">
      <Input
        label={apiKeyLabel}
        type="password"
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          if (e.target.value.trim()) setClearKey(false);
        }}
        placeholder={apiKeyPlaceholder}
        autoComplete="off"
        disabled={clearKey}
        description={
          isEditing && editing?.keyConfigured && !clearKey
            ? '已保存，留空则保持不变'
            : undefined
        }
      />
      {isEditing && editing?.keyConfigured && (
        <Pressable
          onClick={() => setClearKey((v) => !v)}
          aria-pressed={clearKey}
          className={cn(
            'text-xs',
            clearKey ? 'text-default-500' : 'text-danger hover:underline'
          )}
        >
          {clearKey ? '取消移除，保留已保存的密钥' : '移除已保存的密钥'}
        </Pressable>
      )}
    </div>
  ) : null;

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      isDismissable={!saving}
      size="md"
      title={isEditing ? '编辑提供商' : '添加提供商'}
      footer={
        <>
          <Button variant="light" size="sm" onClick={onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" size="sm" onClick={handleSubmit} isLoading={saving}>
            {isEditing ? '保存' : '添加'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!isEditing && (
          <Select
            label="选择厂商"
            options={vendorOptions}
            value={vendorId}
            onChange={(e) => handleVendorChange(e.target.value)}
            disabled={catalogLoading}
          />
        )}

        {/* Adding a catalogue vendor needs only the key; everything else is
            pre-filled and lives behind this collapsible. */}
        {!isEditing && !isCustom ? (
          <>
            {keyField}
            <div className="space-y-4">
              <Pressable
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                className="flex items-center gap-1.5 text-sm text-default-500 hover:text-foreground"
              >
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                自定义设置（API 地址、模型列表等）
              </Pressable>
              {advancedOpen && (
                <div className="space-y-5 border-l-2 border-default-200 pl-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="显示名称"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                    <Input
                      label="提供商 ID"
                      value={id}
                      disabled
                      description="与厂商目录一致，不可修改"
                    />
                  </div>
                  <Input
                    label="API 地址"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    description="填到版本号即可，系统按协议补全路径"
                  />
                  <Select
                    label="接口协议"
                    options={
                      protocols.length > 0
                        ? protocols.map((p) => ({ value: p.value, label: p.label }))
                        : AI_PROTOCOLS.map((p) => ({ value: p, label: AI_PROTOCOL_LABELS[p] }))
                    }
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as AIProtocol)}
                  />
                  {modelEditor}
                  <Input
                    label="密钥申请地址"
                    value={keyUrl}
                    onChange={(e) => setKeyUrl(e.target.value)}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="显示名称"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme 网关"
              />
              <Input
                label="提供商 ID"
                value={id}
                onChange={(e) => {
                  setIdDerived(false);
                  setId(e.target.value);
                }}
                disabled={isEditing}
                placeholder="acme-gw"
                description={isEditing ? '添加后不可修改' : undefined}
              />
            </div>

            <Input
              label="API 地址"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              description="填到版本号即可，系统按协议补全路径"
            />

            <Select
              label="接口协议"
              options={
                protocols.length > 0
                  ? protocols.map((p) => ({ value: p.value, label: p.label }))
                  : AI_PROTOCOLS.map((p) => ({ value: p, label: AI_PROTOCOL_LABELS[p] }))
              }
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as AIProtocol)}
            />

            {modelEditor}

            <Input
              label="密钥申请地址"
              value={keyUrl}
              onChange={(e) => setKeyUrl(e.target.value)}
              placeholder="https://platform.example.com/api-keys"
            />

            {keyField}
          </>
        )}

        {error && (
          <p className="rounded-full bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>
        )}
      </div>
    </Modal>
  );
}
