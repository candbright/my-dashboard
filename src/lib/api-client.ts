/**
 * Centralized API client.
 *
 * All /api/* requests are proxied to the kratos backend via Next.js rewrites
 * (configured in next.config.ts). This keeps all browser requests same-origin.
 *
 * Auth: JWT stored in localStorage, sent via Authorization: Bearer header.
 */

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

  if (_token) {
    headers.set('Authorization', `Bearer ${_token}`);
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
