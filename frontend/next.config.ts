import type { NextConfig } from 'next';

// Every request the browser makes to /api/* gets forwarded, server-side, to
// the Gateway. This is what lets every fetch() call in this app just hit a
// same-origin relative path — no CORS configuration needed anywhere, and
// Gateway's CORS_ORIGIN setting doesn't even come into play for this
// frontend, since the browser never makes a genuinely cross-origin request.
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${GATEWAY_URL}/:path*` }];
  },
};

export default nextConfig;
