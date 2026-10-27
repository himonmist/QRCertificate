import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listTrainers, POST as createTrainer } from '@/app/api/trainers/route';
import { PUT as updateTrainer } from '@/app/api/trainers/[id]/route';
import { POST as createProgram } from '@/app/api/programs/route';
import { POST as assignTrainer } from '@/app/api/programs/[id]/trainers/route';
import {
  GET as listParticipants,
  POST as createParticipant,
} from '@/app/api/programs/[id]/participants/route';
import { POST as bulkImportParticipants } from '@/app/api/programs/[id]/participants/bulk/route';
import { POST as generateCertificates } from '@/app/api/programs/[id]/certificates/generate/route';
import { DELETE as deleteParticipant } from '@/app/api/participants/[id]/route';
import { POST as reissueCertificate } from '@/app/api/certificates/[uid]/reissue/route';
import { GET as publicVerify } from '@/app/api/public/verify/[uid]/route';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

let ADMIN_HEADERS: Record<string, string>;

beforeAll(async () => {
  const admin = await prisma.admin.create({
    data: {
      name: 'CRUD Test Admin',
      email: `crud-test-admin-${Date.now()}@example.com`,
      passwordHash: await hashPassword('irrelevant-password-1'),
      role: 'admin',
    },
  });
  ADMIN_HEADERS = { 'x-admin-id': admin.id, 'x-admin-role': 'admin' };
});

function jsonRequest(url: string, method: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', ...ADMIN_HEADERS, ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Trainers API', () => {
  it('rejects unauthenticated requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/trainers', { method: 'GET' });
    const response = await listTrainers(request);
    expect(response.status).toBe(401);
  });

  it('creates a trainer and rejects a duplicate email', async () => {
    const body = { name: 'Dr. Jane Doe', email: `jane-${Date.now()}@example.com` };
    const created = await createTrainer(jsonRequest('http://localhost:3000/api/trainers', 'POST', body));
    expect(created.status).toBe(201);

    const dup = await createTrainer(jsonRequest('http://localhost:3000/api/trainers', 'POST', body));
    expect(dup.status).toBe(409);
  });

  it('edits a trainer’s profile fields, and rejects changing the email to one already in use', async () => {
    const emailA = `edit-a-${Date.now()}@example.com`;
    const emailB = `edit-b-${Date.now()}@example.com`;
    const createdA = await createTrainer(jsonRequest('http://localhost:3000/api/trainers', 'POST', { name: 'Original Name', email: emailA }));
    const { trainer: trainerA } = await createdA.json();
    await createTrainer(jsonRequest('http://localhost:3000/api/trainers', 'POST', { name: 'Trainer B', email: emailB }));

    const edited = await updateTrainer(
      jsonRequest(`http://localhost:3000/api/trainers/${trainerA.id}`, 'PUT', {
        name: 'Updated Name',
        designation: 'Senior Trainer',
        organization: 'Updated Org',
      }),
      { params: { id: trainerA.id } }
    );
    expect(edited.status).toBe(200);
    const { trainer: updated } = await edited.json();
    expect(updated).toMatchObject({ name: 'Updated Name', designation: 'Senior Trainer', organization: 'Updated Org', email: emailA });

    const conflict = await updateTrainer(
      jsonRequest(`http://localhost:3000/api/trainers/${trainerA.id}`, 'PUT', { email: emailB }),
      { params: { id: trainerA.id } }
    );
    expect(conflict.status).toBe(409);
  });
});

