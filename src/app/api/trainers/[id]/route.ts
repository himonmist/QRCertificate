import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { trainerInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

const trainerUpdateSchema = trainerInputSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const parsed = await parseJsonBody(request, trainerUpdateSchema);
  if (!parsed.success) return parsed.response;

  const trainer = await prisma.trainer.findUnique({ where: { id: params.id } });
  if (!trainer) return notFound('Trainer not found');

  if (parsed.data.email && parsed.data.email !== trainer.email) {
    const conflict = await prisma.trainer.findUnique({ where: { email: parsed.data.email } });
    if (conflict) {
      return NextResponse.json({ error: 'A trainer with this email already exists' }, { status: 409 });
    }
  }

  const updated = await prisma.trainer.update({ where: { id: params.id }, data: parsed.data });
  await logAudit({
    adminId: admin.adminId,
    action: 'update',
    entity: 'trainer',
    entityId: updated.id,
    details: parsed.data,
  });
  return NextResponse.json({ trainer: updated });
}
