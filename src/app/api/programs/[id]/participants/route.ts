import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { participantInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const participants = await prisma.participant.findMany({
    where: { programId: params.id },
    orderBy: { createdAt: 'desc' },
    include: { certificates: { select: { id: true, status: true, certificateUid: true } } },
  });

  const withStatus = participants.map((p) => ({
    ...p,
    status: p.certificates.length > 0 ? 'certificate_generated' : 'registered',
  }));

  return NextResponse.json({ participants: withStatus });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const program = await prisma.trainingProgram.findUnique({ where: { id: params.id } });
  if (!program) return notFound('Program not found');

  const parsed = await parseJsonBody(request, participantInputSchema);
  if (!parsed.success) return parsed.response;

  const email = parsed.data.email && parsed.data.email !== '' ? parsed.data.email : null;

  if (email) {
    const existing = await prisma.participant.findFirst({ where: { programId: params.id, email } });
    if (existing) {
      return NextResponse.json(
        { error: 'A participant with this email is already registered in this program' },
        { status: 409 }
      );
    }
  }

  const participant = await prisma.participant.create({
    data: { ...parsed.data, email, programId: params.id },
  });
  await logAudit({
    adminId: admin.adminId,
    action: 'create',
    entity: 'participant',
    entityId: participant.id,
    details: { programId: params.id },
  });
  return NextResponse.json({ participant }, { status: 201 });
}
