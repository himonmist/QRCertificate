import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { programTrainerAssignSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const parsed = await parseJsonBody(request, programTrainerAssignSchema);
  if (!parsed.success) return parsed.response;

  const program = await prisma.trainingProgram.findUnique({ where: { id: params.id } });
  if (!program) return notFound('Program not found');

  const trainer = await prisma.trainer.findUnique({ where: { id: parsed.data.trainerId } });
  if (!trainer) return notFound('Trainer not found');

  const existingLink = await prisma.programTrainer.findUnique({
    where: { programId_trainerId: { programId: params.id, trainerId: trainer.id } },
  });

  if (!existingLink && trainer.status !== 'active') {
    return NextResponse.json(
      { error: 'Inactive trainers cannot be assigned to new programs' },
      { status: 409 }
    );
  }

  const link = await prisma.programTrainer.upsert({
    where: { programId_trainerId: { programId: params.id, trainerId: trainer.id } },
    update: { role: parsed.data.role },
    create: { programId: params.id, trainerId: trainer.id, role: parsed.data.role },
    include: { trainer: true },
  });

  await logAudit({
    adminId: admin.adminId,
    action: 'assign_trainer',
    entity: 'program',
    entityId: params.id,
    details: { trainerId: trainer.id, role: parsed.data.role },
  });

  return NextResponse.json({ programTrainer: link }, { status: 201 });
}
