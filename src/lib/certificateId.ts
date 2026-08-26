export interface CertificateUidParts {
  prefix: string;
  year: number;
  programCode: string;
  sequence: number;
}

function sanitizeSegment(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Builds the human-readable, permanent certificate id, e.g.
 * MNC-2026-SDA-000123. Sequence is zero-padded to at least 6 digits but
 * never truncated for larger programs.
 */
export function generateCertificateUid({
  prefix,
  year,
  programCode,
  sequence,
}: CertificateUidParts): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error('sequence must be a positive integer');
  }
  const cleanPrefix = sanitizeSegment(prefix);
  const cleanProgramCode = sanitizeSegment(programCode);
  if (!cleanPrefix || !cleanProgramCode) {
    throw new Error('prefix and programCode must contain at least one alphanumeric character');
  }
  const paddedSequence = String(sequence).padStart(6, '0');
  return `${cleanPrefix}-${year}-${cleanProgramCode}-${paddedSequence}`;
}

/**
 * The sanitized, stable prefix shared by every certificate issued for a
 * given prefix/year/programCode combination, e.g. "MNC-2026-SDA-". Used to
 * scope the next sequence number so two different programs that happen to
 * produce the same prefix/programCode never collide on the same uid.
 */
export function buildCertificateUidPrefix({
  prefix,
  year,
  programCode,
}: Omit<CertificateUidParts, 'sequence'>): string {
  const cleanPrefix = sanitizeSegment(prefix);
  const cleanProgramCode = sanitizeSegment(programCode);
  if (!cleanPrefix || !cleanProgramCode) {
    throw new Error('prefix and programCode must contain at least one alphanumeric character');
  }
  return `${cleanPrefix}-${year}-${cleanProgramCode}-`;
}

const CERTIFICATE_UID_PATTERN = /^[A-Z0-9]+-\d{4}-[A-Z0-9]+-\d{6,}$/;

/** Strict allowlist check used before any lookup by certificate id. */
export function isValidCertificateUidFormat(uid: string): boolean {
  return typeof uid === 'string' && CERTIFICATE_UID_PATTERN.test(uid);
}
