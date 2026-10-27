import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listTemplates, POST as createTemplate } from '@/app/api/templates/route';
import { POST as createProgram } from '@/app/api/programs/route';
import { PUT as updateProgramById } from '@/app/api/programs/[id]/route';
import { POST as createParticipant } from '@/app/api/programs/[id]/participants/route';
import { POST as generateCertificates } from '@/app/api/programs/[id]/certificates/generate/route';
import { GET as getCertificatePdf } from '@/app/api/certificates/[uid]/pdf/route';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { DEFAULT_CERTIFICATE_LAYOUT } from '@/lib/certificateLayout';

let ADMIN_HEADERS: Record<string, string>;

beforeAll(async () => {
  const admin = await prisma.admin.create({
    data: {
      name: 'Templates Test Admin',
      email: `templates-test-admin-${Date.now()}@example.com`,
      passwordHash: await hashPassword('irrelevant-password-1'),
      role: 'admin',
    },
  });
  ADMIN_HEADERS = { 'x-admin-id': admin.id, 'x-admin-role': 'admin' };
});

afterAll(async () => {
  await prisma.$disconnect();
});

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', ...ADMIN_HEADERS },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Templates API', () => {
  it('creates a template with a built-in designVariant and lists it back', async () => {
    const createRes = await createTemplate(
      jsonRequest('http://localhost:3000/api/templates', 'POST', {
        name: `Logo Left ${Date.now()}`,
        layoutJson: JSON.stringify(DEFAULT_CERTIFICATE_LAYOUT),
        designVariant: 'logo_left',
      })
    );
    expect(createRes.status).toBe(201);
    const { template } = await createRes.json();
    expect(template.designVariant).toBe('logo_left');

    const listRes = await listTemplates(new NextRequest('http://localhost:3000/api/templates', { headers: ADMIN_HEADERS }));
    const { templates } = await listRes.json();
    expect(templates.some((t: { id: string }) => t.id === template.id)).toBe(true);
  });

  it('rejects an unrecognized designVariant', async () => {
    const res = await createTemplate(
      jsonRequest('http://localhost:3000/api/templates', 'POST', {
        name: `Bogus ${Date.now()}`,
        layoutJson: '{}',
        designVariant: 'not-a-real-variant',
      })
    );
    expect(res.status).toBe(400);
  });

  it('renders a real certificate PDF for a program using the logo_left template end to end', async () => {
    const templateRes = await createTemplate(
      jsonRequest('http://localhost:3000/api/templates', 'POST', {
        name: `Logo Left E2E ${Date.now()}`,
        layoutJson: JSON.stringify(DEFAULT_CERTIFICATE_LAYOUT),
        designVariant: 'logo_left',
      })
    );
    const { template } = await templateRes.json();

    const programRes = await createProgram(
      jsonRequest('http://localhost:3000/api/programs', 'POST', {
        title: 'AI for Ophthalmologist',
        category: 'workshop',
        organizedBy: 'Popular Pharmaceuticals PLC',
        issuedBy: 'Popular Pharmaceuticals PLC',
        startDate: '2026-10-26',
        endDate: '2026-10-27',
      })
    );
    const { program } = await programRes.json();

    const assignTemplateRes = await updateProgramById(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}`, 'PUT', { templateId: template.id }),
      { params: { id: program.id } }
    );
    expect(assignTemplateRes.status).toBe(200);

    const participantRes = await createParticipant(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/participants`, 'POST', {
        fullName: 'Dr. Abdul Muhit Chowdhury Abir',
      }),
      { params: { id: program.id } }
    );
    expect(participantRes.status).toBe(201);

    const genRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', { prefix: 'MNC' }),
      { params: { id: program.id } }
    );
    expect(genRes.status).toBe(200);
    const { results } = await genRes.json();
    const uid = results[0].certificateUid;

    const pdfRes = await getCertificatePdf(
      new NextRequest(`http://localhost:3000/api/certificates/${uid}/pdf`, { headers: ADMIN_HEADERS }),
      { params: { uid } }
    );
    expect(pdfRes.status).toBe(200);
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });
});
