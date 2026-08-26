import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolvePublicUploadPath } from '@/lib/storage';

describe('resolvePublicUploadPath', () => {
  it('resolves a well-formed uploads path under public/uploads', () => {
    const resolved = resolvePublicUploadPath('/uploads/logos/abc123.png');
    expect(resolved).toBe(path.resolve(process.cwd(), 'public', 'uploads', 'logos', 'abc123.png'));
  });

  it('rejects a path-traversal payload attempting to escape the uploads directory', () => {
    expect(resolvePublicUploadPath('/uploads/../../../../etc/passwd')).toBeNull();
    expect(resolvePublicUploadPath('../../../../etc/passwd')).toBeNull();
  });

  it('rejects an absolute path outside the uploads root', () => {
    expect(resolvePublicUploadPath('/etc/passwd')).toBeNull();
  });
});
