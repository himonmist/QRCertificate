import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/sessionToken';
import { SESSION_COOKIE_NAME } from '@/lib/session';

const PUBLIC_API_PREFIXES = ['/api/auth/login', '/api/public/'];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Builds a per-request CSP. Production uses a nonce + 'strict-dynamic' for
 * script-src (Next.js auto-applies the nonce to the script tags it renders,
 * once it sees the nonce in this header) instead of a static allowlist —
 * this is the documented Next.js App Router CSP pattern. Development
 * additionally needs 'unsafe-eval' because React Fast Refresh's hot-reload
 * runtime uses eval(); that tooling never ships to production. An earlier,
 * simpler `script-src 'self'` (no nonce/eval allowance) silently broke
 * *all* client-side JS — forms fell back to native submits with no error —
 * caught by manually driving the app in a browser, not by the test suite.
 */
function buildCsp(nonce: string): string {
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `'self' 'unsafe-eval' 'unsafe-inline'`;

  return [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // CSRF mitigation: for cookie-authenticated, state-changing admin API
  // calls, require the request to have actually originated from this app.
  if (
    MUTATING_METHODS.has(request.method) &&
    pathname.startsWith('/api/') &&
    !isPublicApi(pathname)
  ) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 }),
        nonce
      );
    }
  }

  const isAdminApi = pathname.startsWith('/api/') && !isPublicApi(pathname);
  const isAdminPage = pathname.startsWith('/admin');

  if (!isAdminApi && !isAdminPage) {
    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      nonce
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  if (!claims) {
    if (isAdminApi) {
      return applySecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), nonce);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), nonce);
  }

  // Never trust client-supplied values for these headers: strip whatever
  // the request came in with before stamping the verified identity.
  requestHeaders.delete('x-admin-id');
  requestHeaders.delete('x-admin-role');
  requestHeaders.set('x-admin-id', claims.adminId);
  requestHeaders.set('x-admin-role', claims.role);

  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
