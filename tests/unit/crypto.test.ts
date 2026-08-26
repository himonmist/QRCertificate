import { describe, expect, it } from 'vitest';
import { computeVerificationHash, verifyHash } from '@/lib/crypto';

const baseData = {
  certificateUid: 'MNC-2026-SDA-000123',
  participantId: 'participant-1',
  programId: 'program-1',
  issuedAt: '2026-01-15T00:00:00.000Z',
};

describe('computeVerificationHash', () => {
  it('produces a 64-character lowercase hex SHA-256 digest', () => {
    const hash = computeVerificationHash(baseData);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for identical input', () => {
    expect(computeVerificationHash(baseData)).toBe(computeVerificationHash({ ...baseData }));
  });

  it('is not sensitive to key order (canonicalized before hashing)', () => {
    const reordered = {
      issuedAt: baseData.issuedAt,
      programId: baseData.programId,
      participantId: baseData.participantId,
      certificateUid: baseData.certificateUid,
    };
    expect(computeVerificationHash(baseData)).toBe(computeVerificationHash(reordered));
  });

  it('changes when any field changes (tamper-evidence)', () => {
    const tampered = { ...baseData, participantId: 'participant-2' };
    expect(computeVerificationHash(baseData)).not.toBe(computeVerificationHash(tampered));
  });

  it('changes if the secret salt changes', () => {
    const withDefaultSecret = computeVerificationHash(baseData);
    const withOtherSecret = computeVerificationHash(baseData, 'a-completely-different-secret');
    expect(withDefaultSecret).not.toBe(withOtherSecret);
  });
});

describe('verifyHash', () => {
  it('returns true for a hash that matches the data', () => {
    const hash = computeVerificationHash(baseData);
    expect(verifyHash(baseData, hash)).toBe(true);
  });

  it('returns false when the certificate data was tampered with', () => {
    const hash = computeVerificationHash(baseData);
    const forged = { ...baseData, participantId: 'someone-else' };
    expect(verifyHash(forged, hash)).toBe(false);
  });

  it('returns false for a fabricated/garbage hash of the right shape', () => {
    expect(verifyHash(baseData, 'a'.repeat(64))).toBe(false);
  });

  it('returns false rather than throwing for a malformed hash', () => {
    expect(verifyHash(baseData, 'not-a-hash')).toBe(false);
    expect(verifyHash(baseData, '')).toBe(false);
  });
});
