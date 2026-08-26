import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized, notFound } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { saveUploadedImage } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const trainer = await prisma.trainer.findUnique({ where: { id: params.id } });
  if (!trainer) return notFound('Trainer not found');

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "signature" file' }, { status: 400 });
  }

  const file = formData.get('signature');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "signature" file field' }, { status: 400 });
  }

  let signatureUrl: string;
  try {
    signatureUrl = await saveUploadedImage('signatures', file);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const updated = await prisma.trainer.update({
    where: { id: params.id },
    data: { signatureUrl },
  });
  await logAudit({ adminId: admin.adminId, action: 'upload_signature', entity: 'trainer', entityId: updated.id });
  return NextResponse.json({ trainer: updated });
}
