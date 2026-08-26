import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';

export async function GET(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const [totalPrograms, totalTrainers, totalParticipants, statusCounts, totalScans] = await Promise.all([
    prisma.trainingProgram.count(),
    prisma.trainer.count(),
    prisma.participant.count(),
    prisma.certificate.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.verificationLog.count(),
  ]);

  const certificatesByStatus = { active: 0, revoked: 0, superseded: 0 };
  for (const row of statusCounts) {
    if (row.status in certificatesByStatus) {
      certificatesByStatus[row.status as keyof typeof certificatesByStatus] = row._count._all;
    }
  }
  const totalCertificates = Object.values(certificatesByStatus).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    totalPrograms,
    totalTrainers,
    totalParticipants,
    totalCertificates,
    certificatesByStatus,
    totalScans,
  });
}
