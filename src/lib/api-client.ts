/**
 * Centralized API client.
 *
 * All /api/* requests are proxied to the kratos backend via Next.js rewrites
 * (configured in next.config.ts). This keeps all browser requests same-origin.
 *
 * Auth: JWT stored in localStorage, sent via Authorization: Bearer header.
 */

const TOKEN_KEY = 'auth_token';

let _token: string | null = null;

/** Initialize token from localStorage on load */
if (typeof window !== 'undefined') {
  _token = localStorage.getItem(TOKEN_KEY);
}

export function getToken(): string | null {
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

  return fetch(path, { ...options, headers });
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
