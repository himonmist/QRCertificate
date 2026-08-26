import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/session';

const EMAIL = 'integration-admin@example.com';
const PASSWORD = 'SuperSecret123!';

beforeAll(async () => {
  await prisma.admin.upsert({
    where: { email: EMAIL },
    update: {},
    create: {
      name: 'Integration Admin',
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      role: 'admin',
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function loginRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  it('sets a session cookie and returns admin info on valid credentials', async () => {
    const response = await login(loginRequest({ email: EMAIL, password: PASSWORD }));
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');
    const json = await response.json();
    expect(json.email).toBe(EMAIL);
    expect(json).not.toHaveProperty('passwordHash');
  });

  it('rejects an invalid password with a generic error message', async () => {
    const response = await login(loginRequest({ email: EMAIL, password: 'wrong-password' }));
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Invalid email or password');
  });

  it('rejects an unknown email with the exact same generic message (no user enumeration)', async () => {
    const response = await login(loginRequest({ email: 'nobody@example.com', password: PASSWORD }));
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Invalid email or password');
  });

  it('rejects a malformed body without crashing', async () => {
    const response = await login(loginRequest({ email: 'not-an-email', password: '123' }));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const response = await logout(request);
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });
});
