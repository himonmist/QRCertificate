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
    const bytes = await readFile(privateFilePath('qr', `${params.uid}.png`));
    return new NextResponse(bytes, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return notFound('Certificate QR image not found');
  }
}
