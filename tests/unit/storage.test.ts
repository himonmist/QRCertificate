import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { saveUploadedImage, loadImageBytes } from '@/lib/storage';

function makePngFile(bytes: Uint8Array = new Uint8Array([1, 2, 3, 4])): File {
  return new File([bytes], 'ignored-client-filename.png', { type: 'image/png' });
}

describe('saveUploadedImage (local disk fallback — no BLOB_READ_WRITE_TOKEN)', () => {
  afterEach(async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('saves the file under public/uploads/<category>/ with a server-generated filename', async () => {
    const url = await saveUploadedImage('logos', makePngFile());
    expect(url).toMatch(/^\/uploads\/logos\/[a-f0-9-]+\.png$/);
    expect(url).not.toContain('ignored-client-filename');

    const savedPath = path.resolve(process.cwd(), 'public', url.replace(/^\//, ''));
    const savedBytes = await readFile(savedPath);
    expect(Array.from(savedBytes)).toEqual([1, 2, 3, 4]);

    await rm(savedPath);
  });

  it('rejects an unsupported file type', async () => {
    const file = new File([new Uint8Array([1])], 'x.exe', { type: 'application/x-msdownload' });
    await expect(saveUploadedImage('logos', file)).rejects.toThrow(/unsupported file type/i);
  });

  it('rejects a file over the size limit', async () => {
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await expect(saveUploadedImage('logos', big)).rejects.toThrow(/too large/i);
  });
});

describe('saveUploadedImage (Vercel Blob path)', () => {
  afterEach(() => {
    vi.doUnmock('@vercel/blob');
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('uploads via @vercel/blob when BLOB_READ_WRITE_TOKEN is set, and never touches local disk', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    const put = vi.fn().mockResolvedValue({ url: 'https://xyz.public.blob.vercel-storage.com/uploads/logos/fake.png' });
    vi.doMock('@vercel/blob', () => ({ put }));

    const url = await saveUploadedImage('logos', makePngFile());
    expect(url).toBe('https://xyz.public.blob.vercel-storage.com/uploads/logos/fake.png');
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]![0]).toMatch(/^uploads\/logos\/[a-f0-9-]+\.png$/);
  });
});

describe('loadImageBytes', () => {
  it('reads back a locally-saved image', async () => {
    const url = await saveUploadedImage('logos', makePngFile(new Uint8Array([9, 8, 7])));
    const bytes = await loadImageBytes(url);
    expect(bytes && Array.from(bytes)).toEqual([9, 8, 7]);

    const savedPath = path.resolve(process.cwd(), 'public', url.replace(/^\//, ''));
    await rm(savedPath);
  });

  it('returns null for an untrusted reference instead of reading it', async () => {
    expect(await loadImageBytes('/uploads/logos/../../../../etc/passwd')).toBeNull();
    expect(await loadImageBytes('https://evil.example.com/uploads/logos/x.png')).toBeNull();
  });

  it('returns null for a well-formed but nonexistent local path', async () => {
    expect(await loadImageBytes('/uploads/logos/does-not-exist.png')).toBeNull();
  });

  it('fetches bytes from a trusted https reference', async () => {
    const fakeBytes = new Uint8Array([5, 6, 7, 8]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeBytes.buffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    const bytes = await loadImageBytes('https://abc.public.blob.vercel-storage.com/uploads/logos/x.png');
    expect(bytes && Array.from(bytes)).toEqual([5, 6, 7, 8]);
    expect(fetchMock).toHaveBeenCalledWith('https://abc.public.blob.vercel-storage.com/uploads/logos/x.png');

    vi.unstubAllGlobals();
  });

  it('returns null when the trusted host responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await loadImageBytes('https://abc.public.blob.vercel-storage.com/uploads/logos/x.png')).toBeNull();
    vi.unstubAllGlobals();
  });
});
