import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { programUpdateInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const program = await prisma.trainingProgram.findUnique({
    where: { id: params.id },
    include: { trainers: { include: { trainer: true } }, template: true },
  });
  if (!program) return notFound('Program not found');
  return NextResponse.json({ program });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const parsed = await parseJsonBody(request, programUpdateInputSchema);
  if (!parsed.success) return parsed.response;

  const program = await prisma.trainingProgram.findUnique({ where: { id: params.id } });
  if (!program) return notFound('Program not found');

  const updated = await prisma.trainingProgram.update({ where: { id: params.id }, data: parsed.data });
  await logAudit({ adminId: admin.adminId, action: 'update', entity: 'program', entityId: updated.id });
  return NextResponse.json({ program: updated });
}
