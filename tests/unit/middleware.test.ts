import { describe, expect, it, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('middleware CSP', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows unsafe-eval outside production, so React Fast Refresh (which uses eval) is not blocked', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await middleware(new NextRequest('http://localhost:3000/login'));
    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self' 'unsafe-eval'");
  });

  it('uses a nonce + strict-dynamic (no unsafe-eval/unsafe-inline) for script-src in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await middleware(new NextRequest('http://localhost:3000/login'));
    const csp = response.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('sets a fresh nonce on every request in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const a = await middleware(new NextRequest('http://localhost:3000/'));
    const b = await middleware(new NextRequest('http://localhost:3000/'));
    const nonceOf = (r: Response) => r.headers.get('content-security-policy')?.match(/nonce-([^']+)/)?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  it('sets restrictive framing/content-type/referrer/permissions headers on every response', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/'));
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('middleware auth + CSRF', () => {
  it('redirects an unauthenticated request for an /admin page to /login', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/admin/dashboard'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('returns 401 (not a redirect) for an unauthenticated admin API request', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/api/trainers'));
    expect(response.status).toBe(401);
  });

  it('lets public pages and public API routes through with no auth', async () => {
    const home = await middleware(new NextRequest('http://localhost:3000/'));
    expect(home.status).toBe(200);
    const verify = await middleware(
      new NextRequest('http://localhost:3000/api/public/verify/MNC-2026-SDA-000001')
    );
    expect(verify.status).toBe(200);
  });

  it('rejects a cross-origin state-changing request to a protected API route', async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3000/api/trainers', {
        method: 'POST',
        headers: { origin: 'http://evil.example.com' },
      })
    );
    expect(response.status).toBe(403);
  });

  it('allows a same-origin state-changing request through to the auth check (no CSRF block)', async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3000/api/trainers', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      })
    );
    // No session cookie, so this should fail auth (401), not CSRF (403).
    expect(response.status).toBe(401);
  });

  it('strips a client-supplied x-admin-id/x-admin-role header instead of trusting it', async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3000/api/trainers', {
        headers: { 'x-admin-id': 'attacker-supplied-id', 'x-admin-role': 'super_admin' },
      })
    );
    // No valid session cookie was presented, so this must still be 401 even
    // though the request tried to hand-roll admin identity via headers.
    expect(response.status).toBe(401);
  });
});
