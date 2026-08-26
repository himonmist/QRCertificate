import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Canonicalizes an object (sorted keys, stable stringify) so hash output
 * does not depend on property insertion order.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`
  );
  return `{${entries.join(',')}}`;
}

function getSecret(secret?: string): string {
  const resolved = secret ?? process.env.CERT_HASH_SECRET;
  if (!resolved) {
    throw new Error('CERT_HASH_SECRET is not configured');
  }
  return resolved;
}

/**
 * Computes the tamper-evidence hash stored alongside a certificate: SHA-256
 * of the canonicalized certificate data plus a server-only secret salt, so a
 * fabricated certificate id cannot be made to resolve as valid without the
 * secret.
 */
export function computeVerificationHash(data: Record<string, unknown>, secret?: string): string {
  const payload = `${canonicalize(data)}::${getSecret(secret)}`;
  return createHash('sha256').update(payload).digest('hex');
}

/** Timing-safe comparison of a certificate's data against its stored hash. */
export function verifyHash(
  data: Record<string, unknown>,
  expectedHash: string,
  secret?: string
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  const actual = computeVerificationHash(data, secret);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash.toLowerCase(), 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
