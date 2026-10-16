/**
 * The auth token's two homes, and the rule that keeps them the same session.
 *
 * # The defect this file exists for
 *
 * The client sends `Authorization: Bearer <localStorage token>`; a server component can only read
 * the cookie (`app/resume/[slug]/page.tsx`). The page-load sync that is supposed to hold those two
 * together tested the cookie's **presence** — it copied the token across only when no cookie existed
 * at all — so a cookie holding a *different* token survived every page load.
 *
 * The visible result is a session split in two. 我的 renders from the client's token and lists the
 * resume; opening one asks the server with the cookie's token, which answers `403 NO_ACCESS`; and
 * `/resume/[slug]` rendered that as 「页面不存在」. The resume the user had just saved therefore
 * appeared not to exist. Ticket 47.
 *
 * These cases pin the property rather than the mechanism: after the module has loaded, the cookie
 * holds *the client's token* — not merely *a* token.
 */
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN_KEY = 'auth_token';

/** A token shaped like the server's JWTs, plus characters a cookie has to encode. */
const OLD_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.old.signature';
const NEW_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.new.sig+with/special==';

/** Written cookies, so "did not touch it" is observable and not just untested. */
let writes: string[] = [];
let stopRecording: () => void;

/**
 * The cookie's value as the browser would report it, read independently of the module.
 *
 * An empty value reads as `null`: happy-dom keeps an entry behind after a clearing write, where a
 * browser drops it, and `auth_token=` is the same thing to a reader — no token.
 */
function cookieValue(name: string): string | null {
  const prefix = `${name}=`;
  const entry = document.cookie.split('; ').find((c) => c.startsWith(prefix));
  if (!entry) return null;
  const value = decodeURIComponent(entry.slice(prefix.length));
  return value === '' ? null : value;
}

/**
 * Records every `document.cookie` assignment.
 *
 * happy-dom exposes only `name=value` through the getter, so a rewrite that produces the same value
 * is invisible in the cookie string itself — and "did the module write on a load where nothing
 * changed" is exactly one of the properties worth pinning.
 */
function recordCookieWrites() {
  let owner: object | null = document;
  let descriptor: PropertyDescriptor | undefined;
  while (owner && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(owner, 'cookie');
    owner = Object.getPrototypeOf(owner);
  }
  if (!descriptor?.get || !descriptor.set) {
    throw new Error('the test environment offers no cookie accessor to wrap');
  }

  const { get, set } = descriptor;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => get.call(document) as string,
    set: (value: string) => {
      writes.push(value);
      set.call(document, value);
    },
  });

  return () => {
    delete (document as unknown as Record<string, unknown>).cookie;
  };
}

/** Loads the module fresh, so its page-load sync runs against what the test just set up. */
async function loadApiClient() {
  vi.resetModules();
  return import('@/lib/api-client');
}

beforeEach(() => {
  writes = [];
  localStorage.clear();
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  stopRecording = recordCookieWrites();
});

afterEach(() => {
  stopRecording();
  localStorage.clear();
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
});

describe('page-load token sync', () => {
  it('replaces a cookie that holds a different token', async () => {
    // Ticket 47 in one case: both halves are "logged in", as different people.
    localStorage.setItem(TOKEN_KEY, NEW_TOKEN);
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(OLD_TOKEN)}; path=/`;

    await loadApiClient();

    expect(cookieValue(TOKEN_KEY)).toBe(NEW_TOKEN);
  });

  it('creates the cookie when only localStorage holds the token', async () => {
    localStorage.setItem(TOKEN_KEY, NEW_TOKEN);

    await loadApiClient();

    expect(cookieValue(TOKEN_KEY)).toBe(NEW_TOKEN);
  });

  it('clears a cookie whose token localStorage no longer has', async () => {
    // Signing out in another tab, then loading this one: the server must not keep the old session.
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(OLD_TOKEN)}; path=/`;

    await loadApiClient();

    expect(cookieValue(TOKEN_KEY)).toBeNull();
  });

  it('leaves a cookie that already agrees with localStorage alone', async () => {
    // Idempotence is what makes running this on every load acceptable: a rewrite on every page view
    // is cookie churn for nothing.
    localStorage.setItem(TOKEN_KEY, NEW_TOKEN);
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(NEW_TOKEN)}; path=/`;
    writes = [];

    await loadApiClient();

    expect(writes).toEqual([]);
    expect(cookieValue(TOKEN_KEY)).toBe(NEW_TOKEN);
  });

  it('writes nothing at all when there is no session on either side', async () => {
    await loadApiClient();

    expect(writes).toEqual([]);
  });

  it('treats a stored empty string as no session, and keeps it that way', async () => {
    // The state a half-expired cookie leaves behind: `auth_token=` with no value. Reading it as a
    // token would rewrite the cookie on every single load.
    localStorage.setItem(TOKEN_KEY, '');
    document.cookie = `${TOKEN_KEY}=; path=/`;
    writes = [];

    await loadApiClient();

    expect(writes).toEqual([]);
  });
});

describe('setToken', () => {
  it('writes both homes, with a value the cookie round-trips', async () => {
    const { setToken } = await loadApiClient();

    setToken(NEW_TOKEN);

    expect(localStorage.getItem(TOKEN_KEY)).toBe(NEW_TOKEN);
    expect(cookieValue(TOKEN_KEY)).toBe(NEW_TOKEN);
  });

  it('replaces a cookie left over from the previous session', async () => {
    // Signing in as someone else must not leave the old cookie behind for the server to read.
    const { setToken } = await loadApiClient();
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(OLD_TOKEN)}; path=/`;

    setToken(NEW_TOKEN);

    expect(cookieValue(TOKEN_KEY)).toBe(NEW_TOKEN);
  });
});

describe('clearToken', () => {
  it('removes the token from both homes', async () => {
    const { setToken, clearToken, getToken } = await loadApiClient();
    setToken(NEW_TOKEN);

    clearToken();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(cookieValue(TOKEN_KEY)).toBeNull();
    expect(getToken()).toBeNull();
  });
});

describe('getToken', () => {
  it('re-reads localStorage, so a token set in another tab is picked up', async () => {
    const { getToken } = await loadApiClient();

    localStorage.setItem(TOKEN_KEY, NEW_TOKEN);

    expect(getToken()).toBe(NEW_TOKEN);
  });
});
