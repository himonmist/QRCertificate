import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads');
const PRIVATE_STORAGE_ROOT = path.resolve(process.cwd(), 'storage');

export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Saves an uploaded image under public/uploads/<category>/ using a
 * server-generated random filename (never the client-supplied name) so a
 * crafted filename cannot escape the upload directory or overwrite another
 * file. Returns the public URL path to store on the record.
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

  const dir = path.join(PUBLIC_UPLOADS_ROOT, category);
  await mkdir(dir, { recursive: true });

  const extension = EXTENSION_BY_MIME[file.type] ?? 'bin';
  const filename = `${randomUUID()}.${extension}`;
  const filePath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return `/uploads/${category}/${filename}`;
}

export async function savePrivateFile(
  category: 'pdf' | 'qr',
  filename: string,
  data: Buffer
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(filename)) {
    throw new Error('Invalid filename');
  }
  const dir = path.join(PRIVATE_STORAGE_ROOT, category);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, data);
  return filePath;
}

export function privateFilePath(category: 'pdf' | 'qr', filename: string): string {
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(filename)) {
    throw new Error('Invalid filename');
  }
  return path.join(PRIVATE_STORAGE_ROOT, category, filename);
}

/**
 * Resolves a stored "/uploads/..." reference to an absolute filesystem
 * path, refusing to leave the public uploads directory. Callers should
 * also validate the stored value's shape at write time (see
 * templateInputSchema in validation.ts) — this is defense-in-depth so a
 * path-traversal payload can never reach fs.readFile even if it somehow
 * ends up stored.
 */
export function resolvePublicUploadPath(url: string): string | null {
  const resolved = path.resolve(PUBLIC_UPLOADS_ROOT, '..', url.replace(/^\//, ''));
  const relative = path.relative(PUBLIC_UPLOADS_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
