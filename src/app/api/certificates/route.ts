import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { CERTIFICATE_STATUSES } from '@/lib/constants';

export async function GET(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const { searchParams } = request.nextUrl;
  const programId = searchParams.get('program_id') ?? undefined;
  const statusParam = searchParams.get('status') ?? undefined;
  const q = searchParams.get('q')?.trim();

  const status = statusParam && (CERTIFICATE_STATUSES as readonly string[]).includes(statusParam)
    ? statusParam
    : undefined;

  const certificates = await prisma.certificate.findMany({
    where: {
      ...(programId ? { programId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { certificateUid: { contains: q } },
              { participant: { fullName: { contains: q } } },
            ],
          }
        : {}),
    },
    include: { participant: true, program: { select: { id: true, title: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ certificates });
}
