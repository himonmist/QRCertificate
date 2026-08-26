import { prisma } from './db';
import { generateCertificateUid, buildCertificateUidPrefix } from './certificateId';
import { computeVerificationHash } from './crypto';
import { generateQrPngBuffer } from './qr';
import { renderCertificatePdf } from './pdf';
import { parseLayoutJson } from './certificateLayout';
import { savePrivateFile, resolvePublicUploadPath } from './storage';
import { deriveProgramCode } from './programCode';
import type { Certificate, Participant, ProgramTrainer, Trainer, TrainingProgram, CertificateTemplate } from '@prisma/client';

export interface GenerateOptions {
  programId: string;
  prefix: string;
  programCode?: string;
  participantIds?: string[];
}

export interface GenerateResultItem {
  participantId: string;
  certificateUid: string;
  status: 'generated' | 'skipped_existing';
}

type ProgramWithRelations = TrainingProgram & {
  trainers: (ProgramTrainer & { trainer: Trainer })[];
  template: CertificateTemplate | null;
};

function formatDateRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', options);
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

function getAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured');
  }
  return appUrl;
}

/**
 * Renders the QR + PDF assets for one participant and persists the
 * Certificate row. Shared by both first-time generation and reissue so the
 * two paths can never drift (same hash inputs, same file layout).
 */
async function buildAndPersistCertificate(
  program: ProgramWithRelations,
  participant: Participant,
  certificateUid: string
): Promise<Certificate> {
  const appUrl = getAppUrl();
  const issuedAt = new Date();
  const qrPayloadUrl = `${appUrl}/verify/${certificateUid}`;
  const verificationHash = computeVerificationHash({
    certificateUid,
    participantId: participant.id,
    programId: program.id,
    issuedAt: issuedAt.toISOString(),
  });

  const layout = parseLayoutJson(program.template?.layoutJson);
  const backgroundImagePath = program.template?.backgroundUrl
    ? resolvePublicUploadPath(program.template.backgroundUrl)
    : null;
  const chiefTrainer =
    program.trainers.find((t) => t.role === 'chief_trainer')?.trainer ?? program.trainers[0]?.trainer;
  const signatureImagePath = chiefTrainer?.signatureUrl
    ? resolvePublicUploadPath(chiefTrainer.signatureUrl)
    : null;
  const trainingDateLabel = formatDateRange(program.startDate, program.endDate);

  const qrBuffer = await generateQrPngBuffer(qrPayloadUrl);
  await savePrivateFile('qr', `${certificateUid}.png`, qrBuffer);

  const pdfBuffer = await renderCertificatePdf({
    layout,
    backgroundImagePath,
    signatureImagePath,
    values: {
      participant_name: participant.fullName,
      designation: participant.designation ?? undefined,
      program_title: program.title,
      organized_by: program.organizedBy,
      issued_by: program.issuedBy,
      trainer_name: chiefTrainer?.name,
      training_date: trainingDateLabel,
      location: program.location ?? undefined,
      certificate_id: certificateUid,
    },
    qrPngBuffer: qrBuffer,
  });
  await savePrivateFile('pdf', `${certificateUid}.pdf`, pdfBuffer);

  return prisma.certificate.create({
    data: {
      certificateUid,
      participantId: participant.id,
      programId: program.id,
      templateId: program.templateId,
      qrPayloadUrl,
      qrImageUrl: `/api/certificates/${certificateUid}/qr`,
      pdfUrl: `/api/certificates/${certificateUid}/pdf`,
      verificationHash,
      status: 'active',
      issuedAt,
    },
  });
}

/**
 * Generates certificates for eligible participants of a program. Idempotent
 * per participant: anyone who already has an active certificate is skipped
 * rather than issued a second one (use reissueCertificate for corrections).
 */
export async function generateCertificatesForProgram(
  options: GenerateOptions
): Promise<GenerateResultItem[]> {
  getAppUrl();

  const program = await prisma.trainingProgram.findUnique({
    where: { id: options.programId },
    include: { trainers: { include: { trainer: true } }, template: true },
  });
  if (!program) {
    throw new Error('Program not found');
  }

  const participants = await prisma.participant.findMany({
    where: {
      programId: options.programId,
      ...(options.participantIds ? { id: { in: options.participantIds } } : {}),
    },
    include: { certificates: { where: { status: 'active' } } },
  });

  const programCode = options.programCode ?? deriveProgramCode(program.title);
  const uidPrefix = buildCertificateUidPrefix({
    prefix: options.prefix,
    year: program.startDate.getFullYear(),
    programCode,
  });
  // Sequence is scoped to the exact prefix/year/programCode combination
  // (not to this program's row id) so two programs that happen to produce
  // the same human-readable code can never collide on the same uid.
  let sequence = await prisma.certificate.count({ where: { certificateUid: { startsWith: uidPrefix } } });

  const results: GenerateResultItem[] = [];

  for (const participant of participants) {
    if (participant.certificates.length > 0) {
      results.push({
        participantId: participant.id,
        certificateUid: participant.certificates[0]!.certificateUid,
        status: 'skipped_existing',
      });
      continue;
    }

    sequence += 1;
    const certificateUid = generateCertificateUid({
      prefix: options.prefix,
      year: program.startDate.getFullYear(),
      programCode,
      sequence,
    });

    const certificate = await buildAndPersistCertificate(program, participant, certificateUid);
    results.push({ participantId: participant.id, certificateUid: certificate.certificateUid, status: 'generated' });
  }

  return results;
}

/**
 * Supersedes an existing certificate with a freshly generated one for the
 * same participant. The old certificate's QR/verification page keeps
 * resolving forever, now showing "superseded" and linking to the new uid.
 */
export async function reissueCertificate(oldCertificateUid: string): Promise<Certificate> {
  getAppUrl();

  const old = await prisma.certificate.findUnique({
    where: { certificateUid: oldCertificateUid },
    include: {
      participant: true,
      program: { include: { trainers: { include: { trainer: true } }, template: true } },
    },
  });
  if (!old) {
    throw new Error('Certificate not found');
  }
  if (old.status === 'superseded') {
    throw new Error('This certificate has already been superseded');
  }

  const [prefix, , programCode] = old.certificateUid.split('-');
  const resolvedPrefix = prefix || 'CERT';
  const resolvedProgramCode = programCode || deriveProgramCode(old.program.title);
  const uidPrefix = buildCertificateUidPrefix({
    prefix: resolvedPrefix,
    year: old.program.startDate.getFullYear(),
    programCode: resolvedProgramCode,
  });
  const sequence =
    (await prisma.certificate.count({ where: { certificateUid: { startsWith: uidPrefix } } })) + 1;

  const certificateUid = generateCertificateUid({
    prefix: resolvedPrefix,
    year: old.program.startDate.getFullYear(),
    programCode: resolvedProgramCode,
    sequence,
  });

  const newCertificate = await buildAndPersistCertificate(old.program, old.participant, certificateUid);

  await prisma.certificate.update({
    where: { id: old.id },
    data: { status: 'superseded', supersededById: newCertificate.id },
  });

  return newCertificate;
}
