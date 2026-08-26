import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db';
import { isValidCertificateUidFormat } from '@/lib/certificateId';
import { privateFilePath } from '@/lib/storage';
import { publicVerifyRateLimiter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/http';

/**
 * Lets a participant download their own certificate PDF with no login,
 * using only the certificate id printed on it / encoded in its QR — the
 * same "possession of the id is proof enough" model as the verify page.
 * Only ever serves the currently-active version; revoked/superseded
 * certificates are not downloadable here (the verify page explains why).
 */
export async function GET(request: NextRequest, { params }: { params: { uid: string } }) {
  const ip = getClientIp(request);
  const rate = publicVerifyRateLimiter.check(`verify:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  if (!isValidCertificateUidFormat(params.uid)) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  const certificate = await prisma.certificate.findUnique({ where: { certificateUid: params.uid } });
  if (!certificate || certificate.status !== 'active') {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

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
    return NextResponse.json({ error: 'Certificate file not found' }, { status: 404 });
  }
}
