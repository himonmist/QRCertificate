// Security headers (including Content-Security-Policy) are set in
// src/middleware.ts instead of here: CSP needs a fresh per-request nonce
// for script-src, which next.config's static headers() can't generate.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
