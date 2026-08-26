import { NextResponse } from 'next/server';
import { createSessionToken, verifySessionToken, type SessionClaims } from './sessionToken';

export const SESSION_COOKIE_NAME = 'qrcert_session';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export async function setSessionCookie(response: NextResponse, claims: SessionClaims): Promise<void> {
  const token = await createSessionToken(claims, `${SESSION_MAX_AGE_SECONDS}s`);
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionFromCookieValue(
  value: string | undefined
): Promise<SessionClaims | null> {
  if (!value) return null;
  return verifySessionToken(value);
}
