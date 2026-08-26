import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized } from '@/lib/apiHelpers';
import { getAdminContext } from '@/lib/adminContext';

export async function GET(request: NextRequest) {
  const admin = getAdminContext(request);
  if (!admin) return unauthorized();

  const record = await prisma.admin.findUnique({
    where: { id: admin.adminId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!record) return unauthorized();

  return NextResponse.json({ admin: record });
}
