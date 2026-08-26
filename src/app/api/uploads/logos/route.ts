import { NextRequest, NextResponse } from 'next/server';
import { unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { saveUploadedImage } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

/**
 * Uploads a logo/background image ahead of creating a certificate template
 * (there's no template id yet to attach a per-template upload route to).
 * Returns the URL to paste into templateInputSchema's backgroundUrl field.
 */
export async function POST(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
  }

  let url: string;
  try {
    url = await saveUploadedImage('logos', file);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  await logAudit({ adminId: admin.adminId, action: 'upload_logo', entity: 'upload', entityId: null });
  return NextResponse.json({ url });
}
