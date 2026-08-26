import { SignJWT, jwtVerify } from 'jose';

// Deliberately has no dependency on bcryptjs (a Node-only module): this
// file is imported by middleware.ts, which runs on the Edge runtime and
// cannot bundle Node APIs like process.nextTick/setImmediate.

export type AdminRole = 'super_admin' | 'admin';

export interface SessionClaims {
  adminId: string;
  role: AdminRole;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET is not configured (must be at least 16 characters)');
  }
  return new TextEncoder().encode(secret);
}

/** Signs an httpOnly session token. Default expiry: 8 hours. */
export async function createSessionToken(
  claims: SessionClaims,
  expiresIn: string = '8h'
): Promise<string> {
  return new SignJWT({ adminId: claims.adminId, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

/** Verifies and decodes a session token; returns null instead of throwing on any failure. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.adminId !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    if (payload.role !== 'super_admin' && payload.role !== 'admin') {
      return null;
    }
    return { adminId: payload.adminId, role: payload.role };
  } catch {
    return null;
  }
}
