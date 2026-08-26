import { NextRequest, NextResponse } from 'next/server';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { isValidCertificateUidFormat } from '@/lib/certificateId';
import { reissueCertificate } from '@/lib/certificateService';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest, { params }: { params: { uid: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  if (!isValidCertificateUidFormat(params.uid)) return notFound('Certificate not found');

  let newCertificate;
  try {
    newCertificate = await reissueCertificate(params.uid);
  } catch (error) {
    const message = (error as Error).message;
    const status = message === 'Certificate not found' ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'reissue',
    entity: 'certificate',
    entityId: newCertificate.id,
    details: { supersedes: params.uid },
  });

  return NextResponse.json({ certificate: newCertificate }, { status: 201 });
}
