import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { isValidCertificateUidFormat } from '@/lib/certificateId';

export async function GET(request: NextRequest, { params }: { params: { uid: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  if (!isValidCertificateUidFormat(params.uid)) return notFound('Certificate not found');

  const certificate = await prisma.certificate.findUnique({
    where: { certificateUid: params.uid },
    include: {
      participant: true,
      program: { include: { trainers: { include: { trainer: true } } } },
      supersededBy: { select: { certificateUid: true } },
      supersedes: { select: { certificateUid: true } },
    },
  });
  if (!certificate) return notFound('Certificate not found');

  return NextResponse.json({ certificate });
}
