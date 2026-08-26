import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { programInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const programs = await prisma.trainingProgram.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      trainers: { include: { trainer: true } },
      _count: { select: { participants: true, certificates: true } },
    },
  });
  return NextResponse.json({ programs });
}

export async function POST(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const parsed = await parseJsonBody(request, programInputSchema);
  if (!parsed.success) return parsed.response;

  const program = await prisma.trainingProgram.create({
    data: { ...parsed.data, createdByAdminId: admin.adminId },
  });
  await logAudit({ adminId: admin.adminId, action: 'create', entity: 'program', entityId: program.id });
  return NextResponse.json({ program }, { status: 201 });
}
