import { describe, expect, it } from 'vitest';
import {
  generateCertificateUid,
  isValidCertificateUidFormat,
  buildCertificateUidPrefix,
} from '@/lib/certificateId';

describe('generateCertificateUid', () => {
  it('formats as PREFIX-YEAR-PROGRAMCODE-sequence zero-padded to 6 digits', () => {
    const uid = generateCertificateUid({
      prefix: 'MNC',
      year: 2026,
      programCode: 'SDA',
      sequence: 123,
    });
    expect(uid).toBe('MNC-2026-SDA-000123');
  });

  it('pads sequence numbers larger than 6 digits without truncation', () => {
    const uid = generateCertificateUid({
      prefix: 'MNC',
      year: 2026,
      programCode: 'SDA',
      sequence: 1234567,
    });
    expect(uid).toBe('MNC-2026-SDA-1234567');
  });

  it('uppercases and strips invalid characters from prefix/program code', () => {
    const uid = generateCertificateUid({
      prefix: 'mnc corp!',
      year: 2026,
      programCode: 'sda-2',
      sequence: 1,
    });
    expect(uid).toBe('MNCCORP-2026-SDA2-000001');
  });

  it('rejects a non-positive sequence', () => {
    expect(() =>
      generateCertificateUid({ prefix: 'MNC', year: 2026, programCode: 'SDA', sequence: 0 })
    ).toThrow();
  });
});

describe('buildCertificateUidPrefix', () => {
  it('matches the prefix of a uid generated with the same parts', () => {
    const parts = { prefix: 'mnc', year: 2026, programCode: 'sda' };
    const uid = generateCertificateUid({ ...parts, sequence: 42 });
    expect(uid.startsWith(buildCertificateUidPrefix(parts))).toBe(true);
  });

  it('produces the same prefix for two different programs with the same code (collision scope)', () => {
    const a = buildCertificateUidPrefix({ prefix: 'MNC', year: 2026, programCode: 'SDA' });
    const b = buildCertificateUidPrefix({ prefix: 'MNC', year: 2026, programCode: 'SDA' });
    expect(a).toBe(b);
    expect(a).toBe('MNC-2026-SDA-');
  });
});

describe('isValidCertificateUidFormat', () => {
  it('accepts well-formed uids', () => {
    expect(isValidCertificateUidFormat('MNC-2026-SDA-000123')).toBe(true);
  });

  it('rejects uids with path traversal or unexpected characters', () => {
    expect(isValidCertificateUidFormat('../../etc/passwd')).toBe(false);
    expect(isValidCertificateUidFormat('MNC-2026-SDA-000123; DROP TABLE')).toBe(false);
    expect(isValidCertificateUidFormat('')).toBe(false);
  });
});
