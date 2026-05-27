import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

// Extra origins allowed in connect-src:
// - Always include NEXT_PUBLIC_API_URL if set (handles any protocol/host)
// - In dev, also allow all localhost ports over both http and https
const extraConnectOrigins: string[] = [];
if (process.env.NEXT_PUBLIC_API_URL) {
  // Allow the exact origin (strip path)
  try {
    const u = new URL(process.env.NEXT_PUBLIC_API_URL);
    extraConnectOrigins.push(u.origin);
  } catch {
    extraConnectOrigins.push(process.env.NEXT_PUBLIC_API_URL);
  }
}
if (isDev) {
  extraConnectOrigins.push('http://localhost:*', 'https://localhost:*', 'ws://localhost:*', 'wss://localhost:*');
}

const connectSrc = ["'self'", 'https:', ...extraConnectOrigins].join(' ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  images: {
    // Avoid wildcard '**' — restrict to known safe domains.
    // Add specific hostnames your app actually loads avatar images from.
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'secure.gravatar.com' },
    ],
  },
  async rewrites() {
    // Proxy ALL /api/:path* requests to the kratos backend.
    // This keeps all browser requests same-origin and avoids CORS entirely.
    const target = process.env.NEXT_PUBLIC_API_URL;
    if (!target) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