describe('Programs + Participants API', () => {
  it('creates a program, blocks inactive trainer assignment, then supports the full participant lifecycle', async () => {
    const trainerEmail = `trainer-${Date.now()}@example.com`;
    const trainerRes = await createTrainer(
      jsonRequest('http://localhost:3000/api/trainers', 'POST', { name: 'Trainer One', email: trainerEmail })
    );
    const { trainer } = await trainerRes.json();

    const programRes = await createProgram(
      jsonRequest('http://localhost:3000/api/programs', 'POST', {
        title: 'AI Workshop',
        category: 'workshop',
        organizedBy: 'MN Corporation',
        issuedBy: 'MN Corporation',
        startDate: '2026-03-01',
        endDate: '2026-03-02',
      })
    );
    expect(programRes.status).toBe(201);
    const { program } = await programRes.json();

    // Deactivate the trainer, then confirm they cannot be newly assigned.
    await prisma.trainer.update({ where: { id: trainer.id }, data: { status: 'inactive' } });
    const blockedAssign = await assignTrainer(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/trainers`, 'POST', {
        trainerId: trainer.id,
        role: 'chief_trainer',
      }),
      { params: { id: program.id } }
    );
    expect(blockedAssign.status).toBe(409);

    await prisma.trainer.update({ where: { id: trainer.id }, data: { status: 'active' } });
    const okAssign = await assignTrainer(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/trainers`, 'POST', {
        trainerId: trainer.id,
        role: 'chief_trainer',
      }),
      { params: { id: program.id } }
    );
    expect(okAssign.status).toBe(201);

    // Single participant add + duplicate-email rejection.
    const participantEmail = `participant-${Date.now()}@example.com`;
    const addRes = await createParticipant(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/participants`, 'POST', {
        fullName: 'John Smith',
        email: participantEmail,
      }),
      { params: { id: program.id } }
    );
    expect(addRes.status).toBe(201);

    const dupRes = await createParticipant(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/participants`, 'POST', {
        fullName: 'John Smith Duplicate',
        email: participantEmail,
      }),
      { params: { id: program.id } }
    );
    expect(dupRes.status).toBe(409);

    // Bulk import: one duplicate (already registered), one new, one invalid row.
    const csv = [
      'Full Name,Designation,Organization,Email,Phone',
      `John Smith,Dr.,Acme,${participantEmail},`,
      'Jane Roe,,,,555-1234',
      ',,,,',
    ].join('\n');
    const file = new File([csv], 'participants.csv', { type: 'text/csv' });
    const form = new FormData();
    form.set('file', file);
    const bulkRequest = new NextRequest(
      `http://localhost:3000/api/programs/${program.id}/participants/bulk`,
      { method: 'POST', headers: ADMIN_HEADERS, body: form }
    );
    const bulkRes = await bulkImportParticipants(bulkRequest, { params: { id: program.id } });
    expect(bulkRes.status).toBe(200);
    const bulkJson = await bulkRes.json();
    expect(bulkJson.imported).toBe(1); // only Jane Roe
    expect(bulkJson.skippedDuplicates).toBe(1); // John Smith already registered
    expect(bulkJson.errors).toHaveLength(1); // blank row

    const listRes = await listParticipants(
      new NextRequest(`http://localhost:3000/api/programs/${program.id}/participants`, {
        headers: ADMIN_HEADERS,
      }),
      { params: { id: program.id } }
    );
    const { participants } = await listRes.json();
    expect(participants).toHaveLength(2);
    expect(participants.every((p: { status: string }) => p.status === 'registered')).toBe(true);

    // Deleting a participant with no certificates succeeds.
    const janeParticipant = participants.find((p: { fullName: string }) => p.fullName === 'Jane Roe');
    const deleteRes = await deleteParticipant(
      new NextRequest(`http://localhost:3000/api/participants/${janeParticipant.id}`, {
        method: 'DELETE',
        headers: ADMIN_HEADERS,
      }),
      { params: { id: janeParticipant.id } }
    );
    expect(deleteRes.status).toBe(200);
  });

  it('deletes a participant who already has a certificate, cascading to the certificate and its scan history', async () => {
    const trainerRes = await createTrainer(
      jsonRequest('http://localhost:3000/api/trainers', 'POST', {
        name: 'Trainer For Delete Guard',
        email: `trainer-delete-guard-${Date.now()}@example.com`,
      })
    );
    const { trainer } = await trainerRes.json();

    const programRes = await createProgram(
      jsonRequest('http://localhost:3000/api/programs', 'POST', {
        title: 'Delete Guard Workshop',
        category: 'workshop',
        organizedBy: 'MN Corporation',
        issuedBy: 'MN Corporation',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
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
        fullName: 'Certified Participant',
      }),
      { params: { id: program.id } }
    );
    const { participant } = await participantRes.json();

    const genRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', { prefix: 'MNC' }),
      { params: { id: program.id } }
    );
    expect(genRes.status).toBe(200);
    const { generated, results } = await genRes.json();
    expect(generated).toBe(1);
    const certificateUid = results[0].certificateUid;

    // Scan it once so it has scan history that must be cleaned up too.
    await publicVerify(
      new NextRequest(`http://localhost:3000/api/public/verify/${certificateUid}`, {
        headers: { 'x-forwarded-for': '203.0.113.15' },
      }),
      { params: { uid: certificateUid } }
    );
    const certificateBefore = await prisma.certificate.findUnique({ where: { certificateUid } });
    expect(await prisma.verificationLog.count({ where: { certificateId: certificateBefore!.id } })).toBe(1);

    const deleteRes = await deleteParticipant(
      new NextRequest(`http://localhost:3000/api/participants/${participant.id}`, {
        method: 'DELETE',
        headers: ADMIN_HEADERS,
      }),
      { params: { id: participant.id } }
    );
    expect(deleteRes.status).toBe(200);

    expect(await prisma.participant.findUnique({ where: { id: participant.id } })).toBeNull();
    expect(await prisma.certificate.findUnique({ where: { certificateUid } })).toBeNull();
    expect(await prisma.verificationLog.count({ where: { certificateId: certificateBefore!.id } })).toBe(0);
  });

  it('deletes a participant whose certificate was reissued, removing both the superseded and the active row', async () => {
    const programRes = await createProgram(
      jsonRequest('http://localhost:3000/api/programs', 'POST', {
        title: 'Delete Reissued Workshop',
        category: 'workshop',
        organizedBy: 'MN Corporation',
        issuedBy: 'MN Corporation',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
      })
    );
    const { program } = await programRes.json();

    const participantRes = await createParticipant(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/participants`, 'POST', {
        fullName: 'Reissued Then Deleted',
      }),
      { params: { id: program.id } }
    );
    const { participant } = await participantRes.json();

    const genRes = await generateCertificates(
      jsonRequest(`http://localhost:3000/api/programs/${program.id}/certificates/generate`, 'POST', { prefix: 'MNC' }),
      { params: { id: program.id } }
    );
    const { results } = await genRes.json();
    const originalUid = results[0].certificateUid;

    const reissueRes = await reissueCertificate(
      jsonRequest(`http://localhost:3000/api/certificates/${originalUid}/reissue`, 'POST'),
      { params: { uid: originalUid } }
    );
    expect(reissueRes.status).toBe(201);
    const { certificate: newCertificate } = await reissueRes.json();

    expect(await prisma.certificate.count({ where: { participantId: participant.id } })).toBe(2);

    const deleteRes = await deleteParticipant(
      new NextRequest(`http://localhost:3000/api/participants/${participant.id}`, {
        method: 'DELETE',
        headers: ADMIN_HEADERS,
      }),
      { params: { id: participant.id } }
    );
    expect(deleteRes.status).toBe(200);

    expect(await prisma.certificate.findUnique({ where: { certificateUid: originalUid } })).toBeNull();
    expect(await prisma.certificate.findUnique({ where: { certificateUid: newCertificate.certificateUid } })).toBeNull();
  });
});
