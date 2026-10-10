'use client';

import { Check, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Chip,
  EmptyState,
  Pressable,
  Spinner,
  Switch,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ProviderView } from '@/lib/ai-providers';

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
  /**
   * Switch the one enabled model. Exactly one model is enabled at a time, so
   * the switches act as a radio group: clicking a model's switch enables THAT
   * model and disables the previous one. Absent (the user settings page), the
   * switches render disabled.
   */
  onSetActiveModel?: (provider: ProviderView, model: string) => void;
  /** `${providerId}:${model}` currently being persisted, to debounce its switch. */
  modelBusy?: string | null;
  /** Rendered under the heading, e.g. the global key field. */
  action?: React.ReactNode;
  emptyHint?: string;
  /** Per-provider inline status, e.g. "当前生效" or "缺少 API Key". */
  renderStatus?: (provider: ProviderView) => React.ReactNode;
}

/**
 * The provider list, rendered identically on both settings pages.
 *
 * Each row shows the full model list with a per-model enable switch. The global
 * and personal pages deliberately share this component: the difference between
 * them is what the viewer may DO (an administrator can toggle models, edit and
 * delete; a user can only select), never what the list looks like.
 */
export function ProviderList({
  providers,
  loading = false,
  selectedId,
  onSelect,
  canManage = false,
  onEdit,
  onDelete,
  onAdd,
  onSetActiveModel,
  modelBusy,
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
          // Exactly one model is enabled: the explicit choice, else the first.
          const active = provider.activeModel || provider.models[0] || '';
          return (
            <div
              key={provider.id}
              className={cn(
                'rounded-[2rem] border px-4 py-3 transition-colors duration-500 ease-in-out',
                selected
                  ? 'border-primary/40 bg-primary/5'
                  : selectable
                    ? 'border-default-200 bg-transparent hover:border-default-300'
                    : 'border-default-200 bg-transparent'
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
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

              {/* Every model, one switch each — but the switches are a radio
                  group: exactly one is on, and turning one on turns the others
                  off. The active model's own switch is disabled because the
                  single enabled model cannot be turned off. */}
              {provider.models.length > 0 && (
                <div className="mt-3 flex max-h-32 flex-wrap items-center gap-2 overflow-y-auto pl-8">
                  {provider.models.map((model) => {
                    const isActive = model === active;
                    const busy = modelBusy === `${provider.id}:${model}`;
                    return (
                      <span
                        key={model}
                        className={cn(
                          'flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
                          isActive
                            ? 'border-primary/40 bg-primary/5 text-foreground'
                            : 'border-default-200 text-default-500'
                        )}
                      >
                        <span className="max-w-56 truncate">{model}</span>
                        <Switch
                          checked={isActive}
                          onChange={() => {
                            if (!isActive) onSetActiveModel?.(provider, model);
                          }}
                          disabled={!onSetActiveModel || isActive || busy}
                          label={`${provider.name} 的模型 ${model}`}
                        />
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
