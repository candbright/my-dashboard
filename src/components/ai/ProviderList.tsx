'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  Chip,
  EmptyState,
  Input,
  Modal,
  Pressable,
  Spinner,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { CatalogEntry, ProviderView } from '@/lib/ai-providers';

/**
 * Display order for the built-in catalogue.
 *
 * The backend returns the catalogue grouped by category but does not dictate a
 * browser order; listing the known ids here keeps the picker stable and lets an
 * entry the browser has never heard of (added by a newer server) fall to the
 * end under 其他 instead of disappearing.
 */
const CATEGORY_ORDER: { key: string; label: string; ids: string[] }[] = [
  {
    key: 'international',
    label: '国际厂商',
    ids: ['openai', 'anthropic', 'google', 'xai', 'mistral', 'groq'],
  },
  {
    key: 'domestic',
    label: '国内厂商',
    ids: ['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax'],
  },
  {
    key: 'aggregator',
    label: '聚合平台',
    ids: ['openrouter', 'siliconflow'],
  },
];

const OTHER_CATEGORY = { key: 'other', label: '其他' };

/** Group catalogue entries for display, preserving the order above. */
function groupCatalog(catalog: CatalogEntry[]) {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const groups: { key: string; label: string; entries: CatalogEntry[] }[] = [];

  for (const category of CATEGORY_ORDER) {
    const entries = category.ids
      .map((id) => byId.get(id))
      .filter((entry): entry is CatalogEntry => Boolean(entry));
    if (entries.length > 0) groups.push({ ...category, entries });
  }

  const known = new Set(CATEGORY_ORDER.flatMap((c) => c.ids));
  const rest = catalog.filter((entry) => !known.has(entry.id));
  if (rest.length > 0) groups.push({ ...OTHER_CATEGORY, entries: rest });

  return groups;
}

interface ProviderListProps {
  providers: ProviderView[];
  loading?: boolean;
  /**
   * What selecting a row means.
   *
   * `global` picks the provider the shared credential is spent on; `personal`
   * picks the caller's own. They are separate choices on the administrator's
   * page — an administrator may set the global provider to something they would
   * not personally choose — so the list has to be told which one it is editing
   * rather than guessing from the viewer's role.
   */
  mode: 'global' | 'personal';
  /** Id currently selected for this mode. */
  selectedId: string;
  onSelect?: (id: string) => void;
  /** Administrators get edit and delete affordances. */
  canManage?: boolean;
  onEdit?: (provider: ProviderView) => void;
  onDelete?: (provider: ProviderView) => void;
  onAdd?: () => void;
  /** Rendered under the heading, e.g. the global key field. */
  action?: React.ReactNode;
  emptyHint?: string;
  /** Per-provider inline status, e.g. "当前生效" or "缺少 API Key". */
  renderStatus?: (provider: ProviderView) => React.ReactNode;
}

/**
 * The provider list, rendered as selectable rows with a built-in badge.
 *
 * Both settings pages show this one list: there is a single shared provider
 * catalogue, and the difference between the pages is what each may do with it,
 * not what each may see.
 */
