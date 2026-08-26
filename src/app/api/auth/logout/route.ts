import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getSessionFromCookieValue, SESSION_COOKIE_NAME } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const claims = await getSessionFromCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  if (claims) {
    await logAudit({ adminId: claims.adminId, action: 'logout', entity: 'admin', entityId: claims.adminId });
  }
  return response;
}
