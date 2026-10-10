/**
 * Centralized API client.
 *
 * All /api/* requests are proxied to the kratos backend via Next.js rewrites
 * (configured in next.config.ts). This keeps all browser requests same-origin.
 *
 * Auth: JWT stored in localStorage, sent via Authorization: Bearer header.
 */

import type {
  AIProtocol,
  ApprovalListPayload,
  ApprovalRequestView,
  CatalogPayload,
  DiscoveredModel,
  GlobalAIState,
  MyPermissionsPayload,
  ProviderDraft,
  ProviderListPayload,
  UserAIState,
} from './ai-providers';

export type { AIProtocol };
export { AI_PROTOCOLS, AI_PROTOCOL_LABELS } from './ai-providers';

const TOKEN_KEY = 'auth_token';

/**
 * Sub-path the app is served under (e.g. '/my-dashboard'), inlined at build
 * time. Empty string at the domain root. API requests and auth cookies must be
 * scoped to it, otherwise they would collide with other apps on the same origin
 * (the site root serves a separate dashboard whose backend owns /api/*).
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const COOKIE_PATH = BASE_PATH || '/';

let _token: string | null = null;

/** Initialize token from localStorage on load and sync cookie ↔ localStorage */
if (typeof window !== 'undefined') {
  _token = localStorage.getItem(TOKEN_KEY);
  const hasCookie = document.cookie.split('; ').some((c) => c.startsWith(`${TOKEN_KEY}=`));
  if (_token && !hasCookie) {
    // localStorage has token but cookie is missing — sync cookie so Server
    // Components (SSR) can access the auth token on next navigation.
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(_token)}; path=${COOKIE_PATH}; max-age=${7 * 24 * 3600}; SameSite=Lax`;
  } else if (!_token && hasCookie) {
    // localStorage was cleared but cookie still exists — clear the stale cookie.
    document.cookie = `${TOKEN_KEY}=; path=${COOKIE_PATH}; max-age=0`;
  }
}

/**
 * Return the current auth token.
 * Always re-reads from localStorage to avoid stale in-memory values
 * (e.g. when storage is cleared externally via dev-tools or another tab).
 */
export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    _token = localStorage.getItem(TOKEN_KEY);
  }
  return _token;
}

export function setToken(token: string | null) {
  _token = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      // Sync to cookie so Server Components can read the token
      document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=${COOKIE_PATH}; max-age=${7 * 24 * 3600}; SameSite=Lax`;
    } else {
      localStorage.removeItem(TOKEN_KEY);
      document.cookie = `${TOKEN_KEY}=; path=${COOKIE_PATH}; max-age=0`;
    }
  }
}

export function clearToken() {
  setToken(null);
}

/**
 * Make an authenticated API request.
 * Automatically includes the Authorization header if a token is set.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // Read through getToken() rather than the module-level `_token`: the cache is
  // only refreshed by getToken()/setToken(), so reading `_token` directly would
  // keep sending a token that was cleared or replaced in another tab.
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Don't override Content-Type for FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Callers pass root-relative paths ('/api/...'). Under a sub-path deployment
  // the request must carry that prefix so it reaches this app's own rewrite
  // instead of the site root's /api/* (owned by another backend).
  const url = BASE_PATH && path.startsWith('/') && !path.startsWith(`${BASE_PATH}/`)
    ? `${BASE_PATH}${path}`
    : path;

  return fetch(url, { ...options, headers });
}

/**
 * Convenience method for JSON POST requests.
 */