export function ProviderList({
  providers,
  loading = false,
  mode,
  selectedId,
  onSelect,
  canManage = false,
  onEdit,
  onDelete,
  onAdd,
  action,
  emptyHint,
  renderStatus,
}: ProviderListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <EmptyState
        icon={<KeyRound className="h-6 w-6" />}
        title="还没有可用的提供商"
        description={emptyHint ?? '请先添加一个提供商，之后即可在这里选择生效的厂商。'}
        action={
          canManage && onAdd ? (
            <Button color="primary" size="sm" onClick={onAdd} startContent={<Plus className="h-4 w-4" />}>
              添加提供商
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {action}
      <div className="space-y-2">
        {providers.map((provider) => {
          const selected = provider.id === selectedId;
          // With no `onSelect` the list is read-only, so the row must not still
          // advertise itself as clickable.
          const selectable = Boolean(onSelect) && provider.selectable;
          return (
            <div
              key={provider.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-[2rem] border px-4 py-3 transition-colors duration-500 ease-in-out',
                selected
                  ? 'border-primary/40 bg-primary/5'
                  : selectable
                    ? 'border-default-200 bg-transparent hover:border-default-300'
                    : 'border-default-200 bg-transparent'
              )}
            >
              <Pressable
                onClick={() => onSelect?.(provider.id)}
                disabled={!selectable}
                aria-label={`选择 ${provider.name}`}
                aria-pressed={selected}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-default-300',
                  !selectable && 'cursor-not-allowed opacity-50'
                )}
              >
                {selected && <Check className="h-3 w-3" />}
              </Pressable>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-foreground">{provider.name}</span>
                  {provider.isGlobalActive && (
                    <Chip variant="flat" color="secondary" size="sm">
                      全局 API 使用
                    </Chip>
                  )}
                  {!provider.selectable && (
                    <Chip variant="flat" color="warning" size="sm">
                      未配置完成
                    </Chip>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-500">
                  <span className="truncate">{provider.baseUrl}</span>
                  <span>·</span>
                  <span>{provider.protocolLabel}</span>
                  <span>·</span>
                  <span>{provider.models.length} 个模型</span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {provider.keyConfigured ? (
                  <Chip variant="flat" color="success" size="sm">
                    已配置 Key
                  </Chip>
                ) : (
                  <Chip variant="flat" color="default" size="sm">
                    未配置 Key
                  </Chip>
                )}
                {renderStatus?.(provider)}

                {canManage && (
                  <>
                    <Button
                      variant="light"
                      size="sm"
                      isIconOnly
                      aria-label={`编辑 ${provider.name}`}
                      onClick={() => onEdit?.(provider)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="light"
                      size="sm"
                      isIconOnly
                      aria-label={`删除 ${provider.name}`}
                      onClick={() => onDelete?.(provider)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Add-provider picker
// ──────────────────────────────────────────────────────────────

interface CatalogModalProps {
  open: boolean;
  onClose: () => void;
  catalog: CatalogEntry[];
  loading: boolean;
  /** The picker's own tab and search state live here, not in the page. */
  onPick: (entry: CatalogEntry) => void;
  onCustom: () => void;
}

/**
 * The add-provider picker: a tabbed surface offering either a catalogue entry or
 * a blank custom form.
 *
 * The catalogue is what makes adding a well-known vendor fast — its endpoint,
 * protocol and models are pre-filled — while the custom tab stays available for
 * anything the catalogue does not cover. Both routes end in the same form, so
 * there is one place where a provider definition is actually validated.
 */
export function ProviderCatalogModal({
  open,
  onClose,
  catalog,
  loading,
  onPick,
  onCustom,
}: CatalogModalProps) {
  const [tab, setTab] = useState<'catalog' | 'custom'>('catalog');
  const [query, setQuery] = useState('');

  // Reopening should not resume the previous tab or a stale search that now
  // matches nothing, which reads as "the catalogue is empty".
  useEffect(() => {
    if (open) {
      setTab('catalog');
      setQuery('');
    }
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? catalog.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) ||
            entry.id.toLowerCase().includes(needle) ||
            entry.baseUrl.toLowerCase().includes(needle)
        )
      : catalog;
    return groupCatalog(filtered);
  }, [catalog, query]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="添加提供商"
      footer={
        <Button variant="light" size="sm" onClick={onClose}>
          取消
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-full bg-default-100/60 p-1">
          {(
            [
              { key: 'catalog', label: '第三方提供商' },
              { key: 'custom', label: '自定义提供商' },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium',
                tab === item.key
                  ? 'bg-content1 text-foreground shadow-sm'
                  : 'text-default-500 hover:text-foreground'
              )}
            >
              {item.label}
            </Pressable>
          ))}
        </div>

        {tab === 'catalog' ? (
          <div className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索厂商名称或地址"
              inputSize="sm"
              startContent={<Search className="h-4 w-4" />}
            />

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="md" />
              </div>
            ) : groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-default-500">
                没有匹配的厂商，可在「自定义提供商」中手动填写。
              </p>
            ) : (
              <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                {groups.map((group) => (
                  <div key={group.key} className="space-y-1.5">
                    <p className="text-xs font-medium tracking-wide text-default-400">
                      {group.label}
                    </p>
                    {group.entries.map((entry) => (
                      <Pressable
                        key={entry.id}
                        disabled={entry.alreadyAdded}
                        onClick={() => onPick(entry)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-[2rem] border px-4 py-2.5 text-left',
                          entry.alreadyAdded
                            ? 'cursor-not-allowed border-default-200 opacity-50'
                            : 'border-default-200 hover:border-primary/40 hover:bg-primary/5'
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {entry.name}
                          </span>
                          <span className="block truncate text-xs text-default-400">
                            {entry.baseUrl}
                          </span>
                        </span>
                        {entry.alreadyAdded ? (
                          <Chip variant="flat" color="default" size="sm">
                            已添加
                          </Chip>
                        ) : (
                          <span className="shrink-0 text-xs text-default-400">
                            {entry.models.length} 个模型
                          </span>
                        )}
                      </Pressable>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-default-500">
              适用于自建网关、代理服务或目录中没有的厂商。
            </p>
            <Button color="primary" size="sm" onClick={onCustom} startContent={<Plus className="h-4 w-4" />}>
              填写自定义提供商
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
