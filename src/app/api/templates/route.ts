import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { templateInputSchema } from '@/lib/validation';
import { parseJsonBody, unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const templates = await prisma.certificateTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const parsed = await parseJsonBody(request, templateInputSchema);
  if (!parsed.success) return parsed.response;

  try {
    JSON.parse(parsed.data.layoutJson);
  } catch {
    return NextResponse.json({ error: 'layoutJson must be valid JSON' }, { status: 400 });
  }

  const template = await prisma.certificateTemplate.create({ data: parsed.data });
  await logAudit({ adminId: admin.adminId, action: 'create', entity: 'template', entityId: template.id });
  return NextResponse.json({ template }, { status: 201 });
}
