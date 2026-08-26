import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createTrainer } from '@/app/api/trainers/route';
import { POST as createProgram } from '@/app/api/programs/route';
import { POST as assignTrainer } from '@/app/api/programs/[id]/trainers/route';
import { POST as createParticipant } from '@/app/api/programs/[id]/participants/route';
import { POST as generateCertificates } from '@/app/api/programs/[id]/certificates/generate/route';
import { GET as listCertificates } from '@/app/api/certificates/route';
import { GET as getCertificate } from '@/app/api/certificates/[uid]/route';
import { POST as revokeCertificate } from '@/app/api/certificates/[uid]/revoke/route';
import { POST as reissueCertificate } from '@/app/api/certificates/[uid]/reissue/route';
import { GET as getCertificatePdf } from '@/app/api/certificates/[uid]/pdf/route';
import { GET as getCertificateQr } from '@/app/api/certificates/[uid]/qr/route';
import { GET as publicVerify } from '@/app/api/public/verify/[uid]/route';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { verifyHash } from '@/lib/crypto';

let ADMIN_HEADERS: Record<string, string>;

beforeAll(async () => {
  const admin = await prisma.admin.create({
    data: {
      name: 'Cert Test Admin',
      email: `cert-test-admin-${Date.now()}@example.com`,
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

async function setupProgramWithParticipants(count: number) {
  const trainerRes = await createTrainer(
    jsonRequest('http://localhost:3000/api/trainers', 'POST', {
      name: 'Dr. Chief Trainer',
      email: `chief-${Date.now()}-${Math.random()}@example.com`,
    })
  );
  const { trainer } = await trainerRes.json();

  const programRes = await createProgram(
    jsonRequest('http://localhost:3000/api/programs', 'POST', {
      title: 'Certificate Engine Test Program',
      category: 'workshop',
      organizedBy: 'MN Corporation',
      issuedBy: 'MN Corporation',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
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

  const participants = [];
  for (let i = 0; i < count; i++) {
    const res = await createParticipant(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/participants`, 'POST', {
        fullName: `Participant ${i} ${Date.now()}`,
      }),
      { params: { id: program.id } }
    );
    const { participant } = await res.json();
    participants.push(participant);
  }

  return { program, participants };
}

describe('Certificate generation engine', () => {
  it('generates tamper-evident certificates with unique ids, QR + PDF files, and is idempotent on re-run', async () => {
    const { program, participants } = await setupProgramWithParticipants(2);

    const genRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', {
        prefix: 'MNC',
      }),
      { params: { id: program.id } }
    );
    expect(genRes.status).toBe(200);
    const genJson = await genRes.json();
    expect(genJson.generated).toBe(2);
    expect(genJson.results.every((r: { status: string }) => r.status === 'generated')).toBe(true);

    const uids = genJson.results.map((r: { certificateUid: string }) => r.certificateUid);
    expect(new Set(uids).size).toBe(2);
    for (const uid of uids) {
      expect(uid).toMatch(/^MNC-2026-[A-Z0-9]+-\d{6}$/);

      const pdfRes = await getCertificatePdf(
        new NextRequest(`http://localhost:3000/api/certificates/${uid}/pdf`, { headers: ADMIN_HEADERS }),
        { params: { uid } }
      );
      expect(pdfRes.status).toBe(200);
      const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
      expect(pdfBytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');

      const qrRes = await getCertificateQr(
        new NextRequest(`http://localhost:3000/api/certificates/${uid}/qr`, { headers: ADMIN_HEADERS }),
        { params: { uid } }
      );
      expect(qrRes.status).toBe(200);
      const qrBytes = Buffer.from(await qrRes.arrayBuffer());
      expect(qrBytes.subarray(1, 4).toString('utf-8')).toBe('PNG'); // PNG magic bytes
    }

    const stored = await prisma.certificate.findUnique({ where: { certificateUid: uids[0] } });
    expect(stored).not.toBeNull();
    expect(
      verifyHash(
        {
          certificateUid: stored!.certificateUid,
          participantId: stored!.participantId,
          programId: stored!.programId,
          issuedAt: stored!.issuedAt.toISOString(),
        },
        stored!.verificationHash
      )
    ).toBe(true);

    // Re-running generation for the same participants is idempotent (no duplicate certs).
    const rerunRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', {
        prefix: 'MNC',
      }),
      { params: { id: program.id } }
    );
    const rerunJson = await rerunRes.json();
    expect(rerunJson.generated).toBe(0);
    expect(rerunJson.skipped).toBe(2);

    void participants;
  });

  it('lists, revokes, and reissues certificates, preserving the superseded chain', async () => {
    const { program } = await setupProgramWithParticipants(1);
    const genRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', {
        prefix: 'MNC',
      }),
      { params: { id: program.id } }
    );
    const { results } = await genRes.json();
    const uid = results[0].certificateUid;

    const listRes = await listCertificates(
      new NextRequest(`http://localhost:3000/api/certificates?program_id=${program.id}`, {
        headers: ADMIN_HEADERS,
      })
    );
    const { certificates } = await listRes.json();
    expect(certificates.some((c: { certificateUid: string }) => c.certificateUid === uid)).toBe(true);

    const pdfRes = await getCertificatePdf(
      new NextRequest(`http://localhost:3000/api/certificates/${uid}/pdf`, { headers: ADMIN_HEADERS }),
      { params: { uid } }
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('content-type')).toBe('application/pdf');

    const qrRes = await getCertificateQr(
      new NextRequest(`http://localhost:3000/api/certificates/${uid}/qr`, { headers: ADMIN_HEADERS }),
      { params: { uid } }
    );
    expect(qrRes.status).toBe(200);
    expect(qrRes.headers.get('content-type')).toBe('image/png');

    const revokeRes = await revokeCertificate(
      jsonRequest(`http://localhost:3000/api/certificates/${uid}/revoke`, 'POST', { reason: 'Issued in error' }),
      { params: { uid } }
    );
    expect(revokeRes.status).toBe(200);
    const revokeAgain = await revokeCertificate(
      jsonRequest(`http://localhost:3000/api/certificates/${uid}/revoke`, 'POST', { reason: 'again' }),
      { params: { uid } }
    );
    expect(revokeAgain.status).toBe(409);

    const reissueRes = await reissueCertificate(
      jsonRequest(`http://localhost:3000/api/certificates/${uid}/reissue`, 'POST'),
      { params: { uid } }
    );
    expect(reissueRes.status).toBe(201);
    const { certificate: newCert } = await reissueRes.json();
    expect(newCert.certificateUid).not.toBe(uid);
    expect(newCert.status).toBe('active');

    const oldDetailRes = await getCertificate(
      new NextRequest(`http://localhost:3000/api/certificates/${uid}`, { headers: ADMIN_HEADERS }),
      { params: { uid } }
    );
    const { certificate: oldDetail } = await oldDetailRes.json();
    expect(oldDetail.status).toBe('superseded');
    expect(oldDetail.supersededBy.certificateUid).toBe(newCert.certificateUid);
  });

  it('keeps an already-issued certificate\'s displayed data frozen even after the program is edited', async () => {
    const { program } = await setupProgramWithParticipants(1);
    const genRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', {
        prefix: 'MNC',
      }),
      { params: { id: program.id } }
    );
    const { results } = await genRes.json();
    const uid = results[0].certificateUid;

    // Simulate an admin correcting the program's title *after* certificates
    // were already issued under the old title.
    await prisma.trainingProgram.update({
      where: { id: program.id },
      data: { title: 'Renamed After Issuance' },
    });

    const verifyRes = await publicVerify(
      new NextRequest(`http://localhost:3000/api/public/verify/${uid}`, {
        headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
      }),
      { params: { uid } }
    );
    const verifyJson = await verifyRes.json();
    expect(verifyJson.programTitle).toBe('Certificate Engine Test Program');
    expect(verifyJson.programTitle).not.toBe('Renamed After Issuance');

    const pdfRes = await getCertificatePdf(
      new NextRequest(`http://localhost:3000/api/certificates/${uid}/pdf`, { headers: ADMIN_HEADERS }),
      { params: { uid } }
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('content-type')).toBe('application/pdf');
  });
});
