import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const participant = await prisma.participant.findUnique({ where: { id: params.id } });
  if (!participant) return notFound('Participant not found');

  // Deleting a participant also deletes any certificate(s) issued to them
  // (and those certificates' scan history) — there is no certificate left
  // to belong to once the participant is gone, so there's nothing to keep.
  const certificates = await prisma.certificate.findMany({
    where: { participantId: params.id },
    select: { id: true },
  });
  const certificateIds = certificates.map((c) => c.id);

  await prisma.$transaction([
    prisma.verificationLog.deleteMany({ where: { certificateId: { in: certificateIds } } }),
    prisma.certificate.deleteMany({ where: { id: { in: certificateIds } } }),
    prisma.participant.delete({ where: { id: params.id } }),
  ]);

  await logAudit({
    adminId: admin.adminId,
    action: 'delete',
    entity: 'participant',
    entityId: params.id,
    details: { deletedCertificateCount: certificateIds.length },
  });
  return NextResponse.json({ ok: true });
}
