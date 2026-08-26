import { prisma } from './db';

interface LogAuditInput {
  adminId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

export async function logAudit({ adminId, action, entity, entityId, details }: LogAuditInput) {
  await prisma.auditLog.create({
    data: {
      adminId: adminId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      detailsJson: details ? JSON.stringify(details) : null,
    },
  });
}
