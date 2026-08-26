import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidCertificateUidFormat } from '@/lib/certificateId';
import { renderCertificateAssets } from '@/lib/certificateService';
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

  const assets = await renderCertificateAssets(params.uid);
  if (!assets) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(assets.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${params.uid}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