export async function apiPost(path: string, body?: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for JSON PATCH requests.
 */
export async function apiPatch(path: string, body?: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for JSON PUT requests.
 */
export async function apiPut(path: string, body?: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for DELETE requests.
 */
export async function apiDelete(path: string): Promise<Response> {
  return apiFetch(path, { method: 'DELETE' });
}

// ──────────────────────────────────────────────────────────────
// AI settings and provider registry
// ──────────────────────────────────────────────────────────────
//
// Two naming conventions still meet here:
//
//   /api/ai/test                    → a proto-generated struct, so its fields
//                                     arrive as snake_case (latency_ms)
//   everything else in this block   → hand-written camelCase handlers
//
// The camelCase handlers exist because the proto encoder emits snake_case, which
// has already caused one round of silently-undefined fields on these pages.
// Normalising the one remaining proto route keeps consumers on one spelling.

export interface NormalizedTestResult {
  success: boolean;
  provider: string;
  model: string;
  latencyMs: number | undefined;
  reply: string;
}

/**
 * Normalise a `/api/ai/test` reply.
 * `latency_ms` is omitted entirely by the backend when zero, so it stays
 * `undefined` rather than becoming a misleading `0 ms`.
 */
export function normalizeTestResult(data: unknown): NormalizedTestResult {
  const raw = (data ?? {}) as Record<string, unknown>;
  const latency = raw.latency_ms ?? raw.latencyMs;
  return {
    success: Boolean(raw.success),
    provider: (raw.provider as string) ?? '',
    model: (raw.model as string) ?? '',
    latencyMs: typeof latency === 'number' ? latency : undefined,
    reply: (raw.reply as string) ?? '',
  };
}

// ──────────────────────────────────────────────────────────────
// Provider registry (shared by both settings pages)
// ──────────────────────────────────────────────────────────────
//
// These routes are custom (non-proto) handlers and answer camelCase, so no
// normalisation is needed.

/** Read back an error message from a failed response. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data?.error as string) || fallback;
  } catch {
    return fallback;
  }
}

export async function listProviders(): Promise<ProviderListPayload> {
  const res = await apiFetch('/api/ai/providers');
  if (!res.ok) throw new Error(await readError(res, '获取提供商列表失败'));
  return res.json();
}

export async function listProviderCatalog(): Promise<CatalogPayload> {
  const res = await apiFetch('/api/ai/catalog');
  if (!res.ok) throw new Error(await readError(res, '获取提供商目录失败'));
  return res.json();
}

export async function createProvider(
  draft: ProviderDraft,
  key?: { apiKey?: string }
): Promise<ProviderListPayload> {
  // The add form saves the credential together with the definition, so a
  // provider is usable the moment it appears in the list.
  const body: Record<string, unknown> = { ...draft };
  if (key?.apiKey) body.apiKey = key.apiKey;
  const res = await apiPost('/api/ai/providers', body);
  if (!res.ok) throw new Error(await readError(res, '添加提供商失败'));
  return res.json();
}

export async function updateProvider(
  id: string,
  draft: ProviderDraft,
  key?: { apiKey?: string; clearKey?: boolean }
): Promise<ProviderListPayload> {
  // The shared credential rides along with the definition: the edit form manages
  // both, and filing a key is meaningless if the definition update failed.
  const body: Record<string, unknown> = { ...draft };
  if (key?.clearKey) body.clearKey = true;
  else if (key?.apiKey) body.apiKey = key.apiKey;
  const res = await apiPut(`/api/ai/providers/${encodeURIComponent(id)}`, body);
  if (!res.ok) throw new Error(await readError(res, '保存提供商失败'));
  return res.json();
}

export async function deleteProvider(id: string): Promise<ProviderListPayload> {
  const res = await apiDelete(`/api/ai/providers/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await readError(res, '删除提供商失败'));
  return res.json();
}

/**
 * Ask a provider endpoint which models it serves.
 *
 * Draft-shaped: the endpoint, protocol and key travel in the request, so a
 * provider can be interrogated before it has been saved. The key is used for
 * that one call and is never stored by the backend.
 */
export async function discoverModels(params: {
  provider?: string;
  baseUrl: string;
  protocol?: AIProtocol;
  apiKey?: string;
  /** Fall back to the credential the server already holds for this provider. */
  useStoredKey?: boolean;
}): Promise<{ models: DiscoveredModel[]; count: number }> {
  const res = await apiPost('/api/ai/models', {
    provider: params.provider,
    baseUrl: params.baseUrl,
    protocol: params.protocol,
    apiKey: params.apiKey,
    useStoredKey: params.useStoredKey ?? false,
  });
  if (!res.ok) throw new Error(await readError(res, '获取模型列表失败'));
  return res.json();
}

// ──────────────────────────────────────────────────────────────
// Global API configuration (administrator)
// ──────────────────────────────────────────────────────────────

export async function getGlobalAI(): Promise<GlobalAIState> {
  const res = await apiFetch('/api/ai/global');
  if (!res.ok) throw new Error(await readError(res, '获取全局配置失败'));
  return res.json();
}

/**
 * Activate the global provider and/or store its shared credential.
 *
 * The two are settable independently, and an omitted `apiKey` means "leave the
 * stored one alone" — which is what makes it possible to switch provider without
 * re-typing a key the browser never had.
 */
export async function saveGlobalAI(params: {
  providerId?: string;
  apiKey?: string;
  /** Omit to keep the stored model; send `''` to fall back to the default. */
  model?: string;
}): Promise<GlobalAIState> {
  const res = await apiPut('/api/ai/global', params);
  if (!res.ok) throw new Error(await readError(res, '保存全局配置失败'));
  return res.json();
}

export async function clearGlobalAIKey(): Promise<{ success: boolean; hasKey: boolean }> {
  const res = await apiDelete('/api/ai/global/key');
  if (!res.ok) throw new Error(await readError(res, '移除 API Key 失败'));
  return res.json();
}

// ──────────────────────────────────────────────────────────────
// User AI settings
// ──────────────────────────────────────────────────────────────

export async function getUserAI(): Promise<UserAIState> {
  const res = await apiFetch('/api/user/ai-config');
  if (!res.ok) throw new Error(await readError(res, '获取配置失败'));
  return res.json();
}

export async function saveUserAI(params: {
  providerId: string;
  apiKey?: string;
  /**
   * The chosen model. Always sent, including as `''` — an empty value means
   * "use the provider's own default", and omitting the field would instead mean
   * "leave the stored model alone", making the default unreachable.
   */
  model: string;
  clearKey?: boolean;
}): Promise<{ success: boolean; providerId: string; hasPersonalKey: boolean; model: string }> {
  const res = await apiPost('/api/user/ai-config', params);
  if (!res.ok) throw new Error(await readError(res, '保存配置失败'));
  return res.json();
}

export async function setUserGlobalAI(
  enabled: boolean
): Promise<{ success: boolean; globalApiEnabled: boolean }> {
  const res = await apiPatch('/api/user/ai-config/global', { enabled });
  if (!res.ok) throw new Error(await readError(res, '切换全局 API 失败'));
  return res.json();
}

export async function clearUserAI(): Promise<{ success: boolean }> {
  const res = await apiDelete('/api/user/ai-config');
  if (!res.ok) throw new Error(await readError(res, '清除配置失败'));
  return res.json();
}

// ──────────────────────────────────────────────────────────────
// Connection test
// ──────────────────────────────────────────────────────────────

export async function testConnection(provider: string): Promise<NormalizedTestResult> {
  const res = await apiPost('/api/ai/test', { provider });
  if (!res.ok) throw new Error(await readError(res, '连接测试失败'));
  return normalizeTestResult(await res.json());
}

// ──────────────────────────────────────────────────────────────
// Approvals and permissions
// ──────────────────────────────────────────────────────────────

/**
 * The approvals queue.
 *
 * One endpoint serves every resource type; `resourceType` narrows it. Omitting
 * it returns everything, which is what the "全部" filter shows.
 */
export async function listApprovals(params?: {
  resourceType?: string;
  status?: string;
}): Promise<ApprovalListPayload> {
  const search = new URLSearchParams();
  if (params?.resourceType) search.set('type', params.resourceType);
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  const res = await apiFetch(`/api/admin/approvals${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await readError(res, '获取审核列表失败'));
  return res.json();
}

export async function decideApproval(
  id: string,
  action: 'approve' | 'reject',
  reason = ''
): Promise<{ success: boolean; message: string; request: ApprovalRequestView }> {
  const res = await apiPost(`/api/admin/approvals/${encodeURIComponent(id)}`, {
    action,
    reason,
  });
  if (!res.ok) {
    throw new Error(await readError(res, action === 'approve' ? '批准失败' : '拒绝失败'));
  }
  return res.json();
}

/** File an application. The applicant is taken from the token, never the body. */
export async function submitApproval(params: {
  resourceType: string;
  resourceId?: string;
  permission: string;
  reason?: string;
}): Promise<{ success: boolean; request: ApprovalRequestView }> {
  const res = await apiPost('/api/permissions/requests', params);
  if (!res.ok) throw new Error(await readError(res, '提交申请失败'));
  return res.json();
}

export async function getMyPermissions(): Promise<MyPermissionsPayload> {
  const res = await apiFetch('/api/permissions/me');
  if (!res.ok) throw new Error(await readError(res, '获取权限失败'));
  return res.json();
}

/**
 * Grant or revoke a permission directly.
 *
 * Both the users page and the approvals page go through these two calls, so a
 * permission switched by hand and one that came from an approval are recorded
 * identically — otherwise the stored flag and the grant record could disagree,
 * and a revocation would appear to work while the permission came back.
 */
export async function grantPermission(params: {
  userId: string;
  resourceType: string;
  resourceId?: string;
  permission: string;
}): Promise<{ success: boolean }> {
  const res = await apiPost('/api/admin/permissions/grant', params);
  if (!res.ok) throw new Error(await readError(res, '授权失败'));
  return res.json();
}

export async function revokePermission(params: {
  userId: string;
  resourceType: string;
  resourceId?: string;
  permission: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  const res = await apiPost('/api/admin/permissions/revoke', params);
  if (!res.ok) throw new Error(await readError(res, '撤销权限失败'));
  return res.json();
}
