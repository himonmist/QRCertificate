import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { certificateGenerateInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { generateCertificatesForProgram } from '@/lib/certificateService';
import { logAudit } from '@/lib/audit';

// Bulk generation renders a PDF+QR per participant synchronously in the
// request (see certificateService.ts) — fine at modest scale, but a large
// batch can exceed the default serverless timeout. Extends it on Vercel;
// ignored elsewhere. For very large programs, move this to a background
// queue instead of raising this further — see README.md.
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const program = await prisma.trainingProgram.findUnique({ where: { id: params.id } });
  if (!program) return notFound('Program not found');

  const parsed = await parseJsonBody(request, certificateGenerateInputSchema);
  if (!parsed.success) return parsed.response;

  let results;
  try {
    results = await generateCertificatesForProgram({
      programId: params.id,
      prefix: parsed.data.prefix,
      programCode: parsed.data.programCode,
      participantIds: parsed.data.participantIds,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const generated = results.filter((r) => r.status === 'generated').length;
  await logAudit({
    adminId: admin.adminId,
    action: 'generate_certificates',
    entity: 'program',
    entityId: params.id,
    details: { generated, total: results.length },
  });

  return NextResponse.json({ generated, skipped: results.length - generated, results });
}
