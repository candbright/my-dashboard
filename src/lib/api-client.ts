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
import { buildAuditQuery, type AuditListPayload, type AuditListQuery } from './audit';
import { failureText, readErrorEnvelope } from './http-json';

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

/** How long the cookie lives. Matches the server's session lifetime. */
const COOKIE_MAX_AGE = 7 * 24 * 3600;

/** The token in the cookie, or `null` when no such cookie is set. */
function readTokenCookie(): string | null {
  const prefix = `${TOKEN_KEY}=`;
  const entry = document.cookie.split('; ').find((c) => c.startsWith(prefix));
  if (!entry) return null;

  const value = decodeURIComponent(entry.slice(prefix.length));
  // An empty value means "no token", not "a token that is the empty string". A browser that has not
  // finished dropping a cleared cookie still reports `auth_token=`, and reading that as a value
  // would make every load rewrite the cookie it just cleared.
  return value === '' ? null : value;
}

/**
 * Writes the cookie Server Components read. The only writer, so the two ends cannot disagree.
 *
 * `path` is the base path rather than `/`: cookies are matched by path, so a cookie set for the
 * deployment's own prefix is what a request into that prefix carries.
 */
function writeTokenCookie(token: string | null) {
  document.cookie = token
    ? `${TOKEN_KEY}=${encodeURIComponent(token)}; path=${COOKIE_PATH}; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
    : `${TOKEN_KEY}=; path=${COOKIE_PATH}; max-age=0`;
}

/**
 * Makes the cookie agree with the client's token, whichever way they currently disagree.
 *
 * # The defect this exists to prevent
 *
 * A server component has no localStorage: it reads the token from the cookie
 * (`app/resume/[slug]/page.tsx`). So the cookie is not a cache of the session, it is the *whole*
 * session as far as the server is concerned, and the two halves have to be kept equal by something.
 *
 * That something used to check the cookie's **presence** — a token was copied across only when no
 * cookie existed at all — so a cookie holding a *different* token was left in place. Both halves
 * then looked authenticated, as different people: 我的 lists the resumes the client's token owns,
 * and the page that opens from that list asks the server with the other token.
 *
 * The server's answer to that is `403 NO_ACCESS`, and `/resume/[slug]` rendered every non-404
 * answer as 「页面不存在」 — so the resume the user had just saved appeared not to exist.
 *
 * Comparing *values* rather than existence is the fix, and it makes the call idempotent: writing
 * only on a real difference means it can run on every load without touching the cookie jar.
 */
function syncTokenCookie(token: string | null) {
  if (readTokenCookie() === token) return;
  writeTokenCookie(token);
}

/**
 * Initialize token from localStorage on load, and make the cookie agree with it.
 *
 * In this order deliberately: localStorage is the client's truth (`getToken` re-reads it), so the
 * cookie is brought to it rather than the other way round.
 */
if (typeof window !== 'undefined') {
  // `|| null`, so a key that exists but holds the empty string counts as no session at all.
  _token = localStorage.getItem(TOKEN_KEY) || null;
  syncTokenCookie(_token);
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
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    // Via the one writer, so signing in and the page-load sync cannot disagree about the cookie's
    // attributes — a second `document.cookie` string here is how they would drift apart.
    writeTokenCookie(token);
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
 * A request that reached the server and came back with a failure status.
 *
 * `apiFetch` returns the `Response` for every status instead of throwing, so raising is the
 * caller's job — and until this type existed the caller had no way to pass the status along.
 * That mattered: `classifyFailure` in `autosave-failure.ts` decides whether a retry is worth
 * anything *from the status*, so with none attached every failure looked like a transport
 * error and was retried five times with backoff, 403 and 404 included.
 *
 * A network or timeout failure is still a `TypeError` with no status, which is exactly the
 * distinction the retry decision needs.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
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
// A reply's spelling comes from the **Go struct's own `json` tags**, because the server replaces
// kratos' response encoder with `encoding/json` for every route, proto routes included
// (`kratos-server/internal/server/http.go`; see its AGENTS.md §API conventions). Concretely:
// proto replies are snake_case (`latency_ms`), the hand-written AI/provider structs are camelCase
// (`baseUrl`) — so the spelling identifies the *struct*, never the encoder or the route, and a
// camelCase payload is not evidence that a hand-written handler answered.
//
// `normalizeTestResult` below exists because `/api/ai/test` is a proto route, hence `latency_ms`.

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
// Hand-written structs, authored with camelCase tags — see the block above.

/**
 * The message to show for a failed response.
 *
 * A one-line wrapper so this module's 22 callers keep a readable spelling; the rule about the
 * server's text versus the fallback lives in `http-json.ts`.
 */
async function readError(res: Response, fallback: string): Promise<string> {
  return failureText(await readErrorEnvelope(res), res.status, fallback);
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

/**
 * Provider CRUD comes in two scopes that share one wire shape: `/api/ai/providers`
 * is the administrator-maintained shared list, `/api/ai/user/providers` is the
 * caller's own. The creation flow is identical; the configuration is not.
 */
type ProviderScope = 'global' | 'personal';

const scopeBase = (scope: ProviderScope) =>
  scope === 'personal' ? '/api/ai/user/providers' : '/api/ai/providers';

export async function createProvider(
  draft: ProviderDraft,
  key?: { apiKey?: string },
  scope: ProviderScope = 'global'
): Promise<ProviderListPayload> {
  // The add form saves the credential together with the definition, so a
  // provider is usable the moment it appears in the list.
  const body: Record<string, unknown> = { ...draft };
  if (key?.apiKey) body.apiKey = key.apiKey;
  const res = await apiPost(scopeBase(scope), body);
  if (!res.ok) throw new Error(await readError(res, '添加提供商失败'));
  return res.json();
}

export async function updateProvider(
  id: string,
  draft: ProviderDraft,
  key?: { apiKey?: string; clearKey?: boolean },
  scope: ProviderScope = 'global'
): Promise<ProviderListPayload> {
  // The credential rides along with the definition: the edit form manages
  // both, and filing a key is meaningless if the definition update failed.
  const body: Record<string, unknown> = { ...draft };
  if (key?.clearKey) body.clearKey = true;
  else if (key?.apiKey) body.apiKey = key.apiKey;
  const res = await apiPut(`${scopeBase(scope)}/${encodeURIComponent(id)}`, body);
  if (!res.ok) throw new Error(await readError(res, '保存提供商失败'));
  return res.json();
}

export async function deleteProvider(
  id: string,
  scope: ProviderScope = 'global'
): Promise<ProviderListPayload> {
  const res = await apiDelete(`${scopeBase(scope)}/${encodeURIComponent(id)}`);
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

// ──────────────────────────────────────────────────────────────
// Audit (ADR-0011)
// ──────────────────────────────────────────────────────────────

export type { AuditListPayload, AuditListQuery };

export async function listAdminAuthEvents(params: AuditListQuery = {}): Promise<AuditListPayload> {
  const res = await apiFetch(`/api/admin/audit/auth${buildAuditQuery(params)}`);
  if (!res.ok) throw new ApiError(await readError(res, '获取认证事件失败'), res.status);
  return res.json();
}

export async function listAdminAuditEvents(params: AuditListQuery = {}): Promise<AuditListPayload> {
  const res = await apiFetch(`/api/admin/audit/events${buildAuditQuery(params)}`);
  if (!res.ok) throw new ApiError(await readError(res, '获取审计事件失败'), res.status);
  return res.json();
}

export async function listMyAuditEvents(params: AuditListQuery = {}): Promise<AuditListPayload> {
  const res = await apiFetch(`/api/me/audit-events${buildAuditQuery(params)}`);
  if (!res.ok) throw new ApiError(await readError(res, '获取活动失败'), res.status);
  return res.json();
}
