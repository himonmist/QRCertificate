import { describe, expect, it } from 'vitest';
import { isTrustedImageReference } from '@/lib/imageUrl';

describe('isTrustedImageReference', () => {
  it('accepts a local uploads path in the expected shape', () => {
    expect(isTrustedImageReference('/uploads/logos/abc-123.png')).toBe(true);
    expect(isTrustedImageReference('/uploads/signatures/abc-123.jpg')).toBe(true);
  });

  it('accepts an https URL on the trusted Vercel Blob host with a matching path', () => {
    expect(isTrustedImageReference('https://xyz123.public.blob.vercel-storage.com/uploads/logos/abc-123.png')).toBe(
      true
    );
  });

  it('rejects a path-traversal payload', () => {
    expect(isTrustedImageReference('/uploads/logos/../../../etc/passwd')).toBe(false);
    expect(isTrustedImageReference('../../../../etc/passwd')).toBe(false);
  });

  it('rejects an untrusted host even with a matching path (SSRF guard)', () => {
    expect(isTrustedImageReference('https://evil.example.com/uploads/logos/abc-123.png')).toBe(false);
    expect(isTrustedImageReference('http://169.254.169.254/uploads/logos/abc-123.png')).toBe(false);
  });

  it('rejects http (non-TLS) even on an otherwise-matching host', () => {
    expect(isTrustedImageReference('http://xyz123.public.blob.vercel-storage.com/uploads/logos/abc-123.png')).toBe(
      false
    );
  });

  it('rejects a disallowed category or extension', () => {
    expect(isTrustedImageReference('/uploads/other/abc-123.png')).toBe(false);
    expect(isTrustedImageReference('/uploads/logos/abc-123.exe')).toBe(false);
  });
});
