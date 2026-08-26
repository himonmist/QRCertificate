import { NextRequest, NextResponse } from 'next/server';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { isValidCertificateUidFormat } from '@/lib/certificateId';
import { renderCertificateAssets } from '@/lib/certificateService';

export async function GET(request: NextRequest, { params }: { params: { uid: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  if (!isValidCertificateUidFormat(params.uid)) return notFound('Certificate not found');

  const assets = await renderCertificateAssets(params.uid);
  if (!assets) return notFound('Certificate not found');

  return new NextResponse(new Uint8Array(assets.qr), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' },
  });
}
