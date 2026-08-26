import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createTrainer } from '@/app/api/trainers/route';
import { POST as createProgram } from '@/app/api/programs/route';
import { POST as assignTrainer } from '@/app/api/programs/[id]/trainers/route';
import { POST as createParticipant } from '@/app/api/programs/[id]/participants/route';
import { POST as generateCertificates } from '@/app/api/programs/[id]/certificates/generate/route';
import { POST as revokeCertificate } from '@/app/api/certificates/[uid]/revoke/route';
import { POST as reissueCertificate } from '@/app/api/certificates/[uid]/reissue/route';
import { GET as publicVerify } from '@/app/api/public/verify/[uid]/route';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

let ADMIN_HEADERS: Record<string, string>;

beforeAll(async () => {
  const admin = await prisma.admin.create({
    data: {
      name: 'Verify Test Admin',
      email: `verify-test-admin-${Date.now()}@example.com`,
      passwordHash: await hashPassword('irrelevant-password-1'),
      role: 'admin',
    },
  });
  ADMIN_HEADERS = { 'x-admin-id': admin.id, 'x-admin-role': 'admin' };
});

afterAll(async () => {
  await prisma.$disconnect();
});

function jsonRequest(url: string, method: string, body?: unknown, ip = '10.0.0.1') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...ADMIN_HEADERS },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function verifyRequest(uid: string, ip = '203.0.113.7') {
  return new NextRequest(`http://localhost:3000/api/public/verify/${uid}`, {
    headers: { 'x-forwarded-for': ip, 'user-agent': 'vitest' },
  });
}

async function issueOneCertificate() {
  const trainerRes = await createTrainer(
    jsonRequest('http://localhost:3000/api/trainers', 'POST', {
      name: 'Public Verify Trainer',
      email: `pv-trainer-${Date.now()}-${Math.random()}@example.com`,
    })
  );
  const { trainer } = await trainerRes.json();

  const programRes = await createProgram(
    jsonRequest('http://localhost:3000/api/programs', 'POST', {
      title: 'Public Verify Test Program',
      category: 'workshop',
      organizedBy: 'MN Corporation',
      issuedBy: 'MN Corporation',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
    })
  );
  const { program } = await programRes.json();

  await assignTrainer(
    jsonRequest(`http://localhost:3000/api/programs/${program.id}/trainers`, 'POST', {
      trainerId: trainer.id,
      role: 'chief_trainer',
    }),
    { params: { id: program.id } }
  );

  const participantRes = await createParticipant(
    jsonRequest(`http://localhost:3000/api/programs/${program.id}/participants`, 'POST', {
      fullName: 'Verify Me',
    }),
    { params: { id: program.id } }
  );
  const { participant } = await participantRes.json();

  const genRes = await generateCertificates(
    jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', {
      prefix: 'MNC',
    }),
    { params: { id: program.id } }
  );
  const { results } = await genRes.json();

  return { uid: results[0].certificateUid as string, participant, program };
}

describe('GET /api/public/verify/:uid', () => {
  it('returns not_found (404) for an unknown or malformed id', async () => {
    const unknown = await publicVerify(verifyRequest('MNC-2026-XXX-999999'), {
      params: { uid: 'MNC-2026-XXX-999999' },
    });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).status).toBe('not_found');

    const malformed = await publicVerify(verifyRequest('../../etc/passwd'), {
      params: { uid: '../../etc/passwd' },
    });
    expect(malformed.status).toBe(404);
  });

  it('verifies an active certificate and shows public-safe details', async () => {
    const { uid } = await issueOneCertificate();
    const response = await publicVerify(verifyRequest(uid), { params: { uid } });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.verified).toBe(true);
    expect(json.status).toBe('active');
    expect(json.participantName).toBe('Verify Me');
  });

  it('logs a verification scan for each lookup', async () => {
    const { uid } = await issueOneCertificate();
    const certBefore = await prisma.certificate.findUniqueOrThrow({ where: { certificateUid: uid } });
    await publicVerify(verifyRequest(uid), { params: { uid } });
    const logs = await prisma.verificationLog.findMany({ where: { certificateId: certBefore.id } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]?.ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('flags a certificate whose stored hash no longer matches its data as invalid', async () => {
    const { uid } = await issueOneCertificate();
    await prisma.certificate.update({ where: { certificateUid: uid }, data: { verificationHash: 'f'.repeat(64) } });
    const response = await publicVerify(verifyRequest(uid), { params: { uid } });
    const json = await response.json();
    expect(json.verified).toBe(false);
    expect(json.status).toBe('invalid');
  });

  it('shows a revoked certificate as revoked with its reason', async () => {
    const { uid } = await issueOneCertificate();
    await revokeCertificate(jsonRequest(`http://localhost:3000/api/certificates/${uid}/revoke`, 'POST', {
      reason: 'Duplicate issuance',
    }), { params: { uid } });

    const response = await publicVerify(verifyRequest(uid), { params: { uid } });
    const json = await response.json();
    expect(json.verified).toBe(false);
    expect(json.status).toBe('revoked');
    expect(json.revokedReason).toBe('Duplicate issuance');
  });

  it('shows a superseded certificate linking forward to its replacement', async () => {
    const { uid } = await issueOneCertificate();
    const reissueRes = await reissueCertificate(
      jsonRequest(`http://localhost:3000/api/certificates/${uid}/reissue`, 'POST'),
      { params: { uid } }
    );
    const { certificate: newCert } = await reissueRes.json();

    const response = await publicVerify(verifyRequest(uid), { params: { uid } });
    const json = await response.json();
    expect(json.status).toBe('superseded');
    expect(json.supersededByUid).toBe(newCert.certificateUid);
  });

  it('rate-limits repeated lookups from the same client', async () => {
    const { uid } = await issueOneCertificate();
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 35; i++) {
      const response = await publicVerify(verifyRequest(uid, ip), { params: { uid } });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });
});
