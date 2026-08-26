import type { AdminRole } from './auth';

export interface AdminContext {
  adminId: string;
  role: AdminRole;
}

/**
 * Reads the verified admin identity forwarded by middleware.ts as trusted
 * request headers. middleware.ts strips any client-supplied values for
 * these header names before setting them from the verified session JWT, so
 * a request cannot spoof this by sending the headers itself.
 */
export function getAdminContext(request: Request): AdminContext | null {
  const adminId = request.headers.get('x-admin-id');
  const role = request.headers.get('x-admin-role');
  if (!adminId || (role !== 'admin' && role !== 'super_admin')) {
    return null;
  }
  return { adminId, role };
}
