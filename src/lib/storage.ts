import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isTrustedImageReference } from './imageUrl';

const PUBLIC_UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads');

export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Saves an uploaded image using Vercel Blob when configured (required for
 * serverless hosts like Vercel, whose filesystem doesn't persist between
 * invocations), falling back to local disk under public/uploads/<category>/
 * for local development. Either way, the filename is server-generated
 * (never the client-supplied name), so a crafted filename cannot escape
 * the upload directory or overwrite another file. Returns the URL to store
 * on the record.
 */
export async function saveUploadedImage(
  category: 'signatures' | 'logos' | 'participants',
  file: File
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Unsupported file type. Allowed: PNG, JPEG, WEBP.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('File too large. Maximum size is 2MB.');
  }

  const extension = EXTENSION_BY_MIME[file.type] ?? 'bin';
  const filename = `${randomUUID()}.${extension}`;
  const key = `uploads/${category}/${filename}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(key, file, { access: 'public', contentType: file.type });
    return blob.url;
  }

  const dir = path.join(PUBLIC_UPLOADS_ROOT, category);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${category}/${filename}`;
}

/**
 * Resolves a stored "/uploads/..." reference to an absolute filesystem
 * path, refusing to leave the public uploads directory. Callers should
 * also validate the stored value's shape at write time (see
 * templateInputSchema in validation.ts) — this is defense-in-depth so a
 * path-traversal payload can never reach fs.readFile even if it somehow
 * ends up stored.
 */
function resolvePublicUploadPath(url: string): string | null {
  const resolved = path.resolve(PUBLIC_UPLOADS_ROOT, '..', url.replace(/^\//, ''));
  const relative = path.relative(PUBLIC_UPLOADS_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

/**
 * Loads the bytes for a previously-saved image reference — a local
 * "/uploads/..." path or an https:// URL on our trusted Blob host (see
 * isTrustedImageReference) — used when embedding a trainer signature or
 * template background into a rendered certificate PDF. Returns null for
 * anything untrusted, missing, or unreachable rather than throwing, since a
 * missing signature/background should degrade the certificate, not break it.
 */
export async function loadImageBytes(reference: string): Promise<Buffer | null> {
  if (!isTrustedImageReference(reference)) return null;

  if (reference.startsWith('/uploads/')) {
    const filePath = resolvePublicUploadPath(reference);
    if (!filePath) return null;
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch(reference);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
