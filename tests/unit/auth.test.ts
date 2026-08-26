import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '@/lib/auth';

describe('password hashing', () => {
  it('hashes a password to something other than the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies a matching password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('salts hashes so two hashes of the same password differ', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});

describe('session tokens', () => {
  it('creates a token that verifies back to the same claims', async () => {
    const token = await createSessionToken({ adminId: 'admin-1', role: 'admin' });
    const claims = await verifySessionToken(token);
    expect(claims?.adminId).toBe('admin-1');
    expect(claims?.role).toBe('admin');
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken({ adminId: 'admin-1', role: 'admin' });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });

  it('rejects a garbage token instead of throwing', async () => {
    await expect(verifySessionToken('not.a.jwt')).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await createSessionToken({ adminId: 'admin-1', role: 'admin' }, '-1s');
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });
});
