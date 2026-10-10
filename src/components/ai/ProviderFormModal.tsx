'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Button,
  Chip,
  Input,
  Modal,
  Pressable,
  Select,
  Textarea,
} from '@/components/ui';
import {
  AI_PROTOCOLS,
  AI_PROTOCOL_LABELS,
  type AIProtocol,
  type DiscoveredModel,
  type ProviderDraft,
  type ProviderView,
} from '@/lib/ai-providers';

interface FormState {
  id: string;
  name: string;
  baseUrl: string;
  protocol: AIProtocol;
  modelsText: string;
  keyUrl: string;
}

const EMPTY_FORM: FormState = {
  id: '',
  name: '',
  baseUrl: '',
  protocol: AI_PROTOCOLS[0],
  modelsText: '',
  keyUrl: '',
};

/** Models are accepted one per line or comma-separated, whichever is pasted. */
function parseModels(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const model = raw.trim();
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

interface ProviderFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The provider being edited, or null when adding. */
  editing: ProviderView | null;
  protocols: { value: AIProtocol; label: string }[];
  onSubmit: (draft: ProviderDraft) => Promise<void>;
  /**
   * Fetch the model list for a draft.
   *
   * Injected rather than implemented here: the credential that may be used
   * differs by caller — the administrator has the global key, a user has a
   * personal one — and this form should not know which page opened it.
   */
  onDiscover: (draft: ProviderDraft, apiKey: string) => Promise<DiscoveredModel[]>;
  /** Optional credential field, shown only to callers it applies to. */
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
}

/**
 * The add/edit provider form.
 *
 * It lives in a modal rather than inline because the list it edits is long: an
 * inline form pushed the list below the fold, and "add" is a deliberate, rare
 * action that does not need permanent screen space.
 */
export function ProviderFormModal({
  open,
  onClose,
  editing,
  protocols,
  onSubmit,
  onDiscover,
  apiKeyLabel,
  apiKeyPlaceholder,
}: ProviderFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editing !== null;

  // Reset on open so a cancelled edit cannot leak into the next one.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDiscovered([]);
    setApiKey('');
    if (editing) {
      setForm({
        id: editing.id,
        name: editing.name,
        baseUrl: editing.baseUrl,
        protocol: editing.protocol,
        modelsText: editing.models.join('\n'),
        keyUrl: editing.keyUrl ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editing]);

  const models = useMemo(() => parseModels(form.modelsText), [form.modelsText]);

  const validate = useCallback((): string | null => {
    if (!isEditing && !isValidProviderId(form.id)) {
      return '提供商 ID 需为小写字母、数字、点、下划线或短横线，且以字母或数字开头';
    }
    if (!form.name.trim()) return '请填写显示名称';
    if (!/^https?:\/\//i.test(form.baseUrl.trim())) return 'API 地址需以 http:// 或 https:// 开头';
    if (models.length === 0) return '请至少填写一个模型名称';
    return null;
  }, [form, isEditing, models.length]);

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
      if (found.length === 0) {
        setError('该地址没有返回任何模型，请手动填写模型名称');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取模型列表失败');
    } finally {
      setDiscovering(false);
    }
  };

  const handleToggleModel = (id: string) => {
    const next = models.includes(id) ? models.filter((m) => m !== id) : [...models, id];
    setForm((prev) => ({ ...prev, modelsText: next.join('\n') }));
  };

  function buildDraft(): ProviderDraft {
    return {
      id: form.id.trim(),
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      protocol: form.protocol,
      models,
      keyUrl: form.keyUrl.trim(),
    };
  }

  const handleSubmit = async () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(buildDraft());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const selectedNotInList = discovered.filter((d) => !models.includes(d.id));

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      isDismissable={!saving}
      size="lg"
      title={isEditing ? '编辑提供商' : '添加提供商'}
      description={
        isEditing
          ? '修改接入地址、协议或模型列表。API Key 不在此处修改。'
          : '从内置目录中选择会自动填好参数，也可以完全自定义。'
      }
      footer={
        <>
          <Button variant="light" size="sm" onClick={onClose} isDisabled={saving}>
            取消
          </Button>
          <Button color="primary" size="sm" onClick={handleSubmit} isLoading={saving}>
            {isEditing ? '保存修改' : '添加'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="提供商 ID"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={isEditing}
            placeholder="acme-gw"
            description={isEditing ? 'ID 不可修改' : '用于内部标识，添加后不可修改'}
          />
          <Input
            label="显示名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme 网关"
          />
        </div>

        <Input
          label="API 地址"
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          description="只需填到版本号，系统会按协议自动补全路径"
        />

        <Select
          label="接口协议"
          options={
            protocols.length > 0
              ? protocols.map((p) => ({ value: p.value, label: p.label }))
              : AI_PROTOCOLS.map((p) => ({ value: p, label: AI_PROTOCOL_LABELS[p] }))
          }
          value={form.protocol}
          onChange={(e) => setForm({ ...form, protocol: e.target.value as AIProtocol })}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">模型列表</span>
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
          <Textarea
            value={form.modelsText}
            onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
            placeholder={'每行一个模型名称，例如：\nacme-large\nacme-small'}
            rows={4}
          />
          {selectedNotInList.length > 0 && (
            <div className="space-y-2 rounded-[2rem] border border-default-200 bg-content2 px-4 py-3">
              <p className="text-xs text-default-500">
                接口返回 {discovered.length} 个模型，点击加入列表：
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedNotInList.slice(0, 40).map((model) => (
                  <Pressable
                    key={model.id}
                    onClick={() => handleToggleModel(model.id)}
                    className="rounded-full border border-default-200 px-3 py-1 text-xs text-default-600 hover:border-primary/40 hover:text-foreground"
                  >
                    + {model.id}
                  </Pressable>
                ))}
              </div>
              {selectedNotInList.length > 40 && (
                <p className="text-xs text-default-500">
                  仅显示前 40 个，其余请手动填写。
                </p>
              )}
            </div>
          )}
        </div>

        <Input
          label="密钥申请地址（可选）"
          value={form.keyUrl}
          onChange={(e) => setForm({ ...form, keyUrl: e.target.value })}
          placeholder="https://platform.example.com/api-keys"
          description="填写后会在这里显示获取密钥的入口链接"
        />

        {apiKeyLabel && (
          <Input
            label={apiKeyLabel}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyPlaceholder}
            description="仅用于本次「从接口获取」模型列表，不会被保存"
            autoComplete="off"
          />
        )}

        {models.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {models.map((model) => (
              <Chip key={model} variant="flat" color="default" size="sm">
                {model}
              </Chip>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-full bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>
        )}
      </div>
    </Modal>
  );
}
