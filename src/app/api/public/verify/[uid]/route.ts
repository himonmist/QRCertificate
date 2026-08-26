import { NextRequest, NextResponse } from 'next/server';
import { verifyCertificate } from '@/lib/publicVerify';
import { getClientIp } from '@/lib/http';

export async function GET(request: NextRequest, { params }: { params: { uid: string } }) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');

  const result = await verifyCertificate(params.uid, ip, userAgent);

  if (result.rateLimited) {
    return NextResponse.json(
      { error: 'Too many verification requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  const { rateLimited: _rateLimited, ...body } = result;
  const httpStatus = result.status === 'not_found' ? 404 : 200;
  return NextResponse.json(body, { status: httpStatus });
}
