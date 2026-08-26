import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const participant = await prisma.participant.findUnique({
    where: { id: params.id },
    include: { _count: { select: { certificates: true } } },
  });
  if (!participant) return notFound('Participant not found');

  if (participant._count.certificates > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a participant with issued certificates. Revoke the certificate instead.' },
      { status: 409 }
    );
  }

  await prisma.participant.delete({ where: { id: params.id } });
  await logAudit({ adminId: admin.adminId, action: 'delete', entity: 'participant', entityId: params.id });
  return NextResponse.json({ ok: true });
}
