// Shared shape for every image reference this app stores and later
// dereferences server-side (trainer signatures, template backgrounds).
// Both the local-disk form and the Vercel Blob form use this same
// /uploads/<category>/<file> path — see saveUploadedImage() in storage.ts.
const UPLOAD_PATH_PATTERN = /^\/uploads\/(signatures|logos|participants)\/[a-zA-Z0-9-]+\.(png|jpe?g|webp)$/i;

// Vercel Blob's public store domain. Only this host is allowed for
// absolute URLs — anything else would make image references (settable by
// an Admin/Program Coordinator, not just Super Admin, via the template
// background field) an SSRF vector: the server fetches this URL at
// certificate-render time.
const TRUSTED_BLOB_HOST_PATTERN = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;

/** True for a same-origin "/uploads/..." path, or an https:// URL on our trusted Blob host, with the expected shape. */
export function isTrustedImageReference(value: string): boolean {
  if (UPLOAD_PATH_PATTERN.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && TRUSTED_BLOB_HOST_PATTERN.test(url.hostname) && UPLOAD_PATH_PATTERN.test(url.pathname);
  } catch {
    return false;
  }
}
