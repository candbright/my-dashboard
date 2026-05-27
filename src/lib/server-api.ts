/**
 * Server-side API client for Next.js Server Components / SSR.
 *
 * Calls the kratos backend directly (server-to-server) using the
 * internal API_URL env var. No token forwarding — used only for
 * public data fetching (e.g. resume by slug for SEO metadata).
 */

const KRATOS_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Fetch from the kratos backend (server-side only).
 * Optionally pass a Bearer token for authenticated requests.
 */
export async function serverFetch(
  path: string,
  options: { token?: string; cache?: RequestCache } = {}
): Promise<Response> {
  const url = `${KRATOS_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  return fetch(url, {
    headers,
    cache: options.cache ?? 'no-store',
  });
}
