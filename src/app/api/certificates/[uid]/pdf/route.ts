import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { isValidCertificateUidFormat } from '@/lib/certificateId';
import { privateFilePath } from '@/lib/storage';

export async function GET(request: NextRequest, { params }: { params: { uid: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  if (!isValidCertificateUidFormat(params.uid)) return notFound('Certificate not found');

  const certificate = await prisma.certificate.findUnique({ where: { certificateUid: params.uid } });
  if (!certificate) return notFound('Certificate not found');

  try {
    const bytes = await readFile(privateFilePath('pdf', `${params.uid}.pdf`));
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${params.uid}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return notFound('Certificate PDF file not found');
  }
}
