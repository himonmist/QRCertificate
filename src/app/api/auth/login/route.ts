import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loginInputSchema } from '@/lib/validation';
import { verifyPassword, type AdminRole } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session';
import { loginRateLimiter } from '@/lib/rateLimit';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

// A valid-format bcrypt hash with no matching plaintext, compared against
// on unknown-email attempts so login timing doesn't reveal which accounts
// exist.
const DUMMY_HASH = '$2a$12$0nlll96T2ZZQAnGpf76pH.RRaq4wa82Q/jCg4vpRIxwsfIoUkFT.i';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = loginRateLimiter.check(`login:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const { email, password } = parsed.data;
  const admin = await prisma.admin.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);

  if (!admin || !passwordOk) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const response = NextResponse.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });
  await setSessionCookie(response, { adminId: admin.id, role: admin.role as AdminRole });
  await logAudit({ adminId: admin.id, action: 'login', entity: 'admin', entityId: admin.id });
  return response;
}
