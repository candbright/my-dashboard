/**
 * Audit listing types and display helpers (ADR-0011).
 *
 * Action labels come from the server (`actionLabel`). This module only formats
 * payload summaries so the pages never hard-code Chinese action names.
 */

export interface AuditActionOption {
  value: string;
  label: string;
}

export interface AuditAuthEvent {
  id: string;
  occurredAt: string;
  action: string;
  actionLabel: string;
  outcome: string;
  userId: string;
  userUsername: string;
  email: string;
  displayIp?: string;
  userAgent?: string;
  requestId?: string;
  payload?: Record<string, unknown> | null;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  action: string;
  actionLabel: string;
  outcome: string;
  actorId: string;
  actorUsername: string;
  subjectId: string;
  subjectUsername: string;
  resourceType: string;
  resourceId: string;
  displayIp?: string;
  userAgent?: string;
  requestId?: string;
  payload?: Record<string, unknown> | null;
}

export interface AuditListPayload {
  success?: boolean;
  events: AuditAuthEvent[] | AuditEvent[];
  total: number;
  truncated: boolean;
  limit: number;
  actions: AuditActionOption[];
}

/** Query params shared by the three listing APIs. */
export interface AuditListQuery {
  action?: string;
  outcome?: string;
  since?: string;
  until?: string;
  userId?: string;
  email?: string;
  actorId?: string;
  subjectId?: string;
  resourceType?: string;
  limit?: number;
}

export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'success':
      return '成功';
    case 'failure':
      return '失败';
    case 'denied':
      return '拒绝';
    default:
      return outcome || '—';
  }
}

export function resourceTypeLabel(resourceType: string): string {
  switch (resourceType) {
    case 'user':
      return '用户';
    case 'resume':
      return '简历';
    case 'grant':
      return '授权';
    case 'approval':
      return '审批';
    case 'ai':
      return 'AI';
    default:
      return resourceType || '—';
  }
}

/**
 * A one-line Chinese summary of a payload. Never dumps JSON: the stored object
 * is a pointer (field names, role names, a kind tag), and rendering it raw
 * would look like a debug dump on a user-facing page.
 */
export function payloadSummary(payload?: Record<string, unknown> | null): string {
  if (!payload) return '';
  const parts: string[] = [];
  const fields = payload.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    parts.push(`字段：${fields.map(String).join('、')}`);
  }
  if (typeof payload.before === 'string' || typeof payload.after === 'string') {
    parts.push(`${String(payload.before ?? '—')} → ${String(payload.after ?? '—')}`);
  }
  if (typeof payload.kind === 'string' && payload.kind) {
    parts.push(kindLabel(payload.kind));
  }
  if (typeof payload.permission === 'string' && payload.permission) {
    parts.push(`权限 ${payload.permission}`);
  }
  if (typeof payload.resourceType === 'string' && payload.resourceType) {
    parts.push(resourceTypeLabel(payload.resourceType));
  }
  if (typeof payload.decision === 'string' && payload.decision) {
    parts.push(payload.decision === 'approved' ? '批准' : payload.decision === 'rejected' ? '拒绝' : String(payload.decision));
  }
  if (typeof payload.version === 'number') {
    parts.push(`版本 ${payload.version}`);
  }
  return parts.join(' · ');
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'provider_create':
      return '新增提供商';
    case 'provider_update':
      return '更新提供商';
    case 'provider_delete':
      return '删除提供商';
    case 'key_set':
      return '设置密钥';
    case 'key_clear':
      return '清除密钥';
    case 'key_rotate':
      return '轮换密钥';
    case 'active_provider':
      return '切换活跃提供商';
    case 'model':
      return '更改模型';
    case 'provider_select':
      return '选择提供商';
    case 'use_global_on':
      return '开启全局 API';
    case 'use_global_off':
      return '关闭全局 API';
    case 'config_clear':
      return '清除配置';
    default:
      return kind;
  }
}

export function buildAuditQuery(params: AuditListQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
