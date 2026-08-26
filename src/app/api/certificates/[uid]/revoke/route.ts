import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { revokeInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { isValidCertificateUidFormat } from '@/lib/certificateId';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest, { params }: { params: { uid: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  if (!isValidCertificateUidFormat(params.uid)) return notFound('Certificate not found');

  const parsed = await parseJsonBody(request, revokeInputSchema);
  if (!parsed.success) return parsed.response;

  const certificate = await prisma.certificate.findUnique({ where: { certificateUid: params.uid } });
  if (!certificate) return notFound('Certificate not found');

  if (certificate.status === 'revoked') {
    return NextResponse.json({ error: 'Certificate is already revoked' }, { status: 409 });
  }

  const updated = await prisma.certificate.update({
    where: { certificateUid: params.uid },
    data: { status: 'revoked', revokedReason: parsed.data.reason, revokedAt: new Date() },
  });

  await logAudit({
    adminId: admin.adminId,
    action: 'revoke',
    entity: 'certificate',
    entityId: updated.id,
    details: { reason: parsed.data.reason },
  });

  return NextResponse.json({ certificate: updated });
}
