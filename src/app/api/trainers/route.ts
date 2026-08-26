import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { trainerInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const trainers = await prisma.trainer.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ trainers });
}

export async function POST(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const parsed = await parseJsonBody(request, trainerInputSchema);
  if (!parsed.success) return parsed.response;

  const existing = await prisma.trainer.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: 'A trainer with this email already exists' }, { status: 409 });
  }

  const trainer = await prisma.trainer.create({ data: parsed.data });
  await logAudit({ adminId: admin.adminId, action: 'create', entity: 'trainer', entityId: trainer.id });
  return NextResponse.json({ trainer }, { status: 201 });
}
